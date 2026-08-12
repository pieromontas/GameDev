import * as THREE from 'three';
import { Player } from '../entities/Player';
import { Mob } from '../entities/Mob';
import { LootPickup } from '../entities/Loot';
import { SkillId } from './Skills';
import { DamageNumbers } from './DamageNumbers';
import { dist2 } from '../utils/math';

export type CombatHooks = {
  onLootDrop: (loot: LootPickup) => void;
  onPlayerDamaged: () => void;
  onKill: () => void;
  /** Optional: subtle camera punch when Quake connects. */
  onQuakeImpact?: (hitCount: number) => void;
};

/** Lightweight VFX rings / slash arcs / seals using shared geometry. */
class SkillFx {
  private readonly items: Array<{
    mesh: THREE.Object3D;
    age: number;
    life: number;
    grow: number;
    kind: 'ring' | 'slash' | 'seal';
    startScale: number;
  }> = [];
  private readonly ringGeo = new THREE.RingGeometry(0.18, 0.62, 32);
  private readonly slashGeo = new THREE.RingGeometry(0.9, 1.45, 22, 1, 0, Math.PI * 0.85);
  private readonly sealGeo = new THREE.RingGeometry(0.5, 0.78, 6);

  constructor(private readonly scene: THREE.Scene) {
    this.ringGeo.rotateX(-Math.PI / 2);
    this.sealGeo.rotateX(-Math.PI / 2);
  }

  spawnRing(pos: THREE.Vector3, color: number, finalRadius: number): void {
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 1,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(this.ringGeo, mat);
    mesh.position.set(pos.x, 0.12, pos.z);
    mesh.scale.setScalar(0.28);
    mesh.renderOrder = 2;
    this.scene.add(mesh);
    const targetScale = (finalRadius / 0.62) * 1.08;
    this.items.push({
      mesh,
      age: 0,
      life: 0.55,
      grow: targetScale,
      kind: 'ring',
      startScale: 0.28,
    });

    // Thin outer ripple for readable ground impact radius.
    const rimMat = new THREE.MeshBasicMaterial({
      color: 0xfff0c8,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const rim = new THREE.Mesh(this.ringGeo, rimMat);
    rim.position.set(pos.x, 0.14, pos.z);
    rim.scale.setScalar(0.22);
    rim.renderOrder = 3;
    this.scene.add(rim);
    this.items.push({
      mesh: rim,
      age: 0,
      life: 0.38,
      grow: targetScale * 1.12,
      kind: 'ring',
      startScale: 0.22,
    });
  }

  spawnSeal(pos: THREE.Vector3, color: number): void {
    const group = new THREE.Group();
    group.position.set(pos.x, 0.08, pos.z);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const outer = new THREE.Mesh(this.sealGeo, mat);
    group.add(outer);
    const inner = new THREE.Mesh(this.sealGeo, mat.clone());
    inner.scale.setScalar(0.55);
    inner.rotation.y = Math.PI / 6;
    group.add(inner);
    group.scale.setScalar(0.35);
    group.renderOrder = 2;
    this.scene.add(group);
    this.items.push({
      mesh: group,
      age: 0,
      life: 0.48,
      grow: 1.55,
      kind: 'seal',
      startScale: 0.35,
    });
  }

  spawnSlash(pos: THREE.Vector3, facing: THREE.Vector3, color: number): void {
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 1,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(this.slashGeo, mat);
    // Stand the arc up in the swing plane
    mesh.position.set(pos.x + facing.x * 0.85, 1.15, pos.z + facing.z * 0.85);
    mesh.rotation.y = Math.atan2(facing.x, facing.z);
    mesh.rotation.x = Math.PI / 2;
    mesh.rotation.z = -0.2;
    mesh.renderOrder = 2;
    this.scene.add(mesh);
    this.items.push({
      mesh,
      age: 0,
      life: 0.22,
      grow: 0,
      kind: 'slash',
      startScale: 1,
    });
  }

  update(dt: number): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i]!;
      item.age += dt;
      const t = item.age / item.life;
      if (item.kind === 'ring' || item.kind === 'seal') {
        const s = item.startScale + t * (item.grow - item.startScale);
        item.mesh.scale.setScalar(s);
        if (item.kind === 'seal') {
          item.mesh.rotation.y += dt * 2.8;
        }
      } else {
        item.mesh.scale.set(1 + t * 0.45, 1 + t * 0.2, 1 + t * 0.45);
      }

      item.mesh.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.material && (mesh.material as THREE.Material).opacity !== undefined) {
          // Hold opacity a beat longer so rings stay readable mid-expand.
          const fade = item.kind === 'ring' ? Math.max(0, 1 - t * t) : Math.max(0, 1 - t);
          (mesh.material as THREE.MeshBasicMaterial).opacity = fade;
        }
      });

      if (item.age >= item.life) {
        this.scene.remove(item.mesh);
        item.mesh.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (mesh.material) {
            const mat = mesh.material as THREE.Material;
            // Shared geos; dispose only unique materials
            if (!(mat as THREE.Material & { userData?: { shared?: boolean } }).userData?.shared) {
              mat.dispose();
            }
          }
        });
        this.items.splice(i, 1);
      }
    }
  }
}

