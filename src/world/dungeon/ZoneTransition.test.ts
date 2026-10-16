import { describe, expect, it } from 'vitest';
import { ZoneTransition } from './ZoneTransition';

function runUntil(
  transition: ZoneTransition,
  predicate: (event: ReturnType<ZoneTransition['update']>) => boolean,
  step = 0.05,
  maxSteps = 80,
): ReturnType<ZoneTransition['update']>[] {
  const events = [];
  for (let i = 0; i < maxSteps; i++) {
    const event = transition.update(step);
    events.push(event);
    if (predicate(event)) break;
  }
  return events;
}

describe('ZoneTransition', () => {
  it('rejects a second request and a request to the current zone', () => {
    const transition = new ZoneTransition();
    expect(transition.request('overworld')).toBe(false);
    expect(transition.request('dungeon')).toBe(true);
    expect(transition.request('dungeon')).toBe(false);
    expect(transition.request('overworld')).toBe(false);
    expect(transition.inputLocked).toBe(true);
    expect(transition.overlay).toBe(0);
  });

  it('switches once on the black frame, then unlocks after fade-in', () => {
    const transition = new ZoneTransition({ fadeOutSec: 0.4, fadeInSec: 0.4 });
    expect(transition.request('dungeon')).toBe(true);

    const fadeOut = runUntil(transition, (event) => event.switchedTo != null);
    const switches = fadeOut.filter((event) => event.switchedTo != null);
    expect(switches).toHaveLength(1);
    expect(switches[0]?.switchedTo).toBe('dungeon');
    expect(transition.zone).toBe('dungeon');
    expect(transition.overlay).toBe(1);
    expect(transition.inputLocked).toBe(true);

    const rest = runUntil(transition, (event) => event.arrived);
    expect(rest.at(-1)?.arrived).toBe(true);
    expect(transition.phase).toBe('idle');
    expect(transition.inputLocked).toBe(false);
    expect(transition.overlay).toBe(0);
    expect(rest.filter((event) => event.switchedTo != null)).toHaveLength(0);
  });

  it('can leave again after the fade settles', () => {
    const transition = new ZoneTransition({ fadeOutSec: 0.2, fadeInSec: 0.2 });
    transition.request('dungeon');
    runUntil(transition, (event) => event.arrived);
    expect(transition.request('overworld')).toBe(true);
    const back = runUntil(transition, (event) => event.switchedTo != null);
    expect(back.filter((event) => event.switchedTo === 'overworld')).toHaveLength(1);
  });

  it('does not emit a switch for a debug fade-in', () => {
    const transition = new ZoneTransition({ fadeOutSec: 0.2, fadeInSec: 0.2 });
    transition.beginFadeIn('dungeon');
    expect(transition.zone).toBe('dungeon');
    expect(transition.overlay).toBe(1);
    const events = runUntil(transition, (event) => event.arrived);
    expect(events.some((event) => event.switchedTo != null)).toBe(false);
    expect(transition.zone).toBe('dungeon');
  });

  it('ramps the vignette up and back down', () => {
    const transition = new ZoneTransition({ fadeOutSec: 0.4, fadeInSec: 0.4 });
    transition.request('dungeon');
    // dt is capped at 0.1 so a hitch cannot skip the black frame.
    transition.update(0.05);
    transition.update(0.05);
    transition.update(0.05);
    transition.update(0.05);
    const midOut = transition.overlay;
    expect(midOut).toBeGreaterThan(0.2);
    expect(midOut).toBeLessThan(0.95);
    runUntil(transition, (event) => event.switchedTo != null);
    transition.update(0.2);
    const midIn = transition.overlay;
    expect(midIn).toBeGreaterThan(0.05);
    expect(midIn).toBeLessThan(0.9);
  });
});
