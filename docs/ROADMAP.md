# SpiritVale roadmap

Living plan for the vertical slice. Later dungeon PRs should check off their step and add a Done line.

## Polish bar

Every step ships finished.

- Visual: matches the meadow and town, with readable materials and lighting. No z-fighting, floating props, or seams.
- Feel: tweened transitions and prompts that stay readable on phone and iPad.
- Audio: fitting royalty-free sound, quiet enough that later music and combat can sit with it.
- Gameplay: fair collisions, no softlocks, and a way back out.
- Tech: no console errors, tests on new logic, and a mobile-friendly budget (instanced repeats, few dynamic lights, shadows only where the device profile already allows them).

## Dungeon arc

- [x] 1. Dungeon entrance past town (E-to-enter, fade into a finished entry hall, way back out, `?at=dungeon`)
- [ ] 2. Dungeon zone layout: stone corridors, torch lighting, fog, collisions
- [ ] 3. 2–3 rooms connected by doors
- [ ] 4. Dungeon enemy roster pass 1 (skeleton melee rusher, slime swarm) with idle anims, tells, reactions
- [ ] 5. Dungeon enemy roster pass 2 (cultist ranged caster, golem tank)
- [ ] 6. Loot chests and reward moments
- [ ] 7. Mini-boss (unique model, multiple attack patterns, intro)
- [ ] 8. Boss with phases, intro, reward, and exit back to the overworld
- [ ] 9. Ambient audio pass and volume balance
- [ ] 10. Minimap support for the dungeon
- [ ] 11. Polish pass(es) as needed

## Done

- #84 — Step 1: north-wall crypt mouth, vignette into the entry hall, leave prompt, `?at=dungeon` debug spawn.

## Next step:

Step 2 — Dungeon zone layout: stone corridors, torch lighting, fog, collisions.

## Polish follow-ups

- The entry-hall radar is a single-room stand-in so the hero does not plot off the meadow map. Corridor cartography stays on step 10.
- The overworld still has no music bed, so the hall drone crossfades against silence. Step 9 should balance it against real overworld audio.
- Prompts still say “Press E” on touch, matching every other interact. The on-screen E button is the touch affordance.
- The postern is tied to the north curtain corners in `layout.ts`. If that wall run moves, the gap and the arch must move together.
- Inside the hall the sun stays on as a readable key so MeshToon bands are not crushed by the fog. A later lighting pass can replace it with baked torch light if mobile cost allows.
