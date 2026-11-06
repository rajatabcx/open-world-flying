"use client";

import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import { BufferGeometry, Color, CylinderGeometry, DodecahedronGeometry, Float32BufferAttribute, IcosahedronGeometry, InstancedMesh, MeshLambertMaterial, Object3D, SphereGeometry, Vector2, Vector3 } from "three";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { crashEvents, flight } from "./flight";
import { fbm, heightAt, rng, slopeAt } from "./terrain";
import { keptClear, TREE_KINDS, TREES, treesNear, type Tree, type TreeKind } from "./trees";

// Every tree has two forms. The ones around you use the detailed form, and the rest of
// the island uses a light one, so the forest can be high-poly without being slow.

const NEAR = 240;
const NEAR_CAPACITY = 600;
const lodCentre = { value: new Vector2(1e6, 1e6) };
const lodRadiusSq = { value: NEAR * NEAR };

const colorA = new Color();
const colorB = new Color();
const point = new Vector3();

/** Removes shared-corner splits, so the surface shades smoothly. */
function smoothed(g: BufferGeometry) {
  g.deleteAttribute("normal");
  g.deleteAttribute("uv");
  const m = mergeVertices(g, 1e-3);
  m.computeVertexNormals();
  return m;
}

function colored(g: BufferGeometry, pick: (x: number, y: number, z: number, c: Color) => void) {
  const pos = g.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    point.fromBufferAttribute(pos, i);
    pick(point.x, point.y, point.z, colorA);
    colors.set([colorA.r, colorA.g, colorA.b], i * 3);
  }
  g.setAttribute("color", new Float32BufferAttribute(colors, 3));
  return g;
}

type Blob = { r: number; x: number; y: number; z: number; squash?: number };

/** A lumpy mass of leaves: darker beneath, sunlit above, mottled all over. */
function foliage(blob: Blob, detail: number, low: string, high: string, seed: number, lump = 0.24) {
  const base = smoothed(new IcosahedronGeometry(1, detail));
  const pos = base.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    point.fromBufferAttribute(pos, i);
    const n = fbm(point.x * 2.2 + seed, point.y * 2.2 + point.z * 2.2 + seed, 3) - 0.5;
    point.multiplyScalar(blob.r * (1 + n * lump * 2));
    point.y *= blob.squash ?? 0.82;
    pos.setXYZ(i, point.x + blob.x, point.y + blob.y, point.z + blob.z);
  }
  base.computeVertexNormals();
  colorB.set(high);
  const lowColor = new Color(low);
  return colored(base, (x, y, z, c) => {
    const up = (y - blob.y) / blob.r;
    const n = fbm(x * 1.1 + seed, z * 1.1 + y + seed, 2);
    c.copy(lowColor).lerp(colorB, Math.min(1, Math.max(0, up * 0.5 + 0.5 + (n - 0.5) * 0.9)));
  });
}

function trunk(height: number, bottom: number, top: number, color: string, sides: number, lean = 0, rings = 1) {
  const g = new CylinderGeometry(top, bottom, height, sides, rings).translate(0, height / 2, 0);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / height;
    pos.setX(i, pos.getX(i) + lean * t * t);
  }
  const m = smoothed(g);
  const c = new Color(color);
  return colored(m, (x, y, z, out) => {
    out.copy(c).multiplyScalar(0.82 + fbm(x * 3, y * 0.8 + z * 3, 2) * 0.36);
  });
}

function fruit(detailed: boolean, spots: [number, number, number][], color: string) {
  if (!detailed) return [];
  const c = new Color(color);
  return spots.map(([x, y, z]) => colored(smoothed(new SphereGeometry(0.2, 8, 6).translate(x, y, z)), (_x, _y, _z, out) => out.copy(c)));
}

