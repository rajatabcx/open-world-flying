"use client";

import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import { Box3, CatmullRomCurve3, Color, Group, Mesh, MeshStandardMaterial, Object3D, Vector3 } from "three";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { flight } from "./flight";
import { buildWing, makeWingMaterial } from "./Hero";
import { heightAt, rng } from "./terrain";

// The others in your community, out flying too. They keep to their own routes, but if
// you drift close, they may fly beside you for a while before peeling away.

const HERO_HEIGHT = 3;
const KEEP_COMPANY = 38;
const REST_FROM_COMPANY = 45;

const palette = [
  { tip: "#3f7fbf", cloth: "#d9dde2" },
  { tip: "#b84a7a", cloth: "#ffe2c9" },
  { tip: "#3e9a6a", cloth: "#f1e3b8" },
  { tip: "#d9a02b", cloth: "#c8d9e6" },
  { tip: "#8660c9", cloth: "#f5d9d6" },
];

function route(seed: number) {
  const r = rng(seed);
  const points: Vector3[] = [];
  const base = r() * 6.28;
  const reach = 450 + r() * 700;
  const count = 8;
  for (let i = 0; i < count; i++) {
    const a = base + (i / count) * 6.28;
    const d = reach * (0.7 + r() * 0.6);
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    points.push(new Vector3(x, Math.max(heightAt(x, z), 0) + 110 + r() * 150, z));
  }
  // Valleys and peaks between the points are handled while flying.
  return new CatmullRomCurve3(points, true, "centripetal");
}

type Bend = Parameters<typeof makeWingMaterial>[0];

function newBend(tip: string): Bend {
  return {
    uPhase: { value: 0 },
    uAmp: { value: 0.4 },
    uDroop: { value: -0.03 },
    uFold: { value: 0 },
    uSpan: { value: 1 },
    uChord: { value: 1 },
    uTint: { value: new Color(tip) },
    uTintAmount: { value: 0.85 },
    uGlow: { value: 0 },
  };
}

const want = new Vector3();
const heading = new Vector3();

type State = {
  t: number;
  speed: number;
  phase: number;
  beats: number;
  yaw: number;
  pitch: number;
  roll: number;
  pos: Vector3;
  companyUntil: number;
  nextCompany: number;
  side: number;
  ready: boolean;
};

