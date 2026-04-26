"""Cortex Analyst REST client with a local SQL fallback.

Sage's caregiver dashboard sends a natural-language question; Cortex Analyst
returns a SQL statement grounded in our semantic model. We then execute the
SQL ourselves and summarize the result row(s) into one human sentence.

If Cortex Analyst is unavailable for this account, we fall back to a small set
of deterministic Snowflake queries that cover the dashboard's common prompts.
"""
from __future__ import annotations

import json
import logging
import os
import re
from statistics import mean
from typing import Any

import httpx

from sage import snowflake_io

log = logging.getLogger("sage.cortex")

SEMANTIC_MODEL_FILE = os.getenv(
    "SAGE_SEMANTIC_MODEL_FILE",
    "@SAGE_DB.CORE.SAGE_STAGE/cortex/cortex_semantic.yaml",
)
DEFAULT_PATIENT_ID = os.getenv("SAGE_CAREGIVER_PATIENT_ID", "p_eleanor")


def _account_host() -> str:
    """Build the REST host from SNOWFLAKE_ACCOUNT (e.g. xy12345.us-east-1)."""
    account = os.environ["SNOWFLAKE_ACCOUNT"]
    if ".snowflakecomputing.com" in account:
        return f"https://{account}"
    return f"https://{account}.snowflakecomputing.com"


def ask(question: str) -> dict[str, Any]:
    """Call Cortex Analyst when available, otherwise use a local SQL fallback."""
    try:
        return _ask_via_cortex(question)
    except Exception as err:
        log.warning("cortex analyst unavailable, using local fallback: %s", err)
        return _ask_via_fallback(question)


def _ask_via_cortex(question: str) -> dict[str, Any]:
    payload = {
        "messages": [
            {"role": "user", "content": [{"type": "text", "text": question}]},
        ],
        "semantic_model_file": SEMANTIC_MODEL_FILE,
    }

    conn = snowflake_io._connect()
    try:
        token = conn.rest.token  # type: ignore[attr-defined]
        url = f"{_account_host()}/api/v2/cortex/analyst/message"
        headers = {
            "Authorization": f'Snowflake Token="{token}"',
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        with httpx.Client(timeout=30.0) as client:
            r = client.post(url, headers=headers, json=payload)
            r.raise_for_status()
            data = r.json()
    finally:
        try:
            conn.close()
        except Exception:
            pass

    sql, message_text = _extract_sql_and_text(data)
    rows = _run_sql(sql)
    answer = _compose_answer(question, rows, message_text)

    return {
        "question": question,
        "sql": sql,
        "rows": rows,
        "answer_text": answer,
        "raw_message": message_text,
    }


def _ask_via_fallback(question: str) -> dict[str, Any]:
    q = " ".join(question.lower().split())
    if "changed" in q and "last three" in q:
        sql, rows, answer = _changed_vs_last_three()
    elif "word-finding" in q and "month" in q:
        sql, rows, answer = _word_finding_this_month()
    elif "baseline" in q:
        sql, rows, answer = _vs_baseline()
    elif "concerning" in q and "week" in q:
        sql, rows, answer = _concerning_this_week()
    else:
        sql, rows, answer = _latest_session_summary(question)

    return {
        "question": question,
        "sql": sql,
        "rows": rows,
        "answer_text": answer,
        "raw_message": "fallback:local-snowflake-query",
    }


def _extract_sql_and_text(data: dict[str, Any]) -> tuple[str, str]:
    msg = data.get("message") or {}
    content = msg.get("content") or []
    sql = ""
    text_parts: list[str] = []
    for block in content:
        btype = block.get("type")
        if btype == "sql":
            sql = (block.get("statement") or block.get("sql") or "").strip()
        elif btype == "text":
            text_parts.append(block.get("text") or "")
        elif btype == "suggestions":
            for suggestion in block.get("suggestions") or []:
                text_parts.append(f"(suggestion) {suggestion}")
    return sql, "\n".join(part for part in text_parts if part)


def _run_sql(sql: str, params: tuple[Any, ...] | None = None) -> list[dict[str, Any]]:
    capped = sql if re.search(r"\bLIMIT\b", sql, re.IGNORECASE) else f"{sql.rstrip().rstrip(';')}\nLIMIT 200"
    with snowflake_io.cursor() as cur:
        cur.execute(capped, params or ())
        cols = [c[0].lower() for c in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]


def _compose_answer(question: str, rows: list[dict[str, Any]], message_text: str) -> str:
    if not rows and not message_text:
        return "I couldn't find any matching sessions for that question yet."

    try:
        from openai import OpenAI

        client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
        resp = client.chat.completions.create(
            model="gpt-4.1-mini",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are summarizing analytics for a caregiver. Write ONE plain sentence "
                        "(max 25 words). Use only the numbers in the rows. Never use clinical "
                        "language (no 'diagnosis', 'decline', 'impairment', 'dementia')."
                    ),
                },
                {
                    "role": "user",
                    "content": json.dumps(
                        {
                            "question": question,
                            "rows": rows[:20],
                            "cortex_text": message_text,
                        }
                    ),
                },
            ],
            temperature=0.2,
            max_tokens=120,
        )
        return (resp.choices[0].message.content or "").strip()
    except Exception as err:
        log.warning("answer summarization failed: %s", err)
        if rows:
            return f"Returned {len(rows)} row(s). First row: {rows[0]}"
        return message_text or "No answer available."


