/** Fixture cognitive analysis data — used until the backend `/caregiver/trend`
 *  endpoint comes online. Shape matches what backend will return. */

export type SeverityTier = 'ok' | 'watch' | 'attention' | 'follow-up';

export type CognitiveTrendPoint = {
  date: string;          // ISO yyyy-mm-dd
  score: number;         // 0..100, higher is better
  severity: SeverityTier;
};

export type CognitiveOverview = {
  today: {
    score: number;
    severity: SeverityTier;
    baseline_delta: number;   // negative = down vs baseline (concerning)
    baseline: number;
  };
  trend: CognitiveTrendPoint[];
};

function severityFor(score: number): SeverityTier {
  if (score >= 85) return 'ok';
  if (score >= 70) return 'watch';
  if (score >= 50) return 'attention';
  return 'follow-up';
}

// 30 days of mildly downward-drifting scores with one outlier dip at day -5.
const RAW_SCORES = [
  88, 86, 87, 85, 84, 82, 83, 85, 84, 81,
  82, 80, 79, 78, 80, 77, 76, 78, 75, 76,
  74, 73, 75, 73, 64, 71, 73, 75, 76, 78,
];

const TODAY = new Date('2026-04-25T09:42:00');

function dayBefore(n: number): string {
  const d = new Date(TODAY);
  d.setDate(d.getDate() - (29 - n));
  return d.toISOString().slice(0, 10);
}

export const COGNITIVE_FIXTURE: CognitiveOverview = {
  today: {
    score: RAW_SCORES[RAW_SCORES.length - 1],
    severity: severityFor(RAW_SCORES[RAW_SCORES.length - 1]),
    baseline: 82,
    baseline_delta: RAW_SCORES[RAW_SCORES.length - 1] - 82,
  },
  trend: RAW_SCORES.map((score, i) => ({
    date: dayBefore(i),
    score,
    severity: severityFor(score),
  })),
};
