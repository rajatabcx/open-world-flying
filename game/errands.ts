import { deliveredSound, pickupSound } from "./audio";
import { flight } from "./flight";
import { PEOPLE, type Person } from "./people";
import { secretPlaces } from "./photo";
import { caveAt, rng, VILLAGES } from "./terrain";
import { nextLore } from "./lore";
import { VILLAGE_NAMES } from "./villages";

// Deliveries are always optional. There's no timer or score, and nothing can go wrong.
// Land near someone holding a glowing parcel, walk over and talk to them. They'll share a
// little of the island's story, then tell you what the parcel is and who it's for. Say yes
// and it's yours to carry until you walk up to that person and hand it over. You can stop
// and rest on the way, but you can't leave it somewhere.

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

const ASKS = [
  "Could you take {item} to {to} in {place}? I'd go myself, but my wings are in for mending.",
  "Oh, a flier! Would you carry {item} to {to} over in {place}? They've been waiting all week.",
  "If you're heading toward {place}, {to} is expecting {item}. Would you mind?",
  "I promised {to} in {place} {item}. Would you fly it over for me?",
];
const GREETINGS = [
  "For me? {item}! Thank you, flier.",
  "{item}, at last. Come by any time, the door's always open.",
  "You came all this way with {item}? Thank you. Mind the steps on your way up.",
  "Oh, {item}! That's made my day.",
];

export type Offer = { giver: Person; to: Person; item: string; ask: string };

/** How close you need to walk up to someone to talk with them. */
export const TALK_REACH = 7;
/** How close you need to be before they point out you could land and talk. */
const NOTICE_REACH = 160;
const r = rng(31337);

export type Talk = { person: Person; offer: Offer; kind: "ask" | "deliver"; pages: string[]; page: number };

export const errands = {
  offers: [] as Offer[],
  carrying: null as Offer | null,
  /** Bumped when you take or hand over a parcel, for the little gesture that goes with it. */
  gesture: 0,
  /** The conversation on screen, if any. */
  talk: null as Talk | null,
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
  const item = oneOf(ITEMS);
  return { giver, to, item, ask: fill(oneOf(ASKS), item, to) };
}

const fill = (line: string, item: string, to: Person) => {
  const text = line.replace("{item}", item).replace("{to}", to.name).replace("{place}", VILLAGE_NAMES[to.village]);
  return text.charAt(0).toUpperCase() + text.slice(1);
};

function setUp() {
  VILLAGES.forEach((_, village) => errands.offers.push(makeOffer(village)));
}

const distanceTo = (p: Person) => Math.hypot(flight.pos.x - p.x, flight.pos.z - p.z);
const nearEnough = (p: Person) => distanceTo(p) < TALK_REACH && Math.abs(flight.pos.y - p.y) < 8;

/** Where the errand you're on leads. */
export function destination() {
  return errands.carrying?.to ?? null;
}

/** Someone you're standing beside who has something to say, if there is anyone. */
export function talkable(): { person: Person; offer: Offer; kind: Talk["kind"] } | null {
  if (!flight.flying || !flight.resting || errands.talk) return null;
  const parcel = errands.carrying;
  if (parcel) return nearEnough(parcel.to) ? { person: parcel.to, offer: parcel, kind: "deliver" } : null;
  const offer = errands.offers.find((o) => nearEnough(o.giver));
  return offer ? { person: offer.giver, offer, kind: "ask" } : null;
}

/** Starts talking with whoever's beside you. Each conversation tells a little more of the story. */
export function startTalk() {
  const near = talkable();
  if (!near) return false;
  const { person, offer, kind } = near;
  const lore = nextLore(r);
  const pages = kind === "ask" ? [lore, offer.ask] : [fill(oneOf(GREETINGS), offer.item, offer.to), lore];
  errands.talk = { person, offer, kind, pages, page: 0 };
  flight.busy = true;
  // Turn to face them.
  flight.yaw = Math.atan2(flight.pos.x - person.x, flight.pos.z - person.z);
  return true;
}

function endTalk() {
  errands.talk = null;
  flight.busy = false;
  // Stay standing a moment before sitting down again.
  flight.restTime = 0.7;
}

/** Says yes to carrying the parcel, or finishes handing one over. */
export function answerYes() {
  const talk = errands.talk;
  if (!talk) return;
  // Hear them out first.
  if (talk.page < talk.pages.length - 1) {
    errands.talk = { ...talk, page: talk.page + 1 };
    return;
  }
  const time = flight.clock;
  errands.gesture = time;
  if (talk.kind === "ask") {
    const offer = talk.offer;
    errands.offers.splice(errands.offers.indexOf(offer), 1);
    errands.carrying = offer;
    offer.giver.calling = false;
    offer.to.calling = true;
    say(`${offer.item} for ${offer.to.name} in ${VILLAGE_NAMES[offer.to.village]}. Follow the golden bird, then land beside them.`, time, 8);
    pickupSound();
  } else {
    const parcel = talk.offer;
    errands.carrying = null;
    errands.delivered++;
    parcel.to.calling = false;
    errands.lantern.push({ x: parcel.to.homeX, y: parcel.to.y + 3.4, z: parcel.to.homeZ });
    errands.burst = { x: parcel.to.x, y: parcel.to.y + 3, z: parcel.to.z };
    errands.offers.push(makeOffer(parcel.giver.village));
    say(oneOf(THANKS), time, 6);
    deliveredSound();
  }
  endTalk();
}

/** Says no for now. The parcel waits right where it is. */
export function answerNo() {
  if (errands.talk?.kind === "deliver") return;
  endTalk();
}

export function stepErrands(time: number) {
  if (errands.offers.length === 0 && !errands.carrying) setUp();
  if (!flight.flying) return;
  noticeSecrets(time);
}

/** A nudge when you're close to someone you could talk to. */
function nudge() {
  if (errands.talk) return "";
  const parcel = errands.carrying;
  const people = parcel ? [parcel.to] : errands.offers.map((o) => o.giver);
  for (const person of people) {
    const d = distanceTo(person);
    if (d > NOTICE_REACH) continue;
    if (flight.resting) {
      if (nearEnough(person)) return `F  Talk to ${person.name}`;
      return `Walk over to ${person.name} (W)`;
    }
    return parcel ? `${person.name} is waiting below. Land nearby (E) and walk over to hand it over.` : `${person.name} is waving with a parcel. Land nearby (E) and walk over to talk.`;
  }
  return "";
}

const found = new Set<string>();

/** A quiet note the first time you come across somewhere special. */
function noticeSecrets(time: number) {
  for (const place of secretPlaces()) {
    if (found.has(place.name) || Math.hypot(flight.pos.x - place.x, flight.pos.z - place.z) > place.reach) continue;
    found.add(place.name);
    say(place.name, time, 5);
  }
  const cave = flight.cave > 0.6 ? caveAt(flight.pos.x, flight.pos.z) : null;
  if (cave && !found.has(cave.cave.name)) {
    found.add(cave.cave.name);
    say(cave.cave.name, time, 5);
  }
}

export function captionNow(time: number) {
  const hint = nudge();
  if (hint) return hint;
  if (time < errands.captionUntil) return errands.caption;
  return errands.carrying ? `${errands.carrying.item} for ${errands.carrying.to.name} in ${VILLAGE_NAMES[errands.carrying.to.village]}` : "";
}
