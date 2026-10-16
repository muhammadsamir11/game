import { $, el, confirmDialog } from './ui.js';
import { figureThumbnail } from './thumbnails.js';

export function renderFigures(app) {
  const main = app.figures.getMain();
  const card = (figure, isMain) => el('div', { class: 'car-card' }, [
    el('img', { src: figureThumbnail(figure), alt: '' }),
    el('h3', { text: isMain ? `${figure.name} (you)` : figure.name }),
    el('div', { class: 'card-actions' }, [
      el('button', { class: 'go-btn', text: '✏️ Change', onclick: () => app.openFigureMaker({ id: isMain ? 'main' : figure.id }) }),
      isMain ? null : el('button', {
        class: 'tool-btn danger',
        text: '🗑',
        'aria-label': `Delete ${figure.name}`,
        onclick: async () => {
          if (!(await confirmDialog(`Delete ${figure.name}?`, { yes: '🗑 Delete', no: 'Keep', danger: true, icon: '👋' }))) return;
          app.figures.removeFriend(figure.id);
          app.figuresChanged();
          renderFigures(app);
        },
      }),
    ]),
  ]);
  const items = [
    main ? card(main, true) : null,
    el('button', { class: 'car-card new', onclick: () => app.openFigureMaker({ id: null }) }, [
      el('div', { class: 'plus', text: '＋' }),
      el('span', { text: 'New friend' }),
    ]),
    ...app.figures.listFriends().map(friend => card(friend, false)),
  ];
  $('#figures-list').replaceChildren(...items.filter(Boolean));
}
