"use client";

import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import { AdditiveBlending, BoxGeometry, BufferGeometry, Color, ConeGeometry, CylinderGeometry, DoubleSide, Float32BufferAttribute, Group, InstancedMesh, LatheGeometry, Matrix4, Object3D, PointsMaterial, SphereGeometry, SpriteMaterial, Vector2 } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { flight } from "./flight";
import { bindUniforms, FOG_GLSL, glowTexture, paint, shared } from "./shared";
import { heightAt, rng, slopeAt, VILLAGES } from "./terrain";
import { sky } from "./time";
import { fromLocal, HOMES, LIGHTHOUSES, WINDMILLS, type Home } from "./villages";

const dummy = new Object3D();
const m = new Matrix4();

function Sails() {
  const ref = useRef<InstancedMesh>(null!);
  const geometry = useMemo(() => {
    const parts: BufferGeometry[] = [paint(new CylinderGeometry(0.4, 0.4, 1, 12).rotateX(Math.PI / 2), "#6d5a3f")];
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      parts.push(paint(new BoxGeometry(0.16, 9.5, 0.14).translate(0, 5.1, 0).rotateZ(a), "#6d5a3f"));
      parts.push(paint(new BoxGeometry(1.7, 7.6, 0.08).translate(0.8, 5.6, 0).rotateZ(a), "#fdf8ec"));
    }
    return mergeGeometries(parts)!;
  }, []);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    WINDMILLS.forEach((w, i) => {
      dummy.position.set(w.x, w.y, w.z);
      dummy.rotation.set(0, w.yaw, 0);
      dummy.updateMatrix();
      m.makeTranslation(0, 13, 5.1);
      dummy.matrix.multiply(m);
      m.makeRotationZ(t * 0.55 + i * 1.7);
      dummy.matrix.multiply(m);
      ref.current.setMatrixAt(i, dummy.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[geometry, undefined, WINDMILLS.length]} frustumCulled={false} castShadow>
      <meshStandardMaterial vertexColors flatShading roughness={0.9} />
    </instancedMesh>
  );
}

type Boat = { x: number; z: number; r: number; speed: number; phase: number; tint: Color };

function findBoats() {
  const r = rng(616);
  const out: Boat[] = [];
  const tints = ["#d9483b", "#2a6f97", "#f2c14e", "#3f8f7a", "#fbf7ee"].map((c) => new Color(c));
  VILLAGES.forEach((v) => {
    let made = 0;
    for (let tries = 0; tries < 400 && made < 6; tries++) {
      const a = r() * 6.28;
      const d = v.r * 1.1 + r() * 340;
      const x = v.x + Math.cos(a) * d;
      const z = v.z + Math.sin(a) * d;
      if (heightAt(x, z) > -5) continue;
      if (out.some((b) => Math.hypot(b.x - x, b.z - z) < 40)) continue;
      out.push({ x, z, r: 12 + r() * 22, speed: 0.03 + r() * 0.03, phase: r() * 6.28, tint: tints[Math.floor(r() * tints.length)] });
      made++;
    }
  });
  return out;
}