function cypressForm(detailed: boolean) {
  const rows = detailed ? 16 : 4;
  const sides = detailed ? 14 : 6;
  const body = new CylinderGeometry(1, 1, 1, sides, rows).translate(0, 0.5, 0);
  const g = smoothed(body);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    point.fromBufferAttribute(pos, i);
    const t = point.y;
    // A slim flame: full in the lower third, drawn to a point at the top.
    const width = 2.5 * Math.sin(Math.min(1, t * 2.6 + 0.2) * Math.PI * 0.5) * Math.pow(1 - t, 0.62);
    const flutter = detailed ? 1 + (fbm(point.x * 2 + t * 9, point.z * 2 + t * 9, 2) - 0.5) * 0.3 : 1;
    pos.setXYZ(i, point.x * width * flutter, 2.4 + t * 19.6, point.z * width * flutter);
  }
  g.computeVertexNormals();
  const dark = new Color("#1f4a2d");
  const light = new Color("#47764a");
  colored(g, (x, y, z, c) => c.copy(dark).lerp(light, Math.min(1, fbm(x + y, z + y, 2) * 0.8 + y / 40)));
  return [trunk(3, 0.5, 0.35, "#5b4632", detailed ? 8 : 4), g];
}

function oliveForm(detailed: boolean) {
  const d = detailed ? 2 : 0;
  return [
    trunk(5.4, 0.95, 0.42, "#6a5540", detailed ? 9 : 4, 0.7, detailed ? 6 : 1),
    foliage({ r: 4.4, x: 0.7, y: 7, z: 0 }, d, "#546b3f", "#a1b47a", 1),
    foliage({ r: 3.2, x: 3.5, y: 5.6, z: 1.4 }, d, "#546b3f", "#a9bb83", 2),
    foliage({ r: 3, x: -2.2, y: 6, z: -1.8 }, d, "#4f653b", "#9aae74", 3),
    foliage({ r: 2.6, x: 0.6, y: 5.7, z: 3 }, d, "#546b3f", "#a1b47a", 4),
  ];
}

function pineForm(detailed: boolean) {
  const d = detailed ? 2 : 0;
  return [
    trunk(13, 0.72, 0.3, "#694a34", detailed ? 9 : 4, 1.1, detailed ? 5 : 1),
    foliage({ r: 6.6, x: 1.1, y: 14.2, z: 0, squash: 0.4 }, d, "#264f30", "#5f9255", 5, 0.16),
    foliage({ r: 4.2, x: 4.2, y: 13.3, z: 1.6, squash: 0.42 }, d, "#264f30", "#5f9255", 6, 0.16),
    foliage({ r: 4, x: -2.2, y: 13.6, z: -2.2, squash: 0.42 }, d, "#2a5534", "#669958", 7, 0.16),
    foliage({ r: 3.2, x: 1.2, y: 15.7, z: 1.4, squash: 0.42 }, d, "#2a5534", "#73a560", 8, 0.16),
  ];
}

function palmForm(detailed: boolean) {
  const parts: BufferGeometry[] = [trunk(14, 0.62, 0.3, "#8b7354", detailed ? 9 : 4, 2.4, detailed ? 10 : 2)];
  const fronds = detailed ? 11 : 6;
  const steps = detailed ? 9 : 3;
  const low = new Color("#2f6b39");
  const high = new Color("#6ea552");
  for (let f = 0; f < fronds; f++) {
    const a = (f / fronds) * Math.PI * 2 + f * 0.4;
    const length = 5.4 + (f % 3) * 0.7;
    const positions: number[] = [];
    const index: number[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const out = t * length;
      const y = 14 + Math.sin(t * 1.6) * 1.5 - t * t * 3.6;
      const half = 0.85 * Math.sin(Math.PI * Math.min(1, t * 0.9 + 0.08));
      const px = -Math.sin(a) * half;
      const pz = Math.cos(a) * half;
      const cx = 2.4 + Math.cos(a) * out;
      const cz = Math.sin(a) * out;
      positions.push(cx + px, y - half * 0.35, cz + pz, cx, y, cz, cx - px, y - half * 0.35, cz - pz);
      if (i < steps) {
        const b = i * 3;
        index.push(b, b + 3, b + 1, b + 1, b + 3, b + 4, b + 1, b + 4, b + 2, b + 2, b + 4, b + 5);
      }
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(positions, 3));
    g.setIndex(index);
    g.computeVertexNormals();
    parts.push(colored(g, (x, y, z, c) => c.copy(low).lerp(high, Math.min(1, (y - 10) / 5))));
  }
  return parts;
}

