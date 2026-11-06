"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { BufferGeometry, DoubleSide, Float32BufferAttribute, InstancedBufferAttribute, InstancedMesh, Object3D, Points, RingGeometry, Vector3 } from "three";
import { flight } from "./flight";
import { bindUniforms, glowTexture, shared } from "./shared";
import { riverSurface } from "./terrain";

const DROPS = 420;
const RINGS = 26;

const drops = Array.from({ length: DROPS }, () => ({ pos: new Vector3(0, -500, 0), vel: new Vector3(), life: 0 }));
const rings = Array.from({ length: RINGS }, () => ({ x: 0, y: -500, z: 0, age: 1, size: 1 }));
let nextDrop = 0;
let nextRing = 0;
let dropTimer = 0;
let ringTimer = 0;
const dummy = new Object3D();

function spray(x: number, y: number, z: number, speed: number) {
  const d = drops[nextDrop++ % DROPS];
  d.pos.set(x, y, z);
  const fling = 2 + Math.random() * 5 + speed * 0.05;
  d.vel.set(-flight.dir.x * speed * 0.35 + (Math.random() - 0.5) * fling, 3 + Math.random() * (5 + speed * 0.1), -flight.dir.z * speed * 0.35 + (Math.random() - 0.5) * fling);
  d.life = 0.5 + Math.random() * 0.6;
}

export function SeaSkim() {
  const pointsRef = useRef<Points>(null!);
  const glow = useMemo(() => glowTexture(), []);
  const ringsRef = useRef<InstancedMesh>(null!);
  const pointGeometry = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(new Float32Array(DROPS * 3), 3));
    return g;
  }, []);
  const ringGeometry = useMemo(() => {
    const g = new RingGeometry(0.86, 1, 40, 1).rotateX(-Math.PI / 2);
    g.setAttribute("aAge", new InstancedBufferAttribute(new Float32Array(RINGS).fill(1), 1));
    return g;
  }, []);
  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    const speed = Math.abs(flight.speed);
    if (flight.flying && flight.skimming > 0.4) {
      const surface = riverSurface(flight.pos.x, flight.pos.z) ?? 0;
      const sx = Math.cos(flight.yaw);
      const sz = -Math.sin(flight.yaw);
      dropTimer -= delta;
      while (dropTimer <= 0) {
        dropTimer += 0.012;
        const side = Math.random() < 0.5 ? -1 : 1;
        const reach = 2 + Math.random() * 3.5;
        spray(flight.pos.x + sx * side * reach, surface + 0.3, flight.pos.z + sz * side * reach, speed);
      }
      ringTimer -= delta;
      if (ringTimer <= 0) {
        ringTimer = 0.16;
        for (const side of [-1, 1]) {
          const ring = rings[nextRing++ % RINGS];
          ring.x = flight.pos.x + sx * side * 3.6;
          ring.y = surface + 0.12;
          ring.z = flight.pos.z + sz * side * 3.6;
          ring.age = 0;
          ring.size = 7 + Math.min(10, speed * 0.1);
        }
      }
    }
    const positions = pointsRef.current.geometry.attributes.position;
    drops.forEach((d, i) => {
      if (d.life > 0) {
        d.life -= delta;
        d.vel.y -= 16 * delta;
        d.vel.multiplyScalar(Math.exp(-0.8 * delta));
        d.pos.addScaledVector(d.vel, delta);
      } else {
        d.pos.y = -500;
      }
      positions.setXYZ(i, d.pos.x, d.pos.y, d.pos.z);
    });
    positions.needsUpdate = true;

    const ages = ringsRef.current.geometry.attributes.aAge as InstancedBufferAttribute;
    rings.forEach((ring, i) => {
      ring.age = Math.min(1, ring.age + delta / 1.7);
      dummy.position.set(ring.x, ring.y, ring.z);
      dummy.scale.setScalar(ring.age >= 1 ? 0.001 : 1 + ring.age * ring.size);
      dummy.updateMatrix();
      ringsRef.current.setMatrixAt(i, dummy.matrix);
      ages.setX(i, ring.age);
    });
    ringsRef.current.instanceMatrix.needsUpdate = true;
    ages.needsUpdate = true;
  });
  return (
    <>
      <points ref={pointsRef} geometry={pointGeometry} frustumCulled={false} renderOrder={8}>
        <pointsMaterial map={glow} color="#f4fbfb" size={0.85} sizeAttenuation transparent opacity={0.95} depthWrite={false} />
      </points>
      <instancedMesh ref={ringsRef} args={[ringGeometry, undefined, RINGS]} frustumCulled={false} renderOrder={7}>
        <shaderMaterial
          transparent
          depthWrite={false}
          side={DoubleSide}
          uniforms={shared}
        ref={bindUniforms(shared)}
          vertexShader={/* glsl */ `
            attribute float aAge;
            varying float vAge;
            void main() {
              vAge = aAge;
              gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
            }
          `}
          fragmentShader={/* glsl */ `
            uniform vec3 uAmbient;
            uniform vec3 uKey;
            varying float vAge;
            void main() {
              gl_FragColor = vec4((uAmbient + uKey * 0.5) * 1.05, (1.0 - vAge) * (1.0 - vAge) * 0.55);
              #include <colorspace_fragment>
            }
          `}
        />
      </instancedMesh>
    </>
  );
}
