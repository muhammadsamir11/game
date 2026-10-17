import { el, openModal } from './ui.js';
import { BRANDS, pickerBrandKeys } from './brands.js';
import { drawBadge } from './badgeArt.js';

const images = new Map();
export function badgeImage(key) {
  if (!images.has(key)) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 192;
    drawBadge(canvas.getContext('2d'), BRANDS[key], 192, 192);
    images.set(key, canvas.toDataURL());
  }
  return images.get(key);
}

// "Which badge?": his own brand first, then the supercar brands. A badge always needs a brand, so there is no cancel.
export function pickBadge() {
  return new Promise(resolve => {
    let close = () => {};
    const keys = pickerBrandKeys();
    const tiles = keys.map(key => el('button', {
      class: 'model-card',
      onclick: () => { close(); resolve(key); },
    }, [el('img', { src: badgeImage(key), alt: '' }), el('span', { text: BRANDS[key].name })]));
    close = openModal({ title: 'Which badge?', body: [el('div', { class: 'model-grid three' }, tiles)] });
  });
}
