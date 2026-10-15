import { $, el, confirmDialog } from './ui.js';
import { carThumbnail } from './thumbnails.js';

export function renderGarage(app) {
  const cars = app.garage.list().reverse();

  const carCard = car => el('div', { class: 'car-card' }, [
    el('img', { src: carThumbnail(car.bricks, `${car.id}:${car.updatedAt}`), alt: '' }),
    el('h3', { text: car.name }),
    el('div', { class: 'card-actions' }, [
      el('button', { class: 'go-btn', text: '🏁 Race', onclick: () => app.startRace(car) }),
      el('button', { class: 'tool-btn', text: '🔧', 'aria-label': `Change ${car.name}`, onclick: () => app.openBuilder({ car }) }),
      el('button', {
        class: 'tool-btn danger',
        text: '🗑',
        'aria-label': `Delete ${car.name}`,
        onclick: async () => {
          if (!(await confirmDialog(`Delete ${car.name}?`, { yes: 'Delete', no: 'Keep it' }))) return;
          app.garage.remove(car.id);
          renderGarage(app);
        },
      }),
    ]),
  ]);

  const items = [
    el('button', { class: 'car-card new', onclick: () => app.chooseBuild() }, [
      el('div', { class: 'plus', text: '＋' }),
      el('span', { text: 'New car' }),
    ]),
    cars.length ? null : el('p', { class: 'empty', text: 'No cars yet. Tap "New car" to build one!' }),
    ...cars.map(carCard),
  ];
  $('#garage-list').replaceChildren(...items.filter(Boolean));
}
