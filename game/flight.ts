import { Vector3 } from "three";
import { bounceSound, crashSound } from "./audio";
import { input } from "./input";
import { heightAt, PLACES, type PlaceId } from "./terrain";
import { treeAt, type Tree } from "./trees";
import { BALLOONS, WIND } from "./world";

export const CRUISE = 44;
export const FAST = 78;
export const BOOST = 120;
const GLIDE_MIN = 26;
const DIVE_MAX = 170;
const REVERSE = -14;

export type FlightMode = "idle" | "hover" | "flap" | "climb" | "glide" | "dive" | "boost";
const TURN_RATE = 1.0;
const MAX_CLIMB = 0.72;
const MAX_DIVE = 1.25;
const CLEARANCE = 2.6;
const LIMIT = 2500;
const CEILING = 1100;

export const flight = {
  flying: false,
  pos: new Vector3(PLACES.summit.x, PLACES.summit.y, PLACES.summit.z),
  dir: new Vector3(0, 0, -1),
  impulse: new Vector3(),
  yaw: PLACES.summit.yaw,
  pitch: 0,
  roll: 0,
  turn: 0,
  climb: 0,
  speed: CRUISE,
  mode: "idle" as FlightMode,
  hovering: false,
  /** 1 when hanging still in the air, 0 when properly moving. */
  hover: 0,
  boost: 0,
  wind: 0,
  bounces: 0,
  crashes: 0,
  /** Eases from 1 to 0 after hitting a tree, to shake the body. */
  shaken: 0,
  clock: 0,
};

/** Trees that were just hit, for the leaves and the shaking to pick up. */
export const crashEvents: { tree: Tree; x: number; y: number; z: number }[] = [];

export function startAt(id: PlaceId) {
  const place = PLACES[id];
  flight.pos.set(place.x, place.y, place.z);
  flight.yaw = place.yaw;
  flight.pitch = 0;
  flight.roll = 0;
  flight.turn = 0;
  flight.climb = 0;
  flight.speed = CRUISE;
  flight.mode = "flap";
  flight.hovering = false;
  flight.hover = 0;
  flight.impulse.set(0, 16, 0);
  flight.wind = 0;
  flight.flying = true;
}

const damp = (from: number, to: number, rate: number, dt: number) => from + (to - from) * (1 - Math.exp(-rate * dt));
const scratch = new Vector3();

function angleTo(from: number, to: number) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function applyWind(dt: number) {
  let strongest = 0;
  for (const path of WIND) {
    let bestSq = path.radius * path.radius;
    let best = -1;
    for (let i = 0; i < path.samples.length; i++) {
      const dSq = flight.pos.distanceToSquared(path.samples[i]);
      if (dSq < bestSq) {
        bestSq = dSq;
        best = i;
      }
    }
    if (best < 0) continue;
    const inside = 1 - Math.sqrt(bestSq) / path.radius;
    const tangent = path.tangents[best];
    const push = path.kind === "updraft" ? 210 : 130;
    flight.impulse.addScaledVector(tangent, push * (0.35 + inside) * dt);
    scratch.copy(path.samples[best]).sub(flight.pos);
    flight.pos.addScaledVector(scratch, Math.min(1, (path.kind === "updraft" ? 2.2 : 0.7) * dt));
    if (path.kind === "tunnel") {
      // The current gently turns you along with it.
      const yaw = Math.atan2(-tangent.x, -tangent.z);
      flight.yaw += angleTo(flight.yaw, yaw) * Math.min(1, 1.1 * dt);
    }
    strongest = Math.max(strongest, 0.4 + inside * 0.6);
  }
  flight.wind = damp(flight.wind, strongest, 4, dt);
}

function applyBalloons(dt: number) {
  for (const b of BALLOONS) {
    const d = flight.pos.distanceTo(b.pos);
    const reach = b.radius + 1.5;
    if (d >= reach) continue;
    const normal = scratch.copy(flight.pos).sub(b.pos).normalize();
    flight.pos.copy(b.pos).addScaledVector(normal, reach);
    flight.impulse.addScaledVector(normal, 62);
    flight.impulse.y += 46;
    flight.speed = Math.max(flight.speed, CRUISE * 1.25);
    flight.hovering = false;
    b.squashVel = 3.4;
    flight.bounces++;
    bounceSound();
  }
  for (const b of BALLOONS) {
    // A soft spring, so a balloon wobbles after a bounce.
    b.squashVel += (-b.squash * 34 - b.squashVel * 3.6) * dt;
    b.squash += b.squashVel * dt;
  }
}

function applyTrees() {
  const moving = Math.abs(flight.speed) + flight.impulse.length();
  if (moving < 7) return;
  const tree = treeAt(flight.pos.x, flight.pos.y, flight.pos.z, 1.4);
  if (!tree || flight.clock - tree.lastHit < 1.2) return;
  tree.lastHit = flight.clock;
  tree.wobble = 1;
  const strength = Math.min(1, moving / 80);
  // Bumping a tree costs most of your speed, then you pick back up on your own.
  flight.speed *= 0.3;
  flight.impulse.multiplyScalar(0.3);
  const away = scratch.set(flight.pos.x - tree.x, 0, flight.pos.z - tree.z).normalize();
  flight.impulse.addScaledVector(away, 12 + moving * 0.3);
  flight.impulse.y += 6;
  flight.shaken = 1;
  flight.crashes++;
  crashEvents.push({ tree, x: flight.pos.x, y: flight.pos.y, z: flight.pos.z });
  crashSound(strength);
}

