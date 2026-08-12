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
};

/** Lightweight VFX rings / slash arcs using shared geometry. */
class SkillFx {
  private readonly items: Array<{
    mesh: THREE.Mesh;
    age: number;
    life: number;
    grow: number;
  }> = [];
  private readonly ringGeo = new THREE.RingGeometry(0.2, 0.55, 24);
  private readonly slashGeo = new THREE.PlaneGeometry(2.1, 0.42);

  constructor(private readonly scene: THREE.Scene) {
    this.ringGeo.rotateX(-Math.PI / 2);
  }

  spawnRing(pos: THREE.Vector3, color: number, finalRadius: number): void {
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      depthWrite: false,
      // Additive pop without a post-process bloom stack
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(this.ringGeo, mat);
    mesh.position.set(pos.x, 0.1, pos.z);
    mesh.scale.setScalar(0.35);
    mesh.renderOrder = 2;
    this.scene.add(mesh);
    // RingGeometry outer ~0.55 → scale so visual ≈ skill radius
    const targetScale = (finalRadius / 0.55) * 1.05;
    this.items.push({ mesh, age: 0, life: 0.38, grow: targetScale });
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
    mesh.position.set(pos.x + facing.x * 1.15, 1.15, pos.z + facing.z * 1.15);
    mesh.rotation.y = Math.atan2(facing.x, facing.z);
    mesh.rotation.z = -0.35;
    mesh.renderOrder = 2;
    this.scene.add(mesh);
    this.items.push({ mesh, age: 0, life: 0.2, grow: 0 });
  }

  update(dt: number): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i]!;
      item.age += dt;
      const t = item.age / item.life;
      if (item.grow > 0) {
        const s = 0.35 + t * (item.grow - 0.35);
        item.mesh.scale.setScalar(s);
      } else {
        item.mesh.scale.x = 1 + t * 0.35;
      }
      const mat = item.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, 1 - t);
      if (item.age >= item.life) {
        this.scene.remove(item.mesh);
        mat.dispose();
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

  constructor(scene: THREE.Scene, private readonly hooks: CombatHooks) {
    this.damageNumbers = new DamageNumbers(scene);
    this.fx = new SkillFx(scene);
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
      this.fx.spawnSlash(player.position, player.facing, skill.color);
      if (target) {
        this.applyDamageToMob(target, skill.damage, false);
      }
      return true;
    }

    // AoE slam centered on player — ring matches gameplay radius
    this.fx.spawnRing(player.position, skill.color, skill.radius);
    for (const mob of mobs) {
      if (!mob.alive) continue;
      const reach = skill.radius + mob.radius * 0.35;
      const d2 = dist2(player.position.x, player.position.z, mob.position.x, mob.position.z);
      if (d2 <= reach * reach) {
        this.applyDamageToMob(mob, skill.damage, true);
      }
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

      // Close-range sticky assist; farther targets need to be roughly ahead
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
    this.damageNumbers.spawn(mob.position, dealt, crit);
    if (!mob.alive) {
      this.hooks.onKill();
      const loot = new LootPickup(mob.position);
      this.hooks.onLootDrop(loot);
    }
  }
}