def _changed_vs_last_three() -> tuple[str, list[dict[str, Any]], str]:
    sql = f"""
SELECT
  TO_CHAR(s.started_at, 'Mon DD') AS date,
  a.overall_score AS score,
  a.severity,
  COALESCE(ARRAY_SIZE(a.flagged_phrases), 0) AS word_finding_count
FROM sessions s
JOIN cognitive_analyses a ON a.session_id = s.session_id
WHERE s.patient_id = '{DEFAULT_PATIENT_ID}'
ORDER BY s.started_at DESC
LIMIT 4
""".strip()
    rows = _run_sql(sql)
    if not rows:
        return sql, rows, "I couldn't find any analyzed sessions yet to compare."

    latest = rows[0]
    prior = rows[1:]
    if not prior:
        return sql, rows, (
            f"The latest session scored {latest['score']} with {latest['word_finding_count']} word-finding flags, "
            "but there aren't three earlier analyzed sessions to compare yet."
        )

    prior_scores = [float(row["score"]) for row in prior if row.get("score") is not None]
    prior_word_finding = [float(row["word_finding_count"]) for row in prior]
    avg_score = mean(prior_scores) if prior_scores else float(latest["score"])
    avg_word_finding = mean(prior_word_finding) if prior_word_finding else 0.0
    diff = float(latest["score"]) - avg_score
    direction = "higher" if diff >= 0 else "lower"
    return sql, rows, (
        f"Today scored {int(latest['score'])}, which is {abs(diff):.1f} points {direction} than the prior "
        f"{len(prior_scores)} analyzed sessions on average; word-finding flags were {latest['word_finding_count']} today."
    )


def _word_finding_this_month() -> tuple[str, list[dict[str, Any]], str]:
    sql = f"""
SELECT
  TO_CHAR(s.started_at, 'YYYY-MM-DD') AS date,
  COALESCE(ARRAY_SIZE(a.flagged_phrases), 0) AS score
FROM sessions s
JOIN cognitive_analyses a ON a.session_id = s.session_id
WHERE s.patient_id = '{DEFAULT_PATIENT_ID}'
  AND s.started_at >= DATEADD(day, -30, CURRENT_TIMESTAMP())
ORDER BY s.started_at ASC
""".strip()
    rows = _run_sql(sql)
    if not rows:
        return sql, rows, "I couldn't find any analyzed sessions this month yet."

    counts = [float(row["score"]) for row in rows]
    latest = counts[-1]
    avg_count = mean(counts)
    low = min(counts)
    high = max(counts)
    return sql, rows, (
        f"Word-finding flags averaged {avg_count:.1f} per analyzed session this month, ranging from {int(low)} to {int(high)}; "
        f"the latest session had {int(latest)}."
    )


def _vs_baseline() -> tuple[str, list[dict[str, Any]], str]:
    sql = f"""
SELECT
  TO_CHAR(s.started_at, 'Mon DD') AS date,
  a.overall_score AS score,
  p.baseline_score,
  a.baseline_delta
FROM sessions s
JOIN cognitive_analyses a ON a.session_id = s.session_id
JOIN patients p ON p.patient_id = s.patient_id
WHERE s.patient_id = '{DEFAULT_PATIENT_ID}'
ORDER BY s.started_at DESC
LIMIT 1
""".strip()
    rows = _run_sql(sql)
    if not rows:
        return sql, rows, "I couldn't find a scored session to compare against baseline yet."

    row = rows[0]
    delta = int(row["baseline_delta"])
    direction = "above" if delta >= 0 else "below"
    return sql, rows, (
        f"The latest analyzed session scored {int(row['score'])}, which is {abs(delta)} points {direction} the baseline "
        f"of {int(row['baseline_score'])}."
    )


def _concerning_this_week() -> tuple[str, list[dict[str, Any]], str]:
    sql = f"""
SELECT
  severity AS date,
  COUNT(*) AS score
FROM cognitive_analyses
WHERE patient_id = '{DEFAULT_PATIENT_ID}'
  AND analyzed_at >= DATEADD(day, -7, CURRENT_TIMESTAMP())
GROUP BY severity
ORDER BY severity
""".strip()
    rows = _run_sql(sql)
    if not rows:
        return sql, rows, "I couldn't find any analyzed sessions from the last week yet."

    concerning = sum(int(row["score"]) for row in rows if row["date"] in {"attention", "follow-up"})
    total = sum(int(row["score"]) for row in rows)
    return sql, rows, (
        f"There were {concerning} concerning sessions in the last week out of {total} analyzed sessions."
    )


def _latest_session_summary(question: str) -> tuple[str, list[dict[str, Any]], str]:
    sql = f"""
SELECT
  TO_CHAR(s.started_at, 'Mon DD') AS date,
  a.overall_score AS score,
  a.severity,
  a.baseline_delta
FROM sessions s
JOIN cognitive_analyses a ON a.session_id = s.session_id
WHERE s.patient_id = '{DEFAULT_PATIENT_ID}'
ORDER BY s.started_at DESC
LIMIT 5
""".strip()
    rows = _run_sql(sql)
    if not rows:
        return sql, rows, "I couldn't find analyzed sessions for that question yet."

    latest = rows[0]
    return sql, rows, (
        f'For "{question}", the latest analyzed session scored {int(latest["score"])} with severity {latest["severity"]} '
        f"and a baseline delta of {int(latest['baseline_delta'])}."
    )
