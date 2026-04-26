"""LangGraph supervisor for Sage.

Routes a single utterance through:
    supervisor → {memory_lookup, browser_agent, responder} → responder → END

Each node pushes a trace event to the Node bridge so the Electron orb can
render the reasoning live. The browser_agent is a thin HTTP shim onto Node's
Stagehand singleton at /internal/browser-task.
"""
from __future__ import annotations

import json
import logging
import os
import re
from typing import Any, TypedDict

import httpx
from langgraph.graph import END, START, StateGraph
from openai import OpenAI

from sage import usage as usage_log

log = logging.getLogger("sage.graph")

ROUTING_MODEL = "gpt-4.1-mini"
RESPONDER_MODEL = "gpt-4.1-mini"

BRIDGE_URL = os.getenv("BRIDGE_URL", "http://localhost:3001")

_openai_client: OpenAI | None = None


def get_openai() -> OpenAI:
    global _openai_client
    if _openai_client is None:
        _openai_client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    return _openai_client


class SageState(TypedDict, total=False):
    session_id: str
    patient_id: str
    user_text: str
    intent: str
    intent_reason: str
    payload_goal: str
    profile: dict[str, Any]
    memory_summary: str
    browser_result: dict[str, Any]
    response_text: str
    trace: list[dict[str, Any]]


def _push_trace(
    state: SageState,
    node: str,
    text: str,
    *,
    screenshot_url: str | None = None,
) -> None:
    entry = {"node": node, "text": text}
    if screenshot_url:
        entry["screenshot_url"] = screenshot_url
    state.setdefault("trace", []).append(entry)
    session_id = state.get("session_id")
    if not session_id:
        return
    try:
        httpx.post(
            f"{BRIDGE_URL}/internal/trace",
            json={
                "session_id": session_id,
                "node": node,
                "text": text,
                "screenshot_url": screenshot_url,
            },
            timeout=2.0,
        )
    except Exception as err:
        log.debug("trace push failed (%s) — bridge may be offline", err)


# ─── nodes ────────────────────────────────────────────────────────────────────

SUPERVISOR_SYSTEM = """You are Sage's intent router. Classify the user utterance.

Return ONLY a JSON object: {"intent": <one of>, "reason": <one short clause>, "goal": <optional product/task phrase>}.

Intents:
- "browser_task" — the user wants a real-world task done that needs a browser (ordering items, refilling things, finding products on a real site). Set "goal" to the cleaned product or task phrase, e.g. "weekly pill organizer 7 day".
- "memory_lookup" — the user is asking about their own life, doctors, appointments, address, pharmacy, things they "usually" do, or who their caregiver is. Goal can be empty.
- "smalltalk" — greeting, thanks, casual chit-chat, vague check-ins.
- "end_session" — explicit "I'm done", "goodbye", "that's all".

Examples:
user: "I need one of those weekly pill organizers" → {"intent":"browser_task","reason":"product order","goal":"weekly pill organizer 7 day"}
user: "When do I need to see Dr. Mehta?" → {"intent":"memory_lookup","reason":"doctor appointment","goal":""}
user: "Hi Sage, how are you?" → {"intent":"smalltalk","reason":"greeting","goal":""}
user: "Okay I think we're done." → {"intent":"end_session","reason":"goodbye","goal":""}
"""

BROWSER_TRIGGER_WORDS = (
    "amazon",
    "order",
    "buy",
    "purchase",
    "find on amazon",
    "look on amazon",
    "look it up",
)
END_SESSION_WORDS = ("goodbye", "bye", "that's all", "thats all", "we're done", "we are done")
MEMORY_HINT_WORDS = ("dr.", "doctor", "appointment", "caregiver", "address", "pharmacy", "usually")
GENERIC_BROWSER_GOALS = {
    "",
    "amazon",
    "on amazon",
    "find the product on amazon",
    "find the product",
    "the product",
    "product",
    "something on amazon",
}


