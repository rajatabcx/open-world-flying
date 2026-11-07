# Game concept

Working title only. The game still needs its own name.

## The idea

An open-world game where people simply fly. This is a childhood idea: humans flying freely, with no physics to fight and nothing to worry about. It should feel relaxing, fun and chill.

## Rules of the game

- **Real flight, not gliding.** The wings let you fly and keep flying, for as long as you like. You never have to land.
- **No physics to master.** Flying should feel good, not realistic.
- **Start anywhere.** Begin on a mountaintop, or at the bottom and fly up.
- **Nothing is required.** Delivering things between homes or helping someone in need is there if you feel like it. Otherwise, just keep flying.
- **No pressure.** No challenges, races or mysteries, because tasks people can't finish only distract them.

## How flight works

Flying works like a bird's, but you can never fall out of the sky.

- **Flap** (W) to gain speed. Let go and you glide, slowly losing speed and sinking, down to a gentle minimum.
- **Flap up** (down arrow) with deep, strong beats. Climbing trades speed for height.
- **Dive** (up arrow) with wings tucked. It's the fastest way to fly, trading height for speed.
- **Boost** (Shift) flies level and straight at high speed.
- **Hover** (S to brake): you stand upright on the air, wings wide open, holding height with slow, heavy beats. Holds until you flap or boost. Keep holding S to drift backward.
- **Pack the wings away** (Q) to drop like a stone, head first. Any flying key throws them open again and turns the fall into a swoop. Fall all the way down and you land on your feet.
- **Trees, the ground and cave walls** are solid. Hitting one costs most of your speed and bounces you back a little, but it's never a failure. When the ground is coming up fast, a soft "Pull up" warning sounds first.

## In the world

- **Hot air balloons** to bounce off
- **Clouds** to fly through
- **Wind tunnels and rising air** that give you a boost. Each visit only a handful are blowing, a different few every time
- **Mountains** to start from or climb to
- **Homes** to deliver between

## Backstory

The island's water carries the **lume**, a faint glow you can see in the river after dark. It was there long before anyone lived here.

The first families arrived by boat, running from storms. They drank from the falls and woke up feeling lighter, and their children, raised on that water, leapt from rock to rock while the wind tugged at their sleeves as if it knew them. The old saying goes that the lume doesn't make you fly, it makes you listen: the wind was always talking, and the water taught people to hear it.

The cliff villages sewed sails, and for the spring festival they sewed wings, just for show. Then a girl called Amaranta jumped from the Serravento cliffs in a pair and didn't come down until supper. Generations followed, first gliding, then hopping between rooftops, then truly flying. The tinkerers of Serravento later built the wing packs that the wings fold into. The lume runs strongest in the caves behind the falls, where the crystals have been drinking it for a thousand years.

Everyone keeps an old promise: **what the island gives freely, we give freely**. That means the water, the wind and our help. People carry things for each other without pay, and whatever you learn in the sky, whether it's a new current, a hidden cave or a better way to land, you bring home and teach. Shipwrecked sailors get water and wings like anyone born here, and the young bring the sky in stories to those too old to fly.

Villagers tell this story a piece at a time, one piece per conversation, in order. The lines live in `game/lore.ts`.

## What's on the island now

Everything here is optional. There are no timers, scores or ways to fail.

### Controls added

| Key | Action |
|---|---|
| E | Land on the ground or a rooftop |
| On foot: W/↑, S/↓, A, D | Walk forward, step back, step left and right. ← → turn, Shift runs |
| On foot: Space | Take off again. It's the only key that does |
| P | Photo mode. Arrows move the camera, W and S zoom, Enter takes the photo |
| Q | Pack the wings away and drop, or open them again |
| F | Talk to someone you've landed beside |
| T | Move the day along |

### Deliveries

A golden glow marks someone holding a parcel, with a golden circle on the ground around them. Land nearby, walk up into the circle and talk to them (F). They share a piece of the island's story, then tell you what it is and who it's for, and you can say yes or not today. Once you've taken it, it stays with you: you can stop and rest anywhere, but you can't leave it somewhere. Follow the golden arrow at the top of the screen (and the golden bird), land near the person waiting, walk up and hand it over. They tell you a little more of the story too. A lantern then goes up by their door.

### Wings

The wings change shape and colour with how you're flying.

| Flight | Bird it copies | Wing |
|---|---|---|
| Gliding | Albatross | Long and pale-tipped |
| Climbing | Eagle | Broad with dark amber tips |
| Diving | Falcon | Narrow and swept back, with slate tips |
| Boosting | Swift | Slim with glowing gold tips |
| Hovering | None, a winged figure standing on the air | Fully spread and broad, with slow, heavy beats |
| Falling | | Packed away |
| Resting | | Packed away into the wing pack on your back |

### World

- **Land:** rolling hills, dunes, stepped rock, flat-topped mesas, farmed terraces, and fields of lavender, wheat and poppies.
- **Trees:** cypress, olive, stone pine, palm, almond blossom, lemon and oak. Each grows in its own groves, and trees near you use a detailed model.
- **The river:** it starts at the Hidden Falls and winds down the canyon to the sea, with a wind current following it.
- **Caves:** Behind the Falls, The Hollow Hill and The Long Dark. They're wide enough to glide through and hold glowing crystals and fireflies. The walls and roof are solid rock.
- **The Drowned Temple:** a ruin in clear shallow water.
- **Wind:** updrafts and balloons are placed automatically so they stay clear of the wind tunnels.

### Life

- **Villagers:** they stroll, then look up and wave as you pass.
- **Village life:** sheep, fishing boats, turning windmills and washing lines.
- **Company:** flocks join you for a while, and five other fliers sometimes fly beside you.

### Time and weather

- **Day and night:** a 12-minute cycle with sunset colours, stars, a moon, lit windows and lighthouse beams.
- **Showers:** a shower drifts across the island every few minutes. Leave it in daylight and a rainbow appears.

### Sound

All sound is generated in code.

- **Flight:** wind rises with speed, each wingbeat is audible, and a dive adds a rush.
- **Places:** the falls and rain have their own sound, spray hisses when you skim water, and caves echo.
- **Music:** it thins out and turns airy up high, and adds a warm plucked pattern near villages.

### Postcards

Photos become postcards named after the place. They're kept in this browser only, up to 24, and can be saved as image files.
