import * as THREE from 'three';
import { Enemy, Mob } from '../entities/Mob';
import { Spitter } from '../entities/Spitter';
import { Player } from '../entities/Player';
import { LootPickup } from '../entities/Loot';
import { MeadowBiome } from './MeadowBiome';
import { EastShrineClearing } from '../render/stylized';

export type ShrinePhase = 'idle' | 'defending' | 'cooldown';

export type ShrineHudState = {
  promptVisible: boolean;
  promptText: string;
  objectiveVisible: boolean;
  objectiveText: string;
  cooldownVisible: boolean;
  cooldownText: string;
};

export type ShrineHooks = {
  onSpawnEnemy: (enemy: Enemy) => void;
  onDespawnEnemy: (enemy: Enemy) => void;
  onLootBurst: (pickups: LootPickup[]) => void;
  onToast: (message: string, duration?: number) => void;
};

const TOTAL_WAVES = 3;
const SUCCESS_COOLDOWN = 60;
const FAIL_COOLDOWN = 18;
const BUFF_DURATION = 45;
const INTERACT_PROMPT = 'Press E — Awaken Shrine';

const WAVE_COLORS = [0xff5fa8, 0x5eb8ff, 0xffc23a, 0xc58cff, 0xff8a4c];

/**
 * East shrine mini-objective: approach → E to awaken → defend 3 spawn waves
 * → buff + loot + activated crystal → cooldown before another run.
 */
export class ShrineObjective {
  phase: ShrinePhase = 'idle';
  private waveIndex = 0;
  private cooldownRemain = 0;
  private readonly waveEnemies = new Set<Enemy>();
  /** Death-anim despawn arming so we don't reset beginRespawn every frame. */
  private readonly despawnArmed = new Set<Enemy>();
  private betweenWaveTimer = -1;
  private readonly center = new THREE.Vector3(EastShrineClearing.x, 0, EastShrineClearing.z);

  constructor(
    private readonly meadow: MeadowBiome,
    private readonly hooks: ShrineHooks,
  ) {}

  /** True if this enemy belongs to the current shrine defense wave. */
  isWaveEnemy(enemy: Enemy): boolean {
    return this.waveEnemies.has(enemy);
  }

  getHudState(player: Player): ShrineHudState {
    const near = player.alive && this.meadow.isNearShrine(player.position);
    const canInteract = this.phase === 'idle' && near;
    const onCd = this.phase === 'cooldown';

    let objectiveText = '';
    if (this.phase === 'defending') {
      const alive = this.countAliveWave();
      objectiveText = `Defend the shrine — Wave ${this.waveIndex}/${TOTAL_WAVES}`;
      if (alive > 0) objectiveText += `  ·  ${alive} left`;
      else if (this.betweenWaveTimer > 0) objectiveText += '  ·  Next wave…';
    }

    return {
      promptVisible: canInteract,
      promptText: INTERACT_PROMPT,
      objectiveVisible: this.phase === 'defending',
      objectiveText,
      cooldownVisible: onCd && near,
      cooldownText: onCd
        ? `Shrine resting… ${Math.ceil(this.cooldownRemain)}s`
        : '',
    };
  }

  /** Edge-triggered interact when the player presses E near an idle shrine. */
  tryInteract(player: Player): boolean {
    if (!player.alive) return false;
    if (this.phase !== 'idle') return false;
    if (!this.meadow.isNearShrine(player.position)) return false;
    this.beginDefense();
    return true;
  }

  update(dt: number, player: Player): void {
    this.meadow.updateShrineVisual(dt);

    if (this.phase === 'cooldown') {
      this.cooldownRemain -= dt;
      if (this.cooldownRemain <= 0) {
        this.cooldownRemain = 0;
        this.phase = 'idle';
        this.meadow.setShrineActivated(false);
        this.hooks.onToast('The east shrine stirs again…', 1.6);
      }
      return;
    }

    if (this.phase !== 'defending') return;

    // Soft-fail if the player dies mid-ritual — no softlock, retry after a short rest.
    if (!player.alive) {
      this.failDefense('Shrine ritual broken — try again soon');
      return;
    }

    if (this.betweenWaveTimer > 0) {
      this.betweenWaveTimer -= dt;
      if (this.betweenWaveTimer <= 0) {
        this.betweenWaveTimer = -1;
        this.spawnWave(this.waveIndex + 1);
      }
      return;
    }

    // Cull finished wave enemies and advance when the ring is clear.
    this.pruneDeadWaveEnemies();
    if (this.waveEnemies.size === 0 && this.betweenWaveTimer < 0) {
      if (this.waveIndex >= TOTAL_WAVES) {
        this.completeDefense(player);
      } else {
        this.betweenWaveTimer = 1.15;
        this.hooks.onToast(`Wave ${this.waveIndex} cleared!`, 1.0);
      }
    }
  }

