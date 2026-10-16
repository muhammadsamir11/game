import { normaliseFigure } from './figures.js';

// Ready-made characters that can ride in a passenger seat.
export const PRESET_RIDERS = {
  police: { name: 'Police Officer', figure: { head: 'policeCap', face: 'determined', skin: 'classic', shirt: 'blue', print: 'badge', pants: 'black' } },
  firefighter: { name: 'Firefighter', figure: { head: 'fireHelmet', face: 'happy', skin: 'tan', shirt: 'black', print: 'stripe', pants: 'black' } },
  astronaut: { name: 'Astronaut', figure: { head: 'astronaut', face: 'grin', skin: 'light', shirt: 'white', print: 'star', pants: 'white' } },
  pirate: { name: 'Pirate', figure: { head: 'pirateHat', face: 'eyepatch', skin: 'brown', shirt: 'red', print: 'stripe', pants: 'black' } },
  chef: { name: 'Chef', figure: { head: 'chefHat', face: 'happy', skin: 'dark', shirt: 'white', print: 'plain', pants: 'black' } },
};

export const DEFAULT_RIDER = 'preset:police';

const presetFigure = key => normaliseFigure({ ...PRESET_RIDERS[key].figure, name: PRESET_RIDERS[key].name });

// rider is 'preset:<key>' or 'friend:<id>'; anything that can't be found rides as the Police Officer.
export function resolveRider(rider, friends = []) {
  if (typeof rider === 'string') {
    const colon = rider.indexOf(':');
    const kind = rider.slice(0, colon);
    const key = rider.slice(colon + 1);
    if (kind === 'preset' && Object.hasOwn(PRESET_RIDERS, key)) return presetFigure(key);
    if (kind === 'friend') {
      const friend = friends.find(f => f.id === key);
      if (friend) return normaliseFigure(friend, 'Friend');
    }
  }
  return presetFigure('police');
}

export const riderName = (rider, friends = []) => resolveRider(rider, friends).name;
