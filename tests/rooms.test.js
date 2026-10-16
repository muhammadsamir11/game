import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLobby, cleanCar, RECONNECT_GRACE, EMPTY_ROOM_LIFE, JOIN_LIMIT } from '../server/rooms.js';
import { PROTOCOL_VERSION, MAX_PLAYERS, packState, unpackState } from '../js/net/protocol.js';
import { MODELS, modelToBricks } from '../js/instructions.js';

const CAR = { name: 'Zoom', bricks: modelToBricks(MODELS.raceCar), riders: {} };

function setup() {
  let t = 1000;
  let seed = 1;
  const lobby = createLobby({ now: () => t, random: () => ((seed = (seed * 16807) % 2147483647) / 2147483647) });
  const tablet = (name, { ip = '1.1.1.1', playerId } = {}) => {
    const inbox = [];
    const conn = lobby.connect(msg => inbox.push(msg), { ip });
    conn.receive({ type: 'hello', v: PROTOCOL_VERSION, playerId, name, figure: { name }, car: CAR });
    const last = type => [...inbox].reverse().find(m => m.type === type);
    return { conn, inbox, last, send: msg => conn.receive(msg), get id() { return conn.id; } };
  };
  return { lobby, tablet, advance: ms => { t += ms; lobby.tick(); }, now: () => t };
}

function roomOfTwo() {
  const s = setup();
  const a = s.tablet('Ann');
  a.send({ type: 'create' });
  const code = a.last('welcome').code;
  const b = s.tablet('Bob');
  b.send({ type: 'join', code });
  return { ...s, a, b, code };
}

test('making a room gives four pictures and makes you the owner', () => {
  const { tablet } = setup();
  const a = tablet('Ann');
  a.send({ type: 'create' });
  const w = a.last('welcome');
  assert.equal(w.code.length, 4);
  assert.equal(w.owner, a.id);
  assert.equal(w.place, 'lobby');
  assert.equal(w.players.length, 1);
});

test('joining with the pictures puts both tablets in the same room', () => {
  const { a, b } = roomOfTwo();
  assert.equal(b.last('welcome').players.length, 2);
  assert.equal(a.last('joined').player.name, 'Bob');
  assert.equal(a.last('joined').player.car.name, 'Zoom');
});

test('wrong pictures say there is no such room', () => {
  const { tablet } = setup();
  const b = tablet('Bob');
  b.send({ type: 'join', code: [0, 0, 0, 0] });
  assert.equal(b.last('error').reason, 'no-room');
  b.send({ type: 'join', code: ['x'] });
  assert.equal(b.last('error').reason, 'no-room');
});

test('an old app version is told to update', () => {
  const { lobby } = setup();
  const inbox = [];
  lobby.connect(m => inbox.push(m)).receive({ type: 'hello', v: PROTOCOL_VERSION + 1, name: 'Old' });
  assert.equal(inbox[0].reason, 'version');
});

test('a room holds at most four players', () => {
  const { a, code, tablet } = roomOfTwo();
  for (let i = 2; i < MAX_PLAYERS; i++) tablet(`P${i}`).send({ type: 'join', code });
  const late = tablet('Late');
  late.send({ type: 'join', code });
  assert.equal(late.last('error').reason, 'full');
  assert.equal(a.inbox.filter(m => m.type === 'joined').length, MAX_PLAYERS - 1);
});

test('guessing codes is slowed down', () => {
  const { tablet } = setup();
  const g = tablet('Guess');
  for (let i = 0; i < JOIN_LIMIT.perConnection; i++) g.send({ type: 'join', code: [1, 2, 3, i % 12] });
  g.send({ type: 'join', code: [1, 2, 3, 4] });
  assert.equal(g.last('error').reason, 'slow-down');
});

test('positions are passed on to the others, never back to the sender', () => {
  const { a, b } = roomOfTwo();
  const s = packState({ p: { x: 1, y: 2, z: 3 }, foot: true });
  a.send({ type: 'state', s });
  assert.deepEqual(b.last('state'), { type: 'state', id: a.id, s });
  assert.equal(a.last('state'), undefined);
  b.send({ type: 'state', s: [1, 2, 'x'] });
  assert.equal(a.last('state'), undefined);
});

test('stickers must be one of the list', () => {
  const { a, b } = roomOfTwo();
  a.send({ type: 'sticker', sticker: 2 });
  assert.equal(b.last('sticker').sticker, 2);
  b.send({ type: 'sticker', sticker: 99 });
  assert.equal(a.inbox.filter(m => m.type === 'sticker').length, 1);
});

test('only the owner picks where to go from the lobby', () => {
  const { a, b } = roomOfTwo();
  b.send({ type: 'go', place: 'city' });
  assert.equal(b.last('error').reason, 'owner-picks');
  a.send({ type: 'go', place: 'city' });
  assert.equal(b.last('go').place, 'city');
});

test('the owner can send someone out, and they cannot come back', () => {
  const { a, b, code } = roomOfTwo();
  a.send({ type: 'kick', id: b.id });
  assert.equal(b.last('error').reason, 'kicked');
  assert.equal(a.last('left').id, b.id);
  b.send({ type: 'join', code });
  assert.equal(b.last('error').reason, 'kicked');
});

test('when the owner leaves, the next player becomes owner', () => {
  const { a, b } = roomOfTwo();
  a.send({ type: 'leave' });
  assert.equal(b.last('owner').id, b.id);
});

test('a dropped tablet keeps its place for a while and gets it back', () => {
  const { a, b, tablet, advance } = roomOfTwo();
  const id = b.id;
  b.conn.close();
  assert.equal(a.last('updated').player.away, true);
  advance(RECONNECT_GRACE / 2);
  const back = tablet('Bob', { playerId: id });
  assert.equal(back.last('welcome').players.length, 2);
  assert.equal(a.last('updated').player.away, false);
});

