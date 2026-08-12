import * as THREE from 'three';
import { Player } from '../entities/Player';
import { Enemy } from '../entities/Mob';
import { Spitter } from '../entities/Spitter';
import { SpitProjectile } from '../entities/SpitProjectile';
import { LootPickup } from '../entities/Loot';
import { SkillId } from './Skills';
import { DamageNumbers } from './DamageNumbers';
import { dist2 } from '../utils/math';

export type CombatHooks = {
  onLootDrop: (loot: LootPickup) => void;
  onPlayerDamaged: () => void;
  onKill: (enemy: Enemy) => void;
  /** Optional: subtle camera punch when Quake connects. */
  onQuakeImpact?: (hitCount: number) => void;
  /** Optional: lighter punch when Shield Bash connects. */
  onBashImpact?: (hitCount: number) => void;
};

/** Lightweight VFX rings / slash arcs / seals / bash pulses / mage spells using shared geometry. */
class SkillFx {
  private readonly items: Array<{
    mesh: THREE.Object3D;
    age: number;
    life: number;
    grow: number;
    kind: 'ring' | 'slash' | 'seal' | 'bash' | 'bolt' | 'ward';
    startScale: number;
    vel?: THREE.Vector3;
  }> = [];
  private readonly ringGeo = new THREE.RingGeometry(0.18, 0.62, 32);
  private readonly slashGeo = new THREE.RingGeometry(0.9, 1.45, 22, 1, 0, Math.PI * 0.85);
  private readonly sealGeo = new THREE.RingGeometry(0.5, 0.78, 6);
  private readonly bashDiscGeo = new THREE.CircleGeometry(0.55, 20);
  private readonly bashRingGeo = new THREE.RingGeometry(0.35, 0.72, 24, 1, 0, Math.PI * 1.15);
  private readonly boltGeo = new THREE.SphereGeometry(0.16, 10, 8);
  private readonly wardGeo = new THREE.SphereGeometry(0.95, 18, 14);

