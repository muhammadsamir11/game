import { normaliseFigure } from './figures.js';

export const FIGURES_KEY = 'brickRacers.figures.v1';

function defaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

const newId = () => `fig-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const isObject = v => !!v && typeof v === 'object' && !Array.isArray(v);

function load(storage) {
  try {
    const data = JSON.parse(storage?.getItem(FIGURES_KEY) ?? 'null');
    if (!isObject(data)) return { main: null, friends: [] };
    const main = isObject(data.main) ? { ...normaliseFigure(data.main, 'Me'), id: 'main' } : null;
    const friends = Array.isArray(data.friends)
      ? data.friends.filter(isObject).map(f => ({ ...normaliseFigure(f, 'Friend'), id: typeof f.id === 'string' && f.id !== 'main' ? f.id : newId() }))
      : [];
    return { main, friends };
  } catch {
    return { main: null, friends: [] };
  }
}

const copy = f => (f ? { ...f } : null);

export function createFigureStore(storage = defaultStorage()) {
  const data = load(storage);

  function persist() {
    try {
      storage?.setItem(FIGURES_KEY, JSON.stringify(data));
    } catch {
      // Storage is full or blocked: keep the figures in memory for this visit.
    }
  }

  return {
    getMain: () => copy(data.main),
    saveMain(figure) {
      data.main = { ...normaliseFigure(figure, 'Me'), id: 'main' };
      persist();
      return copy(data.main);
    },
    listFriends: () => data.friends.map(copy),
    getFriend: id => copy(data.friends.find(f => f.id === id)),
    saveFriend(figure) {
      const known = typeof figure?.id === 'string' && data.friends.some(f => f.id === figure.id);
      const saved = { ...normaliseFigure(figure, 'Friend'), id: known ? figure.id : newId() };
      const index = data.friends.findIndex(f => f.id === saved.id);
      if (index >= 0) data.friends[index] = saved;
      else data.friends.push(saved);
      persist();
      return copy(saved);
    },
    removeFriend(id) {
      data.friends = data.friends.filter(f => f.id !== id);
      persist();
    },
  };
}
