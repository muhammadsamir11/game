// Play together: what the tablets and the server say to each other. Shared by both sides, so it stays plain data.

// Bump this whenever a message changes shape, or cars can carry new brick types: an installed offline copy
// may be older than the server. (2: the showroom's prize-car parts; 3: trucks and trailers; 4: Tesla parts
// and silver, the bigger city and its treasure spots, and the longer 2-lap track with the lava jump.)
export const PROTOCOL_VERSION = 4;

export const MAX_PLAYERS = 4; // the race grid has four places
export const MAX_MESSAGE_BYTES = 64 * 1024;
export const MAX_BRICKS = 400;
export const MAX_RIDERS = 6;
export const STATE_HZ = 15; // how often each tablet sends where it is
export const CODE_LENGTH = 4;

// Room codes are four pictures, because a kid can't type a code. `say` is read out loud.
export const CODE_PICTURES = [
  { emoji: '🦖', say: 'dinosaur' },
  { emoji: '🍕', say: 'pizza' },
  { emoji: '🚀', say: 'rocket' },
  { emoji: '⭐', say: 'star' },
  { emoji: '🐶', say: 'dog' },
  { emoji: '🍦', say: 'ice cream' },
  { emoji: '🌈', say: 'rainbow' },
  { emoji: '🦄', say: 'unicorn' },
  { emoji: '🍌', say: 'banana' },
  { emoji: '🐙', say: 'octopus' },
  { emoji: '⚽', say: 'ball' },
  { emoji: '🎈', say: 'balloon' },
];

// The only way to "talk": nothing can be typed.
export const STICKERS = ['👋', '😂', '😮', '👍', '❤️', '🏁', '🔥', '🙈'];

export const FX_KINDS = ['horn', 'siren', 'boost', 'confetti'];
export const PLACES = ['lobby', 'city', 'race'];

export const GAMES = {
  treasure: { name: 'Treasure hunt', emoji: '💎', minPlayers: 1, seconds: 180, chests: 5, reach: 4, how: 'Drive to the treasure chest first!' },
  rush: { name: 'Coin rush', emoji: '🪙', minPlayers: 1, seconds: 120, coins: 30, how: 'Grab the most sparkly coins!' },
  tag: { name: 'Police tag', emoji: '🚓', minPlayers: 2, seconds: 120, cooldown: 3, reach: 4, how: 'Police: catch someone! Everyone else: run away!' },
  follow: { name: 'Follow the leader', emoji: '⭐', minPlayers: 2, turnSeconds: 30, reach: 12, how: 'Stay close to the leader to earn stars!' },
};
export const GAME_KINDS = Object.keys(GAMES);
export const GAME_COUNTDOWN = 3; // seconds of 3-2-1 before a game starts

export const RACE = { slots: 4, readyTimeout: 10, countdown: 3 };

export const isCode = code => Array.isArray(code) && code.length === CODE_LENGTH
  && code.every(i => Number.isInteger(i) && i >= 0 && i < CODE_PICTURES.length);
export const codeKey = code => code.join('-');
export const codeEmoji = code => code.map(i => CODE_PICTURES[i].emoji).join('');
export const codeWords = code => code.map(i => CODE_PICTURES[i].say).join(', ');

// Where a player is, as a short array of rounded numbers (a JSON object would be three times bigger).
// p: position, q: rotation quaternion, v: velocity, h: heading, flags: on foot / siren / boost,
// lap and cp: race progress (laps done, next checkpoint).
const r2 = n => Math.round(n * 100) / 100;
const r3 = n => Math.round(n * 1000) / 1000;
export function packState({ p, q = { x: 0, y: 0, z: 0, w: 1 }, v = { x: 0, y: 0, z: 0 }, h = 0, foot = false, siren = false, boost = false, lap = 0, cp = 0 }) {
  const flags = (foot ? 1 : 0) | (siren ? 2 : 0) | (boost ? 4 : 0);
  return [r2(p.x), r2(p.y), r2(p.z), r3(q.x), r3(q.y), r3(q.z), r3(q.w), r2(v.x), r2(v.y), r2(v.z), r3(h), flags, lap, cp];
}

export function unpackState(s) {
  if (!Array.isArray(s) || s.length !== 14 || !s.every(Number.isFinite)) return null;
  const [px, py, pz, qx, qy, qz, qw, vx, vy, vz, h, flags, lap, cp] = s;
  return {
    p: { x: px, y: py, z: pz },
    q: { x: qx, y: qy, z: qz, w: qw },
    v: { x: vx, y: vy, z: vz },
    h,
    foot: !!(flags & 1),
    siren: !!(flags & 2),
    boost: !!(flags & 4),
    lap,
    cp,
  };
}
