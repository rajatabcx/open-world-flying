"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { BufferGeometry, CircleGeometry, CylinderGeometry, DoubleSide, Float32BufferAttribute, Group, Mesh, RingGeometry, Vector3 } from "three";
import { bindUniforms, FOG_GLSL, shared } from "./shared";
import { rng } from "./terrain";
import { sky } from "./time";
import { SUN } from "./world";
import { weather } from "./weather";

const RAIN_DROPS = 4200;
const RAIN_BOX = 96;

const rainUniforms = { ...shared, uRain: { value: 0 }, uBox: { value: RAIN_BOX } };
const showerUniforms = { ...shared, uStrength: { value: 0 } };
const INNER = 1250;
const OUTER = 1490;
const rainbowUniforms = { uAlpha: { value: 0 }, uInner: { value: INNER }, uOuter: { value: OUTER } };

function Rain() {
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    const base = new Float32Array(RAIN_DROPS * 6);
    const end = new Float32Array(RAIN_DROPS * 2);
    const r = rng(7);
    for (let i = 0; i < RAIN_DROPS; i++) {
      const x = r() * RAIN_BOX;
      const y = r() * RAIN_BOX;
      const z = r() * RAIN_BOX;
      base.set([x, y, z, x, y, z], i * 6);
      end[i * 2 + 1] = 1;
    }
    g.setAttribute("position", new Float32BufferAttribute(base, 3));
    g.setAttribute("aEnd", new Float32BufferAttribute(end, 1));
    return g;
  }, []);
  useFrame(() => {
    rainUniforms.uRain.value = weather.rain;
  });
  return (
    <lineSegments geometry={geometry} frustumCulled={false} renderOrder={18}>
      <shaderMaterial
        transparent
        depthWrite={false}
        uniforms={rainUniforms}
        ref={bindUniforms(rainUniforms)}
        vertexShader={/* glsl */ `
          attribute float aEnd;
          uniform float uTime;
          uniform float uBox;
          varying float vFade;
          void main() {
            vec3 p = position;
            p.y -= uTime * 62.0;
            p.x += uTime * 6.0;
            // Each drop wraps around a box that travels with the camera.
            p = mod(p - cameraPosition, uBox) - uBox * 0.5;
            p += cameraPosition;
            p.y -= aEnd * 4.6;
            p.x += aEnd * 0.42;
            vec4 view = viewMatrix * vec4(p, 1.0);
            vFade = 1.0 - smoothstep(16.0, 48.0, length(view.xyz));
            gl_Position = projectionMatrix * view;
          }
        `}
        fragmentShader={/* glsl */ `
          uniform float uRain;
          uniform vec3 uAmbient;
          varying float vFade;
          void main() {
            if (uRain < 0.01) discard;
            gl_FragColor = vec4(uAmbient * 1.6, vFade * uRain * 0.72);
            #include <colorspace_fragment>
          }
        `}
      />
    </lineSegments>
  );
}

