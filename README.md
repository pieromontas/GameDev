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

- Bright meadow playground with stylized trees, rocks, and flowers (procedural meshes — no binary assets)
- Capsule-style Warrior with hit flashes and cooldowns
- Cute blob AI: aggro → chase → attack, death + respawn
- Combat feedback: skill FX rings/slashes, floating damage numbers, world HP bars
- Tiny loot loop: defeated blobs drop coins; pickups increment an inventory counter
- HUD: HP, skill cooldowns, loot/kill counts, controls hint

## Project structure

```
src/
  main.ts                 Entry — boots Game
  style.css               HUD styles
  game/
    Game.ts               Scene wiring + systems orchestration
    loop.ts               rAF loop with fixed 60 Hz update
  input/InputManager.ts   Keyboard + pointer
  camera/FollowCamera.ts  Angled follow cam + optional yaw
  world/MeadowBiome.ts    Ground + props, play-area clamp
  entities/               Player, Mob, Loot, base Entity
  combat/                 Skills, CombatSystem, damage numbers
  ui/                     HUD + billboard health bars
  utils/math.ts           Small helpers
```

Stack: **Vite + TypeScript + three r170+**, ESM, modest draw-call reuse (shared geometries/materials).

## Design notes

- Camera stays locked behind/above the player (isometric-ish), never first-person
- Semi-fixed timestep (`1/60`) keeps combat timing stable under frame hitches
- Architecture is split so new classes, skills, or biomes can grow without a giant `main.ts`
- Intentionally single-player — polish the core loop before inventing multiplayer

## License

Prototype / learning project. SpiritVale is a trademark of its respective owners; this is an independent fan-inspired tech demo, not affiliated with the original game.