def _heuristic_route(text: str) -> dict[str, str] | None:
    lower = text.strip().lower()
    if not lower:
        return {"intent": "smalltalk", "reason": "empty", "goal": ""}
    if any(phrase in lower for phrase in END_SESSION_WORDS):
        return {"intent": "end_session", "reason": "goodbye", "goal": ""}
    if any(phrase in lower for phrase in BROWSER_TRIGGER_WORDS):
        return {
            "intent": "browser_task",
            "reason": "shopping request",
            "goal": _clean_browser_goal(text),
        }
    if any(phrase in lower for phrase in MEMORY_HINT_WORDS):
        return {"intent": "memory_lookup", "reason": "patient context lookup", "goal": ""}
    return None


def _clean_browser_goal(text: str) -> str:
    goal = text.strip()
    for pattern in (
        r"^(?:please\s+)?(?:can you\s+)?(?:could you\s+)?(?:i (?:need|want|would like)\s+(?:you\s+to\s+)?)",
        r"^(?:please\s+)?(?:show|find|look up|look for|search for|order|buy|get|give)\s+(?:me\s+)?",
        r"\bon amazon\b",
        r"\bfrom amazon\b",
        r"\bfor me\b",
    ):
        goal = re.sub(pattern, " ", goal, flags=re.IGNORECASE).strip(" ,.")
    goal = " ".join(goal.split())

    for pattern in (
        r"\blike\b",
        r"\bgive me (?:some )?options\b",
        r"\bsome options\b",
        r"\bother options\b",
        r"\boptions\b",
        r"\bshow me\b",
    ):
        goal = re.sub(pattern, " ", goal, flags=re.IGNORECASE).strip(" ,.")
    goal = " ".join(goal.split())

    # Browser tasks work better when common medical organizers are normalized
    # to the phrase patients actually mean, instead of searching a looser noun.
    lower_goal = goal.lower()
    if "pill organizer" in lower_goal or "pill organizers" in lower_goal:
        if "am pm" in lower_goal or "2 times a day" in lower_goal:
            return "am pm weekly pill organizer"
        if "7 day" in lower_goal or "weekly" in lower_goal:
            return "weekly 7 day pill organizer"
        return "pill organizer"

    return goal


def _needs_browser_clarification(goal: str) -> bool:
    normalized = " ".join(goal.strip().lower().split())
    return normalized in GENERIC_BROWSER_GOALS


def supervisor_node(state: SageState) -> SageState:
    text = state.get("user_text", "")
    heuristic = _heuristic_route(text)
    if heuristic is not None:
        intent = heuristic["intent"]
        reason = heuristic["reason"]
        goal = heuristic["goal"]
        update: SageState = {"intent": intent, "intent_reason": reason, "payload_goal": goal}
        state.update(update)
        _push_trace(state, "supervisor", f"intent={intent} ({reason})")
        return update

    client = get_openai()
    resp = client.chat.completions.create(
        model=ROUTING_MODEL,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": SUPERVISOR_SYSTEM},
            {"role": "user", "content": text},
        ],
        temperature=0.0,
    )
    usage_log.record_from_openai_response(ROUTING_MODEL, resp, session_id=state.get("session_id"))
    raw = resp.choices[0].message.content or "{}"
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        data = {"intent": "smalltalk", "reason": "fallback parse"}

    intent = data.get("intent", "smalltalk")
    if intent not in {"browser_task", "memory_lookup", "smalltalk", "end_session"}:
        intent = "smalltalk"
    goal = (data.get("goal") or "").strip()
    reason = (data.get("reason") or "").strip()

    update: SageState = {"intent": intent, "intent_reason": reason, "payload_goal": goal}
    state.update(update)
    _push_trace(state, "supervisor", f"intent={intent} ({reason})")
    return update