test('a dropped tablet that never comes back leaves the room', () => {
  const { a, b, advance } = roomOfTwo();
  b.conn.close();
  advance(RECONNECT_GRACE + 1);
  assert.equal(a.last('left').id, b.id);
});

test('empty rooms go away after a while', () => {
  const { lobby, a, b, advance } = roomOfTwo();
  a.send({ type: 'leave' });
  b.send({ type: 'leave' });
  advance(EMPTY_ROOM_LIFE - 1);
  assert.equal(lobby.rooms.size, 1);
  advance(2);
  assert.equal(lobby.rooms.size, 0);
});

test('a race gives friends the back row, waits for everyone, then counts down', () => {
  const { a, b, advance } = roomOfTwo();
  a.send({ type: 'go', place: 'race' });
  const go = b.last('go');
  assert.equal(go.race.ai, 2);
  assert.deepEqual(Object.values(go.race.slots).sort(), [2, 3]);
  a.send({ type: 'race.ready' });
  assert.equal(b.last('race.countdown'), undefined);
  b.send({ type: 'race.ready' });
  assert.equal(b.last('race.countdown').goIn, 3000);
  advance(3000 + 61_000);
  b.send({ type: 'race.finish' });
  advance(2000);
  a.send({ type: 'race.finish' });
  assert.equal(a.inbox.filter(m => m.type === 'race.finish')[0].id, b.id);
  assert.equal(a.last('race.finish').time, 63_000);
});

test('a race starts anyway if a tablet never loads', () => {
  const { a, b, advance } = roomOfTwo();
  a.send({ type: 'go', place: 'race' });
  a.send({ type: 'race.ready' });
  advance(10_001);
  assert.ok(b.last('race.countdown'));
});

test('city games start from the city and need enough players', () => {
  const { a, b, tablet } = roomOfTwo();
  a.send({ type: 'game.start', kind: 'rush' });
  assert.equal(b.last('game.start'), undefined); // still in the lobby
  a.send({ type: 'go', place: 'city' });
  a.send({ type: 'game.start', kind: 'rush' });
  assert.equal(b.last('game.start').kind, 'rush');
  const solo = tablet('Solo');
  solo.send({ type: 'create' });
  solo.send({ type: 'go', place: 'city' });
  solo.send({ type: 'game.start', kind: 'tag' });
  assert.equal(solo.last('error').reason, 'need-friends');
});

test('going somewhere else stops the game', () => {
  const { a, b, advance } = roomOfTwo();
  a.send({ type: 'go', place: 'city' });
  b.send({ type: 'game.start', kind: 'treasure' });
  advance(2500);
  b.send({ type: 'go', place: 'race' });
  assert.equal(a.last('game.end').stopped, true);
});

test('cars from other tablets are checked brick by brick', () => {
  assert.equal(cleanCar({ bricks: [{ type: 'nope', color: 'red', x: 0, y: 0, z: 0, r: 0 }] }), null);
  assert.equal(cleanCar({ bricks: 'x' }), null);
  const car = cleanCar({ name: 'x'.repeat(80), bricks: CAR.bricks, riders: { 'friend:a': { name: 'Al', head: 'bogus' }, other: {} }, extra: 1 });
  assert.equal(car.name.length, 24);
  assert.deepEqual(Object.keys(car.riders), ['friend:a']);
  assert.equal(car.riders['friend:a'].name, 'Al');
});

test('positions survive packing and unpacking', () => {
  const s = unpackState(packState({ p: { x: 1.234, y: 2, z: -3 }, h: 1.5, siren: true, lap: 2, cp: 5 }));
  assert.deepEqual(s.p, { x: 1.23, y: 2, z: -3 });
  assert.equal(s.siren, true);
  assert.equal(s.foot, false);
  assert.equal(s.lap, 2);
  assert.equal(unpackState([1, 2]), null);
});

test('odd names and figures from another tablet cannot break the server', () => {
  const { lobby } = setup();
  const inbox = [];
  const conn = lobby.connect(m => inbox.push(m));
  assert.doesNotThrow(() => conn.receive({ type: 'hello', v: PROTOCOL_VERSION, name: { toString: 1 }, figure: { name: { toString: 1 } }, car: { name: { toString: 1 }, bricks: CAR.bricks } }));
  assert.equal(inbox[0].type, 'hello');
});

test('a tablet arriving after the countdown began is told when GO is', () => {
  const { a, b, advance } = roomOfTwo();
  a.send({ type: 'go', place: 'race' });
  a.send({ type: 'race.ready' });
  advance(10_001); // b never loaded: the race starts without waiting any longer
  advance(1000);
  b.send({ type: 'race.ready' });
  assert.ok(b.last('race.countdown').goIn < 3000);
});

test('players who are away are left out of a new game', () => {
  const { a, b } = roomOfTwo();
  a.send({ type: 'go', place: 'city' });
  b.send({ type: 'away', away: true });
  a.send({ type: 'game.start', kind: 'rush' });
  assert.deepEqual(Object.keys(a.last('game.start').scores), [a.id]);
});

test('making rooms over and over is slowed down too', () => {
  const { tablet } = setup();
  const g = tablet('Spam');
  for (let i = 0; i < JOIN_LIMIT.perConnection; i++) g.send({ type: 'create' });
  g.send({ type: 'create' });
  assert.equal(g.last('error').reason, 'slow-down');
});

test('stopping a game that already ended tells the tablet it is over', () => {
  const { a } = roomOfTwo();
  a.send({ type: 'go', place: 'city' });
  a.send({ type: 'game.stop' });
  assert.equal(a.last('game.end').stopped, true);
});
