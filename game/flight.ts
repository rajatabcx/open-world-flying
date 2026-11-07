import { Vector3 } from "three";
import { bounceSound, crashSound, thudSound, warnSound, wingBeatSound } from "./audio";
import { input } from "./input";
import { landingHeight } from "./villages";
import { caveAt, heightAt, LID_HALF, lidHump, PLACES, riverSurface, surfaceAt, type PlaceId } from "./terrain";
import { treeAt, type Tree } from "./trees";
import { BALLOONS, WIND } from "./world";

export const CRUISE = 44;
export const FAST = 78;
export const BOOST = 120;
const GLIDE_MIN = 26;
const DIVE_MAX = 170;
const REVERSE = -14;

export type FlightMode = "idle" | "hover" | "flap" | "climb" | "glide" | "dive" | "boost" | "fall" | "rest";
const TURN_RATE = 1.0;
const MAX_CLIMB = 0.72;
const MAX_DIVE = 1.25;
/** How close the body can come to the ground before it touches. */
const CLEARANCE = 1.2;
/** Coming in faster than this, the ground knocks you back. Slower, you just skim along it. */
const BUMP_SPEED = 13;
const GRAVITY = 30;
const TERMINAL = 95;
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
  /** Sitting on the ground or a rooftop. Any flying input takes off again. */
  resting: false,
  /** How long you've been sitting, which lets the camera drift away. */
  restTime: 0,
  restY: 0,
  /** Frozen in place while lining up a photo. */
  photo: false,
  /** 1 while skimming low across water. */
  skimming: 0,
  /** 1 deep inside a cave, used to dim the lights. */
  cave: 0,
  /** Eases from 1 to 0 after hitting a tree, to shake the body. */
  shaken: 0,
  clock: 0,
  /** Wings packed away in mid-air, so you drop like a stone until you open them. */
  folded: false,
  /** Up and down speed while falling. */
  vy: 0,
  /** Inside a cave's tunnel, under the rock, rather than on the hill above it. */
  tunnel: false,
  /** 0 to 1, how urgently the ground ahead says to pull up. */
  warning: 0,
  /** Counts down while the wings unpack, just before taking off from standing. */
  launching: 0,
  /** Talking with someone, which keeps you on the ground until you're done. */
  busy: false,
  /** 1 with wings out, 0 with them packed into the wing pack. */
  wings: 0,
  /** Walking speed on the ground, backwards when negative. */
  walk: 0,
};

/** Trees that were just hit, for the leaves and the shaking to pick up. */
export const crashEvents: { tree: Tree; x: number; y: number; z: number }[] = [];

const LAND_FROM = 70;

/**
 * The top of whatever's solid under a point: the ground, a rooftop, or the rock over a cave.
 * Inside a tunnel it's the cave floor instead. Null over water.
 */
export function standHeight(x: number, z: number) {
  const top = landingHeight(x, z);
  if (top === null || flight.tunnel) return top;
  return Math.max(top, lidTop(x, z) ?? -Infinity);
}

/** The rock over a cave, or null away from one. */
function lidTop(x: number, z: number) {
  const at = caveAt(x, z);
  if (!at || at.beyond) return null;
  return Math.max(surfaceAt(x, z), lidHump(at.floor, at.distance / LID_HALF));
}

/** The highest solid thing under a point, counting water as solid. */
function groundTop(x: number, z: number) {
  const ground = Math.max(heightAt(x, z), 0);
  if (flight.tunnel) return ground;
  return Math.max(ground, lidTop(x, z) ?? -Infinity);
}

/** Whether there's somewhere to set down below you. */
export function canLand() {
  if (!flight.flying || flight.resting || Math.abs(flight.speed) > 60) return false;
  const top = standHeight(flight.pos.x, flight.pos.z);
  return top !== null && flight.pos.y - top < LAND_FROM;
}

function settle(top: number) {
  flight.resting = true;
  flight.restTime = 0;
  flight.restY = top;
  flight.hovering = false;
  flight.folded = false;
  flight.launching = 0;
  flight.walk = 0;
  flight.vy = 0;
  flight.speed = 0;
  flight.pitch = 0;
  flight.warning = 0;
  flight.impulse.set(0, 0, 0);
}

export function land() {
  if (!canLand()) return false;
  settle(standHeight(flight.pos.x, flight.pos.z)!);
  return true;
}

/** Packs the wings away to drop, or throws them open again to fly out of the fall. */
export function toggleWings() {
  if (!flight.flying || flight.resting || flight.photo) return;
  if (flight.folded) {
    openWings();
    return;
  }
  flight.folded = true;
  flight.hovering = false;
  flight.vy = Math.sin(flight.pitch) * flight.speed + flight.impulse.y;
  flight.speed = Math.max(0, Math.cos(flight.pitch) * flight.speed);
  flight.impulse.y = 0;
}

