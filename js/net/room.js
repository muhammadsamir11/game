// This tablet's line to the play-together server: connecting, staying connected, and remembering
// who is in our room. Everything else listens with room.on(type, fn).
import { PROTOCOL_VERSION, STICKERS } from './protocol.js';

const ID_KEY = 'brickRacers.playerId.v1';
const LAST_ROOM_KEY = 'brickRacers.lastRoom.v1';
const CAR_KEY = 'brickRacers.roomCar.v1';

const read = key => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key, value) => { try { value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value); } catch { /* private mode */ } };

// getHello(): { name, figure, car } for this tablet, asked again every time it (re)connects.
export function createRoomClient({ getHello, url = defaultUrl() }) {
  const listeners = new Map();
  const state = { you: null, code: null, owner: null, place: null, players: new Map(), game: null, race: null };
  let ws = null;
  // idle → connecting → online; offline (can't reach the server), outdated (old app), unavailable (server has no /play)
  let status = 'idle';
  let retry = 0;
  let retryTimer = 0;
  let queued = []; // sent once the server has said hello
  let ready = false;
  let wanted = false; // keep reconnecting while we are in (or joining) a room
  let everOnline = false;

  function emit(type, msg) {
    for (const fn of listeners.get(type) ?? []) fn(msg);
    for (const fn of listeners.get('*') ?? []) fn(type, msg);
  }
  function setStatus(next) {
    if (status === next) return;
    status = next;
    emit('status', status);
  }

  function connect() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
    clearTimeout(retryTimer);
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setStatus('offline');
      scheduleRetry();
      return;
    }
    setStatus('connecting');
    ready = false;
    let socket;
    try {
      socket = new WebSocket(url);
    } catch {
      setStatus('offline');
      return;
    }
    ws = socket;
    socket.onopen = () => {
      const hello = getHello();
      socket.send(JSON.stringify({ type: 'hello', v: PROTOCOL_VERSION, playerId: read(ID_KEY), ...hello }));
    };
    socket.onmessage = ev => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      handle(msg);
    };
    socket.onclose = () => {
      if (ws !== socket) return;
      ws = null;
      ready = false;
      if (status === 'outdated') return;
      setStatus('offline');
      scheduleRetry();
    };
  }

  function scheduleRetry() {
    if (!wanted) return;
    clearTimeout(retryTimer);
    retryTimer = setTimeout(connect, Math.min(1000 * 2 ** retry++, 8000));
  }

  function rawSend(msg) {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }
  function send(type, data = {}) {
    if (ready) rawSend({ type, ...data });
    else if (type !== 'state') queued.push({ type, ...data }); // old positions are useless; everything else waits
  }

  function clearRoom() {
    state.code = null;
    state.owner = null;
    state.place = null;
    state.players = new Map();
    state.game = null;
    state.race = null;
  }

  function handle(msg) {
    switch (msg.type) {
      case 'hello':
        state.you = msg.you;
        write(ID_KEY, msg.you);
        ready = true;
        retry = 0;
        everOnline = true;
        setStatus('online');
        for (const m of queued.splice(0)) rawSend(m);
        break;
      case 'welcome':
        state.code = msg.code;
        state.owner = msg.owner;
        state.place = msg.place;
        state.players = new Map(msg.players.map(p => [p.id, p]));
        state.game = msg.game;
        state.race = msg.race;
        wanted = true;
        write(LAST_ROOM_KEY, JSON.stringify(msg.code));
        break;
      case 'joined':
        state.players.set(msg.player.id, msg.player);
        break;
      case 'updated':
        state.players.set(msg.player.id, msg.player);
        break;
      case 'left':
        msg.name = state.players.get(msg.id)?.name;
        state.players.delete(msg.id);
        break;
      case 'owner':
        state.owner = msg.id;
        break;
      case 'go':
        state.place = msg.place;
        state.race = msg.race;
        state.game = null;
        break;
      case 'game.start':
        state.game = msg;
        break;
      case 'game.end':
        state.game = null;
        break;
      case 'error':
        if (msg.reason === 'version') {
          setStatus('outdated');
          wanted = false;
        }
        if (msg.reason === 'kicked') {
          clearRoom();
          write(LAST_ROOM_KEY, null);
          wanted = false;
        }
        if (msg.reason === 'replaced') wanted = false; // this tablet opened the game twice; the newer one wins
        break;
      default:
    }
    emit(msg.type, msg);
    if (['welcome', 'joined', 'updated', 'left', 'owner', 'go', 'error'].includes(msg.type)) emit('room', state);
  }

  return {
    state,
    get status() { return status; },
    get everOnline() { return everOnline; },
    get inRoom() { return !!state.code; },
    get you() { return state.players.get(state.you) ?? null; },
    isOwner: () => state.owner === state.you,
    lastCode() {
      try {
        const code = JSON.parse(read(LAST_ROOM_KEY));
        return Array.isArray(code) ? code : null;
      } catch {
        return null;
      }
    },
    connect,
    create() {
      wanted = true;
      connect();
      send('create');
    },
    join(code) {
      wanted = true;
      connect();
      send('join', { code });
    },
    leave() {
      send('leave');
      wanted = false;
      clearRoom();
      write(LAST_ROOM_KEY, null);
      emit('room', state);
    },
    send,
    sticker(i) {
      if (i >= 0 && i < STICKERS.length) send('sticker', { sticker: i });
    },
    // The car this tablet brings to the room (remembered by id between visits).
    chosenCarId: () => read(CAR_KEY),
    chooseCar(id, car) {
      write(CAR_KEY, id);
      send('car', { car });
    },
    on(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
      return () => listeners.get(type).delete(fn);
    },
  };
}

function defaultUrl() {
  if (typeof location === 'undefined') return '';
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/play`;
}
