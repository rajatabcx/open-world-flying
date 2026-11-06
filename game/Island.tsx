"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { BackSide, BufferAttribute, BufferGeometry, Color, DataTexture, LinearFilter, Mesh, RedFormat, UnsignedByteType } from "three";
import { FOG_GLSL, shared } from "./shared";
import { fbm, GRID, heights, slopeAt, smooth, WORLD_SIZE } from "./terrain";
import { treeShade } from "./trees";
import { SUN } from "./world";

const SAND = new Color("#ead9ac");
const DRY = new Color("#c5ad62");
const GRASS = new Color("#8a9d4e");
const GREEN = new Color("#5f8440");
const ROCK = new Color("#a98f76");
const PALE = new Color("#cfc4b0");
const SNOW = new Color("#f6f3ec");
const SEABED = new Color("#d7c996");

function buildTerrain() {
  const row = GRID + 1;
  const positions = new Float32Array(row * row * 3);
  const colors = new Float32Array(row * row * 3);
  const c = new Color();
  const shade = treeShade();
  for (let j = 0; j < row; j++) {
    for (let i = 0; i < row; i++) {
      const k = j * row + i;
      const x = (i / GRID - 0.5) * WORLD_SIZE;
      const z = (j / GRID - 0.5) * WORLD_SIZE;
      const h = heights[k];
      positions[k * 3] = x;
      positions[k * 3 + 1] = h;
      positions[k * 3 + 2] = z;

      const patch = fbm(x * 0.006, z * 0.006, 3);
      const detail = fbm(x * 0.05, z * 0.05, 2);
      const slope = slopeAt(x, z);
      c.copy(DRY).lerp(GRASS, smooth(0.38, 0.55, patch)).lerp(GREEN, smooth(0.52, 0.68, patch));
      c.lerp(SAND, smooth(9, 3, h));
      c.lerp(SEABED, smooth(0, -6, h));
      c.lerp(PALE, smooth(170, 290, h + detail * 50));
      c.lerp(ROCK, smooth(0.42, 0.8, slope + (detail - 0.5) * 0.25));
      c.lerp(SNOW, smooth(455, 560, h + detail * 70 - slope * 40));
      c.multiplyScalar((0.9 + detail * 0.2) * (1 - shade[k] * 0.32));
      colors[k * 3] = c.r;
      colors[k * 3 + 1] = c.g;
      colors[k * 3 + 2] = c.b;
    }
  }
  const index = new Uint32Array(GRID * GRID * 6);
  let n = 0;
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      const a = j * row + i;
      const b = a + 1;
      const d = a + row;
      const e = d + 1;
      index[n++] = a;
      index[n++] = d;
      index[n++] = b;
      index[n++] = b;
      index[n++] = d;
      index[n++] = e;
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(positions, 3));
  g.setAttribute("color", new BufferAttribute(colors, 3));
  g.setIndex(new BufferAttribute(index, 1));
  g.computeVertexNormals();
  return g;
}

export function Terrain() {
  const geometry = useMemo(() => buildTerrain(), []);
  return (
    <mesh geometry={geometry} receiveShadow frustumCulled={false}>
      <meshStandardMaterial vertexColors flatShading roughness={1} metalness={0} />
    </mesh>
  );
}

function depthTexture() {
  const row = GRID + 1;
  const data = new Uint8Array(row * row);
  for (let k = 0; k < data.length; k++) {
    data[k] = Math.max(0, Math.min(255, ((heights[k] + 70) / 90) * 255));
  }
  const t = new DataTexture(data, row, row, RedFormat, UnsignedByteType);
  t.unpackAlignment = 1;
  t.minFilter = LinearFilter;
  t.magFilter = LinearFilter;
  t.needsUpdate = true;
  return t;
}

