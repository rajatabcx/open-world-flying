"use client";

import { useMemo } from "react";
import { BoxGeometry, BufferGeometry, CylinderGeometry, Matrix4 } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { paint } from "./shared";
import { heightAt, rng, RUIN } from "./terrain";

const STONE = ["#d6c8ac", "#c8b99c", "#dfd2b8", "#b9ac92"];
const COLUMN_RADIUS = 2.3;

function fluted(height: number) {
  // Grooves down its length, which catch the light through the water.
  const g = new CylinderGeometry(COLUMN_RADIUS * 0.88, COLUMN_RADIUS, height, 28, 6).translate(0, height / 2, 0);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const a = Math.atan2(pos.getZ(i), pos.getX(i));
    const k = 1 + Math.cos(a * 14) * 0.045;
    pos.setX(i, pos.getX(i) * k);
    pos.setZ(i, pos.getZ(i) * k);
  }
  return g;
}

function buildRuin() {
  const r = rng(1701);
  const parts: BufferGeometry[] = [];
  const m = new Matrix4();
  const stone = () => STONE[Math.floor(r() * STONE.length)];
  const put = (g: BufferGeometry, x: number, y: number, z: number, yaw = 0, tilt = 0) => {
    g.applyMatrix4(m.makeRotationZ(tilt));
    g.applyMatrix4(m.makeRotationY(yaw));
    g.applyMatrix4(m.makeTranslation(RUIN.x + x, y, RUIN.z + z));
    parts.push(paint(g, stone()));
  };
  const base = heightAt(RUIN.x, RUIN.z) - 1.5;
  // The stepped floor of the temple.
  for (let step = 0; step < 3; step++) {
    put(new BoxGeometry(76 - step * 6, 1.6, 44 - step * 6), 0, base + step * 1.6, 0);
  }
  const floorY = base + 4.5;
  const across = 9;
  const along = 5;
  for (let i = 0; i < across; i++) {
    for (let j = 0; j < along; j++) {
      if (i > 0 && i < across - 1 && j > 0 && j < along - 1) continue;
      const x = (i / (across - 1) - 0.5) * 58;
      const z = (j / (along - 1) - 0.5) * 28;
      const roll = r();
      // Some still stand clear of the water, some are broken off, and some have fallen.
      if (roll < 0.28) {
        const height = 12 + r() * 7;
        put(fluted(height), x, floorY, z);
        put(new BoxGeometry(COLUMN_RADIUS * 2.6, 1.1, COLUMN_RADIUS * 2.6), x, floorY + height, z);
      } else if (roll < 0.72) {
        put(fluted(2 + r() * 5), x, floorY, z);
      } else {
        put(fluted(9 + r() * 5).rotateZ(Math.PI / 2 - 0.02), x + 4, floorY + COLUMN_RADIUS, z + (r() - 0.5) * 6, r() * 6.28);
      }
    }
  }
  // A piece of the roof beam still resting on two columns, just above the waves.
  put(new BoxGeometry(24, 2.2, 5), -14.5, floorY + 16.6, 14, 0, 0.02);
  put(fluted(15.6), -22, floorY, 14);
  put(fluted(15.6), -7, floorY, 14);
  return mergeGeometries(parts)!;
}

export function Ruin() {
  const geometry = useMemo(() => buildRuin(), []);
  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial vertexColors roughness={0.95} metalness={0} />
    </mesh>
  );
}