function almondForm(detailed: boolean) {
  const d = detailed ? 2 : 0;
  return [
    trunk(4.6, 0.6, 0.32, "#5e4938", detailed ? 8 : 4, -0.5, detailed ? 4 : 1),
    foliage({ r: 4.3, x: -0.4, y: 7.2, z: 0 }, d, "#d9a0b4", "#fde8ef", 11, 0.3),
    foliage({ r: 3, x: 2.6, y: 6, z: 1.6 }, d, "#d9a0b4", "#fff0f4", 12, 0.3),
    foliage({ r: 2.8, x: -3, y: 5.8, z: -1.4 }, d, "#d195ac", "#fbdfe8", 13, 0.3),
  ];
}

function lemonForm(detailed: boolean) {
  const d = detailed ? 2 : 0;
  const spots: [number, number, number][] = [
    [2.7, 4.2, 0.6],
    [-2.3, 4.6, 1.3],
    [0.5, 3.5, 2.8],
    [-0.9, 5.8, 2.5],
    [1.4, 6.2, -2.3],
    [-2, 3.8, -1.7],
    [2.2, 5.6, 1.8],
    [0, 3.4, -2.8],
  ];
  return [trunk(2.8, 0.36, 0.26, "#5e4938", detailed ? 7 : 4), foliage({ r: 3.3, x: 0, y: 4.8, z: 0, squash: 0.95 }, d, "#1f5430", "#4f9248", 21, 0.14), ...fruit(detailed, spots, "#f4d33d")];
}

function oakForm(detailed: boolean) {
  const d = detailed ? 2 : 0;
  return [
    trunk(8, 1.15, 0.6, "#574431", detailed ? 10 : 4, 0, detailed ? 3 : 1),
    foliage({ r: 6.4, x: 0, y: 12, z: 0 }, d, "#2f5a30", "#79a152", 31),
    foliage({ r: 4.6, x: 4.8, y: 9.8, z: 1.6 }, d, "#2f5a30", "#6f984c", 32),
    foliage({ r: 4.4, x: -4.5, y: 10.2, z: -2 }, d, "#2f5a30", "#74994f", 33),
    foliage({ r: 3.9, x: 0.8, y: 10, z: 4.6 }, d, "#2a5230", "#6a9149", 34),
    foliage({ r: 3.8, x: -0.8, y: 10.4, z: -4.6 }, d, "#2a5230", "#6a9149", 35),
  ];
}

const FORMS: Record<TreeKind, (detailed: boolean) => BufferGeometry[]> = {
  cypress: cypressForm,
  olive: oliveForm,
  pine: pineForm,
  palm: palmForm,
  almond: almondForm,
  lemon: lemonForm,
  oak: oakForm,
};

function build(kind: TreeKind, detailed: boolean) {
  const parts = FORMS[kind](detailed).map((g) => {
    const flat = g.index ? g.toNonIndexed() : g;
    flat.computeVertexNormals();
    return detailed ? g : flat;
  });
  const clean = parts.map((g) => {
    for (const name of Object.keys(g.attributes)) if (!["position", "normal", "color"].includes(name)) g.deleteAttribute(name);
    return g.index ? g.toNonIndexed() : g;
  });
  return mergeGeometries(clean)!;
}

const dummy = new Object3D();

function placeTree(t: Tree, tilt: number) {
  dummy.position.set(t.x, t.y, t.z);
  dummy.rotation.set(tilt, t.yaw, tilt * 0.6);
  dummy.scale.setScalar(t.scale);
  dummy.updateMatrix();
  return dummy.matrix;
}

