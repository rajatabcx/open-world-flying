"use client";

import { Clone, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import { Box3, BufferGeometry, DoubleSide, Float32BufferAttribute, Group, InstancedBufferAttribute, InstancedBufferGeometry, InstancedMesh, LineSegments, Object3D, PlaneGeometry, Points, Quaternion, TorusGeometry, Vector3, AdditiveBlending } from "three";
import { crashEvents, flight, CRUISE } from "./flight";
import { FOG_GLSL, shared } from "./shared";
import { PLACES, rng, SUMMIT } from "./terrain";
import { BALLOONS, SUN, WIND } from "./world";

useGLTF.preload("/models/balloon-a.glb");
useGLTF.preload("/models/balloon-b.glb");

function fitted(scene: Object3D) {
  const box = new Box3().setFromObject(scene);
  const size = box.getSize(new Vector3());
  const centre = box.getCenter(new Vector3());
  return { height: size.y, centre };
}

export function Balloons() {
  const a = useGLTF("/models/balloon-a.glb");
  const b = useGLTF("/models/balloon-b.glb");
  const fits = useMemo(() => [fitted(a.scene), fitted(b.scene)], [a.scene, b.scene]);
  const refs = useRef<(Group | null)[]>([]);

  useFrame(() => {
    BALLOONS.forEach((balloon, i) => {
      const group = refs.current[i];
      if (!group) return;
      group.position.copy(balloon.pos);
      const s = balloon.squash * 0.28;
      group.scale.set(1 + s * 0.7, 1 - s, 1 + s * 0.7);
    });
  });

  return (
    <>
      {BALLOONS.map((balloon, i) => {
        const fit = fits[balloon.variant];
        const scale = balloon.height / fit.height;
        return (
          <group key={i} ref={(g) => { refs.current[i] = g; }}>
            {/* The envelope sits above the model's centre, so the collider lines up with it. */}
            <group scale={scale} position={[-fit.centre.x * scale, -(fit.centre.y * scale) - balloon.height * 0.17, -fit.centre.z * scale]}>
              <Clone object={balloon.variant === 0 ? a.scene : b.scene} castShadow />
            </group>
          </group>
        );
      })}
    </>
  );
}

function cloudGeometry() {
  const r = rng(555);
  const offsets: number[] = [];
  const sizes: number[] = [];
  const seeds: number[] = [];
  const clouds = (x: number, y: number, z: number, scale: number) => {
    const puffs = 16 + Math.floor(r() * 10);
    for (let i = 0; i < puffs; i++) {
      const a = r() * 6.28;
      const d = r() * 90 * scale;
      offsets.push(x + Math.cos(a) * d, y + (r() - 0.25) * 22 * scale, z + Math.sin(a) * d * 0.7);
      sizes.push((34 + r() * 56) * scale);
      seeds.push(r());
    }
  };
  for (let i = 0; i < 95; i++) {
    const a = r() * 6.28;
    const d = Math.sqrt(r()) * 2500;
    clouds(Math.cos(a) * d, 300 + r() * 340, Math.sin(a) * d, 0.7 + r() * 0.9);
  }
  // A ring of low clouds wraps the summit, so the top rises out of them.
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * 6.28;
    clouds(SUMMIT.x + Math.cos(a) * 280, SUMMIT.h * 0.72, SUMMIT.z + Math.sin(a) * 280, 0.8);
  }
  const plane = new PlaneGeometry(1, 1);
  const g = new InstancedBufferGeometry();
  g.index = plane.index;
  g.setAttribute("position", plane.attributes.position);
  g.setAttribute("uv", plane.attributes.uv);
  g.setAttribute("aOffset", new InstancedBufferAttribute(new Float32Array(offsets), 3));
  g.setAttribute("aSize", new InstancedBufferAttribute(new Float32Array(sizes), 1));
  g.setAttribute("aSeed", new InstancedBufferAttribute(new Float32Array(seeds), 1));
  g.instanceCount = sizes.length;
  return g;
}

