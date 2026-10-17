// The showroom's mystery cars: which ones he has uncovered, and the coin goal for the next one. Saved on
// the tablet. Coins are only ever compared, never spent: the goal counts the coins added to his pile since
// the current mystery appeared (the first time he opened the city, or the last reveal).
import { PRIZE_CARS } from './prizeCars.js';

export const SHOWROOM_KEY = 'brickRacers.showroom.v1';

function defaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
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
    startCoins: data.startCoins,
    unlocked,
    driven: listed(data.driven).filter(k => unlocked.includes(k)),
    starsSeen: data.starsSeen === true,
  };
}

function load(storage, lineup) {
  try {
    const data = JSON.parse(storage?.getItem(SHOWROOM_KEY) ?? 'null');
    if (!data || typeof data !== 'object' || Array.isArray(data) || !Number.isInteger(data.startCoins)) return null;
    return tidy(data, lineup);
  } catch {
    return null;
  }
}

export function createShowroomStore(storage = defaultStorage(), { coinsNow = 0, lineup = PRIZE_CARS } = {}) {
  const persist = () => {
    try {
      storage?.setItem(SHOWROOM_KEY, JSON.stringify(state));
    } catch {
      // Storage full or blocked: keep the showroom going for this visit.
    }
  };
  let state = load(storage, lineup);
  if (!state) {
    state = { startCoins: coinsNow, unlocked: [], driven: [], starsSeen: false };
    persist(); // so the first mystery keeps counting from today
  }
  const nextCar = () => lineup[state.unlocked.length] ?? null;

  function status(coins) {
    const car = nextCar();
    if (!car) return { mode: lineup.at(-1)?.finale ? 'done' : 'soon', next: null, have: 0, goal: 0 };
    const have = Math.min(car.goal, Math.max(0, coins - state.startCoins));
    return { mode: have >= car.goal ? 'ready' : 'mystery', next: car.key, have, goal: car.goal };
  }

  return {
    get: () => ({ ...state, unlocked: [...state.unlocked], driven: [...state.driven] }),
    status,
    // Uncovers the next car if its goal is reached, and saves straight away: the reveal is only for show.
    reveal(coins) {
      const s = status(coins);
      if (s.mode !== 'ready') return null;
      state.unlocked.push(s.next);
      state.startCoins = coins;
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
    // For grown-ups testing on the iPad: make the current goal reached without touching his coins (so the
    // count may start below zero).
    debugReady(coins) {
      const car = nextCar();
      if (!car) return;
      state.startCoins = coins - car.goal;
      persist();
    },
  };
}

// The reveal starts only in front of the turntable, with the goal reached, standing (or parked) still,
// and with no pizza mission or room game going on.
export function shouldStartReveal({ mode, inZone, speed, busy }) {
  return mode === 'ready' && inZone && speed < 1 && !busy;
}
