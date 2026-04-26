import {
  OVERVIEW,
  TREND,
  SESSIONS,
  LATEST_DETAIL,
  ASK_SAGE_FIXTURE_ANSWERS,
  type Overview,
  type TrendPoint,
  type SessionSummary,
  type SessionDetail,
  type AskSageAnswer,
} from './fixtures';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? process.env.API_BASE ?? 'http://127.0.0.1:7777';
const REQUEST_TIMEOUT_MS = {
  overview: 3500,
  trend: 3500,
  sessions: 3500,
  sessionDetail: 7000,
  ask: 6000,
} as const;

type RawOverview = {
  patient: {
    patient_id: string;
    name: string;
    age: number;
    caregiver_name: string;
    baseline_score?: number | null;
  };
  latest_session?: RawSessionSummary | null;
  latest_score?: number | null;
  severity?: string | null;
  baseline_delta?: number | null;
  summary?: string | null;
};

type RawTrendPoint = {
  date: string;
  score: number;
  severity?: string | null;
};

type RawSessionSummary = {
  session_id: string;
  started_at: string;
  duration_seconds: number;
  primary_task: string | null;
  score?: number | null;
  severity?: string | null;
};

type RawTranscriptLine = {
  speaker: string;
  utterance: string;
  ts: string;
};

type RawFlaggedPhrase = {
  kind?: string | null;
  text?: string | null;
};

type RawSessionDetail = {
  session_id: string;
  started_at: string;
  ended_at?: string | null;
  primary_task: string | null;
  transcript: RawTranscriptLine[];
  analysis?: {
    overall_score?: number | null;
    severity?: string | null;
    baseline_delta?: number | null;
    summary?: string | null;
    metrics?: {
      lexical_diversity?: number;
      repetition_count?: number;
      hesitation_count?: number;
      topic_drift_count?: number;
    } | null;
    flagged_phrases?: RawFlaggedPhrase[] | null;
  } | null;
};

export async function getOverview(patientId = 'p_eleanor'): Promise<Overview> {
  try {
    const raw = await fetchJson<RawOverview>(
      `/caregiver/overview?patient_id=${encodeURIComponent(patientId)}`,
      undefined,
      REQUEST_TIMEOUT_MS.overview,
    );
    const baseline = Number(raw.patient?.baseline_score ?? OVERVIEW.baseline);
    const latestSession = mapSessionSummary(
      raw.latest_session ?? OVERVIEW.latest_session,
      baseline,
      raw.latest_score ?? undefined,
      raw.severity ?? undefined,
    );

    return {
      patient: {
        patient_id: raw.patient.patient_id,
        name: raw.patient.name,
        age: raw.patient.age,
        city: OVERVIEW.patient.city,
        caregiver_name: raw.patient.caregiver_name,
        active_since: OVERVIEW.patient.active_since,
      },
      latest_session: latestSession,
      baseline,
      baseline_delta: Number(raw.baseline_delta ?? latestSession.score - baseline),
      summary_text: raw.summary ?? OVERVIEW.summary_text,
    };
  } catch (error) {
    return fallbackFromNetwork(error, OVERVIEW);
  }
}

export async function getTrend(patientId = 'p_eleanor', days = 30): Promise<TrendPoint[]> {
  try {
    const raw = await fetchJson<{ points: RawTrendPoint[] }>(
      `/caregiver/trend?patient_id=${encodeURIComponent(patientId)}&days=${days}`,
      undefined,
      REQUEST_TIMEOUT_MS.trend,
    );
    return raw.points.map((point) => ({
      date: point.date.slice(0, 10),
      score: point.score,
      severity: normalizeSeverity(point.severity, point.score),
    }));
  } catch (error) {
    return fallbackFromNetwork(error, TREND.slice(-days));
  }
}

