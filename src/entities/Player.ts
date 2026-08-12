import * as THREE from 'three';
import { Entity } from './Entity';
import { SkillId, SkillState, createWarriorSkills } from '../combat/Skills';
import { Palette, createToonMaterial } from '../render/stylized';
import { clamp01, easeOutCubic, smoothstep, strikeCurve } from '../anim/ease';

export type PlayerAnim = 'idle' | 'move' | 'slash' | 'quake';

/**
 * Stylized novice swordsman — articulated low-poly rig with procedural anims.
 * Gameplay hit radius / movement stay on the Entity root.
 */
export class Player extends Entity {
  readonly maxSpeed = 7.8;
  readonly accel = 52;
  readonly friction = 64;
  readonly skills: Record<SkillId, SkillState>;
  facing = new THREE.Vector3(0, 0, -1);
  invuln = 0;
  /** Seconds since last combat event; regen starts after a short delay. */
  outOfCombat = 0;

  private readonly velocity = new THREE.Vector3();
  private anim: PlayerAnim = 'idle';
  private animT = 0;
  private animDur = 0;
  private movePhase = 0;
  private breathe = 0;

  // Rig nodes
  private readonly hips: THREE.Group;
  private readonly torso: THREE.Group;
  private readonly head: THREE.Group;
  private readonly leftShoulder: THREE.Group;
  private readonly rightShoulder: THREE.Group;
  private readonly leftArm: THREE.Group;
  private readonly rightArm: THREE.Group;
  private readonly swordPivot: THREE.Group;
  private readonly leftLeg: THREE.Group;
  private readonly rightLeg: THREE.Group;
  private readonly shield: THREE.Object3D;
  private readonly chestMats: THREE.MeshToonMaterial[] = [];
  private readonly baseLeather = Palette.warriorLeather;

