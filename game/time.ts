import { Color, Vector3 } from "three";
import { smooth } from "./terrain";
import { shared } from "./shared";
import { SUN } from "./world";
import { weather } from "./weather";

// One slow day, from which all the light and colour of the world is worked out.

const DAY_SECONDS = 720;
const FAST_FORWARD = 90;

const NOON = {
  key: new Color("#fff0d6"),
  sky: new Color("#dcecff"),
  ground: new Color("#c9b48a"),
  horizon: new Color("#d9e6e4"),
  mid: new Color(0.42, 0.68, 0.9),
  top: new Color(0.24, 0.5, 0.82),
  disc: new Color(1, 0.86, 0.62),
};
const GOLD = {
  key: new Color("#ffa862"),
  sky: new Color("#ffcfae"),
  ground: new Color("#b78a6a"),
  horizon: new Color("#f4b283"),
  mid: new Color(0.86, 0.56, 0.5),
  top: new Color(0.34, 0.4, 0.68),
  disc: new Color(1, 0.55, 0.25),
};
const NIGHT = {
  key: new Color("#a6bcec"),
  sky: new Color("#31457e"),
  ground: new Color("#1d2740"),
  horizon: new Color("#1d2b4f"),
  mid: new Color(0.06, 0.11, 0.25),
  top: new Color(0.018, 0.035, 0.11),
  disc: new Color(0.93, 0.95, 1),
};
const GREY = new Color("#a9b4bb");

export const sky = {
  /** 0 and 1 are midnight, 0.25 dawn, 0.5 noon, 0.75 dusk. */
  time: 0.34,
  night: 0,
  golden: 0,
  keyIntensity: 2.1,
  fillIntensity: 1.05,
  isMoon: false,
  rush: 0,
  key: new Color(),
  fillSky: new Color(),
  fillGround: new Color(),
  horizon: new Color(),
  mid: new Color(),
  top: new Color(),
  disc: new Color(),
};

const raw = new Vector3();

function blend(target: "key" | "sky" | "ground" | "horizon" | "mid" | "top" | "disc", out: Color, golden: number, night: number) {
  out.copy(NOON[target]).lerp(GOLD[target], golden).lerp(NIGHT[target], night);
}

/** Skips ahead to the next part of the day, gently. */
export function hurryDay() {
  sky.rush = 1 / 6;
}

export function stepDay(dt: number, moving: boolean) {
  let advance = moving ? dt / DAY_SECONDS : 0;
  if (sky.rush > 0) {
    const jump = Math.min(sky.rush, dt / FAST_FORWARD * 6);
    sky.rush -= jump;
    advance += jump;
  }
  sky.time = (sky.time + advance) % 1;

  const angle = (sky.time - 0.25) * Math.PI * 2;
  const height = Math.sin(angle);
  raw.set(-Math.cos(angle) * 0.82, height * 0.8, 0.42).normalize();
  sky.isMoon = height < -0.02;
  SUN.copy(raw);
  if (sky.isMoon) SUN.multiplyScalar(-1);

  sky.golden = smooth(-0.14, 0.02, height) * (1 - smooth(0.05, 0.42, height));
  sky.night = 1 - smooth(-0.24, 0.0, height);
  const sunUp = smooth(-0.02, 0.2, height);
  const moonUp = smooth(0.02, 0.2, -height);

  blend("key", sky.key, sky.golden, sky.isMoon ? 1 : 0);
  blend("sky", sky.fillSky, sky.golden, sky.night);
  blend("ground", sky.fillGround, sky.golden, sky.night);
  blend("horizon", sky.horizon, sky.golden, sky.night);
  blend("mid", sky.mid, sky.golden, sky.night);
  blend("top", sky.top, sky.golden, sky.night);
  blend("disc", sky.disc, sky.golden, sky.isMoon ? 1 : 0);

  // Rain softens the sun and greys the distance.
  const overcast = weather.overcast;
  sky.horizon.lerp(GREY.clone().multiplyScalar(1 - sky.night * 0.75), overcast * 0.65);
  sky.mid.lerp(GREY.clone().multiplyScalar(0.92 - sky.night * 0.7), overcast * 0.75);
  sky.top.lerp(GREY.clone().multiplyScalar(0.72 - sky.night * 0.6), overcast * 0.7);
  sky.keyIntensity = (sunUp * 2.1 * (0.72 + 0.28 * (1 - sky.golden)) + moonUp * 0.62) * (1 - overcast * 0.6);
  sky.fillIntensity = (1.05 - sky.night * 0.5 - sky.golden * 0.15) * (1 - overcast * 0.15);

  // The custom shaders read the same light as the scene.
  shared.uFogColor.value.copy(sky.horizon);
  shared.uKey.value.copy(sky.key).multiplyScalar(sky.keyIntensity / 2.1);
  shared.uAmbient.value.copy(sky.fillSky).multiplyScalar(sky.fillIntensity * 0.62);
  shared.uNight.value = sky.night;
  shared.uSkyMid.value.copy(sky.mid);
  shared.uSkyTop.value.copy(sky.top);
  shared.uDisc.value.copy(sky.disc);
  shared.uMoon.value = sky.isMoon ? 1 : 0;
}
