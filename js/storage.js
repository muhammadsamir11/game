import { isValidBrick } from './bricks.js';

export const GARAGE_KEY = 'brickRacers.garage.v1';
const MAX_NAME = 24;

function defaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null; // some private-browsing modes throw just for touching localStorage
  }
}

function isValidCar(car) {
  return !!car && typeof car.id === 'string' && typeof car.name === 'string'
    && Array.isArray(car.bricks) && car.bricks.length > 0 && car.bricks.every(isValidBrick);
}

function load(storage) {
  try {
    const data = JSON.parse(storage?.getItem(GARAGE_KEY) ?? '[]');
    return Array.isArray(data) ? data.filter(isValidCar) : [];
  } catch {
    return [];
  }
}

const copy = car => ({ ...car, bricks: car.bricks.map(b => ({ ...b })) });
const newId = () => `car-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export function createGarage(storage = defaultStorage()) {
  let cars = load(storage);

  function persist() {
    try {
      storage?.setItem(GARAGE_KEY, JSON.stringify(cars));
    } catch {
      // Storage is full or blocked: keep the cars in memory for this visit.
    }
  }

  return {
    list: () => cars.map(copy),
    get: id => {
      const car = cars.find(c => c.id === id);
      return car ? copy(car) : null;
    },
    save({ id, name, bricks }) {
      const saved = {
        id: id ?? newId(),
        name: String(name ?? '').trim().slice(0, MAX_NAME) || 'My Car',
        bricks: bricks.map(b => ({ type: b.type, color: b.color, x: b.x, y: b.y, z: b.z, r: b.r, ...(typeof b.rider === 'string' ? { rider: b.rider } : {}), ...(typeof b.badge === 'string' ? { badge: b.badge } : {}) })),
        updatedAt: Date.now(),
      };
      const index = cars.findIndex(c => c.id === saved.id);
      if (index >= 0) cars[index] = saved;
      else cars.push(saved);
      persist();
      return copy(saved);
    },
    remove(id) {
      cars = cars.filter(c => c.id !== id);
      persist();
    },
  };
}
