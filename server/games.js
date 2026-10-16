// Referees for the play-together city games. Pure state machines: the room feeds them claims and clock
// ticks, and they return the messages to send to everyone. Times are milliseconds on the server's clock.
import { GAMES, GAME_COUNTDOWN } from '../js/net/protocol.js';
import { TREASURE_SPOTS, RUSH_SPOTS } from '../js/cityGameSpots.js';

// Picks n different whole numbers below max.
export function pickDistinct(n, max, random) {
  const pool = Array.from({ length: max }, (_, i) => i);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.min(n, max));
}

export function canStart(kind, playerCount) {
  return Object.hasOwn(GAMES, kind) && playerCount >= GAMES[kind].minPlayers;
}

// players: ids in join order. Returns null for an unknown game or too few players.
export function createGame(kind, { players, now, random = Math.random }) {
  if (!canStart(kind, players.length)) return null;
  const rules = GAMES[kind];
  const startAt = now + GAME_COUNTDOWN * 1000;
  const scores = Object.fromEntries(players.map(id => [id, 0]));
  let done = false;
  let endsAt = rules.seconds ? startAt + rules.seconds * 1000 : Infinity;
  const started = t => t >= startAt;
  const extra = {}; // the game's own state, sent with every update
  const lastAt = {};

  function end() {
    done = true;
    return [{ type: 'game.end', kind, scores: roundScores() }];
  }
  const roundScores = () => Object.fromEntries(Object.entries(scores).map(([id, s]) => [id, Math.round(s)]));
  const update = (more = {}) => ({ type: 'game.update', kind, ...extra, ...more, scores: roundScores() });

  // --- per-game setup ---
  let order = [...players];
  let turn = 0;
  let turnEndsAt = 0;
  let lastTagAt = -Infinity;
  let lastTick = startAt;
  const taken = new Map();
  if (kind === 'treasure') {
    extra.chest = 0;
    extra.spot = Math.floor(random() * TREASURE_SPOTS.length);
  }
  if (kind === 'rush') extra.coins = pickDistinct(rules.coins, RUSH_SPOTS.length, random);
  if (kind === 'tag') extra.police = players[Math.floor(random() * players.length)];
  if (kind === 'follow') {
    extra.leader = order[0];
    turnEndsAt = startAt + rules.turnSeconds * 1000;
    endsAt = startAt + rules.turnSeconds * 1000 * order.length;
  }

  const game = {
    kind,
    get done() { return done; },
    get scores() { return roundScores(); },
    startMessage(t = now) {
      return { type: 'game.start', kind, startsIn: Math.max(0, startAt - t), endsIn: endsAt - t, ...extra, ...(kind === 'follow' ? { turnEndsIn: turnEndsAt - t } : {}), scores: roundScores() };
    },

    claim(id, data, t) {
      if (done || !started(t) || !Object.hasOwn(scores, id) || !data || typeof data !== 'object') return [];
      if (kind === 'treasure') {
        if (data.chest !== extra.chest) return []; // someone else got there first
        scores[id]++;
        extra.chest++;
        if (extra.chest >= rules.chests) return [update({ foundBy: id }), ...end()];
        let next = Math.floor(random() * (TREASURE_SPOTS.length - 1));
        if (next >= extra.spot) next++; // never the same junction twice in a row
        extra.spot = next;
        return [update({ foundBy: id })];
      }
      if (kind === 'rush') {
        const k = data.coin;
        if (!Number.isInteger(k) || k < 0 || k >= extra.coins.length || taken.has(k)) return [];
        taken.set(k, id);
        scores[id]++;
        const msgs = [update({ taken: k, by: id })];
        return taken.size >= extra.coins.length ? [...msgs, ...end()] : msgs;
      }
      if (kind === 'tag') {
        const victim = data.victim;
        if (id !== extra.police || victim === id || !Object.hasOwn(scores, victim)) return [];
        if (t - lastTagAt < rules.cooldown * 1000) return []; // no tag-backs straight away
        this.tick(t); // bank everyone's free time up to this moment
        lastTagAt = t;
        extra.police = victim;
        return [update({ tagged: victim, by: id })];
      }
      if (kind === 'follow') {
        if (id === extra.leader || t - (lastAt[id] ?? -Infinity) < 900) return [];
        lastAt[id] = t;
        scores[id]++;
        return [update({ star: id })];
      }
      return [];
    },

    tick(t) {
      if (done) return [];
      if (kind === 'tag' && t > lastTick) {
        const from = Math.max(lastTick, startAt);
        if (t > from) for (const id of Object.keys(scores)) if (id !== extra.police) scores[id] += (t - from) / 1000;
        lastTick = t;
      }
      if (kind === 'follow' && started(t) && t >= turnEndsAt) {
        turn++;
        if (turn >= order.length) return end();
        extra.leader = order[turn];
        turnEndsAt += rules.turnSeconds * 1000;
        return [update({ turnEndsIn: turnEndsAt - t })];
      }
      if (t >= endsAt) return end();
      return [];
    },

    addPlayer(id, t) {
      if (done || Object.hasOwn(scores, id)) return [];
      scores[id] = 0;
      if (kind === 'follow') {
        order.push(id);
        endsAt += rules.turnSeconds * 1000;
      }
      return [update(kind === 'follow' ? { turnEndsIn: turnEndsAt - t } : {})];
    },

    removePlayer(id, t) {
      if (done || !Object.hasOwn(scores, id)) return [];
      if (kind === 'tag') this.tick(t);
      delete scores[id];
      const left = Object.keys(scores);
      if (left.length < rules.minPlayers || left.length === 0) return end();
      if (kind === 'tag' && extra.police === id) {
        extra.police = left[Math.floor(random() * left.length)];
        lastTagAt = t;
      }
      if (kind === 'follow') {
        const idx = order.indexOf(id);
        order = order.filter(x => x !== id);
        if (idx < turn) turn--;
        if (extra.leader === id) {
          if (turn >= order.length) return end();
          extra.leader = order[turn];
          turnEndsAt = Math.max(t, startAt) + rules.turnSeconds * 1000;
        }
        endsAt = turnEndsAt + rules.turnSeconds * 1000 * (order.length - turn - 1);
        return [update({ turnEndsIn: turnEndsAt - t })];
      }
      return [update()];
    },
  };
  return game;
}
