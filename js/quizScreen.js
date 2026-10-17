// The showroom's math questions: three stars to win, a big number pad, and every question read out loud.
// onDone: all three right. onQuit: he stopped (✕); the stars start again next time.
import { el, openModal } from './ui.js';
import { createQuiz } from './mathQuiz.js';
import { sfx, speak } from './audio.js';

const MAX_DIGITS = 3;

export function openQuiz({ level, onDone, onQuit }) {
  const quiz = createQuiz({ level });
  let typed = '';
  let busy = false; // between answers: the pad rests while he hears how it went
  let finished = false;

  const stars = el('div', { class: 'quiz-stars', 'aria-label': 'Stars' });
  const question = el('div', { class: 'quiz-question' });
  const answer = el('div', { class: 'quiz-answer' });
  const feedback = el('div', { class: 'quiz-feedback' });
  const hear = el('button', { class: 'icon-btn quiz-hear', 'aria-label': 'Hear it again', text: '🔊', onclick: () => sayQuestion() });
  const key = (label, value, kind = '') => el('button', { class: `brk quiz-key ${kind}`, 'data-key': value, 'aria-label': value === 'back' ? 'Rub out' : value === 'ok' ? 'Check' : label, text: label });
  const pad = el('div', { class: 'quiz-pad' }, [
    ...['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => key(d, d)),
    key('⌫', 'back', 'c-yellow'),
    key('0', '0'),
    key('✓', 'ok', 'c-green'),
  ]);

  const close = openModal({
    className: 'quiz',
    body: [
      el('button', { class: 'icon-btn modal-close', 'aria-label': 'Stop', text: '✕', onclick: () => quit() }),
      el('div', { class: 'quiz-body' }, [
        el('div', { class: 'quiz-left' }, [
          el('div', { class: 'quiz-title', text: '🧮 Math time!' }),
          stars,
          el('div', { class: 'quiz-sum' }, [question, hear]),
          answer,
          feedback,
        ]),
        pad,
      ]),
    ],
  });

  function render() {
    stars.replaceChildren(...Array.from({ length: quiz.needed }, (_, i) => el('span', { class: i < quiz.stars ? 'on' : '', text: '⭐' })));
    question.textContent = quiz.question.text.replace(' = ?', ' =');
    answer.textContent = typed || '?';
    answer.classList.toggle('empty', !typed);
  }
  const sayQuestion = () => speak(`What is ${quiz.question.say}?`);
  const tell = (text, kind) => {
    feedback.textContent = text;
    feedback.className = `quiz-feedback ${kind}`;
  };

  function press(value) {
    if (busy || finished) return;
    if (value === 'back') typed = typed.slice(0, -1);
    else if (value === 'ok') return check();
    else if (typed.length < MAX_DIGITS) typed = (typed + value).replace(/^0+(?=\d)/, '');
    sfx.snap();
    render();
  }

  function check() {
    if (!typed) return;
    const asked = quiz.question;
    const result = quiz.answer(Number(typed));
    typed = '';
    if (result === 'tryAgain') {
      sfx.wrong();
      tell('Not quite — try again!', 'miss');
      speak('Not quite. Try again!');
      render();
      return;
    }
    busy = true;
    if (result === 'shown') {
      sfx.wrong();
      tell(`It's ${asked.answer}! Here's a new one.`, 'miss');
      answer.textContent = String(asked.answer);
      speak(`It's ${asked.answer}. Here's a new one.`);
      setTimeout(next, 2200);
      return;
    }
    sfx.bigCoin();
    render();
    answer.textContent = String(asked.answer);
    if (result === 'done') {
      finished = true;
      tell('🎉 Three stars!', 'right');
      speak('Three stars! Let\'s see what it is!');
      setTimeout(() => {
        stop();
        onDone();
      }, 1600);
      return;
    }
    tell('✅ Yes!', 'right');
    speak('Yes!');
    setTimeout(next, 900);
  }

  function next() {
    if (finished) return;
    busy = false;
    tell('', '');
    render();
    sayQuestion();
  }

  const onPad = ev => {
    const k = ev.target.closest('[data-key]')?.dataset.key;
    if (k) press(k);
  };
  const onKey = ev => {
    if (/^[0-9]$/.test(ev.key)) press(ev.key);
    else if (ev.key === 'Backspace') press('back');
    else if (ev.key === 'Enter') press('ok');
    else if (ev.key === 'Escape') quit();
    else return;
    ev.preventDefault();
    ev.stopPropagation();
  };
  pad.addEventListener('pointerdown', onPad);
  window.addEventListener('keydown', onKey, true);
  function stop() {
    finished = true;
    window.removeEventListener('keydown', onKey, true);
    close();
  }
  function quit() {
    if (finished) return;
    stop();
    onQuit();
  }

  render();
  sayQuestion();
  return { close: quit };
}
