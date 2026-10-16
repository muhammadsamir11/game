// Brand badges and name plates, drawn on a canvas in code (nothing is downloaded): look-alikes of each
// supercar maker's emblem in its real colours — the raging bull, the prancing horse, the EB oval, the speedmark.
const FONT = 'Fredoka, Arial Rounded MT Bold, sans-serif';
const SANS = "'Avenir Next', Futura, 'Helvetica Neue', Arial, sans-serif";
const SERIF = "Didot, 'Bodoni 72', Georgia, 'Times New Roman', serif";

// Silhouettes as path strings on a 100 × 100 grid (absolute M L H V Q C Z only), both facing left.
export const SILHOUETTES = {
  // Lamborghini's bull: head down, horns forward, tail flicked up over its back.
  bull: 'M 36 26 Q 50 24 62 30 Q 74 36 82 42 Q 89 37 89 28 Q 89 20 95 15 Q 93 22 93 29 Q 93 40 87 47 '
    + 'Q 89 56 87 64 L 92 78 L 87 80 L 82 70 L 78 72 L 76 81 L 70 81 L 71 70 Q 62 70 52 69 L 52 81 L 46 81 '
    + 'L 45 70 L 41 70 L 34 76 L 34 81 L 28 81 L 28 75 L 35 66 Q 36 60 32 55 Q 28 57 23 55 Q 18 53 20 46 '
    + 'L 25 35 Q 20 30 14 18 Q 22 27 30 31 Q 32 27 36 26 Z M 25 40 Q 17 40 11 33 Q 15 42 23 44 Z',
  // Ferrari's horse: rearing on its hind legs, front hooves up, tail sweeping up behind.
  horse: 'M 40 2 L 43 10 Q 54 12 58 28 Q 64 42 72 52 Q 76 42 76 32 Q 76 22 70 13 Q 84 14 86 28 '
    + 'Q 87 46 78 58 Q 80 66 77 72 L 78 84 L 84 94 L 85 97 L 76 97 L 72 86 L 70 78 L 66 76 L 60 84 L 56 92 '
    + 'L 57 96 L 49 96 L 51 88 L 56 76 Q 58 70 60 68 Q 54 64 48 60 L 38 62 L 37 70 L 38 74 L 32 74 L 31 68 '
    + 'L 33 58 L 44 52 L 34 46 L 32 54 L 33 57 L 27 57 L 27 50 L 30 42 L 44 40 Q 44 32 40 24 Q 34 26 28 29 '
    + 'Q 22 32 20 29 Q 18 26 22 22 L 34 10 L 36 4 L 39 8 Z',
};

// Draws a path string scaled by s from (ox, oy).
export function tracePath(g, d, ox = 0, oy = 0, s = 1) {
  const tokens = d.match(/[A-Z]|-?\d*\.?\d+/g) ?? [];
  const X = v => ox + v * s;
  const Y = v => oy + v * s;
  let i = 0, cmd = '', x = 0, y = 0;
  const n = () => Number(tokens[i++]);
  while (i < tokens.length) {
    if (/[A-Z]/.test(tokens[i])) cmd = tokens[i++];
    switch (cmd) {
      case 'M': x = n(); y = n(); g.moveTo(X(x), Y(y)); cmd = 'L'; break;
      case 'L': x = n(); y = n(); g.lineTo(X(x), Y(y)); break;
      case 'H': x = n(); g.lineTo(X(x), Y(y)); break;
      case 'V': y = n(); g.lineTo(X(x), Y(y)); break;
      case 'Q': { const ax = n(), ay = n(); x = n(); y = n(); g.quadraticCurveTo(X(ax), Y(ay), X(x), Y(y)); break; }
      case 'C': {
        const ax = n(), ay = n(), bx = n(), by = n();
        x = n(); y = n();
        g.bezierCurveTo(X(ax), Y(ay), X(bx), Y(by), X(x), Y(y));
        break;
      }
      case 'Z': g.closePath(); cmd = ''; break;
      default: throw new Error(`Unknown path command "${cmd}"`);
    }
  }
}

function fillPath(g, d, color, ox, oy, s) {
  g.beginPath();
  tracePath(g, d, ox, oy, s);
  g.fillStyle = color;
  g.fill();
}

// Text with even gaps between letters, shrunk to fit maxWidth, centred on (cx, cy).
function spacedText(g, text, cx, cy, size, maxWidth, { font = SANS, weight = 'bold', gap = 0.18 } = {}) {
  const width = s => {
    g.font = `${weight} ${s}px ${font}`;
    return [...text].reduce((sum, ch) => sum + g.measureText(ch).width, 0) + gap * s * (text.length - 1);
  };
  if (width(size) > maxWidth) size *= maxWidth / width(size);
  let x = cx - width(size) / 2;
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  for (const ch of text) {
    g.fillText(ch, x, cy);
    x += g.measureText(ch).width + gap * size;
  }
}

