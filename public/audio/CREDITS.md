# Audio credits

SpiritVale’s dungeon stingers are original synthesis, not ripped samples.

| Sound | Where | Source | License |
| --- | --- | --- | --- |
| Stone-door rumble / whoosh | Enter and leave the crypt | Generated in `src/audio/DungeonAudio.ts` (`playDoor`) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) — original work, dedicated to the public domain |
| Entry-hall ambience (low drone, air, occasional drip) | Loop while inside the entry hall | Generated in `src/audio/DungeonAudio.ts` | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) — original work, dedicated to the public domain |

No third-party audio files are vendored. The overworld has no music bed yet; the hall loop crossfades against silence. The bed sits at `0.16` into a `0.8` master (about `0.13` at the speakers). The door stinger's noise and thump sum to `0.56` before that master (about `0.45`) so the door reads without clipping, and the drip stays under the bed. See `DUNGEON_MIX` in `src/audio/DungeonAudio.ts`.
