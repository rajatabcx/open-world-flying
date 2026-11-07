// The island's story, told a little at a time by the people you meet. Each conversation
// carries the next piece, so it unfolds in order the more you help out. Once it's all been
// told, people pick favourite bits to tell again.

export const LORE = [
  // The water.
  "Have you seen the river shimmer after dark? My grandmother called it the lume. It was in the island's water long before any of us were.",
  "The first families came here by boat, running from storms. They drank from the falls that first night and woke up feeling lighter. They thought it was only relief.",
  "Their children grew up on that water. They leapt from rock to rock like goats, and the wind tugged at their sleeves as if it knew their names.",
  "The old ones say the lume doesn't make you fly. It makes you listen. The wind was always talking. The water just taught us how to hear it.",
  // The first flights.
  "Back then the cliff villages sewed sails, and for the spring festival they sewed wings, just for show. Then a girl called Amaranta jumped from the Serravento cliffs in a pair, and didn't come down until supper.",
  "After Amaranta, nobody wore wings for show again. Every family had a pair drying by the door, mended and re-sewn each winter.",
  "It took generations. Gliding first, then hopping from roof to roof, then truly flying. My great-grandfather was the first to cross the whole island without touching the ground once.",
  "The wing packs came from the tinkerers of Serravento. Before that, we wore our wings folded on our backs like big, clumsy cloaks, and knocked over everyone's washing.",
  "Some say the lume runs strongest behind the falls, deep in the caves. The crystals there have been drinking it for a thousand years. That's why they glow.",
  // The promise.
  "There's an old promise, older than any of the villages: what the island gives us freely, we give freely. The water, the wind, and our help.",
  "That's why we carry things for each other. Nobody's paid for it. You carry my honey, someone carries your letter. It all comes back round.",
  "The other half of the promise is sharing. A new current, a hidden cave, a better way to land. Whatever you learn up there, you bring it home and teach it.",
  "When ships wreck on our rocks, we give the sailors water and wings, same as anyone born here. The lume was never ours to keep.",
  "When you're too old to fly, the young ones bring you the sky in stories. My grandfather hasn't left his chair in years, and he still knows every wind on the island.",
  "Drink from the river now and then. Not for the flying. Just to say thank you.",
];

let told = 0;

/** The next piece of the story, in order the first time through. */
export function nextLore(pick: () => number) {
  if (told < LORE.length) return LORE[told++];
  return LORE[Math.floor(pick() * LORE.length)];
}
