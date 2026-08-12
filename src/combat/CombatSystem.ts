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
  private readonly slashGeo = new THREE.PlaneGeometry(1.8, 0.35);

  constructor(private readonly scene: THREE.Scene) {
    this.ringGeo.rotateX(-Math.PI / 2);
  }

  spawnRing(pos: THREE.Vector3, color: number, scale = 1): void {
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(this.ringGeo, mat);
    mesh.position.set(pos.x, 0.08, pos.z);
    mesh.scale.setScalar(0.4 * scale);
    this.scene.add(mesh);
    this.items.push({ mesh, age: 0, life: 0.4, grow: 3.2 * scale });
  }

  spawnSlash(pos: THREE.Vector3, facing: THREE.Vector3, color: number): void {
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(this.slashGeo, mat);
    mesh.position.set(pos.x + facing.x * 1.1, 1.1, pos.z + facing.z * 1.1);
    mesh.rotation.y = Math.atan2(facing.x, facing.z);
    mesh.rotation.z = -0.4;
    this.scene.add(mesh);
    this.items.push({ mesh, age: 0, life: 0.22, grow: 0 });
  }

  update(dt: number): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i]!;
      item.age += dt;
      const t = item.age / item.life;
      if (item.grow > 0) {
        const s = 0.4 + t * item.grow;
        item.mesh.scale.setScalar(s);
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

    if (skillId === 'basic') {
      this.fx.spawnSlash(player.position, player.facing, skill.color);
      let hit = false;
      for (const mob of mobs) {
        if (!mob.alive) continue;
        const d2 = dist2(player.position.x, player.position.z, mob.position.x, mob.position.z);
        if (d2 > skill.range * skill.range) continue;
        // Prefer targets roughly in front of the player
        this.tmp.set(mob.position.x - player.position.x, 0, mob.position.z - player.position.z);
        if (this.tmp.lengthSq() > 1e-4) {
          this.tmp.normalize();
          if (this.tmp.dot(player.facing) < 0.15) continue;
        }
        this.applyDamageToMob(mob, skill.damage, false);
        hit = true;
        break;
      }
      return hit || true;
    }

    // AoE slam centered on player
    this.fx.spawnRing(player.position, skill.color, 1.2);
    for (const mob of mobs) {
      if (!mob.alive) continue;
      const d2 = dist2(player.position.x, player.position.z, mob.position.x, mob.position.z);
      if (d2 <= skill.radius * skill.radius) {
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
          this.damageNumbers.spawn(player.position, dealt, false);
          this.hooks.onPlayerDamaged();
        }
      }
    }
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
