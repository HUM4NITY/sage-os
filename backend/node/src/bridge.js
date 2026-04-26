// Sage bridge — Socket.IO + REST passthrough. Frontend's only entry point.
//
// Phase 1: health, hello, audio:chunk logging, heartbeat, re-broadcast.
// Phase 2:
//   - per-session StreamingSTT (B8) — audio:chunk → transcript:partial/final
//   - speak() integration (B9) — orb:state speaking → tts:chunk → tts:done
//   - /turn round-trip to Python orchestrator (with echo fallback if down)
//   - /internal/trace endpoint — Python pushes node traces, bridge re-emits
//   - /internal/browser-task endpoint — Python asks the bridge to run Stagehand
//   - session:start / session:end accumulate transcript for cognitive analysis

import { config } from 'dotenv';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import express from 'express';
import { Server as SocketIOServer } from 'socket.io';

import { StreamingSTT } from './stt.js';
import { speak, usage as ttsUsage } from './tts.js';
import { runBrowserTask, prewarm as prewarmStagehand } from './stagehand-runner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..', '..', '..');
const outDir = resolve(repoRoot, 'out');
config({ path: resolve(repoRoot, '.env') });

const PORT = Number(process.env.BRIDGE_PORT || 3001);
const PY_BASE = process.env.PY_ORCHESTRATOR_URL || 'http://localhost:7777';

const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});
app.use(express.json({ limit: '4mb' }));

app.get('/health', async (_req, res) => {
  let orchestrator_ok = false;
  try {
    const r = await fetch(`${PY_BASE}/health`, { signal: AbortSignal.timeout(1500) });
    orchestrator_ok = r.ok;
  } catch {
    orchestrator_ok = false;
  }
  res.json({ ok: true, orchestrator_ok });
});
app.use('/static', express.static(outDir, { fallthrough: true, maxAge: 0 }));

const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  maxHttpBufferSize: 8 * 1024 * 1024,
});

/** session_id → { socket, sttSession, interactions[], startedAt } */
const sessions = new Map();
const endingSessions = new Set();
/** internal "hops" we never re-broadcast even if some client emits them */
const HANDLED_EVENTS = new Set(['hello', 'audio:chunk', 'audio:end', 'session:start', 'session:end']);
const DEMO_TURNS = [
  'I need one of those weekly pill organizers, and I keep forgetting which one I got last time.',
  'When do I see Dr. Mehta on Thursday?',
  'Please remind me the night before.',
];

function emitToSession(_sessionId, event, payload) {
  // io.emit reaches every connected client (Electron orb + dashboard + listener).
  // Sessions are coarse for now; targeted rooms can be introduced if a second
  // patient ever joins simultaneously.
  io.emit(event, payload);
}

io.on('connection', (socket) => {
  console.log(`[bridge] socket connected id=${socket.id}`);

  socket.on('hello', () => socket.emit('hello', { ok: true, ts: Date.now() }));

  socket.on('session:start', async (payload = {}) => {
    const patientId = payload.patient_id || 'p_eleanor';
    const sessionId = payload.session_id || `${patientId}:${randomUUID()}`;
    const priorSessionId = socket.data?.sessionId;
    if (priorSessionId && priorSessionId !== sessionId) {
      await finalizeSession(priorSessionId, {
        reason: 'superseded',
        notifySocket: false,
      });
    }
    createSession(sessionId, socket, patientId);
    socket.data.sessionId = sessionId;
    socket.emit('session:started', { session_id: sessionId, patient_id: patientId });
    console.log(`[bridge] session:start ${sessionId}`);
  });

  socket.on('session:end', async () => {
    const sessionId = socket.data?.sessionId;
    if (!sessionId) return;
    await finalizeSession(sessionId, { reason: 'manual' });
  });

  socket.on('audio:chunk', (b64) => {
    const sessionId = socket.data?.sessionId;
    if (!sessionId) return;
    const session = sessions.get(sessionId);
    if (!session) return;

    if (!session.sttSession) {
      attachSttSession(sessionId, session);
    }

    const buf = toAudioBuffer(b64);
    if (buf.byteLength === 0) return;
    session.sttSession.push(buf);
  });

  socket.on('audio:end', () => {
    const sessionId = socket.data?.sessionId;
    if (!sessionId) return;
    const session = sessions.get(sessionId);
    session?.sttSession?.end();
  });

  socket.onAny((event, payload) => {
    if (HANDLED_EVENTS.has(event)) return;
    if (event.startsWith('tts:') || event.startsWith('orb:') || event.startsWith('agent:') || event.startsWith('transcript:') || event === 'session:started' || event === 'session:ended') {
      // Outgoing events reflected by tools/listeners — pass through to peers.
      socket.broadcast.emit(event, payload);
      return;
    }
    const preview = payload && typeof payload === 'object' ? JSON.stringify(payload).slice(0, 120) : String(payload ?? '');
    console.log(`[bridge] ← ${event} ${preview}`);
    socket.broadcast.emit(event, payload);
  });

  socket.on('disconnect', (reason) => {
    const sessionId = socket.data?.sessionId;
    if (sessionId) {
      void finalizeSession(sessionId, {
        reason: `disconnect:${reason}`,
        notifySocket: false,
      });
    }
    console.log(`[bridge] socket disconnected id=${socket.id} reason=${reason}`);
  });
});