export function Clouds() {
  const geometry = useMemo(() => cloudGeometry(), []);
  const uniforms = useMemo(() => ({ ...shared, uSun: { value: SUN } }), []);
  return (
    <mesh geometry={geometry} frustumCulled={false} renderOrder={20}>
      <shaderMaterial
        transparent
        depthWrite={false}
        uniforms={uniforms}
        vertexShader={/* glsl */ `
          attribute vec3 aOffset;
          attribute float aSize;
          attribute float aSeed;
          uniform float uTime;
          varying vec2 vUv;
          varying float vSeed;
          varying float vDist;
          void main() {
            vUv = uv;
            vSeed = aSeed;
            vec3 world = aOffset + vec3(uTime * 0.8, sin(uTime * 0.05 + aSeed * 6.0) * 3.0, 0.0);
            vec4 view = viewMatrix * vec4(world, 1.0);
            vDist = length(view.xyz);
            float a = aSeed * 6.28;
            vec2 p = mat2(cos(a), -sin(a), sin(a), cos(a)) * position.xy;
            view.xy += p * aSize;
            gl_Position = projectionMatrix * view;
          }
        `}
        fragmentShader={/* glsl */ `
          varying vec2 vUv;
          varying float vSeed;
          varying float vDist;
          ${FOG_GLSL}
          float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float noise(vec2 p) {
            vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
          }
          void main() {
            vec2 p = vUv - 0.5;
            float d = length(p) * 2.0;
            vec2 q = vUv * 3.0 + vSeed * 40.0;
            float n = noise(q) * 0.6 + noise(q * 2.3) * 0.3 + noise(q * 5.1) * 0.1;
            float alpha = smoothstep(1.0, 0.45, d + (n - 0.5) * 0.75);
            // Fade puffs right around the camera, so flying through stays clear.
            alpha *= smoothstep(25.0, 150.0, vDist) * 0.8;
            if (alpha < 0.004) discard;
            vec3 col = mix(vec3(0.80, 0.83, 0.88), vec3(1.0, 0.985, 0.95), smoothstep(-0.45, 0.3, p.y + vSeed * 0.25));
            gl_FragColor = vec4(applyFog(col, vDist), alpha);
            #include <colorspace_fragment>
          }
        `}
      />
    </mesh>
  );
}

const POINTS_PER_PATH = 70;

export function Wind() {
  const pointsRef = useRef<Points>(null!);
  const seeds = useMemo(() => {
    const r = rng(1234);
    return WIND.flatMap(() =>
      Array.from({ length: POINTS_PER_PATH }, () => ({ t: r(), speed: 0.05 + r() * 0.05, a: r() * 6.28, d: 0.15 + r() * 0.85 })),
    );
  }, []);
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(new Float32Array(seeds.length * 3), 3));
    return g;
  }, [seeds]);

  const rings = useMemo(() => {
    const out: { pos: Vector3; quat: Quaternion; radius: number }[] = [];
    const z = new Vector3(0, 0, 1);
    for (const path of WIND) {
      const step = path.kind === "tunnel" ? 9 : 14;
      for (let i = 2; i < path.samples.length; i += step) {
        out.push({ pos: path.samples[i], quat: new Quaternion().setFromUnitVectors(z, path.tangents[i]), radius: path.radius });
      }
    }
    return out;
  }, []);
  const ringGeo = useMemo(() => new TorusGeometry(1, 0.016, 6, 40), []);
  const ringsRef = useRef<InstancedMesh>(null!);

  useLayoutEffect(() => {
    const dummy = new Object3D();
    rings.forEach((ring, i) => {
      dummy.position.copy(ring.pos);
      dummy.quaternion.copy(ring.quat);
      dummy.scale.setScalar(ring.radius);
      dummy.updateMatrix();
      ringsRef.current.setMatrixAt(i, dummy.matrix);
    });
    ringsRef.current.instanceMatrix.needsUpdate = true;
  }, [rings]);

  useFrame((state) => {
    const time = state.clock.elapsedTime;
    const attr = pointsRef.current.geometry.attributes.position;
    let index = 0;
    for (const path of WIND) {
      const last = path.samples.length - 1;
      for (let i = 0; i < POINTS_PER_PATH; i++, index++) {
        const s = seeds[index];
        const t = ((s.t + time * s.speed) % 1) * last;
        const at = Math.floor(t);
        const a = path.samples[at];
        const b = path.samples[Math.min(last, at + 1)];
        const f = t - at;
        const angle = s.a + time * (path.kind === "updraft" ? 1.2 : 0.5);
        const radius = path.radius * s.d;
        attr.setXYZ(index, a.x + (b.x - a.x) * f + Math.cos(angle) * radius, a.y + (b.y - a.y) * f + Math.sin(angle) * radius * (path.kind === "updraft" ? 0 : 1), a.z + (b.z - a.z) * f + Math.sin(angle) * radius * (path.kind === "updraft" ? 1 : 0));
      }
    }
    attr.needsUpdate = true;
  });

  return (
    <>
      <points ref={pointsRef} geometry={geometry} frustumCulled={false} renderOrder={15}>
        <shaderMaterial
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
          uniforms={shared}
          vertexShader={/* glsl */ `
            varying float vDist;
            void main() {
              vec4 view = modelViewMatrix * vec4(position, 1.0);
              vDist = -view.z;
              gl_PointSize = clamp(2600.0 / vDist, 2.0, 26.0);
              gl_Position = projectionMatrix * view;
            }
          `}
          fragmentShader={/* glsl */ `
            varying float vDist;
            void main() {
              float d = length(gl_PointCoord - 0.5) * 2.0;
              float a = smoothstep(1.0, 0.0, d);
              gl_FragColor = vec4(vec3(1.0, 0.98, 0.9), a * a * 0.55 * smoothstep(1500.0, 300.0, vDist));
            }
          `}
        />
      </points>
      <instancedMesh ref={ringsRef} args={[ringGeo, undefined, rings.length]} frustumCulled={false} renderOrder={14}>
        <meshBasicMaterial color="#fffbe8" transparent opacity={0.3} depthWrite={false} side={DoubleSide} />
      </instancedMesh>
    </>
  );
}