export function stepFlight(dt: number, time: number) {
  flight.clock = time;
  for (const b of BALLOONS) {
    b.pos.set(b.base.x + Math.sin(time * 0.11 + b.phase) * 7, b.base.y + Math.sin(time * 0.27 + b.phase * 2) * 5, b.base.z + Math.cos(time * 0.09 + b.phase) * 7);
  }
  if (!flight.flying) return;

  flight.boost = damp(flight.boost, input.boost ? 1 : 0, input.boost ? 2.6 : 1.6, dt);
  flight.turn = damp(flight.turn, input.x, 3.6, dt);
  flight.climb = damp(flight.climb, input.y, 3, dt);
  flight.yaw -= flight.turn * TURN_RATE * dt;

  const flapping = input.throttle > 0;
  const braking = input.throttle < 0;
  const boosting = input.boost;
  const diving = input.y < -0.2 && !flight.hovering && !boosting;
  const rising = input.y > 0.2;

  // Braking down to almost nothing settles into a hover, which holds until you flap
  // forward or boost away.
  if (braking && flight.speed < 7) flight.hovering = true;
  if (flapping || boosting) flight.hovering = false;

  const wantHover = flight.hovering ? 1 : 1 - Math.min(1, Math.abs(flight.speed) / 18);
  flight.hover = damp(flight.hover, wantHover, 5, dt);
  const moving = 1 - flight.hover;

  // Nose: pull back to rise, push forward to dive steeply. A boost flies level and straight.
  const steer = flight.climb > 0 ? flight.climb * MAX_CLIMB : flight.climb * MAX_DIVE;
  let targetPitch = steer * moving * (1 - flight.boost * 0.75);

  // Look further ahead the faster you go, and lift the nose in time for hills.
  const reach = Math.max(30, flight.speed * 0.8);
  const ahead = Math.max(heightAt(flight.pos.x + flight.dir.x * reach, flight.pos.z + flight.dir.z * reach), heightAt(flight.pos.x + flight.dir.x * reach * 2, flight.pos.z + flight.dir.z * reach * 2), 0);
  const safe = 9 + Math.max(0, flight.speed - 60) * 0.5;
  const margin = flight.pos.y - ahead;
  if (margin < safe && flight.speed > 12) targetPitch = Math.max(targetPitch, Math.min(0.8, (safe - margin) * 0.07));

  // Past the edges, the air quietly turns you home.
  const fromCentre = Math.hypot(flight.pos.x, flight.pos.z);
  if (fromCentre > LIMIT) {
    const home = Math.atan2(flight.pos.x, flight.pos.z);
    flight.yaw += angleTo(flight.yaw, home) * Math.min(1, (fromCentre - LIMIT) * 0.004) * dt * 2;
  }
  if (flight.pos.y > CEILING) targetPitch = Math.min(targetPitch, -(flight.pos.y - CEILING) * 0.004);

  flight.pitch = damp(flight.pitch, targetPitch, 2.6, dt);
  flight.roll = damp(flight.roll, -flight.turn * (0.25 + 0.55 * moving), 3.4, dt);
  flight.shaken = Math.max(0, flight.shaken - dt * 1.4);

  const cp = Math.cos(flight.pitch);
  flight.dir.set(-Math.sin(flight.yaw) * cp, Math.sin(flight.pitch), -Math.cos(flight.yaw) * cp);

  // Speed works like a bird's. Flapping pushes you on, gliding slowly bleeds speed away,
  // diving trades height for speed, and climbing trades it back.
  let v = flight.speed;
  if (flight.hovering) {
    v = damp(v, braking ? REVERSE : 0, 3.5, dt);
  } else if (boosting) {
    v = damp(v, BOOST, 1.6, dt);
  } else {
    v -= Math.sin(flight.pitch) * 34 * dt;
    if (diving) v += 16 * dt;
    if (flapping && v < FAST) v += 30 * dt;
    if (rising) v += 15 * dt;
    if (braking) v -= 70 * dt;
    else if (v < GLIDE_MIN) v += 16 * dt;
    // Air resistance gets strong above flapping speed, and stays gentle while gliding.
    if (v > FAST) v -= (v - FAST) * (diving ? 0.1 : 0.55) * dt;
    else if (v > GLIDE_MIN && !flapping) v -= (v - GLIDE_MIN) * 0.11 * dt;
    v = Math.min(v, DIVE_MAX);
  }
  flight.speed = v;

  // Flapping lifts you. A glide sinks slowly, and a hover can rise and sink on command.
  const glideSink = !flapping && !rising && !boosting ? (1 - flight.hover) * 3 : 0;
  const hoverSink = input.y < 0 ? input.y * 15 * flight.hover : 0;
  const lift = Math.max(0, flight.climb) * (15 + flight.hover * 7) + hoverSink - glideSink;

  flight.mode = flight.hovering
    ? "hover"
    : boosting
      ? "boost"
      : diving
        ? "dive"
        : rising
          ? "climb"
          : flapping || v < GLIDE_MIN - 2
            ? "flap"
            : "glide";

  applyWind(dt);
  applyBalloons(dt);
  applyTrees();

  flight.impulse.multiplyScalar(Math.exp(-1.15 * dt));
  if (flight.impulse.lengthSq() > 170 * 170) flight.impulse.setLength(170);

  flight.pos.addScaledVector(flight.dir, flight.speed * dt);
  flight.pos.addScaledVector(flight.impulse, dt);
  flight.pos.y += lift * dt;

  // The ground never stops you. A cushion of air just carries you over it.
  const floor = Math.max(heightAt(flight.pos.x, flight.pos.z), 0) + CLEARANCE;
  if (flight.pos.y < floor) {
    flight.pos.y = damp(flight.pos.y, floor, 14, dt);
    if (flight.pos.y < floor - 3) flight.pos.y = floor - 3;
    if (flight.impulse.y < 0) flight.impulse.y = 0;
  }
}
