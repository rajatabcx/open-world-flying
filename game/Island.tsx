"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { BackSide, BufferAttribute, BufferGeometry, Color, DataTexture, LinearFilter, Material, Mesh, MeshStandardMaterial, RedFormat, UnsignedByteType } from "three";
import { groundColor } from "./ground";
import { bindUniforms, FOG_GLSL, shared } from "./shared";
import { caveAt, GRID, heights, WORLD_SIZE } from "./terrain";
import { treeShade } from "./trees";

const CHUNKS = 12;

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
      groundColor(c, x, z, h);
      c.multiplyScalar(1 - shade[k] * 0.32);
      // The floor of a cave sits in the dark, whatever the sun's doing.
      const cave = caveAt(x, z);
      if (cave && cave.distance < cave.cave.half + 14) c.multiplyScalar(0.28);
      colors[k * 3] = c.r;
      colors[k * 3 + 1] = c.g;
      colors[k * 3 + 2] = c.b;
    }
  }
  const position = new BufferAttribute(positions, 3);
  const color = new BufferAttribute(colors, 3);

  const whole = new BufferGeometry();
  whole.setAttribute("position", position);
  const allIndex = new Uint32Array(GRID * GRID * 6);
  const chunks: BufferGeometry[] = [];
  const size = Math.ceil(GRID / CHUNKS);
  let n = 0;
  for (let cj = 0; cj < CHUNKS; cj++) {
    for (let ci = 0; ci < CHUNKS; ci++) {
      const start = n;
      for (let j = cj * size; j < Math.min(GRID, (cj + 1) * size); j++) {
        for (let i = ci * size; i < Math.min(GRID, (ci + 1) * size); i++) {
          const a = j * row + i;
          const b = a + 1;
          const d = a + row;
          const e = d + 1;
          allIndex[n++] = a;
          allIndex[n++] = d;
          allIndex[n++] = b;
          allIndex[n++] = b;
          allIndex[n++] = d;
          allIndex[n++] = e;
        }
      }
      const g = new BufferGeometry();
      g.setAttribute("position", position);
      g.setAttribute("color", color);
      g.setIndex(new BufferAttribute(allIndex.subarray(start, n), 1));
      chunks.push(g);
    }
  }
  whole.setIndex(new BufferAttribute(allIndex, 1));
  whole.computeVertexNormals();
  const normal = whole.attributes.normal;
  for (const g of chunks) {
    g.setAttribute("normal", normal);
    g.computeBoundingSphere();
  }
  return chunks;
}

// A fine grain over the vertex colours, so the ground holds up when you fly low.
function grainy(material: Material) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vGround;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvGround = position;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        /* glsl */ `#include <common>
        varying vec3 vGround;
        float gHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float gNoise(vec2 p) {
          vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(gHash(i), gHash(i + vec2(1, 0)), f.x), mix(gHash(i + vec2(0, 1)), gHash(i + vec2(1, 1)), f.x), f.y);
        }`,
      )
      .replace(
        "#include <color_fragment>",
        /* glsl */ `#include <color_fragment>
        {
          float grain = gNoise(vGround.xz * 0.55) * 0.5 + gNoise(vGround.xz * 1.9) * 0.3 + gNoise(vGround.xz * 6.0) * 0.2;
          float fade = 1.0 - smoothstep(120.0, 700.0, length(vGround - cameraPosition));
          diffuseColor.rgb *= 1.0 + (grain - 0.5) * 0.3 * fade;
        }`,
      );
  };
  return material;
}

export function Terrain() {
  const chunks = useMemo(() => buildTerrain(), []);
  const material = useMemo(() => grainy(new MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 })), []);
  return (
    <>
      {chunks.map((geometry, i) => (
        <mesh key={i} geometry={geometry} material={material} receiveShadow />
      ))}
    </>
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
    () => ({ ...shared, uDepth: { value: depthTexture() }, uSize: { value: WORLD_SIZE } }),
    [],
  );
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} frustumCulled={false} renderOrder={1}>
      <planeGeometry args={[18000, 18000]} />
      <shaderMaterial
        transparent
        depthWrite={false}
        uniforms={uniforms}
        ref={bindUniforms(uniforms)}
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
          uniform vec3 uKey;
          uniform vec3 uAmbient;
          uniform vec3 uSkyMid;
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
            col *= uAmbient * 0.95 + uKey * 0.46;
            col = mix(col, uSkyMid * 1.15, fresnel * 0.5);
            float spec = pow(max(dot(reflect(-uSun, normal), view), 0.0), 140.0);
            col += uKey * spec * 1.1;

            float band = sin(ground * 1.15 + uTime * 0.7 + noise(vWorld.xz * 0.03) * 5.0);
            float foam = smoothstep(0.55, 0.95, band) * smoothstep(-9.0, -2.0, ground);
            foam += smoothstep(-1.4, -0.3, ground);
            float foamAmount = clamp(foam, 0.0, 1.0) * 0.8;
            col = mix(col, vec3(0.98) * (uAmbient * 0.95 + uKey * 0.46), foamAmount);

            // Shallow water is clear enough to see the sea floor.
            float clear = mix(0.4, 1.0, smoothstep(0.08, 0.62, depth));
            gl_FragColor = vec4(applyFog(col, dist), mix(clear, 1.0, max(foamAmount, smoothstep(600.0, 1600.0, dist))));
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
  return (
    <mesh ref={ref} renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[6000, 32, 20]} />
      <shaderMaterial
        side={BackSide}
        depthWrite={false}
        uniforms={shared}
        ref={bindUniforms(shared)}
        vertexShader={/* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={/* glsl */ `
          uniform vec3 uSun;
          uniform vec3 uFogColor;
          uniform vec3 uSkyMid;
          uniform vec3 uSkyTop;
          uniform vec3 uDisc;
          uniform float uNight;
          uniform float uMoon;
          uniform float uTime;
          varying vec3 vDir;
          float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
          void main() {
            vec3 dir = normalize(vDir);
            float up = max(dir.y, 0.0);
            vec3 col = mix(uFogColor, uSkyMid, pow(up, 0.55));
            col = mix(col, uSkyTop, smoothstep(0.35, 1.0, up));
            float sun = max(dot(dir, uSun), 0.0);
            if (uMoon < 0.5) {
              col += uDisc * pow(sun, 7.0) * 0.28;
              col += uDisc * pow(sun, 400.0) * 1.6;
            } else {
              // A pale moon, with a soft halo.
              col += uDisc * pow(sun, 90.0) * 0.14;
              col = mix(col, uDisc, smoothstep(0.99905, 0.99935, sun));
            }
            if (uNight > 0.01) {
              // Each cell of the sky may hold one star, twinkling at its own pace.
              vec3 cell = floor(dir * 170.0);
              float seed = hash(cell);
              vec3 centre = (cell + 0.5 + (vec3(hash(cell + 1.0), hash(cell + 2.0), hash(cell + 3.0)) - 0.5) * 0.7) / 170.0;
              float star = smoothstep(0.0032, 0.0008, length(dir - normalize(centre))) * step(0.82, seed);
              float twinkle = 0.65 + 0.35 * sin(uTime * (0.8 + seed * 2.4) + seed * 40.0);
              col += vec3(0.95, 0.97, 1.0) * star * twinkle * smoothstep(0.0, 0.18, dir.y) * uNight * (0.45 + seed * 0.55);
            }
            gl_FragColor = vec4(col, 1.0);
            #include <colorspace_fragment>
          }
        `}
      />
    </mesh>
  );
}