// --- Lamborghini: gold-rimmed black shield, the name across the top, a gold raging bull ---
function lamborghiniShield(g, w, h, inset) {
  const L = w * 0.1 + inset, R = w * 0.9 - inset, T = h * 0.05 + inset, B = h * 0.96 - inset * 1.6;
  g.beginPath();
  g.moveTo(L, T);
  g.lineTo(R, T);
  g.bezierCurveTo(R + w * 0.01, h * 0.5, w * 0.78, h * 0.74, w / 2, B);
  g.bezierCurveTo(w * 0.22, h * 0.74, L - w * 0.01, h * 0.5, L, T);
  g.closePath();
}
function drawBull(g, { colors }, w, h) {
  lamborghiniShield(g, w, h, 0);
  g.fillStyle = colors.accent;
  g.fill();
  lamborghiniShield(g, w, h, w * 0.035);
  g.fillStyle = colors.main;
  g.fill();
  lamborghiniShield(g, w, h, w * 0.06);
  g.lineWidth = w * 0.012;
  g.strokeStyle = colors.accent;
  g.stroke();
  g.fillStyle = colors.accent;
  spacedText(g, 'LAMBORGHINI', w / 2, h * 0.19, h * 0.085, w * 0.64, { gap: 0.08 });
  fillPath(g, SILHOUETTES.bull, colors.accent, w * 0.17, h * 0.15, w * 0.0066);
}

// --- Ferrari: yellow shield, green-white-red stripe on top, black prancing horse, S F underneath ---
function ferrariShield(g, w, h) {
  g.beginPath();
  g.moveTo(w * 0.13, h * 0.04);
  g.lineTo(w * 0.87, h * 0.04);
  g.lineTo(w * 0.87, h * 0.54);
  g.bezierCurveTo(w * 0.87, h * 0.76, w * 0.68, h * 0.88, w / 2, h * 0.97);
  g.bezierCurveTo(w * 0.32, h * 0.88, w * 0.13, h * 0.76, w * 0.13, h * 0.54);
  g.closePath();
}
function drawHorse(g, { colors }, w, h) {
  ferrariShield(g, w, h);
  g.fillStyle = colors.main;
  g.fill();
  g.save();
  ferrariShield(g, w, h);
  g.clip();
  const third = (w * 0.74) / 3;
  [colors.green, '#ffffff', colors.red].forEach((c, i) => {
    g.fillStyle = c;
    g.fillRect(w * 0.13 + i * third, h * 0.04, third + 1, h * 0.1);
  });
  g.restore();
  ferrariShield(g, w, h);
  g.lineWidth = w * 0.03;
  g.strokeStyle = colors.accent;
  g.stroke();
  fillPath(g, SILHOUETTES.horse, colors.accent, w * 0.23, h * 0.17, w * 0.0054);
  g.fillStyle = colors.accent;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `bold ${Math.round(h * 0.17)}px ${SANS}`;
  g.fillText('S', w * 0.33, h * 0.74);
  g.fillText('F', w * 0.67, h * 0.74);
}

// --- Bugatti: red oval, white rim with a ring of pearls, a back-to-back EB over the name ---
function drawEB(g, { colors }, w, h) {
  const cx = w / 2, cy = h / 2, rx = w * 0.47, ry = h * 0.34;
  g.beginPath();
  g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  g.fillStyle = colors.accent;
  g.fill();
  g.beginPath();
  g.ellipse(cx, cy, rx * 0.93, ry * 0.9, 0, 0, Math.PI * 2);
  g.fillStyle = colors.main;
  g.fill();
  g.fillStyle = colors.accent;
  const pearls = 40;
  for (let i = 0; i < pearls; i++) {
    const a = (i / pearls) * Math.PI * 2;
    g.beginPath();
    g.arc(cx + Math.cos(a) * rx * 0.85, cy + Math.sin(a) * ry * 0.79, w * 0.013, 0, Math.PI * 2);
    g.fill();
  }
  // E (mirrored) and B, spine to spine
  g.font = `bold ${Math.round(h * 0.25)}px ${SERIF}`;
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  g.save();
  g.translate(cx, cy - h * 0.075);
  g.scale(-1, 1);
  g.fillText('E', w * 0.005, 0);
  g.restore();
  g.textAlign = 'left';
  g.fillText('B', cx + w * 0.005, cy - h * 0.075);
  spacedText(g, 'BUGATTI', cx, cy + h * 0.12, h * 0.085, w * 0.5, { font: SERIF, gap: 0.14 });
}

