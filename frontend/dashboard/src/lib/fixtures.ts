/**
 * Fixture data for the caregiver dashboard.
 * Shapes match the backend endpoints in PLAN_A_BACKEND.md §B19.
 * When backend lands, swap fixture imports for fetch calls in `api.ts`.
 */

export type Severity = 'ok' | 'watch' | 'attention' | 'follow-up';

export type Patient = {
  patient_id: string;
  name: string;
  age: number;
  city: string;
  caregiver_name: string;
  active_since: string;
};

export type SessionSummary = {
  session_id: string;
  started_at: string;        // ISO
  duration_seconds: number;
  primary_task: string;
  score: number;
  severity: Severity;
};

export type Overview = {
  patient: Patient;
  latest_session: SessionSummary;
  baseline: number;
  baseline_delta: number;
  summary_text: string;
};

export type TrendPoint = {
  date: string;              // yyyy-mm-dd
  score: number;
  severity: Severity;
};

export type FlaggedPhrase = {
  phrase: string;
  label: 'word-finding' | 'repetition' | 'hesitation' | 'topic-drift';
  severity: 'low' | 'medium' | 'high';
};

export type SessionDetail = {
  session_id: string;
  started_at: string;
  duration_seconds: number;
  primary_task: string;
  score: number;
  severity: Severity;
  baseline_delta: number;
  metrics: {
    lexical_diversity: number;
    repetition_count: number;
    hesitation_count: number;
    topic_drift_count: number;
  };
  flagged_phrases: FlaggedPhrase[];
  transcript: { speaker: 'eleanor' | 'sage'; text: string; ts: string }[];
  summary: string;
  suggested_exercises: string[];
};

export type AskSageAnswer = {
  question: string;
  sql: string;
  rows: { date: string; score: number }[];
  answer_text: string;
};

// ─── data ────────────────────────────────────────────────────────────────

function severityFor(score: number): Severity {
  if (score >= 85) return 'ok';
  if (score >= 70) return 'watch';
  if (score >= 50) return 'attention';
  return 'follow-up';
}

