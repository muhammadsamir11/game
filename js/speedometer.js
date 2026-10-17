import { shownSpeed, needleAngle, smoothToward, DIAL_MAX, SWEEP } from './speedDial.js';

// The round speed dial shown while driving, in the city and in races: a needle over a green → red rainbow, and a big number.
const C = 100; // the dial's centre, in a 200 × 200 picture
const point = (deg, r) => {
  const a = (deg * Math.PI) / 180;
  return `${(C + r * Math.sin(a)).toFixed(1)} ${(C - r * Math.cos(a)).toFixed(1)}`;
};

function dialPicture() {
  const parts = [];
  const steps = 24; // the rainbow arc, in short slices from green to red
  for (let i = 0; i < steps; i++) {
    const from = -SWEEP / 2 + (SWEEP * i) / steps;
    const to = from + SWEEP / steps + 0.6; // a hair of overlap hides the seams
    const hue = Math.round(120 - (120 * i) / (steps - 1));
    parts.push(`<path d="M ${point(from, 78)} A 78 78 0 0 1 ${point(to, 78)}" stroke="hsl(${hue} 85% 52%)" stroke-width="14" fill="none"/>`);
  }
  for (let kmh = 0; kmh <= DIAL_MAX; kmh += 50) {
    const big = kmh % 100 === 0;
    parts.push(`<path d="M ${point(needleAngle(kmh), 66)} L ${point(needleAngle(kmh), big ? 54 : 60)}" stroke="#fff" stroke-width="${big ? 4 : 2.5}" stroke-linecap="round"/>`);
    if (kmh % 200 === 0) {
      const [x, y] = point(needleAngle(kmh), 40).split(' ');
      parts.push(`<text x="${x}" y="${y}" class="speedo-tick">${kmh}</text>`);
    }
  }
  return `<svg viewBox="0 0 200 200" aria-hidden="true">${parts.join('')}
    <g class="speedo-needle"><path d="M 93 ${C} L ${C} 28 L 107 ${C} Z" fill="#ff3b30" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/></g>
    <circle cx="${C}" cy="${C}" r="11" fill="#ffcd00" stroke="#fff" stroke-width="3"/>
    <text x="${C}" y="157" class="speedo-num">0</text>
    <text x="${C}" y="179" class="speedo-unit">km/h</text>
  </svg>`;
}

export function createSpeedometer(root) {
  root.innerHTML = dialPicture();
  const needle = root.querySelector('.speedo-needle');
  const number = root.querySelector('.speedo-num');
  let speed = 0;
  let angle = null;
  let kmh = null;
  const show = () => {
    const nowKmh = shownSpeed(speed);
    const nowAngle = Math.round(needleAngle(nowKmh) * 2) / 2;
    if (nowAngle !== angle) { // only touch the page when the needle really moves
      angle = nowAngle;
      needle.setAttribute('transform', `rotate(${angle} ${C} ${C})`);
    }
    if (nowKmh !== kmh) {
      kmh = nowKmh;
      number.textContent = kmh;
    }
  };
  show();
  return {
    // mps: the car's forward speed (car.forwardSpeed()), every frame.
    update(mps, dt) {
      speed = smoothToward(speed, Math.abs(mps), dt);
      show();
    },
    reset() {
      speed = 0;
      show();
    },
  };
}
