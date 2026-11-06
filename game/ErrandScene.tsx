"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { AdditiveBlending, BufferGeometry, CylinderGeometry, DoubleSide, Float32BufferAttribute, Group, InstancedMesh, Mesh, Object3D, Points, Quaternion, Shape, ShapeGeometry, Vector3 } from "three";
import { errands } from "./errands";
import { flight } from "./flight";
import { parcelGeometry } from "./Villagers";
import { glowTexture } from "./shared";

const dummy = new Object3D();
const up = new Vector3(0, 1, 0);
const span = new Vector3();
const hangAt = new Vector3();
const toTarget = new Vector3();
const quat = new Quaternion();

const BEACONS = 5;

function Beacons() {
  const ref = useRef<InstancedMesh>(null!);
  const geometry = useMemo(() => new CylinderGeometry(1, 1, 1, 20, 1, true).translate(0, 0.5, 0), []);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    let i = 0;
    const put = (x: number, y: number, z: number, width: number) => {
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(width * (1 + Math.sin(t * 1.6 + i) * 0.1), 260, width * (1 + Math.sin(t * 1.6 + i) * 0.1));
      dummy.updateMatrix();
      ref.current.setMatrixAt(i++, dummy.matrix);
    };
    const parcel = errands.carrying;
    if (parcel) put(parcel.to.x, parcel.to.y, parcel.to.z, 13);
    else for (const offer of errands.offers) put(offer.giver.x, offer.giver.y, offer.giver.z, 7);
    ref.current.count = i;
    ref.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[geometry, undefined, BEACONS]} frustumCulled={false} renderOrder={15}>
      <shaderMaterial
        transparent
        depthWrite={false}
        side={DoubleSide}
        blending={AdditiveBlending}
        vertexShader={/* glsl */ `
          varying float vUp;
          varying float vDist;
          varying float vFace;
          void main() {
            vUp = uv.y;
            vec4 view = viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
            vDist = -view.z;
            vec3 n = normalize(mat3(viewMatrix) * mat3(modelMatrix) * mat3(instanceMatrix) * normal);
            vFace = abs(dot(n, normalize(-view.xyz)));
            gl_Position = projectionMatrix * view;
          }
        `}
        fragmentShader={/* glsl */ `
          varying float vUp;
          varying float vDist;
          varying float vFace;
          void main() {
            // Soft at its edges, fading as it rises, and gone by the time you arrive.
            float a = pow(1.0 - vUp, 2.2) * smoothstep(50.0, 320.0, vDist) * vFace * vFace;
            gl_FragColor = vec4(1.0, 0.72, 0.3, a * 0.5);
          }
        `}
      />
    </instancedMesh>
  );
}

function WaitingParcels() {
  const ref = useRef<InstancedMesh>(null!);
  const geometry = useMemo(() => parcelGeometry(), []);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    let i = 0;
    for (const offer of errands.offers) {
      dummy.position.set(offer.giver.x, offer.giver.y + 3.5 + Math.sin(t * 1.8 + i) * 0.14, offer.giver.z);
      dummy.rotation.set(0, t * 0.5 + i, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      ref.current.setMatrixAt(i++, dummy.matrix);
    }
    ref.current.count = i;
    ref.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[geometry, undefined, BEACONS]} frustumCulled={false}>
      <meshStandardMaterial vertexColors flatShading roughness={0.9} emissive="#6b4a20" emissiveIntensity={0.35} />
    </instancedMesh>
  );
}

function CarriedParcel() {
  const group = useRef<Group>(null!);
  const rope = useRef<Mesh>(null!);
  const parcel = useMemo(() => parcelGeometry(), []);
  const rod = useMemo(() => new CylinderGeometry(0.035, 0.035, 1, 6).translate(0, 0.5, 0), []);
  const pos = useRef(new Vector3());
  useFrame((_, delta) => {
    const carrying = !!errands.carrying;
    group.current.visible = carrying;
    rope.current.visible = carrying;
    if (!carrying) {
      pos.current.copy(flight.pos);
      return;
    }
    // It trails below you on a short rope, swinging behind as you pick up speed.
    hangAt.copy(flight.pos).addScaledVector(flight.dir, -Math.min(2.4, Math.abs(flight.speed) * 0.03));
    hangAt.y -= 3.1;
    pos.current.lerp(hangAt, 1 - Math.exp(-7 * Math.min(delta, 0.05)));
    group.current.position.copy(pos.current);
    span.copy(flight.pos).sub(pos.current);
    const length = span.length();
    rope.current.position.copy(pos.current);
    rope.current.quaternion.copy(quat.setFromUnitVectors(up, span.normalize()));
    rope.current.scale.set(1, length, 1);
  });
  return (
    <>
      <group ref={group} visible={false}>
        <mesh geometry={parcel} castShadow>
          <meshStandardMaterial vertexColors flatShading roughness={0.9} />
        </mesh>
      </group>
      <mesh ref={rope} geometry={rod} visible={false}>
        <meshStandardMaterial color="#6d5a3f" roughness={1} />
      </mesh>
    </>
  );
}

