"use client";

import { useMemo } from "react";
import { BoxGeometry, BufferGeometry, ConeGeometry, CylinderGeometry, Matrix4, SphereGeometry, TorusGeometry, Vector3 } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { paint } from "./shared";
import { ARCHES, fbm, rng } from "./terrain";
import { CHAPELS, HOMES, LIGHTHOUSES, WINDMILLS, type Home, type Landmark } from "./villages";

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
