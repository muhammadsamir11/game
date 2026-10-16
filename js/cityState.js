import { GARAGE } from './cityMap.js';

export const CITY_KEY = 'brickRacers.city.v1';
export const SPOT_COUNT = GARAGE.spots.length;

const validSpot = s => Number.isInteger(s) && s >= 0 && s < SPOT_COUNT;

// Cars keep valid saved spots; the rest fill the lowest free spots in order; extras beyond SPOT_COUNT get none.
export function assignSpots(carIds, saved) {
  const previous = saved && typeof saved === 'object' ? saved : {};
  const result = {};
  const used = new Set();
  for (const id of carIds) {
    const s = previous[id];
    if (validSpot(s) && !used.has(s)) {
      result[id] = s;
      used.add(s);
    }
  }
  for (const id of carIds) {
    if (result[id] !== undefined) continue;
    let s = 0;
    while (used.has(s)) s++;
    if (s >= SPOT_COUNT) continue;
    result[id] = s;
    used.add(s);
  }
  return result;
}

function defaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function load(storage) {
  try {
    const data = JSON.parse(storage?.getItem(CITY_KEY) ?? 'null');
    return data && typeof data.spots === 'object' && data.spots ? data.spots : {};
  } catch {
    return {};
  }
}

export function createCityStore(storage = defaultStorage()) {
  let spots = load(storage);
  const persist = () => {
    try {
      storage?.setItem(CITY_KEY, JSON.stringify({ spots }));
    } catch {
      // Storage full or blocked: keep the spots for this visit.
    }
  };
  return {
    spotsFor(carIds) {
      spots = assignSpots(carIds, spots);
      persist();
      return { ...spots };
    },
    park(carId, spot) {
      if (!validSpot(spot)) return false;
      const owner = Object.keys(spots).find(id => spots[id] === spot);
      if (owner && owner !== carId) return false;
      spots[carId] = spot;
      persist();
      return true;
    },
  };
}
