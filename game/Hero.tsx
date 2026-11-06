"use client";

import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { AdditiveBlending, Bone, Box3, BufferGeometry, Color, CylinderGeometry, DirectionalLight, DoubleSide, Euler, Float32BufferAttribute, Group, Mesh, MeshDepthMaterial, MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, RGBADepthPacking, ShaderMaterial, Vector3 } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { BOOST, CRUISE, flight, stepFlight, type FlightMode } from "./flight";
import { stepErrands } from "./errands";
import { attachInput } from "./input";
import { shared } from "./shared";
import { heightAt } from "./terrain";
import { SUN } from "./world";

useGLTF.preload("/models/character.glb");

const HERO_HEIGHT = 3;

const SPAN = 3.3;
const SECTIONS = 12;
const ACROSS = 4;
const tintA = new Color();
const tintB = new Color();

/** A rounded, gently curved feather, fine enough to bend smoothly with the wing. */
function feather(length: number, width: number, root: string, tip: string, x: number, y: number, z: number, fan: number) {
  const positions: number[] = [];
  const colors: number[] = [];
  const index: number[] = [];
  tintA.set(root);
  tintB.set(tip);
  for (let i = 0; i <= SECTIONS; i++) {
    const t = i / SECTIONS;
    // Narrow where it joins the wing, full through the middle, round at the tip.
    const half = (width / 2) * Math.min(1, 0.55 + t * 1.6) * Math.sqrt(Math.max(0, 1 - Math.pow(Math.max(0, t - 0.55) / 0.45, 2)));
    for (let j = 0; j <= ACROSS; j++) {
      const u = (j / ACROSS) * 2 - 1;
      positions.push(u * half, -t * t * length * 0.09 - u * u * width * 0.07, t * length);
      const blend = t * t;
      colors.push(tintA.r + (tintB.r - tintA.r) * blend, tintA.g + (tintB.g - tintA.g) * blend, tintA.b + (tintB.b - tintA.b) * blend);
    }
  }
  const row = ACROSS + 1;
  for (let i = 0; i < SECTIONS; i++) {
    for (let j = 0; j < ACROSS; j++) {
      const a = i * row + j;
      index.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(positions, 3));
  g.setAttribute("color", new Float32BufferAttribute(colors, 3));
  g.setIndex(index);
  g.rotateY(fan);
  g.translate(x, y, z);
  g.computeVertexNormals();
  return g;
}

function buildWing() {
  const parts: BufferGeometry[] = [];
  // Long flight feathers, fanning outward toward the tip.
  for (let i = 0; i < 18; i++) {
    const t = i / 17;
    parts.push(feather(2.15 + t * 0.65, 0.4 - t * 0.08, "#fff1da", "#e8683f", SPAN * (0.52 + t * 0.48), -0.03, -0.02 * t, 0.05 + t * t * 0.95));
  }
  // Inner feathers, closer to the body.
  for (let i = 0; i < 16; i++) {
    const t = i / 15;
    parts.push(feather(1.75 + t * 0.45, 0.36, "#fff7e6", "#f6b47a", 0.08 + t * SPAN * 0.5, -0.03, 0, 0.05 * t));
  }
  // Two overlapping rows of shorter feathers, which hide the roots of the long ones.
  for (let i = 0; i < 30; i++) {
    const t = i / 29;
    parts.push(feather(1.1 + t * 0.2, 0.3, "#fffdf6", "#fbd9a8", 0.05 + t * SPAN, 0.05, -0.02, t * t * 0.8));
  }
  for (let i = 0; i < 34; i++) {
    const t = i / 33;
    parts.push(feather(0.6, 0.22, "#fffef9", "#fff0d8", 0.03 + t * SPAN, 0.1, -0.05, t * t * 0.6));
  }
  // A rounded leading edge, with enough rings to curve as the wing bends.
  const edge = new CylinderGeometry(0.03, 0.09, SPAN, 12, 28).rotateZ(-Math.PI / 2).translate(SPAN / 2, 0.08, -0.06).scale(1, 0.8, 1);
  edge.deleteAttribute("uv");
  const count = edge.attributes.position.count;
  const colors = new Float32Array(count * 3);
  tintA.set("#f4dfbd");
  for (let i = 0; i < count; i++) colors.set([tintA.r, tintA.g, tintA.b], i * 3);
  edge.setAttribute("color", new Float32BufferAttribute(colors, 3));
  parts.push(edge);
  return mergeGeometries(parts)!;
}

// The whole wing bends as one curve, with the tip following a little behind the root.
const WING_BEND = /* glsl */ `
  uniform float uPhase;
  uniform float uAmp;
  uniform float uDroop;
  uniform float uFold;
  float wingS(float x) { return max(x, 0.0) / ${SPAN.toFixed(2)}; }
`;

const wingLag = 1.5;

function makeWingMaterial(uniforms: typeof rightBend) {
  const material = new MeshStandardMaterial({ vertexColors: true, side: DoubleSide, roughness: 0.75 });
  const depth = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
  const bend = /* glsl */ `
    #include <begin_vertex>
    {
      float s = wingS(position.x);
      float wave = sin(uPhase - s * ${wingLag.toFixed(1)});
      transformed.y += ${SPAN.toFixed(2)} * (uAmp * wave * pow(s, 1.5) + uDroop * s * s);
      transformed.y += position.z * uAmp * 0.3 * cos(uPhase - s * ${wingLag.toFixed(1)}) * s;
      float slopeNow = uAmp * wave * 1.5 * sqrt(s) + 2.0 * uDroop * s;
      transformed.x -= position.x * 0.5 * slopeNow * slopeNow * 0.5;
      transformed.x -= position.x * uFold * 0.22 * s;
      transformed.z += uFold * 0.75 * s * s;
    }
  `;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${WING_BEND}`)
      .replace(
        "#include <beginnormal_vertex>",
        /* glsl */ `
        #include <beginnormal_vertex>
        {
          float s = wingS(position.x);
          float slopeNow = uAmp * sin(uPhase - s * ${wingLag.toFixed(1)}) * 1.5 * sqrt(s) + 2.0 * uDroop * s;
          objectNormal = normalize(objectNormal + vec3(-slopeNow * objectNormal.y, 0.0, 0.0));
        }
      `,
      )
      .replace("#include <begin_vertex>", bend);
  };
  depth.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>\n${WING_BEND}`).replace("#include <begin_vertex>", bend);
  };
  return { material, depth };
}

