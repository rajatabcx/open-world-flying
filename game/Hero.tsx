"use client";

import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { AdditiveBlending, Bone, Box3, BufferGeometry, Color, CylinderGeometry, DirectionalLight, DoubleSide, Euler, Float32BufferAttribute, Group, Mesh, MeshDepthMaterial, MeshStandardMaterial, PerspectiveCamera, Quaternion, RGBADepthPacking, ShaderMaterial, Vector3 } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { BOOST, CRUISE, flight, stepFlight, type FlightMode } from "./flight";
import { wingBeatSound } from "./audio";
import { stepErrands } from "./errands";
import { updateSoundscape } from "./soundscape";
import { sky, stepDay } from "./time";
import { stepWeather } from "./weather";
import { attachInput, input } from "./input";
import { bindUniforms, shared } from "./shared";
import { photoView } from "./photo";
import { caveAt, heightAt } from "./terrain";
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

export function buildWing() {
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
  uniform float uSpan;
  uniform float uChord;
  float wingS(float x) { return max(x, 0.0) / ${SPAN.toFixed(2)}; }
`;

const wingLag = 1.5;

export function makeWingMaterial(uniforms: WingBend) {
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
      // Each kind of flight reshapes the wing: long and broad to glide, narrow to dive.
      transformed.x *= uSpan;
      transformed.z *= uChord;
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
      .replace("#include <common>", "#include <common>\nvarying float vTip;")
      .replace("#include <begin_vertex>", `${bend}\nvTip = clamp(length(position.xz) / ${(SPAN + 2.8).toFixed(2)}, 0.0, 1.0);`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vTip;\nuniform vec3 uTint;\nuniform float uTintAmount;\nuniform float uGlow;")
      .replace(
        "#include <color_fragment>",
        /* glsl */ `#include <color_fragment>
        float tipColor = smoothstep(0.32, 0.92, vTip);
        diffuseColor.rgb = mix(diffuseColor.rgb, uTint, tipColor * uTintAmount);`,
      )
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += uTint * tipColor * uGlow;");
  };
  depth.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>\n${WING_BEND}`).replace("#include <begin_vertex>", bend);
  };
  return { material, depth };
}

export type WingBend = { uPhase: { value: number }; uAmp: { value: number }; uDroop: { value: number }; uFold: { value: number }; uSpan: { value: number }; uChord: { value: number }; uTint: { value: Color }; uTintAmount: { value: number }; uGlow: { value: number } };

const wingLook = { uSpan: { value: 1 }, uChord: { value: 1 }, uTint: { value: new Color("#e8683f") }, uTintAmount: { value: 0 }, uGlow: { value: 0 } };
const rightBend = { uPhase: { value: 0 }, uAmp: { value: 0 }, uDroop: { value: 0 }, uFold: { value: 0 }, ...wingLook };
const leftBend = { uPhase: { value: 0 }, uAmp: { value: 0 }, uDroop: { value: 0 }, uFold: { value: 0 }, ...wingLook };