export class CombatSystem {
  readonly damageNumbers: DamageNumbers;
  private readonly fx: SkillFx;
  private readonly tmp = new THREE.Vector3();
  /** Brief i-frames after a player hit so stacked bites don't delete you. */
  private readonly playerHitIFrames = 0.55;
  /** Remaining real-time hit-stop (seconds). Countdown uses raw dt. */
  private hitStopRemain = 0;

  constructor(scene: THREE.Scene, private readonly hooks: CombatHooks) {
    this.damageNumbers = new DamageNumbers(scene);
    this.fx = new SkillFx(scene);
  }

  /**
   * Apply brief time-scale punch. Pass raw frame dt; returns scaled sim dt.
   * Hit-stop countdown always consumes real time so the freeze stays short.
   */
  scaleDt(rawDt: number): number {
    if (this.hitStopRemain <= 0) return rawDt;
    this.hitStopRemain = Math.max(0, this.hitStopRemain - rawDt);
    // Near-freeze for a couple frames — punchy without stalling the fight.
    return rawDt * 0.1;
  }

  update(dt: number): void {
    this.damageNumbers.update(dt);
    this.fx.update(dt);
  }

  tryPlayerSkill(player: Player, skillId: SkillId, mobs: Mob[]): boolean {
    if (!player.canUse(skillId)) return false;
    const skill = player.skills[skillId].def;
    player.startCooldown(skillId);
    player.markCombat();

    if (skillId === 'basic') {
      const target = this.pickSlashTarget(player, mobs, skill.range);
      if (target) {
        this.tmp.set(
          target.position.x - player.position.x,
          0,
          target.position.z - player.position.z,
        );
        player.faceDirection(this.tmp);
      }
      player.playSlash();
      this.fx.spawnSlash(player.position, player.facing, skill.color);
      this.fx.spawnSeal(player.position, 0xffd76a);
      if (target) {
        this.applyDamageToMob(target, skill.damage, false);
        this.pulseHitStop(0.045);
      }
      return true;
    }

    // AoE slam centered on player — ring matches gameplay radius
    player.playQuake();
    this.fx.spawnRing(player.position, skill.color, skill.radius);
    this.fx.spawnSeal(player.position, skill.color);
    let hits = 0;
    for (const mob of mobs) {
      if (!mob.alive) continue;
      const reach = skill.radius + mob.radius * 0.35;
      const d2 = dist2(player.position.x, player.position.z, mob.position.x, mob.position.z);
      if (d2 <= reach * reach) {
        this.applyDamageToMob(mob, skill.damage, true);
        hits += 1;
      }
    }
    if (hits > 0) {
      this.pulseHitStop(0.055);
      this.hooks.onQuakeImpact?.(hits);
    }
    return true;
  }

  updateMobCombat(mobs: Mob[], player: Player): void {
    for (const mob of mobs) {
      mob.think(player.position, player.alive);
      if (mob.tryAttack() && player.alive && player.invuln <= 0) {
        const dealt = player.takeDamage(mob.attackDamage);
        if (dealt > 0) {
          player.invuln = this.playerHitIFrames;
          player.markCombat();
          this.damageNumbers.spawn(player.position, dealt, false);
          this.hooks.onPlayerDamaged();
        }
      }
    }
  }

  /**
   * Soft-lock assist: prefer the nearest living mob in a forward cone,
   * but allow a short all-around grab so standing still still feels fair.
   */
  private pickSlashTarget(player: Player, mobs: Mob[], range: number): Mob | null {
    let best: Mob | null = null;
    let bestScore = Infinity;

    for (const mob of mobs) {
      if (!mob.alive) continue;
      const dx = mob.position.x - player.position.x;
      const dz = mob.position.z - player.position.z;
      const dist = Math.hypot(dx, dz);
      const hitRange = range + mob.radius * 0.45;
      if (dist > hitRange) continue;

      this.tmp.set(dx, 0, dz);
      let facing = 1;
      if (this.tmp.lengthSq() > 1e-4) {
        this.tmp.normalize();
        facing = this.tmp.dot(player.facing);
      }

      if (dist > 1.55 && facing < -0.05) continue;

      const score = dist - facing * 1.1;
      if (score < bestScore) {
        bestScore = score;
        best = mob;
      }
    }
    return best;
  }

  private applyDamageToMob(mob: Mob, damage: number, crit: boolean): void {
    const dealt = mob.takeDamage(damage + (crit ? 4 : 0));
    if (dealt <= 0) return;
    mob.playHitReact();
    this.damageNumbers.spawn(mob.position, dealt, crit);
    if (!mob.alive) {
      this.hooks.onKill();
      const loot = new LootPickup(mob.position);
      this.hooks.onLootDrop(loot);
    }
  }

  private pulseHitStop(seconds: number): void {
    this.hitStopRemain = Math.max(this.hitStopRemain, seconds);
  }
}
