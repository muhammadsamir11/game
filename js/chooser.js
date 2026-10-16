import { el, openModal } from './ui.js';
import { MODELS, modelToBricks } from './instructions.js';
import { carThumbnail } from './thumbnails.js';

export function openBuildChooser(app) {
  let close = () => {};
  const choose = options => () => {
    close();
    app.openBuilder(options);
  };
  const cards = Object.entries(MODELS).map(([key, model]) => el('button', { class: 'model-card', onclick: choose({ modelKey: key }) }, [
    el('img', { src: carThumbnail(modelToBricks(model), `model:${key}`), alt: '' }),
    el('span', { text: model.name }),
    el('small', { text: `${model.steps.length} steps` }),
  ]));
  cards.push(el('button', { class: 'model-card', onclick: choose({}) }, [
    el('div', { class: 'free', text: '🧱' }),
    el('span', { text: 'Free Build' }),
    el('small', { text: 'Make your own!' }),
  ]));
  close = openModal({ title: 'What do you want to build?', body: [el('div', { class: 'model-grid three' }, cards)], buttons: [{ label: 'Back' }] });
}
