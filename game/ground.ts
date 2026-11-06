import { Color } from "three";
import { fbm, slopeAt, smooth } from "./terrain";

const SAND = new Color("#ead9ac");
const DRY = new Color("#c5ad62");
const GRASS = new Color("#8a9d4e");
const GREEN = new Color("#5f8440");
const MEADOW = new Color("#a3b35a");
const LAVENDER = new Color("#8d79bd");
const WHEAT = new Color("#d8b65a");
const POPPY = new Color("#c9604a");
const ROCK = new Color("#a98f76");
const ROCK_DARK = new Color("#8a7160");
const ROCK_PALE = new Color("#c3ae93");
const PALE = new Color("#cfc4b0");
const SNOW = new Color("#f6f3ec");
const SEABED = new Color("#d7c996");
const band = new Color();

/** The colour of the land at a point, used by the terrain and by anything that copies it. */
export function groundColor(c: Color, x: number, z: number, h: number, slope = slopeAt(x, z)) {
  const patch = fbm(x * 0.006, z * 0.006, 3);
  const detail = fbm(x * 0.05, z * 0.05, 2);
  c.copy(DRY).lerp(GRASS, smooth(0.38, 0.55, patch)).lerp(GREEN, smooth(0.52, 0.68, patch));
  c.lerp(MEADOW, smooth(0.5, 0.62, fbm(x * 0.0035 + 21, z * 0.0035 + 44, 2)) * 0.6);

  // Fields and wildflowers, on gentle ground only.
  const gentle = smooth(0.26, 0.12, slope) * smooth(10, 18, h) * smooth(200, 150, h);
  if (gentle > 0) {
    const field = fbm(x * 0.0105 + 70, z * 0.0105 + 15, 2);
    c.lerp(LAVENDER, smooth(0.6, 0.66, field) * gentle * 0.85);
    c.lerp(WHEAT, smooth(0.34, 0.28, field) * gentle * 0.8);
    c.lerp(POPPY, smooth(0.66, 0.74, fbm(x * 0.09 + 3, z * 0.09, 2)) * smooth(0.5, 0.58, fbm(x * 0.008, z * 0.008 + 90, 2)) * gentle * 0.7);
  }

  c.lerp(SAND, smooth(9, 3, h));
  c.lerp(SEABED, smooth(0, -6, h));
  c.lerp(PALE, smooth(170, 290, h + detail * 50));

  // Bare rock shows its layers.
  band.copy(ROCK).lerp(ROCK_PALE, Math.sin(h * 0.42 + detail * 2.2) * 0.5 + 0.5).lerp(ROCK_DARK, smooth(0.55, 0.8, Math.sin(h * 0.13 + 1.3) * 0.5 + 0.5) * 0.6);
  c.lerp(band, smooth(0.42, 0.74, slope + (detail - 0.5) * 0.25));
  c.lerp(SNOW, smooth(455, 560, h + detail * 70 - slope * 40));
  c.multiplyScalar(0.9 + detail * 0.2);
  return c;
}
