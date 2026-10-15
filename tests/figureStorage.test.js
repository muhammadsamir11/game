import test from 'node:test';
import assert from 'node:assert/strict';
import { createFigureStore, FIGURES_KEY } from '../js/figureStorage.js';
import { DEFAULT_FIGURE } from '../js/figures.js';

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return { data, getItem: k => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); } };
}

test('a new store has no main figure and no friends (first launch)', () => {
  const store = createFigureStore(memoryStorage());
  assert.equal(store.getMain(), null);
  assert.deepEqual(store.listFriends(), []);
});

test('the main figure is saved and comes back after reopening', () => {
  const storage = memoryStorage();
  createFigureStore(storage).saveMain({ ...DEFAULT_FIGURE, name: 'Sam', face: 'grin' });
  const main = createFigureStore(storage).getMain();
  assert.equal(main.id, 'main');
  assert.equal(main.name, 'Sam');
  assert.equal(main.face, 'grin');
});

test('blank names become "Me" for the main figure and "Friend" for friends', () => {
  const store = createFigureStore(memoryStorage());
  assert.equal(store.saveMain({ name: ' ' }).name, 'Me');
  assert.equal(store.saveFriend({ name: '' }).name, 'Friend');
});

test('friends can be added, changed and deleted', () => {
  const store = createFigureStore(memoryStorage());
  const a = store.saveFriend({ name: 'Ana' });
  const b = store.saveFriend({ name: 'Ben' });
  assert.notEqual(a.id, b.id);
  store.saveFriend({ ...a, name: 'Ana 2' });
  assert.deepEqual(store.listFriends().map(f => f.name), ['Ana 2', 'Ben']);
  store.removeFriend(b.id);
  assert.deepEqual(store.listFriends().map(f => f.name), ['Ana 2']);
  assert.equal(store.getFriend(b.id), null);
});

test('the main figure cannot be deleted or saved as a friend', () => {
  const store = createFigureStore(memoryStorage());
  store.saveMain({ name: 'Sam' });
  store.removeFriend('main');
  assert.equal(store.getMain().name, 'Sam');
  const friend = store.saveFriend({ id: 'main', name: 'Copy' });
  assert.notEqual(friend.id, 'main');
});

test('returned figures are copies', () => {
  const store = createFigureStore(memoryStorage());
  store.saveMain({ name: 'Sam' });
  store.getMain().name = 'Changed';
  assert.equal(store.getMain().name, 'Sam');
});

test('broken JSON means no figures (the first-launch maker runs again)', () => {
  const store = createFigureStore(memoryStorage({ [FIGURES_KEY]: '{oops' }));
  assert.equal(store.getMain(), null);
  assert.deepEqual(store.listFriends(), []);
});

test('saved figures with unknown choices are repaired; junk friends are skipped', () => {
  const raw = { main: { name: 'Sam', head: 'jetpack', face: 'grin' }, friends: [{ id: 'f1', name: 'Ana', skin: 'green' }, null, 'junk', 5] };
  const store = createFigureStore(memoryStorage({ [FIGURES_KEY]: JSON.stringify(raw) }));
  assert.equal(store.getMain().head, DEFAULT_FIGURE.head);
  assert.equal(store.getMain().face, 'grin');
  assert.deepEqual(store.listFriends().map(f => [f.id, f.skin]), [['f1', DEFAULT_FIGURE.skin]]);
});

test('a friends list that is not an array is ignored', () => {
  const store = createFigureStore(memoryStorage({ [FIGURES_KEY]: JSON.stringify({ main: null, friends: 'nope' }) }));
  assert.deepEqual(store.listFriends(), []);
});

test('when storage refuses to save, figures still work for this visit', () => {
  const store = createFigureStore({ getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); } });
  store.saveMain({ name: 'Sam' });
  assert.equal(store.getMain().name, 'Sam');
});

test('works with no storage at all', () => {
  const store = createFigureStore(null);
  store.saveFriend({ name: 'Ana' });
  assert.equal(store.listFriends().length, 1);
});
