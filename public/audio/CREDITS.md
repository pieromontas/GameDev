# Audio credits

SpiritVale’s dungeon stingers are original synthesis, not ripped samples.

| Sound | Where | Source | License |
| --- | --- | --- | --- |
| Stone-door rumble / whoosh | Enter and leave the crypt | Generated in `src/audio/DungeonAudio.ts` (`playDoor`) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) — original work, dedicated to the public domain |
| Entry-hall ambience (low drone, air, occasional drip) | Loop while inside the entry hall | Generated in `src/audio/DungeonAudio.ts` | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) — original work, dedicated to the public domain |

No third-party audio files are vendored for this step. The overworld has no music bed yet; the hall loop crossfades against silence and is kept quiet (`~0.2` bed gain) so later combat and music can sit on top.