function Boats() {
  const ref = useRef<InstancedMesh>(null!);
  const boats = useMemo(() => findBoats(), []);
  const geometry = useMemo(() => {
    const hull = new LatheGeometry(
      [
        [0.01, 0],
        [0.7, 0.05],
        [1, 0.6],
        [1.12, 1.15],
      ].map(([x, y]) => new Vector2(x, y)),
      24,
    ).scale(1.5, 1, 4.4);
    const deck = new CylinderGeometry(1.08, 1.08, 0.08, 24).scale(1.5, 1, 4.4).translate(0, 1.02, 0);
    const mast = new CylinderGeometry(0.07, 0.09, 8.5, 8).translate(0, 5.2, -0.5);
    const sail = new BufferGeometry();
    const sailPts: number[] = [];
    const across = 6;
    const rows = 8;
    for (let j = 0; j <= rows; j++) {
      for (let i = 0; i <= across; i++) {
        const v = j / rows;
        const u = (i / across) * (1 - v);
        sailPts.push(Math.sin(u * Math.PI) * 0.6 * (1 - v), 1.7 + v * 7, -0.35 + u * 4.4);
      }
    }
    const sailIndex: number[] = [];
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < across; i++) {
        const a = j * (across + 1) + i;
        sailIndex.push(a, a + 1, a + across + 1, a + 1, a + across + 2, a + across + 1);
      }
    }
    sail.setAttribute("position", new Float32BufferAttribute(sailPts, 3));
    sail.setIndex(sailIndex);
    return mergeGeometries([paint(hull, "#ffffff"), paint(deck, "#caa97c"), paint(mast, "#6d5a3f"), paint(sail, "#fff8ea")])!;
  }, []);
  useLayoutEffect(() => {
    boats.forEach((b, i) => ref.current.setColorAt(i, b.tint));
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
  }, [boats]);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    boats.forEach((b, i) => {
      const a = t * b.speed + b.phase;
      dummy.position.set(b.x + Math.cos(a) * b.r, Math.sin(t * 0.9 + b.phase) * 0.22 - 0.25, b.z + Math.sin(a) * b.r);
      dummy.rotation.set(Math.sin(t * 0.7 + b.phase) * 0.04, -a, Math.sin(t * 0.9 + b.phase) * 0.06);
      dummy.updateMatrix();
      ref.current.setMatrixAt(i, dummy.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[geometry, undefined, boats.length]} frustumCulled={false} castShadow>
      <meshStandardMaterial vertexColors side={DoubleSide} roughness={0.85} />
    </instancedMesh>
  );
}

type Sheep = { x: number; y: number; z: number; yaw: number; phase: number; scale: number };

function findSheep() {
  const r = rng(404);
  const out: Sheep[] = [];
  for (const v of VILLAGES) {
    // They graze in small flocks on the gentle slopes outside the village.
    for (let flock = 0; flock < 5; flock++) {
      const a = r() * 6.28;
      const d = v.r * (1.25 + r() * 1.25);
      const cx = v.x + Math.cos(a) * d;
      const cz = v.z + Math.sin(a) * d;
      for (let i = 0; i < 9; i++) {
        const x = cx + (r() - 0.5) * 42;
        const z = cz + (r() - 0.5) * 42;
        const y = heightAt(x, z);
        if (y < 4 || slopeAt(x, z) > 0.5) continue;
        out.push({ x, y, z, yaw: r() * 6.28, phase: r() * 6.28, scale: 0.85 + r() * 0.3 });
      }
    }
  }
  return out;
}

