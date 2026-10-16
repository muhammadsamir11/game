// Small helpers shared by the play-together screen, the city and the race.
import { resolveRider } from '../riders.js';
import { normaliseFigure } from '../figures.js';
import { MODELS, modelToBricks } from '../instructions.js';

// What gets sent for a car: its bricks, plus the friend figures riding in it (they only exist on this tablet).
export function carPayload(car, friends = []) {
  const riders = {};
  for (const b of car.bricks) {
    if (typeof b.rider === 'string' && b.rider.startsWith('friend:')) riders[b.rider] = resolveRider(b.rider, friends);
  }
  return { name: car.name, bricks: car.bricks, riders };
}

// Who sits in a friend's car: the friend drives, their own passengers ride along.
export function peopleFor(player) {
  const riders = player?.car?.riders ?? {};
  return {
    driver: normaliseFigure(player?.figure, player?.name),
    resolveRider: rider => (Object.hasOwn(riders, rider) ? normaliseFigure(riders[rider], 'Friend') : resolveRider(rider)),
  };
}

// A friend with no car (or a car that didn't arrive) drives the ready-made race car.
export const DEFAULT_ROOM_CAR = { id: null, name: 'Race car', bricks: modelToBricks(MODELS.raceCar) };
export const bricksOf = player => (player?.car?.bricks?.length ? player.car.bricks : DEFAULT_ROOM_CAR.bricks);

// A short hash of a car's bricks, so pictures of a friend's car redraw when they change it.
export function bricksKey(bricks) {
  let h = 0;
  const s = JSON.stringify(bricks);
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

// A colour for each friend: their dot on the map and their name tag.
export const FRIEND_COLORS = ['#e53935', '#1e88e5', '#43a047', '#fb8c00'];
export function friendColor(players, id) {
  const i = [...players.keys()].indexOf(id);
  return FRIEND_COLORS[(i < 0 ? 0 : i) % FRIEND_COLORS.length];
}