function Flier({ index }: { index: number }) {
  const { scene } = useGLTF("/models/character.glb");
  const root = useRef<Group>(null!);
  const look = palette[index];
  const model = useMemo(() => {
    const copy = cloneSkinned(scene) as Object3D;
    const cloth = new Color(look.cloth);
    copy.traverse((child) => {
      const mesh = child as Mesh;
      if (mesh.isMesh) {
        const material = (mesh.material as MeshStandardMaterial).clone();
        material.metalness = 0;
        material.roughness = 0.85;
        material.color.multiply(cloth);
        mesh.material = material;
        mesh.frustumCulled = false;
      }
    });
    return copy;
  }, [scene, look]);
  const fit = useMemo(() => {
    const box = new Box3().setFromObject(scene);
    return { scale: HERO_HEIGHT / box.getSize(new Vector3()).y, base: box.min.y };
  }, [scene]);
  const wing = useMemo(() => buildWing(), []);
  const bendR = useMemo(() => newBend(look.tip), [look]);
  const bendL = useMemo(() => newBend(look.tip), [look]);
  const right = useMemo(() => makeWingMaterial(bendR), [bendR]);
  const left = useMemo(() => makeWingMaterial(bendL), [bendL]);
  const path = useMemo(() => route(9000 + index * 77), [index]);
  const state = useRef<State | null>(null);

  useLayoutEffect(() => {
    state.current = {
      t: (index * 0.21) % 1,
      speed: 34 + index * 3,
      phase: index,
      beats: 0,
      yaw: 0,
      pitch: 0,
      roll: 0,
      pos: new Vector3(),
      companyUntil: 0,
      nextCompany: 20 + index * 10,
      side: index % 2 === 0 ? 1 : -1,
      ready: false,
    };
  }, [index]);

  useFrame((frame, rawDelta) => {
    const s = state.current;
    if (!s) return;
    const dt = Math.min(rawDelta, 0.05);
    const time = frame.clock.elapsedTime;
    const length = 5000;
    s.t = (s.t + (s.speed * dt) / length) % 1;
    path.getPoint(s.t, want);
    const floor = Math.max(heightAt(want.x, want.z), 0) + 45;
    if (want.y < floor) want.y = floor;

    if (!s.ready) {
      s.pos.copy(want);
      s.ready = true;
    }

    const flying = flight.flying && !flight.resting && !flight.photo;
    const gap = s.pos.distanceTo(flight.pos);
    if (flying && time > s.nextCompany && time > s.companyUntil && gap < 85 && flight.cave < 0.1) {
      s.companyUntil = time + KEEP_COMPANY;
      s.nextCompany = s.companyUntil + REST_FROM_COMPANY;
      s.side = s.side * -1;
    }
    const company = flying && time < s.companyUntil;
    if (company) {
      // Beside you and a little behind, wingtip to wingtip.
      const sx = Math.cos(flight.yaw);
      const sz = -Math.sin(flight.yaw);
      want.set(flight.pos.x + sx * s.side * 11 + Math.sin(flight.yaw) * 5, flight.pos.y + 1.2 + Math.sin(time * 0.7 + index) * 0.9, flight.pos.z + sz * s.side * 11 + Math.cos(flight.yaw) * 5);
    }
    heading.copy(s.pos);
    const pull = company ? 2.4 : Math.min(0.9, s.speed * 0.02);
    s.pos.lerp(want, 1 - Math.exp(-pull * dt));
    heading.subVectors(s.pos, heading);
    const moved = heading.length() / Math.max(dt, 1e-4);
    if (moved > 0.5) {
      const yaw = Math.atan2(-heading.x, -heading.z);
      const delta = Math.atan2(Math.sin(yaw - s.yaw), Math.cos(yaw - s.yaw));
      s.yaw += delta * Math.min(1, 3 * dt);
      s.roll += (-delta * 1.8 - s.roll) * Math.min(1, 2.5 * dt);
      s.pitch += (Math.asin(Math.max(-0.9, Math.min(0.9, heading.y / Math.max(heading.length(), 1e-4)))) - s.pitch) * Math.min(1, 2 * dt);
    }
    root.current.position.copy(s.pos);
    root.current.rotation.set(s.pitch, s.yaw, s.roll, "YXZ");

    // They flap for a while, then hold their wings out and glide.
    const flapping = Math.sin(time * 0.12 + index * 2) > -0.1;
    const amp = flapping ? 0.42 : 0.04;
    const hz = flapping ? 1.4 : 0.16;
    s.phase += dt * hz * Math.PI * 2;
    for (const bend of [bendR, bendL]) {
      bend.uPhase.value = s.phase + 0.38 * Math.sin(s.phase);
      bend.uAmp.value += (amp - bend.uAmp.value) * Math.min(1, 4 * dt);
    }
  });

  return (
    <group ref={root}>
      <group rotation={[-Math.PI / 2, 0, 0]}>
        <group rotation={[0, Math.PI, 0]} scale={fit.scale} position={[0, -HERO_HEIGHT / 2 - fit.base * fit.scale, 0]}>
          <primitive object={model} />
        </group>
      </group>
      <group rotation={[0, -0.1, 0.12]} position={[0.16, 0.3, -0.42]}>
        <mesh geometry={wing} material={right.material} customDepthMaterial={right.depth} frustumCulled={false} />
      </group>
      <group position={[-0.16, 0.3, -0.42]} scale={[-1, 1, 1]}>
        <group rotation={[0, -0.1, 0.12]}>
          <mesh geometry={wing} material={left.material} customDepthMaterial={left.depth} frustumCulled={false} />
        </group>
      </group>
    </group>
  );
}

export function Fliers() {
  return (
    <>
      {palette.map((_, i) => (
        <Flier key={i} index={i} />
      ))}
    </>
  );
}