/** The light form leaves a hole around you, which the detailed form fills exactly. */
function distantMaterial() {
  const material = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uLodCentre = lodCentre;
    shader.uniforms.uLodRadiusSq = lodRadiusSq;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform vec2 uLodCentre;\nuniform float uLodRadiusSq;")
      .replace(
        "#include <project_vertex>",
        /* glsl */ `#include <project_vertex>
        {
          vec2 away = instanceMatrix[3].xz - uLodCentre;
          if (dot(away, away) < uLodRadiusSq) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        }`,
      );
  };
  return material;
}

const nearByKind = Object.fromEntries(TREE_KINDS.map((k) => [k, [] as Tree[]])) as Record<TreeKind, Tree[]>;
let nearVersion = 0;

function refreshNear() {
  for (const kind of TREE_KINDS) {
    for (const t of nearByKind[kind]) t.slot = -1;
    nearByKind[kind].length = 0;
  }
  lodCentre.value.set(flight.pos.x, flight.pos.z);
  treesNear(flight.pos.x, flight.pos.z, NEAR + 30, (t) => {
    const dx = t.x - lodCentre.value.x;
    const dz = t.z - lodCentre.value.y;
    if (dx * dx + dz * dz >= lodRadiusSq.value) return;
    const list = nearByKind[t.kind];
    if (list.length < NEAR_CAPACITY) {
      t.slot = list.length;
      list.push(t);
    }
  });
  nearVersion++;
}

function TreeKindField({ kind }: { kind: TreeKind }) {
  const trees = TREES[kind];
  const far = useRef<InstancedMesh>(null!);
  const near = useRef<InstancedMesh>(null!);
  const seen = useRef(-1);
  const shaking = useRef(new Set<Tree>());
  const farGeometry = useMemo(() => build(kind, false), [kind]);
  const nearGeometry = useMemo(() => build(kind, true), [kind]);
  const farMaterial = useMemo(() => distantMaterial(), []);
  const tint = useMemo(() => new Color(), []);

  useLayoutEffect(() => {
    trees.forEach((t, i) => {
      far.current.setMatrixAt(i, placeTree(t, 0));
      far.current.setColorAt(i, tint.setScalar(t.shade));
    });
    far.current.instanceMatrix.needsUpdate = true;
    if (far.current.instanceColor) far.current.instanceColor.needsUpdate = true;
  }, [trees, tint]);

  useFrame((state, delta) => {
    if (seen.current !== nearVersion) {
      seen.current = nearVersion;
      const list = nearByKind[kind];
      list.forEach((t, i) => {
        near.current.setMatrixAt(i, placeTree(t, 0));
        near.current.setColorAt(i, tint.setScalar(t.shade));
      });
      near.current.count = list.length;
      near.current.instanceMatrix.needsUpdate = true;
      if (near.current.instanceColor) near.current.instanceColor.needsUpdate = true;
    }
    for (const event of crashEvents) if (event.tree.kind === kind) shaking.current.add(event.tree);
    if (shaking.current.size === 0) return;
    for (const t of shaking.current) {
      t.wobble = Math.max(0, t.wobble - delta * 0.8);
      if (t.slot >= 0) near.current.setMatrixAt(t.slot, placeTree(t, Math.sin(state.clock.elapsedTime * 13) * t.wobble * t.wobble * 0.3));
      if (t.wobble === 0) shaking.current.delete(t);
    }
    near.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <instancedMesh ref={far} args={[farGeometry, farMaterial, Math.max(1, trees.length)]} frustumCulled={false} />
      <instancedMesh ref={near} args={[nearGeometry, undefined, NEAR_CAPACITY]} frustumCulled={false} castShadow>
        <meshLambertMaterial vertexColors />
      </instancedMesh>
    </>
  );
}

const BUSH_COUNT = 3000;
const ROCK_COUNT = 1200;

function bushGeometry() {
  return foliage({ r: 1.5, x: 0, y: 0.9, z: 0 }, 1, "#566f3d", "#93ab62", 41, 0.3).toNonIndexed();
}

function lavenderGeometry() {
  const g = foliage({ r: 1.05, x: 0, y: 0.8, z: 0 }, 1, "#55764f", "#a68fdc", 43, 0.2);
  return g.toNonIndexed();
}

function rockGeometry() {
  const g = smoothed(new DodecahedronGeometry(1, 1));
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    point.fromBufferAttribute(pos, i);
    const n = fbm(point.x * 1.6 + 9, point.y * 1.6 + point.z * 1.6, 3) - 0.5;
    point.multiplyScalar(1 + n * 0.9);
    pos.setXYZ(i, point.x, point.y * 0.72, point.z);
  }
  g.computeVertexNormals();
  const light = new Color("#c0ac92");
  const dark = new Color("#7d6b5b");
  colored(g, (x, y, z, c) => c.copy(dark).lerp(light, Math.min(1, Math.max(0, y * 0.5 + 0.35 + fbm(x * 2, z * 2, 2) * 0.35))));
  return g;
}

