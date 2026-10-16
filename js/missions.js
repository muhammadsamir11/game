// The pizza shop's missions: what they are, which comes next, and how one plays out.
import { BLOCKS, HERO_NAME, buildingColor, houseCenter } from './cityMap.js';

export const MISSION_RING = { x: 126, z: 86, radius: 2.5 }; // in front of the pizza sign
export const MISSION_KINDS = ['pizza', 'puppy', 'coinTrail', 'stunt'];
export const STUNT_GOALS = ['FLIP', 'BIG AIR', 'RING OF FIRE'];
export const REWARDS = { pizza: 30, puppy: 40, coinTrail: 30, stunt: 40 };
const COOLDOWN = 5;
const DELIVERED = 4;
const FOUND = 3;

// One house from each houses block, each a different colour; drop-off on the sidewalk beside it.
export const DELIVERY_TARGETS = [[1, 0], [4, 0], [7, 3], [10, 3], [13, 3], [15, 0]].map(([blockIndex, k]) => {
  const block = BLOCKS[blockIndex];
  const h = houseCenter(block, k);
  const x = k % 2 === 0 ? block.rect.x0 + 1.5 : block.rect.x1 - 1.5;
  return { blockIndex, k, colorName: buildingColor(blockIndex, k).name, x, z: h.z };
});

export const PUPPY_SPOTS = [
  { x: 114, z: 180 }, // pond park
  { x: 78, z: 142.5 }, // sidewalk below the towers
  { x: 61.5, z: 94 }, // corner of the stunt park
  { x: 190.5, z: 20 }, // far side of the tall towers
  { x: 30, z: 157.5 }, // by the towers in the south-west
  { x: 126, z: 13.5 }, // in front of the shops up north
];

const STUNT_TITLES = {
  FLIP: `Do a FLIP in ${HERO_NAME}'s Stunt Park!`,
  'BIG AIR': `Get BIG AIR in ${HERO_NAME}'s Stunt Park!`,
  'RING OF FIRE': `Fly through the RING OF FIRE in ${HERO_NAME}'s Stunt Park!`,
};

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export function missionFor(n) {
  const kind = MISSION_KINDS[n % MISSION_KINDS.length];
  const variant = Math.floor(n / MISSION_KINDS.length);
  const reward = REWARDS[kind];
  if (kind === 'pizza') {
    const target = DELIVERY_TARGETS[variant % DELIVERY_TARGETS.length];
    const title = `Take this pizza to the ${target.colorName} house!`;
    return { kind, emoji: '🍕', title, say: title, target, timer: 25 + dist(MISSION_RING, target) / 5, reward };
  }
  if (kind === 'puppy') {
    const title = 'Biscuit the puppy is lost! Can you find him?';
    return { kind, emoji: '🐶', title, say: title, target: PUPPY_SPOTS[variant % PUPPY_SPOTS.length], timer: null, reward };
  }
  if (kind === 'coinTrail') {
    const title = 'Grab all 10 blue coins!';
    return { kind, emoji: '🔵', title, say: title, routeIndex: variant % 3, timer: 60, reward };
  }
  const goal = STUNT_GOALS[variant % STUNT_GOALS.length];
  return { kind, emoji: '🤸', title: STUNT_TITLES[goal], say: STUNT_TITLES[goal], goal, timer: null, reward };
}

function done(mission, { player, stunt, inStuntPark, trailLeft }) {
  if (mission.kind === 'pizza') return dist(player, mission.target) <= DELIVERED;
  if (mission.kind === 'puppy') return dist(player, mission.target) <= FOUND;
  if (mission.kind === 'coinTrail') return trailLeft === 0;
  if (!stunt || !inStuntPark) return false;
  return stunt.names.includes(mission.goal) || (mission.goal === 'BIG AIR' && stunt.names.includes('HUGE AIR'));
}

// ready → offered → running → (completed: cooldown → ready) or (failed → retry / cancel).
export function createMissionRunner({ startIndex = 0 } = {}) {
  let index = startIndex;
  let state = 'ready';
  let current = null;
  let timeLeft = null;
  let cooldown = 0;
  const toReady = () => {
    state = 'ready';
    current = null;
    timeLeft = null;
  };
  return {
    get state() { return state; },
    get current() { return current; },
    get timeLeft() { return timeLeft; },
    offer() {
      if (state !== 'ready') return null;
      current = missionFor(index);
      state = 'offered';
      return current;
    },
    accept() {
      if (state !== 'offered') return;
      state = 'running';
      timeLeft = current.timer;
    },
    decline() { if (state === 'offered') toReady(); },
    cancel() { if (state === 'running' || state === 'failed' || state === 'offered') toReady(); },
    retry() {
      if (state !== 'failed') return;
      state = 'running';
      timeLeft = current.timer;
    },
    near(player) { return current?.target ? dist(player, current.target) : Infinity; },
    update(dt, ctx) {
      if (state === 'cooldown') {
        cooldown -= dt;
        if (cooldown <= 0) toReady();
        return null;
      }
      if (state !== 'running') return null;
      if (done(current, ctx)) {
        const reward = current.reward;
        index += 1;
        toReady();
        state = 'cooldown';
        cooldown = COOLDOWN;
        return { completed: reward };
      }
      if (timeLeft !== null) {
        timeLeft -= dt;
        if (timeLeft <= 0) {
          timeLeft = 0;
          state = 'failed';
          return { failed: true };
        }
      }
      return null;
    },
  };
}
