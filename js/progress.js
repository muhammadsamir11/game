// Coins and missions done, saved between visits. Coins only ever go up.
export const PROGRESS_KEY = 'brickRacers.progress.v1';

const count = v => (Number.isInteger(v) && v >= 0 ? v : 0);

function defaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function load(storage) {
  try {
    const data = JSON.parse(storage?.getItem(PROGRESS_KEY) ?? '{}');
    if (!data || typeof data !== 'object' || Array.isArray(data)) return { coins: 0, missionsDone: 0 };
    return { coins: count(data.coins), missionsDone: count(data.missionsDone) };
  } catch {
    return { coins: 0, missionsDone: 0 };
  }
}

export function createProgressStore(storage = defaultStorage()) {
  const state = load(storage);
  const persist = () => {
    try {
      storage?.setItem(PROGRESS_KEY, JSON.stringify(state));
    } catch {
      // Storage full or blocked: keep counting for this visit.
    }
  };
  return {
    get: () => ({ ...state }),
    addCoins(n) {
      if (Number.isInteger(n) && n > 0) {
        state.coins += n;
        persist();
      }
      return state.coins;
    },
    missionDone() {
      state.missionsDone += 1;
      persist();
      return state.missionsDone;
    },
  };
}
