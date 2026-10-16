// Toy badges and name plates, drawn on a canvas: a brand's own colours and initial — never the official logo.
const FONT = 'Fredoka, Arial Rounded MT Bold, sans-serif';

function outline(g, shape, w, h) {
  g.beginPath();
  if (shape === 'oval') {
    g.ellipse(w / 2, h / 2, w * 0.46, h * 0.34, 0, 0, Math.PI * 2);
  } else if (shape === 'star') {
    for (let i = 0; i < 10; i++) {
      const r = (i % 2 ? 0.22 : 0.46) * w;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      g.lineTo(w / 2 + Math.cos(a) * r, h * 0.52 + Math.sin(a) * r);
    }
    g.closePath();
  } else {
    // shield: flat top, curved sides down to a point
    g.moveTo(w * 0.12, h * 0.08);
    g.lineTo(w * 0.88, h * 0.08);
    g.lineTo(w * 0.88, h * 0.5);
    g.quadraticCurveTo(w * 0.86, h * 0.8, w * 0.5, h * 0.95);
    g.quadraticCurveTo(w * 0.14, h * 0.8, w * 0.12, h * 0.5);
    g.closePath();
  }
}

// A square badge with a transparent background.
export function drawBadge(g, brand, w, h) {
  g.clearRect(0, 0, w, h);
  outline(g, brand.shape, w, h);
  g.fillStyle = brand.bg;
  g.fill();
  g.lineWidth = w * 0.05;
  g.strokeStyle = brand.fg;
  g.stroke();
  g.fillStyle = brand.fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `bold ${Math.round(h * (brand.shape === 'star' ? 0.3 : 0.48))}px ${FONT}`;
  g.fillText(brand.mark, w / 2, h * (brand.shape === 'oval' ? 0.53 : 0.5));
}

// A wide plate with the brand's name.
export function drawNamePlate(g, brand, w, h) {
  g.fillStyle = brand.bg;
  g.fillRect(0, 0, w, h);
  g.lineWidth = h * 0.08;
  g.strokeStyle = brand.fg;
  g.strokeRect(h * 0.06, h * 0.06, w - h * 0.12, h - h * 0.12);
  g.fillStyle = brand.fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const name = brand.name.toUpperCase();
  let size = h * 0.56;
  g.font = `bold ${size}px ${FONT}`;
  const fit = (w * 0.86) / g.measureText(name).width;
  if (fit < 1) {
    size *= fit;
    g.font = `bold ${size}px ${FONT}`;
  }
  g.fillText(name, w / 2, h * 0.54);
}
