// All sounds are made with oscillators: no audio files to download or license.
let ctx = null;

// iPad Safari only allows sound after a touch, so main.js calls this on every pointerdown.
export function unlockAudio() {
  if (!ctx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    ctx = new AudioCtx();
  }
  if (ctx.state !== 'running') ctx.resume(); // 'suspended', or iOS 'interrupted' after a call or app switch
}

let volumeScale = 1;
// Plays some sfx quieter: a friend's horn on the far side of the city is only just heard.
export function atVolume(scale, play) {
  if (scale < 0.03) return;
  const before = volumeScale;
  volumeScale = Math.min(1, scale);
  try { play(); } finally { volumeScale = before; }
}

function tone(freq, duration, { type = 'sine', volume = 0.2, delay = 0, slideTo = null } = {}) {
  if (!ctx) return;
  volume *= volumeScale;
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

export const sfx = {
  snap() { tone(1200, 0.05, { type: 'square', volume: 0.12 }); tone(1800, 0.06, { type: 'square', volume: 0.08, delay: 0.04 }); },
  pop() { tone(500, 0.12, { slideTo: 220, volume: 0.18 }); },
  wrong() { tone(260, 0.14, { type: 'triangle', volume: 0.25 }); tone(200, 0.2, { type: 'triangle', volume: 0.25, delay: 0.12 }); },
  success() { [523, 659, 784].forEach((f, i) => tone(f, 0.18, { type: 'triangle', delay: i * 0.09 })); },
  beep() { tone(660, 0.18, { type: 'square', volume: 0.12 }); },
  go() { tone(990, 0.5, { type: 'square', volume: 0.14 }); },
  fanfare() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, i === 5 ? 0.6 : 0.16, { type: 'triangle', volume: 0.22, delay: i * 0.13 })); },
  flip() { tone(300, 0.35, { slideTo: 900, volume: 0.2 }); },
  horn() { tone(415, 0.14, { type: 'square', volume: 0.16 }); tone(415, 0.2, { type: 'square', volume: 0.16, delay: 0.2 }); },
  whoosh() { tone(180, 0.6, { type: 'sawtooth', volume: 0.12, slideTo: 60 }); tone(900, 0.4, { volume: 0.06, slideTo: 300 }); },
  whoa() { tone(480, 0.25, { type: 'triangle', volume: 0.12, slideTo: 880 }); },
  coin() { tone(1320, 0.08, { type: 'square', volume: 0.08 }); tone(1980, 0.14, { type: 'square', volume: 0.07, delay: 0.06 }); },
  bigCoin() { [1047, 1319, 1568, 2093].forEach((f, i) => tone(f, 0.16, { type: 'triangle', volume: 0.16, delay: i * 0.05 })); },
  cheer() { [523, 784, 1047].forEach((f, i) => tone(f, 0.22, { type: 'sawtooth', volume: 0.1, delay: i * 0.08 })); tone(200, 0.5, { type: 'triangle', volume: 0.12, slideTo: 600 }); },
  woof() { tone(220, 0.09, { type: 'sawtooth', volume: 0.18, slideTo: 150 }); tone(240, 0.12, { type: 'sawtooth', volume: 0.18, slideTo: 160, delay: 0.16 }); },
  tick() { tone(880, 0.05, { type: 'sine', volume: 0.08 }); },
};

export function speak(text) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.95;
  utterance.pitch = 1.1;
  speechSynthesis.speak(utterance);
}

// setSoft: a quieter, deeper hum for the posh cars (the Rolls-Royce purrs).
export function createEngineSound() {
  if (!ctx) return { setSpeed() {}, setSoft() {}, silence() {}, stop() {} };
  let soft = false;
  const osc = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  osc.type = 'sawtooth';
  filter.type = 'lowpass';
  filter.frequency.value = 600;
  gain.gain.value = 0;
  osc.connect(filter).connect(gain).connect(ctx.destination);
  osc.start();
  return {
    setSpeed(mps) {
      const t = ctx.currentTime;
      osc.frequency.setTargetAtTime((soft ? 40 : 55) + mps * (soft ? 4 : 7), t, 0.1);
      gain.gain.setTargetAtTime((0.035 + Math.min(mps, 20) * 0.002) * (soft ? 0.45 : 1), t, 0.1);
    },
    setSoft(on) {
      soft = !!on;
      filter.frequency.setTargetAtTime(soft ? 320 : 600, ctx.currentTime, 0.1);
    },
    silence() { gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05); },
    stop() { gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05); osc.stop(ctx.currentTime + 0.3); },
  };
}

// Wee-woo: a tone that hops between two notes until stopped. setVolume: quieter for a friend far away.
export function createSirenSound(volume = 0.08) {
  let osc = null;
  let gain = null;
  let timer = 0;
  return {
    start() {
      if (!ctx || osc) return;
      osc = ctx.createOscillator();
      gain = ctx.createGain();
      osc.type = 'triangle';
      gain.gain.value = volume;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      let high = false;
      const hop = () => {
        high = !high;
        osc.frequency.setTargetAtTime(high ? 960 : 650, ctx.currentTime, 0.05);
      };
      hop();
      timer = setInterval(hop, 450);
    },
    setVolume(v) {
      volume = v;
      if (gain) gain.gain.setTargetAtTime(v, ctx.currentTime, 0.1);
    },
    stop() {
      if (!osc) return;
      clearInterval(timer);
      gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
      osc.stop(ctx.currentTime + 0.2);
      osc = null;
    },
  };
}
