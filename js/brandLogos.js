// The real supercar logos, saved in icons/brands (from Wikipedia and Wikimedia Commons; a private family
// game). They load once at startup so badgeArt.js can draw them on a canvas; until then, or if one fails
// to load, it draws its look-alike instead.
const FILES = {
  bull: 'icons/brands/lamborghini.png', // the shield, drawn from Lamborghini's SVG (4 MB, too slow for the iPad)
  horse: 'icons/brands/ferrari-horse.svg',
  eb: 'icons/brands/bugatti.svg',
  speedmark: 'icons/brands/mclaren-speedmark.svg', // painted papaya
};

const logos = new Map();

export const brandLogo = emblem => logos.get(emblem) ?? null;
export const setBrandLogo = (emblem, image) => logos.set(emblem, image);

export function loadBrandLogos({ timeout = 2500 } = {}) {
  if (typeof Image === 'undefined') return Promise.resolve();
  const loads = Object.entries(FILES).map(([emblem, src]) => new Promise(resolve => {
    const image = new Image();
    image.onload = () => { setBrandLogo(emblem, image); resolve(); };
    image.onerror = () => resolve();
    image.src = src;
  }));
  return Promise.race([Promise.all(loads), new Promise(resolve => setTimeout(resolve, timeout))]);
}
