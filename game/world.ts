import { CatmullRomCurve3, Vector3 } from "three";
import { heightAt, PLACES, rng, SUMMIT, VILLAGES } from "./terrain";

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

export const WIND: WindPath[] = [
  // Down the canyon and out to sea.
  makePath("tunnel", 26, [above(-40, -90, 40), above(180, 70, 34), above(470, 190, 30), above(760, 390, 30), above(1130, 560, 34), above(1500, 700, 40)]),
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
  // From the south village up to the high ridge.
  makePath("tunnel", 28, [above(VILLAGES[3].x, VILLAGES[3].z, 60), above(-420, -900, 200), above(-300, -660, 300), above(SUMMIT.x + 90, SUMMIT.z - 120, 40)]),
  // Rising air, so a player at the bottom can ride straight to the top.
  ...[
    [PLACES.shore.x + 40, PLACES.shore.z - 80, 520],
    [SUMMIT.x + 240, SUMMIT.z + 300, 620],
    [420, -40, 460],
    [-820, 560, 420],
    [-120, -760, 520],
    [960, 300, 380],
    [-1000, -120, 400],
    [150, 1130, 380],
  ].map(([x, z, h]) => makePath("updraft", 46, [above(x, z, 4), above(x + 6, z + 4, h * 0.5), above(x, z, h)])),
];