function SheepFlocks() {
  const ref = useRef<InstancedMesh>(null!);
  const sheep = useMemo(() => findSheep(), []);
  const geometry = useMemo(() => {
    const wool = paint(new SphereGeometry(0.72, 14, 10).scale(1, 0.82, 1.3).translate(0, 0.95, 0), "#f6f1e4");
    const head = paint(new SphereGeometry(0.28, 12, 8).scale(0.85, 1, 1.15).translate(0, 1.1, 1.02), "#2f2823");
    const ears = paint(new BoxGeometry(0.72, 0.09, 0.12).translate(0, 1.2, 0.92), "#2f2823");
    const legs = [
      [-0.32, 0.5],
      [0.32, 0.5],
      [-0.32, -0.5],
      [0.32, -0.5],
    ].map(([x, z]) => paint(new CylinderGeometry(0.07, 0.07, 0.62, 6).translate(x, 0.3, z), "#2f2823"));
    return mergeGeometries([wool, head, ears, ...legs])!;
  }, []);
  useFrame((state) => {
    if (Math.hypot(flight.pos.x, flight.pos.z) > 2400) return;
    const t = state.clock.elapsedTime;
    sheep.forEach((s, i) => {
      const step = t * 0.05 + s.phase;
      const px = s.x + Math.cos(step) * 3.5;
      const pz = s.z + Math.sin(step * 0.8) * 3.5;
      dummy.position.set(px, s.y + Math.abs(Math.sin(t * 1.3 + s.phase)) * 0.03, pz);
      dummy.rotation.set(Math.max(0, Math.sin(t * 0.3 + s.phase)) * 0.12, step + s.yaw, 0);
      dummy.scale.setScalar(s.scale);
      dummy.updateMatrix();
      ref.current.setMatrixAt(i, dummy.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[geometry, undefined, sheep.length]} frustumCulled={false} castShadow>
      <meshStandardMaterial vertexColors roughness={1} />
    </instancedMesh>
  );
}

const CLOTHES = ["#fbf7ee", "#d9483b", "#2a6f97", "#f2c14e", "#f2a3a9", "#7fb7be", "#ffffff"];

function washingGeometry() {
  const r = rng(99);
  const positions: number[] = [];
  const colors: number[] = [];
  const sway: number[] = [];
  const index: number[] = [];
  const c = new Color();
  HOMES.forEach((home, i) => {
    if (i % 3 !== 0) return;
    const a = fromLocal(home, home.w * 0.5, -home.d * 0.35);
    const b = fromLocal(home, home.w * 0.5 + 8, -home.d * 0.35);
    const y0 = home.y + 3.6;
    // A rope, and a few pieces of laundry pegged out along it.
    for (let piece = 0; piece < 5; piece++) {
      const t0 = (piece + 0.1) / 5;
      const t1 = (piece + 0.85) / 5;
      c.set(CLOTHES[Math.floor(r() * CLOTHES.length)]);
      const height = 1.1 + r() * 0.8;
      const rows = 3;
      const start = positions.length / 3;
      for (let j = 0; j <= rows; j++) {
        for (const t of [t0, t1]) {
          const v = j / rows;
          positions.push(a.x + (b.x - a.x) * t, y0 - Math.sin(t * Math.PI) * 0.4 - v * height, a.z + (b.z - a.z) * t);
          colors.push(c.r, c.g, c.b);
          sway.push(v * (0.6 + t));
        }
      }
      for (let j = 0; j < rows; j++) {
        const q = start + j * 2;
        index.push(q, q + 1, q + 2, q + 1, q + 3, q + 2);
      }
    }
  });
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(positions, 3));
  g.setAttribute("color", new Float32BufferAttribute(colors, 3));
  g.setAttribute("aSway", new Float32BufferAttribute(sway, 1));
  g.setIndex(index);
  return g;
}

function Washing() {
  const geometry = useMemo(() => washingGeometry(), []);
  return (
    <mesh geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        side={DoubleSide}
        vertexColors
        uniforms={shared}
        ref={bindUniforms(shared)}
        vertexShader={/* glsl */ `
          attribute float aSway;
          uniform float uTime;
          varying vec3 vColor;
          varying float vDist;
          void main() {
            vColor = color;
            vec3 p = position;
            float t = uTime * 2.3 + position.x * 0.7 + position.z * 0.6;
            p.x += sin(t) * aSway * 0.5;
            p.z += cos(t * 0.8) * aSway * 0.5;
            vec4 view = modelViewMatrix * vec4(p, 1.0);
            vDist = -view.z;
            gl_Position = projectionMatrix * view;
          }
        `}
        fragmentShader={/* glsl */ `
          uniform vec3 uKey;
          uniform vec3 uAmbient;
          varying vec3 vColor;
          varying float vDist;
          ${FOG_GLSL}
          void main() {
            gl_FragColor = vec4(applyFog(vColor * (uAmbient + uKey * 0.5), vDist), 1.0);
            #include <colorspace_fragment>
          }
        `}
      />
    </mesh>
  );
}

function windowGeometry() {
  const r = rng(2468);
  const parts: BufferGeometry[] = [];
  const place = (home: Home, w: number, h: number, d: number, x: number, y: number, z: number, lit: number) => {
    const g = new BoxGeometry(w, h, d).translate(x, y, z).rotateY(home.yaw).translate(home.x, home.y, home.z);
    g.deleteAttribute("uv");
    g.deleteAttribute("normal");
    g.setAttribute("aLit", new Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(lit), 1));
    parts.push(g);
  };
  for (const home of HOMES) {
    for (const side of [-1, 1]) {
      place(home, 1.1, 1.5, 0.22, side * home.w * 0.28, home.h * 0.62, home.d / 2, r());
      place(home, 0.22, 1.5, 1.1, side * (home.w / 2), home.h * 0.62, side * home.d * 0.14, r());
    }
  }
  return mergeGeometries(parts)!;
}

function Windows() {
  const geometry = useMemo(() => windowGeometry(), []);
  return (
    <mesh geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        uniforms={shared}
        ref={bindUniforms(shared)}
        vertexShader={/* glsl */ `
          attribute float aLit;
          varying float vLit;
          varying float vDist;
          void main() {
            vLit = aLit;
            vec4 view = modelViewMatrix * vec4(position, 1.0);
            vDist = -view.z;
            gl_Position = projectionMatrix * view;
          }
        `}
        fragmentShader={/* glsl */ `
          uniform float uNight;
          uniform vec3 uAmbient;
          varying float vLit;
          varying float vDist;
          ${FOG_GLSL}
          void main() {
            // Most windows light up, each at its own moment as evening falls.
            float on = smoothstep(vLit * 0.8, vLit * 0.8 + 0.12, uNight) * step(vLit, 0.82);
            vec3 col = mix(vec3(0.24, 0.35, 0.41) * (uAmbient * 1.5), vec3(1.0, 0.76, 0.42), on);
            gl_FragColor = vec4(applyFog(col, vDist * (1.0 - on * 0.7)), 1.0);
            #include <colorspace_fragment>
          }
        `}
      />
    </mesh>
  );
}

function NightGlow() {
  const material = useRef<PointsMaterial>(null!);
  const glow = useMemo(() => glowTexture(), []);
  const geometry = useMemo(() => {
    const r = rng(1357);
    const spots: number[] = [];
    for (const home of HOMES) {
      if (r() > 0.6) continue;
      const p = fromLocal(home, 0, home.d / 2 + 1);
      spots.push(p.x, home.y + home.h * 0.7, p.z);
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(spots, 3));
    return g;
  }, []);
  useFrame(() => {
    material.current.opacity = sky.night * 0.62;
    material.current.visible = sky.night > 0.02;
  });
  return (
    <points geometry={geometry} frustumCulled={false} renderOrder={14}>
      <pointsMaterial ref={material} map={glow} color="#ffb765" size={13} sizeAttenuation transparent depthWrite={false} blending={AdditiveBlending} opacity={0} />
    </points>
  );
}

function Lighthouses() {
  const groups = useRef<(Group | null)[]>([]);
  const glowMaterials = useRef<(SpriteMaterial | null)[]>([]);
  const glow = useMemo(() => glowTexture(), []);
  const beam = useMemo(() => new ConeGeometry(34, 420, 24, 1, true).rotateZ(Math.PI / 2).translate(210, 0, 0), []);
  const uniforms = useMemo(() => ({ uNight: shared.uNight }), []);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    LIGHTHOUSES.forEach((_, i) => {
      const g = groups.current[i];
      if (!g) return;
      g.visible = sky.night > 0.05;
      g.rotation.y = t * 0.3 + i * 1.6;
      const lamp = glowMaterials.current[i];
      if (lamp) lamp.opacity = sky.night;
    });
  });
  return (
    <>
      {LIGHTHOUSES.map((l, i) => (
        <group key={i} ref={(g) => { groups.current[i] = g; }} position={[l.x, l.y + 32.4, l.z]} visible={false}>
          <sprite scale={[42, 42, 1]}>
            <spriteMaterial ref={(mat) => { glowMaterials.current[i] = mat; }} map={glow} color="#ffe6a8" transparent depthWrite={false} blending={AdditiveBlending} opacity={0} />
          </sprite>
          {[0, Math.PI].map((a) => (
            <mesh key={a} geometry={beam} rotation={[0, a, 0]} frustumCulled={false} renderOrder={13}>
              <shaderMaterial
                transparent
                depthWrite={false}
                side={DoubleSide}
                blending={AdditiveBlending}
                uniforms={uniforms}
        ref={bindUniforms(uniforms)}
                vertexShader={/* glsl */ `
                  varying float vAlong;
                  void main() {
                    vAlong = position.x / 420.0;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                  }
                `}
                fragmentShader={/* glsl */ `
                  uniform float uNight;
                  varying float vAlong;
                  void main() {
                    gl_FragColor = vec4(1.0, 0.9, 0.62, pow(1.0 - vAlong, 2.0) * 0.2 * uNight);
                  }
                `}
              />
            </mesh>
          ))}
        </group>
      ))}
    </>
  );
}

export function VillageLife() {
  return (
    <>
      <Sails />
      <Boats />
      <SheepFlocks />
      <Washing />
      <Windows />
      <NightGlow />
      <Lighthouses />
    </>
  );
}
