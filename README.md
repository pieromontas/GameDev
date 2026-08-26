# SpiritVale Slice

A local single-player browser vertical slice inspired by [SpiritVale](https://store.steampowered.com/app/2683580/SpiritVale/) — class-based action RPG vibes, colorful low-poly meadows, angled follow camera, and readable real-time combat.

**Scope:** Warrior + Mage + **Rogue** starter classes (C/Tab cycle), one meadow biome with **east shrine**, **west misty grove**, **north ruins**, **south river ford** clearings, a **northeast city-gate** road spur, a compact **market district** town stub behind the gate, a short **residential street** beyond the market, and a compact **harbor / docks** stub off the market’s SE exit, blob + **Spitter** + **Armored Brute** mobs, loot pickups, **XP / leveling**, and a minimal HUD. No networking / MMO backend.

## Quick start

```bash
npm install
npm run dev
```

Open the URL Vite prints (default `http://localhost:5173`).

Production build:

```bash
npm run build
npm run preview   # optional local preview of dist/
```

Requires a modern Chromium-based browser (or current Firefox/Safari).

## Deploy to Azure Static Web Apps

1. Create a **Static Web App** in Azure and connect this GitHub repo (or rely on the workflow in `.github/workflows/azure-static-web-apps.yml`).
2. In the Azure portal, open the SWA → **Manage deployment token**, then add a GitHub Actions secret named `AZURE_STATIC_WEB_APPS_API_TOKEN` with that value.
3. Build output is Vite’s `dist/` (`app_location: "/"`, `output_location: "dist"`). Push to `main` (or open a PR) to deploy.

`staticwebapp.config.json` (repo root and `public/`, copied into `dist`) sets SPA `navigationFallback` to `/index.html` and MIME types for `.glb` / `.gltf`.

## Controls

| Input | Action |
| --- | --- |
| **W A S D** / **↑ ↓** | Move relative to camera (hold walks; a tap still steps) |
| **Shift** | Dodge roll — short burst + brief i-frames (~1.55s cooldown) |
| **C** or **Tab** | Cycle class (**Warrior → Mage → Rogue → Warrior…**) |
| **E** | Interact — awaken east shrine / open treasure chests / drink from healing spring / pick west grove herb / talk to the city gate guard / read market sign / talk to blacksmith / sip at the plaza fountain / read the plaza well / trade with market street vendor / browse the produce stall / peek the traveling cart / read the town notice board / rest at market inn / peek the market alley / read the docks catch crate / try a residential door / bless at the town chapel / talk to cottage merchant (when near) |
| **LMB** or **1** | Skill 1 (Slash / Arcane Bolt / Stab) |
| **2** | Skill 2 (Quake / Frost Nova / Fan of Knives) |
| **3** | Skill 3 (Shield Bash / Arcane Ward / Smoke Bomb) |
| **4** | Skill 4 (Leap Strike / Meteor / Shadow Leap) — unlocks at **Level 3** |
| **← →** / **[ ]** / **, .** | Rotate camera yaw (hold to turn) |
| **RMB drag** | Rotate camera yaw |
| **Mouse wheel** / trackpad pinch | Zoom camera in / out (clamped) |
| **-** / **=** or **PgUp** / **PgDn** | Zoom out / in (alternate) |
| **Phone browser** | Left stick move · right-drag look · on-screen **1–4** / **Dodge** / **E** (no WASD / RMB needed) |

On a phone browser (Chrome / Safari), coarse-pointer detection shows a left analog stick, right-half look drag (not an attack), and a lower-right **1–4 / Dodge / E** cluster. Desktop WASD, LMB attack, and RMB look stay unchanged. iPad Safari is supported — desktop-mode iPad (Request Desktop Website) still gets the overlay; `?touch=1` remains a force-preview. Phone / iPad uses a lower GPU profile (no MSAA, no shadows, fewer lights); Safari on iOS/iPadOS also caps pixel ratio at 1.0 and sizes the canvas from the visual viewport. Desktop quality is unchanged.

HUD skill names and the class line update when you switch. Slot 4 stays grayed with a **Lv 3** hint until you level up. A compact **Dodge** cooldown pip sits next to the skill row. A controls hint also lists **Shift — dodge roll**, **C / Tab — cycle Warrior → Mage → Rogue**, **E — shrine / treasure chests / healing spring / grove herb / gate guard / market / plaza fountain / plaza well / street vendor / produce stall / traveling cart / notice board / inn / alley / docks crate / home door / chapel / cottage merchant**, **← → / [ ] / , . — rotate camera**, **scroll / pinch / - = — camera zoom**, the west misty grove path (glowing herb), the **north ruins** path (healing spring), the **south river ford** path, the **northeast city-gate, market, homes & docks** roads, the **city gate guard**, the **market street vendor**, the **produce stall**, the **plaza traveling cart**, the **plaza notice board**, and the **NW cottage** merchant. A **north-up minimap** (top-right radar) tracks your facing arrow, the pocket landmarks, the **Gate**, gate guard accent, **Market** (fountain), street vendor stall, traveling cart, notice board, **Homes**, chapel, **Docks**, blacksmith, inn, chests, the healing spring, the west grove herb, the cottage shop, and nearby enemies. Hover a landmark pin to read its name beside the radar (e.g. Gate vs Ford vs Market).

## Treasure chests

Three one-shot **low-poly treasure chests** sit in readable spots: meadow pond edge, south river ford camp, and west misty grove. Walk up and press **E** (“Press E — Open Chest”):

- **Reward** — **+18 XP**, **+3 gold coins**, and a small heal
- **Feedback** — loot toast + floating XP; lid hinges open with a warm inner glow (closed chests show a gold lock glitter)
- **No farming** — opened chests stay open for the session

Works for Warrior, Mage, and Rogue. Chests are clear of the east shrine interactable.

## Cottage Merchant

A simple spend-gold shop at the **NW cottage** (rim landmark near the well). Walk up to the door / front and press **E** (“Press E — Cottage Merchant”):

- **Health Potion** — **6 gold**, instant **+50 HP** heal
- **Damage Charm** — **11 gold**, **+35% damage** for **45s** (HUD buff chip)
- **Feedback** — can’t-afford toast, purchase toast, top-right **Gold** counter updates
- **Close** — **E**, **Esc**, or the panel ✕; shop also closes if you walk away
- **E-priority** — chest → spring → grove herb → shrine → gate guard → blacksmith → plaza baker/tailor/apothecary → plaza fountain → plaza well → street vendor → produce stall → traveling cart → market sign → notice board → inn → alley → harbor catch crate → residential door → town chapel → merchant (merchant never blocks closer interactables)

Works for Warrior, Mage, and Rogue. Prices are reachable after opening a couple of chests. Distinct from the **market street vendor** (cheaper snack stall in the plaza).

## Market street vendor

First talk/trade townsfolk in the **market plaza** — a low-poly toon vendor at the **NW stall** (not the NW meadow cottage). Walk up and press **E** (“Press E — Street Vendor”):

- **Snack Bread** — **3 gold**, small heal (**+25 HP**)
- **Honey Nibble** — **4 gold**, tiny **+12% move speed** for **15s** (HUD buff chip)
- **Feedback** — can’t-afford toast, purchase toast, top-right **Gold** counter updates
- **Close** — **E**, **Esc**, or the panel ✕; stall also closes if you walk away
- Soft collision on the vendor body; fountain / street lanes stay open
- Minimap marks the stall with a small red accent (distinct from the cottage shop)

Works for Warrior, Mage, and Rogue. Prices are reachable after one chest.

## Town notice board

A stylized **wooden notice / bounty board** (twin posts, pinned papers, nails) sits on the **east plaza rim** between the SE + E stalls — clear of the fountain, street vendor, and forge pad. Walk up and press **E** (“Press E — Notice Board”):

- **Notices** — meadow-blob **bounty** (accept → track kills → turn in), east shrine defense call, and a “townsfolk coming soon” stub
- **Bounty** — **Accept** at the board (**E** or the panel button), kill **5 meadow blobs**, then **Claim** at the board for **8 gold + 40 XP** (toast + objective banner while active). One claim per browser session (`sessionStorage`); cannot farm infinitely
- **Close** — **E** (when no accept/claim action), **Esc**, or the panel ✕; board also closes if you walk away
- Soft collision on the board posts; plaza lanes stay open
- Minimap marks the board with a small parchment accent

Lightweight board HUD — not a full quest log. Distinct from the west-rim alley flavor board.

## Northeast city gate

Follow the **dirt/stone road northeast** from the main meadow to a readable **city gate** archway into the first town slice. Landmark: an intact **stone gate** with **banners in the wind** (large cloth on the arch face + flanking poles) and low flanking walls, plus a small stone plaza that continues into the market street. Light roadside posts on the approach. A **gate guard** NPC (toon townsfolk sentry with spear & shield — steel/teal kit, distinct from the plaza street vendor) stands beside the arch; soft collision keeps the walk-through open into market. Press **E** for a welcome / keep-the-peace toast (optional tiny “clear meadow blobs” progress if you’ve been fighting). Idle stance with a slight head-track when you’re close. Play-area clamp includes the NE corridor + gate plaza — walk the full road and stand under the gate. Minimap marks **Gate** plus a small teal guard accent; a signpost and discovery toast cue the Market District beyond the arch.

## City market district

Through the gate, a compact **market district** stub fills the first town pocket: a short **cobble/stone street** and plaza, **3 KayKit cottage shops** (street-facing facades at knight-correct scale, with hanging baker / apothecary / tailor trade signs and window flower boxes), a **central toon fountain** with **wooden benches** on the inner plaza cobble, **warm plaza lanterns** on the cobble rim, a **blacksmith workshop** (KayKit cottage + forge/anvil yard with light smoke/ember VFX), a **market inn / tavern** on the south rim (KayKit cottage + warm windows, hanging sign, outdoor tables/barrels, evening lanterns, a couple of chickens pecking in the yard), **stylized stall awnings**, crates, banners, and a well accent. A **street vendor** NPC tends the NW plaza stall (press **E** for a cheap snack shop — see above). A **west-rim produce stall** (pink awning, toast-only — no shop panel) sells flavor gourds, cloth, and trinkets (press **E** — `Produce stall`). A **parked traveling cart** sits on the **SE plaza cobble** (spice tarp, crate/barrel load — toast-only; press **E** — `Traveling cart`). A **hitching post and water trough** sit beside the cart on the street-side cobble. Press **E** at the baker, tailor, or apothecary door for toast-only flavor (`Bakery` / `Tailor` / `Apothecary`) — no shop panel or gold spend yet. Press **E** at the plaza fountain for a small free sip (`Drink` — **+10 HP**, **25s** cooldown; flavor-only if already full). Press **E** at the plaza well (near the bakery) for a flavor toast (`Town well`) — no heal (the fountain already sips). An east-rim **town notice / bounty board** lists light quest flavor (press **E** — see above). **Low curtain walls + corner towers** (gate-matching stone, optional wall banners) wrap parts of the market rim so the district feels enclosed and tied to the city gate — the **SW gate approach**, **far NE street** (homes), and **SE harbor** exits stay open (not a full box). A short **west-rim side alley** (narrow cobble lane with crates/barrels, a hanging clothesline, and a cat loafing on a crate) branches off the plaza; press **E** at the alley board for a flavor toast (`Back alley`). Soft collisions on building / stall / vendor / fountain / fountain-bench / plaza-lantern / forge / inn / wall / alley / notice-board / traveling-cart / hitching-post footprints keep the street walkable — gate→market path and fountain lanes stay clear. Plaza walk lanes were opened (fountain benches, plaza lanterns, hitching post, and alley/plaza crates nudged or colliders shrunk) so the knight can loop the fountain and walk gate → shops → inn → alley without scraping stacked footprints. Press **E** at the market sign or forge for flavor toasts (`Market District` / `Blacksmith`). At the inn door, press **E** for a **paid short rest** (**3 gold**, **+40 HP**, **45s** cooldown). No new combat or full smith shop UI here. Play clamp includes the gate→market corridor + market plaza. Minimap marks **Market** (plaza fountain) plus small blacksmith, inn, street-vendor, traveling-cart, and notice-board accents (in addition to Gate).

## Residential street

Past the market’s open **far-NE exit**, a short **residential street** stub continues the town diagonal: a cobble lane, **3 KayKit cottage homes** (street-facing, window flower boxes, soft house footprints), a **town chapel** landmark on the east rim (**KayKit church** with steeple — distinct from the east meadow shrine and market fountain), extra **street lanterns** and **fence** runs lining the cobble (warm modest lamps — not the market plaza set), a small **garden patch**, and a **well** accent. Soft collisions on house / chapel / fence / lamp-post footprints keep the street walkable — market → homes path stays clear. Press **E** at one cottage door for a flavor toast (`Locked — townsfolk later`). At the chapel door, press **E** for a free **town blessing** (**+22 HP**, brief mild damage favor, **40s** cooldown) — not the meadow shrine wave defend. Optional benches / lantern on the chapel apron. No new enemies. Play clamp includes the market→homes corridor + residential pocket. Minimap marks **Homes** plus a small chapel accent.

## Harbor docks

Past the market’s open **SE exit** (not the NE homes lane), a compact **harbor / docks** stub: a short stone/wood spur to a small **pier** with pilings, planks, crates, hanging nets, dock lanterns, and a couple of **moored boats**. Soft collisions on boats / crates / nets keep a walkable pier lane. Press **E** at the catch crate for a flavor toast (`Catch of the day later`). No new enemies or combat systems. Play clamp includes the market→docks corridor + docks pocket. Minimap marks **Docks** plus a small catch-crate accent.

## South river ford

Follow the dirt path **south** from the main meadow to a fifth reachable clearing. Landmark: a **shallow river ford** with **stepping stones**, **reeds**, and a **broken cart / camp remnant** (distinct from the east shrine tower, west fairy ring, and north ruins gate). **2 blobs + 2 spitters + 1 Armored Brute** patrol the riverside. Play-area clamp includes the south corridor + clearing — fully walkable. No new objective this cycle; explore and fight.

## North ruins

Follow the dirt path **north** from the main meadow to a fourth reachable clearing. Landmark: a **crumbled gate**, **broken columns**, and a **rubble courtyard** (distinct from the east shrine tower and west fairy ring). **2 blobs + 2 spitters + 1 Armored Brute** patrol the ruins. Play-area clamp includes the north corridor + clearing — fully walkable.

### Healing spring

A stylized **healing spring / fountain** sits in the ruins courtyard. Walk up and press **E** (“Press E — Drink from Spring”):

- **Heal** — full HP restore (Warrior, Mage, and Rogue)
- **Feedback** — rising sparkle / glow burst + HUD toast with HP gained
- **Cooldown** — **60s** rest; prompt shows `Healing Spring cooling… Xs` while unavailable; basin glow stays muted until ready
- Clear of the east shrine and treasure chests; E-priority is chest → spring → grove herb → shrine → merchant if prompts ever overlap

## West misty grove

Follow the dirt path **west** from the main meadow to a second reachable clearing. Landmark: a **fallen giant tree**, **fairy-ring mushrooms**, and soft mist volumes (distinct from the east shrine tower). **2 blobs + 2 spitters + 1 Armored Brute** patrol the grove. Play-area clamp includes the west corridor + clearing — fully walkable. No new objective this cycle; explore and fight.

### Grove herb

A small **glowing herb cluster** sits on the north rim of the misty grove (free world pickup — not the north spring or market heals). Walk up and press **E** (“Press E — Pick Grove Herb”):

- **Heal** — modest **+26 HP** (weak misty sip; not a full inn rest / spring restore)
- **Feedback** — plant disappears with a sparkle burst + HUD toast; prompt while depleted: `Grove herb regrowing… Xs`
- **Respawn** — **35s** cooldown, then the plant returns for another pickup
- Clear of the fairy ring, fallen trunk, and grove chest; E-priority sits after the healing spring and before the east shrine

## Armored Brute

A third enemy type — large rust/bronze armored silhouette (procedural toon mesh), clearly distinct from purple meadow blobs and acid-green Spitters.

- **Behavior** — slow chase, high HP tank; telegraphed **ground slam** (crouch wind-up + growing AoE ring → shockwave)
- **Spawn** — **1** in the east shrine clearing, **1** in the west misty grove, **1** in the north ruins, and **1** in the south river ford (none in the starter meadow)
- **Rewards** — **3 loot coins** and **+28 XP** on kill (richer than blobs / spitters); distinct toast: *“Armored Brute crushed!”*
- **CC** — Warrior Shield Bash stun/knockback, Mage Frost Nova slow, and Rogue skills all apply as with other mobs

Sidestep the slam ring during the wind-up, or interrupt with stun.

## East shrine objective

Follow the dirt path east to the ancient shrine clearing. Walk up to the crystal tower:

1. **Prompt** — “Press E — Awaken Shrine”
2. **Defend** — clear **3 waves** of blobs / spitters around the shrine (objective HUD tracks wave progress)
3. **Reward** — crystal brightens; **+40% damage** and **+22% move speed** for **45s**, plus a burst of loot coins
4. **Cooldown** — shrine rests **60s** after success (**18s** if you die mid-ritual) so it can’t be farmed infinitely

Ignoring the shrine leaves meadow combat fully playable. Works for Warrior, Mage, and Rogue.

## XP & leveling

Defeat blobs (**+8 XP**), spitters (**+14 XP**), and **Armored Brutes (+28 XP)** to level up. The HUD shows **Level** and an XP bar (e.g. `Level 1 · XP 0/20`). Floating **+XP** appears on kills; every few kills also flashes a toast.

On **level-up**: a clear toast + brief gold/green FX, permanent **+12 max HP** and **+1–2 damage** (alternating). Reaching **Level 3** unlocks skill 4 for all kits (toast announces Leap Strike / Meteor / Shadow Leap). Level, XP, and bonuses persist through respawn and class swaps for the session. Works for Warrior, Mage, and Rogue — higher levels feel a bit stronger against spitters without a full rebalance.

## Classes

### Warrior
- **Slash** — short-range melee
- **Quake** — short-cooldown ground AoE
- **Shield Bash** — forward stun + knockback
- **Leap Strike** *(Lv 3)* — gap-closer leap toward aim/facing + landing AoE

### Mage
- **Arcane Bolt** — longer-range single-target bolt
- **Frost Nova** — AoE burst that chills (slows) blobs
- **Arcane Ward** — personal bubble (brief i-frames + small heal)
- **Meteor** *(Lv 3)* — delayed sky-drop AoE in front of you (telegraph circle)

### Rogue
- **Stab** — snappy short-range poke
- **Fan of Knives** — radial AoE knife burst
- **Smoke Bomb** — brief dodge i-frames (escape window)
- **Shadow Leap** *(Lv 3)* — gap-closer leap + teal landing AoE

## What’s in the slice

- Living meadow: expanded play ring (~30% more reach), vertex-colored / lightly displaced ground, winding dirt path, instanced grass tufts, flower clusters, **KayKit Forest** trees / rocks / bushes + **KayKit Medieval** cottage / windmill / well / church (toon-remapped GLTF; procedural fallback), pond / sign / ruin / rim landmarks, **east shrine** + **west misty grove** + **north ruins** + **south river ford** clearings, **NE city gate + market district** (plaza fountain, fountain benches, blacksmith forge, market inn, street vendor stall, produce stall, traveling cart, hitching post + trough, notice board, curtain walls, side alley) + **residential street** (homes + town chapel), plus small outer-ring standing stones / wayside cairn
- **North ruins**: dirt path north → crumbled gate + broken columns + rubble courtyard; blobs/spitters/**Armored Brute**; play clamp extended
- **West misty grove**: dirt path west → fallen giant tree + fairy ring + mist; glowing herb pickup (E, modest heal + respawn); blobs/spitters/**Armored Brute**; play clamp extended
- **East shrine mini-objective**: interact (E) → defend 3 waves → temporary damage/speed blessing + loot; crystal activates with cooldown; static **Armored Brute** also patrols the clearing
- KayKit Knight / Mage / **Rogue** (GLTF) with Idle / Walk / Run + skill clips via three.js `AnimationMixer`
- Expressive blob mobs with hop locomotion, attack wind-up + lunge, hit react, stun daze, frost slow, death squash
- **Spitter** enemies (acid-green, spiked snout) that kite and fire slow spit projectiles — meadow + east shrine + west grove + north ruins
- **Armored Brute** enemies (rust/bronze tank) with slow chase, high HP, telegraphed ground-slam AoE — east shrine + west grove + north ruins only
- Combat feedback: slash arcs, bolts, ground seals, Quake/Nova/Fan rings, Shield Bash pulse, Arcane Ward / Smoke Bomb bubbles, Leap / Shadow Leap trail/landing, Meteor telegraph + sky drop, Brute slam shockwaves, floating damage numbers, world HP bars
- Tiny loot loop: defeated blobs/spitters drop coins; **brutes drop 3**; pickups increment **Gold**; spend at the **NW cottage merchant**
- **Cottage Merchant**: E at the NW cottage door → HUD shop (Health Potion / Damage Charm)
- **XP / leveling**: kills grant XP (blob 8 / spitter 14 / **brute 28**); HUD Level + XP bar; level-up toast + FX with permanent HP/damage bumps (session-persistent); **Level 3 unlocks skill 4**
- **Dodge roll** (Shift): shared by Warrior / Mage / Rogue — short burst in move/facing direction, brief i-frames, ~1.55s cooldown + HUD pip
- HUD: HP, Level/XP, active class + switch hint, skill cooldowns (1/2/3/4) with locked Lv 3 state, dodge cooldown pip, gold/kill counts, **north-up minimap** (player arrow + pocket/chest/cottage markers + enemy dots; hover pin for landmark name), shrine prompt/objective banner, blessing / charm chip, cottage shop panel, controls hint, brief model loading overlay

## World props (KayKit Forest + Medieval Hexagon)

| | Nature | Village |
| --- | --- | --- |
| **Pack** | [KayKit – Forest Nature Pack](https://kaylousberg.itch.io/kaykit-forest) | [KayKit – Medieval Hexagon Pack](https://kaylousberg.itch.io/kaykit-medieval-hexagon) |
| **Author** | Kay Lousberg ([kaylousberg.com](https://www.kaylousberg.com)) | same |
| **License** | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | same |
| **Files** | `public/models/kaykit-forest/` — curated `Tree_*` / `Rock_*` / `Bush_*` GLTF + `forest_texture.png` (+ `LICENSE.txt`, `ATTRIBUTION.md`) | `public/models/kaykit-medieval/` — `building_home_A_green`, `building_windmill_green`, `building_well_green`, `building_church_green` + `hexagons_medieval.png` (+ license/attribution) |
| **Integration** | `WorldPropLibrary.ts` → `MeadowBiome.applyPropPack()` (trees / rocks / bushes) | same (`createCottage` / `createWindmill` / `createWell` / `createChurch`); market shops + blacksmith + inn reuse cottage + well; residential chapel uses church |

Only the assets actually placed in the meadow are vendored (not the full packs). Materials are remapped to `MeshToonMaterial` (shared KayKit atlas + cel `gradientMap`) so they stay readable under the slice’s stylized lighting. Soft XZ obstacle radii are unchanged — shrine / chest interacts, paths, and play clamp are preserved. If prop GLTFs fail to load, procedural trees / rocks / cottage / windmill remain.

## Character art (KayKit Adventurers)

| | Warrior | Mage | Rogue |
| --- | --- | --- | --- |
| **Pack** | [KayKit – Character Pack: Adventurers](https://kaylousberg.itch.io/kaykit-adventurers) | same | same |
| **Author** | Kay Lousberg ([kaylousberg.com](https://www.kaylousberg.com)) | same | same |
| **License** | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | same | same |
| **Files** | `public/models/kaykit-knight/Knight.glb` (+ `LICENSE.txt`, `ATTRIBUTION.md`) | `public/models/kaykit-mage/Mage.glb` (+ license/attribution) | `public/models/kaykit-rogue/Rogue.glb` (+ license/attribution) |
| **Integration** | `PlayerVisual.ts` (`WARRIOR_VISUAL`) | `MAGE_VISUAL` | `ROGUE_VISUAL` |

**Clip mapping**

| Gameplay | Warrior (KayKit) | Mage (KayKit) | Rogue (KayKit) |
| --- | --- | --- | --- |
| Idle | `Idle` | `Idle` | `Idle` |
| Walk / Run | `Walking_A` / `Running_A` | `Walking_A` / `Running_A` | `Walking_A` / `Running_A` |
| Skill 1 | `1H_Melee_Attack_Slice_Horizontal` | `Spellcast_Shoot` | `1H_Melee_Attack_Stab` |
| Skill 2 | `Jump_Full_Short` + stomp juice | `Spellcast_Long` + cast lift | `2H_Melee_Attack_Spin` + knife fan |
| Skill 3 | `Block_Attack` + shield shove | `Spellcast_Raise` + ward bubble | `Dodge_Forward` + smoke cloud |
| Skill 4 | `Jump_Full_Long` + leap arc | `Spellcasting` + Meteor telegraph | `Jump_Full_Long` + shadow leap |
| Dodge (Shift) | `Dodge_Forward` + lean | `Dodge_Forward` + lean | `Dodge_Forward` + lean |

Warrior props: `1H_Sword`, `Round_Shield`, `Knight_Helmet`, `Knight_Cape`.  
Mage props: `1H_Wand`, `Spellbook`, `Mage_Hat`, `Mage_Cape` (staff / open book hidden).  
Rogue props: `Knife`, `Knife_Offhand`, `Rogue_Cape` (crossbows / throwable hidden).

### Swapping / adding classes later

1. Drop a new GLB under `public/models/<pack>/`.
2. Add a `VisualConfig` in `src/entities/PlayerVisual.ts` and wire it in `Player`.
3. Add skill defs in `src/combat/Skills.ts` and combat branches in `CombatSystem`.
4. Keep `Player` gameplay APIs (`applyMovement`, `tryDodge`, `playSlash` / `playQuake` / `playBash` / `playBurst`, skills, radius) stable so HUD/combat stay intact.
5. Document the pack + license next to the files (mirror the Knight/Mage/Rogue folders).

If a GLB fails to load, the game still boots (contact shadow / other classes) and logs a clear console error — no softlock. Class swap mid-leap cancels the in-flight gap-closer so WASD never softlocks.

## Project structure

```
public/models/kaykit-knight/   KayKit Knight.glb + license/attribution
public/models/kaykit-mage/     KayKit Mage.glb + license/attribution
public/models/kaykit-rogue/    KayKit Rogue.glb + license/attribution
public/models/kaykit-forest/   KayKit Forest Nature trees/rocks/bushes (curated) + license
public/models/kaykit-medieval/ KayKit Medieval cottage/windmill/well/church (curated) + license
src/
  main.ts                 Entry — boots Game (awaits prop + hero loads)
  style.css               HUD + loading overlay styles
  anim/ease.ts            Shared easing (mobs / VFX)
  game/
    Game.ts               Scene wiring + systems orchestration
    loop.ts               rAF loop with fixed 60 Hz update
  input/InputManager.ts   Keyboard + pointer + touch axes / virtual taps
  input/TouchControls.ts  Phone overlay — left stick, right-drag look, 1–4 / Dodge / E
  camera/FollowCamera.ts  Angled follow cam + yaw + smooth zoom
  world/MeadowBiome.ts    Ground + props, play-area clamp, gate + market + homes + docks
  world/WorldPropLibrary.ts  KayKit prop GLTF loader + toon remap
  world/CottageMerchant.ts   NW cottage spend-gold shop (E interact)
  world/MarketDistrict.ts    NE market sign + blacksmith + plaza shop doors + plaza fountain sip + plaza well toast + produce stall + traveling cart + notice board + inn + alley interacts (E)
  world/MarketStreetVendor.ts Market plaza street-vendor snack shop (E)
  world/GateGuard.ts         NE city gate sentry flavor dialogue (E)
  world/ResidentialStreet.ts Homes door + town chapel interacts (E)
  world/HarborDocks.ts       Harbor pier catch-crate flavor interact (E)
  world/TreasureChests.ts Treasure chest interact + rewards
  world/HealingSprings.ts Healing spring interact
  world/GroveHerbs.ts     West grove herb pickup interact
  world/ShrineObjective.ts East shrine defend objective
  entities/               Player, PlayerVisual, Mob, Spitter, ArmoredBrute, GroveHerb, SpitProjectile, Loot, Entity
  combat/                 Skills, CombatSystem, damage numbers
  render/stylized.ts      Toon materials, sky, palette, ground helpers
  render/deviceQuality.ts Phone/iPad GPU cap (MSAA / shadows / lights; Safari DPR 1.0)
  ui/                     HUD + billboard health bars
  utils/math.ts           Small helpers
```

Stack: **Vite + TypeScript + three r170+**, ESM, modest draw-call reuse (shared geometries/materials + instanced grass + cloned KayKit prop templates).

## Design notes

- Camera stays locked behind/above the player (isometric-ish), never first-person; wheel zoom is distance-clamped so it never becomes FPS or sky-cam
- Semi-fixed timestep (`1/60`) keeps combat timing stable under frame hitches
- Heroes + prominent meadow props use free CC0 KayKit GLTF packs; pocket landmarks / mobs stay procedural where packs don’t clearly win
- Architecture is split so new classes, skills, or biomes can grow without a giant `main.ts`
- Intentionally single-player — polish the core loop before inventing multiplayer

## License

Prototype / learning project. SpiritVale is a trademark of its respective owners; this is an independent fan-inspired tech demo, not affiliated with the original game.

Third-party art (all Kay Lousberg / KayKit, CC0):
- Adventurers Knight + Mage + Rogue — `public/models/kaykit-knight/`, `kaykit-mage/`, `kaykit-rogue/`
- Forest Nature (selected trees / rocks / bushes) — `public/models/kaykit-forest/`
- Medieval Hexagon (selected cottage / windmill / well) — `public/models/kaykit-medieval/`
