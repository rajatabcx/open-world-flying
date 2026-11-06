# Research: reference game and free 3D assets

Researched 2026-11-07.

## Reference game: Laya's Horizon

Built by Snowman (Toronto, makers of the Alto games). Published by Netflix for iOS and Android on May 2, 2023, for subscribers only. Development began in 2018 and peaked at about 30 developers. Coverage did not name the engine.

### How it plays

- **Core loop:** glide from mountain peaks down to the coast of a small open-world island. A run lasts a few minutes, then you return to the last peak.
- **Controls:** two thumbs, one for each side of the wingsuit. Slide them up and down to steer, climb and dive, and slide them together to boost.
- **Speed:** flying close to surfaces or doing tricks earns "sparks", which speed you up. Updrafts and wind tunnels also add speed.
- **Forgiveness:** the first collision only bounces you, and the shield restores after a few seconds of clean flying. There is also an air cushion near terrain, landing spots and a time rewind.
- **Braking:** the cape opens like a parachute. Earlier braking designs failed.
- **Progression:** goals come in sets of three, such as flying near 20 trees or through a windmill. Finishing a set unlocks a cape that handles differently.
- **Missions:** NPCs called Windfolk offer races, reach-a-spot-with-50-sparks runs, bird chases and follow runs. These award trinkets that add abilities.
- **World:** hand-placed, with named regions such as the Highlands and Stone Forest. Mission design depends heavily on terrain slope, because slope is what makes flight feel good.
- **Tone:** peaceful, no plot or conflict, one-time payment with no ads. The screen stays sparse while flying.
- **Music:** folk and woodwind score by Wobblersound that adapts to speed and altitude.
- **Length:** 20 to 40 hours for new players, by Snowman's estimate.

### Reception and where it falls short

Reviews were strong: 5/5 TouchArcade, 4.5/5 Pocket Gamer, 9.5/10 IGN India. Reviewers praised the feel of mastering flight.

Most of these criticisms come from one review (Adrian Hon), so treat them as leads and not as consensus:

| Weakness | How we could beat it |
|---|---|
| Boost and dive were unreliable on thumb gestures | Keep gesture controls, and add a dedicated boost input plus keyboard and gamepad |
| Mandatory flight summary slows restarts and punishes risky tricks | Restart instantly, with the summary optional |
| Touchscreen only, behind a Netflix subscription | Runs in any browser, with no install or subscription |
| The cape only glides, it can't flap | Consider a limited flap or thermal-climb move |
| Sparse UI can leave players lost, such as stuck searching for one house | Use in-world guides like birds, wind ribbons or smoke |
| Art and music were compared closely to *Journey* | Commit to a distinct Mediterranean palette and sound |

### Keep it original

Borrow the genre and general mechanics: wingsuit gliding, proximity speed, unlockable gear. Do not reuse its name, character, Windfolk, sparks, trinkets, capes as designed, map, art, music or levels. Before release, the game needs its own title and hero, and this repo's working name should not ship.

## Free 3D assets

Check the license on each download page, because licenses vary per model on Poly Pizza.

- **CC0:** free for commercial use, no credit required.
- **CC BY:** free for commercial use, but credit is required on an in-game credits screen.

### Sources

| Source | License | Formats | Best for |
|---|---|---|---|
| [Quaternius, Ultimate Stylized Nature](https://quaternius.com/packs/ultimatestylizednature.html) | CC0 | FBX, OBJ, Blend, glTF | 63 textured nature models |
| [Quaternius, Medieval Village MegaKit](https://quaternius.com/packs/medievalvillagemegakit.html) | CC0 | FBX, OBJ, Blend, glTF | 300+ modular building pieces |
| [Quaternius, Ultimate Nature Pack](https://quaternius.com/packs/ultimatenature.html) | CC0 | FBX, OBJ, Blend | 150 untextured models, recolor to fit |
| [Kenney, Nature Kit](https://kenney.nl/assets/nature-kit) | CC0 | Not stated on page | Trees, rocks, foliage |
| [Kenney, Fantasy Town Kit](https://kenney.nl/assets/fantasy-town-kit) | CC0 | Not stated on page | Town pieces, 160 files |
| [Poly Haven](https://polyhaven.com/license) | CC0 | Not checked | Textures, skies (HDRIs), models |
| [Poly Pizza](https://poly.pizza) | Per model | OBJ or FBX, plus glTF | Single props, searchable |

### Specific items

| Need | Model | Author | License |
|---|---|---|---|
| Mediterranean house | [SeaSide Villa](https://poly.pizza/m/03rq-iA54uU) | Yogoshimo 2.0 | CC BY 3.0 |
| Cypress tree | [Cypress Tree](https://poly.pizza/m/eUQDPAFMQfv) | Poly by Google | CC BY 3.0 |
| Hot air balloon | [Hot air balloon](https://poly.pizza/m/7Fej0Jd3_Di) | Poly by Google | CC BY 3.0 |
| Hot air balloon, alternate | [Hot Air Balloon](https://poly.pizza/m/ascrGCCFjFx) | jeremy | CC BY 3.0 |
| Bird | [Bird](https://poly.pizza/m/gYYC0gYMnw) | Quaternius | CC0 |
| Seagull | [Flying gull](https://poly.pizza/m/eMNhHDZakYp) | Poly by Google | CC BY 3.0 |
| Cloud | [Cloud](https://poly.pizza/m/KdFNOVn1Gf) | Quaternius | CC0 |

### Gaps

- **Mediterranean houses:** no CC0 set turned up. Recommended approach: build them in code from whitewashed boxes, terracotta roofs and arches. That gives instancing and variety, and a look nobody else has.
- **Cloaks and capes:** no free cape model was searched for specifically. A cape is better as a simulated or shader-animated mesh of our own, since the hero's silhouette should be original anyway.
- **Bird animation:** the pages don't say whether these birds are animated. A vertex shader wing flap handles this cheaply for whole flocks.
- **Visual check:** models were checked for license and format only, not looks or triangle count.

## Sources

- [Wikipedia: Laya's Horizon](https://en.wikipedia.org/wiki/Laya%27s_Horizon)
- [Adrian Hon's review](https://adrianhon.substack.com/p/layas-horizon)
- [Pocket Gamer developer interview](https://www.pocketgamer.com/layas-horizon/dev-interview)
- [MobileSyrup](https://mobilesyrup.com/2023/05/02/layas-horizon-toronto-based-snowmans-most-ambitious-game-yet/)
- [Snowman on Medium](https://builtbysnowman.medium.com/the-creative-minds-behind-layas-horizon-1386695e33af) (seen as a search excerpt only, the page blocked direct reading)
- [TouchArcade review](https://toucharcade.com/2023/06/19/layas-horizon-review-netflix-games-mobile-iphone-android-ipad/) (seen as a search excerpt only, the page blocked direct reading)
