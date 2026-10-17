// The prize cars' tricks: the flying lady rising from the bonnet, coach doors swinging open the "wrong"
// way, side pipes puffing, the starlight roof twinkling and the limo's disco lights flashing on a honk.
// Works on the nodes collectFx() finds, touching only plain numbers, `visible` and the emissive colour.

export const DOOR_TIME = 1.2;
export const DOOR_OPEN = 1.2; // radians
export const ORNAMENT_TIME = 0.6;
export const UMBRELLA_TIME = 3;
export const DISCO_TIME = 2;
export const PUFF_TIME = 1;
export const PARTY_COLORS = [0xff1744, 0x00e5ff, 0xffea00, 0x76ff03, 0xd500f9];
export const DISCO_GLOW = 0x7c4dff;
const DISCO_STEP = 0.15;

const clamp01 = v => Math.min(1, Math.max(0, v));
const smooth = k => k * k * (3 - 2 * k);

// Open by 0.3 s, held open until 0.8 s, shut again by DOOR_TIME.
export function doorAngle(t) {
  if (t <= 0 || t >= DOOR_TIME) return 0;
  if (t < 0.3) return DOOR_OPEN * smooth(t / 0.3);
  if (t <= 0.8) return DOOR_OPEN;
  return DOOR_OPEN * smooth(1 - (t - 0.8) / (DOOR_TIME - 0.8));
}

// How far up the flying lady is, t seconds after she started rising (up) or sinking.
export function ornamentLevel(t, up) {
  const s = smooth(clamp01(t / ORNAMENT_TIME));
  return up ? s : 1 - s;
}

export const discoOn = t => t >= 0 && t < DISCO_TIME;

export function createTricks(fx) {
  let up = false;
  let level = 0; // tucked away, so she rises when he gets in (the mesh draws her up, as friends see her)
  let doorT = Infinity;
  let discoT = Infinity;
  let puffT = Infinity;
  let clock = 0;

  function apply() {
    const k = smooth(level);
    for (const n of fx.ornaments) {
      const { low, high } = n.userData.ornament;
      n.position.y = level >= 1 ? high : level <= 0 ? low : low + (high - low) * k;
    }
    const angle = doorAngle(doorT);
    for (const n of fx.coachDoors) n.rotation.y = angle ? n.userData.coachDoor.side * angle : 0;
    const party = discoOn(discoT);
    fx.discos.forEach((n, i) => {
      n.material.emissive.setHex(party ? PARTY_COLORS[(Math.floor(discoT / DISCO_STEP) + i) % PARTY_COLORS.length] : DISCO_GLOW);
      n.material.emissiveIntensity = party ? 1.6 : 0.4;
    });
    const puffing = puffT < PUFF_TIME;
    for (const n of fx.puffs) {
      n.visible = puffing;
      if (puffing) n.scale.setScalar(1 + 1.5 * (puffT / PUFF_TIME));
    }
    fx.stars.forEach((n, i) => n.scale.setScalar(0.6 + 0.6 * Math.abs(Math.sin(clock * 2.5 + i * 1.7))));
  }

  return {
    has: { umbrella: fx.coachDoors.length > 0, stars: fx.stars.length > 0, disco: fx.discos.length > 0 },
    // A parked car: the flying lady tucked away at once.
    park() {
      up = false;
      level = 0;
      apply();
    },
    getIn() {
      up = true;
      doorT = 0;
      puffT = 0;
    },
    getOut() {
      up = false;
      doorT = 0;
    },
    honk() {
      discoT = 0;
    },
    update(dt) {
      clock += dt;
      doorT += dt;
      discoT += dt;
      puffT += dt;
      level = clamp01(level + (up ? dt : -dt) / ORNAMENT_TIME);
      apply();
    },
  };
}