const rightBend = { uPhase: { value: 0 }, uAmp: { value: 0 }, uDroop: { value: 0 }, uFold: { value: 0 } };
const leftBend = { uPhase: { value: 0 }, uAmp: { value: 0 }, uDroop: { value: 0 }, uFold: { value: 0 } };

function wingTip(target: Vector3, bendValues: typeof rightBend) {
  const x = SPAN + 1.9;
  const s = x / SPAN;
  const wave = Math.sin(bendValues.uPhase.value - s * wingLag);
  const fold = bendValues.uFold.value;
  return target.set(x * (1 - fold * 0.22 * s), SPAN * (bendValues.uAmp.value * wave * Math.pow(s, 1.5) + bendValues.uDroop.value * s * s), 1.5 + fold * 0.75 * s * s);
}

const TRAIL = 46;

function trailGeometry() {
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(new Float32Array(TRAIL * 6), 3));
  const fade = new Float32Array(TRAIL * 2);
  const index: number[] = [];
  for (let i = 0; i < TRAIL; i++) {
    fade[i * 2] = fade[i * 2 + 1] = 1 - i / (TRAIL - 1);
    if (i < TRAIL - 1) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  g.setAttribute("aFade", new Float32BufferAttribute(fade, 1));
  g.setIndex(index);
  return g;
}

const worldTip = new Vector3();
const sideways = new Vector3();