  private beginDefense(): void {
    this.phase = 'defending';
    this.waveIndex = 0;
    this.betweenWaveTimer = -1;
    this.waveEnemies.clear();
    this.despawnArmed.clear();
    this.meadow.setShrineActivated(false);
    this.hooks.onToast('Defend the shrine!', 1.8);
    this.spawnWave(1);
  }

  private spawnWave(wave: number): void {
    this.waveIndex = wave;
    const specs = waveSpawnSpecs(wave);
    for (let i = 0; i < specs.length; i++) {
      const spec = specs[i]!;
      const angle = (i / specs.length) * Math.PI * 2 + wave * 0.4;
      const radius = 5.2 + (i % 2) * 0.85;
      const pos = new THREE.Vector3(
        this.center.x + Math.cos(angle) * radius,
        0,
        this.center.z + Math.sin(angle) * radius,
      );
      const enemy: Enemy =
        spec === 'spitter'
          ? new Spitter(pos)
          : new Mob(pos, WAVE_COLORS[(wave + i) % WAVE_COLORS.length]);
      // Keep them sticky to the shrine fight — home = spawn so leash doesn't yank them away.
      enemy.home.copy(pos);
      this.waveEnemies.add(enemy);
      this.hooks.onSpawnEnemy(enemy);
    }
    this.hooks.onToast(`Wave ${wave} / ${TOTAL_WAVES}`, 1.2);
  }

  private pruneDeadWaveEnemies(): void {
    for (const enemy of [...this.waveEnemies]) {
      if (enemy.alive) continue;
      // Override meadow reform delay — objective spawns should leave after the death squash.
      if (!this.despawnArmed.has(enemy)) {
        enemy.beginRespawn(0.7);
        this.despawnArmed.add(enemy);
      }
      if (!enemy.readyToRespawn()) continue;
      this.waveEnemies.delete(enemy);
      this.despawnArmed.delete(enemy);
      this.hooks.onDespawnEnemy(enemy);
    }
  }

  private countAliveWave(): number {
    let n = 0;
    for (const e of this.waveEnemies) if (e.alive) n += 1;
    return n;
  }

  private completeDefense(player: Player): void {
    this.clearWaveEnemies();
    this.phase = 'cooldown';
    this.cooldownRemain = SUCCESS_COOLDOWN;
    this.meadow.setShrineActivated(true);

    player.applyShrineBuff(BUFF_DURATION, 1.4, 1.22);

    const pickups: LootPickup[] = [];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const r = 1.4 + (i % 3) * 0.35;
      const p = new THREE.Vector3(
        this.center.x + Math.cos(a) * r,
        0,
        this.center.z + Math.sin(a) * r,
      );
      pickups.push(new LootPickup(p));
    }
    this.hooks.onLootBurst(pickups);

    this.hooks.onToast('Shrine awakened! +Damage & Speed · 45s', 2.8);
  }

  private failDefense(message: string): void {
    this.clearWaveEnemies();
    this.phase = 'cooldown';
    this.cooldownRemain = FAIL_COOLDOWN;
    this.meadow.setShrineActivated(false);
    this.hooks.onToast(message, 2.2);
  }

  private clearWaveEnemies(): void {
    for (const enemy of [...this.waveEnemies]) {
      this.waveEnemies.delete(enemy);
      this.despawnArmed.delete(enemy);
      this.hooks.onDespawnEnemy(enemy);
    }
    this.betweenWaveTimer = -1;
  }
}

function waveSpawnSpecs(wave: number): Array<'blob' | 'spitter'> {
  if (wave <= 1) return ['blob', 'blob'];
  if (wave === 2) return ['blob', 'blob', 'spitter'];
  return ['spitter', 'blob', 'spitter'];
}
