// The island is one deterministic height function, baked to a grid so the mesh
// and the flight code agree on where the ground is.

export const WORLD_SIZE = 4200;
export const GRID = 560;
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

  const canyon = canyonAt(x, z);
  h = mix(h, canyon.target, smooth(105, 38, canyon.d));

  for (const s of STACKS) {
    const d = Math.hypot(x - s.x, z - s.z) / s.r;
    const jag = ridged(x * 0.02 + s.x, z * 0.02 + s.z);
    const v = s.h * Math.exp(-Math.pow(d * (0.75 + jag * 0.55), 3)) * (0.55 + 0.6 * jag);
    // Fade down to the seabed, so a stack doesn't raise the sea floor around it.
    h = Math.max(h, v - 70 * (1 - Math.min(1, v / (s.h * 0.2))));
  }
  for (const v of VILLAGES) {
    const d = Math.hypot(x - v.x, z - v.z);
    h = mix(h, v.h, smooth(v.r * 1.5, v.r * 0.85, d));
  }
  return h;
}

export const heights = (() => {
  const data = new Float32Array((GRID + 1) * (GRID + 1));
  for (let j = 0; j <= GRID; j++) {
    for (let i = 0; i <= GRID; i++) {
      data[j * (GRID + 1) + i] = rawHeight(((i / GRID) - 0.5) * WORLD_SIZE, ((j / GRID) - 0.5) * WORLD_SIZE);
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
