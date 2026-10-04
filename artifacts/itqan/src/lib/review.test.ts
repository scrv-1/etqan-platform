import assert from 'node:assert/strict';
import { getReviewPlan, REVIEW_INTERVAL_DAYS } from './review';
import { createSeed } from './seed';
import { validateWorkspaceShape } from './validate';
import type { Evidence, Outcome } from './types';

const start = Date.parse('2026-10-01T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const AGAIN_DELAY_MS = 10 * 60 * 1000;
function item(questionId: string, outcome: Outcome, at: number, confidence = 1): Evidence {
  return {
    id: `${questionId}-${at}`, questionId, conceptId: 'concept', sourceId: 'source',
    snapshot: { prompt: 'prompt', kind: 'mcq', choices: ['a', 'b'], correctChoice: 0, answer: 'a', rubric: '', conceptTitle: 'concept', sourceTitle: 'source', location: 'page 1', citation: null },
    activity: 'mcq', outcome, confidence, assisted: false, durationMs: 1000, createdAt: new Date(at).toISOString(),
  };
}

assert.equal(getReviewPlan('q-new', [], start).status, 'new');
assert.equal(getReviewPlan('q-new', [], start).isDue, true);

const firstGood = item('q-good', 'correct', start, 1);
const nextDay = getReviewPlan('q-good', [firstGood], start + DAY);
assert.equal(nextDay.box, 1);
assert.equal(nextDay.dueAt?.getTime(), start + DAY);
assert.equal(nextDay.isDue, true);
assert.equal(getReviewPlan('q-good', [item('q-good', 'correct', start, 4)], start + 1).dueAt?.getTime(), nextDay.dueAt?.getTime(), 'confidence must not change scheduling');

const twoGood = [firstGood, item('q-good', 'self-met', start + DAY, 4)];
const thirdReview = getReviewPlan('q-good', twoGood, start + DAY + 1);
assert.equal(thirdReview.box, 2);
assert.equal(thirdReview.dueAt?.getTime(), start + DAY + REVIEW_INTERVAL_DAYS[1] * DAY);

const partial = getReviewPlan('q-partial', [item('q-partial', 'self-partial', start)], start + 1);
assert.equal(partial.dueAt?.getTime(), start + 12 * 60 * 60 * 1000);
assert.equal(partial.isDue, false);
const missed = getReviewPlan('q-missed', [item('q-missed', 'incorrect', start)], start + 11 * 60 * 1000);
assert.equal(missed.isDue, true);
assert.equal(missed.box, 0);

const resetAfterMiss = getReviewPlan('q-reset', [item('q-reset', 'correct', start), item('q-reset', 'self-missed', start + DAY), item('q-reset', 'correct', start + DAY + 10 * 60 * 1000)], start + 2 * DAY);
assert.equal(resetAfterMiss.box, 1);
assert.equal(resetAfterMiss.dueAt?.getTime(), start + DAY + AGAIN_DELAY_MS + DAY);
assert.equal(getReviewPlan('q-future', [item('q-future', 'correct', start)], start).status, 'scheduled');

const workspace = createSeed();
assert.ok(workspace.questions[0], 'sample workspace has a question for the validation regression');
workspace.evidence.push(item(workspace.questions[0].id, 'correct', start, 5));
assert.deepEqual(validateWorkspaceShape(workspace), [], 'the visible five-point confidence scale must survive reload validation');

console.log('review schedule checks passed');