  constructor() {
    const group = new THREE.Group();

    const leather = createToonMaterial(Palette.warriorLeather);
    const leatherDark = createToonMaterial(Palette.warriorLeatherDark);
    const leatherLight = createToonMaterial(Palette.warriorLeatherLight);
    const trim = createToonMaterial(Palette.warriorTrim, {
      emissive: Palette.warriorTrim,
      emissiveIntensity: 0.06,
    });
    const gold = createToonMaterial(Palette.warriorTrimGold, {
      emissive: Palette.warriorTrimGold,
      emissiveIntensity: 0.12,
    });
    const skin = createToonMaterial(Palette.warriorSkin);
    const hair = createToonMaterial(Palette.warriorHair);
    const steel = createToonMaterial(Palette.warriorSteel);
    const steelDark = createToonMaterial(Palette.warriorSteelDark);
    const boot = createToonMaterial(Palette.warriorBoot);
    const cloth = createToonMaterial(Palette.warriorCloth);

    const hips = new THREE.Group();
    hips.position.y = 0.72;
    group.add(hips);

    // Pelvis / skirt flap for silhouette
    const pelvis = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.18, 3, 8), leatherDark);
    pelvis.scale.set(1.15, 1, 0.85);
    pelvis.position.y = -0.02;
    pelvis.castShadow = true;
    hips.add(pelvis);

    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 6, 14), gold);
    belt.rotation.x = Math.PI / 2;
    belt.position.y = 0.12;
    hips.add(belt);
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.08), trim);
    buckle.position.set(0, 0.12, 0.22);
    hips.add(buckle);

    // Legs
    const leftLeg = new THREE.Group();
    leftLeg.position.set(-0.16, -0.08, 0);
    hips.add(leftLeg);
    const rightLeg = new THREE.Group();
    rightLeg.position.set(0.16, -0.08, 0);
    hips.add(rightLeg);

    const thighGeo = new THREE.CapsuleGeometry(0.11, 0.28, 3, 6);
    const leftThigh = new THREE.Mesh(thighGeo, leather);
    leftThigh.position.y = -0.22;
    leftThigh.castShadow = true;
    leftLeg.add(leftThigh);
    const rightThigh = new THREE.Mesh(thighGeo, leather);
    rightThigh.position.y = -0.22;
    rightThigh.castShadow = true;
    rightLeg.add(rightThigh);

    const shinGeo = new THREE.CapsuleGeometry(0.095, 0.22, 3, 6);
    const leftShin = new THREE.Mesh(shinGeo, leatherDark);
    leftShin.position.y = -0.52;
    leftShin.castShadow = true;
    leftLeg.add(leftShin);
    const rightShin = new THREE.Mesh(shinGeo, leatherDark);
    rightShin.position.y = -0.52;
    rightShin.castShadow = true;
    rightLeg.add(rightShin);

    // Greaves / boots with silver trim plates
    const bootGeo = new THREE.BoxGeometry(0.2, 0.16, 0.32);
    const leftBoot = new THREE.Mesh(bootGeo, boot);
    leftBoot.position.set(0, -0.7, 0.04);
    leftBoot.castShadow = true;
    leftLeg.add(leftBoot);
    const rightBoot = new THREE.Mesh(bootGeo, boot);
    rightBoot.position.set(0, -0.7, 0.04);
    rightBoot.castShadow = true;
    rightLeg.add(rightBoot);

    const greaveGeo = new THREE.BoxGeometry(0.22, 0.14, 0.18);
    const leftGreave = new THREE.Mesh(greaveGeo, trim);
    leftGreave.position.set(0, -0.58, 0.06);
    leftLeg.add(leftGreave);
    const rightGreave = new THREE.Mesh(greaveGeo, trim);
    rightGreave.position.set(0, -0.58, 0.06);
    rightLeg.add(rightGreave);

    // Torso
    const torso = new THREE.Group();
    torso.position.y = 0.18;
    hips.add(torso);

    // Rounded cuirass — reads as armor mass, not a crate, at iso distance
    const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.42, 4, 10), leather);
    chest.scale.set(1.15, 1, 0.85);
    chest.position.y = 0.4;
    chest.castShadow = true;
    torso.add(chest);

    const chestPlate = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), leatherLight);
    chestPlate.scale.set(1.15, 1.05, 0.55);
    chestPlate.position.set(0, 0.42, 0.18);
    torso.add(chestPlate);

    const collar = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), cloth);
    collar.scale.set(1.35, 0.45, 1.1);
    collar.position.y = 0.78;
    torso.add(collar);

    // Head
    const head = new THREE.Group();
    head.position.y = 0.95;
    torso.add(head);

    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), skin);
    skull.scale.set(1, 1.05, 0.95);
    skull.castShadow = true;
    head.add(skull);

    // Messy brown hair clumps — oversized for iso readability
    const hairMain = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), hair);
    hairMain.position.set(0, 0.1, -0.04);
    hairMain.scale.set(1.1, 0.9, 1.15);
    head.add(hairMain);
    const bangL = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), hair);
    bangL.position.set(-0.16, 0.08, 0.2);
    bangL.scale.set(0.85, 1.2, 0.75);
    head.add(bangL);
    const bangR = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), hair);
    bangR.position.set(0.14, 0.12, 0.18);
    bangR.scale.set(0.8, 1.35, 0.75);
    head.add(bangR);
    const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 6), hair);
    tuft.position.set(0.06, 0.3, -0.06);
    tuft.scale.set(0.75, 1.45, 0.75);
    head.add(tuft);
    const sideL = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 6), hair);
    sideL.position.set(-0.22, 0.0, 0.02);
    sideL.scale.set(0.7, 1.1, 0.8);
    head.add(sideL);

    // Eyes oversized for follow-cam readability
    const eyeGeo = new THREE.SphereGeometry(0.045, 6, 6);
    const eyeMat = createToonMaterial(0x2a1a14);
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.09, 0.02, 0.24);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeR.position.set(0.09, 0.02, 0.24);
    head.add(eyeL, eyeR);

    // Shoulders / arms
    const leftShoulder = new THREE.Group();
    leftShoulder.position.set(-0.42, 0.68, 0);
    torso.add(leftShoulder);
    const rightShoulder = new THREE.Group();
    rightShoulder.position.set(0.42, 0.68, 0);
    torso.add(rightShoulder);

    const padGeo = new THREE.SphereGeometry(0.2, 10, 8);
    const leftPad = new THREE.Mesh(padGeo, leatherDark);
    leftPad.scale.set(1.15, 0.7, 1.25);
    leftPad.position.set(-0.08, 0.04, 0);
    leftPad.castShadow = true;
    leftShoulder.add(leftPad);
    const leftPadTrim = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.035, 6, 12), trim);
    leftPadTrim.rotation.x = Math.PI / 2;
    leftPadTrim.position.set(-0.08, 0.1, 0);
    leftShoulder.add(leftPadTrim);

    const rightPad = new THREE.Mesh(padGeo, leatherDark);
    rightPad.scale.set(1.15, 0.7, 1.25);
    rightPad.position.set(0.08, 0.04, 0);
    rightPad.castShadow = true;
    rightShoulder.add(rightPad);
    const rightPadTrim = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.035, 6, 12), trim);
    rightPadTrim.rotation.x = Math.PI / 2;
    rightPadTrim.position.set(0.08, 0.1, 0);
    rightShoulder.add(rightPadTrim);

    const leftArm = new THREE.Group();
    leftArm.position.set(-0.1, -0.08, 0);
    leftShoulder.add(leftArm);
    const rightArm = new THREE.Group();
    rightArm.position.set(0.1, -0.08, 0);
    rightShoulder.add(rightArm);

    const upperArmGeo = new THREE.CapsuleGeometry(0.09, 0.26, 3, 6);
    const leftUpper = new THREE.Mesh(upperArmGeo, leather);
    leftUpper.position.y = -0.2;
    leftUpper.castShadow = true;
    leftArm.add(leftUpper);
    const rightUpper = new THREE.Mesh(upperArmGeo, leather);
    rightUpper.position.y = -0.2;
    rightUpper.castShadow = true;
    rightArm.add(rightUpper);

    const gauntletGeo = new THREE.BoxGeometry(0.16, 0.22, 0.16);
    const leftGaunt = new THREE.Mesh(gauntletGeo, trim);
    leftGaunt.position.y = -0.42;
    leftArm.add(leftGaunt);
    const rightGaunt = new THREE.Mesh(gauntletGeo, trim);
    rightGaunt.position.y = -0.42;
    rightArm.add(rightGaunt);

    // Round shield (off-hand)
    const shield = new THREE.Group();
    shield.position.set(-0.12, -0.48, 0.12);
    leftArm.add(shield);
    const shieldDisk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.36, 0.08, 12),
      leatherDark,
    );
    shieldDisk.rotation.z = Math.PI / 2;
    shieldDisk.rotation.y = 0.45;
    shieldDisk.castShadow = true;
    shield.add(shieldDisk);
    const shieldBoss = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), gold);
    shieldBoss.position.set(-0.05, 0, 0.08);
    shield.add(shieldBoss);
    const shieldRim = new THREE.Mesh(
      new THREE.TorusGeometry(0.34, 0.03, 6, 16),
      trim,
    );
    shieldRim.rotation.y = Math.PI / 2 + 0.45;
    shield.add(shieldRim);

    // Sword with readable swing mass
    const swordPivot = new THREE.Group();
    swordPivot.position.set(0.08, -0.45, 0.05);
    rightArm.add(swordPivot);

    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.3, 8), boot);
    grip.position.y = -0.05;
    swordPivot.add(grip);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.14), gold);
    guard.position.y = 0.14;
    swordPivot.add(guard);
    // Wide blade for readable swing mass
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.15, 0.05), steel);
    blade.position.y = 0.74;
    blade.castShadow = true;
    swordPivot.add(blade);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.2, 6), steel);
    tip.position.y = 1.4;
    swordPivot.add(tip);
    const fuller = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.85, 0.06), steelDark);
    fuller.position.y = 0.7;
    swordPivot.add(fuller);
    const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), gold);
    pommel.position.y = -0.24;
    swordPivot.add(pommel);

    // Soft contact shadow disc
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.42, 16),
      createToonMaterial(0x1a2818, { transparent: true, opacity: 0.28 }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    group.add(shadow);

    super(group, 'player', 120, 0.5);
    this.hips = hips;
    this.torso = torso;
    this.head = head;
    this.leftShoulder = leftShoulder;
    this.rightShoulder = rightShoulder;
    this.leftArm = leftArm;
    this.rightArm = rightArm;
    this.swordPivot = swordPivot;
    this.leftLeg = leftLeg;
    this.rightLeg = rightLeg;
    this.shield = shield;
    this.chestMats.push(leather, leatherLight, leatherDark);
    this.skills = createWarriorSkills();
    this.position.set(0, 0, 6);
    this.syncMesh();
    this.resetPose();
  }

  get moveSpeed(): number {
    return this.maxSpeed;
  }

  get animState(): PlayerAnim {
    return this.anim;
  }

  tickSkills(dt: number): void {
    for (const skill of Object.values(this.skills)) {
      if (skill.cooldownRemaining > 0) {
        skill.cooldownRemaining = Math.max(0, skill.cooldownRemaining - dt);
      }
    }
    if (this.invuln > 0) this.invuln = Math.max(0, this.invuln - dt);
  }

  canUse(id: SkillId): boolean {
    return this.alive && this.skills[id].cooldownRemaining <= 0;
  }

  startCooldown(id: SkillId): void {
    const skill = this.skills[id];
    skill.cooldownRemaining = skill.def.cooldown;
  }

  markCombat(): void {
    this.outOfCombat = 0;
  }

  /** Trigger Slash swing — duration synced to ~0.4s basic CD window. */
  playSlash(): void {
    this.anim = 'slash';
    this.animT = 0;
    this.animDur = 0.38;
  }

  /** Trigger Quake stomp / impact pose. */
  playQuake(): void {
    this.anim = 'quake';
    this.animT = 0;
    this.animDur = 0.55;
  }

  faceDirection(dir: THREE.Vector3): void {
    if (dir.lengthSq() < 1e-6) return;
    this.facing.copy(dir).normalize();
    const yaw = Math.atan2(this.facing.x, this.facing.z);
    this.mesh.rotation.y = yaw;
  }

  /**
   * Accelerate toward a camera-relative wish direction; apply friction when idle.
   * Returns true if the player has meaningful horizontal velocity.
   */
  applyMovement(wishDir: THREE.Vector3, dt: number): boolean {
    // Lock locomotion facing during attack poses, but still allow small drift.
    const attacking = this.anim === 'slash' || this.anim === 'quake';
    if (wishDir.lengthSq() > 1e-6) {
      const accelScale = attacking ? 0.35 : 1;
      this.velocity.x += wishDir.x * this.accel * accelScale * dt;
      this.velocity.z += wishDir.z * this.accel * accelScale * dt;
      const speed = Math.hypot(this.velocity.x, this.velocity.z);
      const cap = attacking ? this.maxSpeed * 0.45 : this.maxSpeed;
      if (speed > cap) {
        const s = cap / speed;
        this.velocity.x *= s;
        this.velocity.z *= s;
      }
      if (!attacking) this.faceDirection(wishDir);
    } else {
      const speed = Math.hypot(this.velocity.x, this.velocity.z);
      if (speed > 0) {
        const newSpeed = Math.max(0, speed - this.friction * dt);
        if (newSpeed <= 1e-4) {
          this.velocity.set(0, 0, 0);
        } else {
          const s = newSpeed / speed;
          this.velocity.x *= s;
          this.velocity.z *= s;
        }
      }
    }

    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    return this.velocity.lengthSq() > 1e-4;
  }

  update(dt: number): void {
    this.breathe += dt;
    this.outOfCombat += dt;
    const speed = Math.hypot(this.velocity.x, this.velocity.z);

    if (this.anim === 'slash' || this.anim === 'quake') {
      this.animT += dt;
      if (this.animT >= this.animDur) {
        this.anim = speed > 0.4 ? 'move' : 'idle';
        this.animT = 0;
      }
    } else {
      this.anim = speed > 0.35 ? 'move' : 'idle';
    }

    if (this.anim === 'move') {
      this.movePhase += dt * (8.5 + speed * 0.55);
    } else if (this.anim === 'idle') {
      this.movePhase += dt * 2.2;
    }

    this.applyPose(speed);

    // Hit / i-frame material flash on leather mats
    if (this.hitFlash > 0) {
      this.hitFlash -= dt;
      for (const m of this.chestMats) m.color.setHex(0xffffff);
    } else if (this.invuln > 0) {
      const blink = Math.sin(this.invuln * 28) > 0;
      for (const m of this.chestMats) {
        m.color.setHex(blink ? 0xc8b090 : this.baseLeather);
      }
    } else {
      this.chestMats[0]!.color.setHex(Palette.warriorLeather);
      this.chestMats[1]!.color.setHex(Palette.warriorLeatherLight);
      this.chestMats[2]!.color.setHex(Palette.warriorLeatherDark);
    }

    if (this.alive && this.outOfCombat > 2.4 && this.hp < this.maxHp) {
      this.heal(8 * dt);
    }
  }

  respawn(): void {
    this.alive = true;
    this.hp = this.maxHp;
    this.position.set(0, 0, 6);
    this.velocity.set(0, 0, 0);
    this.mesh.visible = true;
    this.invuln = 1.6;
    this.outOfCombat = 0;
    this.anim = 'idle';
    this.animT = 0;
    this.resetPose();
    this.syncMesh();
  }

  private resetPose(): void {
    this.hips.position.y = 0.72;
    this.hips.rotation.set(0, 0, 0);
    this.torso.position.set(0, 0, 0);
    this.torso.scale.set(1, 1, 1);
    this.torso.rotation.set(0, 0, 0);
    this.head.rotation.set(0, 0, 0);
    this.leftShoulder.rotation.set(0, 0, 0);
    this.rightShoulder.rotation.set(0, 0, 0);
    this.leftArm.rotation.set(0.15, 0, 0.2);
    this.rightArm.rotation.set(0.15, 0, -0.2);
    this.swordPivot.rotation.set(0.15, 0, -0.55);
    this.leftLeg.rotation.set(0, 0, 0);
    this.rightLeg.rotation.set(0, 0, 0);
    this.shield.rotation.set(0, 0, 0);
  }

  private applyPose(speed: number): void {
    this.resetPose();
    const breath = Math.sin(this.breathe * 2.4) * 0.015;

    if (this.anim === 'slash') {
      this.applySlashPose(this.animT / this.animDur);
      return;
    }
    if (this.anim === 'quake') {
      this.applyQuakePose(this.animT / this.animDur);
      return;
    }

    // Idle breathe / walk cycle
    this.torso.position.y = breath;
    this.torso.scale.set(1 + breath * 0.6, 1 + breath * 1.2, 1 + breath * 0.6);
    this.head.rotation.x = breath * 0.8;

    if (this.anim === 'idle') {
      this.leftArm.rotation.x = 0.12 + Math.sin(this.breathe * 1.6) * 0.04;
      this.rightArm.rotation.x = 0.12 + Math.sin(this.breathe * 1.6 + 0.4) * 0.04;
      this.swordPivot.rotation.z = -0.55 + Math.sin(this.breathe * 1.3) * 0.04;
      this.hips.position.y = 0.72 + Math.abs(Math.sin(this.breathe * 1.8)) * 0.01;
      return;
    }

    // Walk / run cycle
    const phase = this.movePhase;
    const amp = THREE.MathUtils.clamp(speed / this.maxSpeed, 0.35, 1);
    const legSwing = Math.sin(phase) * 0.7 * amp;
    const armSwing = Math.sin(phase) * 0.55 * amp;
    const bob = Math.abs(Math.sin(phase)) * 0.06 * amp;

    this.hips.position.y = 0.72 + bob;
    this.hips.rotation.y = Math.sin(phase) * 0.08 * amp;
    this.torso.rotation.z = Math.sin(phase) * 0.05 * amp;
    this.torso.rotation.x = -0.06 * amp;

    this.leftLeg.rotation.x = legSwing;
    this.rightLeg.rotation.x = -legSwing;
    this.leftArm.rotation.x = -armSwing + 0.1;
    this.rightArm.rotation.x = armSwing + 0.1;
    this.swordPivot.rotation.x = armSwing * 0.35;
    this.swordPivot.rotation.z = -0.5 - Math.abs(armSwing) * 0.1;
    this.head.rotation.y = Math.sin(phase * 0.5) * 0.06;
  }

  private applySlashPose(t: number): void {
    const k = strikeCurve(t, 0.28);
    const wind = smoothstep(clamp01(t / 0.28));
    const follow = easeOutCubic(clamp01((t - 0.28) / 0.72));

    // Wind-up: sword up/back, then horizontal sweep
    this.hips.rotation.y = THREE.MathUtils.lerp(0.35, -0.55, k);
    this.torso.rotation.y = THREE.MathUtils.lerp(0.45, -0.7, k);
    this.torso.rotation.z = THREE.MathUtils.lerp(0.08, -0.12, k);

    this.rightShoulder.rotation.y = THREE.MathUtils.lerp(-0.2, 0.9, k);
    this.rightArm.rotation.x = THREE.MathUtils.lerp(-0.9, 0.35, k);
    this.rightArm.rotation.z = THREE.MathUtils.lerp(0.4, -0.85, k);
    this.swordPivot.rotation.x = THREE.MathUtils.lerp(-0.4, 0.5, k);
    this.swordPivot.rotation.z = THREE.MathUtils.lerp(-1.4, 0.2, k);
    this.swordPivot.rotation.y = THREE.MathUtils.lerp(0.2, -0.4, k);

    this.leftArm.rotation.x = -0.2 - wind * 0.2;
    this.leftArm.rotation.z = 0.55;
    this.shield.rotation.y = -0.2;

    this.leftLeg.rotation.x = THREE.MathUtils.lerp(-0.25, 0.35, follow);
    this.rightLeg.rotation.x = THREE.MathUtils.lerp(0.15, -0.2, follow);
    this.hips.position.y = 0.72 + Math.sin(k * Math.PI) * 0.04;
    this.head.rotation.y = this.torso.rotation.y * 0.35;
  }

  private applyQuakePose(t: number): void {
    const crouch = smoothstep(clamp01(t / 0.22));
    const launch = smoothstep(clamp01((t - 0.18) / 0.18));
    const impact = easeOutCubic(clamp01((t - 0.32) / 0.25));
    const settle = smoothstep(clamp01((t - 0.55) / 0.45));

    const down = crouch * (1 - launch) * 0.16;
    const hop = launch * (1 - impact) * 0.14;
    this.hips.position.y = 0.72 - down + hop - impact * 0.05 * (1 - settle);

    this.torso.rotation.x = crouch * 0.35 * (1 - launch) - impact * 0.15;
    this.leftLeg.rotation.x = -crouch * 0.55 + impact * 0.2;
    this.rightLeg.rotation.x = -crouch * 0.45 + impact * 0.15;

    // Arms raise then slam down
    const armsUp = Math.max(crouch, launch) * (1 - impact * 0.7);
    this.leftArm.rotation.x = -armsUp * 1.4 + impact * 0.5;
    this.rightArm.rotation.x = -armsUp * 1.5 + impact * 0.6;
    this.rightArm.rotation.z = -0.35;
    this.swordPivot.rotation.x = -armsUp * 0.8 + impact * 1.1;
    this.swordPivot.rotation.z = -0.3;
    this.head.rotation.x = -crouch * 0.2 + impact * 0.1;
  }
}