export function Water() {
  const uniforms = useMemo(
    () => ({ ...shared, uDepth: { value: depthTexture() }, uSun: { value: SUN }, uSize: { value: WORLD_SIZE } }),
    [],
  );
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} frustumCulled={false} renderOrder={1}>
      <planeGeometry args={[18000, 18000]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={/* glsl */ `
          varying vec3 vWorld;
          void main() {
            vec4 w = modelMatrix * vec4(position, 1.0);
            vWorld = w.xyz;
            gl_Position = projectionMatrix * viewMatrix * w;
          }
        `}
        fragmentShader={/* glsl */ `
          uniform float uTime;
          uniform float uSize;
          uniform sampler2D uDepth;
          uniform vec3 uSun;
          varying vec3 vWorld;
          ${FOG_GLSL}
          float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float noise(vec2 p) {
            vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
          }
          float waves(vec2 p) {
            return noise(p + uTime * vec2(0.22, 0.13)) * 0.6 + noise(p * 2.3 - uTime * vec2(0.18, 0.28)) * 0.4;
          }
          void main() {
            vec2 uv = vWorld.xz / uSize + 0.5;
            float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
            float ground = mix(-70.0, texture2D(uDepth, uv).r * 90.0 - 70.0, inside);
            float depth = clamp(-ground / 42.0, 0.0, 1.0);

            vec3 toCam = cameraPosition - vWorld;
            float dist = length(toCam);
            vec3 view = toCam / dist;

            vec2 p = vWorld.xz * 0.045;
            float e = 0.35;
            vec3 normal = normalize(vec3(waves(p - vec2(e, 0)) - waves(p + vec2(e, 0)), 1.4, waves(p - vec2(0, e)) - waves(p + vec2(0, e))));

            vec3 col = mix(vec3(0.20, 0.78, 0.72), vec3(0.015, 0.20, 0.38), smoothstep(0.02, 0.8, depth));
            float fresnel = pow(1.0 - max(dot(view, normal), 0.0), 4.0);
            col = mix(col, vec3(0.55, 0.74, 0.88), fresnel * 0.5);
            float spec = pow(max(dot(reflect(-uSun, normal), view), 0.0), 140.0);
            col += vec3(1.0, 0.92, 0.75) * spec * 1.1;

            float band = sin(ground * 1.15 + uTime * 0.7 + noise(vWorld.xz * 0.03) * 5.0);
            float foam = smoothstep(0.55, 0.95, band) * smoothstep(-9.0, -2.0, ground);
            foam += smoothstep(-1.4, -0.3, ground);
            col = mix(col, vec3(0.98), clamp(foam, 0.0, 1.0) * 0.8);

            gl_FragColor = vec4(applyFog(col, dist), 1.0);
            #include <colorspace_fragment>
          }
        `}
      />
    </mesh>
  );
}

export function Sky() {
  const ref = useRef<Mesh>(null!);
  useFrame(({ camera }) => {
    ref.current.position.copy(camera.position);
  });
  const uniforms = useMemo(() => ({ uSun: { value: SUN }, uHorizon: shared.uFogColor }), []);
  return (
    <mesh ref={ref} renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[6000, 24, 16]} />
      <shaderMaterial
        side={BackSide}
        depthWrite={false}
        uniforms={uniforms}
        vertexShader={/* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={/* glsl */ `
          uniform vec3 uSun;
          uniform vec3 uHorizon;
          varying vec3 vDir;
          void main() {
            vec3 dir = normalize(vDir);
            float up = max(dir.y, 0.0);
            vec3 col = mix(uHorizon, vec3(0.42, 0.68, 0.90), pow(up, 0.55));
            col = mix(col, vec3(0.24, 0.50, 0.82), smoothstep(0.35, 1.0, up));
            float sun = max(dot(dir, uSun), 0.0);
            col += vec3(1.0, 0.72, 0.42) * pow(sun, 7.0) * 0.28;
            col += vec3(1.0, 0.86, 0.62) * pow(sun, 400.0) * 1.6;
            gl_FragColor = vec4(col, 1.0);
            #include <colorspace_fragment>
          }
        `}
      />
    </mesh>
  );
}

