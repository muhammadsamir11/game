// Math questions for the showroom's mystery cars, for a 9-year-old: three right answers uncover the car.
// Each car's level makes them a little harder. Questions read as "7 × 8 = ?" and are said in words.

export const QUESTIONS_NEEDED = 3;

const between = (random, lo, hi) => lo + Math.floor(random() * (hi - lo + 1));
const pick = (random, list) => list[Math.floor(random() * list.length)];
const WORDS = { '+': 'plus', '−': 'minus', '×': 'times', '÷': 'divided by' };
const ask = (a, op, b, answer) => ({ text: `${a} ${op} ${b} = ?`, say: `${a} ${WORDS[op]} ${b}`, answer });

const KINDS = {
  // Level 1: adding and taking away up to 50; the 2, 5 and 10 times tables.
  add50: r => { const a = between(r, 1, 49); const b = between(r, 1, 50 - a); return ask(a, '+', b, a + b); },
  take50: r => { const a = between(r, 2, 50); const b = between(r, 1, a); return ask(a, '−', b, a - b); },
  easyTimes: r => {
    const t = pick(r, [2, 5, 10]);
    const n = between(r, 1, 10);
    return r() < 0.5 ? ask(t, '×', n, t * n) : ask(n, '×', t, t * n);
  },
  // Level 2: two-digit sums up to 100 (often carrying), taking away from up to 100, every table to 10.
  add100: r => { const a = between(r, 10, 89); const b = between(r, 10, 100 - a); return ask(a, '+', b, a + b); },
  take100: r => { const a = between(r, 20, 100); const b = between(r, 1, a); return ask(a, '−', b, a - b); },
  times: r => { const a = between(r, 2, 10); const b = between(r, 1, 10); return ask(a, '×', b, a * b); },
  // Level 3: dividing, always exactly, straight from the times tables.
  divide: r => { const b = between(r, 2, 10); const answer = between(r, 1, 10); return ask(b * answer, '÷', b, answer); },
};
const LEVELS = [
  ['add50', 'take50', 'easyTimes'],
  ['add100', 'take100', 'times'],
  ['add100', 'take100', 'times', 'divide'],
];

export function makeQuestion(level, random = Math.random) {
  const kinds = LEVELS[Math.min(Math.max(level, 1), LEVELS.length) - 1];
  return KINDS[pick(random, kinds)](random);
}

// One go at a mystery: right answers earn stars; a miss means try again, and a second miss shows the
// answer and moves on to a new question (no star, no penalty). No question comes up twice in one go.
export function createQuiz({ level, needed = QUESTIONS_NEEDED, random = Math.random }) {
  const asked = new Set();
  const fresh = () => {
    let q = makeQuestion(level, random);
    for (let tries = 0; asked.has(q.text) && tries < 50; tries++) q = makeQuestion(level, random);
    asked.add(q.text);
    return q;
  };
  let question = fresh();
  let misses = 0;
  let stars = 0;
  return {
    get question() { return question; },
    get stars() { return stars; },
    needed,
    // 'right', 'done' (the last star), 'tryAgain' (same question) or 'shown' (here's a new one).
    answer(n) {
      if (n === question.answer) {
        stars++;
        misses = 0;
        if (stars >= needed) return 'done';
        question = fresh();
        return 'right';
      }
      if (++misses < 2) return 'tryAgain';
      misses = 0;
      question = fresh();
      return 'shown';
    },
  };
}
