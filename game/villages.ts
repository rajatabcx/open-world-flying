import { FALLS, heightAt, riverSurface, rng, VILLAGES } from "./terrain";

// Where everything in the villages stands. The meshes, the people, the errands and the
// landing spots all read from this one plan, so they always agree.

const WALLS = ["#fbf7ee", "#f7efdf", "#f4e6cf", "#fffdf8", "#f0dcc0", "#ecc9a2"];
const ROOFS = ["#c9673c", "#b95a35", "#d67a49", "#a94f30"];
const DOORS = ["#2a6f97", "#2f7f79", "#8a3f2f", "#3b5f8f"];

export const VILLAGE_NAMES = ["Porto Lume", "Serravento", "Calanera", "Solmarina"];

export type Home = {
  id: number;
  village: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  w: number;
  d: number;
  h: number;
  wall: string;
  roof: string;
  door: string;
  flat: boolean;
  roofHeight: number;
  chimney: boolean;
};

export type Landmark = { village: number; x: number; y: number; z: number; yaw: number };

const r = rng(777);
const pick = (list: string[]) => list[Math.floor(r() * list.length)];

export const HOMES: Home[] = [];
export const CHAPELS: Landmark[] = [];
export const WINDMILLS: Landmark[] = [];
export const LIGHTHOUSES: Landmark[] = [];

VILLAGES.forEach((v, village) => {
  CHAPELS.push({ village, x: v.x, y: v.h, z: v.z, yaw: r() * 6.28 });
  const placed: { x: number; z: number }[] = [{ x: v.x, z: v.z }];
  const target = 26 + village * 2;
  for (let tries = 0; tries < 240 && placed.length < target; tries++) {
    const a = r() * 6.28;
    const d = 24 + Math.pow(r(), 0.7) * v.r * 0.95;
    const x = v.x + Math.cos(a) * d;
    const z = v.z + Math.sin(a) * d;
    if (placed.some((p) => Math.hypot(x - p.x, z - p.z) < 19)) continue;
    const y = heightAt(x, z);
    if (y < 2) continue;
    placed.push({ x, z });
    const yaw = Math.atan2(v.x - x, v.z - z) + (r() - 0.5) * 0.5;
    const width = 7 + r() * 6;
    const depth = 7 + r() * 5;
    const height = 5.5 + r() * 5.5;
    const wall = pick(WALLS);
    const roof = pick(ROOFS);
    const flat = r() < 0.25;
    const roofHeight = flat ? 0.7 : 3.1 + r() * 1.2;
    const door = pick(DOORS);
    const chimney = r() < 0.4;
    HOMES.push({ id: HOMES.length, village, x, y, z, yaw, w: width, d: depth, h: height, wall, roof, door, flat, roofHeight, chimney });
  }
  for (let i = 0; i < 2; i++) {
    const a = r() * 6.28;
    const x = v.x + Math.cos(a) * v.r * 1.08;
    const z = v.z + Math.sin(a) * v.r * 1.08;
    const y = heightAt(x, z);
    if (y > 3) WINDMILLS.push({ village, x, y, z, yaw: a + Math.PI / 2 + Math.PI });
  }
  // Each village keeps a lighthouse on its seaward side.
  const out = Math.atan2(v.z, v.x);
  const lx = v.x + Math.cos(out) * v.r * 1.2;
  const lz = v.z + Math.sin(out) * v.r * 1.2;
  LIGHTHOUSES.push({ village, x: lx, y: Math.max(heightAt(lx, lz), 0) - 0.5, z: lz, yaw: 0 });
});

/** Turns a point in a building's own space into world space. */
export function fromLocal(b: { x: number; z: number; yaw: number }, x: number, z: number) {
  const c = Math.cos(b.yaw);
  const s = Math.sin(b.yaw);
  return { x: b.x + x * c + z * s, z: b.z - x * s + z * c };
}

/** The spot just outside a home's front door. */
export function doorstep(home: Home, out = 3.4) {
  const p = fromLocal(home, 0, home.d / 2 + out);
  return { x: p.x, y: heightAt(p.x, p.z), z: p.z };
}

/** The highest thing you could set down on here, or null over water. */
export function landingHeight(x: number, z: number) {
  const ground = heightAt(x, z);
  if (ground < 0.8 || riverSurface(x, z) !== null) return null;
  if (Math.hypot(x - FALLS.x, z - FALLS.z) < FALLS.r + 2) return null;
  let top = ground;
  for (const home of HOMES) {
    const dx = x - home.x;
    const dz = z - home.z;
    if (dx * dx + dz * dz > 120) continue;
    const c = Math.cos(home.yaw);
    const s = Math.sin(home.yaw);
    const lx = Math.abs(dx * c - dz * s);
    const lz = Math.abs(dx * s + dz * c);
    const halfW = home.w / 2 + 0.6;
    const halfD = home.d / 2 + 0.6;
    if (lx > halfW || lz > halfD) continue;
    const rise = home.flat ? 0.7 : home.roofHeight * (1 - Math.max(lx / halfW, lz / halfD));
    top = Math.max(top, home.y + home.h + (home.flat ? 0 : 0.05) + rise);
  }
  return top;
}
