/**
 * Procedural dungeon door + hall bed.
 *
 * Original synthesis (no third-party samples), dedicated to the public domain
 * under CC0 1.0. See `public/audio/CREDITS.md`.
 *
 * The slice has no overworld music bed yet, so the "crossfade" is this loop
 * against silence: it ramps in as the hall appears and ramps out on the way
 * back. Volumes stay low so a later combat/music pass is not fighting a loud loop.
 */

/**
 * Mix against a silent overworld. The stinger is louder than the bed so the
 * door reads, and the bed stays under ~0.15 at the master so later combat
 * and music are not fighting it. Door layers sum with the master under 0.5
 * so the whoosh and the thump do not clip each other.
 */
export const DUNGEON_MIX = {
  master: 0.8,
  ambience: 0.16,
  doorNoise: 0.26,
  doorThump: 0.3,
  drip: 0.05,
} as const;

const AMBIENCE_GAIN = DUNGEON_MIX.ambience;
const DOOR_GAIN = DUNGEON_MIX.doorNoise;
const DRIP_GAIN = DUNGEON_MIX.drip;

type AudioContextCtor = typeof AudioContext;

function audioContextCtor(): AudioContextCtor | null {
  if (typeof globalThis === 'undefined') return null;
  const g = globalThis as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return g.AudioContext ?? g.webkitAudioContext ?? null;
}

export class DungeonAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambienceGain: GainNode | null = null;
  private ambienceStarted = false;
  private ambienceOn = false;
  private dripIn = 2.4;
  private unlocked = false;

  /** `injected` is for tests. The game uses the browser constructor. */
  constructor(private readonly injected?: AudioContext) {}

  /** Call from a pointer / key listener so the context can leave `suspended`. */
  unlock(): void {
    const ctx = this.ensure();
    if (!ctx) return;
    this.unlocked = true;
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }
  }

  /** Stone-door rumble + air whoosh. One-shot; safe to overlap a fade. */
  playDoor(): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    this.resume(ctx);
    const now = ctx.currentTime;
    const duration = 1.15;

    const noise = ctx.createBufferSource();
    noise.buffer = makeNoiseBuffer(ctx, duration, 0.55);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1400, now);
    filter.frequency.exponentialRampToValueAtTime(140, now + duration);
    filter.Q.value = 0.7;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.0001, now);
    noiseGain.gain.exponentialRampToValueAtTime(DOOR_GAIN, now + 0.05);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.master);
    noise.start(now);
    noise.stop(now + duration + 0.02);

    const thump = ctx.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(78, now);
    thump.frequency.exponentialRampToValueAtTime(36, now + 0.55);
    const thumpGain = ctx.createGain();
    thumpGain.gain.setValueAtTime(0.0001, now);
    thumpGain.gain.exponentialRampToValueAtTime(DUNGEON_MIX.doorThump, now + 0.03);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
    thump.connect(thumpGain);
    thumpGain.connect(this.master);
    thump.start(now);
    thump.stop(now + 0.75);

    const cleanup = (): void => {
      noise.disconnect();
      filter.disconnect();
      noiseGain.disconnect();
      thump.disconnect();
      thumpGain.disconnect();
    };
    noise.onended = cleanup;
  }

  /**
   * Ramp the hall bed toward on or off. `seconds` is the crossfade length
   * (matched to the vignette so the drone hands off with the picture).
   */
  fadeAmbience(on: boolean, seconds: number): void {
    const ctx = this.ensure();
    if (!ctx || !this.ambienceGain) return;
    this.resume(ctx);
    this.startAmbience();
    this.ambienceOn = on;
    const now = ctx.currentTime;
    const target = on ? AMBIENCE_GAIN : 0.0001;
    const dur = Math.max(0.05, seconds);
    this.ambienceGain.gain.cancelScheduledValues(now);
    const current = this.ambienceGain.gain.value || 0.0001;
    this.ambienceGain.gain.setValueAtTime(Math.max(current, 0.0001), now);
    this.ambienceGain.gain.linearRampToValueAtTime(target, now + dur);
  }

  /** Occasional drip while the bed is up. No-op in tests without Web Audio. */
  update(dt: number): void {
    if (!this.ambienceOn || !this.ctx || !this.master) return;
    this.dripIn -= dt;
    if (this.dripIn > 0) return;
    this.dripIn = 3.2 + Math.random() * 4.5;
    this.playDrip();
  }

  dispose(): void {
    this.ambienceOn = false;
    if (this.ctx) {
      void this.ctx.close();
    }
    this.ctx = null;
    this.master = null;
    this.ambienceGain = null;
    this.ambienceStarted = false;
  }

  private playDrip(): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(920 + Math.random() * 380, now);
    osc.frequency.exponentialRampToValueAtTime(240, now + 0.18);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(DRIP_GAIN, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 400;
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + 0.24);
    osc.onended = () => {
      osc.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
  }

  private startAmbience(): void {
    const ctx = this.ctx;
    const bed = this.ambienceGain;
    if (!ctx || !bed || this.ambienceStarted) return;
    this.ambienceStarted = true;

    const noise = ctx.createBufferSource();
    noise.buffer = makeNoiseBuffer(ctx, 4.5, 0.85);
    noise.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 168;
    band.Q.value = 0.65;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.85;
    noise.connect(band);
    band.connect(noiseGain);
    noiseGain.connect(bed);
    noise.start();

    const droneA = this.drone(ctx, 55, 0.22, bed);
    const droneB = this.drone(ctx, 82.5, 0.1, bed);
    // Kept alive for the context lifetime; dispose() closes the context.
    void droneA;
    void droneB;
  }

  private drone(ctx: AudioContext, freq: number, gainValue: number, dest: AudioNode): OscillatorNode {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.value = gainValue;
    osc.connect(gain);
    gain.connect(dest);
    osc.start();
    return osc;
  }

  private resume(ctx: AudioContext): void {
    if (ctx.state === 'suspended') void ctx.resume();
  }

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const ctx = this.injected ?? null;
    if (ctx) {
      this.wire(ctx);
      return ctx;
    }
    const Ctor = audioContextCtor();
    if (!Ctor) return null;
    this.wire(new Ctor());
    return this.ctx;
  }

  private wire(ctx: AudioContext): void {
    const master = ctx.createGain();
    master.gain.value = DUNGEON_MIX.master;
    master.connect(ctx.destination);
    const ambienceGain = ctx.createGain();
    ambienceGain.gain.value = 0.0001;
    ambienceGain.connect(master);
    this.ctx = ctx;
    this.master = master;
    this.ambienceGain = ambienceGain;
    if (this.unlocked && ctx.state === 'suspended') {
      void ctx.resume();
    }
  }
}

/** Brown-ish noise, gently tapered so loops don't click. */
function makeNoiseBuffer(ctx: AudioContext, seconds: number, tone: number): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let brown = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    brown = (brown + 0.02 * white) / 1.02;
    const edge = Math.min(1, i / 256, (length - 1 - i) / 256);
    data[i] = brown * tone * edge * 3.2;
  }
  return buffer;
}
