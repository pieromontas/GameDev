import * as THREE from 'three';
import { DungeonAudio } from '../../audio/DungeonAudio';
import { DungeonHall, type HallPrompt } from './DungeonHall';
import { ZoneTransition, type ZoneId } from './ZoneTransition';

export type SessionEvent = {
  switchedTo: ZoneId | null;
  arrived: boolean;
  zone: ZoneId;
  overlay: number;
  inputLocked: boolean;
};

/**
 * Owns the fade state machine, the entry-hall instance, and dungeon audio.
 * Enter builds the hall during the fade-out (off-scene) so the black frame
 * only attaches it. Leave detaches and disposes geometries, materials, and
 * lights; the next enter allocates a fresh hall. Repeated trips stay at one copy.
 */
export class DungeonSession {
  readonly transition = new ZoneTransition();
  readonly audio = new DungeonAudio();
  private hall: DungeonHall | null = null;
  private zone: ZoneId = 'overworld';
  /** Geometries freed across releases. Survives `dispose()` nulling the hall. */
  private geometryDisposals = 0;

  constructor(private readonly scene: THREE.Scene) {}

  get currentZone(): ZoneId {
    return this.zone;
  }

  get inputLocked(): boolean {
    return this.transition.inputLocked;
  }

  get overlay(): number {
    return this.transition.overlay;
  }

  get meshCount(): number {
    return this.hall?.meshCount() ?? 0;
  }

  get lightCount(): number {
    return this.hall?.lightCount() ?? 0;
  }

  get disposedGeometryCount(): number {
    return this.geometryDisposals;
  }

  unlockAudio(): void {
    this.audio.unlock();
  }

  requestEnter(): boolean {
    if (!this.transition.request('dungeon')) return false;
    this.ensureHall();
    return true;
  }

  requestExit(): boolean {
    if (!this.transition.request('overworld')) return false;
    this.audio.fadeAmbience(false, this.transition.fadeOutSec);
    return true;
  }

  /** `?at=dungeon` — hall is already current, vignette fades in from black. */
  bootInDungeon(): void {
    this.ensureHall();
    this.hall!.attach(this.scene);
    this.zone = 'dungeon';
    this.transition.beginFadeIn('dungeon');
    this.audio.fadeAmbience(true, 0.7);
  }

  /** Death / respawn while inside: drop the hall immediately and return idle. */
  forceOverworld(): void {
    this.audio.fadeAmbience(false, 0.05);
    this.releaseHall();
    this.zone = 'overworld';
    this.transition.cancelTo('overworld');
  }

  update(dt: number): SessionEvent {
    const event = this.transition.update(dt);
    if (event.switchedTo === 'dungeon') {
      this.ensureHall();
      this.hall!.attach(this.scene);
      this.zone = 'dungeon';
      this.audio.playDoor();
      this.audio.fadeAmbience(true, this.transition.fadeInSec);
    } else if (event.switchedTo === 'overworld') {
      this.audio.playDoor();
      this.audio.fadeAmbience(false, 0.25);
      this.releaseHall();
      this.zone = 'overworld';
    }
    if (this.zone === 'dungeon') this.hall?.update(dt);
    this.audio.update(dt);
    return {
      switchedTo: event.switchedTo,
      arrived: event.arrived,
      zone: this.zone,
      overlay: event.overlay,
      inputLocked: event.inputLocked,
    };
  }

  resolve(position: THREE.Vector3, radius: number): void {
    this.hall?.resolve(position, radius);
  }

  getPrompt(x: number, z: number, alive: boolean): HallPrompt {
    if (this.zone !== 'dungeon' || !this.hall) {
      return { visible: false, text: '', kind: null };
    }
    return this.hall.getPrompt(x, z, alive);
  }

  dispose(): void {
    this.releaseHall();
    this.hall = null;
    this.audio.dispose();
  }

  private releaseHall(): void {
    if (!this.hall) return;
    const before = this.hall.disposedGeometries;
    this.hall.release();
    this.geometryDisposals += this.hall.disposedGeometries - before;
  }

  private ensureHall(): void {
    if (!this.hall) this.hall = new DungeonHall();
    this.hall.ensureBuilt();
  }
}
