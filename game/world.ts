import { CatmullRomCurve3, Vector3 } from "three";
import { FALLS, heightAt, PLACES, RIVER, rng, SUMMIT, VILLAGES } from "./terrain";

export const SUN = new Vector3(-0.55, 0.62, 0.42).normalize();
export const HORIZON = "#d9e6e4";
export const FOG_NEAR = 900;
export const FOG_FAR = 4600;

export type Balloon = {
  base: Vector3;
  pos: Vector3;
  radius: number;
  height: number;
  variant: number;
  phase: number;
  squash: number;
  squashVel: number;
};

const r = rng(4242);
const ground = (x: number, z: number) => Math.max(heightAt(x, z), 0);

function makeBalloons(): Balloon[] {
  const list: Balloon[] = [];
  const add = (x: number, z: number, clearance: number) => {
    const y = ground(x, z) + clearance;
    const height = 42 + r() * 14;
    list.push({
      base: new Vector3(x, y, z),
      pos: new Vector3(x, y, z),
      radius: height * 0.34,
      height,
      variant: list.length % 2,
      phase: r() * 6.28,
      squash: 0,
      squashVel: 0,
    });
  };
  // A loose trail of balloons runs down from the summit to the first village.
  const v = VILLAGES[0];
  for (let i = 1; i <= 9; i++) {
    const t = i / 10;
    add(SUMMIT.x + (v.x - SUMMIT.x) * t + (r() - 0.5) * 120, SUMMIT.z + (v.z - SUMMIT.z) * t + (r() - 0.5) * 120, 60 + r() * 50);
  }
  // Each village gets a cluster overhead.
  for (const site of VILLAGES) {
    for (let i = 0; i < 4; i++) {
      const a = r() * 6.28;
      add(site.x + Math.cos(a) * site.r * 0.9, site.z + Math.sin(a) * site.r * 0.9, 70 + r() * 80);
    }
  }
  // The rest drift anywhere over the island.
  for (let i = 0; i < 14; i++) {
    const a = r() * 6.28;
    const d = 200 + r() * 1300;
    add(Math.cos(a) * d, Math.sin(a) * d, 90 + r() * 140);
  }
  return list;
}

export const BALLOONS = makeBalloons();

export type WindPath = {
  kind: "tunnel" | "updraft";
  radius: number;
  samples: Vector3[];
  tangents: Vector3[];
};

const SAMPLES = 72;

function makePath(kind: WindPath["kind"], radius: number, points: Vector3[]): WindPath {
  const curve = new CatmullRomCurve3(points);
  const samples: Vector3[] = [];
  const tangents: Vector3[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    const t = i / (SAMPLES - 1);
    samples.push(curve.getPointAt(t));
    tangents.push(curve.getTangentAt(t));
  }
  return { kind, radius, samples, tangents };
}

const above = (x: number, z: number, clearance: number) => new Vector3(x, ground(x, z) + clearance, z);

// Currents of air that run along the land. They're placed first, and everything else
// keeps out of their way.
const TUNNELS: WindPath[] = [
  // Picks up the river a little below the falls, leaving the pool and the cave mouth calm,
  // and follows it all the way out to the sea.
  makePath("tunnel", 26, [...RIVER.filter((_, i) => i >= 14 && i % 6 === 0).map((p) => new Vector3(p.x, p.y + 9, p.z)), new Vector3(1400, 22, 660)]),
  // A long loop around the summit.
  makePath(
    "tunnel",
    30,
    [0, 1, 2, 3, 4, 5, 6].map((i) => {
      const a = i * 1.05 + 0.4;
      return new Vector3(SUMMIT.x + Math.cos(a) * 420, SUMMIT.h * 0.82 + i * 22, SUMMIT.z + Math.sin(a) * 420);
    }),
  ),
  // Along the north coast.
  makePath(
    "tunnel",
    28,
    [3.3, 3.7, 4.1, 4.5, 4.9, 5.3].map((a) => new Vector3(Math.cos(a) * 1500, 70, Math.sin(a) * 1500)),
  ),
  // Village to village across the west.
  makePath("tunnel", 26, [above(VILLAGES[1].x, VILLAGES[1].z, 70), above(-720, 680, 110), above(-1100, 420, 120), above(VILLAGES[2].x, VILLAGES[2].z, 80)]),
  // From the south village toward the high ridge, letting you go before the summit loop.
  (() => {
    const v = VILLAGES[3];
    const dx = v.x - SUMMIT.x;
    const dz = v.z - SUMMIT.z;
    const d = Math.hypot(dx, dz);
    const end = { x: SUMMIT.x + (dx / d) * 560, z: SUMMIT.z + (dz / d) * 560 };
    const mid = { x: (v.x + end.x) / 2 + 60, z: (v.z + end.z) / 2 };
    return makePath("tunnel", 28, [above(v.x, v.z, 60), above(mid.x, mid.z, 150), above(end.x, end.z, 180)]);
  })(),
];

