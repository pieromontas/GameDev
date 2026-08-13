import * as THREE from 'three';
import { Palette, createToonMaterial } from '../render/stylized';

const INTERACT_RADIUS = 3.6;
const PICK_BURST_DURATION = 0.7;

/**
 * Glowing misty-grove herb cluster — gatherable heal pickup.
 * Ready = soft green pulse; depleted = hidden until respawn.
 */
export class GroveHerb {
  readonly mesh: THREE.Group;
  readonly position: THREE.Vector3;
  readonly interactRadius = INTERACT_RADIUS;

  private cooldownRemain = 0;
  private readonly cooldownMax: number;
  private age = 0;
  private pickBurstT = -1;

  private readonly leafMat: THREE.MeshToonMaterial;
  private readonly budMat: THREE.MeshToonMaterial;
  private readonly glowMat: THREE.MeshToonMaterial;
  private readonly plantRoot: THREE.Group;
  private readonly glowMesh: THREE.Mesh;
  private readonly sparkles: THREE.Mesh[] = [];
  private readonly burstSparks: THREE.Mesh[] = [];

  constructor(position: THREE.Vector3, cooldownSeconds: number) {
    this.position = position.clone();
    this.cooldownMax = cooldownSeconds;
    this.mesh = new THREE.Group();
    this.mesh.name = 'GroveHerb';
    this.mesh.position.copy(this.position);

    const stemMat = createToonMaterial(Palette.stem);
    this.leafMat = createToonMaterial(Palette.leafB, {
      emissive: Palette.moss,
      emissiveIntensity: 0.18,
    });
    this.budMat = createToonMaterial(Palette.flowerCyan, {
      emissive: Palette.flowerCyan,
      emissiveIntensity: 0.75,
    });
    this.glowMat = createToonMaterial(Palette.flowerWhite, {
      emissive: Palette.moss,
      emissiveIntensity: 0.9,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });

    this.plantRoot = new THREE.Group();
    this.plantRoot.name = 'GroveHerbPlant';
    this.mesh.add(this.plantRoot);

    // Tiny mossy mound so the cluster reads on the dirt
    const mound = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 7, 5, 0, Math.PI * 2, 0, Math.PI * 0.55),
      createToonMaterial(Palette.moss),
    );
    mound.position.y = 0.02;
    mound.scale.set(1.15, 0.35, 1.05);
    mound.castShadow = true;
    mound.receiveShadow = true;
    this.plantRoot.add(mound);

    // Three stems with glowing buds
    const stems: Array<[number, number, number, number]> = [
      [0, 0, 0.95, 0],
      [-0.22, 0.16, 0.78, 0.35],
      [0.2, -0.14, 0.72, -0.4],
    ];
    for (const [ox, oz, h, lean] of stems) {
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.05, h, 5),
        stemMat,
      );
      stem.position.set(ox, h * 0.5, oz);
      stem.rotation.z = lean * 0.25;
      stem.rotation.x = lean * 0.15;
      stem.castShadow = true;
      this.plantRoot.add(stem);

      const leaf = new THREE.Mesh(
        new THREE.SphereGeometry(0.14, 6, 5),
        this.leafMat,
      );
      leaf.position.set(ox + lean * 0.12, h * 0.45, oz + 0.08);
      leaf.scale.set(1.35, 0.35, 0.85);
      leaf.rotation.z = lean;
      leaf.castShadow = true;
      this.plantRoot.add(leaf);

      const bud = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.11, 0),
        this.budMat,
      );
      bud.position.set(ox + lean * 0.05, h + 0.08, oz);
      bud.castShadow = true;
      this.plantRoot.add(bud);
    }

    // Soft aura so it reads as gatherable at iso distance
    this.glowMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 10, 8),
      this.glowMat,
    );
    this.glowMesh.position.y = 0.55;
    this.plantRoot.add(this.glowMesh);

    for (let i = 0; i < 5; i++) {
      const spark = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.05 + (i % 2) * 0.015, 0),
        createToonMaterial(Palette.flowerWhite, {
          emissive: Palette.flowerCyan,
          emissiveIntensity: 1.1,
          transparent: true,
          opacity: 0.85,
          depthWrite: false,
        }),
      );
      spark.userData.phase = (i / 5) * Math.PI * 2;
      spark.userData.radius = 0.28 + (i % 3) * 0.08;
      spark.userData.speed = 1.2 + (i % 3) * 0.25;
      this.sparkles.push(spark);
      this.plantRoot.add(spark);
    }

    for (let i = 0; i < 8; i++) {
      const burst = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.07, 0),
        createToonMaterial(Palette.flowerWhite, {
          emissive: Palette.moss,
          emissiveIntensity: 1.3,
          transparent: true,
          opacity: 0,
          depthWrite: false,
        }),
      );
      burst.visible = false;
      burst.userData.angle = (i / 8) * Math.PI * 2;
      this.burstSparks.push(burst);
      this.mesh.add(burst);
    }
  }

  get ready(): boolean {
    return this.cooldownRemain <= 0;
  }

  get cooldownRemaining(): number {
    return this.cooldownRemain;
  }

  isNear(pos: THREE.Vector3): boolean {
    const dx = pos.x - this.position.x;
    const dz = pos.z - this.position.z;
    const r = this.interactRadius;
    return dx * dx + dz * dz <= r * r;
  }

  /** Begin pickup. Returns false if still respawning. */
  beginPickup(): boolean {
    if (!this.ready) return false;
    this.cooldownRemain = this.cooldownMax;
    this.pickBurstT = 0;
    this.plantRoot.visible = false;
    for (const burst of this.burstSparks) {
      burst.visible = true;
      burst.position.set(0, 0.4, 0);
      const mat = burst.material as THREE.MeshToonMaterial;
      mat.opacity = 1;
    }
    return true;
  }

  update(dt: number): void {
    this.age += dt;
    if (this.cooldownRemain > 0) {
      this.cooldownRemain = Math.max(0, this.cooldownRemain - dt);
      if (this.ready) {
        this.plantRoot.visible = true;
      }
    }

    const active = this.ready && this.plantRoot.visible;
    const pulse = 0.55 + Math.sin(this.age * 3.1) * 0.45;

    if (active) {
      this.budMat.emissiveIntensity = 0.55 + pulse * 0.55;
      this.leafMat.emissiveIntensity = 0.12 + pulse * 0.16;
      this.glowMat.emissiveIntensity = 0.7 + pulse * 0.45;
      this.glowMat.opacity = 0.32 + pulse * 0.22;
      this.glowMesh.scale.setScalar(0.92 + pulse * 0.16);
      this.plantRoot.position.y = Math.sin(this.age * 2.4) * 0.03;
    }

    for (let i = 0; i < this.sparkles.length; i++) {
      const spark = this.sparkles[i]!;
      if (!active) {
        spark.visible = false;
        continue;
      }
      spark.visible = true;
      const phase = spark.userData.phase as number;
      const radius = spark.userData.radius as number;
      const speed = spark.userData.speed as number;
      const t = this.age * speed + phase;
      spark.position.set(
        Math.cos(t) * radius,
        0.35 + ((t * 0.3) % 0.9),
        Math.sin(t) * radius,
      );
      spark.rotation.y += dt * 2.4;
      const mat = spark.material as THREE.MeshToonMaterial;
      mat.opacity = 0.45 + Math.sin(t * 2.2) * 0.35;
    }

    if (this.pickBurstT >= 0) {
      this.pickBurstT += dt;
      const t = Math.min(1, this.pickBurstT / PICK_BURST_DURATION);
      const ease = 1 - (1 - t) * (1 - t);
      for (let i = 0; i < this.burstSparks.length; i++) {
        const burst = this.burstSparks[i]!;
        const a = burst.userData.angle as number;
        const r = 0.15 + ease * 0.95;
        burst.position.set(
          Math.cos(a + ease) * r,
          0.35 + ease * 1.6,
          Math.sin(a + ease) * r,
        );
        burst.rotation.y += dt * 4;
        const mat = burst.material as THREE.MeshToonMaterial;
        mat.opacity = (1 - t) * 0.95;
        mat.emissiveIntensity = 1.1 + (1 - t) * 0.5;
      }
      if (t >= 1) {
        this.pickBurstT = -1;
        for (const burst of this.burstSparks) burst.visible = false;
      }
    }
  }
}