const TODAY = new Date('2026-04-25T09:42:00');
const isoDay = (offset: number) => {
  const d = new Date(TODAY);
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

export const PATIENT: Patient = {
  patient_id: 'p_eleanor',
  name: 'Eleanor Hayes',
  age: 78,
  city: 'Boston, MA',
  caregiver_name: 'Sarah Hayes',
  active_since: '2026-04-08',
};

const RAW_SCORES = [
  88, 86, 87, 85, 84, 82, 83, 85, 84, 81,
  82, 80, 79, 78, 80, 77, 76, 78, 75, 76,
  74, 73, 75, 73, 64, 71, 73, 75, 76, 78,
];

export const TREND: TrendPoint[] = RAW_SCORES.map((score, i) => ({
  date: isoDay(i - 29),
  score,
  severity: severityFor(score),
}));

const TASKS = [
  'Pill organizer reorder',
  'Doctor appointment lookup',
  'Pharmacy refill request',
  'Reminder set: medication',
  'Address verification',
  'Magnifying reader order',
  'Calendar review',
  'Pill organizer reorder',
  'Doctor appointment lookup',
  'Reminder set: walk',
];

export const SESSIONS: SessionSummary[] = TREND.slice()
  .reverse()
  .slice(0, 12)
  .map((p, i) => {
    const date = new Date(p.date + 'T09:42:00');
    return {
      session_id: `s_${p.date.replace(/-/g, '')}_${i}`,
      started_at: date.toISOString(),
      duration_seconds: 60 + Math.floor(Math.random() * 180),
      primary_task: TASKS[i % TASKS.length],
      score: p.score,
      severity: p.severity,
    };
  });

export const OVERVIEW: Overview = {
  patient: PATIENT,
  latest_session: SESSIONS[0],
  baseline: 82,
  baseline_delta: SESSIONS[0].score - 82,
  summary_text:
    'Eleanor completed today\'s session successfully. Her pace was slightly slower than the past week, with one word-finding moment around the medication name. Nothing concerning — worth a gentle follow-up.',
};

// ─── per-session detail (only the latest is fully populated; others stub) ──

export const LATEST_DETAIL: SessionDetail = {
  session_id: SESSIONS[0].session_id,
  started_at: SESSIONS[0].started_at,
  duration_seconds: SESSIONS[0].duration_seconds,
  primary_task: SESSIONS[0].primary_task,
  score: SESSIONS[0].score,
  severity: SESSIONS[0].severity,
  baseline_delta: SESSIONS[0].score - 82,
  metrics: {
    lexical_diversity: 0.61,
    repetition_count: 2,
    hesitation_count: 5,
    topic_drift_count: 1,
  },
  flagged_phrases: [
    { phrase: 'the blood pressure one', label: 'word-finding', severity: 'medium' },
    { phrase: 'the thing I take in the morning', label: 'word-finding', severity: 'low' },
    { phrase: 'I already said that', label: 'repetition', severity: 'low' },
  ],
  transcript: [
    { speaker: 'eleanor', text: 'I need one of those weekly pill organizers, and I keep forgetting which one I got last time.', ts: '2026-04-25T09:42:08' },
    { speaker: 'sage',    text: 'I found the weekly pill organizer you usually get. I\'ll place it now.', ts: '2026-04-25T09:42:24' },
    { speaker: 'eleanor', text: 'Oh good. And the blood pressure one — the thing I take in the morning — is that running low?', ts: '2026-04-25T09:42:48' },
    { speaker: 'sage',    text: 'I\'ll check with the pharmacy now and tell you what we find.', ts: '2026-04-25T09:43:02' },
    { speaker: 'eleanor', text: 'I already said that. I just want to know if I have enough until Thursday.', ts: '2026-04-25T09:43:24' },
    { speaker: 'sage',    text: 'You have enough until Friday. I\'ll set a reminder for Wednesday to refill.', ts: '2026-04-25T09:43:48' },
  ],
  summary:
    'Eleanor completed today\'s session successfully. She showed two word-finding moments around medication names and one mild repetition. Pace and clarity were within her recent range.',
  suggested_exercises: [
    'Try a simple naming game later this week — point to objects together.',
    'Listen for repeated medication questions over the next few sessions.',
  ],
};

export const ASK_SAGE_FIXTURE_ANSWERS: Record<string, AskSageAnswer> = {
  'what changed in today\'s session compared to the last three?': {
    question: "What changed in today's session compared to the last three?",
    sql: `SELECT
  TO_CHAR(analyzed_at, 'Mon DD') AS day,
  overall_score,
  severity
FROM cognitive_analyses
WHERE patient_id = 'p_eleanor'
  AND analyzed_at >= DATEADD(day, -4, CURRENT_DATE)
ORDER BY analyzed_at;`,
    rows: [
      { date: 'Apr 22', score: 73 },
      { date: 'Apr 23', score: 75 },
      { date: 'Apr 24', score: 76 },
      { date: 'Apr 25', score: 78 },
    ],
    answer_text:
      'Today is slightly stronger than the past three sessions — score of 78 vs an average of 74.7 over the prior three days. Word-finding came up briefly but pace and self-correction were within range.',
  },
  'how has her word-finding changed this month?': {
    question: 'How has her word-finding changed this month?',
    sql: `SELECT
  TO_CHAR(analyzed_at, 'YYYY-MM-DD') AS day,
  ARRAY_SIZE(flagged_phrases) AS word_find_count
FROM cognitive_analyses
WHERE patient_id = 'p_eleanor'
  AND analyzed_at >= DATEADD(day, -30, CURRENT_DATE)
ORDER BY day;`,
    rows: [
      { date: 'Wk 1', score: 1 },
      { date: 'Wk 2', score: 2 },
      { date: 'Wk 3', score: 3 },
      { date: 'Wk 4', score: 2 },
    ],
    answer_text:
      'Word-finding moments have averaged about two per session this month, slightly up from one per session last month. Today had two moments around medication names — consistent with the recent trend, not an outlier.',
  },
  'was today different from her baseline?': {
    question: 'Was today different from her baseline?',
    sql: `SELECT
  overall_score,
  baseline_delta
FROM cognitive_analyses
WHERE session_id = (
  SELECT session_id FROM sessions
  WHERE patient_id = 'p_eleanor'
  ORDER BY started_at DESC LIMIT 1
);`,
    rows: [{ date: 'Today', score: 78 }],
    answer_text:
      'Today\'s score is 78, four below her baseline of 82. Within her normal range — slightly under, not concerning.',
  },
};