// --- McLaren: the wordmark on anthracite with the papaya speedmark swooping over its end ---
function speedmark(g, color, x, y, s) {
  g.beginPath();
  g.moveTo(x, y + s * 0.7);
  g.quadraticCurveTo(x + s * 0.5, y - s * 0.1, x + s * 1.3, y - s * 0.05);
  g.quadraticCurveTo(x + s * 0.75, y + s * 0.25, x + s * 0.24, y + s * 0.7);
  g.closePath();
  g.fillStyle = color;
  g.fill();
}
function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
function mclarenWordmark(g, { colors }, cx, cy, size, maxWidth, ink = '#ffffff') {
  g.fillStyle = ink;
  g.font = `bold ${size}px ${SANS}`;
  let width = g.measureText('McLaren').width;
  if (width > maxWidth) {
    size *= maxWidth / width;
    g.font = `bold ${size}px ${SANS}`;
    width = maxWidth;
  }
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  g.fillText('McLaren', cx - width / 2, cy + size * 0.36);
  speedmark(g, colors.accent, cx + width * 0.12, cy - size * 1.02, size * 0.95);
}
function drawSpeedmark(g, brand, w, h) {
  roundRect(g, w * 0.03, h * 0.24, w * 0.94, h * 0.52, h * 0.1);
  g.fillStyle = brand.colors.accent;
  g.fill();
  roundRect(g, w * 0.055, h * 0.265, w * 0.89, h * 0.47, h * 0.08);
  g.fillStyle = brand.colors.main;
  g.fill();
  mclarenWordmark(g, brand, w / 2, h * 0.55, h * 0.24, w * 0.8);
}

// --- His own brand: a blue star with his initial ---
function drawStar(g, { colors, mark }, w, h) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = (i % 2 ? 0.22 : 0.46) * w;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    g.lineTo(w / 2 + Math.cos(a) * r, h * 0.52 + Math.sin(a) * r);
  }
  g.closePath();
  g.fillStyle = colors.main;
  g.fill();
  g.lineWidth = w * 0.05;
  g.strokeStyle = colors.accent;
  g.stroke();
  g.fillStyle = colors.accent;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `bold ${Math.round(h * 0.3)}px ${FONT}`;
  g.fillText(mark, w / 2, h * 0.53);
}

const EMBLEM_ART = { bull: drawBull, horse: drawHorse, eb: drawEB, speedmark: drawSpeedmark, star: drawStar };

// A square badge with a transparent background.
export function drawBadge(g, brand, w, h) {
  g.clearRect(0, 0, w, h);
  g.save();
  EMBLEM_ART[brand.emblem](g, brand, w, h);
  g.restore();
}

// A wide plate with the brand's name, in its own style.
export function drawNamePlate(g, brand, w, h) {
  const { plate, ink } = brand.card;
  g.save();
  g.fillStyle = plate;
  g.fillRect(0, 0, w, h);
  g.lineWidth = h * 0.05;
  g.strokeStyle = ink;
  g.strokeRect(h * 0.08, h * 0.08, w - h * 0.16, h - h * 0.16);
  g.fillStyle = ink;
  switch (brand.emblem) {
    case 'bull':
      spacedText(g, 'LAMBORGHINI', w / 2, h * 0.54, h * 0.5, w * 0.86, { gap: 0.22 });
      break;
    case 'horse': {
      // Ferrari's script look: a slanted name, its F's top bar running long over the letters
      g.font = `italic bold ${h * 0.62}px ${SERIF}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('Ferrari', w / 2, h * 0.58);
      const half = g.measureText('Ferrari').width / 2;
      g.fillRect(w / 2 - half * 0.82, h * 0.25, half * 1.9, h * 0.07);
      const stripe = h * 0.3;
      ['#009246', '#ffffff', '#d40000'].forEach((c, i) => {
        g.fillStyle = c;
        g.fillRect(h * 0.25, h * 0.2 + i * stripe * 0.67, h * 0.2, stripe * 0.67);
      });
      break;
    }
    case 'eb':
      spacedText(g, 'BUGATTI', w / 2, h * 0.54, h * 0.5, w * 0.8, { font: SERIF, gap: 0.5 });
      break;
    case 'speedmark':
      mclarenWordmark(g, brand, w / 2, h * 0.58, h * 0.5, w * 0.7, ink);
      break;
    default:
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `bold ${h * 0.56}px ${FONT}`;
      spacedText(g, brand.name.toUpperCase(), w / 2, h * 0.54, h * 0.56, w * 0.86, { font: FONT, gap: 0.02 });
  }
  g.restore();
}