function createSession(sessionId, socket, patientId, { attachSpeech = true } = {}) {
  const session = {
    socket,
    patientId: patientId || sessionId.split(':', 1)[0],
    sttSession: null,
    interactions: [],
    startedAt: Date.now(),
    primaryTask: null,
    browserCatalog: null,
  };
  sessions.set(sessionId, session);
  if (attachSpeech) {
    attachSttSession(sessionId, session);
  }
  return session;
}

function attachSttSession(sessionId, session) {
  const stt = new StreamingSTT({ sessionId });
  session.sttSession = stt;

  stt.on('partial', ({ text }) => {
    if (text) emitToSession(sessionId, 'transcript:partial', { text, session_id: sessionId });
  });

  stt.on('final', async ({ text }) => {
    if (session.sttSession === stt) {
      session.sttSession = null;
    }

    if (text) {
      emitToSession(sessionId, 'transcript:final', { text, session_id: sessionId });
      session.interactions.push({ speaker: 'patient', utterance: text, ts: new Date().toISOString() });
      await handleUtterance(sessionId, text);
    }

    if (sessions.has(sessionId) && !endingSessions.has(sessionId) && session.sttSession == null) {
      attachSttSession(sessionId, session);
    }
  });

  stt.on('error', (err) => {
    console.error(`[bridge:stt] ${err.message}`);
    emitToSession(sessionId, 'agent:trace', { node: 'stt', text: `error: ${err.message}` });
    if (session.sttSession === stt) {
      session.sttSession = null;
    }
    if (sessions.has(sessionId) && !endingSessions.has(sessionId)) {
      attachSttSession(sessionId, session);
    }
  });

  return stt;
}

