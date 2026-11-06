"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { BoxGeometry, BufferGeometry, ConeGeometry, CylinderGeometry, Float32BufferAttribute, InstancedBufferAttribute, InstancedMesh, LatheGeometry, Object3D, SphereGeometry, Vector2 } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { flight } from "./flight";
import { PEOPLE } from "./people";
import { bindUniforms, FOG_GLSL, paint, shared } from "./shared";
import { heightAt } from "./terrain";

const CLOTH = 0;
const SKIN = 1;
const ARM = 2;

function part(g: BufferGeometry, color: string, kind: number) {
  const painted = paint(g, color);
  const count = painted.attributes.position.count;
  painted.setAttribute("aPart", new Float32BufferAttribute(new Float32Array(count).fill(kind), 1));
  return painted;
}

function personGeometry() {
  // A long robe, which reads well from the air and needs no walking legs.
  const robe = new LatheGeometry(
    [
      [0.62, 0],
      [0.56, 0.5],
      [0.44, 1.2],
      [0.36, 1.8],
      [0.3, 2.05],
      [0.14, 2.15],
    ].map(([x, y]) => new Vector2(x, y)),
    18,
  );
  const head = new SphereGeometry(0.29, 18, 12).translate(0, 2.42, 0);
  const hair = new SphereGeometry(0.31, 18, 8, 0, Math.PI * 2, 0, Math.PI * 0.55).translate(0, 2.45, -0.02);
  const armUp = new CylinderGeometry(0.09, 0.11, 0.95, 8).translate(0, -0.47, 0).translate(0.4, 2.0, 0);
  const armStill = new CylinderGeometry(0.09, 0.11, 0.95, 8).translate(0, -0.47, 0).rotateZ(-0.16).translate(-0.4, 2.0, 0);
  return mergeGeometries([part(robe, "#ffffff", CLOTH), part(head, "#d9a87e", SKIN), part(hair, "#3d2b20", SKIN), part(armUp, "#ffffff", ARM), part(armStill, "#ffffff", CLOTH)])!;
}

const dummy = new Object3D();

export function People() {
  const ref = useRef<InstancedMesh>(null!);
  const geometry = useMemo(() => {
    const g = personGeometry();
    const count = PEOPLE.length;
    g.setAttribute("aTint", new InstancedBufferAttribute(new Float32Array(PEOPLE.flatMap((p) => p.tint)), 3));
    g.setAttribute("aAct", new InstancedBufferAttribute(new Float32Array(count * 3), 3));
    return g;
  }, []);
  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const act = ref.current.geometry.attributes.aAct as InstancedBufferAttribute;
    for (const p of PEOPLE) {
      const dx = flight.pos.x - p.x;
      const dz = flight.pos.z - p.z;
      const near = Math.hypot(dx, dz);
      const noticing = p.calling || (flight.flying && near < 80 && Math.abs(flight.pos.y - p.y) < 70);

      if (p.calling) {
        p.targetX = p.homeX;
        p.targetZ = p.homeZ;
      } else if (t > p.strollAt) {
        p.strollAt = t + 7 + ((p.index * 37) % 13);
        const a = t * 3.1 + p.index * 2.4;
        p.targetX = p.homeX + Math.cos(a) * 9;
        p.targetZ = p.homeZ + Math.sin(a) * 9;
      }
      const wx = p.targetX - p.x;
      const wz = p.targetZ - p.z;
      const left = Math.hypot(wx, wz);
      const walking = left > 0.4 && !noticing;
      if (walking) {
        p.x += (wx / left) * 1.5 * delta;
        p.z += (wz / left) * 1.5 * delta;
        p.y = heightAt(p.x, p.z);
      }
      const wantYaw = noticing ? Math.atan2(dx, dz) : walking ? Math.atan2(wx, wz) : p.yaw;
      p.yaw += Math.atan2(Math.sin(wantYaw - p.yaw), Math.cos(wantYaw - p.yaw)) * Math.min(1, 3 * delta);

      const ease = Math.min(1, 3 * delta);
      p.wave += ((noticing ? 1 : 0) - p.wave) * ease;
      p.look += ((noticing ? Math.min(1, Math.max(0, (flight.pos.y - p.y) / Math.max(near, 8))) : 0) - p.look) * ease;
      p.walk += ((walking ? 1 : 0) - p.walk) * ease;
      act.setXYZ(p.index, p.wave, p.look, p.walk);

      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(0, p.yaw, 0);
      dummy.updateMatrix();
      ref.current.setMatrixAt(p.index, dummy.matrix);
    }
    ref.current.instanceMatrix.needsUpdate = true;
    act.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[geometry, undefined, PEOPLE.length]} frustumCulled={false} castShadow>
      <shaderMaterial
        uniforms={shared}
        ref={bindUniforms(shared)}
        vertexShader={/* glsl */ `
          attribute float aPart;
          attribute vec3 aTint;
          attribute vec3 aAct;
          attribute vec3 color;
          uniform float uTime;
          varying vec3 vColor;
          varying vec3 vNormal2;
          varying float vDist;
          void main() {
            vec3 p = position;
            vec3 n = normal;
            float seed = instanceMatrix[3][0] * 0.37;
            if (aPart > 1.5) {
              // Raise the arm from the shoulder and wag it.
              float a = aAct.x * (2.5 + sin(uTime * 6.0 + seed) * 0.32);
              float c = cos(a), s = sin(a);
              vec2 q = p.xy - vec2(0.4, 2.0);
              p.xy = vec2(c * q.x - s * q.y, s * q.x + c * q.y) + vec2(0.4, 2.0);
              n.xy = vec2(c * n.x - s * n.y, s * n.x + c * n.y);
            } else if (aPart > 0.5) {
              // Tip the head back to look up at you.
              float a = -aAct.y * 0.7;
              float c = cos(a), s = sin(a);
              vec2 q = p.yz - vec2(2.15, 0.0);
              p.yz = vec2(c * q.x - s * q.y, s * q.x + c * q.y) + vec2(2.15, 0.0);
            }
            p.y += abs(sin(uTime * 5.0 + seed)) * 0.09 * aAct.z;
            vColor = aPart > 0.5 && aPart < 1.5 ? color : aTint;
            vNormal2 = normalize(mat3(instanceMatrix) * n);
            vec4 view = viewMatrix * modelMatrix * instanceMatrix * vec4(p, 1.0);
            vDist = -view.z;
            gl_Position = projectionMatrix * view;
          }
        `}
        fragmentShader={/* glsl */ `
          uniform vec3 uSun;
          uniform vec3 uKey;
          uniform vec3 uAmbient;
          varying vec3 vColor;
          varying vec3 vNormal2;
          varying float vDist;
          ${FOG_GLSL}
          void main() {
            vec3 light = uAmbient + uKey * max(dot(normalize(vNormal2), uSun), 0.0);
            gl_FragColor = vec4(applyFog(vColor * light, vDist), 1.0);
            #include <colorspace_fragment>
          }
        `}
      />
    </instancedMesh>
  );
}

export const parcelGeometry = () => {
  const box = paint(new BoxGeometry(1.3, 0.95, 1.05), "#c79a63");
  const a = paint(new BoxGeometry(1.34, 0.99, 0.2), "#d9483b");
  const b = paint(new BoxGeometry(0.2, 0.99, 1.09), "#d9483b");
  const bow = paint(new ConeGeometry(0.22, 0.34, 6).translate(0, 0.62, 0), "#d9483b");
  return mergeGeometries([box, a, b, bow])!;
};