/** How far a spot is from the nearest current, measured across the ground. */
function clearOf(x: number, z: number, paths: WindPath[]) {
  let best = Infinity;
  for (const path of paths) {
    for (const s of path.samples) best = Math.min(best, Math.hypot(s.x - x, s.z - z) - path.radius);
  }
  return best;
}

/** Walks outward from a spot until it finds open air, and stays as close as it can. */
function openSpot(x: number, z: number, need: number, paths: WindPath[]) {
  for (let ring = 0; ring < 40; ring++) {
    const d = ring * 25;
    const tries = Math.max(1, ring * 6);
    for (let i = 0; i < tries; i++) {
      const a = (i / tries) * Math.PI * 2 + ring;
      const px = x + Math.cos(a) * d;
      const pz = z + Math.sin(a) * d;
      if (Math.hypot(px - FALLS.x, pz - FALLS.z) < 220) continue;
      if (clearOf(px, pz, paths) >= need) return { x: px, z: pz };
    }
  }
  return { x, z };
}

const UPDRAFT_RADIUS = 46;
const UPDRAFT_GAP = 90;

function placeUpdrafts() {
  const paths = [...TUNNELS];
  // Rising air, so a player at the bottom can ride straight to the top.
  const wanted = [
    [PLACES.shore.x + 40, PLACES.shore.z - 80, 520],
    [SUMMIT.x + 240, SUMMIT.z + 300, 620],
    [420, -40, 460],
    [-820, 560, 420],
    [-120, -760, 520],
    [960, 300, 380],
    [-1000, -120, 400],
    [150, 1130, 380],
  ];
  for (const [x, z, h] of wanted) {
    const spot = openSpot(x, z, UPDRAFT_RADIUS + UPDRAFT_GAP, paths);
    paths.push(makePath("updraft", UPDRAFT_RADIUS, [above(spot.x, spot.z, 4), above(spot.x + 6, spot.z + 4, h * 0.5), above(spot.x, spot.z, h)]));
  }
  return paths;
}

/** Every place a current can blow. Only some of them blow on any one visit. */
const ALL_WIND: WindPath[] = placeUpdrafts();

/** A few of a list, in random order. */
function someOf<T>(list: T[], count: number) {
  const pool = [...list];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

// Each time the game loads, the wind picks a handful of its currents and rising air, so
// the sky feels different from one visit to the next and is never crowded with them.
export const WIND: WindPath[] = (() => {
  const tunnels = ALL_WIND.filter((w) => w.kind === "tunnel");
  const updrafts = ALL_WIND.filter((w) => w.kind === "updraft");
  return [...someOf(tunnels, 2 + Math.floor(Math.random() * 2)), ...someOf(updrafts, 3 + Math.floor(Math.random() * 2))];
})();

// Balloons drift clear of every place a current could blow, so the island stays the same
// whichever ones are blowing today.
for (const b of BALLOONS) {
  const spot = openSpot(b.base.x, b.base.z, b.radius + 22, ALL_WIND);
  if (spot.x !== b.base.x || spot.z !== b.base.z) {
    b.base.y += ground(spot.x, spot.z) - ground(b.base.x, b.base.z);
    b.base.x = spot.x;
    b.base.z = spot.z;
    b.base.y = Math.max(b.base.y, ground(spot.x, spot.z) + 50);
  }
}