function wingTip(target: Vector3, bendValues: typeof rightBend) {
  const x = SPAN + 1.9;
  const s = x / SPAN;
  const wave = Math.sin(bendValues.uPhase.value - s * wingLag);
  const fold = bendValues.uFold.value;
  return target.set(x * (1 - fold * 0.22 * s) * wingLook.uSpan.value, SPAN * (bendValues.uAmp.value * wave * Math.pow(s, 1.5) + bendValues.uDroop.value * s * s), (1.5 + fold * 0.75 * s * s) * wingLook.uChord.value);
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
        ref={bindUniforms(uniforms)}
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

// What the wings do and become in each kind of flight, like the birds that fly that way.
// Gliding is an albatross, climbing an eagle, diving a falcon and boosting a swift. A hover
// is no bird at all: you stand on the air with your wings wide open, pressing down in slow,
// heavy beats. The shape and colour flow from one to the next.
type WingShape = { hz: number; amp: number; sweep: number; droop: number; spread: number; span: number; chord: number; tint: string; tintAmount: number; glow: number };
const WING_MODES: Record<FlightMode, WingShape> = {
  idle: { hz: 0.7, amp: 0.26, sweep: 0.1, droop: -0.03, spread: 0, span: 1, chord: 1, tint: "#e8683f", tintAmount: 0, glow: 0 },
  glide: { hz: 0.16, amp: 0.035, sweep: 0.12, droop: 0.03, spread: 0, span: 1.22, chord: 0.92, tint: "#f4f1e8", tintAmount: 0.35, glow: 0 },
  flap: { hz: 1.5, amp: 0.46, sweep: 0.1, droop: -0.03, spread: 0, span: 1, chord: 1, tint: "#e8683f", tintAmount: 0, glow: 0 },
  climb: { hz: 2, amp: 0.55, sweep: 0.04, droop: -0.02, spread: 0, span: 1.02, chord: 1.28, tint: "#8c4a22", tintAmount: 0.8, glow: 0 },
  boost: { hz: 3.2, amp: 0.12, sweep: 0.55, droop: -0.07, spread: 0, span: 0.96, chord: 0.62, tint: "#ffc24a", tintAmount: 0.9, glow: 0.75 },
  dive: { hz: 0.2, amp: 0.012, sweep: 1.05, droop: -0.26, spread: 0, span: 0.78, chord: 0.72, tint: "#4a5f78", tintAmount: 0.9, glow: 0 },
  hover: { hz: 0.62, amp: 0.25, sweep: -0.04, droop: -0.05, spread: 0.8, span: 1.2, chord: 1.16, tint: "#e8683f", tintAmount: 0, glow: 0 },
  rest: { hz: 0.12, amp: 0.012, sweep: 1.28, droop: 0.42, spread: 0, span: 0.62, chord: 0.8, tint: "#e8683f", tintAmount: 0, glow: 0 },
};
const wingNow = { hz: 0.7, amp: 0.26, sweep: 0.1, droop: -0.03, spread: 0, span: 1, chord: 1, tintAmount: 0, glow: 0 };
const wingTint = new Color("#e8683f");
const tintTarget = new Color();

// Sitting back to take in the view: one leg out along the ground, one knee up, and the
// arms propped behind. Each bend is measured in the model's own axes (X tips forward and
// back, with the model standing and facing +Z), because every bone has its own twist.
const SIT_POSE: [string, number, number, number][] = [
  ["Abdomen", -0.14, 0, 0],
  ["Torso", -0.1, 0, 0],
  ["Neck", 0.28, 0, 0],
  ["Head", 0.28, 0, 0],
  ["UpperLegL", -1.92, 0, 0.1],
  ["LowerLegL", 2.05, 0, 0],
  ["UpperLegR", -1.6, 0, -0.08],
  ["LowerLegR", 0.1, 0, 0],
  ["UpperArmL", 0.62, 0, -0.1],
  ["LowerArmL", -0.1, 0, 0],
  ["UpperArmR", 0.62, 0, 0.1],
  ["LowerArmR", -0.1, 0, 0],
];

const tilt = new Quaternion();
const parentTurn = new Quaternion();
const parentBack = new Quaternion();

const lastBeat = { value: 0 };
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
  const sitting = useRef(0);
  const poses = useRef<{ bone: Bone; rest: Quaternion; bent: Quaternion }[]>([]);
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
    poses.current = SIT_POSE.flatMap(([name, x, y, z]) => {
      const bone = scene.getObjectByName(name) as Bone | undefined;
      if (!bone) return [];
      // Turn the model-space bend into the frame this bone is posed in.
      parentTurn.identity();
      for (let up = bone.parent; up && up !== scene; up = up.parent) parentTurn.premultiply(up.quaternion);
      parentBack.copy(parentTurn).invert();
      tilt.setFromEuler(euler.set(x, y, z));
      const rest = bone.quaternion.clone();
      return [{ bone, rest, bent: parentBack.clone().multiply(tilt).multiply(parentTurn).multiply(rest) }];
    });
    return () => {
      for (const pose of poses.current) pose.bone.quaternion.copy(pose.rest);
      if (neck) neck.rotateX(0.45);
      if (head) head.rotateX(0.45);
    };
  }, [scene]);

  const tick = (dt: number, time: number, camera: PerspectiveCamera) => {
    shared.uTime.value = time;
    stepWeather(dt, time, flight.pos.x, flight.pos.z, flight.yaw, 1 - sky.night);
    stepDay(dt, true);
    stepFlight(dt, time);
    stepErrands(time);
    updateSoundscape(dt);

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
    wingNow.spread += (shape.spread - wingNow.spread) * ease;
    const reshape = 1 - Math.exp(-3.2 * dt);
    wingNow.span += (shape.span - wingNow.span) * reshape;
    wingNow.chord += (shape.chord - wingNow.chord) * reshape;
    wingNow.tintAmount += (shape.tintAmount - wingNow.tintAmount) * reshape;
    wingNow.glow += (shape.glow - wingNow.glow) * reshape;
    tintTarget.set(shape.tint);
    wingTint.lerp(tintTarget, reshape);
    wingLook.uSpan.value = wingNow.span;
    wingLook.uChord.value = wingNow.chord;
    wingLook.uTint.value.copy(wingTint);
    wingLook.uTintAmount.value = wingNow.tintAmount;
    wingLook.uGlow.value = wingNow.glow;

    flapPhase.current += dt * wingNow.hz * Math.PI * 2;
    // Birds beat down quickly and recover more slowly, so the stroke is skewed.
    const phase = flapPhase.current;
    const stroke = phase + 0.38 * Math.sin(phase);
    // On the way up, the outer wing folds in to slip through the air, except in a hover,
    // when the wings stay spread. Each downstroke makes a soft beat of air.
    const beat = Math.sin(stroke);
    if (flight.flying && lastBeat.value >= 0 && beat < 0 && wingNow.amp > 0.2) wingBeatSound(wingNow.amp);
    lastBeat.value = beat;
    const fold = Math.max(0, Math.cos(stroke)) * Math.min(1, wingNow.amp * 2.4) * (1 - wingNow.spread);
    const bank = flight.turn * 0.1;
    rightWing.current.rotation.set(0, -wingNow.sweep, 0.12 + bank);
    leftWing.current.rotation.set(0, -wingNow.sweep, 0.12 - bank);
    for (const bend of [rightBend, leftBend]) {
      bend.uPhase.value = stroke;
      bend.uAmp.value = wingNow.amp;
      bend.uDroop.value = wingNow.droop;
      bend.uFold.value = fold;
    }
    // In a hover the body swings upright, standing on the air.
    const resting = flight.mode === "rest";
    upright.current += ((resting ? Math.PI / 2 : hover * 1.32) - upright.current) * (1 - Math.exp(-3 * dt));
    // Knees bend and arms drop to sit down, and stretch out again for flight.
    sitting.current += ((resting ? 1 : 0) - sitting.current) * (1 - Math.exp(-3.5 * dt));
    for (const pose of poses.current) pose.bone.quaternion.slerpQuaternions(pose.rest, pose.bent, sitting.current);
    body.current.rotation.x = upright.current;
    body.current.rotation.z = Math.sin(time * 26) * flight.shaken * flight.shaken * 0.32;
    // The body rises on each downstroke, which sells the wings doing the lifting.
    body.current.position.y = Math.min(0.5, -Math.sin(stroke) * wingNow.amp * 0.55);

    const light = lightRef.current;
    if (light) {
      light.position.copy(flight.pos).addScaledVector(SUN, 420);
      light.target.position.copy(flight.pos);
      light.target.updateMatrixWorld();
    }

    if (flight.photo) {
      // Lining up a photo: the arrow keys swing the camera around you.
      photoView.yaw -= input.x * dt * 1.1;
      photoView.lift = Math.max(-0.5, Math.min(1.3, photoView.lift + input.y * dt * 0.8));
      photoView.away = Math.max(5, Math.min(70, photoView.away + input.throttle * -22 * dt));
      const a = flight.yaw + photoView.yaw;
      const flat = Math.cos(photoView.lift) * photoView.away;
      camPos.set(flight.pos.x + Math.sin(a) * flat, flight.pos.y + Math.sin(photoView.lift) * photoView.away, flight.pos.z + Math.cos(a) * flat);
      camOffset.copy(camPos).sub(flight.pos);
      lookTarget.copy(flight.pos);
    } else if (flight.resting && flight.restTime > 1.5) {
      // Sitting still, the camera slowly drifts out to take in the view.
      const out = Math.min(1, (flight.restTime - 1.5) / 14);
      const eased = out * out * (3 - 2 * out);
      const a = flight.yaw + 0.5 + (flight.restTime - 1.5) * 0.035;
      const away = 12 + eased * 44;
      wantOffset.set(Math.sin(a) * away, 4.5 + eased * 19, Math.cos(a) * away);
      camOffset.lerp(wantOffset, 1 - Math.exp(-1.4 * dt));
      camPos.copy(flight.pos).add(camOffset);
      lookTarget.copy(flight.pos);
      lookTarget.y += 1 + eased * 8;
    } else if (flight.flying) {
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
    if (flight.cave > 0.3) {
      // Keep the camera in the tunnel, under the rock.
      const inCave = caveAt(camPos.x, camPos.z);
      if (inCave) camPos.y = Math.min(camPos.y, inCave.floor + inCave.cave.roof - 2);
    }
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
