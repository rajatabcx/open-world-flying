import { fbm, GRID, heightAt, rng, slopeAt, VILLAGES, WORLD_SIZE } from "./terrain";

export type TreeKind = "cypress" | "olive" | "pine";

export type Tree = {
  kind: TreeKind;
  index: number;
  x: number;
  y: number;
  z: number;
  scale: number;
  yaw: number;
  shade: number;
  radius: number;
  height: number;
  /** Clock time of the last hit, so one tree can't hit twice in a row. */
  lastHit: number;
  wobble: number;
};

const SHAPE: Record<TreeKind, { radius: number; height: number }> = {
  cypress: { radius: 2.3, height: 22 },
  olive: { radius: 5, height: 10.5 },
  pine: { radius: 6, height: 15 },
};

function scatter() {
  const r = rng(90210);
  const lists: Record<TreeKind, Tree[]> = { cypress: [], olive: [], pine: [] };
  for (let i = 0; i < 46000; i++) {
    const x = (r() - 0.5) * 3700;
    const z = (r() - 0.5) * 3700;
    const y = heightAt(x, z);
    if (y < 5 || y > 330 || slopeAt(x, z) > 0.62) continue;
    const near = VILLAGES.some((v) => Math.hypot(x - v.x, z - v.z) < v.r * 0.72);
    if (near && r() > 0.05) continue;
    const density = fbm(x * 0.0065 + 31, z * 0.0065 + 8, 3);
    if (density < 0.47 + r() * 0.1) continue;
    const scale = 0.8 + r() * 0.65;
    const yaw = r() * 6.28;
    const shade = 0.82 + r() * 0.3;
    const pick = r();
    const kind: TreeKind = pick < 0.26 || (near && pick < 0.75) ? "cypress" : y > 170 || pick > 0.82 ? "pine" : "olive";
    const list = lists[kind];
    list.push({
      kind,
      index: list.length,
      x,
      y: y - 0.6,
      z,
      scale,
      yaw,
      shade,
      radius: SHAPE[kind].radius * scale,
      height: SHAPE[kind].height * scale,
      lastHit: -10,
      wobble: 0,
    });
  }
  return lists;
}

export const TREES = scatter();

// Trees are bucketed by area, so a flight step only checks the few nearby.
const CELL = 30;
const cellKey = (cx: number, cz: number) => cx * 100003 + cz;
const buckets = new Map<number, Tree[]>();
for (const list of Object.values(TREES)) {
  for (const t of list) {
    const key = cellKey(Math.floor(t.x / CELL), Math.floor(t.z / CELL));
    const bucket = buckets.get(key);
    if (bucket) bucket.push(t);
    else buckets.set(key, [t]);
  }
}

/** Returns a tree the point is touching, or null. */
export function treeAt(x: number, y: number, z: number, reach: number): Tree | null {
  const cx = Math.floor(x / CELL);
  const cz = Math.floor(z / CELL);
  for (let i = -1; i <= 1; i++) {
    for (let j = -1; j <= 1; j++) {
      const bucket = buckets.get(cellKey(cx + i, cz + j));
      if (!bucket) continue;
      for (const t of bucket) {
        const up = y - t.y;
        if (up < -1 || up > t.height) continue;
        // Cypress trees taper, while the others are widest in the crown.
        const taper = t.kind === "cypress" ? 1 - (up / t.height) * 0.75 : up < t.height * 0.45 ? 0.3 : 1;
        if (Math.hypot(x - t.x, z - t.z) < t.radius * taper + reach) return t;
      }
    }
  }
  return null;
}

/** How much each terrain vertex sits under a tree, so forests read from the air. */
export function treeShade() {
  const row = GRID + 1;
  const shade = new Float32Array(row * row);
  for (const list of Object.values(TREES)) {
    for (const t of list) {
      const i = Math.round((t.x / WORLD_SIZE + 0.5) * GRID);
      const j = Math.round((t.z / WORLD_SIZE + 0.5) * GRID);
      if (i < 0 || j < 0 || i >= row || j >= row) continue;
      shade[j * row + i] = Math.min(1, shade[j * row + i] + 0.7);
    }
  }
  return shade;
}