/** The wings snap open and turn the fall into a swoop forward. */
function openWings() {
  flight.folded = false;
  const across = flight.speed;
  const down = Math.max(0, -flight.vy);
  flight.speed = Math.min(DIVE_MAX, Math.max(CRUISE * 0.8, Math.hypot(across, down) * 0.92));
  flight.pitch = -Math.atan2(down, Math.max(across, 1)) * 0.8;
  flight.impulse.y += Math.max(0, flight.vy) * 0.5;
  flight.vy = 0;
  wingBeatSound(0.9);
}

/** After standing a while with nothing to do, you sit down. */
export function isSitting() {
  return flight.resting && flight.restTime > 6 && !flight.busy && flight.launching <= 0;
}

const WALK = 3.4;
const WALK_BACK = 1.6;

/**
 * On your feet: W or the up arrow walks, S steps back, and left and right turn.
 * Shift, Space or the down arrow throws the wings open and takes off again.
 */
function stepRest(dt: number) {
  flight.mode = "rest";
  flight.speed = 0;
  flight.hover = damp(flight.hover, 1, 3, dt);
  flight.wind = damp(flight.wind, 0, 2, dt);
  flight.pitch = damp(flight.pitch, 0, 4, dt);
  flight.roll = damp(flight.roll, 0, 4, dt);
  const free = !flight.busy && flight.launching <= 0;
  flight.turn = damp(flight.turn, free ? input.x : 0, 6, dt);
  flight.yaw -= flight.turn * 1.7 * dt;
  flight.dir.set(-Math.sin(flight.yaw), 0, -Math.cos(flight.yaw));
  flight.restTime += dt;
  flight.shaken = Math.max(0, flight.shaken - dt * 1.4);

  const forward = input.throttle > 0 || input.y < -0.2 ? 1 : input.throttle < 0 ? -1 : 0;
  const want = free && flight.restTime > 0.4 ? (forward > 0 ? WALK : forward < 0 ? -WALK_BACK : 0) : 0;
  flight.walk = damp(flight.walk, want, 8, dt);
  if (Math.abs(flight.walk) > 0.05) {
    flight.restTime = 0.5;
    stepWalk(flight.walk * dt);
  }
  // Land standing, and after a while sit down to take in the view.
  flight.pos.y = damp(flight.pos.y, flight.restY + (isSitting() ? 0.36 : 1.5), Math.abs(flight.walk) > 0.05 ? 14 : 2.4, dt);
  // Taking off, the wings unpack first, then one strong beat lifts you off your feet.
  if (flight.launching > 0) {
    flight.launching -= dt;
    flight.wings = damp(flight.wings, 1, 9, dt);
    if (flight.launching <= 0) {
      flight.resting = false;
      flight.hovering = false;
      flight.walk = 0;
      flight.speed = 18;
      flight.impulse.set(0, 19, 0);
      wingBeatSound(1);
    }
    return;
  }
  flight.wings = damp(flight.wings, 0, 5, dt);
  if (!flight.busy && flight.restTime > 0.6 && (input.boost || input.y > 0.2)) flight.launching = 0.45;
}

/** One step along the ground. Walls, steep rock, trees and water stop you, and you slide along them. */
function stepWalk(distance: number) {
  const dx = -Math.sin(flight.yaw) * distance;
  const dz = -Math.cos(flight.yaw) * distance;
  if (tryStep(dx, dz)) return;
  // Blocked straight ahead, so try sliding along whatever's in the way.
  if (Math.abs(dx) > Math.abs(dz)) {
    if (!tryStep(dx, 0)) tryStep(0, dz);
  } else if (!tryStep(0, dz)) tryStep(dx, 0);
}

function tryStep(dx: number, dz: number) {
  const x = flight.pos.x + dx;
  const z = flight.pos.z + dz;
  const top = standHeight(x, z);
  if (top === null) return false;
  if (top - flight.restY > Math.max(0.6, Math.hypot(dx, dz) * 1.3)) return false;
  if (treeAt(x, top + 1.5, z, 0.8)) return false;
  flight.pos.x = x;
  flight.pos.z = z;
  flight.restY = top;
  return true;
}

