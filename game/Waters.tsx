"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { AdditiveBlending, BufferGeometry, DoubleSide, Float32BufferAttribute, NormalBlending, PlaneGeometry, Points, Vector3 } from "three";
import { bindUniforms, FOG_GLSL, glowTexture, shared } from "./shared";
import { FALLS, heightAt, RIVER } from "./terrain";

const NOISE = /* glsl */ `
  float wHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float wNoise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(wHash(i), wHash(i + vec2(1, 0)), f.x), mix(wHash(i + vec2(0, 1)), wHash(i + vec2(1, 1)), f.x), f.y);
  }
`;

const ACROSS = 10;

function riverGeometry() {
  const positions: number[] = [];
  const uvs: number[] = [];
  const depths: number[] = [];
  const index: number[] = [];
  let run = 0;
  RIVER.forEach((p, i) => {
    const prev = RIVER[Math.max(0, i - 1)];
    const next = RIVER[Math.min(RIVER.length - 1, i + 1)];
    const tx = next.x - prev.x;
    const tz = next.z - prev.z;
    const len = Math.hypot(tx, tz) || 1;
    if (i > 0) run += Math.hypot(p.x - prev.x, p.z - prev.z);
    for (let j = 0; j <= ACROSS; j++) {
      const u = j / ACROSS;
      const side = (u - 0.5) * 2 * (p.width + 3);
      const x = p.x + (-tz / len) * side;
      const z = p.z + (tx / len) * side;
      positions.push(x, p.y + 0.15, z);
      depths.push(p.y + 0.15 - heightAt(x, z));
      uvs.push(u, run);
    }
    if (i < RIVER.length - 1) {
      const row = ACROSS + 1;
      for (let j = 0; j < ACROSS; j++) {
        const a = i * row + j;
        index.push(a, a + 1, a + row, a + 1, a + row + 1, a + row);
      }
    }
  });
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(positions, 3));
  g.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  g.setAttribute("aDepth", new Float32BufferAttribute(depths, 1));
  g.setIndex(index);
  return g;
}

