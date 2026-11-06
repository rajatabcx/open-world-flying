import { HOMES, doorstep, type Home } from "./villages";
import { rng, VILLAGES } from "./terrain";

export type Person = {
  index: number;
  name: string;
  village: number;
  home: Home;
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Their spot on the doorstep, which they stroll out from and come back to. */
  homeX: number;
  homeZ: number;
  tint: [number, number, number];
  wave: number;
  look: number;
  walk: number;
  /** Waiting with a parcel, or waiting for one. They keep waving at the sky. */
  calling: boolean;
  strollAt: number;
  targetX: number;
  targetZ: number;
};

const NAMES = ["Elia", "Marisol", "Teo", "Nerina", "Bastian", "Oriana", "Dario", "Lucetta", "Ilario", "Sabela", "Rocco", "Vittoria", "Anselmo", "Fiora", "Matteo", "Zaira", "Nico", "Perla", "Tomas", "Alba", "Leandro", "Ines", "Silvio", "Mirela"];
const CLOTHES: [number, number, number][] = [
  [0.82, 0.32, 0.22],
  [0.16, 0.42, 0.6],
  [0.86, 0.68, 0.28],
  [0.3, 0.52, 0.42],
  [0.92, 0.88, 0.78],
  [0.62, 0.3, 0.46],
  [0.86, 0.5, 0.3],
];

const r = rng(5150);
const PER_VILLAGE = 16;

export const PEOPLE: Person[] = VILLAGES.flatMap((_, village) => {
  const homes = HOMES.filter((h) => h.village === village);
  const chosen = [...homes].sort(() => r() - 0.5).slice(0, PER_VILLAGE);
  return chosen.map((home) => {
    const spot = doorstep(home);
    return {
      index: 0,
      name: NAMES[Math.floor(r() * NAMES.length)],
      village,
      home,
      x: spot.x,
      y: spot.y,
      z: spot.z,
      yaw: r() * 6.28,
      homeX: spot.x,
      homeZ: spot.z,
      tint: CLOTHES[Math.floor(r() * CLOTHES.length)],
      wave: 0,
      look: 0,
      walk: 0,
      calling: false,
      strollAt: r() * 20,
      targetX: spot.x,
      targetZ: spot.z,
    };
  });
});
PEOPLE.forEach((p, i) => {
  p.index = i;
});