const STREAKS = 70;
const streakRandom = rng(99);
const streakPoints = Array.from({ length: STREAKS }, () => new Vector3((streakRandom() - 0.5) * 70, (streakRandom() - 0.5) * 50, (streakRandom() - 0.5) * 90));
const velocity = new Vector3();

/** Fine lines rushing past the camera, stronger the faster you go. */
export function Streaks() {
  const ref = useRef<LineSegments>(null!);
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(new Float32Array(STREAKS * 6), 3));
    return g;
  }, []);

  useFrame((_, delta) => {
    const line = ref.current;
    const attr = line.geometry.attributes.position;
    velocity.copy(flight.dir).multiplyScalar(flight.speed).add(flight.impulse);
    const speed = velocity.length();
    const strength = Math.max(0, Math.min(1, (speed - CRUISE * 1.05) / 55));
    (line.material as { opacity: number }).opacity = strength * 0.5 + flight.wind * 0.25;
    line.visible = flight.flying && strength + flight.wind > 0.02;
    for (let i = 0; i < STREAKS; i++) {
      const p = streakPoints[i];
      p.addScaledVector(velocity, -delta * 0.6);
      // Wrap into a box around the player.
      p.x = ((p.x + 35) % 70 + 70) % 70 - 35;
      p.y = ((p.y + 25) % 50 + 50) % 50 - 25;
      p.z = ((p.z + 45) % 90 + 90) % 90 - 45;
      const x = flight.pos.x + p.x;
      const y = flight.pos.y + p.y;
      const z = flight.pos.z + p.z;
      const len = 0.05 + strength * 0.06;
      attr.setXYZ(i * 2, x, y, z);
      attr.setXYZ(i * 2 + 1, x - velocity.x * len, y - velocity.y * len, z - velocity.z * len);
    }
    attr.needsUpdate = true;
  });

  return (
    <lineSegments ref={ref} geometry={geometry} frustumCulled={false} renderOrder={16}>
      <lineBasicMaterial color="#ffffff" transparent opacity={0} depthWrite={false} />
    </lineSegments>
  );
}

const FLOCKS = [
  { x: PLACES.shore.x, y: 70, z: PLACES.shore.z, r: 120 },
  { x: SUMMIT.x + 180, y: SUMMIT.h - 30, z: SUMMIT.z + 120, r: 170 },
  { x: -420, y: 150, z: 620, r: 130 },
  { x: 720, y: 280, z: 90, r: 190 },
  { x: -800, y: 300, z: -500, r: 160 },
];
const PER_FLOCK = 11;
const birdDummy = new Object3D();

