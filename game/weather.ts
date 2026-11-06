// A single soft shower drifts over the island now and then. You can see it coming,
// fly through it or around it, and if the sun's out you'll get a rainbow after.

const FIRST_SHOWER = 170;
const BETWEEN = 330;
const RADIUS = 620;
const DRIFT = 11;

export const weather = {
  /** Where the shower is centred. */
  x: 0,
  z: 0,
  dirX: 1,
  dirZ: 0,
  /** Grows from 0, holds, then fades: the shower's own strength. */
  strength: 0,
  /** How much rain is falling where you are. */
  rain: 0,
  overcast: 0,
  rainbow: 0,
  radius: RADIUS,
  next: FIRST_SHOWER,
  age: -1,
  length: 150,
};

const smooth01 = (t: number) => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

/** Starts a shower upwind of a spot, so that it drifts across it. */
export function startShower(x: number, z: number, heading: number) {
  const across = (Math.random() - 0.5) * 500;
  weather.dirX = -Math.sin(heading);
  weather.dirZ = -Math.cos(heading);
  // It begins ahead of where you're heading and drifts back toward you.
  weather.x = x + weather.dirX * 1100 - weather.dirZ * across;
  weather.z = z + weather.dirZ * 1100 + weather.dirX * across;
  weather.dirX *= -1;
  weather.dirZ *= -1;
  weather.age = 0;
}

export function stepWeather(dt: number, time: number, x: number, z: number, heading: number, daylight: number) {
  if (weather.age < 0 && time > weather.next) startShower(x, z, heading);
  if (weather.age >= 0) {
    weather.age += dt;
    weather.x += weather.dirX * DRIFT * dt;
    weather.z += weather.dirZ * DRIFT * dt;
    weather.strength = smooth01(weather.age / 18) * (1 - smooth01((weather.age - weather.length + 22) / 22));
    if (weather.age > weather.length) {
      weather.age = -1;
      weather.strength = 0;
      weather.next = time + BETWEEN * (0.7 + Math.random() * 0.6);
    }
  }
  const away = Math.hypot(x - weather.x, z - weather.z);
  const under = weather.strength * (1 - smooth01((away - RADIUS * 0.55) / (RADIUS * 0.45)));
  const wasRaining = weather.rain;
  weather.rain += (under - weather.rain) * Math.min(1, dt * 1.3);
  const near = weather.strength * (1 - smooth01((away - RADIUS * 0.8) / (RADIUS * 1.1)));
  weather.overcast += (near - weather.overcast) * Math.min(1, dt * 0.7);
  // Stepping out of the rain into sunlight is what makes a rainbow.
  if (wasRaining > 0.25 && weather.rain <= 0.25 && daylight > 0.45) weather.rainbow = Math.max(weather.rainbow, 0.001);
  if (weather.rainbow > 0) {
    weather.rainbow += dt / 70;
    if (weather.rainbow >= 1) weather.rainbow = 0;
  }
}
