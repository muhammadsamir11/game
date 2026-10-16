import { $, el, confirmDialog } from './ui.js';
import { carThumbnail } from './thumbnails.js';

export function renderGarage(app, { fromCity = false } = {}) {
  const cars = app.garage.list().reverse();
  $('#garage [data-action="city"]').classList.toggle('hidden', !fromCity);

  const carCard = car => el('div', { class: 'car-card' }, [
    el('img', { src: carThumbnail(car.bricks, `${car.id}:${car.updatedAt}`), alt: '' }),
    el('h3', { text: car.name }),
    el('div', { class: 'card-actions' }, [
      el('button', { class: 'go-btn', text: '🏁 Race', onclick: () => app.startRace(car, { fromCity }) }),
      el('button', { class: 'tool-btn', 'aria-label': `Change ${car.name}`, onclick: () => app.openBuilder({ car }) }, ['🔧', el('small', { text: 'Change' })]),
      el('button', {
        class: 'tool-btn danger',
        'aria-label': `Delete ${car.name}`,
        onclick: async () => {
          if (!(await confirmDialog(`Delete ${car.name}?`, { yes: '🗑 Delete', no: 'Keep it', danger: true, icon: '🚗' }))) return;
          app.garage.remove(car.id);
          renderGarage(app, { fromCity });
        },
      }, ['🗑', el('small', { text: 'Delete' })]),
    ]),
  ]);

  const items = [
    el('button', { class: 'car-card new', onclick: () => app.chooseBuild() }, [
      el('div', { class: 'plus', text: '＋' }),
      el('span', { text: 'New car' }),
    ]),
    cars.length ? null : el('p', { class: 'empty', text: 'Your garage is empty! Tap ＋ to build your first car.' }),
    ...cars.map(carCard),
  ];
  $('#garage-list').replaceChildren(...items.filter(Boolean));
}
