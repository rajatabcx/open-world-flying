import { SILENT, setScene, type Scene } from "./audio";
import { flight } from "./flight";
import { FALLS, heightAt, smooth, VILLAGES } from "./terrain";
import { sky } from "./time";
import { weather } from "./weather";

// Turns where you are and how you're flying into the mix. Sound doesn't need updating
// every frame, so this runs about ten times a second.

const scene: Scene = { ...SILENT };
let wait = 0;

export function updateSoundscape(dt: number) {
  wait -= dt;
  if (wait > 0) return;
  wait = 0.1;
  if (!flight.flying) {
    setScene({ ...SILENT, night: sky.night });
    return;
  }
  const speed = Math.hypot(flight.speed, flight.folded ? flight.vy : 0) + flight.impulse.length() * 0.5;
  const pace = Math.min(1, speed / 150);
  // The air only ever swells and deepens. Its tone stays low, even at full speed.
  scene.wind = 0.03 + pace * pace * 0.32 + flight.wind * 0.05;
  scene.windTone = 220 + pace * 520;
  const fast = flight.mode === "dive" || flight.mode === "boost" || flight.mode === "fall";
  scene.rush = fast ? Math.max(0, pace - 0.3) * 0.32 : 0;

  const ground = Math.max(heightAt(flight.pos.x, flight.pos.z), 0);
  const low = flight.pos.y - ground < 13;
  scene.spray = flight.skimming > 0 && low ? Math.min(0.06, speed * 0.0011) * flight.skimming : 0;
  scene.high = smooth(120, 420, flight.pos.y - ground);
  let village = Infinity;
  for (const v of VILLAGES) village = Math.min(village, Math.hypot(flight.pos.x - v.x, flight.pos.z - v.z) - v.r);
  scene.village = (1 - smooth(60, 420, village)) * (1 - scene.high * 0.7);

  const falls = Math.hypot(flight.pos.x - FALLS.x, flight.pos.y - FALLS.pool, flight.pos.z - FALLS.z);
  scene.falls = (1 - smooth(50, 560, falls)) * 0.34;
  scene.rain = weather.rain * 0.075 * (1 - flight.cave);
  scene.cave = flight.cave;
  scene.night = sky.night;
  setScene(scene);
}
