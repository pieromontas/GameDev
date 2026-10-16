import { smoothstep } from '../../anim/ease';

export type ZoneId = 'overworld' | 'dungeon';
export type TransitionPhase = 'idle' | 'fadeOut' | 'fadeIn';

export type TransitionEvent = {
  /** Zone applied this frame, exactly once per successful request. */
  switchedTo: ZoneId | null;
  /** Fade finished and input may resume. */
  arrived: boolean;
  phase: TransitionPhase;
  zone: ZoneId;
  /** 0 clear → 1 fully covered. Vignette opacity. */
  overlay: number;
  inputLocked: boolean;
};

const DEFAULT_FADE_OUT = 0.48;
const DEFAULT_FADE_IN = 0.56;

/**
 * Overworld ↔ dungeon fade. Input stays locked from the request until the
 * fade-in completes. A second request during the fade is ignored so E cannot
 * double-fire. The zone switch is reported once, on the black frame.
 */
export class ZoneTransition {
  phase: TransitionPhase = 'idle';
  zone: ZoneId = 'overworld';
  readonly fadeOutSec: number;
  readonly fadeInSec: number;
  private elapsed = 0;
  private target: ZoneId = 'overworld';
  private switched = false;

  constructor(opts?: { fadeOutSec?: number; fadeInSec?: number }) {
    this.fadeOutSec = opts?.fadeOutSec ?? DEFAULT_FADE_OUT;
    this.fadeInSec = opts?.fadeInSec ?? DEFAULT_FADE_IN;
  }

  get inputLocked(): boolean {
    return this.phase !== 'idle';
  }

  get overlay(): number {
    if (this.phase === 'idle') return 0;
    if (this.phase === 'fadeOut') {
      return smoothstep(this.elapsed / this.fadeOutSec);
    }
    return 1 - smoothstep(this.elapsed / this.fadeInSec);
  }

  /** Begin a fade toward `target`. False if already in flight or already there. */
  request(target: ZoneId): boolean {
    if (this.phase !== 'idle') return false;
    if (target === this.zone) return false;
    this.phase = 'fadeOut';
    this.target = target;
    this.elapsed = 0;
    this.switched = false;
    return true;
  }

  /**
   * Boot already inside `zone` (debug spawn). Overlay starts black and fades
   * in. Does not emit a switch — the caller has already placed the player.
   */
  beginFadeIn(zone: ZoneId): void {
    this.zone = zone;
    this.target = zone;
    this.phase = 'fadeIn';
    this.elapsed = 0;
    this.switched = true;
  }

  /** Drop any in-flight fade and sit idle in `zone` (respawn escape hatch). */
  cancelTo(zone: ZoneId): void {
    this.zone = zone;
    this.target = zone;
    this.phase = 'idle';
    this.elapsed = 0;
    this.switched = true;
  }

  update(dt: number): TransitionEvent {
    let switchedTo: ZoneId | null = null;
    let arrived = false;
    if (this.phase !== 'idle') {
      // Cap so a hitch cannot skip the black frame or finish both fades at once.
      const step = Math.min(Math.max(dt, 0), 0.1);
      this.elapsed += step;
      if (this.phase === 'fadeOut' && this.elapsed >= this.fadeOutSec) {
        if (!this.switched) {
          this.switched = true;
          this.zone = this.target;
          switchedTo = this.target;
        }
        this.phase = 'fadeIn';
        this.elapsed = 0;
      } else if (this.phase === 'fadeIn' && this.elapsed >= this.fadeInSec) {
        this.phase = 'idle';
        this.elapsed = 0;
        arrived = true;
      }
    }
    return {
      switchedTo,
      arrived,
      phase: this.phase,
      zone: this.zone,
      overlay: this.overlay,
      inputLocked: this.inputLocked,
    };
  }
}