/** Wings packed away: you fall, and only the faintest steering is left. */
function stepFall(dt: number) {
  flight.mode = "fall";
  flight.hover = damp(flight.hover, 0, 6, dt);
  flight.boost = damp(flight.boost, 0, 3, dt);
  flight.wings = damp(flight.wings, 0, 7, dt);
  flight.turn = damp(flight.turn, input.x, 3, dt);
  flight.yaw -= flight.turn * 0.55 * dt;
  flight.roll = damp(flight.roll, -flight.turn * 0.4, 3, dt);
  flight.shaken = Math.max(0, flight.shaken - dt * 1.4);
  flight.vy = Math.max(-TERMINAL, flight.vy - GRAVITY * dt);
  if (flight.vy < -TERMINAL * 0.6) flight.vy += (-TERMINAL * 0.6 - flight.vy) * 0.25 * dt;
  flight.speed = Math.max(0, flight.speed - flight.speed * 0.22 * dt);
  // The body tips over to follow the fall, head first.
  flight.pitch = damp(flight.pitch, Math.max(-1.45, Math.atan2(flight.vy, Math.max(flight.speed, 4))), 3, dt);
  const cp = Math.cos(flight.pitch);
  flight.dir.set(-Math.sin(flight.yaw) * cp, Math.sin(flight.pitch), -Math.cos(flight.yaw) * cp);
  flight.wind = damp(flight.wind, 0, 2, dt);
  flight.impulse.multiplyScalar(Math.exp(-1.15 * dt));
  flight.pos.x += -Math.sin(flight.yaw) * flight.speed * dt + flight.impulse.x * dt;
  flight.pos.z += -Math.cos(flight.yaw) * flight.speed * dt + flight.impulse.z * dt;
  flight.pos.y += (flight.vy + flight.impulse.y) * dt;
  // Any flying key throws the wings open again.
  if (input.throttle > 0 || input.boost || input.y > 0.2) openWings();
  else {
    // Over water there's nowhere to land, so the wings open by themselves just above the waves.
    const water = waterBelow();
    if (water !== null && flight.pos.y - water < 6 - flight.vy * 0.4) openWings();
  }
}

function waterBelow() {
  const river = riverSurface(flight.pos.x, flight.pos.z);
  if (river !== null) return river;
  return heightAt(flight.pos.x, flight.pos.z) < 0.5 ? 0 : null;
}

