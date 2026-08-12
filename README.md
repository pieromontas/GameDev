# SpiritVale Slice

A local single-player browser vertical slice inspired by [SpiritVale](https://store.steampowered.com/app/2683580/SpiritVale/) — class-based action RPG vibes, colorful low-poly meadows, angled follow camera, and readable real-time combat.

**Scope:** Warrior + Mage + **Rogue** starter classes (C/Tab cycle), one meadow biome with **east shrine**, **west misty grove**, **north ruins**, and **south river ford** clearings, blob + **Spitter** + **Armored Brute** mobs, loot pickups, **XP / leveling**, and a minimal HUD. No networking / MMO backend.

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
| **W A S D** / arrows | Move relative to camera |
| **Shift** | Dodge roll — short burst + brief i-frames (~1.55s cooldown) |
| **C** or **Tab** | Cycle class (**Warrior → Mage → Rogue → Warrior…**) |
| **E** | Interact — awaken east shrine / open treasure chests / drink from healing spring (when near) |
| **LMB** or **1** | Skill 1 (Slash / Arcane Bolt / Stab) |
| **2** | Skill 2 (Quake / Frost Nova / Fan of Knives) |
| **3** | Skill 3 (Shield Bash / Arcane Ward / Smoke Bomb) |
| **4** | Skill 4 (Leap Strike / Meteor / Shadow Leap) — unlocks at **Level 3** |
| **RMB drag** | Rotate camera yaw |

HUD skill names and the class line update when you switch. Slot 4 stays grayed with a **Lv 3** hint until you level up. A compact **Dodge** cooldown pip sits next to the skill row. A controls hint also lists **Shift — dodge roll**, **C / Tab — cycle Warrior → Mage → Rogue**, **E — shrine / treasure chests / healing spring**, the west misty grove path, the **north ruins** path (healing spring), and the **south river ford** path. A **north-up minimap** (top-right radar) tracks your facing arrow, the four pocket landmarks, chests, the healing spring, and nearby enemies.

## Treasure chests

Three one-shot **low-poly treasure chests** sit in readable spots: meadow pond edge, south river ford camp, and west misty grove. Walk up and press **E** (“Press E — Open Chest”):

- **Reward** — **+18 XP**, **+3 gold coins**, and a small heal
- **Feedback** — loot toast + floating XP; lid hinges open with a warm inner glow (closed chests show a gold lock glitter)
- **No farming** — opened chests stay open for the session

Works for Warrior, Mage, and Rogue. Chests are clear of the east shrine interactable.

## South river ford

Follow the dirt path **south** from the main meadow to a fifth reachable clearing. Landmark: a **shallow river ford** with **stepping stones**, **reeds**, and a **broken cart / camp remnant** (distinct from the east shrine tower, west fairy ring, and north ruins gate). **2 blobs + 2 spitters + 1 Armored Brute** patrol the riverside. Play-area clamp includes the south corridor + clearing — fully walkable. No new objective this cycle; explore and fight.

## North ruins

Follow the dirt path **north** from the main meadow to a fourth reachable clearing. Landmark: a **crumbled gate**, **broken columns**, and a **rubble courtyard** (distinct from the east shrine tower and west fairy ring). **2 blobs + 2 spitters + 1 Armored Brute** patrol the ruins. Play-area clamp includes the north corridor + clearing — fully walkable.

### Healing spring

A stylized **healing spring / fountain** sits in the ruins courtyard. Walk up and press **E** (“Press E — Drink from Spring”):

- **Heal** — full HP restore (Warrior, Mage, and Rogue)
- **Feedback** — rising sparkle / glow burst + HUD toast with HP gained
- **Cooldown** — **60s** rest; prompt shows `Healing Spring cooling… Xs` while unavailable; basin glow stays muted until ready
- Clear of the east shrine and treasure chests; E-priority is chest → spring → shrine if prompts ever overlap

## West misty grove

Follow the dirt path **west** from the main meadow to a second reachable clearing. Landmark: a **fallen giant tree**, **fairy-ring mushrooms**, and soft mist volumes (distinct from the east shrine tower). **2 blobs + 2 spitters + 1 Armored Brute** patrol the grove. Play-area clamp includes the west corridor + clearing — fully walkable. No new objective this cycle; explore and fight.

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

- Living meadow: expanded play ring (~30% more reach), vertex-colored / lightly displaced ground, winding dirt path, instanced grass tufts, flower clusters, **KayKit Forest** trees / rocks / bushes + **KayKit Medieval** cottage / windmill / well (toon-remapped GLTF; procedural fallback), pond / sign / ruin / rim landmarks, **east shrine** + **west misty grove** + **north ruins** + **south river ford** clearings, plus small outer-ring standing stones / wayside cairn
- **North ruins**: dirt path north → crumbled gate + broken columns + rubble courtyard; blobs/spitters/**Armored Brute**; play clamp extended
- **West misty grove**: dirt path west → fallen giant tree + fairy ring + mist; blobs/spitters/**Armored Brute**; play clamp extended
- **East shrine mini-objective**: interact (E) → defend 3 waves → temporary damage/speed blessing + loot; crystal activates with cooldown; static **Armored Brute** also patrols the clearing
- KayKit Knight / Mage / **Rogue** (GLTF) with Idle / Walk / Run + skill clips via three.js `AnimationMixer`
- Expressive blob mobs with hop locomotion, attack wind-up + lunge, hit react, stun daze, frost slow, death squash
- **Spitter** enemies (acid-green, spiked snout) that kite and fire slow spit projectiles — meadow + east shrine + west grove + north ruins
- **Armored Brute** enemies (rust/bronze tank) with slow chase, high HP, telegraphed ground-slam AoE — east shrine + west grove + north ruins only
- Combat feedback: slash arcs, bolts, ground seals, Quake/Nova/Fan rings, Shield Bash pulse, Arcane Ward / Smoke Bomb bubbles, Leap / Shadow Leap trail/landing, Meteor telegraph + sky drop, Brute slam shockwaves, floating damage numbers, world HP bars
- Tiny loot loop: defeated blobs/spitters drop coins; **brutes drop 3**; pickups increment an inventory counter
- **XP / leveling**: kills grant XP (blob 8 / spitter 14 / **brute 28**); HUD Level + XP bar; level-up toast + FX with permanent HP/damage bumps (session-persistent); **Level 3 unlocks skill 4**
- **Dodge roll** (Shift): shared by Warrior / Mage / Rogue — short burst in move/facing direction, brief i-frames, ~1.55s cooldown + HUD pip
- HUD: HP, Level/XP, active class + switch hint, skill cooldowns (1/2/3/4) with locked Lv 3 state, dodge cooldown pip, loot/kill counts, **north-up minimap** (player arrow + pocket/chest markers + enemy dots), shrine prompt/objective banner, blessing chip, controls hint, brief model loading overlay

## World props (KayKit Forest + Medieval Hexagon)

| | Nature | Village |
| --- | --- | --- |
| **Pack** | [KayKit – Forest Nature Pack](https://kaylousberg.itch.io/kaykit-forest) | [KayKit – Medieval Hexagon Pack](https://kaylousberg.itch.io/kaykit-medieval-hexagon) |
| **Author** | Kay Lousberg ([kaylousberg.com](https://www.kaylousberg.com)) | same |
| **License** | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | same |
| **Files** | `public/models/kaykit-forest/` — curated `Tree_*` / `Rock_*` / `Bush_*` GLTF + `forest_texture.png` (+ `LICENSE.txt`, `ATTRIBUTION.md`) | `public/models/kaykit-medieval/` — `building_home_A_green`, `building_windmill_green`, `building_well_green` + `hexagons_medieval.png` (+ license/attribution) |
| **Integration** | `WorldPropLibrary.ts` → `MeadowBiome.applyPropPack()` (trees / rocks / bushes) | same (`createCottage` / `createWindmill` / `createWell`) |

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
public/models/kaykit-medieval/ KayKit Medieval cottage/windmill/well (curated) + license
src/
  main.ts                 Entry — boots Game (awaits prop + hero loads)
  style.css               HUD + loading overlay styles
  anim/ease.ts            Shared easing (mobs / VFX)
  game/
    Game.ts               Scene wiring + systems orchestration
    loop.ts               rAF loop with fixed 60 Hz update
  input/InputManager.ts   Keyboard + pointer
  camera/FollowCamera.ts  Angled follow cam + optional yaw
  world/MeadowBiome.ts    Ground + props, play-area clamp
  world/WorldPropLibrary.ts  KayKit prop GLTF loader + toon remap
  entities/               Player, PlayerVisual, Mob, Spitter, ArmoredBrute, SpitProjectile, Loot, Entity
  combat/                 Skills, CombatSystem, damage numbers
  render/stylized.ts      Toon materials, sky, palette, ground helpers
  ui/                     HUD + billboard health bars
  utils/math.ts           Small helpers
```

Stack: **Vite + TypeScript + three r170+**, ESM, modest draw-call reuse (shared geometries/materials + instanced grass + cloned KayKit prop templates).

## Design notes

- Camera stays locked behind/above the player (isometric-ish), never first-person
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
