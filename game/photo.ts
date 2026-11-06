import { flight } from "./flight";
import { CAVES, caveAt, FALLS, heightAt, PLACES, RUIN, VILLAGES } from "./terrain";
import { VILLAGE_NAMES } from "./villages";

export const photoView = { yaw: 0, lift: 0.2, away: 15 };

export type Postcard = { id: number; place: string; image: string };

const KEY = "aloft-postcards";
const MAX_CARDS = 24;
const CARD_WIDTH = 720;

/** Plain-language name for wherever you are. */
export function placeName(x: number, y: number, z: number) {
  if (Math.hypot(x - FALLS.x, z - FALLS.z) < 230) return "The Hidden Falls";
  const cave = caveAt(x, z);
  if (cave) return cave.cave.name;
  if (Math.hypot(x - RUIN.x, z - RUIN.z) < RUIN.r * 1.5) return "The Drowned Temple";
  if (Math.hypot(x - PLACES.summit.x, z - PLACES.summit.z) < 200 && y > PLACES.summit.y - 120) return "The Mountaintop";
  let nearest = -1;
  let best = Infinity;
  VILLAGES.forEach((v, i) => {
    const d = Math.hypot(x - v.x, z - v.z) - v.r;
    if (d < best) {
      best = d;
      nearest = i;
    }
  });
  if (best < 260) return VILLAGE_NAMES[nearest];
  if (y - Math.max(heightAt(x, z), 0) > 320) return "High Above the Island";
  return heightAt(x, z) < 0 ? "Out Over the Water" : "Somewhere on the Island";
}

export function secretPlaces() {
  return [{ name: "The Hidden Falls", x: FALLS.x, z: FALLS.z, reach: 170 }, { name: "The Drowned Temple", x: RUIN.x, z: RUIN.z, reach: RUIN.r * 1.2 }];
}

export const caveNames = CAVES.map((c) => c.name);

export function loadPostcards(): Postcard[] {
  try {
    const stored = localStorage.getItem(KEY);
    return stored ? (JSON.parse(stored) as Postcard[]) : [];
  } catch {
    return [];
  }
}

/** Keeps cards in this browser only, dropping the oldest when space runs short. */
export function savePostcards(cards: Postcard[]) {
  let list = cards.slice(0, MAX_CARDS);
  while (list.length > 0) {
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
      return list;
    } catch {
      list = list.slice(0, list.length - 1);
    }
  }
  return list;
}

/** Puts a white border and a hand-written place name around a photo. */
export function makePostcard(photo: string, place: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const border = 22;
      const footer = 58;
      const inner = CARD_WIDTH - border * 2;
      const crop = Math.min(image.width, (image.height * 3) / 2);
      const height = Math.round((inner * 2) / 3);
      const canvas = document.createElement("canvas");
      canvas.width = CARD_WIDTH;
      canvas.height = height + border + footer;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#fdfaf2";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const cropHeight = (crop * 2) / 3;
      ctx.drawImage(image, (image.width - crop) / 2, (image.height - cropHeight) / 2, crop, cropHeight, border, border, inner, height);
      ctx.fillStyle = "#4b3f33";
      ctx.font = "italic 26px Georgia, 'Times New Roman', serif";
      ctx.textBaseline = "middle";
      ctx.fillText(place, border + 4, height + border + footer / 2);
      resolve(canvas.toDataURL("image/jpeg", 0.8));
    };
    image.onerror = () => reject(new Error("The photo couldn't be read."));
    image.src = photo;
  });
}

export function enterPhoto() {
  flight.photo = true;
  photoView.yaw = 0.5;
  photoView.lift = 0.2;
  photoView.away = 15;
}

export function leavePhoto() {
  flight.photo = false;
}
