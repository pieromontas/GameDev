import { describe, expect, it } from 'vitest';
import { DUNGEON_MIX, DungeonAudio } from './DungeonAudio';

type FakeParam = {
  value: number;
  setValueAtTime: (value: number) => void;
  exponentialRampToValueAtTime: (value: number) => void;
  linearRampToValueAtTime: (value: number) => void;
  cancelScheduledValues: () => void;
};

function param(initial = 0): FakeParam {
  return {
    value: initial,
    setValueAtTime(value: number) {
      this.value = value;
    },
    exponentialRampToValueAtTime(value: number) {
      this.value = value;
    },
    linearRampToValueAtTime(value: number) {
      this.value = value;
    },
    cancelScheduledValues() {},
  };
}

function node() {
  return {
    connect() {
      return this;
    },
    disconnect() {},
    start() {},
    stop() {},
  };
}

function fakeContext() {
  const created = { sources: 0, oscillators: 0, gains: 0 };
  const ambience = param(0.0001);
  const ctx = {
    currentTime: 0,
    sampleRate: 48000,
    state: 'running' as AudioContextState,
    destination: node(),
    created,
    ambience,
    resume() {
      ctx.state = 'running';
      return Promise.resolve();
    },
    close() {
      return Promise.resolve();
    },
    createGain() {
      created.gains += 1;
      const gain = param(created.gains === 2 ? 0.0001 : 1);
      if (created.gains === 2) {
        // Second gain is the ambience bed (master is first).
        return { gain: ambience, ...node() };
      }
      return { gain, ...node() };
    },
    createBufferSource() {
      created.sources += 1;
      return { ...node(), buffer: null as AudioBuffer | null, loop: false, onended: null as (() => void) | null };
    },
    createOscillator() {
      created.oscillators += 1;
      return { ...node(), type: 'sine', frequency: param(0) };
    },
    createBiquadFilter() {
      return { ...node(), type: 'lowpass', frequency: param(0), Q: { value: 0 } };
    },
    createBuffer(_channels: number, length: number) {
      const data = new Float32Array(length);
      return { getChannelData: () => data };
    },
  };
  return ctx;
}

describe('dungeon audio mix', () => {
  it('keeps the hall bed under the door stinger without clipping', () => {
    const bed = DUNGEON_MIX.ambience * DUNGEON_MIX.master;
    const door = (DUNGEON_MIX.doorNoise + DUNGEON_MIX.doorThump) * DUNGEON_MIX.master;
    expect(bed).toBeGreaterThan(0.08);
    expect(bed).toBeLessThan(0.16);
    expect(door).toBeGreaterThan(bed * 2);
    expect(door).toBeLessThan(0.55);
    expect(DUNGEON_MIX.drip * DUNGEON_MIX.master).toBeLessThan(bed);
  });

  it('schedules a door stinger and ramps the hall bed', () => {
    const ctx = fakeContext();
    const audio = new DungeonAudio(ctx as unknown as AudioContext);
    audio.unlock();
    audio.playDoor();
    expect(ctx.created.sources).toBeGreaterThan(0);
    expect(ctx.created.oscillators).toBeGreaterThan(0);

    const oscillatorsBeforeBed = ctx.created.oscillators;
    audio.fadeAmbience(true, 0.48);
    expect(ctx.ambience.value).toBeCloseTo(DUNGEON_MIX.ambience, 5);
    expect(ctx.created.oscillators).toBeGreaterThan(oscillatorsBeforeBed);

    audio.update(8);
    expect(ctx.created.oscillators).toBeGreaterThan(oscillatorsBeforeBed + 1);

    audio.fadeAmbience(false, 0.3);
    expect(ctx.ambience.value).toBeLessThan(0.01);
  });
});
