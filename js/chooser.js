import { el, openModal } from './ui.js';
import { MODELS, modelToBricks } from './instructions.js';
import { carThumbnail } from './thumbnails.js';
import { badgeImage } from './badgePicker.js';
import { BRANDS } from './brands.js';

export function openBuildChooser(app) {
  let close = () => {};
  const choose = options => () => {
    close();
    app.openBuilder(options);
  };
  const entries = Object.entries(MODELS);
  const supercars = entries.filter(([, m]) => m.brand);
  const fastest = Math.max(...supercars.map(([, m]) => m.realTopSpeed ?? 0));

  // Supercars look like trading cards in their brand's colours: the emblem, the car, and a name plate
  // with the real car's top speed and a speed bar.
  const supercarCard = ([key, model]) => {
    const { card } = BRANDS[model.brand];
    return el('button', {
      class: 'model-card supercar',
      'data-brand': model.brand,
      style: `--brand-frame:${card.frame};--brand-frame-lo:${card.frameLo};--brand-plate:${card.plate};--brand-ink:${card.ink};--brand-tint:${card.tint}`,
      onclick: choose({ modelKey: key }),
    }, [
      el('img', { src: carThumbnail(modelToBricks(model), `model:${key}`), alt: '' }),
      el('img', { class: 'card-badge', src: badgeImage(model.brand), alt: '' }),
      el('div', { class: 'brand-plate' }, [
        el('span', { text: model.name }),
        el('small', { text: `🏁 ${model.realTopSpeed} km/h` }),
        el('div', { class: 'speed-bar', style: `--speed:${Math.round((model.realTopSpeed / fastest) * 100)}%` }, [el('i')]),
      ]),
    ]);
  };
  const freeBuild = el('button', { class: 'model-card free-build', onclick: choose({}) }, [
    el('div', { class: 'free', text: '🧱' }),
    el('span', { text: 'Free Build' }),
    el('small', { text: 'Make your own!' }),
  ]);

  close = openModal({
    title: 'What do you want to build?',
    className: 'wide',
    body: [
      el('div', { class: 'model-section', text: '🏎 Supercars' }),
      el('div', { class: 'model-grid three' }, supercars.map(supercarCard)),
      el('div', { class: 'model-section', text: '🚗 Cars' }),
      el('div', { class: 'model-grid four' }, [freeBuild]),
    ],
    buttons: [{ label: 'Back' }],
  });
}
