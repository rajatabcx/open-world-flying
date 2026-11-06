"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { BoxGeometry, BufferGeometry, Color, ConeGeometry, CylinderGeometry, IcosahedronGeometry, InstancedMesh, Matrix4, Object3D, SphereGeometry, TorusGeometry, Vector3 } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { paint } from "./shared";
import { useFrame } from "@react-three/fiber";
import { crashEvents } from "./flight";
import { ARCHES, fbm, rng } from "./terrain";
import { TREES, type Tree } from "./trees";
import { CHAPELS, HOMES, LIGHTHOUSES, WINDMILLS, type Home, type Landmark } from "./villages";

function cypressGeometry() {
  const trunk = paint(new CylinderGeometry(0.35, 0.5, 3, 5).translate(0, 1.5, 0), "#5b4632");
  const body = paint(new ConeGeometry(2.4, 20, 7, 3).translate(0, 12, 0), "#2f5a35");
  return mergeGeometries([trunk, body])!;
}

function oliveGeometry() {
  const trunk = paint(new CylinderGeometry(0.45, 0.8, 5, 5).translate(0, 2.5, 0), "#6a5540");
  const a = paint(new IcosahedronGeometry(4.6, 0).scale(1, 0.78, 1).translate(0, 6.6, 0), "#7d9256");
  const b = paint(new IcosahedronGeometry(3.3, 0).scale(1, 0.8, 1).translate(2.8, 5.4, 1.3), "#8ea463");
  const c = paint(new IcosahedronGeometry(3, 0).scale(1, 0.8, 1).translate(-2.5, 5.8, -1.6), "#6f8650");
  return mergeGeometries([trunk, a, b, c])!;
}

function pineGeometry() {
  const trunk = paint(new CylinderGeometry(0.4, 0.75, 11, 5).translate(0, 5.5, 0), "#5b4230");
  const a = paint(new IcosahedronGeometry(6.4, 0).scale(1, 0.42, 1).translate(0, 12, 0), "#3d6b3e");
  const b = paint(new IcosahedronGeometry(4, 0).scale(1, 0.42, 1).translate(1.5, 14, -1), "#4b7c46");
  return mergeGeometries([trunk, a, b])!;
}

const treeDummy = new Object3D();

function placeTree(t: Tree, tilt: number) {
  treeDummy.position.set(t.x, t.y, t.z);
  treeDummy.rotation.set(tilt, t.yaw, tilt * 0.6);
  treeDummy.scale.setScalar(t.scale);
  treeDummy.updateMatrix();
  return treeDummy.matrix;
}

function TreeField({ trees, geometry }: { trees: Tree[]; geometry: BufferGeometry }) {
  const ref = useRef<InstancedMesh>(null!);
  const shaking = useRef(new Set<Tree>());
  useLayoutEffect(() => {
    const tint = new Color();
    trees.forEach((t, i) => {
      ref.current.setMatrixAt(i, placeTree(t, 0));
      ref.current.setColorAt(i, tint.setScalar(t.shade));
    });
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
  }, [trees]);
  useFrame((state, delta) => {
    const kind = trees[0]?.kind;
    for (const event of crashEvents) if (event.tree.kind === kind) shaking.current.add(event.tree);
    if (shaking.current.size === 0) return;
    for (const t of shaking.current) {
      t.wobble = Math.max(0, t.wobble - delta * 0.8);
      ref.current.setMatrixAt(t.index, placeTree(t, Math.sin(state.clock.elapsedTime * 13) * t.wobble * t.wobble * 0.3));
      if (t.wobble === 0) shaking.current.delete(t);
    }
    ref.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[geometry, undefined, trees.length]} frustumCulled={false}>
      <meshLambertMaterial vertexColors flatShading />
    </instancedMesh>
  );
}

export function Trees() {
  const cypress = useMemo(() => cypressGeometry(), []);
  const olive = useMemo(() => oliveGeometry(), []);
  const pine = useMemo(() => pineGeometry(), []);
  return (
    <>
      <TreeField trees={TREES.cypress} geometry={cypress} />
      <TreeField trees={TREES.olive} geometry={olive} />
      <TreeField trees={TREES.pine} geometry={pine} />
    </>
  );
}

