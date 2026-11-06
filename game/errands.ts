import { deliveredSound, pickupSound } from "./audio";
import { flight } from "./flight";
import { PEOPLE, type Person } from "./people";
import { rng, VILLAGES } from "./terrain";
import { VILLAGE_NAMES } from "./villages";

// Deliveries are always optional. There's no timer or score, and nothing can go wrong:
// fly by someone holding a glowing parcel to carry it, or just keep flying.

const ITEMS = [
  "a jar of honey",
  "warm bread",
  "a mended kite",
  "a letter from home",
  "a basket of lemons",
  "a hand-knitted shawl",
  "cough syrup",
  "a pot of basil",
  "a bottle of olive oil",
  "a child's lost shoe",
  "a blanket for the cold nights",
  "a bag of figs",
];
const THANKS = [
  "That made their day.",
  "They're already unwrapping it.",
  "They wave until you're out of sight.",
  "A lantern goes up by their door.",
  "They promise to save you a slice.",
];

export type Offer = { giver: Person; to: Person; item: string };

const REACH = 16;
const REACH_UP = 26;
const r = rng(31337);

export const errands = {
  offers: [] as Offer[],
  carrying: null as Offer | null,
  delivered: 0,
  /** Homes that hung up a lantern after a delivery. */
  lantern: [] as { x: number; y: number; z: number }[],
  caption: "",
  captionUntil: 0,
  /** Set the moment a parcel arrives, for the burst of petals. */
  burst: null as { x: number; y: number; z: number } | null,
};

const oneOf = <T,>(list: T[]) => list[Math.floor(r() * list.length)];

function say(text: string, time: number, seconds: number) {
  errands.caption = text;
  errands.captionUntil = time + seconds;
}

function makeOffer(village: number): Offer {
  const used = new Set(errands.offers.flatMap((o) => [o.giver, o.to]));
  if (errands.carrying) {
    used.add(errands.carrying.giver);
    used.add(errands.carrying.to);
  }
  const free = (list: Person[]) => list.filter((p) => !used.has(p));
  const giver = oneOf(free(PEOPLE.filter((p) => p.village === village)));
  const elsewhere = (village + 1 + Math.floor(r() * (VILLAGES.length - 1))) % VILLAGES.length;
  const to = oneOf(free(PEOPLE.filter((p) => p.village === elsewhere)));
  giver.calling = true;
  return { giver, to, item: oneOf(ITEMS) };
}

function setUp() {
  VILLAGES.forEach((_, village) => errands.offers.push(makeOffer(village)));
}

const near = (p: Person) => Math.hypot(flight.pos.x - p.x, flight.pos.z - p.z) < REACH && Math.abs(flight.pos.y - p.y) < REACH_UP;

/** Where the errand you're on leads. */
export function destination() {
  return errands.carrying?.to ?? null;
}

export function dropParcel() {
  const parcel = errands.carrying;
  if (!parcel) return;
  errands.carrying = null;
  parcel.to.calling = false;
  errands.offers.push(parcel);
  say(`You left ${parcel.item} with ${parcel.giver.name}. No rush, it'll wait.`, flight.clock, 6);
}

export function stepErrands(time: number) {
  if (errands.offers.length === 0 && !errands.carrying) setUp();
  if (!flight.flying) return;

  const parcel = errands.carrying;
  if (parcel) {
    if (near(parcel.to)) {
      errands.carrying = null;
      errands.delivered++;
      parcel.to.calling = false;
      parcel.giver.calling = false;
      errands.lantern.push({ x: parcel.to.homeX, y: parcel.to.y + 3.4, z: parcel.to.homeZ });
      errands.burst = { x: parcel.to.x, y: parcel.to.y + 3, z: parcel.to.z };
      errands.offers.push(makeOffer(parcel.giver.village));
      say(`${parcel.to.name} has ${parcel.item}. ${oneOf(THANKS)}`, time, 7);
      deliveredSound();
    }
    return;
  }
  const taken = errands.offers.findIndex((o) => near(o.giver));
  // Don't snatch a parcel straight back up right after setting it down.
  if (taken >= 0 && time > errands.captionUntil - 3) {
    const offer = errands.offers[taken];
    errands.offers.splice(taken, 1);
    errands.carrying = offer;
    offer.to.calling = true;
    say(`${offer.giver.name} hands you ${offer.item} for ${offer.to.name} in ${VILLAGE_NAMES[offer.to.village]}. Follow the golden bird. X sets it down.`, time, 9);
    pickupSound();
  }
}

export function captionNow(time: number) {
  if (time < errands.captionUntil) return errands.caption;
  return errands.carrying ? `${errands.carrying.item} for ${errands.carrying.to.name} in ${VILLAGE_NAMES[errands.carrying.to.village]}` : "";
}
