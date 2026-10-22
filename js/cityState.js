import { GARAGE, TRUCK_YARD } from './cityMap.js';
import { buildKind } from './bricks.js';

export const CITY_KEY = 'brickRacers.city.v1';
export const SPOT_COUNT = GARAGE.spots.length;
// The Truck Yard's bays, by what parks in them.
const BAY_COUNTS = { truck: TRUCK_YARD.truckBays.length, trailer: TRUCK_YARD.trailerBays.length };

// The builds that live in the garage: cars only (trucks and trailers park in the Truck Yard).
export const garageCarIds = builds => builds.filter(b => buildKind(b.bricks) === 'car').map(b => b.id);

const validIn = count => s => Number.isInteger(s) && s >= 0 && s < count;
const validSpot = validIn(SPOT_COUNT);

// Cars keep valid saved spots; the rest fill the lowest free spots in order; extras beyond count get none.
export function assignSpots(carIds, saved, count = SPOT_COUNT) {
  const valid = validIn(count);
  const previous = saved && typeof saved === 'object' ? saved : {};
  const result = {};
  const used = new Set();
  for (const id of carIds) {
    const s = previous[id];
    if (valid(s) && !used.has(s)) {
      result[id] = s;
      used.add(s);
    }
  }
  for (const id of carIds) {
    if (result[id] !== undefined) continue;
    let s = 0;
    while (used.has(s)) s++;
    if (s >= count) continue;
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

const objectOr = v => (v && typeof v === 'object' ? v : {});

// { spots, truckBays, trailerBays }; an older save has only spots.
function load(storage) {
  try {
    const data = objectOr(JSON.parse(storage?.getItem(CITY_KEY) ?? 'null'));
    return { spots: objectOr(data.spots), truckBays: objectOr(data.truckBays), trailerBays: objectOr(data.trailerBays) };
  } catch {
    return { spots: {}, truckBays: {}, trailerBays: {} };
  }
}

export function createCityStore(storage = defaultStorage()) {
  const saved = load(storage);
  let { spots } = saved;
  const bays = { truck: saved.truckBays, trailer: saved.trailerBays };
  const persist = () => {
    try {
      storage?.setItem(CITY_KEY, JSON.stringify({ spots, truckBays: bays.truck, trailerBays: bays.trailer }));
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
    // kind: 'truck' or 'trailer'. The same rules as the garage's spots, in the Truck Yard's bays.
    baysFor(kind, ids) {
      bays[kind] = assignSpots(ids, bays[kind], BAY_COUNTS[kind]);
      persist();
      return { ...bays[kind] };
    },
    parkInBay(kind, id, bay) {
      if (!validIn(BAY_COUNTS[kind])(bay)) return false;
      const owner = Object.keys(bays[kind]).find(other => bays[kind][other] === bay);
      if (owner && owner !== id) return false;
      bays[kind][id] = bay;
      persist();
      return true;
    },
  };
}