function buildVillages() {
  const parts: BufferGeometry[] = [];
  const m = new Matrix4();

  function place(geo: BufferGeometry, color: string, x: number, y: number, z: number, yaw: number, ox = 0, oy = 0, oz = 0) {
    const g = geo.translate(ox, oy, oz);
    g.applyMatrix4(m.makeRotationY(yaw));
    g.applyMatrix4(m.makeTranslation(x, y, z));
    parts.push(paint(g, color));
  }

  function house({ x, y, z, yaw, w, d, h, wall, roof, door, flat, roofHeight, chimney }: Home) {
    place(new BoxGeometry(w, h + 6, d), wall, x, y, z, yaw, 0, h / 2 - 3, 0);
    if (flat) {
      place(new BoxGeometry(w + 0.5, 0.7, d + 0.5), "#e8dcc6", x, y, z, yaw, 0, h + 0.3, 0);
    } else {
      const cone = new ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4).scale(w + 1.3, roofHeight, d + 1.3);
      place(cone, roof, x, y, z, yaw, 0, h + 1.6, 0);
    }
    place(new BoxGeometry(1.7, 3, 0.25), door, x, y, z, yaw, 0, 1.5, d / 2);
    for (const side of [-1, 1]) {
      place(new BoxGeometry(1.1, 1.5, 0.2), "#3e5a68", x, y, z, yaw, side * w * 0.28, h * 0.62, d / 2);
      place(new BoxGeometry(0.2, 1.5, 1.1), "#3e5a68", x, y, z, yaw, side * (w / 2), h * 0.62, side * d * 0.14);
    }
    if (chimney) place(new BoxGeometry(1, 2.6, 1), wall, x, y, z, yaw, w * 0.24, h + 1.6, -d * 0.2);
  }

  function chapel({ x, y, z, yaw }: Landmark) {
    place(new BoxGeometry(14, 16, 14), "#fffdf8", x, y, z, yaw, 0, 4, 0);
    place(new SphereGeometry(6.4, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), "#2d78a8", x, y, z, yaw, 0, 12, 0);
    place(new BoxGeometry(5, 24, 5), "#fbf7ee", x, y, z, yaw, 10, 8, -4);
    place(new ConeGeometry(3.6, 4, 4).rotateY(Math.PI / 4), "#2d78a8", x, y, z, yaw, 10, 22, -4);
    place(new BoxGeometry(2.4, 5, 0.3), "#8a3f2f", x, y, z, yaw, 0, 2.5, 7.05);
  }

  function windmill({ x, y, z, yaw }: Landmark) {
    place(new CylinderGeometry(4, 5.2, 14, 10), "#f4ecdc", x, y, z, yaw, 0, 7, 0);
    place(new ConeGeometry(4.6, 4, 10), "#a94f30", x, y, z, yaw, 0, 16, 0);
    for (let i = 0; i < 4; i++) {
      const blade = new BoxGeometry(1.5, 9, 0.2).translate(0, 5.2, 0).rotateZ((i * Math.PI) / 2 + 0.35);
      place(blade, "#fdf8ec", x, y, z, yaw, 0, 13, 5);
    }
  }

  function lighthouse({ x, y, z }: Landmark) {
    place(new CylinderGeometry(3.6, 5.2, 30, 10), "#fbf7ee", x, y, z, 0, 0, 15, 0);
    place(new CylinderGeometry(4, 4.5, 6, 10), "#c9573c", x, y, z, 0, 0, 12, 0);
    place(new CylinderGeometry(4.4, 4.4, 1, 10), "#39474f", x, y, z, 0, 0, 30, 0);
    place(new CylinderGeometry(2.5, 2.5, 3.6, 10), "#ffe9a8", x, y, z, 0, 0, 32.4, 0);
    place(new ConeGeometry(3.3, 3, 10), "#c9573c", x, y, z, 0, 0, 35.6, 0);
  }

  CHAPELS.forEach(chapel);
  HOMES.forEach(house);
  WINDMILLS.forEach(windmill);
  LIGHTHOUSES.forEach(lighthouse);
  return mergeGeometries(parts)!;
}

export function Villages() {
  const geometry = useMemo(() => buildVillages(), []);
  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial vertexColors flatShading roughness={0.95} />
    </mesh>
  );
}

function buildArches() {
  const parts: BufferGeometry[] = [];
  const r = rng(321);
  const v = new Vector3();
  for (const a of ARCHES) {
    const g = new TorusGeometry(a.size, a.size * 0.27, 9, 18, Math.PI).toNonIndexed();
    const pos = g.attributes.position;
    // Jitter by position, so shared corners stay joined and the rock looks natural.
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const n = fbm(v.x * 0.05 + 3, v.y * 0.05 + v.z * 0.05, 2) - 0.5;
      pos.setXYZ(i, v.x + n * a.size * 0.2, v.y + n * a.size * 0.18, v.z - n * a.size * 0.2);
    }
    g.rotateY(a.yaw);
    g.scale(1, 1.25 + r() * 0.2, 1);
    g.translate(a.x, -6, a.z);
    parts.push(paint(g, "#c7b296"));
  }
  return mergeGeometries(parts)!;
}

export function Arches() {
  const geometry = useMemo(() => buildArches(), []);
  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial vertexColors flatShading roughness={1} />
    </mesh>
  );
}