export function startAt(id: PlaceId) {
  flight.folded = false;
  flight.tunnel = false;
  flight.busy = false;
  flight.launching = 0;
  flight.vy = 0;
  flight.wings = 1;
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
  flight.resting = false;
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

const prev = new Vector3();
const velocity = new Vector3();
const normal = new Vector3();
const ahead = new Vector3();
let lastWarn = 0;

/** Moves in and out of a cave's tunnel. You can only get in through one of its mouths. */
function updateTunnel(dt: number) {
  const at = caveAt(flight.pos.x, flight.pos.z);
  const roof = at ? at.floor + at.cave.roof : 0;
  const under = !!at && !at.beyond && at.distance < at.cave.half && flight.pos.y < roof;
  if (!flight.tunnel && under) {
    const last = at.cave.points.length - 2;
    if (at.index <= 2 || at.index >= last - 2) flight.tunnel = true;
  } else if (flight.tunnel && (!at || at.beyond)) {
    flight.tunnel = false;
  }
  flight.cave = damp(flight.cave, flight.tunnel ? 1 : 0, 3, dt);
  return flight.tunnel ? at : null;
}

/** A knock from hitting something: you lose most of your speed and bounce back off it. */
function knock(into: number, n: Vector3) {
  flight.speed *= 0.4;
  flight.vy = 0;
  flight.impulse.multiplyScalar(0.3);
  flight.impulse.addScaledVector(n, 7 + into * 0.55);
  flight.shaken = Math.min(1, 0.35 + into / 50);
  flight.hovering = false;
  flight.crashes++;
  thudSound(Math.min(1, into / 60));
}

/** The walls and roof of a tunnel are solid rock. */
function collideTunnel(at: NonNullable<ReturnType<typeof caveAt>>, dt: number) {
  const a = at.cave.points[at.index];
  const b = at.cave.points[at.index + 1];
  const ex = b.x - a.x;
  const ez = b.z - a.z;
  const length = Math.hypot(ex, ez);
  const limit = at.cave.half - 3.5;
  if (Math.abs(at.lateral) > limit) {
    // The lateral offset is to the left of the tunnel, so inward is along the right.
    const side = Math.sign(at.lateral);
    normal.set((ez / length) * side, 0, (-ex / length) * side);
    flight.pos.addScaledVector(normal, Math.abs(at.lateral) - limit);
    const into = -velocity.dot(normal);
    if (into > BUMP_SPEED) knock(into, normal);
    else if (into > 0) flight.impulse.addScaledVector(normal, into + 2);
  }
  // A gentle pull along the tunnel, so gliding through it feels easy.
  const along = (flight.dir.x * ex + flight.dir.z * ez) / length;
  const yaw = Math.atan2(-ex * Math.sign(along || 1), -ez * Math.sign(along || 1));
  if (!flight.hovering) flight.yaw += angleTo(flight.yaw, yaw) * Math.min(1, 0.5 * dt);
  const ceiling = at.floor + at.cave.roof - 3;
  if (flight.pos.y > ceiling) {
    flight.pos.y = ceiling;
    normal.set(0, -1, 0);
    if (velocity.y > BUMP_SPEED) knock(velocity.y, normal);
    else if (flight.impulse.y > 0) flight.impulse.y = 0;
    flight.pitch = Math.min(flight.pitch, 0);
  }
}

/** The ground is solid. Skim along it gently, but come in hard and it knocks you back. */
function collideGround(dt: number) {
  const x = flight.pos.x;
  const z = flight.pos.z;
  const water = waterBelow();
  const clearance = CLEARANCE + flight.hover * 0.4;
  const top = water !== null ? water : groundTop(x, z);
  if (flight.pos.y >= top + clearance) return;
  if (water !== null) {
    // Water's soft. You just skim across it.
    flight.pos.y = top + clearance;
    if (flight.impulse.y < 0) flight.impulse.y = 0;
    flight.pitch = Math.max(flight.pitch, damp(flight.pitch, 0, 6, dt));
    return;
  }
  if (flight.folded) {
    // Dropping in with wings packed, you land on your feet, however far you fell.
    flight.pos.y = top + clearance;
    const stand = standHeight(x, z);
    settle(stand ?? top);
    flight.shaken = 0.7;
    thudSound(0.8);
    return;
  }
  const e = 2;
  normal.set(groundTop(x - e, z) - groundTop(x + e, z), 2 * e, groundTop(x, z - e) - groundTop(x, z + e)).normalize();
  flight.pos.y = top + clearance;
  const into = -velocity.dot(normal);
  if (into > BUMP_SPEED) {
    knock(into, normal);
    flight.pitch = Math.max(flight.pitch, 0.15);
  } else {
    if (flight.impulse.y < 0) flight.impulse.y = 0;
    // Level out to skim, rather than grinding nose first along the ground.
    if (flight.pitch < 0) flight.pitch = damp(flight.pitch, 0, 8, dt);
  }
}

/** The room left at a point: above the ground, or inside a tunnel's walls and roof. */
function roomAt(p: Vector3) {
  if (flight.tunnel) {
    const at = caveAt(p.x, p.z);
    if (at && !at.beyond) return Math.min(p.y - at.floor, at.floor + at.cave.roof - p.y, at.cave.half - Math.abs(at.lateral)) - 2;
  }
  if (riverSurface(p.x, p.z) !== null || heightAt(p.x, p.z) < 0.5) return Infinity;
  return p.y - groundTop(p.x, p.z) - CLEARANCE;
}

/** Looks a couple of seconds down your path, and raises the alarm before a hard knock. */
function checkAhead(dt: number) {
  let want = 0;
  const pace = velocity.length();
  if (pace > 18) {
    const now = roomAt(flight.pos);
    for (let t = 0.3; t <= 2.4; t += 0.3) {
      ahead.copy(flight.pos).addScaledVector(velocity, t);
      const room = roomAt(ahead);
      // Only warn when you'd come in hard, not while gently skimming the grass.
      if (room < 0 && (now - room) / t > BUMP_SPEED) {
        want = 1 - (t / 2.4) * 0.6;
        break;
      }
    }
  }
  flight.warning = damp(flight.warning, want, want > flight.warning ? 10 : 3, dt);
  if (want > 0 && flight.clock - lastWarn > 1.4) {
    lastWarn = flight.clock;
    warnSound();
  }
}

function collide(dt: number) {
  velocity.copy(flight.pos).sub(prev).divideScalar(Math.max(dt, 1e-4));
  const tunnel = updateTunnel(dt);
  if (tunnel) collideTunnel(tunnel, dt);
  collideGround(dt);
  if (flight.flying && !flight.resting) checkAhead(dt);
}

export function stepFlight(dt: number, time: number) {
  flight.clock = time;
  for (const b of BALLOONS) {
    b.pos.set(b.base.x + Math.sin(time * 0.11 + b.phase) * 7, b.base.y + Math.sin(time * 0.27 + b.phase * 2) * 5, b.base.z + Math.cos(time * 0.09 + b.phase) * 7);
  }
  if (!flight.flying || flight.photo) return;
  if (flight.resting) {
    stepRest(dt);
    return;
  }
  prev.copy(flight.pos);
  if (flight.folded) {
    stepFall(dt);
    applyBalloons(dt);
    applyTrees();
    collide(dt);
    return;
  }
  flight.wings = damp(flight.wings, 1, 7, dt);

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

  if (flight.tunnel && flight.impulse.y > 0) flight.impulse.y *= Math.exp(-5 * dt);
  collide(dt);

  const water = waterBelow();
  const skimming = water !== null && flight.pos.y - water < 11 && Math.abs(flight.speed) > 14;
  flight.skimming = damp(flight.skimming, skimming ? 1 : 0, 6, dt);
}