MEMORY_SYSTEM = """You are matching a user utterance to a structured patient profile.

Return ONLY a JSON object: {"match": <profile field path or empty>, "summary": <one warm sentence>}.

The profile keys are: doctors[], appointments[], pharmacy, address, common_items[], caregiver.

Examples:
profile: {"appointments":[{"doctor":"Dr. Mehta","when":"Thursday 9:00am","address":"450 Maple Ave"}]}
user: "When do I need to see Dr. Mehta?"
→ {"match":"appointments[0]","summary":"Your appointment with Dr. Mehta is Thursday at 9 a.m. at 450 Maple Ave."}

profile: {"pharmacy":{"name":"CVS Maple","address":"410 Maple Ave"}}
user: "Where do I usually pick up prescriptions?"
→ {"match":"pharmacy","summary":"You usually pick up prescriptions at CVS Maple on 410 Maple Ave."}

If nothing matches, return {"match":"","summary":""}. Never invent a fact that is not in the profile.
"""


def memory_lookup_node(state: SageState) -> SageState:
    from sage import snowflake_io  # local import — avoids load-order issues

    patient_id = state.get("patient_id") or "p_eleanor"
    profile = state.get("profile")
    if profile is None:
        try:
            profile = snowflake_io.get_profile(patient_id)
        except Exception as err:
            log.warning("profile load failed for %s: %s", patient_id, err)
            profile = None

    if not profile:
        _push_trace(state, "memory_lookup", f"no profile for {patient_id}")
        return {"memory_summary": "", "profile": {}}

    user_text = state.get("user_text", "")
    profile_for_prompt = {k: v for k, v in profile.items() if k != "patient_id"}

    client = get_openai()
    resp = client.chat.completions.create(
        model=ROUTING_MODEL,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": MEMORY_SYSTEM},
            {
                "role": "user",
                "content": f"profile: {json.dumps(profile_for_prompt)}\nuser: {user_text}",
            },
        ],
        temperature=0.0,
    )
    usage_log.record_from_openai_response(ROUTING_MODEL, resp, session_id=state.get("session_id"))
    raw = resp.choices[0].message.content or "{}"
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        data = {"match": "", "summary": ""}

    summary = (data.get("summary") or "").strip()
    match = (data.get("match") or "").strip()
    _push_trace(state, "memory_lookup", f"match={match or 'none'}")
    return {"memory_summary": summary, "profile": profile}


def browser_agent_node(state: SageState) -> SageState:
    goal = state.get("payload_goal") or state.get("user_text", "")
    if _needs_browser_clarification(goal):
        data = {
            "ok": False,
            "reason": "clarify_product",
            "needs_clarification": True,
        }
        state["browser_result"] = data
        _push_trace(state, "browser_agent", "need a more specific Amazon item")
        return {"browser_result": data}
    _push_trace(state, "browser_agent", f"opening amazon for: {goal[:80]}")
    try:
        with httpx.Client(timeout=45.0) as client:
            r = client.post(
                f"{BRIDGE_URL}/internal/browser-task",
                json={"goal": goal, "session_id": state.get("session_id")},
            )
            r.raise_for_status()
            data = r.json()
    except Exception as err:
        log.warning("browser-task failed: %s", err)
        data = {"ok": False, "reason": str(err)}

    state["browser_result"] = data
    if not data.get("ok"):
        _push_trace(state, "browser_agent", f"failed: {data.get('reason', 'unknown')}")
    return {"browser_result": data}


RESPONDER_SYSTEM = """You are Sage — a warm, calm, dignified voice assistant for an older adult.

Hard rules:
- Keep replies under 80 words. Spoken aloud, so prefer short clean sentences.
- Never robotic ("Processing…", "Task complete"). Speak like a kind helper.
- If a browser task succeeded, name what was found and the price plainly.
- If a browser task failed, do NOT panic the user. Offer a graceful next step.
- If the user is just chatting, respond briefly and warmly without forcing a task.
- Never claim a medical diagnosis. Never use the word "monitoring".
"""


BROWSER_GRACEFUL_FALLBACK = (
    "I had trouble finding that on Amazon just now. "
    "I can save it to your list and try again later. Is that okay?"
)


def _spoken_product_name(browser_result: dict[str, Any]) -> str:
    spoken = (browser_result.get("spoken_name") or "").strip()
    if spoken:
        return spoken

    title = (browser_result.get("title") or "that item").strip()
    first_clause = re.split(r"[,:-]", title, maxsplit=1)[0].strip()
    words = first_clause.split()
    return " ".join(words[:6]) if len(words) > 6 else first_clause


