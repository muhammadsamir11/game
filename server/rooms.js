// Play-together rooms: who is in which room, and passing messages between them. No sockets in here, so it
// can be tested: server.js hands each connection's messages to `connect()` and sends whatever comes back.
import {
  PROTOCOL_VERSION, MAX_PLAYERS, MAX_BRICKS, MAX_RIDERS, CODE_PICTURES, CODE_LENGTH, STICKERS, FX_KINDS, PLACES,
  RACE, isCode, codeKey, unpackState,
} from '../js/net/protocol.js';
import { isValidBrick } from '../js/bricks.js';
import { normaliseFigure, cleanName } from '../js/figures.js';
import { createGame } from './games.js';

export const RECONNECT_GRACE = 30_000; // a tablet that drops off keeps its place this long
export const EMPTY_ROOM_LIFE = 120_000;
export const JOIN_LIMIT = { perConnection: 10, perIp: 30, windowMs: 60_000 };
const STATE_PER_SECOND = 25;
const STICKER_GAP = 400;
const GO_GAP = 2000;

const ID_PATTERN = /^[a-z0-9-]{6,40}$/i;

// A car from another tablet, cut down to what the game can draw. Anything odd and it's dropped.
export function cleanCar(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.bricks)) return null;
  if (raw.bricks.length === 0 || raw.bricks.length > MAX_BRICKS || !raw.bricks.every(isValidBrick)) return null;
  const bricks = raw.bricks.map(({ type, color, x, y, z, r, rider, badge }) => ({
    type, color, x, y, z, r,
    ...(typeof rider === 'string' ? { rider: rider.slice(0, 60) } : {}),
    ...(typeof badge === 'string' ? { badge: badge.slice(0, 30) } : {}),
  }));
  const riders = {};
  if (raw.riders && typeof raw.riders === 'object') {
    for (const [key, figure] of Object.entries(raw.riders).slice(0, MAX_RIDERS)) {
      if (typeof key === 'string' && key.startsWith('friend:') && key.length <= 60) riders[key] = normaliseFigure(figure, 'Friend');
    }
  }
  return { name: cleanName(raw.name, 'My car'), bricks, riders };
}

