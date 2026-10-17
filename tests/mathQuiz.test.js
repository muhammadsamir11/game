import test from 'node:test';
import assert from 'node:assert/strict';
import { makeQuestion, createQuiz, QUESTIONS_NEEDED } from '../js/mathQuiz.js';

// A repeatable stand-in for Math.random.
function seeded(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}
const many = (level, n = 400) => { const r = seeded(level * 7 + 3); return Array.from({ length: n }, () => makeQuestion(level, r)); };
const parts = q => q.text.match(/^(\d+) ([+−×÷]) (\d+) = \?$/);

test('three questions are needed', () => {
  assert.equal(QUESTIONS_NEEDED, 3);
});

test('every question reads as "a op b = ?", is said in words, and has a whole-number answer', () => {
  const words = { '+': 'plus', '−': 'minus', '×': 'times', '÷': 'divided by' };
  for (const level of [1, 2, 3]) {
    for (const q of many(level)) {
      const m = parts(q);
      assert.ok(m, q.text);
      const [, a, op, b] = m;
      assert.equal(q.say, `${a} ${words[op]} ${b}`);
      assert.ok(Number.isInteger(q.answer) && q.answer >= 0, q.text);
      const x = Number(a), y = Number(b);
      assert.equal(q.answer, { '+': x + y, '−': x - y, '×': x * y, '÷': x / y }[op], q.text);
    }
  }
});

test('level 1: adding and taking away up to 50, and the 2, 5 and 10 times tables', () => {
  const ops = new Set();
  for (const q of many(1)) {
    const [, a, op, b] = parts(q);
    ops.add(op);
    if (op === '+') assert.ok(q.answer <= 50, q.text);
    if (op === '−') assert.ok(Number(a) <= 50, q.text);
    if (op === '×') assert.ok([2, 5, 10].includes(Number(a)) || [2, 5, 10].includes(Number(b)), q.text);
    assert.notEqual(op, '÷');
  }
  assert.deepEqual([...ops].sort(), ['+', '×', '−'].sort());
});

test('level 2: up to 100 with carrying, and every times table to 10', () => {
  let carried = 0;
  for (const q of many(2)) {
    const [, a, op, b] = parts(q);
    if (op === '+') {
      assert.ok(q.answer <= 100, q.text);
      if ((Number(a) % 10) + (Number(b) % 10) >= 10) carried++;
    }
    if (op === '−') assert.ok(Number(a) <= 100, q.text);
    if (op === '×') assert.ok(Number(a) <= 10 && Number(b) <= 10, q.text);
    assert.notEqual(op, '÷');
  }
  assert.ok(carried > 10, 'plenty of sums carry');
});

test('level 3 adds dividing, always exactly, from the times tables', () => {
  const divides = many(3).filter(q => parts(q)[2] === '÷');
  assert.ok(divides.length > 40);
  for (const q of divides) {
    const [, a, , b] = parts(q);
    assert.ok(Number(b) >= 2 && Number(b) <= 10 && q.answer >= 1 && q.answer <= 10, q.text);
    assert.equal(Number(a) % Number(b), 0);
  }
});

test('three right answers finish the quiz', () => {
  const quiz = createQuiz({ level: 1, random: seeded(5) });
  for (let i = 1; i <= 3; i++) {
    const result = quiz.answer(quiz.question.answer);
    assert.equal(result, i < 3 ? 'right' : 'done');
    assert.equal(quiz.stars, i);
  }
});

test('a wrong answer means try again; a second miss shows the answer and moves on without a star', () => {
  const quiz = createQuiz({ level: 2, random: seeded(9) });
  const first = quiz.question;
  assert.equal(quiz.answer(first.answer + 1), 'tryAgain');
  assert.equal(quiz.question, first);
  assert.equal(quiz.answer(first.answer + 2), 'shown');
  assert.equal(quiz.stars, 0);
  assert.notEqual(quiz.question, first);
  assert.equal(quiz.answer(quiz.question.answer), 'right');
  assert.equal(quiz.stars, 1);
});

test('no question repeats within one quiz', () => {
  const quiz = createQuiz({ level: 1, random: seeded(2) });
  const seen = new Set([quiz.question.text]);
  for (let i = 0; i < 12; i++) {
    quiz.answer(-1);
    quiz.answer(-1);
    assert.ok(!seen.has(quiz.question.text), quiz.question.text);
    seen.add(quiz.question.text);
  }
});

test('levels past 3 ask level 3 questions', () => {
  const q = makeQuestion(9, seeded(4));
  assert.ok(parts(q));
});
