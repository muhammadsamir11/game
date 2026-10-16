import { el, openModal } from './ui.js';
import { figureThumbnail } from './thumbnails.js';
import { PRESET_RIDERS, resolveRider } from './riders.js';

// "Who's riding?": friend figures first, then the ready-made characters. A seat needs a rider, so there is no cancel.
export function pickRider(app) {
  return new Promise(resolve => {
    const friends = app.figures.listFriends();
    let close = () => {};
    const tile = (rider, label) => el('button', {
      class: 'model-card',
      onclick: () => { close(); resolve(rider); },
    }, [el('img', { src: figureThumbnail(resolveRider(rider, friends)), alt: '' }), el('span', { text: label })]);
    const tiles = [
      ...friends.map(f => tile(`friend:${f.id}`, f.name)),
      ...Object.entries(PRESET_RIDERS).map(([key, preset]) => tile(`preset:${key}`, preset.name)),
    ];
    close = openModal({ title: "Who's riding?", body: [el('div', { class: 'model-grid three' }, tiles)] });
  });
}