export async function getSessions(patientId = 'p_eleanor', limit = 10): Promise<SessionSummary[]> {
  try {
    const raw = await fetchJson<{ sessions: RawSessionSummary[] }>(
      `/caregiver/sessions?patient_id=${encodeURIComponent(patientId)}&limit=${limit}`,
      undefined,
      REQUEST_TIMEOUT_MS.sessions,
    );
    return raw.sessions.map((session) => mapSessionSummary(session, OVERVIEW.baseline));
  } catch (error) {
    return fallbackFromNetwork(error, SESSIONS.slice(0, limit));
  }
}

export async function getSessionDetail(sessionId: string): Promise<SessionDetail | null> {
  const resolvedSessionId = normalizeSessionId(sessionId);
  try {
    const raw = await fetchJson<RawSessionDetail>(
      `/caregiver/transcript?session_id=${encodeURIComponent(resolvedSessionId)}`,
      undefined,
      REQUEST_TIMEOUT_MS.sessionDetail,
    );
    const score = Number(raw.analysis?.overall_score ?? LATEST_DETAIL.score);

    return {
      session_id: normalizeSessionId(raw.session_id),
      started_at: raw.started_at,
      duration_seconds: computeDurationSeconds(raw.started_at, raw.ended_at),
      primary_task: raw.primary_task ?? 'Session',
      score,
      severity: normalizeSeverity(raw.analysis?.severity, score),
      baseline_delta: Number(raw.analysis?.baseline_delta ?? score - OVERVIEW.baseline),
      metrics: {
        lexical_diversity: Number(raw.analysis?.metrics?.lexical_diversity ?? 0),
        repetition_count: Number(raw.analysis?.metrics?.repetition_count ?? 0),
        hesitation_count: Number(raw.analysis?.metrics?.hesitation_count ?? 0),
        topic_drift_count: Number(raw.analysis?.metrics?.topic_drift_count ?? 0),
      },
      flagged_phrases: (raw.analysis?.flagged_phrases ?? []).map(mapFlaggedPhrase),
      transcript: raw.transcript.map((line) => ({
        speaker: line.speaker === 'sage' ? 'sage' : 'eleanor',
        text: line.utterance,
        ts: line.ts,
      })),
      summary: raw.analysis?.summary ?? 'No detailed analysis stored for this session.',
      suggested_exercises: [],
    };
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes('session not found')) {
      return fixtureDetailForSession(resolvedSessionId);
    }
    if (isNetworkFailure(error)) {
      return fixtureDetailForSession(resolvedSessionId);
    }
    throw error;
  }
}

export async function askSage(question: string): Promise<AskSageAnswer> {
  try {
    const raw = await fetchJson<{
      question: string;
      sql: string;
      rows: Record<string, unknown>[];
      answer_text: string;
    }>('/caregiver/ask', {
      method: 'POST',
      body: JSON.stringify({ question }),
    }, REQUEST_TIMEOUT_MS.ask);

    return {
      question: raw.question,
      sql: raw.sql,
      rows: raw.rows.map(mapAskRow),
      answer_text: raw.answer_text,
    };
  } catch (error) {
    if (!isNetworkFailure(error)) {
      throw error;
    }
    const key = question.trim().toLowerCase();
    return (
      ASK_SAGE_FIXTURE_ANSWERS[key] ?? {
        question,
        sql: '-- Sage is offline right now, so this answer is unavailable.',
        rows: [],
        answer_text: "Sage can't reach the backend right now. Try again once the local services are up.",
      }
    );
  }
}

async function fetchJson<T>(path: string, init?: RequestInit, timeoutMs: number = REQUEST_TIMEOUT_MS.sessions): Promise<T> {
  const timeoutSignal =
    typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
      ? AbortSignal.timeout(timeoutMs)
      : undefined;
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      cache: 'no-store',
      signal: init?.signal ?? timeoutSignal,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
  } catch (error) {
    throw new NetworkError(error instanceof Error ? error.message : 'Network error');
  }

  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const payload = await response.json();
      if (typeof payload?.detail === 'string') detail = payload.detail;
    } catch {
      // Ignore non-JSON error bodies.
    }
    throw new Error(detail);
  }

  return response.json() as Promise<T>;
}

