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
  const trucks = entries.filter(([, m]) => m.kind === 'truck');
  const fastest = Math.max(...supercars.map(([, m]) => m.realTopSpeed ?? 0));

  // Supercars look like trading cards in their brand's colours: the car on top, and a name plate with
  // the real logo, the model's name (the logo already says the brand) and its real top speed.
  const supercarCard = ([key, model]) => {
    const brand = BRANDS[model.brand];
    const { card } = brand;
    return el('button', {
      class: 'model-card supercar',
      'data-brand': model.brand,
      'aria-label': model.name,
      style: `--brand-frame:${card.frame};--brand-frame-lo:${card.frameLo};--brand-plate:${card.plate};--brand-ink:${card.ink};--brand-tint:${card.tint}`,
      onclick: choose({ modelKey: key }),
    }, [
      el('img', { class: 'car', src: carThumbnail(modelToBricks(model), `model:${key}`), alt: '' }),
      el('div', { class: 'brand-plate' }, [
        el('img', { class: 'card-badge', src: badgeImage(model.brand), alt: '' }),
        el('div', { class: 'plate-text' }, [
          el('span', { text: model.name.replace(brand.name, '').trim() || model.name }),
          el('small', { text: `🏁 ${model.realTopSpeed} km/h` }),
          el('div', { class: 'speed-bar', style: `--speed:${Math.round((model.realTopSpeed / fastest) * 100)}%` }, [el('i')]),
        ]),
      ]),
    ]);
  };
  // Free Build: a big orange brick like the home screen's buttons, first, because it is his own car;
  // beside it, his own truck or a trailer for it to pull.
  const kindBrick = (color, icon, title, text, options) => el('button', { class: `big-btn ${color}`, onclick: choose(options) }, [
    el('span', { class: 'bi', text: icon }),
    el('span', { class: 'bt' }, [el('b', { text: title }), el('small', { text })]),
  ]);
  const ownBuilds = el('div', { class: 'build-kinds' }, [
    kindBrick('c-orange free-build', '🧱', 'Free Build', 'Make your own car, brick by brick', {}),
    kindBrick('c-blue', '🚚', 'Truck', 'Build your own truck', { kind: 'truck' }),
    kindBrick('c-yellow', '🔗', 'Trailer', 'Build a trailer to pull', { kind: 'trailer' }),
  ]);
  const modelCard = ([key, model]) => el('button', { class: 'model-card', 'aria-label': model.name, onclick: choose({ modelKey: key }) }, [
    el('img', { src: carThumbnail(modelToBricks(model), `model:${key}`), alt: '' }),
    el('span', { text: model.name }),
  ]);

  close = openModal({
    title: 'What do you want to build?',
    className: 'wide chooser',
    body: [
      el('button', { class: 'icon-btn modal-close', 'aria-label': 'Back', text: '✕', onclick: () => close() }),
      ownBuilds,
      el('div', { class: 'model-section', text: '🏎 Supercars, step by step' }),
      el('div', { class: 'model-grid three' }, supercars.map(supercarCard)),
      el('div', { class: 'model-section', text: '🚚 Trucks, step by step' }),
      el('div', { class: 'model-grid three' }, trucks.map(modelCard)),
    ],
  });
}