function Trail({ source, bend }: { source: React.RefObject<Group | null>; bend: typeof rightBend }) {
  const ref = useRef<Mesh>(null!);
  const geometry = useMemo(() => trailGeometry(), []);
  const uniforms = useMemo(() => ({ uStrength: { value: 0.3 } }), []);
  useFrame(() => {
    const group = source.current;
    if (!group) return;
    wingTip(worldTip, bend);
    group.localToWorld(worldTip);
    sideways.set(flight.dir.z, 0, -flight.dir.x).normalize().multiplyScalar(0.05);
    const attr = ref.current.geometry.attributes.position;
    const arr = attr.array as Float32Array;
    if (Math.hypot(arr[0] - worldTip.x, arr[1] - worldTip.y, arr[2] - worldTip.z) > 40) {
      // After a jump to a new start, don't draw a line across the island.
      for (let i = 0; i < arr.length; i += 3) {
        arr[i] = worldTip.x;
        arr[i + 1] = worldTip.y;
        arr[i + 2] = worldTip.z;
      }
    }
    arr.copyWithin(6, 0, arr.length - 6);
    arr[0] = worldTip.x - sideways.x;
    arr[1] = worldTip.y - sideways.y;
    arr[2] = worldTip.z - sideways.z;
    arr[3] = worldTip.x + sideways.x;
    arr[4] = worldTip.y + sideways.y;
    arr[5] = worldTip.z + sideways.z;
    attr.needsUpdate = true;
    const material = ref.current.material as ShaderMaterial;
    material.uniforms.uStrength.value = flight.flying ? (0.34 + flight.boost * 0.5 + flight.wind * 0.4 + (flight.mode === "dive" ? 0.45 : 0)) * (1 - flight.hover) : 0;
  });
  return (
    <mesh ref={ref} geometry={geometry} frustumCulled={false} renderOrder={12}>
      <shaderMaterial
        transparent
        depthWrite={false}
        side={DoubleSide}
        blending={AdditiveBlending}
        uniforms={uniforms}
        vertexShader={/* glsl */ `
          attribute float aFade;
          varying float vFade;
          void main() {
            vFade = aFade;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={/* glsl */ `
          uniform float uStrength;
          varying float vFade;
          void main() { gl_FragColor = vec4(1.0, 0.95, 0.82, vFade * vFade * uStrength); }
        `}
      />
    </mesh>
  );
}

function Scarf() {
  const geometry = useMemo(() => new PlaneGeometry(0.28, 3, 1, 12).translate(0, -1.5, 0).rotateX(-Math.PI / 2), []);
  return (
    <mesh geometry={geometry} position={[0, 0.34, -0.62]}>
      <shaderMaterial
        side={DoubleSide}
        uniforms={shared}
        vertexShader={/* glsl */ `
          uniform float uTime;
          varying float vT;
          void main() {
            vec3 p = position;
            float t = max(p.z, 0.0) / 3.0;
            vT = t;
            p.y += sin(p.z * 3.0 - uTime * 9.0) * 0.22 * t;
            p.x += sin(p.z * 2.1 - uTime * 6.0) * 0.16 * t;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          }
        `}
        fragmentShader={/* glsl */ `
          varying float vT;
          void main() {
            gl_FragColor = vec4(mix(vec3(0.72, 0.16, 0.14), vec3(0.95, 0.42, 0.20), vT), 1.0);
            #include <colorspace_fragment>
          }
        `}
      />
    </mesh>
  );
}

// What the wings do in each kind of flight. Glides hold still, flaps are slow and deep,
// a dive tucks back, and a hover is a hummingbird's quick shallow blur.
const WING_MODES: Record<FlightMode, { hz: number; amp: number; sweep: number; droop: number; figure8: number }> = {
  idle: { hz: 0.7, amp: 0.26, sweep: 0.1, droop: -0.03, figure8: 0 },
  glide: { hz: 0.16, amp: 0.035, sweep: 0.12, droop: 0.03, figure8: 0 },
  flap: { hz: 1.5, amp: 0.46, sweep: 0.1, droop: -0.03, figure8: 0 },
  climb: { hz: 2, amp: 0.55, sweep: 0.04, droop: -0.02, figure8: 0 },
  boost: { hz: 3.2, amp: 0.12, sweep: 0.55, droop: -0.07, figure8: 0 },
  dive: { hz: 0.2, amp: 0.012, sweep: 1.05, droop: -0.26, figure8: 0 },
  hover: { hz: 8.5, amp: 0.17, sweep: 0.05, droop: 0, figure8: 1 },
};
const wingNow = { hz: 0.7, amp: 0.26, sweep: 0.1, droop: -0.03, figure8: 0 };

const euler = new Euler(0, 0, 0, "YXZ");
const camOffset = new Vector3(0, 6, 16);
const wantOffset = new Vector3();
const lookTarget = new Vector3();
const lookNow = new Vector3();
const camPos = new Vector3();

export function Hero({ lightRef }: { lightRef: React.RefObject<DirectionalLight | null> }) {
  const { scene } = useGLTF("/models/character.glb");
  const root = useRef<Group>(null!);
  const body = useRef<Group>(null!);
  const rightWing = useRef<Group>(null!);
  const leftWing = useRef<Group>(null!);
  const flapPhase = useRef(0);
  const upright = useRef(0);
  const wing = useMemo(() => buildWing(), []);
  const right = useMemo(() => makeWingMaterial(rightBend), []);
  const left = useMemo(() => makeWingMaterial(leftBend), []);

  const fit = useMemo(() => {
    const box = new Box3().setFromObject(scene);
    const height = box.getSize(new Vector3()).y;
    return { scale: HERO_HEIGHT / height, base: box.min.y };
  }, [scene]);

  useEffect(() => attachInput(), []);

  useLayoutEffect(() => {
    scene.traverse((child) => {
      if ((child as Mesh).isMesh) {
        child.castShadow = true;
        child.frustumCulled = false;
        // This model's materials are metallic, which renders black without reflections.
        const material = (child as Mesh).material as MeshStandardMaterial;
        material.metalness = 0;
        material.roughness = 0.85;
      }
    });
    // The rest pose has arms out and legs straight, which already reads as flying.
    // The head tips back to look where it's going.
    const neck = scene.getObjectByName("Neck") as Bone | undefined;
    const head = scene.getObjectByName("Head") as Bone | undefined;
    if (neck) neck.rotateX(-0.45);
    if (head) head.rotateX(-0.45);
    return () => {
      if (neck) neck.rotateX(0.45);
      if (head) head.rotateX(0.45);
    };
  }, [scene]);

  const tick = (dt: number, time: number, camera: PerspectiveCamera) => {
    shared.uTime.value = time;
    stepFlight(dt, time);
    stepErrands(time);

    euler.set(flight.pitch, flight.yaw, flight.roll);
    root.current.position.copy(flight.pos);
    root.current.quaternion.setFromEuler(euler);

    const fast = flight.flying ? Math.min(1, Math.max(0, (flight.speed - CRUISE) / (BOOST - CRUISE))) : 0;
    const hover = flight.flying ? flight.hover : 0;
    const shape = WING_MODES[flight.mode];
    const ease = 1 - Math.exp(-5 * dt);
    wingNow.hz += (shape.hz - wingNow.hz) * ease;
    wingNow.amp += (shape.amp - wingNow.amp) * ease;
    wingNow.sweep += (shape.sweep - wingNow.sweep) * ease;
    wingNow.droop += (shape.droop - wingNow.droop) * ease;
    wingNow.figure8 += (shape.figure8 - wingNow.figure8) * ease;

    flapPhase.current += dt * wingNow.hz * Math.PI * 2;
    // Birds beat down quickly and recover more slowly, so the stroke is skewed.
    const phase = flapPhase.current;
    const stroke = phase + 0.38 * Math.sin(phase);
    // On the way up, the outer wing folds in to slip through the air. Hummingbirds don't.
    const fold = Math.max(0, Math.cos(stroke)) * Math.min(1, wingNow.amp * 2.4) * (1 - wingNow.figure8);
    const bank = flight.turn * 0.1;
    // In a hover, the wings sweep to and fro in a figure of eight, as a hummingbird's do.
    const figure = Math.sin(stroke) * wingNow.figure8 * 0.55;
    rightWing.current.rotation.set(0, -wingNow.sweep + figure, 0.12 + bank);
    leftWing.current.rotation.set(0, -wingNow.sweep + figure, 0.12 - bank);
    for (const bend of [rightBend, leftBend]) {
      bend.uPhase.value = stroke;
      bend.uAmp.value = wingNow.amp;
      bend.uDroop.value = wingNow.droop;
      bend.uFold.value = fold;
    }
    // In a hover the body swings upright, as if treading air.
    upright.current += (hover * 1.1 - upright.current) * (1 - Math.exp(-3 * dt));
    body.current.rotation.x = upright.current;
    body.current.rotation.z = Math.sin(time * 26) * flight.shaken * flight.shaken * 0.32;
    // The body rises on each downstroke, which sells the wings doing the lifting.
    body.current.position.y = Math.min(0.5, wingNow.hz > 4 ? 0 : -Math.sin(stroke) * wingNow.amp * 0.55) + Math.sin(time * 1.4) * hover * 0.14;

    const light = lightRef.current;
    if (light) {
      light.position.copy(flight.pos).addScaledVector(SUN, 420);
      light.target.position.copy(flight.pos);
      light.target.updateMatrixWorld();
    }

    if (flight.flying) {
      const away = 16 + flight.boost * 5;
      // Stay a steady distance back, even in a steep climb or dive.
      wantOffset.set(Math.sin(flight.yaw) * away, 4.4 - flight.dir.y * away * 0.4, Math.cos(flight.yaw) * away);
      camOffset.lerp(wantOffset, 1 - Math.exp(-3.4 * dt));
      camPos.copy(flight.pos).add(camOffset);
      lookTarget.copy(flight.pos).addScaledVector(flight.dir, 16);
      lookTarget.y += 1;
    } else {
      // On the title screen, the camera slowly circles the waiting hero.
      const a = time * 0.09 + 0.8;
      camPos.set(flight.pos.x + Math.cos(a) * 15, flight.pos.y + 3.6, flight.pos.z + Math.sin(a) * 15);
      camOffset.copy(camPos).sub(flight.pos);
      lookTarget.copy(flight.pos);
      lookTarget.y += 1.2;
    }
    camPos.y = Math.max(camPos.y, Math.max(heightAt(camPos.x, camPos.z), 0) + 2);
    camera.position.copy(camPos);
    lookNow.lerp(lookTarget, flight.flying ? 1 - Math.exp(-9 * dt) : 1);
    camera.up.set(Math.sin(-flight.roll * 0.16) * Math.cos(flight.yaw), 1, Math.sin(flight.roll * 0.16) * Math.sin(flight.yaw));
    camera.lookAt(lookNow);
    const fov = 60 + fast * 24 + flight.wind * 6;
    if (Math.abs(camera.fov - fov) > 0.05) {
      camera.fov += (fov - camera.fov) * (1 - Math.exp(-2.5 * dt));
      camera.updateProjectionMatrix();
    }
  };

  useFrame((state, rawDelta) => {
    tick(Math.min(rawDelta, 0.05), state.clock.elapsedTime, state.camera as PerspectiveCamera);
    if (process.env.NODE_ENV === "development") {
      // Lets a test fly the game forward even when the browser pane is throttled.
      (window as unknown as { __tick: (frames: number) => void }).__tick = (frames) => {
        for (let i = 0; i < frames; i++) tick(1 / 60, state.clock.elapsedTime + i / 60, state.camera as PerspectiveCamera);
      };
    }
  }, -1);

  return (
    <>
      <group ref={root}>
        <group ref={body}>
          {/* Standing and facing +Z becomes lying face down, head first along -Z. */}
          <group rotation={[-Math.PI / 2, 0, 0]}>
            <group rotation={[0, Math.PI, 0]} scale={fit.scale} position={[0, -HERO_HEIGHT / 2 - fit.base * fit.scale, 0]}>
              <primitive object={scene} />
            </group>
          </group>
          <Scarf />
          <group ref={rightWing} position={[0.16, 0.3, -0.42]}>
            <mesh geometry={wing} material={right.material} customDepthMaterial={right.depth} castShadow frustumCulled={false} />
          </group>
          <group position={[-0.16, 0.3, -0.42]} scale={[-1, 1, 1]}>
            <group ref={leftWing}>
              <mesh geometry={wing} material={left.material} customDepthMaterial={left.depth} castShadow frustumCulled={false} />
            </group>
          </group>
        </group>
      </group>
      <Trail source={rightWing} bend={rightBend} />
      <Trail source={leftWing} bend={leftBend} />
    </>
  );
}