  constructor(private readonly scene: THREE.Scene) {
    this.ringGeo.rotateX(-Math.PI / 2);
    this.sealGeo.rotateX(-Math.PI / 2);
    // Bash disc stands upright in the shield plane; ring lies on the ground as a crescent.
    this.bashRingGeo.rotateX(-Math.PI / 2);
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

  /** Arcane Bolt projectile streak toward a hit point (or max range). */
  spawnBolt(from: THREE.Vector3, facing: THREE.Vector3, color: number, travel: number): void {
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(this.boltGeo, mat);
    mesh.position.set(from.x + facing.x * 0.7, 1.25, from.z + facing.z * 0.7);
    mesh.scale.set(0.7, 0.7, 1.4);
    mesh.renderOrder = 4;
    this.scene.add(mesh);
    const speed = Math.max(travel, 1.5) / 0.18;
    this.items.push({
      mesh,
      age: 0,
      life: 0.22,
      grow: 0,
      kind: 'bolt',
      startScale: 1,
      vel: new THREE.Vector3(facing.x * speed, 0, facing.z * speed),
    });

    // Soft ground seal at cast origin.
    this.spawnSeal(from, color);
  }

  /** Personal ward bubble around the mage. */
  spawnWard(pos: THREE.Vector3, color: number): void {
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      wireframe: false,
    });
    const mesh = new THREE.Mesh(this.wardGeo, mat);
    mesh.position.set(pos.x, 1.05, pos.z);
    mesh.scale.setScalar(0.55);
    mesh.renderOrder = 3;
    this.scene.add(mesh);
    this.items.push({
      mesh,
      age: 0,
      life: 0.55,
      grow: 1.35,
      kind: 'ward',
      startScale: 0.55,
    });
    this.spawnSeal(pos, 0xd8c4ff);
  }

  /** Forward shield pulse — distinct from Slash arcs and Quake rings. */
  spawnBash(pos: THREE.Vector3, facing: THREE.Vector3, color: number): void {
    const yaw = Math.atan2(facing.x, facing.z);
    const fx = pos.x + facing.x * 0.95;
    const fz = pos.z + facing.z * 0.95;

    const discMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const disc = new THREE.Mesh(this.bashDiscGeo, discMat);
    disc.position.set(fx, 1.05, fz);
    disc.rotation.y = yaw;
    disc.scale.setScalar(0.55);
    disc.renderOrder = 3;
    this.scene.add(disc);
    this.items.push({
      mesh: disc,
      age: 0,
      life: 0.28,
      grow: 1.35,
      kind: 'bash',
      startScale: 0.55,
    });

    const rimMat = new THREE.MeshBasicMaterial({
      color: 0xe8f6ff,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const rim = new THREE.Mesh(this.bashDiscGeo, rimMat);
    rim.position.set(fx + facing.x * 0.12, 1.05, fz + facing.z * 0.12);
    rim.rotation.y = yaw;
    rim.scale.setScalar(0.35);
    rim.renderOrder = 4;
    this.scene.add(rim);
    this.items.push({
      mesh: rim,
      age: 0,
      life: 0.2,
      grow: 1.7,
      kind: 'bash',
      startScale: 0.35,
    });

    const crescentMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const crescent = new THREE.Mesh(this.bashRingGeo, crescentMat);
    crescent.position.set(fx, 0.1, fz);
    crescent.rotation.y = yaw;
    crescent.scale.setScalar(0.45);
    crescent.renderOrder = 2;
    this.scene.add(crescent);
    this.items.push({
      mesh: crescent,
      age: 0,
      life: 0.36,
      grow: 1.55,
      kind: 'bash',
      startScale: 0.45,
    });
  }

  update(dt: number): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i]!;
      item.age += dt;
      const t = item.age / item.life;
      if (item.kind === 'bolt' && item.vel) {
        item.mesh.position.x += item.vel.x * dt;
        item.mesh.position.z += item.vel.z * dt;
        item.mesh.scale.set(0.7 + t * 0.2, 0.7 + t * 0.2, 1.4 + t * 0.6);
      } else if (item.kind === 'ring' || item.kind === 'seal' || item.kind === 'bash' || item.kind === 'ward') {
        const s = item.startScale + t * (item.grow - item.startScale);
        if (item.kind === 'bash') {
          // Expand mostly on X/Y so the upright disc reads as a shove, not a balloon.
          item.mesh.scale.set(s * (1 + t * 0.35), s, s * (1 + t * 0.15));
        } else {
          item.mesh.scale.setScalar(s);
        }
        if (item.kind === 'seal') {
          item.mesh.rotation.y += dt * 2.8;
        }
        if (item.kind === 'ward') {
          item.mesh.rotation.y += dt * 1.8;
        }
      } else {
        item.mesh.scale.set(1 + t * 0.45, 1 + t * 0.2, 1 + t * 0.45);
      }

      item.mesh.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.material && (mesh.material as THREE.Material).opacity !== undefined) {
          // Hold opacity a beat longer so rings stay readable mid-expand.
          const fade =
            item.kind === 'ring'
              ? Math.max(0, 1 - t * t)
              : item.kind === 'bash' || item.kind === 'bolt'
                ? Math.max(0, 1 - t * 1.15)
                : item.kind === 'ward'
                  ? Math.max(0, 0.55 * (1 - t * t))
                  : Math.max(0, 1 - t);
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
  private readonly spitOrigin = new THREE.Vector3();
  private readonly spitDir = new THREE.Vector3();
  private readonly spits: SpitProjectile[] = [];
  /** Brief i-frames after a player hit so stacked bites don't delete you. */
  private readonly playerHitIFrames = 0.55;
  /** Remaining real-time hit-stop (seconds). Countdown uses raw dt. */
  private hitStopRemain = 0;
  /** Cached from player buffs at skill cast time. */
  private playerDamageMult = 1;
  /** Flat damage from session leveling — applied before shrine mult. */
  private playerBonusDamage = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly hooks: CombatHooks,
  ) {
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

  /** Golden burst around the hero — readable level-up beat for Warrior and Mage. */
  playLevelUpFx(player: Player): void {
    this.fx.spawnRing(player.position, 0xffe08a, 3.1);
    this.fx.spawnRing(player.position, 0x7dff9a, 1.85);
    this.fx.spawnSeal(player.position, 0xffd76a);
    this.pulseHitStop(0.07);
  }

  update(dt: number, player?: Player): void {
    this.damageNumbers.update(dt);
    this.fx.update(dt);
    if (player) this.updateSpitProjectiles(dt, player);
  }

  tryPlayerSkill(player: Player, skillId: SkillId, mobs: Enemy[]): boolean {
    if (!player.canUse(skillId)) return false;
    player.startCooldown(skillId);
    player.markCombat();
    this.playerDamageMult = player.damageBuffMult;
    this.playerBonusDamage = player.bonusDamage;

    if (player.playerClass === 'mage') {
      return this.tryMageSkill(player, skillId, mobs);
    }
    return this.tryWarriorSkill(player, skillId, mobs);
  }

  private tryWarriorSkill(player: Player, skillId: SkillId, mobs: Enemy[]): boolean {
    const skill = player.skills[skillId].def;

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

    if (skillId === 'bash') {
      // Soft-lock a nearby target so the shove faces something readable.
      const focus = this.pickSlashTarget(player, mobs, skill.range + 0.35);
      if (focus) {
        this.tmp.set(
          focus.position.x - player.position.x,
          0,
          focus.position.z - player.position.z,
        );
        player.faceDirection(this.tmp);
      }
      player.playBash();
      this.fx.spawnBash(player.position, player.facing, skill.color);
      this.fx.spawnSeal(player.position, 0xa8dcff);

      let hits = 0;
      for (const mob of mobs) {
        if (!mob.alive) continue;
        const dx = mob.position.x - player.position.x;
        const dz = mob.position.z - player.position.z;
        const dist = Math.hypot(dx, dz);
        const hitRange = skill.range + mob.radius * 0.4;
        if (dist > hitRange) continue;

        // Forward cone — side/rear blobs are for Quake, not the shield shove.
        let facing = 1;
        if (dist > 1e-4) {
          facing = (dx / dist) * player.facing.x + (dz / dist) * player.facing.z;
        }
        if (facing < 0.2) continue;
        // Widen slightly with skill.radius so a tight pack still catches 1–2 blobs.
        const lateral =
          dist > 1e-4
            ? Math.abs((-dz / dist) * player.facing.x + (dx / dist) * player.facing.z)
            : 0;
        if (lateral > skill.radius / Math.max(dist, 0.6)) continue;

        this.applyDamageToMob(mob, skill.damage, false);
        const push = 2.15 + (1 - Math.min(1, dist / hitRange)) * 0.55;
        mob.applyKnockback(dx, dz, push, 0.9);
        hits += 1;
      }
      if (hits > 0) {
        this.pulseHitStop(0.05);
        this.hooks.onBashImpact?.(hits);
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

  private tryMageSkill(player: Player, skillId: SkillId, mobs: Enemy[]): boolean {
    const skill = player.skills[skillId].def;

    if (skillId === 'basic') {
      // Arcane Bolt — longer-range soft-lock single target.
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
      const travel = target
        ? Math.hypot(
            target.position.x - player.position.x,
            target.position.z - player.position.z,
          )
        : skill.range * 0.85;
      this.fx.spawnBolt(player.position, player.facing, skill.color, travel);
      if (target) {
        this.applyDamageToMob(target, skill.damage, false);
        this.pulseHitStop(0.04);
      }
      return true;
    }

    if (skillId === 'bash') {
      // Arcane Ward — personal bubble: i-frames + small heal (no damage).
      player.playBash();
      this.fx.spawnWard(player.position, skill.color);
      player.invuln = Math.max(player.invuln, 1.35);
      player.heal(14);
      return true;
    }

    // Frost Nova — AoE damage + slow (distinct from Warrior Quake).
    player.playQuake();
    this.fx.spawnRing(player.position, skill.color, skill.radius);
    this.fx.spawnSeal(player.position, 0xb8f0ff);
    let hits = 0;
    for (const mob of mobs) {
      if (!mob.alive) continue;
      const reach = skill.radius + mob.radius * 0.35;
      const d2 = dist2(player.position.x, player.position.z, mob.position.x, mob.position.z);
      if (d2 <= reach * reach) {
        this.applyDamageToMob(mob, skill.damage, true);
        mob.applySlow(2.6);
        hits += 1;
      }
    }
    if (hits > 0) {
      this.pulseHitStop(0.05);
      this.hooks.onQuakeImpact?.(hits);
    }
    return true;
  }

  updateMobCombat(mobs: Enemy[], player: Player): void {
    for (const mob of mobs) {
      mob.think(player.position, player.alive);
      if (!mob.tryAttack()) continue;

      if (mob instanceof Spitter) {
        if (mob.consumeSpitRequest()) {
          mob.getSpitOrigin(this.spitOrigin);
          mob.getFacingXZ(this.spitDir);
          const spit = new SpitProjectile(
            this.spitOrigin,
            this.spitDir.x,
            this.spitDir.z,
            mob.attackDamage,
            mob.spitSpeed,
          );
          this.scene.add(spit.mesh);
          this.spits.push(spit);
          // Tiny muzzle flash at the snout.
          this.fx.spawnSeal(this.spitOrigin, 0xb8ff4a);
        }
        continue;
      }

      // Melee blob bite
      if (player.alive && player.invuln <= 0) {
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

  private updateSpitProjectiles(dt: number, player: Player): void {
    for (let i = this.spits.length - 1; i >= 0; i--) {
      const spit = this.spits[i]!;
      spit.update(dt);
      if (!spit.alive) {
        this.scene.remove(spit.mesh);
        spit.dispose();
        this.spits.splice(i, 1);
        continue;
      }
      if (!player.alive || player.invuln > 0) continue;
      if (!spit.hits(player.position.x, player.position.z, player.radius)) continue;

      const dealt = player.takeDamage(spit.damage);
      spit.alive = false;
      this.scene.remove(spit.mesh);
      spit.dispose();
      this.spits.splice(i, 1);
      if (dealt > 0) {
        player.invuln = this.playerHitIFrames;
        player.markCombat();
        this.damageNumbers.spawn(player.position, dealt, false);
        this.hooks.onPlayerDamaged();
      }
    }
  }

  /**
   * Soft-lock assist: prefer the nearest living mob in a forward cone,
   * but allow a short all-around grab so standing still still feels fair.
   */
  private pickSlashTarget(player: Player, mobs: Enemy[], range: number): Enemy | null {
    let best: Enemy | null = null;
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

  private applyDamageToMob(mob: Enemy, damage: number, crit: boolean): void {
    // Flat level bonus + shrine blessing scale outgoing skill damage for both classes.
    // Zero-damage skills (Arcane Ward) never reach here.
    const withLevel = damage + this.playerBonusDamage;
    const scaled = Math.round(withLevel * this.playerDamageMult);
    const dealt = mob.takeDamage(scaled + (crit ? 4 : 0));
    if (dealt <= 0) return;
    mob.playHitReact();
    this.damageNumbers.spawn(mob.position, dealt, crit);
    if (!mob.alive) {
      this.hooks.onKill(mob);
      const loot = new LootPickup(mob.position);
      this.hooks.onLootDrop(loot);
    }
  }

  private pulseHitStop(seconds: number): void {
    this.hitStopRemain = Math.max(this.hitStopRemain, seconds);
  }
}
