// The showroom's mystery cars: which ones he has uncovered, and whether today's is still to win. Three
// right math answers (mathQuiz.js) uncover a car, and the next one waits until the next calendar day on the
// tablet. Saved on the tablet. (Older saves also hold startCoins, from when coins were the goal: ignored.)
import { PRIZE_CARS, prizeByKey, prizeBricks } from './prizeCars.js';

export const SHOWROOM_KEY = 'brickRacers.showroom.v1';

function defaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

// The tablet's calendar day, e.g. '2026-10-17', in its own time zone (so "tomorrow" starts at his midnight).
export function localDay(date = new Date()) {
  const two = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
}

// Known keys only, in lineup order, each once; unlocked cars must be the first ones in the lineup.
function tidy(data, lineup) {
  const keys = lineup.map(c => c.key);
  const listed = v => (Array.isArray(v) ? keys.filter(k => v.includes(k)) : []);
  const unlocked = [];
  for (const k of listed(data.unlocked)) {
    if (k !== keys[unlocked.length]) break;
    unlocked.push(k);
  }
  return {
    unlocked,
    driven: listed(data.driven).filter(k => unlocked.includes(k)),
    starsSeen: data.starsSeen === true,
    lastWinDay: typeof data.lastWinDay === 'string' ? data.lastWinDay : null,
  };
}

function load(storage, lineup) {
  try {
    const data = JSON.parse(storage?.getItem(SHOWROOM_KEY) ?? 'null');
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    return tidy(data, lineup);
  } catch {
    return null;
  }
}

export function createShowroomStore(storage = defaultStorage(), { lineup = PRIZE_CARS, today = () => localDay() } = {}) {
  const persist = () => {
    try {
      storage?.setItem(SHOWROOM_KEY, JSON.stringify(state));
    } catch {
      // Storage full or blocked: keep the showroom going for this visit.
    }
  };
  const state = load(storage, lineup) ?? { unlocked: [], driven: [], starsSeen: false, lastWinDay: null };
  const nextCar = () => lineup[state.unlocked.length] ?? null;

  // 'quiz': today's mystery is waiting for its questions. 'tomorrow': one was won today, the next waits.
  // 'soon' / 'done': no car left (more coming in a later version / that was the very last).
  function status() {
    const car = nextCar();
    if (!car) return { mode: lineup.at(-1)?.finale ? 'done' : 'soon', next: null, level: 0 };
    return { mode: state.lastWinDay === today() ? 'tomorrow' : 'quiz', next: car.key, level: car.level };
  }

  return {
    get: () => ({ ...state, unlocked: [...state.unlocked], driven: [...state.driven] }),
    status,
    // Uncovers today's car (once its questions are answered) and saves straight away: the reveal is only for show.
    reveal() {
      const s = status();
      if (s.mode !== 'quiz') return null;
      state.unlocked.push(s.next);
      state.lastWinDay = today();
      persist();
      return s.next;
    },
    markDriven(key) {
      if (!state.unlocked.includes(key) || state.driven.includes(key)) return;
      state.driven.push(key);
      persist();
    },
    seeStars() {
      state.starsSeen = true;
      persist();
    },
    // For grown-ups testing on the iPad: no waiting for tomorrow.
    debugReady() {
      state.lastWinDay = null;
      persist();
    },
  };
}

// The questions can start in front of the turntable, standing (or parked) still, with no pizza mission or
// room game going on.
export function canStartQuiz({ mode, inZone, speed, busy }) {
  return mode === 'quiz' && inZone && speed < 1 && !busy;
}

// A prize car ready for garage.save().
export function prizeCarFor(key) {
  const car = prizeByKey(key);
  return car ? { name: car.name, bricks: prizeBricks(key), prize: key } : null;
}

// Unlocked prize cars that aren't in his garage any more (so the city can put them back).
export function missingPrizes(cars, unlocked) {
  return unlocked.filter(key => !cars.some(c => c.prize === key));
}

// Prize cars saved from an older recipe (prize cars can't be changed, so any difference is the recipe's).
const brickKey = b => `${b.type}:${b.color}:${b.x}:${b.y}:${b.z}:${b.r}:${b.badge ?? ''}`;
export function stalePrizes(cars) {
  return cars.filter(c => c.prize && prizeByKey(c.prize)
    && c.bricks.map(brickKey).join('|') !== prizeBricks(c.prize).map(brickKey).join('|'));
}

// What to show and say once the reveal is over: where the new car went (where: 'garage', 'showroom' or 'cars').
export function deliveryNote(name, where, spot = 0) {
  if (where === 'garage') return { text: `🎀 Your ${name} is in the garage, spot ${spot + 1}!`, say: "It's in your garage!" };
  if (where === 'showroom') return { text: `🎀 Your ${name} is waiting at the showroom!`, say: "It's waiting outside the showroom!" };
  return { text: `🎀 Your ${name} is in 🚗 My cars!`, say: "It's in My cars!" };
}