function GuideBird() {
  const group = useRef<Group>(null!);
  const left = useRef<Mesh>(null!);
  const right = useRef<Mesh>(null!);
  const glow = useMemo(() => glowTexture(), []);
  const wing = useMemo(() => {
    const s = new Shape();
    s.moveTo(0, -0.34);
    s.bezierCurveTo(0.9, -0.5, 1.9, -0.22, 2.5, 0.25);
    s.bezierCurveTo(1.6, 0.15, 0.8, 0.28, 0, 0.42);
    s.closePath();
    return new ShapeGeometry(s, 16).rotateX(Math.PI / 2);
  }, []);
  const place = useRef(new Vector3());
  useFrame((state, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    const to = errands.carrying?.to;
    group.current.visible = !!to;
    if (!to) {
      place.current.copy(flight.pos);
      return;
    }
    const t = state.clock.elapsedTime;
    toTarget.set(to.x - flight.pos.x, 0, to.z - flight.pos.z);
    const far = toTarget.length();
    toTarget.normalize();
    // It keeps ahead of you, higher than the hills, and circles the door when you're close.
    const lead = Math.min(far, 38);
    hangAt.copy(flight.pos).addScaledVector(toTarget, lead);
    const home = 1 - Math.min(1, far / 300);
    hangAt.y = flight.pos.y + 5 + (to.y + 12 - flight.pos.y - 5) * home * home;
    if (far < 45) {
      hangAt.set(to.x + Math.cos(t * 1.4) * 9, to.y + 11, to.z + Math.sin(t * 1.4) * 9);
    }
    hangAt.y += Math.sin(t * 2.2) * 0.7;
    const before = span.copy(place.current);
    place.current.lerp(hangAt, 1 - Math.exp(-3.5 * delta));
    group.current.position.copy(place.current);
    const dx = place.current.x - before.x;
    const dz = place.current.z - before.z;
    if (dx * dx + dz * dz > 1e-5) group.current.rotation.y = Math.atan2(-dx, -dz);
    const beat = Math.sin(t * 11) * 0.65;
    right.current.rotation.z = beat;
    left.current.rotation.z = -beat;
  });
  return (
    <group ref={group} visible={false}>
      <mesh ref={right} geometry={wing}>
        <meshBasicMaterial color="#ffc861" side={DoubleSide} toneMapped={false} />
      </mesh>
      <group scale={[-1, 1, 1]}>
        <mesh ref={left} geometry={wing} rotation={[0, 0, 0]}>
          <meshBasicMaterial color="#ffc861" side={DoubleSide} toneMapped={false} />
        </mesh>
      </group>
      <sprite scale={[9, 9, 1]}>
        <spriteMaterial map={glow} color="#ffd27a" transparent opacity={0.75} depthWrite={false} blending={AdditiveBlending} />
      </sprite>
    </group>
  );
}

const PETALS = 140;
const petals = Array.from({ length: PETALS }, () => ({ pos: new Vector3(0, -500, 0), vel: new Vector3(), life: 0 }));
let nextPetal = 0;

function Petals() {
  const ref = useRef<Points>(null!);
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(new Float32Array(PETALS * 3), 3));
    return g;
  }, []);
  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    const burst = errands.burst;
    if (burst) {
      errands.burst = null;
      for (let i = 0; i < 90; i++) {
        const p = petals[nextPetal++ % PETALS];
        const a = Math.random() * 6.28;
        const s = 3 + Math.random() * 9;
        p.pos.set(burst.x, burst.y, burst.z);
        p.vel.set(Math.cos(a) * s, 8 + Math.random() * 12, Math.sin(a) * s);
        p.life = 2.5 + Math.random() * 2;
      }
    }
    const attr = ref.current.geometry.attributes.position;
    petals.forEach((p, i) => {
      if (p.life > 0) {
        p.life -= delta;
        p.vel.multiplyScalar(Math.exp(-1.5 * delta));
        p.vel.y -= 3 * delta;
        p.pos.addScaledVector(p.vel, delta);
      } else {
        p.pos.y = -500;
      }
      attr.setXYZ(i, p.pos.x, p.pos.y, p.pos.z);
    });
    attr.needsUpdate = true;
  });
  return (
    <points ref={ref} geometry={geometry} frustumCulled={false}>
      <pointsMaterial color="#f7a7b8" size={0.75} sizeAttenuation />
    </points>
  );
}

const LANTERNS = 128;

function Lanterns() {
  const ref = useRef<Points>(null!);
  const glow = useMemo(() => glowTexture(), []);
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(new Float32Array(LANTERNS * 3), 3));
    g.setDrawRange(0, 0);
    return g;
  }, []);
  const shown = useRef(0);
  useFrame(() => {
    if (errands.lantern.length === shown.current) return;
    const attr = ref.current.geometry.attributes.position;
    while (shown.current < errands.lantern.length && shown.current < LANTERNS) {
      const l = errands.lantern[shown.current];
      attr.setXYZ(shown.current++, l.x, l.y, l.z);
    }
    attr.needsUpdate = true;
    ref.current.geometry.setDrawRange(0, shown.current);
  });
  return (
    <points ref={ref} geometry={geometry} frustumCulled={false} renderOrder={14}>
      <pointsMaterial map={glow} color="#ffcf7d" size={5} sizeAttenuation transparent depthWrite={false} blending={AdditiveBlending} />
    </points>
  );
}

export function Errands() {
  return (
    <>
      <Beacons />
      <WaitingParcels />
      <CarriedParcel />
      <GuideBird />
      <Petals />
      <Lanterns />
    </>
  );
}