function mapSessionSummary(
  raw: RawSessionSummary,
  baseline: number,
  fallbackScore?: number,
  fallbackSeverity?: string,
): SessionSummary {
  const score = Number(raw.score ?? fallbackScore ?? baseline);
  return {
    session_id: normalizeSessionId(raw.session_id),
    started_at: raw.started_at,
    duration_seconds: Number(raw.duration_seconds ?? 0),
    primary_task: raw.primary_task ?? 'Session',
    score,
    severity: normalizeSeverity(raw.severity ?? fallbackSeverity, score),
  };
}

function mapFlaggedPhrase(item: RawFlaggedPhrase) {
  const kind = (item.kind ?? '').toLowerCase();
  const label =
    kind === 'repetition' || kind === 'hesitation'
      ? kind
      : kind === 'topic_drift'
        ? 'topic-drift'
        : 'word-finding';

  return {
    phrase: item.text ?? '',
    label,
    severity: label === 'word-finding' ? 'medium' : 'low',
  } as const;
}

function mapAskRow(row: Record<string, unknown>) {
  const entries = Object.entries(row);
  const label = entries.find(([, value]) => typeof value === 'string')?.[1];
  const score = entries.find(([, value]) => typeof value === 'number')?.[1];
  return {
    date: String(label ?? 'Result'),
    score: Number(score ?? 0),
  };
}

function computeDurationSeconds(startedAt: string, endedAt?: string | null) {
  if (!endedAt) return 0;
  const start = Date.parse(startedAt);
  const end = Date.parse(endedAt);
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.max(0, Math.round((end - start) / 1000));
}

function normalizeSeverity(
  value: string | null | undefined,
  score: number,
): Overview['latest_session']['severity'] {
  if (value === 'ok' || value === 'watch' || value === 'attention' || value === 'follow-up') {
    return value;
  }
  if (score >= 85) return 'ok';
  if (score >= 70) return 'watch';
  if (score >= 50) return 'attention';
  return 'follow-up';
}

function fallbackFromNetwork<T>(error: unknown, fallback: T): T {
  if (isNetworkFailure(error)) return fallback;
  throw error;
}

function fixtureDetailForSession(sessionId: string): SessionDetail | null {
  const normalizedSessionId = normalizeSessionId(sessionId);
  if (normalizedSessionId === LATEST_DETAIL.session_id) return LATEST_DETAIL;

  const session = SESSIONS.find((item) => normalizeSessionId(item.session_id) === normalizedSessionId);
  if (!session) return null;

  return {
    session_id: session.session_id,
    started_at: session.started_at,
    duration_seconds: session.duration_seconds,
    primary_task: session.primary_task,
    score: session.score,
    severity: session.severity,
    baseline_delta: session.score - OVERVIEW.baseline,
    metrics: {
      lexical_diversity: Number((0.52 + (session.score % 10) * 0.01).toFixed(2)),
      repetition_count: Math.max(0, 4 - Math.floor((session.score - 50) / 10)),
      hesitation_count: Math.max(1, 7 - Math.floor((session.score - 45) / 8)),
      topic_drift_count: session.score >= 80 ? 0 : 1,
    },
    flagged_phrases: [],
    transcript: [
      {
        speaker: 'eleanor',
        text: `I wanted help with ${session.primary_task.toLowerCase()}.`,
        ts: session.started_at,
      },
      {
        speaker: 'sage',
        text: 'I helped walk through it and noted the key moments for the caregiver view.',
        ts: session.started_at,
      },
    ],
    summary:
      'Detailed transcript data is unavailable right now, so this card is showing the saved session summary instead.',
    suggested_exercises: [],
  };
}

function isNetworkFailure(error: unknown) {
  return error instanceof NetworkError;
}

function normalizeSessionId(value: string) {
  let sessionId = value;
  for (let i = 0; i < 3; i += 1) {
    try {
      const decoded = decodeURIComponent(sessionId);
      if (decoded === sessionId) break;
      sessionId = decoded;
    } catch {
      break;
    }
  }
  return sessionId;
}

class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}
