"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { AdditiveBlending, BufferGeometry, Color, ConeGeometry, DoubleSide, Float32BufferAttribute, InstancedMesh, Object3D, Points } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { groundColor } from "./ground";
import { glowTexture } from "./shared";
import { CAVE_HALF, CAVE_ROOF, CAVES, fbm, LID_HALF, lidHump, rng, surfaceAt, type Cave } from "./terrain";

// A cave is covered by a lid. Its top copies the hillside, so it can't be seen from
// outside, and its underside is the rock ceiling you fly beneath.

const LID_ACROSS = 20;
const ARCH_ACROSS = 22;

function buildCave(cave: Cave) {
  const positions: number[] = [];
  const colors: number[] = [];
  const index: number[] = [];
  const c = new Color();
  const rockDark = new Color("#2d2a2c");
  const rockLight = new Color("#5a5048");
  const rows = cave.points.length;
  const topRow = LID_ACROSS + 1;
  const archRow = ARCH_ACROSS + 1;

  const sideOf = (i: number) => {
    const a = cave.points[Math.max(0, i - 1)];
    const b = cave.points[Math.min(rows - 1, i + 1)];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    return { x: -(b.z - a.z) / len, z: (b.x - a.x) / len };
  };

  // The lid on top, painted like the land it replaces.
  cave.points.forEach((p, i) => {
    const side = sideOf(i);
    for (let j = 0; j <= LID_ACROSS; j++) {
      const u = (j / LID_ACROSS) * 2 - 1;
      const x = p.x + side.x * u * LID_HALF;
      const z = p.z + side.z * u * LID_HALF;
      const ground = surfaceAt(x, z);
      // Where the hill is too thin to hold the tunnel, the rock rises in a rounded hump.
      const y = Math.max(ground, lidHump(p.floor, u)) + 0.4;
      positions.push(x, y, z);
      // Match the real slope here, so the lid takes the same rock or grass as its surroundings.
      const e = 6;
      const slope = Math.hypot(surfaceAt(x + e, z) - surfaceAt(x - e, z), surfaceAt(x, z + e) - surfaceAt(x, z - e)) / (2 * e);
      groundColor(c, x, z, y, slope);
      colors.push(c.r, c.g, c.b);
    }
  });
  // The arch beneath, with a rough surface so the walls catch the light unevenly.
  const archStart = rows * topRow;
  cave.points.forEach((p, i) => {
    const side = sideOf(i);
    for (let j = 0; j <= ARCH_ACROSS; j++) {
      const a = (j / ARCH_ACROSS) * Math.PI;
      const rough = (fbm(p.x * 0.07 + j * 0.4, p.z * 0.07 + j * 0.4, 3) - 0.5) * 7;
      const out = Math.cos(a) * (CAVE_HALF + rough * 0.6);
      const y = p.floor - 2 + Math.sin(a) * (CAVE_ROOF + 2 + rough);
      positions.push(p.x + side.x * out, y, p.z + side.z * out);
      c.copy(rockDark).lerp(rockLight, fbm(p.x * 0.2 + j, p.z * 0.2 + j, 2));
      colors.push(c.r, c.g, c.b);
    }
  });

  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < LID_ACROSS; j++) {
      const a = i * topRow + j;
      index.push(a, a + topRow, a + 1, a + 1, a + topRow, a + topRow + 1);
    }
    for (let j = 0; j < ARCH_ACROSS; j++) {
      const a = archStart + i * archRow + j;
      index.push(a, a + 1, a + archRow, a + 1, a + archRow + 1, a + archRow);
    }
  }
  // A rock face around each mouth, joining the lid to the arch.
  for (const i of [0, rows - 1]) {
    const faceStart = positions.length / 3;
    const p = cave.points[i];
    const side = sideOf(i);
    const steps = ARCH_ACROSS;
    for (let j = 0; j <= steps; j++) {
      const a = (j / steps) * Math.PI;
      const rough = (fbm(p.x * 0.07 + j * 0.4, p.z * 0.07 + j * 0.4, 3) - 0.5) * 7;
      const out = Math.cos(a) * (CAVE_HALF + rough * 0.6);
      const y = p.floor - 2 + Math.sin(a) * (CAVE_ROOF + 2 + rough);
      positions.push(p.x + side.x * out, y, p.z + side.z * out);
      c.set("#6d5f52");
      colors.push(c.r, c.g, c.b);
      const u = Math.cos(a);
      const topX = p.x + side.x * u * (CAVE_HALF + 14);
      const topZ = p.z + side.z * u * (CAVE_HALF + 14);
      positions.push(topX, Math.max(surfaceAt(topX, topZ), p.floor + CAVE_ROOF * Math.sin(a) + 6) + 0.4, topZ);
      c.set("#85745f");
      colors.push(c.r, c.g, c.b);
      if (j < steps) {
        const b = faceStart + j * 2;
        index.push(b, b + 1, b + 2, b + 2, b + 1, b + 3);
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(positions, 3));
  g.setAttribute("color", new Float32BufferAttribute(colors, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

type Crystal = { x: number; y: number; z: number; rx: number; rz: number; scale: number; color: Color };

function placeCrystals() {
  const r = rng(808);
  const out: Crystal[] = [];
  const palette = ["#7fe3ff", "#b49bff", "#8affd0", "#ffb3e6"].map((c) => new Color(c));
  for (const cave of CAVES) {
    cave.points.forEach((p, i) => {
      const a = cave.points[Math.max(0, i - 1)];
      const b = cave.points[Math.min(cave.points.length - 1, i + 1)];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const side = { x: -(b.z - a.z) / len, z: (b.x - a.x) / len };
      if (i === 0 || r() > 0.8) return;
      for (let n = 0; n < 2; n++) {
        const left = r() < 0.5 ? -1 : 1;
        const wall = CAVE_HALF - 3 - r() * 4;
        const high = r() < 0.3;
        out.push({
          x: p.x + side.x * left * wall + (r() - 0.5) * 6,
          y: high ? p.floor + CAVE_ROOF - 3 : p.floor - 1,
          z: p.z + side.z * left * wall + (r() - 0.5) * 6,
          rx: (r() - 0.5) * 0.7 + (high ? Math.PI : 0),
          rz: (r() - 0.5) * 0.7 - left * 0.25,
          scale: 0.9 + r() * 2.2,
          color: palette[Math.floor(r() * palette.length)],
        });
      }
    });
  }
  return out;
}

const dummy = new Object3D();

function Crystals() {
  const ref = useRef<InstancedMesh>(null!);
  const crystals = useMemo(() => placeCrystals(), []);
  const geometry = useMemo(() => new ConeGeometry(0.75, 4.6, 6, 1).translate(0, 2.3, 0), []);
  const placed = useRef(false);
  useFrame(() => {
    if (placed.current) return;
    placed.current = true;
    crystals.forEach((c, i) => {
      dummy.position.set(c.x, c.y, c.z);
      dummy.rotation.set(c.rx, i, c.rz);
      dummy.scale.setScalar(c.scale);
      dummy.updateMatrix();
      ref.current.setMatrixAt(i, dummy.matrix);
      ref.current.setColorAt(i, c.color);
    });
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[geometry, undefined, crystals.length]} frustumCulled={false}>
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}

function CrystalGlow() {
  const crystals = useMemo(() => placeCrystals(), []);
  const glow = useMemo(() => glowTexture(), []);
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    const positions = new Float32Array(crystals.length * 3);
    const colors = new Float32Array(crystals.length * 3);
    crystals.forEach((c, i) => {
      positions.set([c.x, c.y + 2.5, c.z], i * 3);
      colors.set([c.color.r, c.color.g, c.color.b], i * 3);
    });
    g.setAttribute("position", new Float32BufferAttribute(positions, 3));
    g.setAttribute("color", new Float32BufferAttribute(colors, 3));
    return g;
  }, [crystals]);
  return (
    <points geometry={geometry} frustumCulled={false} renderOrder={6}>
      <pointsMaterial map={glow} vertexColors size={15} sizeAttenuation transparent opacity={0.5} depthWrite={false} blending={AdditiveBlending} />
    </points>
  );
}

const MOTES = 260;

function Fireflies() {
  const ref = useRef<Points>(null!);
  const glow = useMemo(() => glowTexture(), []);
  const motes = useMemo(() => {
    const r = rng(1919);
    return Array.from({ length: MOTES }, () => {
      const cave = CAVES[Math.floor(r() * CAVES.length)];
      const p = cave.points[Math.floor(r() * cave.points.length)];
      return { x: p.x + (r() - 0.5) * 30, y: p.floor + 3 + r() * 16, z: p.z + (r() - 0.5) * 30, phase: r() * 6.28 };
    });
  }, []);
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(new Float32Array(MOTES * 3), 3));
    return g;
  }, []);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const attr = ref.current.geometry.attributes.position;
    motes.forEach((m, i) => {
      attr.setXYZ(i, m.x + Math.sin(t * 0.5 + m.phase) * 4, m.y + Math.sin(t * 0.8 + m.phase * 2) * 2, m.z + Math.cos(t * 0.4 + m.phase) * 4);
    });
    attr.needsUpdate = true;
  });
  return (
    <points ref={ref} geometry={geometry} frustumCulled={false} renderOrder={6}>
      <pointsMaterial map={glow} color="#ffe9a6" size={1.6} sizeAttenuation transparent depthWrite={false} blending={AdditiveBlending} />
    </points>
  );
}

export function Caves() {
  const geometry = useMemo(() => mergeGeometries(CAVES.map(buildCave))!, []);
  return (
    <>
      <mesh geometry={geometry} frustumCulled={false} receiveShadow>
        <meshStandardMaterial vertexColors roughness={1} metalness={0} side={DoubleSide} />
      </mesh>
      <Crystals />
      <CrystalGlow />
      <Fireflies />
    </>
  );
}
