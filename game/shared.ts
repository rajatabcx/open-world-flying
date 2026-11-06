import { BufferGeometry, CanvasTexture, Color, Float32BufferAttribute, type Texture } from "three";
import { FOG_FAR, FOG_NEAR, HORIZON, SUN } from "./world";

// One clock and one set of fog values, shared by every custom shader.
export const shared = {
  uTime: { value: 0 },
  uFogColor: { value: new Color(HORIZON) },
  uFogNear: { value: FOG_NEAR },
  uFogFar: { value: FOG_FAR },
  // Light for the custom shaders, kept in step with the scene's real lights.
  uSun: { value: SUN },
  uKey: { value: new Color(1.0, 0.94, 0.84) },
  uAmbient: { value: new Color(0.62, 0.64, 0.62) },
  uNight: { value: 0 },
};

export const FOG_GLSL = /* glsl */ `
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  vec3 applyFog(vec3 col, float dist) {
    return mix(col, uFogColor, smoothstep(uFogNear, uFogFar, dist));
  }
`;

const scratch = new Color();

export function paint(geometry: BufferGeometry, color: string | Color) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  scratch.set(color);
  const count = g.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = scratch.r;
    colors[i * 3 + 1] = scratch.g;
    colors[i * 3 + 2] = scratch.b;
  }
  g.setAttribute("color", new Float32BufferAttribute(colors, 3));
  g.deleteAttribute("uv");
  g.computeVertexNormals();
  return g;
}

let glow: Texture | null = null;

/** A soft round glow, shared by everything that shines. */
export function glowTexture() {
  if (glow) return glow;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.3, "rgba(255,255,255,0.45)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  glow = new CanvasTexture(canvas);
  return glow;
}
