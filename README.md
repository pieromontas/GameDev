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
| **RMB drag** | Rotate camera yaw |

## What’s in the slice

- Living meadow: vertex-colored / lightly displaced ground, winding dirt path, instanced grass tufts, flower clusters, tiered pines, mossy rocks, pond / sign / ruin / rim landmarks
- Articulated low-poly Warrior (leather + steel trim) with procedural idle / walk / Slash / Quake poses
- Expressive blob mobs with hop locomotion, attack wind-up + lunge, hit react, death squash
- Combat feedback: slash arcs, ground seals, Quake rings, floating damage numbers, world HP bars
- Tiny loot loop: defeated blobs drop coins; pickups increment an inventory counter
- HUD: HP, skill cooldowns, loot/kill counts, controls hint

## Project structure

```
src/
  main.ts                 Entry — boots Game
  style.css               HUD styles
  anim/ease.ts            Shared easing for procedural poses
  game/
    Game.ts               Scene wiring + systems orchestration
    loop.ts               rAF loop with fixed 60 Hz update
  input/InputManager.ts   Keyboard + pointer
  camera/FollowCamera.ts  Angled follow cam + optional yaw
  world/MeadowBiome.ts    Ground + props, play-area clamp
  entities/               Player, Mob, Loot, base Entity
  combat/                 Skills, CombatSystem, damage numbers
  render/stylized.ts      Toon materials, sky, palette, ground helpers
  ui/                     HUD + billboard health bars
  utils/math.ts           Small helpers
```

Stack: **Vite + TypeScript + three r170+**, ESM, modest draw-call reuse (shared geometries/materials + instanced grass).

## Design notes

- Camera stays locked behind/above the player (isometric-ish), never first-person
- Semi-fixed timestep (`1/60`) keeps combat timing stable under frame hitches
- Art is procedural / code-driven (no binary asset packs) so the slice stays portable
- Architecture is split so new classes, skills, or biomes can grow without a giant `main.ts`
- Intentionally single-player — polish the core loop before inventing multiplayer

## License

Prototype / learning project. SpiritVale is a trademark of its respective owners; this is an independent fan-inspired tech demo, not affiliated with the original game.
