// The 👫 Play together screen: make a room, join one by tapping four pictures, and the room itself.
import { $, el, toast, openModal, confirmDialog, showScreen } from './ui.js';
import { sfx, speak } from './audio.js';
import { CODE_PICTURES, CODE_LENGTH, MAX_PLAYERS, codeEmoji, codeWords } from './net/protocol.js';
import { carThumbnail, figureThumbnail } from './thumbnails.js';
import { peopleFor, bricksOf, bricksKey, carPayload, DEFAULT_ROOM_CAR } from './net/together.js';

const ERRORS = {
  'no-room': 'No room has those pictures. Try again!',
  full: `That room is full (${MAX_PLAYERS} players).`,
  kicked: "You can't join that room.",
  'slow-down': 'Wait a minute, then try again.',
  'owner-picks': 'The 👑 player picks where to go.',
  busy: 'Try again in a moment.',
};

export function createTogetherScreen(app) {
  const root = $('#together-body');
  let view = 'start'; // start | join
  let picked = [];

  const room = app.room;
  room.on('room', () => { if (isOpen()) render(); });
  room.on('status', () => { if (isOpen()) render(); });
  room.on('welcome', msg => {
    view = 'start';
    picked = [];
    if (!isOpen()) return;
    sfx.success();
    // Joining a room that is already out in the city: go straight there.
    if (msg.place === 'city') app.openCity({ room: true });
  });
  room.on('error', msg => {
    const text = ERRORS[msg.reason];
    if (!text || !isOpen()) return;
    toast(text, 3000);
    if (view === 'join') {
      picked = [];
      sfx.wrong();
      render();
      root.querySelector('.code-slots')?.classList.add('shake');
    }
  });

  const isOpen = () => !$('#together').classList.contains('hidden');

  function render() {
    root.replaceChildren(...content().filter(Boolean));
  }

  function content() {
    if (room.status === 'outdated') {
      return [card('🆕', 'There is a new version of the game!', 'Tap to get it, then play together.', [
        el('button', { class: 'go-btn', text: '🔄 Get it', onclick: () => location.reload() }),
      ])];
    }
    if (room.inRoom) return lobby();
    if (room.status === 'offline' && !room.everOnline) {
      return [card('📡', 'Play together needs the internet', 'Check the Wi-Fi, then try again.', [
        el('button', { class: 'go-btn', text: '🔄 Try again', onclick: () => room.connect() }),
      ])];
    }
    if (view === 'join') return joinView();
    const last = room.lastCode();
    return [
      el('div', { class: 'together-start' }, [
        el('button', { class: 'big-btn c-green', onclick: () => { sfx.snap(); room.create(); } }, [
          el('span', { class: 'bi', text: '✨' }), el('span', { class: 'bt' }, [el('b', { text: 'Make a room' }), el('small', { text: 'Your friends join you' })]),
        ]),
        el('button', { class: 'big-btn c-blue', onclick: () => { sfx.snap(); view = 'join'; picked = []; render(); } }, [
          el('span', { class: 'bi', text: '🔑' }), el('span', { class: 'bt' }, [el('b', { text: 'Join a room' }), el('small', { text: 'Tap your friend’s 4 pictures' })]),
        ]),
        last ? el('button', { class: 'big-btn c-purple', onclick: () => room.join(last) }, [
          el('span', { class: 'bi', text: '↩️' }), el('span', { class: 'bt' }, [el('b', { text: 'Go back in' }), el('small', { text: codeEmoji(last) })]),
        ]) : null,
        room.status === 'connecting' ? el('p', { class: 'together-note', text: 'Connecting…' }) : null,
      ]),
    ];
  }

  function joinView() {
    const slots = Array.from({ length: CODE_LENGTH }, (_, i) => el('div', { class: `code-slot${picked[i] !== undefined ? ' full' : ''}`, text: picked[i] !== undefined ? CODE_PICTURES[picked[i]].emoji : '' }));
    const pick = i => {
      if (picked.length >= CODE_LENGTH) return;
      picked.push(i);
      sfx.snap();
      render();
      if (picked.length === CODE_LENGTH) room.join([...picked]);
    };
    return [
      el('div', { class: 'together-join card' }, [
        el('h3', { text: 'Tap the 4 pictures on your friend’s screen' }),
        el('div', { class: 'code-row' }, [
          el('div', { class: 'code-slots' }, slots),
          el('button', { class: 'tool-btn', 'aria-label': 'Undo', onclick: () => { picked.pop(); render(); } }, ['⌫', el('small', { text: 'Undo' })]),
        ]),
        el('div', { class: 'code-pad' }, CODE_PICTURES.map((p, i) => el('button', { class: 'code-pic', 'aria-label': p.say, text: p.emoji, onclick: () => pick(i) }))),
        el('button', { class: 'tool-btn back', onclick: () => { view = 'start'; render(); } }, ['◀', el('small', { text: 'Back' })]),
      ]),
    ];
  }

  function lobby() {
    const s = room.state;
    const owner = s.players.get(s.owner);
    const amOwner = room.isOwner();
    const racing = s.place === 'race' && s.race && !(s.you in (s.race.slots ?? {}));
    const players = [...s.players.values()].map(p => {
      const me = p.id === s.you;
      return el('div', { class: `player-card${me ? ' me' : ''}${p.away ? ' away' : ''}` }, [
        el('div', { class: 'pc-head' }, [
          el('img', { src: figureThumbnail(p.figure, 'head'), alt: '' }),
          p.id === s.owner ? el('span', { class: 'crown', text: '👑' }) : null,
          p.away ? el('span', { class: 'zzz', text: '💤' }) : null,
        ]),
        el('b', { text: me ? `${p.name} (you)` : p.name }),
        el('img', { class: 'pc-car', src: carThumbnail(bricksOf(p), `room:${bricksKey([bricksOf(p), p.figure, p.car?.riders])}`, peopleFor(p)), alt: '' }),
        el('small', { text: p.car?.name ?? DEFAULT_ROOM_CAR.name }),
        me ? el('button', { class: 'tool-btn c-yellow', onclick: () => chooseCar() }, ['🚗', el('small', { text: 'Change car' })]) : null,
        amOwner && !me ? el('button', {
          class: 'tool-btn danger kick',
          'aria-label': `Send ${p.name} out`,
          onclick: async () => {
            if (await confirmDialog(`Send ${p.name} out of the room?`, { yes: 'Send out', no: 'Keep', danger: true, icon: '🚪' })) room.send('kick', { id: p.id });
          },
        }, ['✖', el('small', { text: 'Send out' })]) : null,
      ]);
    });
    const empty = Array.from({ length: Math.max(0, MAX_PLAYERS - s.players.size) }, () => el('div', { class: 'player-card empty' }, [el('span', { text: '＋' }), el('small', { text: 'Waiting for a friend' })]));
    return [
      el('div', { class: 'room-code card' }, [
        el('small', { text: 'Tell your friends these pictures!' }),
        el('div', { class: 'code-big', text: codeEmoji(s.code) }),
        el('button', { class: 'icon-btn', 'aria-label': 'Read the pictures out loud', text: '🔊', onclick: () => speak(codeWords(s.code)) }),
      ]),
      el('div', { class: 'player-cards' }, [...players, ...empty]),
      racing ? el('p', { class: 'together-note', text: 'A race is on! You’ll join the next one. 🏁' }) : null,
      el('div', { class: 'room-actions' }, amOwner ? [
        el('button', { class: 'big-btn city', onclick: () => room.send('go', { place: 'city' }) }, [el('span', { class: 'bi', text: '🏙' }), el('span', { class: 'bt' }, [el('b', { text: 'City' }), el('small', { text: 'Drive around together' })])]),
        el('button', { class: 'big-btn race', onclick: () => room.send('go', { place: 'race' }) }, [el('span', { class: 'bi', text: '🏁' }), el('span', { class: 'bt' }, [el('b', { text: 'Race' }), el('small', { text: 'Race each other' })])]),
      ] : [el('p', { class: 'together-note', text: `Waiting for 👑 ${owner?.name ?? 'the owner'} to pick City or Race…` })]),
      el('button', {
        class: 'tool-btn danger leave',
        onclick: async () => {
          if (await confirmDialog('Leave the room?', { yes: '🚪 Leave', no: 'Stay', icon: '👫' })) {
            room.leave();
            render();
          }
        },
      }, ['🚪', el('small', { text: 'Leave room' })]),
    ];
  }

  function chooseCar() {
    const cars = app.garage.list().reverse();
    const choices = cars.length ? cars : [DEFAULT_ROOM_CAR];
    const close = openModal({
      title: 'Which car?',
      icon: '🚗',
      className: 'car-choice',
      body: [el('div', { class: 'car-choices' }, choices.map(car => el('button', {
        class: 'car-card',
        onclick: () => {
          room.chooseCar(car.id, carPayload(car, app.figures.listFriends()));
          sfx.snap();
          close();
        },
      }, [el('img', { src: carThumbnail(car.bricks, car.id ? `${car.id}:${car.updatedAt}` : 'room:default'), alt: '' }), el('h3', { text: car.name })])))],
      buttons: [{ label: 'Cancel' }],
    });
  }

  function card(icon, title, text, buttons) {
    return el('div', { class: 'together-msg card' }, [el('div', { class: 'modal-icon', text: icon }), el('h3', { text: title }), el('p', { text }), ...buttons]);
  }

  return {
    open() {
      showScreen('together');
      view = 'start';
      picked = [];
      room.connect();
      render();
    },
    render,
  };
}
