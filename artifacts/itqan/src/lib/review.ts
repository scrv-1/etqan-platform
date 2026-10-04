import type { Evidence, Outcome } from './types';

// A transparent, outcome-based interval ladder. This is not an FSRS prediction model.
export const REVIEW_INTERVAL_DAYS = [1, 3, 7, 14, 30] as const;
const AGAIN_DELAY_MS = 10 * 60 * 1000;
const PARTIAL_DELAY_MS = 12 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type ReviewPlan = {
  status: 'new' | 'due' | 'scheduled';
  dueAt: Date | null;
  isDue: boolean;
  box: number;
  attempts: number;
  delayMs: number;
};

const isSuccess = (outcome: Outcome) => outcome === 'correct' || outcome === 'self-met';

/** Derives the next review from the answer history; confidence is intentionally ignored. */
export function getReviewPlan(questionId: string, evidence: Evidence[], now = Date.now()): ReviewPlan {
  const history = evidence
    .filter(e => e.questionId === questionId && Number.isFinite(Date.parse(e.createdAt)))
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id));
  if (!history.length) return { status: 'new', dueAt: null, isDue: true, box: 0, attempts: 0, delayMs: 0 };

  let box = 0;
  for (const item of history) {
    box = isSuccess(item.outcome) ? Math.min(REVIEW_INTERVAL_DAYS.length, box + 1) : 0;
  }

  const last = history[history.length - 1];
  const delayMs = last.outcome === 'incorrect' || last.outcome === 'self-missed'
    ? AGAIN_DELAY_MS
    : last.outcome === 'self-partial'
      ? PARTIAL_DELAY_MS
      : REVIEW_INTERVAL_DAYS[Math.max(0, box - 1)] * DAY_MS;
  const dueAt = new Date(Date.parse(last.createdAt) + delayMs);
  const isDue = dueAt.getTime() <= now;
  return { status: isDue ? 'due' : 'scheduled', dueAt, isDue, box, attempts: history.length, delayMs };
}