export function createLobby({ now = Date.now, random = Math.random } = {}) {
  const rooms = new Map(); // codeKey → room
  const members = new Map(); // playerId → member (whatever room it is in)
  const ipJoins = new Map(); // ip → recent join attempt times

  const newId = () => Array.from({ length: 12 }, () => '0123456789abcdefghijklmnopqrstuvwxyz'[Math.floor(random() * 36)]).join('');
  const publicPlayer = m => ({ id: m.id, name: m.name, figure: m.figure, car: m.car, away: m.away || !m.connected });
  const roomOf = m => (m?.roomKey ? rooms.get(m.roomKey) : null);

  function sendTo(m, msg) {
    if (m.connected && m.send) m.send(msg);
  }
  function broadcast(room, msg, exceptId = null) {
    for (const id of room.players) if (id !== exceptId) sendTo(members.get(id), msg);
  }
  const broadcastAll = (room, msgs) => { for (const msg of msgs) broadcast(room, msg); };

  function newCode() {
    for (let tries = 0; tries < 1000; tries++) {
      const code = Array.from({ length: CODE_LENGTH }, () => Math.floor(random() * CODE_PICTURES.length));
      if (!rooms.has(codeKey(code))) return code;
    }
    return null;
  }

  function raceInfo(room, t) {
    const r = room.race;
    if (!r) return null;
    return { slots: r.slots, ai: r.ai, goIn: r.goAt === null ? null : r.goAt - t, finishes: r.finishes };
  }

  function welcome(m, room) {
    const t = now();
    sendTo(m, {
      type: 'welcome',
      you: m.id,
      code: room.code,
      owner: room.owner,
      place: room.place,
      players: room.players.map(id => publicPlayer(members.get(id))),
      game: room.game ? room.game.startMessage(t) : null,
      race: raceInfo(room, t),
    });
  }

  function addToRoom(m, room) {
    room.players.push(m.id);
    room.emptySince = null;
    m.roomKey = room.key;
    welcome(m, room);
    broadcast(room, { type: 'joined', player: publicPlayer(m) }, m.id);
    if (room.game) broadcastAll(room, room.game.addPlayer(m.id, now()));
  }

  function removeFromRoom(m, reason = 'left') {
    const room = roomOf(m);
    if (!room) return;
    m.roomKey = null;
    room.players = room.players.filter(id => id !== m.id);
    broadcast(room, { type: 'left', id: m.id, reason });
    if (room.game) {
      broadcastAll(room, room.game.removePlayer(m.id, now()));
      if (room.game.done) room.game = null;
    }
    if (room.race) {
      delete room.race.slots[m.id];
      room.race.ready.delete(m.id);
      maybeStartRace(room);
    }
    if (room.owner === m.id && room.players.length) {
      room.owner = room.players[0];
      broadcast(room, { type: 'owner', id: room.owner });
    }
    if (!room.players.length) room.emptySince = now();
  }

  function setPlace(room, place, byId) {
    const t = now();
    room.lastGoAt = t;
    if (room.game) {
      broadcastAll(room, [{ type: 'game.end', kind: room.game.kind, scores: room.game.scores, stopped: true }]);
      room.game = null;
    }
    room.place = place;
    room.race = null;
    if (place === 'race') {
      const humans = room.players.slice(0, RACE.slots);
      const ai = RACE.slots - humans.length;
      // Computer cars take the front row, friends start behind them: there's someone to overtake.
      room.race = { slots: Object.fromEntries(humans.map((id, i) => [id, ai + i])), ai, ready: new Set(), goAt: null, createdAt: t, finishes: {} };
    }
    broadcast(room, { type: 'go', place, by: byId, race: raceInfo(room, t) });
  }

  function maybeStartRace(room, force = false) {
    const r = room.race;
    if (!r || r.goAt !== null) return;
    const racing = Object.keys(r.slots).filter(id => members.get(id)?.connected);
    if (!racing.length) return;
    if (!force && !racing.every(id => r.ready.has(id))) return;
    const goIn = RACE.countdown * 1000;
    r.goAt = now() + goIn;
    broadcast(room, { type: 'race.countdown', goIn });
  }

  function joinAllowed(m) {
    const t = now();
    const recent = list => list.filter(x => t - x < JOIN_LIMIT.windowMs);
    m.joins = recent(m.joins);
    const ipList = recent(ipJoins.get(m.ip) ?? []);
    if (m.joins.length >= JOIN_LIMIT.perConnection || ipList.length >= JOIN_LIMIT.perIp) return false;
    m.joins.push(t);
    ipList.push(t);
    ipJoins.set(m.ip, ipList);
    return true;
  }

  const handlers = {
    create(m) {
      removeFromRoom(m);
      const code = newCode();
      if (!code) return sendTo(m, { type: 'error', reason: 'busy' });
      const room = { code, key: codeKey(code), owner: m.id, players: [], place: 'lobby', game: null, race: null, banned: new Set(), emptySince: null, lastGoAt: -Infinity };
      rooms.set(room.key, room);
      addToRoom(m, room);
    },
    join(m, msg) {
      if (!joinAllowed(m)) return sendTo(m, { type: 'error', reason: 'slow-down' });
      if (!isCode(msg.code)) return sendTo(m, { type: 'error', reason: 'no-room' });
      const room = rooms.get(codeKey(msg.code));
      if (!room) return sendTo(m, { type: 'error', reason: 'no-room' });
      if (room.key === m.roomKey) return welcome(m, room);
      if (room.banned.has(m.id)) return sendTo(m, { type: 'error', reason: 'kicked' });
      if (room.players.length >= MAX_PLAYERS) return sendTo(m, { type: 'error', reason: 'full' });
      removeFromRoom(m);
      addToRoom(m, room);
    },
    leave(m) {
      removeFromRoom(m);
    },
    car(m, msg) {
      m.car = cleanCar(msg.car);
      const room = roomOf(m);
      if (room) broadcast(room, { type: 'updated', player: publicPlayer(m) }, m.id);
    },
    away(m, msg) {
      m.away = !!msg.away;
      const room = roomOf(m);
      if (room) broadcast(room, { type: 'updated', player: publicPlayer(m) }, m.id);
    },
    state(m, msg) {
      const room = roomOf(m);
      if (!room || !unpackState(msg.s)) return;
      const t = now();
      if (t - m.stateWindow >= 1000) {
        m.stateWindow = t;
        m.stateCount = 0;
      }
      if (++m.stateCount > STATE_PER_SECOND) return;
      broadcast(room, { type: 'state', id: m.id, s: msg.s }, m.id);
    },
    sticker(m, msg) {
      const room = roomOf(m);
      const t = now();
      if (!room || !Number.isInteger(msg.sticker) || msg.sticker < 0 || msg.sticker >= STICKERS.length || t - m.lastSticker < STICKER_GAP) return;
      m.lastSticker = t;
      broadcast(room, { type: 'sticker', id: m.id, sticker: msg.sticker });
    },
    fx(m, msg) {
      const room = roomOf(m);
      if (!room || !FX_KINDS.includes(msg.kind)) return;
      broadcast(room, { type: 'fx', id: m.id, kind: msg.kind, on: !!msg.on }, m.id);
    },
    go(m, msg) {
      const room = roomOf(m);
      if (!room || !PLACES.includes(msg.place)) return;
      if (room.place === 'lobby' && room.owner !== m.id) return sendTo(m, { type: 'error', reason: 'owner-picks' });
      if (now() - room.lastGoAt < GO_GAP) return;
      setPlace(room, msg.place, m.id);
    },
    kick(m, msg) {
      const room = roomOf(m);
      const target = members.get(msg.id);
      if (!room || room.owner !== m.id || msg.id === m.id || !target || target.roomKey !== room.key) return;
      room.banned.add(target.id);
      sendTo(target, { type: 'error', reason: 'kicked' });
      removeFromRoom(target, 'kicked');
    },
    'race.ready'(m) {
      const room = roomOf(m);
      if (!room?.race || !(m.id in room.race.slots)) return;
      room.race.ready.add(m.id);
      maybeStartRace(room);
    },
    'race.finish'(m) {
      const r = roomOf(m)?.race;
      const t = now();
      if (!r || r.goAt === null || t < r.goAt || !(m.id in r.slots) || m.id in r.finishes) return;
      r.finishes[m.id] = t - r.goAt;
      broadcast(roomOf(m), { type: 'race.finish', id: m.id, time: r.finishes[m.id] });
    },
    'game.start'(m, msg) {
      const room = roomOf(m);
      if (!room || room.place !== 'city' || room.game) return;
      const game = createGame(msg.kind, { players: room.players.filter(id => members.get(id).connected), now: now(), random });
      if (!game) return sendTo(m, { type: 'error', reason: 'need-friends' });
      room.game = game;
      broadcast(room, { ...game.startMessage(), by: m.id });
    },
    'game.claim'(m, msg) {
      const room = roomOf(m);
      if (!room?.game) return;
      broadcastAll(room, room.game.claim(m.id, msg.data, now()));
      if (room.game.done) room.game = null;
    },
    'game.stop'(m) {
      const room = roomOf(m);
      if (!room?.game) return;
      broadcastAll(room, [{ type: 'game.end', kind: room.game.kind, scores: room.game.scores, stopped: true, by: m.id }]);
      room.game = null;
    },
  };

  function hello(m, msg) {
    if (msg.v !== PROTOCOL_VERSION) return sendTo(m, { type: 'error', reason: 'version' });
    const wanted = typeof msg.playerId === 'string' && ID_PATTERN.test(msg.playerId) ? msg.playerId : newId();
    const old = members.get(wanted);
    if (old && old !== m) {
      // The same tablet coming back (new socket after a Wi-Fi blip): take over its place in the room.
      if (old.connected) {
        sendTo(old, { type: 'error', reason: 'replaced' });
        old.connected = false;
        old.send = null;
      }
      m.roomKey = old.roomKey;
    }
    m.id = wanted;
    m.name = cleanName(msg.name, 'Friend');
    m.figure = normaliseFigure(msg.figure, m.name);
    m.car = cleanCar(msg.car);
    m.helloed = true;
    m.away = false;
    members.set(m.id, m);
    sendTo(m, { type: 'hello', you: m.id });
    const room = roomOf(m);
    if (room && room.players.includes(m.id)) {
      welcome(m, room);
      broadcast(room, { type: 'updated', player: publicPlayer(m) }, m.id);
      if (room.race && !room.race.goAt && m.id in room.race.slots) maybeStartRace(room);
    } else {
      m.roomKey = null;
    }
  }

  return {
    rooms,
    members,
    // send(msg): how to reach this tablet. Returns the handle server.js feeds messages into.
    connect(send, { ip = '?' } = {}) {
      const m = { id: null, send, ip, connected: true, roomKey: null, helloed: false, joins: [], stateWindow: 0, stateCount: 0, lastSticker: -Infinity, away: false, leftAt: 0 };
      return {
        receive(msg) {
          if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return;
          if (msg.type === 'hello') return hello(m, msg);
          if (!m.helloed || !Object.hasOwn(handlers, msg.type)) return;
          handlers[msg.type](m, msg);
        },
        close() {
          if (members.get(m.id) !== m) return; // replaced by a newer connection already
          m.connected = false;
          m.send = null;
          m.leftAt = now();
          const room = roomOf(m);
          if (room) {
            broadcast(room, { type: 'updated', player: publicPlayer(m) });
            maybeStartRace(room);
          }
          else members.delete(m.id);
        },
        get id() { return m.id; },
      };
    },
    tick() {
      const t = now();
      for (const m of [...members.values()]) {
        if (m.connected || t - m.leftAt < RECONNECT_GRACE) continue;
        removeFromRoom(m);
        members.delete(m.id);
      }
      for (const room of [...rooms.values()]) {
        if (!room.players.length && room.emptySince !== null && t - room.emptySince > EMPTY_ROOM_LIFE) {
          rooms.delete(room.key);
          continue;
        }
        if (room.game) {
          broadcastAll(room, room.game.tick(t));
          if (room.game.done) room.game = null;
        }
        if (room.race && room.race.goAt === null && t - room.race.createdAt > RACE.readyTimeout * 1000) maybeStartRace(room, true);
      }
    },
  };
}
