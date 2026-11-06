// The island is one deterministic height function, baked to a grid so the mesh
// and the flight code agree on where the ground is.

export const WORLD_SIZE = 4200;
export const GRID = 720;
export const SEA_FLOOR = -70;

const hash = (x: number, y: number) => {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return h - Math.floor(h);
};

function noise(x: number, y: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const a = hash(ix, iy);
  const b = hash(ix + 1, iy);
  const c = hash(ix, iy + 1);
  const d = hash(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

export function fbm(x: number, y: number, octaves = 4) {
  let sum = 0;
  let amp = 0.5;
  for (let i = 0; i < octaves; i++) {
    sum += noise(x, y) * amp;
    x = x * 2.03 + 11.3;
    y = y * 2.03 + 7.7;
    amp *= 0.5;
  }
  return sum / (1 - Math.pow(0.5, octaves));
}

function ridged(x: number, y: number) {
  let sum = 0;
  let amp = 0.5;
  for (let i = 0; i < 4; i++) {
    sum += (1 - Math.abs(noise(x, y) * 2 - 1)) * amp;
    x = x * 2.1 + 3.1;
    y = y * 2.1 + 9.2;
    amp *= 0.5;
  }
  return sum / 0.9375;
}

export const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

export function coastRadius(angle: number) {
  return 1450 + 230 * Math.sin(angle * 3 + 1) + 130 * Math.sin(angle * 5 + 0.7);
}

const polar = (angle: number, frac: number) => ({
  x: Math.cos(angle) * coastRadius(angle) * frac,
  z: Math.sin(angle) * coastRadius(angle) * frac,
});

// Peaks and mesas. The lower ones wall in the canyon.
const PEAKS = [
  { x: -260, z: -320, h: 640, r: 470 },
  { x: 430, z: -300, h: 430, r: 330 },
  { x: -820, z: 260, h: 370, r: 340 },
  { x: -180, z: -1000, h: 460, r: 340 },
  { x: 300, z: 340, h: 230, r: 230 },
  { x: 720, z: 80, h: 200, r: 220 },
  { x: 120, z: 900, h: 260, r: 290 },
];

export type Site = { x: number; z: number; h: number; r: number };

export const VILLAGES: Site[] = [
  { ...polar(0.85, 0.86), h: 8, r: 170 },
  { x: -420, z: 620, h: 62, r: 140 },
  { ...polar(3.6, 0.84), h: 46, r: 140 },
  { ...polar(-1.9, 0.86), h: 14, r: 150 },
];

// The canyon runs from the high valley out to the sea.
const CANYON = [
  { x: -40, z: -80, h: 150 },
  { x: 180, z: 70, h: 95 },
  { x: 470, z: 190, h: 45 },
  { x: 760, z: 390, h: 12 },
  { x: 1130, z: 560, h: -8 },
  { x: 1560, z: 720, h: -14 },
];

const STACKS = [0.1, 1.5, 1.62, 2.5, 4.3, 4.42, 5.3].map((angle, i) => ({
  ...polar(angle, 1.08 + (i % 3) * 0.03),
  h: 95 + (i % 4) * 28,
  r: 34 + (i % 3) * 9,
}));

function canyonAt(x: number, z: number) {
  let best = Infinity;
  let target = 0;
  for (let i = 0; i < CANYON.length - 1; i++) {
    const a = CANYON[i];
    const b = CANYON[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const t = Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
    const d = Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
    if (d < best) {
      best = d;
      target = mix(a.h, b.h, t);
    }
  }
  return { d: best + (fbm(x * 0.01, z * 0.01, 2) - 0.5) * 50, target };
}

// The river falls from a hidden bowl at the head of the canyon, then winds down to the sea.
const BACK = { x: -0.83, z: -0.56 };
export const FALLS = { x: CANYON[0].x, z: CANYON[0].z, floor: 147, top: 322, r: 48, back: BACK, pool: 148.4 };

export type RiverPoint = { x: number; z: number; y: number; width: number };

function canyonLine(t: number) {
  const f = t * (CANYON.length - 1);
  const i = Math.min(CANYON.length - 2, Math.floor(f));
  const k = f - i;
  const a = CANYON[i];
  const b = CANYON[i + 1];
  return { x: mix(a.x, b.x, k), z: mix(a.z, b.z, k), h: mix(a.h, b.h, k), nx: -(b.z - a.z), nz: b.x - a.x };
}

export const RIVER: RiverPoint[] = (() => {
  const list: RiverPoint[] = [];
  const steps = 160;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const c = canyonLine(t);
    const length = Math.hypot(c.nx, c.nz);
    // It meanders across the canyon floor, staying straight where it leaves the bowl.
    const swing = (Math.sin(t * 26) * 13 + Math.sin(t * 58 + 1) * 5) * smooth(0, 0.08, t);
    const y = Math.min(FALLS.pool, c.h - 1.8);
    list.push({ x: c.x + (c.nx / length) * swing, z: c.z + (c.nz / length) * swing, y: Math.max(y, 0.15), width: mix(9, 25, t * 1.6) });
    if (y <= 0.15) break;
  }
  return list;
})();

function riverAt(x: number, z: number) {
  let best = Infinity;
  let at = RIVER[0];
  for (let i = 0; i < RIVER.length - 1; i += 2) {
    const p = RIVER[i];
    const d = (x - p.x) * (x - p.x) + (z - p.z) * (z - p.z);
    if (d < best) {
      best = d;
      at = p;
    }
  }
  return { d: Math.sqrt(best), at };
}

/** The water surface under a point on the river, or null if it's dry land. */
export function riverSurface(x: number, z: number) {
  if (Math.abs(x - 500) > 620 || Math.abs(z - 200) > 420) return null;
  const { d, at } = riverAt(x, z);
  return d < at.width ? at.y : null;
}

// Flat-topped hills, with their rock laid down in bands.
const MESAS = [
  { x: 1020, z: -340, h: 150, r: 150 },
  { x: -1120, z: -560, h: 190, r: 170 },
  { x: 560, z: -930, h: 170, r: 130 },
  { x: -1150, z: 760, h: 120, r: 110 },
];

const banded = (h: number, step: number) => {
  const s = h / step;
  const whole = Math.floor(s);
  return (whole + smooth(0.68, 1, s - whole)) * step;
};

// A drowned temple on a shallow shelf, clear enough to see from the air.
export const RUIN = { ...polar(2.02, 1.07), floor: -9, r: 130 };

/** The island as it would be with no caves running through it. */
function rawHeight(x: number, z: number) {
  const r = Math.hypot(x, z);
  const coast = coastRadius(Math.atan2(z, x)) + (fbm(x * 0.0016, z * 0.0016, 3) - 0.5) * 340;
  const t = 1 - r / coast;
  const land = smooth(-0.02, 0.2, t);

  let h = mix(SEA_FLOOR, 24, smooth(-0.14, 0.14, t));
  h += (fbm(x * 0.0034, z * 0.0034, 4) - 0.42) * 120 * land;

  const rugged = ridged(x * 0.0042 + 5, z * 0.0042 + 2);
  for (const p of PEAKS) {
    const d = Math.hypot(x - p.x, z - p.z) / p.r;
    h += p.h * Math.exp(-d * d * 1.7) * (0.55 + 0.62 * rugged);
  }
  h += (fbm(x * 0.021, z * 0.021, 3) - 0.5) * 12 * land;
  // Rolling hills, so the lowlands are never quite flat.
  h += (fbm(x * 0.0085 + 40, z * 0.0085 + 12, 3) - 0.5) * 34 * land;
  // Dunes along parts of the shore.
  const duneZone = smooth(0.02, 0.09, t) * (1 - smooth(0.11, 0.2, t)) * smooth(0.42, 0.58, fbm(x * 0.0018 + 77, z * 0.0018, 2));
  h += Math.sin((x * 0.6 + z) * 0.055 + fbm(x * 0.006, z * 0.006, 2) * 7) * 3.2 * duneZone;
  for (const m of MESAS) {
    const d = Math.hypot(x - m.x, z - m.z) / m.r + (fbm(x * 0.018, z * 0.018, 2) - 0.5) * 0.3;
    h += m.h * smooth(1.05, 0.72, d) * land;
  }
  // In some regions the high rock breaks into stepped layers.
  const layered = smooth(0.47, 0.6, fbm(x * 0.0026 + 9, z * 0.0026 + 3, 2)) * smooth(70, 130, h) * (1 - smooth(380, 470, h));
  if (layered > 0) h = mix(h, banded(h, 24), layered * 0.82);

  const canyon = canyonAt(x, z);
  h = mix(h, canyon.target, smooth(105, 38, canyon.d));
  if (canyon.d < 200) {
    const river = riverAt(x, z);
    if (river.d < river.at.width + 60) {
      h = mix(h, river.at.y + 1.3, smooth(river.at.width + 50, river.at.width + 6, river.d));
      h = mix(h, river.at.y - 1.8, smooth(river.at.width + 1, river.at.width * 0.6, river.d));
    }
  }

  for (const s of STACKS) {
    const d = Math.hypot(x - s.x, z - s.z) / s.r;
    const jag = ridged(x * 0.02 + s.x, z * 0.02 + s.z);
    const v = s.h * Math.exp(-Math.pow(d * (0.75 + jag * 0.55), 3)) * (0.55 + 0.6 * jag);
    // Fade down to the seabed, so a stack doesn't raise the sea floor around it.
    h = Math.max(h, v - 70 * (1 - Math.min(1, v / (s.h * 0.2))));
  }
  h = fallsBowl(x, z, h);
  const ruin = Math.hypot(x - RUIN.x, z - RUIN.z);
  if (ruin < RUIN.r * 1.7) h = mix(h, RUIN.floor + (fbm(x * 0.05, z * 0.05, 2) - 0.5) * 2.2, smooth(RUIN.r * 1.7, RUIN.r, ruin));
  for (const v of VILLAGES) {
    const d = Math.hypot(x - v.x, z - v.z);
    // Farmed terraces step up the hillsides around each village.
    const ring = smooth(v.r * 1.05, v.r * 1.3, d) * (1 - smooth(v.r * 1.9, v.r * 2.5, d));
    if (ring > 0 && h > 6) h = mix(h, banded(h, 6.5), ring * 0.85);
    h = mix(h, v.h, smooth(v.r * 1.5, v.r * 0.85, d));
  }
  return h;
}

function fallsBowl(x: number, z: number, h: number) {
  const dx = x - FALLS.x;
  const dz = z - FALLS.z;
  const d = Math.hypot(dx, dz);
  const along = dx * BACK.x + dz * BACK.z;
  const across = Math.abs(dx * -BACK.z + dz * BACK.x);
  if (d < FALLS.r + 120) {
    // A sheer horseshoe of rock, open on the canyon side.
    const wall = smooth(FALLS.r, FALLS.r + 22, d) * smooth(-55, 10, along);
    const target = FALLS.floor + (FALLS.top - FALLS.floor) * wall;
    h = mix(h, target, smooth(FALLS.r + 110, FALLS.r + 40, d));
  }
  // A narrow stream cut above the lip, which feeds the falls.
  if (along > FALLS.r + 20 && along < FALLS.r + 170 && across < 34) {
    const bed = FALLS.top + (along - FALLS.r - 20) * 0.16;
    h = mix(h, Math.min(h, bed), smooth(30, 13, across));
  }
  return h;
}

// Caves are the one thing a height map can't hold, so each is a trench cut through the
// ground and covered by a rock lid that follows the original hillside exactly.
export type CavePoint = { x: number; z: number; floor: number; surface: number };
export type Cave = { name: string; points: CavePoint[]; half: number; roof: number; minX: number; maxX: number; minZ: number; maxZ: number };

export const CAVE_HALF = 21;
export const CAVE_ROOF = 25;
const CAVE_STEP = 9;

function makeCave(name: string, x: number, z: number, angle: number, floor: number, slope: number, maxLength: number): Cave {
  const dx = Math.cos(angle);
  const dz = Math.sin(angle);
  const points: CavePoint[] = [];
  let buried = false;
  for (let s = 0; s <= maxLength; s += CAVE_STEP) {
    const px = x + dx * s;
    const pz = z + dz * s;
    const f = floor + s * slope;
    const surface = rawHeight(px, pz);
    points.push({ x: px, z: pz, floor: f, surface });
    if (surface > f + CAVE_ROOF + 6) buried = true;
    if (buried && surface < f + 8) break;
  }
  const pad = CAVE_HALF + 20;
  return {
    name,
    points,
    half: CAVE_HALF,
    roof: CAVE_ROOF,
    minX: Math.min(...points.map((p) => p.x)) - pad,
    maxX: Math.max(...points.map((p) => p.x)) + pad,
    minZ: Math.min(...points.map((p) => p.z)) - pad,
    maxZ: Math.max(...points.map((p) => p.z)) + pad,
  };
}

export const CAVES: Cave[] = [
  // Behind the waterfall and out through the mountain.
  makeCave("Behind the falls", FALLS.x + BACK.x * (FALLS.r - 4), FALLS.z + BACK.z * (FALLS.r - 4), Math.atan2(BACK.z, BACK.x), FALLS.floor + 2, 0.13, 1500),
  // A side passage from the canyon, north through the round hill.
  makeCave("The Hollow Hill", 316, 205, 1.65, 70, 0.075, 800),
  // South from the lower canyon, under the eastern hill.
  makeCave("The Long Dark", 683, 262, -1.35, 25, 0.09, 900),
];

/** Finds the cave corridor at a point on the ground, if there is one. */
export function caveAt(x: number, z: number) {
  for (const cave of CAVES) {
    if (x < cave.minX || x > cave.maxX || z < cave.minZ || z > cave.maxZ) continue;
    let bestSq = Infinity;
    let floor = 0;
    let index = 0;
    let lateral = 0;
    for (let i = 0; i < cave.points.length - 1; i++) {
      const a = cave.points[i];
      const b = cave.points[i + 1];
      const ex = b.x - a.x;
      const ez = b.z - a.z;
      const t = Math.min(1, Math.max(0, ((x - a.x) * ex + (z - a.z) * ez) / (ex * ex + ez * ez)));
      const qx = x - a.x - ex * t;
      const qz = z - a.z - ez * t;
      const dSq = qx * qx + qz * qz;
      if (dSq < bestSq) {
        bestSq = dSq;
        floor = mix(a.floor, b.floor, t);
        index = i;
        lateral = (ex * qz - ez * qx) / Math.hypot(ex, ez);
      }
    }
    const distance = Math.sqrt(bestSq);
    if (distance < cave.half + 14) return { cave, distance, floor, index, lateral };
  }
  return null;
}

function finalHeight(x: number, z: number) {
  const h = rawHeight(x, z);
  const inCave = caveAt(x, z);
  if (!inCave) return h;
  // Never raise the ground to make a floor, so entrances meet the hillside naturally.
  return mix(h, Math.min(h, inCave.floor), smooth(inCave.cave.half + 14, inCave.cave.half - 2, inCave.distance));
}

/** The untouched hillside, which the rock lid over a cave copies. */
export const surfaceAt = rawHeight;

export const heights = (() => {
  const data = new Float32Array((GRID + 1) * (GRID + 1));
  for (let j = 0; j <= GRID; j++) {
    for (let i = 0; i <= GRID; i++) {
      data[j * (GRID + 1) + i] = finalHeight(((i / GRID) - 0.5) * WORLD_SIZE, ((j / GRID) - 0.5) * WORLD_SIZE);
    }
  }
  return data;
})();

export function heightAt(x: number, z: number) {
  const fx = (x / WORLD_SIZE + 0.5) * GRID;
  const fz = (z / WORLD_SIZE + 0.5) * GRID;
  if (fx < 0 || fz < 0 || fx >= GRID || fz >= GRID) return SEA_FLOOR;
  const i = Math.floor(fx);
  const j = Math.floor(fz);
  const tx = fx - i;
  const tz = fz - j;
  const row = GRID + 1;
  const a = heights[j * row + i];
  const b = heights[j * row + i + 1];
  const c = heights[(j + 1) * row + i];
  const d = heights[(j + 1) * row + i + 1];
  return mix(mix(a, b, tx), mix(c, d, tx), tz);
}

export function slopeAt(x: number, z: number) {
  const e = WORLD_SIZE / GRID;
  return Math.hypot(heightAt(x + e, z) - heightAt(x - e, z), heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
}

export function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const summit = (() => {
  // The highest grid point around the main peak is where the summit start goes.
  let best = { x: 0, z: 0, h: -Infinity };
  for (let z = -700; z < 60; z += 10) {
    for (let x = -640; x < 120; x += 10) {
      const h = heightAt(x, z);
      if (h > best.h) best = { x, z, h };
    }
  }
  return best;
})();

export const SUMMIT = summit;

export const ARCHES = [
  { ...polar(0.55, 1.04), yaw: 0.4, size: 62 },
  { ...polar(2.9, 1.05), yaw: 1.3, size: 52 },
  { ...polar(5.0, 1.04), yaw: 2.2, size: 72 },
];

export const PLACES = {
  summit: { x: SUMMIT.x, y: SUMMIT.h + 34, z: SUMMIT.z, yaw: -2.2, label: "The mountaintop" },
  shore: { x: VILLAGES[0].x + 50, y: 18, z: VILLAGES[0].z + 60, yaw: 2.4, label: "The shore" },
};
export type PlaceId = keyof typeof PLACES;
