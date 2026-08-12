# SpiritVale Slice

A local single-player browser vertical slice inspired by [SpiritVale](https://store.steampowered.com/app/2683580/SpiritVale/) — class-based action RPG vibes, colorful low-poly meadows, angled follow camera, and readable real-time combat.

**Scope:** Warrior + Mage starter classes (switchable), one meadow biome, blob + **Spitter** mobs, loot pickups, and a minimal HUD. No networking / MMO backend.

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

## Controls

| Input | Action |
| --- | --- |
| **W A S D** / arrows | Move relative to camera |
| **C** or **Tab** | Switch class (Warrior ↔ Mage) |
| **LMB** or **1** | Skill 1 (Slash / Arcane Bolt) |
| **2** | Skill 2 (Quake / Frost Nova) |
| **3** | Skill 3 (Shield Bash / Arcane Ward) |
| **RMB drag** | Rotate camera yaw |

HUD skill names and the class line update when you switch. A controls hint also lists **C — switch Warrior / Mage**.

## Classes

### Warrior
- **Slash** — short-range melee
- **Quake** — short-cooldown ground AoE
- **Shield Bash** — forward stun + knockback

### Mage
- **Arcane Bolt** — longer-range single-target bolt
- **Frost Nova** — AoE burst that chills (slows) blobs
- **Arcane Ward** — personal bubble (brief i-frames + small heal)

## What’s in the slice

- Living meadow: vertex-colored / lightly displaced ground, winding dirt path, instanced grass tufts, flower clusters, tiered pines, mossy rocks, pond / sign / ruin / rim landmarks, east shrine clearing
- KayKit Knight warrior + KayKit Mage (GLTF) with Idle / Walk / Run + skill clips via three.js `AnimationMixer`
- Expressive blob mobs with hop locomotion, attack wind-up + lunge, hit react, stun daze, frost slow, death squash
- **Spitter** enemies (acid-green, spiked snout) that kite and fire slow spit projectiles — meadow + east shrine
- Combat feedback: slash arcs, bolts, ground seals, Quake/Nova rings, Shield Bash pulse, Arcane Ward bubble, floating damage numbers, world HP bars
- Tiny loot loop: defeated blobs/spitters drop coins; pickups increment an inventory counter
- HUD: HP, active class + switch hint, skill cooldowns (1/2/3) with class-specific names, loot/kill counts, controls hint, brief model loading overlay

## Character art (KayKit Adventurers)

| | Warrior | Mage |
| --- | --- | --- |
| **Pack** | [KayKit – Character Pack: Adventurers](https://kaylousberg.itch.io/kaykit-adventurers) | same |
| **Author** | Kay Lousberg ([kaylousberg.com](https://www.kaylousberg.com)) | same |
| **License** | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | same |
| **Files** | `public/models/kaykit-knight/Knight.glb` (+ `LICENSE.txt`, `ATTRIBUTION.md`) | `public/models/kaykit-mage/Mage.glb` (+ `LICENSE.txt`, `ATTRIBUTION.md`) |
| **Integration** | `src/entities/PlayerVisual.ts` (`WARRIOR_VISUAL`) | `src/entities/PlayerVisual.ts` (`MAGE_VISUAL`) |

**Clip mapping**

| Gameplay | Warrior (KayKit) | Mage (KayKit) |
| --- | --- | --- |
| Idle | `Idle` | `Idle` |
| Walk / Run | `Walking_A` / `Running_A` | `Walking_A` / `Running_A` |
| Skill 1 | `1H_Melee_Attack_Slice_Horizontal` | `Spellcast_Shoot` |
| Skill 2 | `Jump_Full_Short` + stomp juice | `Spellcast_Long` + cast lift |
| Skill 3 | `Block_Attack` + shield shove | `Spellcast_Raise` + ward bubble |

Warrior props: `1H_Sword`, `Round_Shield`, `Knight_Helmet`, `Knight_Cape`.  
Mage props: `1H_Wand`, `Spellbook`, `Mage_Hat`, `Mage_Cape` (staff / open book hidden).

### Swapping / adding classes later

1. Drop a new GLB under `public/models/<pack>/`.
2. Add a `VisualConfig` in `src/entities/PlayerVisual.ts` and wire it in `Player`.
3. Add skill defs in `src/combat/Skills.ts` and combat branches in `CombatSystem`.
4. Keep `Player` gameplay APIs (`applyMovement`, `playSlash` / `playQuake` / `playBash`, skills, radius) stable so HUD/combat stay intact.
5. Document the pack + license next to the files (mirror the Knight/Mage folders).

If a GLB fails to load, the game still boots (contact shadow / other class) and logs a clear console error — no softlock.

## Project structure

```
public/models/kaykit-knight/  KayKit Knight.glb + license/attribution
public/models/kaykit-mage/    KayKit Mage.glb + license/attribution
src/
  main.ts                 Entry — boots Game (awaits hero loads)
  style.css               HUD + loading overlay styles
  anim/ease.ts            Shared easing (mobs / VFX)
  game/
    Game.ts               Scene wiring + systems orchestration
    loop.ts               rAF loop with fixed 60 Hz update
  input/InputManager.ts   Keyboard + pointer
  camera/FollowCamera.ts  Angled follow cam + optional yaw
  world/MeadowBiome.ts    Ground + props, play-area clamp
  entities/               Player, PlayerVisual, Mob, Spitter, SpitProjectile, Loot, Entity
  combat/                 Skills, CombatSystem, damage numbers
  render/stylized.ts      Toon materials, sky, palette, ground helpers
  ui/                     HUD + billboard health bars
  utils/math.ts           Small helpers
```

Stack: **Vite + TypeScript + three r170+**, ESM, modest draw-call reuse (shared geometries/materials + instanced grass).

## Design notes

- Camera stays locked behind/above the player (isometric-ish), never first-person
- Semi-fixed timestep (`1/60`) keeps combat timing stable under frame hitches
- Meadow / mobs stay procedural; hero visuals are free CC0 KayKit GLTF packs
- Architecture is split so new classes, skills, or biomes can grow without a giant `main.ts`
- Intentionally single-player — polish the core loop before inventing multiplayer

## License

Prototype / learning project. SpiritVale is a trademark of its respective owners; this is an independent fan-inspired tech demo, not affiliated with the original game.

Third-party character art: KayKit Adventurers Knight + Mage by Kay Lousberg, CC0 — see `public/models/kaykit-knight/` and `public/models/kaykit-mage/`.