function River() {
  const geometry = useMemo(() => riverGeometry(), []);
  return (
    <mesh geometry={geometry} frustumCulled={false} renderOrder={2}>
      <shaderMaterial
        transparent
        depthWrite={false}
        side={DoubleSide}
        uniforms={shared}
        ref={bindUniforms(shared)}
        vertexShader={/* glsl */ `
          attribute float aDepth;
          varying vec2 vUv;
          varying vec3 vWorld;
          varying float vDepth;
          void main() {
            vUv = uv;
            vWorld = position;
            vDepth = aDepth;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={/* glsl */ `
          uniform float uTime;
          uniform vec3 uKey;
          uniform vec3 uAmbient;
          varying vec2 vUv;
          varying vec3 vWorld;
          varying float vDepth;
          ${FOG_GLSL}
          ${NOISE}
          void main() {
            float edge = abs(vUv.x - 0.5) * 2.0;
            float flow = vUv.y * 0.09 - uTime * 0.5;
            float streak = wNoise(vec2(vUv.x * 13.0, flow * 3.0)) * 0.6 + wNoise(vec2(vUv.x * 31.0 + 4.0, flow * 8.0)) * 0.4;
            vec3 deep = vec3(0.07, 0.47, 0.52);
            vec3 shallow = vec3(0.34, 0.80, 0.74);
            vec3 col = mix(deep, shallow, smoothstep(0.35, 1.0, edge) * 0.8 + streak * 0.2);
            col = mix(col, vec3(0.96, 0.99, 0.98), smoothstep(0.68, 0.84, streak) * 0.75);
            col *= uAmbient * 0.75 + uKey * 0.6;
            float dist = length(cameraPosition - vWorld);
            gl_FragColor = vec4(applyFog(col, dist), smoothstep(1.0, 0.82, edge) * smoothstep(0.0, 0.8, vDepth) * 0.96);
            #include <colorspace_fragment>
          }
        `}
      />
    </mesh>
  );
}

function Pool() {
  const geometry = useMemo(() => {
    // A grid that knows the depth under each corner, so the shoreline comes out smooth.
    const g = new PlaneGeometry(FALLS.r * 3, FALLS.r * 3, 44, 44).rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    const depth = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) depth[i] = FALLS.pool - heightAt(pos.getX(i) + FALLS.x, pos.getZ(i) + FALLS.z);
    g.setAttribute("aDepth", new Float32BufferAttribute(depth, 1));
    return g;
  }, []);
  const uniforms = useMemo(() => ({ ...shared, uFalls: { value: new Vector3((FALLS.r + 2) * FALLS.back.x, (FALLS.r + 2) * FALLS.back.z, 0) } }), []);
  return (
    <mesh geometry={geometry} position={[FALLS.x, FALLS.pool, FALLS.z]} renderOrder={2}>
      <shaderMaterial
        transparent
        depthWrite={false}
        uniforms={uniforms}
        ref={bindUniforms(uniforms)}
        vertexShader={/* glsl */ `
          attribute float aDepth;
          varying vec2 vPos;
          varying vec3 vWorld;
          varying float vDepth;
          void main() {
            vDepth = aDepth;
            vPos = position.xz;
            vec4 w = modelMatrix * vec4(position, 1.0);
            vWorld = w.xyz;
            gl_Position = projectionMatrix * viewMatrix * w;
          }
        `}
        fragmentShader={/* glsl */ `
          uniform float uTime;
          uniform vec3 uKey;
          uniform vec3 uAmbient;
          uniform vec3 uFalls;
          varying vec2 vPos;
          varying vec3 vWorld;
          varying float vDepth;
          ${FOG_GLSL}
          ${NOISE}
          void main() {
            float d = length(vPos - uFalls.xy);
            float ring = sin(d * 0.7 - uTime * 3.0 + wNoise(vPos * 0.1) * 4.0) * 0.5 + 0.5;
            vec3 col = mix(vec3(0.08, 0.50, 0.55), vec3(0.3, 0.78, 0.74), wNoise(vPos * 0.12 + uTime * 0.1));
            col = mix(col, vec3(0.97), smoothstep(0.75, 1.0, ring) * smoothstep(50.0, 8.0, d) * 0.8);
            col = mix(col, vec3(0.97), smoothstep(16.0, 2.0, d) * 0.65);
            col *= uAmbient * 0.75 + uKey * 0.6;
            gl_FragColor = vec4(applyFog(col, length(cameraPosition - vWorld)), smoothstep(0.0, 0.7, vDepth) * 0.96);
            #include <colorspace_fragment>
          }
        `}
      />
    </mesh>
  );
}

const LIP = FALLS.r + 24;

function fallsGeometry(width: number, steps: number) {
  const positions: number[] = [];
  const uvs: number[] = [];
  const index: number[] = [];
  const { back } = FALLS;
  const side = { x: -back.z, z: back.x };
  const across = 16;
  // Water slides over the lip along the stream, then hangs in a long curtain.
  const profile: [number, number][] = [
    [LIP + 130, FALLS.top + 22],
    [LIP + 80, FALLS.top + 12],
    [LIP + 34, FALLS.top + 3],
    [LIP + 10, FALLS.top + 0.5],
    [LIP - 2, FALLS.top - 3],
  ];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    profile.push([LIP - 2 - Math.pow(t, 0.8) * 38, FALLS.top - 3 - (FALLS.top - FALLS.pool - 3) * t]);
  }
  let run = 0;
  profile.forEach(([along, y], i) => {
    if (i > 0) run += Math.hypot(along - profile[i - 1][0], y - profile[i - 1][1]);
    const curtain = i > 3;
    const half = width * (curtain ? 1 : 0.7);
    for (let j = 0; j <= across; j++) {
      const u = j / across;
      const off = (u - 0.5) * 2 * half;
      const wob = Math.sin(u * 19 + i) * 0.6;
      positions.push(FALLS.x + back.x * (along + wob) + side.x * off, y, FALLS.z + back.z * (along + wob) + side.z * off);
      uvs.push(u, run);
    }
    if (i < profile.length - 1) {
      const row = across + 1;
      for (let j = 0; j < across; j++) {
        const a = i * row + j;
        index.push(a, a + 1, a + row, a + 1, a + row + 1, a + row);
      }
    }
  });
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(positions, 3));
  g.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  g.setIndex(index);
  return g;
}

function Curtain() {
  const geometry = useMemo(() => fallsGeometry(17, 40), []);
  return (
    <mesh geometry={geometry} frustumCulled={false} renderOrder={3}>
      <shaderMaterial
        transparent
        depthWrite={false}
        side={DoubleSide}
        blending={NormalBlending}
        uniforms={shared}
        ref={bindUniforms(shared)}
        vertexShader={/* glsl */ `
          varying vec2 vUv;
          varying float vDist;
          void main() {
            vUv = uv;
            vec4 view = modelViewMatrix * vec4(position, 1.0);
            vDist = -view.z;
            gl_Position = projectionMatrix * view;
          }
        `}
        fragmentShader={/* glsl */ `
          uniform float uTime;
          uniform vec3 uKey;
          uniform vec3 uAmbient;
          varying vec2 vUv;
          varying float vDist;
          ${FOG_GLSL}
          ${NOISE}
          void main() {
            float fall = vUv.y * 0.035 - uTime * 1.5;
            float s = wNoise(vec2(vUv.x * 26.0, fall * 2.4)) * 0.55 + wNoise(vec2(vUv.x * 64.0, fall * 6.0)) * 0.45;
            float edge = smoothstep(0.0, 0.1, vUv.x) * smoothstep(1.0, 0.9, vUv.x);
            vec3 col = mix(vec3(0.62, 0.86, 0.9), vec3(1.0), smoothstep(0.32, 0.68, s));
            col *= uAmbient * 0.7 + uKey * 0.65;
            float a = edge * (0.62 + smoothstep(0.25, 0.6, s) * 0.38);
            gl_FragColor = vec4(applyFog(col, vDist), a);
            #include <colorspace_fragment>
          }
        `}
      />
    </mesh>
  );
}

const MIST = 90;

function Mist() {
  const ref = useRef<Points>(null!);
  const glow = useMemo(() => glowTexture(), []);
  const base = useMemo(() => {
    const out: { x: number; z: number; phase: number; drift: number }[] = [];
    for (let i = 0; i < MIST; i++) {
      const a = (i * 2.4) % 6.28;
      const d = 4 + ((i * 7) % 26);
      out.push({ x: FALLS.x + FALLS.back.x * (FALLS.r + 2) + Math.cos(a) * d, z: FALLS.z + FALLS.back.z * (FALLS.r + 2) + Math.sin(a) * d, phase: (i * 0.137) % 1, drift: 0.09 + ((i * 13) % 7) * 0.012 });
    }
    return out;
  }, []);
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(new Float32Array(MIST * 3), 3));
    return g;
  }, []);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const attr = ref.current.geometry.attributes.position;
    base.forEach((m, i) => {
      const life = (t * m.drift + m.phase) % 1;
      attr.setXYZ(i, m.x + Math.sin(t * 0.4 + i) * 3, FALLS.pool + life * 44, m.z + Math.cos(t * 0.3 + i) * 3);
    });
    attr.needsUpdate = true;
  });
  return (
    <points ref={ref} geometry={geometry} frustumCulled={false} renderOrder={4}>
      <pointsMaterial map={glow} size={24} sizeAttenuation transparent opacity={0.16} depthWrite={false} blending={AdditiveBlending} color="#ffffff" />
    </points>
  );
}

export function RiverAndFalls() {
  return (
    <>
      <River />
      <Pool />
      <Curtain />
      <Mist />
    </>
  );
}