function birdGeometry() {
  // Two triangles and a tail. The shader flaps the outer points.
  const b = new BufferGeometry();
  const p = [0, 0, -0.9, 3.2, 0, 0.3, 0, 0, 0.8, 0, 0, -0.9, 0, 0, 0.8, -3.2, 0, 0.3];
  b.setAttribute("position", new Float32BufferAttribute(p, 3));
  b.computeVertexNormals();
  return b;
}

export function Birds() {
  const ref = useRef<InstancedMesh>(null!);
  const geometry = useMemo(() => birdGeometry(), []);
  const birds = useMemo(() => {
    const r = rng(2024);
    return FLOCKS.flatMap((flock, f) =>
      Array.from({ length: PER_FLOCK }, () => ({ f, a: r() * 0.9, off: new Vector3((r() - 0.5) * 22, (r() - 0.5) * 14, (r() - 0.5) * 22), speed: 0.17 + r() * 0.015 })),
    );
  }, []);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    birds.forEach((bird, i) => {
      const flock = FLOCKS[bird.f];
      const a = t * bird.speed + bird.a + bird.f * 1.3;
      birdDummy.position.set(flock.x + Math.cos(a) * flock.r + bird.off.x, flock.y + Math.sin(a * 1.7) * 12 + bird.off.y, flock.z + Math.sin(a) * flock.r + bird.off.z);
      birdDummy.rotation.set(0, -a + Math.PI, 0);
      birdDummy.updateMatrix();
      ref.current.setMatrixAt(i, birdDummy.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[geometry, undefined, birds.length]} frustumCulled={false}>
      <shaderMaterial
        side={DoubleSide}
        uniforms={shared}
        vertexShader={/* glsl */ `
          uniform float uTime;
          varying float vDist;
          void main() {
            vec3 p = position;
            float seed = instanceMatrix[3][0] * 0.13;
            p.y += abs(p.x) * sin(uTime * 7.0 + seed) * 0.42;
            vec4 view = viewMatrix * modelMatrix * instanceMatrix * vec4(p, 1.0);
            vDist = -view.z;
            gl_Position = projectionMatrix * view;
          }
        `}
        fragmentShader={/* glsl */ `
          varying float vDist;
          ${FOG_GLSL}
          void main() {
            gl_FragColor = vec4(applyFog(vec3(0.97, 0.96, 0.92), vDist), 1.0);
            #include <colorspace_fragment>
          }
        `}
      />
    </instancedMesh>
  );
}

const LEAVES = 150;
const leafRandom = rng(31);
const leaves = Array.from({ length: LEAVES }, () => ({ pos: new Vector3(0, -500, 0), vel: new Vector3(), life: 0 }));
let nextLeaf = 0;

/** A burst of leaves when you bump a tree. */
export function Leaves() {
  const ref = useRef<Points>(null!);
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(new Float32Array(LEAVES * 3), 3));
    return g;
  }, []);
  useFrame((_, delta) => {
    for (const event of crashEvents) {
      for (let i = 0; i < 34; i++) {
        const leaf = leaves[nextLeaf++ % LEAVES];
        leaf.pos.set(event.x + (leafRandom() - 0.5) * 3, event.y + (leafRandom() - 0.5) * 3, event.z + (leafRandom() - 0.5) * 3);
        leaf.vel.set((leafRandom() - 0.5) * 22, leafRandom() * 12, (leafRandom() - 0.5) * 22);
        leaf.life = 1.6 + leafRandom() * 1.2;
      }
    }
    crashEvents.length = 0;
    const attr = ref.current.geometry.attributes.position;
    leaves.forEach((leaf, i) => {
      if (leaf.life > 0) {
        leaf.life -= delta;
        leaf.vel.multiplyScalar(Math.exp(-1.6 * delta));
        leaf.vel.y -= 5 * delta;
        leaf.pos.addScaledVector(leaf.vel, delta);
      } else {
        leaf.pos.y = -500;
      }
      attr.setXYZ(i, leaf.pos.x, leaf.pos.y, leaf.pos.z);
    });
    attr.needsUpdate = true;
  });
  return (
    <points ref={ref} geometry={geometry} frustumCulled={false}>
      <pointsMaterial color="#6f9a45" size={0.55} sizeAttenuation />
    </points>
  );
}