def responder_node(state: SageState) -> SageState:
    user_text = state.get("user_text", "")
    intent = state.get("intent", "smalltalk")
    browser_result = state.get("browser_result") or {}
    memory_summary = state.get("memory_summary") or ""

    if browser_result.get("needs_clarification"):
        _push_trace(state, "responder", "asking for a clearer Amazon item")
        return {"response_text": "Which item would you like me to look for on Amazon?"}

    if intent == "browser_task" and browser_result.get("ok"):
        title = _spoken_product_name(browser_result) or "that item"
        price = (browser_result.get("price") or "").strip()
        option_count = len(browser_result.get("results") or [])
        response = f"I found {title}"
        if price:
            response += f" for {price}"
        if option_count > 1:
            response += ". I have a couple of other options too."
        response += " Would you like me to help you order it?"
        _push_trace(state, "responder", "browser reply ready")
        return {"response_text": response}

    if intent == "memory_lookup" and memory_summary:
        _push_trace(state, "responder", "memory reply ready")
        return {"response_text": memory_summary}

    # Graceful canned line when the browser agent fails — guarantees the exact
    # wording (no model wandering into apologies that scare the patient) and
    # saves a model call.
    if intent == "browser_task" and browser_result and not browser_result.get("ok"):
        _push_trace(state, "responder", "browser failed → graceful fallback")
        return {"response_text": BROWSER_GRACEFUL_FALLBACK}

    context_parts = [f"User said: {user_text}", f"Intent: {intent}"]
    if memory_summary:
        context_parts.append(f"Memory: {memory_summary}")
    if browser_result and browser_result.get("ok"):
        context_parts.append(
            f"Browser result: title='{browser_result.get('title')}', price='{browser_result.get('price')}'"
        )

    client = get_openai()
    resp = client.chat.completions.create(
        model=RESPONDER_MODEL,
        messages=[
            {"role": "system", "content": RESPONDER_SYSTEM},
            {"role": "user", "content": "\n".join(context_parts)},
        ],
        temperature=0.6,
        max_tokens=180,
    )
    usage_log.record_from_openai_response(RESPONDER_MODEL, resp, session_id=state.get("session_id"))
    text = (resp.choices[0].message.content or "").strip()
    _push_trace(state, "responder", "reply ready")
    return {"response_text": text}


# ─── graph wiring ─────────────────────────────────────────────────────────────


def _route(state: SageState) -> str:
    intent = state.get("intent", "smalltalk")
    if intent == "browser_task":
        return "browser_agent"
    if intent == "memory_lookup":
        return "memory_lookup"
    return "responder"


def build_graph():
    sg = StateGraph(SageState)
    sg.add_node("supervisor", supervisor_node)
    sg.add_node("memory_lookup", memory_lookup_node)
    sg.add_node("browser_agent", browser_agent_node)
    sg.add_node("responder", responder_node)

    sg.add_edge(START, "supervisor")
    sg.add_conditional_edges(
        "supervisor",
        _route,
        {
            "memory_lookup": "memory_lookup",
            "browser_agent": "browser_agent",
            "responder": "responder",
        },
    )
    sg.add_edge("memory_lookup", "responder")
    sg.add_edge("browser_agent", "responder")
    sg.add_edge("responder", END)
    return sg.compile()


_compiled = None


def get_graph():
    global _compiled
    if _compiled is None:
        _compiled = build_graph()
    return _compiled


def run_turn(session_id: str, text: str) -> dict:
    """Synchronous one-turn convenience wrapper."""
    initial: SageState = {
        "session_id": session_id,
        "patient_id": session_id.split(":", 1)[0] if ":" in session_id else session_id,
        "user_text": text,
        "trace": [],
    }
    final_state = get_graph().invoke(initial)
    return {
        "response_text": final_state.get("response_text", ""),
        "trace": final_state.get("trace", []),
        "intent": final_state.get("intent"),
        "payload_goal": final_state.get("payload_goal"),
        "browser_result": final_state.get("browser_result"),
    }
