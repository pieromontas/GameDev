# SpiritVale Slice

A local single-player browser vertical slice inspired by [SpiritVale](https://store.steampowered.com/app/2683580/SpiritVale/) — class-based action RPG vibes, colorful low-poly meadows, angled follow camera, and readable real-time combat.

**Scope:** one Warrior starter class, one meadow biome, blob mobs, loot pickups, and a minimal HUD. No networking / MMO backend.

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
| **LMB** or **1** | Slash (basic attack) |
| **2** | Quake (short-cooldown AoE) |
| **3** | Shield Bash (forward stun + knockback) |
| **RMB drag** | Rotate camera yaw |

## What’s in the slice

- Living meadow: vertex-colored / lightly displaced ground, winding dirt path, instanced grass tufts, flower clusters, tiered pines, mossy rocks, pond / sign / ruin / rim landmarks
- KayKit Knight warrior (GLTF) with Idle / Walk / Run / Slash / Quake / Shield Bash clips via three.js `AnimationMixer`
- Expressive blob mobs with hop locomotion, attack wind-up + lunge, hit react, stun daze, death squash
- Combat feedback: slash arcs, ground seals, Quake rings, Shield Bash pulse, floating damage numbers, world HP bars
- Tiny loot loop: defeated blobs drop coins; pickups increment an inventory counter
- HUD: HP, skill cooldowns (1/2/3), loot/kill counts, controls hint, brief model loading overlay

## Character art (KayKit Knight)

| | |
| --- | --- |
| **Pack** | [KayKit – Character Pack: Adventurers](https://kaylousberg.itch.io/kaykit-adventurers) |
| **Author** | Kay Lousberg ([kaylousberg.com](https://www.kaylousberg.com)) |
| **License** | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) (public domain; free for personal & commercial use) |
| **Files** | `public/models/kaykit-knight/Knight.glb` (+ `LICENSE.txt`, `ATTRIBUTION.md`) |
| **Integration** | `src/entities/PlayerVisual.ts` loads the GLB, attaches under `Player`, maps clips to gameplay anim states |

**Clip mapping**

| Gameplay | KayKit clip |
| --- | --- |
| Idle | `Idle` |
| Walk / Run | `Walking_A` / `Running_A` |
| Slash | `1H_Melee_Attack_Slice_Horizontal` (time-scaled to the skill window) |
| Quake | `Jump_Full_Short` + light procedural root stomp |
| Shield Bash | `Block_Attack` + short forward root shove |

Visible props: `1H_Sword`, `Round_Shield`, `Knight_Helmet`, `Knight_Cape`. Extra bundled weapons/shields are hidden.

### Swapping the hero later

1. Drop a new GLB under `public/models/<pack>/`.
2. Update `MODEL_URL`, `CLIP`, `SHOW_PROPS` / `HIDE_PROPS`, and scale in `src/entities/PlayerVisual.ts`.
3. Keep `Player` gameplay APIs (`applyMovement`, `playSlash`, `playQuake`, `playBash`, skills, radius) unchanged so combat/HUD stay intact.
4. Document the new pack + license next to the files (mirror this section).

If the GLB fails to load, the game still boots (contact shadow only) and logs a clear console error — no softlock.

## Project structure

```
public/models/kaykit-knight/  KayKit Knight.glb + license/attribution
src/
  main.ts                 Entry — boots Game (awaits warrior load)
  style.css               HUD + loading overlay styles
  anim/ease.ts            Shared easing (mobs / VFX)
  game/
    Game.ts               Scene wiring + systems orchestration
    loop.ts               rAF loop with fixed 60 Hz update
  input/InputManager.ts   Keyboard + pointer
  camera/FollowCamera.ts  Angled follow cam + optional yaw
  world/MeadowBiome.ts    Ground + props, play-area clamp
  entities/               Player, PlayerVisual, Mob, Loot, Entity
  combat/                 Skills, CombatSystem, damage numbers
  render/stylized.ts      Toon materials, sky, palette, ground helpers
  ui/                     HUD + billboard health bars
  utils/math.ts           Small helpers
```

Stack: **Vite + TypeScript + three r170+**, ESM, modest draw-call reuse (shared geometries/materials + instanced grass).

## Design notes

- Camera stays locked behind/above the player (isometric-ish), never first-person
- Semi-fixed timestep (`1/60`) keeps combat timing stable under frame hitches
- Meadow / mobs stay procedural; the Warrior visual is a single free CC0 GLTF pack
- Architecture is split so new classes, skills, or biomes can grow without a giant `main.ts`
- Intentionally single-player — polish the core loop before inventing multiplayer

## License

Prototype / learning project. SpiritVale is a trademark of its respective owners; this is an independent fan-inspired tech demo, not affiliated with the original game.

Third-party character art: KayKit Adventurers Knight by Kay Lousberg, CC0 — see `public/models/kaykit-knight/`.