type Spot = { x: number; y: number; z: number; scale: number; yaw: number; shade: number };

function scatterGround(seed: number, count: number, allow: (x: number, z: number, y: number, slope: number) => boolean, scale: () => number) {
  const r = rng(seed);
  const spots: Spot[] = [];
  for (let i = 0; i < count * 8 && spots.length < count; i++) {
    const x = (r() - 0.5) * 3700;
    const z = (r() - 0.5) * 3700;
    const y = heightAt(x, z);
    const slope = slopeAt(x, z);
    if (!allow(x, z, y, slope) || keptClear(x, z)) continue;
    spots.push({ x, y: y - 0.2, z, scale: scale() * (0.7 + r() * 0.8), yaw: r() * 6.28, shade: 0.8 + r() * 0.3 });
  }
  return spots;
}

function GroundCover({ geometry, spots }: { geometry: BufferGeometry; spots: Spot[] }) {
  const ref = useRef<InstancedMesh>(null!);
  useLayoutEffect(() => {
    const tint = new Color();
    spots.forEach((s, i) => {
      dummy.position.set(s.x, s.y, s.z);
      dummy.rotation.set(0, s.yaw, 0);
      dummy.scale.setScalar(s.scale);
      dummy.updateMatrix();
      ref.current.setMatrixAt(i, dummy.matrix);
      ref.current.setColorAt(i, tint.setScalar(s.shade));
    });
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
  }, [spots]);
  return (
    <instancedMesh ref={ref} args={[geometry, undefined, Math.max(1, spots.length)]} frustumCulled={false}>
      <meshLambertMaterial vertexColors />
    </instancedMesh>
  );
}

export function Trees() {
  const bushes = useMemo(() => bushGeometry(), []);
  const lavender = useMemo(() => lavenderGeometry(), []);
  const rock = useMemo(() => rockGeometry(), []);
  const bushSpots = useMemo(() => scatterGround(11, BUSH_COUNT, (_x, _z, y, slope) => y > 8 && y < 300 && slope < 0.55, () => 1.3), []);
  const lavenderSpots = useMemo(() => scatterGround(12, BUSH_COUNT, (x, z, y, slope) => y > 12 && y < 200 && slope < 0.24 && fbm(x * 0.0105 + 70, z * 0.0105 + 15, 2) > 0.58, () => 1.1), []);
  const rockSpots = useMemo(() => scatterGround(13, ROCK_COUNT, (_x, _z, y, slope) => y > 4 && slope > 0.18, () => 3.6), []);
  useFrame(() => {
    const dx = flight.pos.x - lodCentre.value.x;
    const dz = flight.pos.z - lodCentre.value.y;
    if (dx * dx + dz * dz > 18 * 18) refreshNear();
  }, -2);
  return (
    <>
      {TREE_KINDS.map((kind) => (
        <TreeKindField key={kind} kind={kind} />
      ))}
      <GroundCover geometry={bushes} spots={bushSpots} />
      <GroundCover geometry={lavender} spots={lavenderSpots} />
      <GroundCover geometry={rock} spots={rockSpots} />
    </>
  );
}
