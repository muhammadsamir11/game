import { el, openModal } from './ui.js';
import { MODELS, modelToBricks } from './instructions.js';
import { carThumbnail } from './thumbnails.js';
import { badgeImage } from './badgePicker.js';

export function openBuildChooser(app) {
  let close = () => {};
  const choose = options => () => {
    close();
    app.openBuilder(options);
  };
  // Supercars first, each with its badge and the real car's top speed, like a trading card.
  const entries = Object.entries(MODELS).sort(([, a], [, b]) => (b.brand ? 1 : 0) - (a.brand ? 1 : 0));
  const cards = entries.map(([key, model]) => el('button', { class: `model-card${model.brand ? ' supercar' : ''}`, onclick: choose({ modelKey: key }) }, [
    el('img', { src: carThumbnail(modelToBricks(model), `model:${key}`), alt: '' }),
    ...(model.brand ? [el('img', { class: 'card-badge', src: badgeImage(model.brand), alt: '' })] : []),
    el('span', { text: model.name }),
    el('small', { text: model.realTopSpeed ? `🏁 ${model.realTopSpeed} km/h` : `${model.steps.length} steps` }),
  ]));
  cards.push(el('button', { class: 'model-card', onclick: choose({}) }, [
    el('div', { class: 'free', text: '🧱' }),
    el('span', { text: 'Free Build' }),
    el('small', { text: 'Make your own!' }),
  ]));
  close = openModal({ title: 'What do you want to build?', body: [el('div', { class: 'model-grid three' }, cards)], buttons: [{ label: 'Back' }] });
}