/** The shower seen from outside: a soft grey curtain under a dark cloud. */
function Shower() {
  const group = useRef<Group>(null!);
  const veil = useMemo(() => new CylinderGeometry(weather.radius, weather.radius * 1.08, 520, 48, 1, true).translate(0, 260, 0), []);
  const top = useMemo(() => new CircleGeometry(weather.radius * 1.35, 56).rotateX(-Math.PI / 2).translate(0, 500, 0), []);
  useFrame(() => {
    showerUniforms.uStrength.value = weather.strength;
    group.current.visible = weather.strength > 0.005;
    group.current.position.set(weather.x, 0, weather.z);
  });
  return (
    <group ref={group} visible={false}>
      <mesh geometry={veil} frustumCulled={false} renderOrder={19}>
        <shaderMaterial
          transparent
          depthWrite={false}
          side={DoubleSide}
          uniforms={showerUniforms}
        ref={bindUniforms(showerUniforms)}
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
            uniform float uStrength;
            uniform float uTime;
            uniform vec3 uAmbient;
            varying vec2 vUv;
            varying float vDist;
            float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
            float noise(vec2 p) {
              vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
              return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
            }
            void main() {
              float s = noise(vec2(vUv.x * 90.0, vUv.y * 3.0 + uTime * 0.7)) * 0.6 + noise(vec2(vUv.x * 28.0, vUv.y * 1.5 + uTime * 0.3)) * 0.4;
              float a = smoothstep(0.25, 0.75, s) * 0.34 * uStrength * smoothstep(90.0, 400.0, vDist);
              gl_FragColor = vec4(uAmbient * 0.95, a);
              #include <colorspace_fragment>
            }
          `}
        />
      </mesh>
      <mesh geometry={top} frustumCulled={false} renderOrder={19}>
        <shaderMaterial
          transparent
          depthWrite={false}
          side={DoubleSide}
          uniforms={showerUniforms}
        ref={bindUniforms(showerUniforms)}
          vertexShader={/* glsl */ `
            varying vec2 vPos;
            varying float vDist;
            void main() {
              vPos = position.xz;
              vec4 view = modelViewMatrix * vec4(position, 1.0);
              vDist = -view.z;
              gl_Position = projectionMatrix * view;
            }
          `}
          fragmentShader={/* glsl */ `
            uniform float uStrength;
            uniform float uTime;
            uniform vec3 uAmbient;
            varying vec2 vPos;
            varying float vDist;
            ${FOG_GLSL}
            float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
            float noise(vec2 p) {
              vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
              return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
            }
            void main() {
              vec2 q = vPos * 0.006 + uTime * 0.01;
              float n = noise(q) * 0.55 + noise(q * 2.4) * 0.3 + noise(q * 5.0) * 0.15;
              float edge = smoothstep(830.0, 300.0, length(vPos) + (n - 0.5) * 340.0);
              gl_FragColor = vec4(applyFog(uAmbient * (0.72 + n * 0.3), vDist), edge * 0.88 * uStrength);
              #include <colorspace_fragment>
            }
          `}
        />
      </mesh>
    </group>
  );
}

const antisolar = new Vector3();

function Rainbow() {
  const ref = useRef<Mesh>(null!);
  const geometry = useMemo(() => new RingGeometry(INNER, OUTER, 96, 8, 0, Math.PI), []);
  useFrame(({ camera }) => {
    const fade = Math.sin(Math.min(1, weather.rainbow) * Math.PI);
    rainbowUniforms.uAlpha.value = fade * (1 - sky.night) * (1 - weather.overcast * 0.5) * 0.6;
    ref.current.visible = rainbowUniforms.uAlpha.value > 0.003;
    if (!ref.current.visible) return;
    // A rainbow always stands opposite the sun, however far you fly toward it.
    antisolar.set(-SUN.x, 0, -SUN.z).normalize();
    ref.current.position.set(camera.position.x + antisolar.x * 2800, camera.position.y - 480, camera.position.z + antisolar.z * 2800);
    ref.current.lookAt(camera.position.x, camera.position.y - 480, camera.position.z);
  });
  return (
    <mesh ref={ref} geometry={geometry} frustumCulled={false} renderOrder={-5} visible={false}>
      <shaderMaterial
        transparent
        depthWrite={false}
        side={DoubleSide}
        uniforms={rainbowUniforms}
        ref={bindUniforms(rainbowUniforms)}
        vertexShader={/* glsl */ `
          uniform float uInner;
          uniform float uOuter;
          varying float vBand;
          varying float vRise;
          void main() {
            vBand = (length(position.xy) - uInner) / (uOuter - uInner);
            vRise = position.y / uOuter;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={/* glsl */ `
          uniform float uAlpha;
          varying float vBand;
          varying float vRise;
          vec3 spectrum(float t) {
            vec3 violet = vec3(0.56, 0.33, 0.92);
            vec3 blue = vec3(0.24, 0.5, 1.0);
            vec3 green = vec3(0.26, 0.86, 0.42);
            vec3 yellow = vec3(1.0, 0.9, 0.3);
            vec3 red = vec3(0.98, 0.3, 0.22);
            vec3 c = mix(violet, blue, smoothstep(0.1, 0.3, t));
            c = mix(c, green, smoothstep(0.3, 0.5, t));
            c = mix(c, yellow, smoothstep(0.5, 0.68, t));
            return mix(c, red, smoothstep(0.68, 0.88, t));
          }
          void main() {
            float soft = smoothstep(0.0, 0.12, vBand) * smoothstep(1.0, 0.88, vBand) * smoothstep(0.02, 0.5, vRise);
            gl_FragColor = vec4(spectrum(vBand), soft * uAlpha);
            #include <colorspace_fragment>
          }
        `}
      />
    </mesh>
  );
}

export function Atmosphere() {
  return (
    <>
      <Rain />
      <Shower />
      <Rainbow />
    </>
  );
}
