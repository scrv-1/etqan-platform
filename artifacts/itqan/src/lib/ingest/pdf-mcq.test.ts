import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parsePdfMcqLines } from './pdf-mcq';

test('parses wrapped options locally without guessing the correct answer', () => {
  const lines = [
    { page: 1, y: 100, x: 50, textX: 50, text: 'ANSWER KEY', paragraphStart: true },
    { page: 1, y: 90, x: 50, textX: 72, text: '7.10 Springs', paragraphStart: true },
    { page: 1, y: 80, x: 50, textX: 76, text: '1. What is the safest check?', paragraphStart: true },
    { page: 1, y: 70, x: 100, textX: 100, text: 'Use the tester within the limit', paragraphStart: true },
    { page: 1, y: 60, x: 100, textX: 100, text: 'and record the result.', paragraphStart: false },
    { page: 1, y: 50, x: 100, textX: 100, text: 'Replace the spring.', paragraphStart: true },
    { page: 1, y: 40, x: 100, textX: 100, text: 'Measure only its color.', paragraphStart: true },
  ];

  const result = parsePdfMcqLines(lines);
  assert.equal(result.suggestedTopic, '7.10 Springs');
  assert.equal(result.questions.length, 1);
  assert.equal(result.questions[0].prompt, 'What is the safest check?');
  assert.deepEqual(result.questions[0].choices, [
    'Use the tester within the limit and record the result.',
    'Replace the spring.',
    'Measure only its color.',
  ]);
  assert.equal('correctChoice' in result.questions[0], false);
});

test('supports explicit option labels and does not mistake decimal headings for questions', () => {
  const lines = [
    { page: 2, y: 100, x: 40, textX: 40, text: '7.10 Springs', paragraphStart: true },
    { page: 2, y: 90, x: 40, textX: 60, text: '4. Which option is correct?', paragraphStart: true },
    { page: 2, y: 80, x: 60, textX: 60, text: 'A) First answer', paragraphStart: true },
    { page: 2, y: 70, x: 60, textX: 60, text: 'B) Second answer', paragraphStart: true },
  ];

  const result = parsePdfMcqLines(lines);
  assert.equal(result.questions.length, 1);
  assert.equal(result.questions[0].questionNumber, '4');
  assert.deepEqual(result.questions[0].choices, ['First answer', 'Second answer']);
});