async function finalizeSession(sessionId, { reason = 'manual', notifySocket = true } = {}) {
  if (!sessionId || endingSessions.has(sessionId)) return null;
  const session = sessions.get(sessionId);
  if (!session) return null;

  endingSessions.add(sessionId);
  try {
    session.sttSession?.end();
    await new Promise((r) => setTimeout(r, 250));

    const startedAtIso = new Date(session.startedAt).toISOString();
    const endedAtIso = new Date().toISOString();
    let persisted = null;
    try {
      const r = await fetch(`${PY_BASE}/session/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          patient_id: session.patientId,
          started_at: startedAtIso,
          ended_at: endedAtIso,
          interactions: session.interactions,
          primary_task: session.primaryTask,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      persisted = await r.json();
    } catch (err) {
      console.error(`[bridge] session:end persistence failed: ${err.message}`);
    }

    const endedPayload = {
      session_id: sessionId,
      interactions: session.interactions.length,
      duration_seconds: Math.round((Date.now() - session.startedAt) / 1000),
      persisted: !!persisted,
      reason,
      cognitive_analysis: persisted?.cognitive_analysis ?? { status: 'unavailable' },
    };

    if (notifySocket) {
      session.socket?.emit?.('session:ended', endedPayload);
    }
    emitToSession(sessionId, 'session:end', endedPayload);
    console.log(
      `[bridge] session:end ${sessionId} (${session.interactions.length} interactions) persisted=${!!persisted} reason=${reason}`,
    );
    return endedPayload;
  } finally {
    if (session.socket?.data?.sessionId === sessionId) {
      session.socket.data.sessionId = undefined;
    }
    sessions.delete(sessionId);
    endingSessions.delete(sessionId);
  }
}

async function handleUtterance(sessionId, text) {
  emitToSession(sessionId, 'orb:state', { state: 'thinking' });

  const session = sessions.get(sessionId);
  const quickBrowserReply = getQuickBrowserReply(session, text);
  if (quickBrowserReply) {
    if (session) {
      session.interactions.push({ speaker: 'sage', utterance: quickBrowserReply.text, ts: new Date().toISOString() });
    }
    emitToSession(sessionId, 'assistant:final', { text: quickBrowserReply.text });
    emitToSession(sessionId, 'orb:state', { state: 'speaking' });
    if (quickBrowserReply.trace) {
      emitToSession(sessionId, 'agent:trace', { node: 'browser_agent', text: quickBrowserReply.trace });
    }
    await speak({
      text: quickBrowserReply.text,
      sessionId,
      onChunk: (buf) => emitToSession(sessionId, 'tts:chunk', { b64: buf.toString('base64') }),
      onFallback: (reason) => emitToSession(sessionId, 'tts:fallback-engaged', { reason }),
      onDone: ({ ms, bytes, engine }) => {
        emitToSession(sessionId, 'tts:done', { ms, bytes, engine });
        emitToSession(sessionId, 'orb:state', { state: 'complete' });
      },
    });
    return;
  }

  let responseText;
  let trace = [];
  let intent = null;
  let payloadGoal = null;
  let browserResult = null;
  try {
    const r = await fetch(`${PY_BASE}/turn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, text }),
      signal: AbortSignal.timeout(40_000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    responseText = data.response_text;
    trace = data.trace ?? [];
    intent = data.intent ?? null;
    payloadGoal = data.payload_goal ?? null;
    browserResult = data.browser_result ?? null;
  } catch (err) {
    console.warn(`[bridge] /turn unavailable (${err.message}) — using warm fallback`);
    emitToSession(sessionId, 'agent:trace', {
      node: 'supervisor',
      text: 'orchestrator unavailable',
    });
    responseText = "I'm reconnecting my tools right now. Please try that again in a moment.";
  }

  // Trace events are already streamed live by Python via /internal/trace —
  // the `trace` field on the response is for logging/diagnostics only.
  void trace;

  if (session) {
    session.interactions.push({ speaker: 'sage', utterance: responseText, ts: new Date().toISOString() });
    // First substantive intent wins for primary_task — browser tasks have priority.
    if (intent === 'browser_task' && payloadGoal) {
      session.primaryTask = `browser: ${payloadGoal}`;
    } else if (!session.primaryTask && intent && intent !== 'smalltalk') {
      session.primaryTask = intent;
    }
    if (browserResult?.ok && Array.isArray(browserResult.results) && browserResult.results.length > 0) {
      session.browserCatalog = {
        goal: payloadGoal || text,
        results: browserResult.results,
        index: 0,
      };
    }
  }

  emitToSession(sessionId, 'assistant:final', { text: responseText });
  emitToSession(sessionId, 'orb:state', { state: 'speaking' });
  await speak({
    text: responseText,
    sessionId,
    onChunk: (buf) => emitToSession(sessionId, 'tts:chunk', { b64: buf.toString('base64') }),
    onFallback: (reason) => emitToSession(sessionId, 'tts:fallback-engaged', { reason }),
    onDone: ({ ms, bytes, engine }) => {
      emitToSession(sessionId, 'tts:done', { ms, bytes, engine });
      emitToSession(sessionId, 'orb:state', { state: 'complete' });
    },
  });
}

// ─── REST endpoints reachable from the Python orchestrator ────────────────────

app.post('/internal/trace', (req, res) => {
  const { session_id, node, text, screenshot_url } = req.body || {};
  if (!session_id || !node) return res.status(400).json({ ok: false, error: 'session_id+node required' });
  emitToSession(session_id, 'agent:trace', { node, text: text ?? '', screenshot_url });
  res.json({ ok: true });
});

app.post('/internal/analysis-ready', (req, res) => {
  const { session_id, score, severity } = req.body || {};
  if (!session_id) return res.status(400).json({ ok: false, error: 'session_id required' });
  console.log(`[cognitive] analysis ready session=${session_id} score=${score} severity=${severity}`);
  io.emit('analysis:ready', { session_id, score, severity });
  io.emit('cognitive:ready', { session_id, score, severity });
  res.json({ ok: true });
});

app.post('/internal/session-cost', (req, res) => {
  const { session_id, in: inTok = 0, out: outTok = 0, dollars = 0 } = req.body || {};
  if (!session_id) return res.status(400).json({ ok: false, error: 'session_id required' });
  // Roll in TTS usage (the bridge owns ElevenLabs/OpenAI TTS).
  const ttsChars = ttsUsage.ttsChars;
  const ttsDollars = ttsUsage.ttsDollars;
  const total = Number(dollars) + ttsDollars;
  console.log(
    `Session ${session_id} cost: $${total.toFixed(4)} ` +
      `(LLM $${Number(dollars).toFixed(4)} in=${inTok} out=${outTok} | ` +
      `TTS $${ttsDollars.toFixed(4)} chars=${ttsChars})`,
  );
  io.emit('session:cost', {
    session_id,
    llm: { in: inTok, out: outTok, dollars: Number(dollars) },
    tts: { chars: ttsChars, dollars: ttsDollars },
    total,
    total_dollars: total,
  });
  res.json({ ok: true });
});

app.post('/internal/browser-task', async (req, res) => {
  const { goal, session_id } = req.body || {};
  if (!goal) return res.status(400).json({ ok: false, error: 'goal required' });
  try {
    const result = await runBrowserTask({
      goal,
      onTrace: (trace) => {
        if (!session_id) return;
        const payload =
          typeof trace === 'string'
            ? { text: trace }
            : { text: trace.text, screenshot_url: trace.screenshot_url };
        emitToSession(session_id, 'agent:trace', { node: 'browser_agent', ...payload });
      },
    });
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error(`[bridge] browser-task error: ${err.message}`);
    res.status(200).json({ ok: false, reason: err.message });
  }
});

app.get('/internal/demo-run', (_req, res) => {
  res
    .status(200)
    .type('html')
    .send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Sage Demo Runner</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #fbf6ee;
        --surface: #ffffff;
        --line: #e8decf;
        --ink: #1f1a14;
        --soft: #6b5f4f;
        --amber: #c8841c;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: radial-gradient(circle at top, rgba(255,216,155,0.35), transparent 40%), var(--bg);
        color: var(--ink);
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .card {
        width: min(560px, calc(100vw - 32px));
        padding: 24px;
        border-radius: 20px;
        background: var(--surface);
        border: 1px solid var(--line);
        box-shadow: 0 20px 48px -24px rgba(31, 26, 20, 0.2);
      }
      h1 { margin: 0 0 8px; font-size: 24px; }
      p { margin: 0 0 14px; color: var(--soft); line-height: 1.5; }
      code {
        padding: 2px 6px;
        border-radius: 999px;
        background: rgba(200, 132, 28, 0.12);
      }
      button {
        border: 0;
        border-radius: 999px;
        padding: 12px 18px;
        background: var(--amber);
        color: white;
        font-weight: 600;
        cursor: pointer;
      }
      button:disabled { opacity: 0.55; cursor: wait; }
      pre {
        margin: 14px 0 0;
        padding: 14px;
        border-radius: 14px;
        overflow: auto;
        background: #faf6ef;
        border: 1px solid var(--line);
        color: var(--soft);
      }
    </style>
  </head>
  <body>
    <main class="card">
      <h1>Sage demo runner</h1>
      <p>This route expects a <code>POST</code> request. Opening it directly in the browser now shows this helper instead of <code>Cannot GET /internal/demo-run</code>.</p>
      <p>Use the button below to trigger the live demo for <code>p_eleanor</code>.</p>
      <button id="run">Run demo</button>
      <pre id="output">Waiting to start…</pre>
    </main>
    <script>
      const run = document.getElementById('run');
      const output = document.getElementById('output');
      run.addEventListener('click', async () => {
        run.disabled = true;
        output.textContent = 'Starting demo…';
        try {
          const response = await fetch('/internal/demo-run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ patient_id: 'p_eleanor' }),
          });
          const data = await response.json();
          output.textContent = JSON.stringify(data, null, 2);
        } catch (error) {
          output.textContent = String(error);
        } finally {
          run.disabled = false;
        }
      });
    </script>
  </body>
</html>`);
});

app.post('/internal/demo-run', async (req, res) => {
  const patientId = req.body?.patient_id || 'p_eleanor';
  const sessionId = `${patientId}:${randomUUID()}`;

  createSession(
    sessionId,
    {
      emit() {
        // Demo playback relies on broadcast events, not a single return socket.
      },
    },
    patientId,
    { attachSpeech: false },
  );

  emitToSession(sessionId, 'agent:trace', {
    node: 'demo',
    text: 'starting the live voice-and-browser demo',
  });

  void runDemoSession(sessionId).catch(async (err) => {
    console.error(`[bridge] demo-run error: ${err.message}`);
    emitToSession(sessionId, 'agent:trace', {
      node: 'demo',
      text: `demo failed: ${err.message}`,
    });
    await finalizeSession(sessionId, { reason: 'demo-error', notifySocket: false }).catch(() => null);
  });

  res.status(202).json({ ok: true, queued: true, session_id: sessionId, turns: DEMO_TURNS.length });
});

const heartbeatTimer = setInterval(() => {
  io.emit('heartbeat', { ts: Date.now() });
}, 1000);

httpServer.listen(PORT, () => {
  console.log(`bridge online :${PORT} (python orchestrator: ${PY_BASE})`);
  // Optional: STAGEHAND_PREWARM=0 disables. Default on so first call is fast.
  if (process.env.STAGEHAND_PREWARM !== '0') prewarmStagehand();
});

function shutdown(signal) {
  console.log(`[bridge] ${signal} received — shutting down`);
  clearInterval(heartbeatTimer);
  io.close(() => {
    httpServer.close(() => process.exit(0));
  });
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

function toAudioBuffer(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }
  if (typeof value === 'string') return Buffer.from(value, 'base64');
  return Buffer.alloc(0);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runDemoSession(sessionId) {
  for (const line of DEMO_TURNS) {
    const session = sessions.get(sessionId);
    if (!session) break;
    emitToSession(sessionId, 'orb:state', { state: 'listening' });
    await wait(80);
    emitToSession(sessionId, 'transcript:final', { text: line, session_id: sessionId });
    session.interactions.push({ speaker: 'patient', utterance: line, ts: new Date().toISOString() });
    await handleUtterance(sessionId, line);
    await wait(180);
  }

  await finalizeSession(sessionId, { reason: 'demo', notifySocket: false });
}

function getQuickBrowserReply(session, text) {
  if (!session?.browserCatalog?.results?.length) return null;
  const lower = String(text || '').trim().toLowerCase();
  if (!lower) return null;

  const wantsOptionList =
    /other options|other ones|more options|what else|what are the options|show me the options|tell me the options/i.test(
      lower,
    );
  if (wantsOptionList) {
    const nextIndex = session.browserCatalog.index + 1;
    const remaining = session.browserCatalog.results.slice(nextIndex, nextIndex + 2);
    if (remaining.length > 0) {
      session.browserCatalog.index = nextIndex;
      return {
        trace: `sharing ${remaining.length} saved options from the current search`,
        text:
          remaining.length === 1
            ? `Another option is ${remaining[0].spoken_name} for ${remaining[0].price}.`
            : `I found two more options: ${remaining[0].spoken_name} for ${remaining[0].price}, and ${remaining[1].spoken_name} for ${remaining[1].price}.`,
      };
    }

    const current = session.browserCatalog.results[session.browserCatalog.index];
    return {
      trace: 'no more saved options from the current search',
      text: `I do not have any more saved options beyond the ${current.spoken_name} at ${current.price}. If you want, I can run a broader search.`,
    };
  }

  if (/(another|next|different|other).*(result|option|one)|show me another|try another/i.test(lower)) {
    const nextIndex = session.browserCatalog.index + 1;
    if (nextIndex < session.browserCatalog.results.length) {
      session.browserCatalog.index = nextIndex;
      const result = session.browserCatalog.results[nextIndex];
      return {
        trace: `showing option ${nextIndex + 1} of ${session.browserCatalog.results.length}`,
        text: `Another good option is ${result.spoken_name} for ${result.price}.`,
      };
    }

    const current = session.browserCatalog.results[session.browserCatalog.index];
    return {
      trace: 'no more saved options from the current search',
      text: `I only found one strong match for ${current.spoken_name}. If you want, I can run a broader search.`,
    };
  }

  if (/(add .*cart|put .*cart|order it|buy it|checkout)/i.test(lower)) {
    const current = session.browserCatalog.results[session.browserCatalog.index];
    return {
      trace: 'cart follow-up requested for the saved browser option',
      text: `I’m holding ${current.spoken_name} at ${current.price}. Cart checkout is not wired yet, but I can show another option or keep this one.`,
    };
  }

  return null;
}
