import * as THREE from 'three';
import { Palette, createToonMaterial } from '../render/stylized';

const INTERACT_RADIUS = 4.2;
const SPARKLE_COUNT = 8;
const HEAL_BURST_DURATION = 0.85;

/**
 * Stylized healing spring / fountain landmark.
 * Active = bright aqua glow + idle sparkles; cooling = muted basin.
 */
export class HealingSpring {
  readonly mesh: THREE.Group;
  readonly position: THREE.Vector3;
  readonly interactRadius = INTERACT_RADIUS;
  /** Soft collision radius for meadow obstacle resolution. */
  readonly obstacleRadius = 1.15;

  private cooldownRemain = 0;
  private readonly cooldownMax: number;
  private age = 0;
  private healBurstT = -1;

  private readonly waterMat: THREE.MeshToonMaterial;
  private readonly columnMat: THREE.MeshToonMaterial;
  private readonly glowMat: THREE.MeshToonMaterial;
  private readonly sparkleMat: THREE.MeshToonMaterial;
  private readonly rimMat: THREE.MeshToonMaterial;
  private readonly waterMesh: THREE.Mesh;
  private readonly columnMesh: THREE.Mesh;
  private readonly glowMesh: THREE.Mesh;
  private readonly sparkles: THREE.Mesh[] = [];
  private readonly burstSparks: THREE.Mesh[] = [];

  constructor(position: THREE.Vector3, cooldownSeconds: number) {
    this.position = position.clone();
    this.cooldownMax = cooldownSeconds;
    this.mesh = new THREE.Group();
    this.mesh.name = 'HealingSpring';
    this.mesh.position.copy(this.position);

    const stone = createToonMaterial(Palette.rockLight);
    const stoneDark = createToonMaterial(Palette.rockShadow);
    const moss = createToonMaterial(Palette.moss);
    this.rimMat = createToonMaterial(Palette.rock, {
      emissive: Palette.flowerCyan,
      emissiveIntensity: 0.12,
    });
    this.waterMat = createToonMaterial(Palette.pond, {
      emissive: Palette.flowerCyan,
      emissiveIntensity: 0.55,
      transparent: true,
      opacity: 0.88,
    });
    this.columnMat = createToonMaterial(Palette.flowerCyan, {
      emissive: Palette.flowerCyan,
      emissiveIntensity: 0.85,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    });
    this.glowMat = createToonMaterial(Palette.flowerWhite, {
      emissive: Palette.flowerCyan,
      emissiveIntensity: 1.05,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    this.sparkleMat = createToonMaterial(Palette.flowerWhite, {
      emissive: Palette.flowerCyan,
      emissiveIntensity: 1.2,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });

    // Outer stone basin
    const basin = new THREE.Mesh(
      new THREE.CylinderGeometry(1.35, 1.55, 0.42, 10),
      stone,
    );
    basin.position.y = 0.22;
    basin.castShadow = true;
    basin.receiveShadow = true;
    this.mesh.add(basin);

    const basinLip = new THREE.Mesh(
      new THREE.TorusGeometry(1.28, 0.14, 6, 14),
      this.rimMat,
    );
    basinLip.rotation.x = Math.PI / 2;
    basinLip.position.y = 0.44;
    basinLip.castShadow = true;
    this.mesh.add(basinLip);

    // Inner pedestal
    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(0.38, 0.48, 0.7, 8),
      stoneDark,
    );
    pedestal.position.y = 0.55;
    pedestal.castShadow = true;
    this.mesh.add(pedestal);

    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.42, 0.16, 8),
      stone,
    );
    cap.position.y = 0.95;
    cap.castShadow = true;
    this.mesh.add(cap);

    // Moss accents on the rim
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.3;
      const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5), moss);
      tuft.position.set(Math.cos(a) * 1.2, 0.38, Math.sin(a) * 1.2);
      tuft.scale.set(1.1, 0.45, 0.9);
      this.mesh.add(tuft);
    }

    // Pool surface
    this.waterMesh = new THREE.Mesh(
      new THREE.CircleGeometry(1.05, 18),
      this.waterMat,
    );
    this.waterMesh.rotation.x = -Math.PI / 2;
    this.waterMesh.position.y = 0.4;
    this.mesh.add(this.waterMesh);

    // Rising water column from the spout
    this.columnMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.22, 1.1, 8),
      this.columnMat,
    );
    this.columnMesh.position.y = 1.45;
    this.mesh.add(this.columnMesh);

    // Soft radial glow above the basin
    this.glowMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 12, 10),
      this.glowMat,
    );
    this.glowMesh.position.y = 1.35;
    this.mesh.add(this.glowMesh);

    // Idle sparkles (orbit / rise)
    for (let i = 0; i < SPARKLE_COUNT; i++) {
      const spark = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.07 + (i % 3) * 0.02, 0),
        this.sparkleMat.clone(),
      );
      spark.userData.phase = (i / SPARKLE_COUNT) * Math.PI * 2;
      spark.userData.radius = 0.55 + (i % 4) * 0.18;
      spark.userData.speed = 1.1 + (i % 3) * 0.35;
      this.sparkles.push(spark);
      this.mesh.add(spark);
    }

    // One-shot heal burst sparkles (hidden until used)
    for (let i = 0; i < 10; i++) {
      const burst = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.1, 0),
        createToonMaterial(Palette.flowerWhite, {
          emissive: Palette.flowerCyan,
          emissiveIntensity: 1.4,
          transparent: true,
          opacity: 0,
          depthWrite: false,
        }),
      );
      burst.visible = false;
      burst.userData.angle = (i / 10) * Math.PI * 2;
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

  /** Begin heal use. Returns false if still cooling. */
  beginHeal(): boolean {
    if (!this.ready) return false;
    this.cooldownRemain = this.cooldownMax;
    this.healBurstT = 0;
    for (const burst of this.burstSparks) {
      burst.visible = true;
      burst.position.set(0, 0.6, 0);
      const mat = burst.material as THREE.MeshToonMaterial;
      mat.opacity = 1;
    }
    return true;
  }

  update(dt: number): void {
    this.age += dt;
    if (this.cooldownRemain > 0) {
      this.cooldownRemain = Math.max(0, this.cooldownRemain - dt);
    }

    const active = this.ready;
    const pulse = 0.55 + Math.sin(this.age * 2.8) * 0.45;

    if (active) {
      this.waterMat.emissiveIntensity = 0.45 + pulse * 0.45;
      this.waterMat.opacity = 0.82 + pulse * 0.1;
      this.columnMat.emissiveIntensity = 0.7 + pulse * 0.5;
      this.columnMat.opacity = 0.65 + pulse * 0.15;
      this.glowMat.emissiveIntensity = 0.85 + pulse * 0.4;
      this.glowMat.opacity = 0.4 + pulse * 0.25;
      this.rimMat.emissiveIntensity = 0.1 + pulse * 0.12;
      this.columnMesh.scale.y = 0.92 + pulse * 0.16;
      this.columnMesh.position.y = 1.45 + Math.sin(this.age * 3.4) * 0.06;
      this.glowMesh.scale.setScalar(0.95 + pulse * 0.18);
    } else {
      // Cooling — muted, still readable as the spring landmark
      const cdRatio = this.cooldownRemain / this.cooldownMax;
      this.waterMat.emissiveIntensity = 0.08 + (1 - cdRatio) * 0.12;
      this.waterMat.opacity = 0.55;
      this.columnMat.emissiveIntensity = 0.12;
      this.columnMat.opacity = 0.28;
      this.glowMat.emissiveIntensity = 0.15;
      this.glowMat.opacity = 0.12;
      this.rimMat.emissiveIntensity = 0.02;
      this.columnMesh.scale.y = 0.55;
      this.columnMesh.position.y = 1.25;
      this.glowMesh.scale.setScalar(0.7);
    }

    // Idle sparkles — lively when ready, faint when cooling
    for (let i = 0; i < this.sparkles.length; i++) {
      const spark = this.sparkles[i]!;
      const phase = spark.userData.phase as number;
      const radius = spark.userData.radius as number;
      const speed = spark.userData.speed as number;
      const t = this.age * speed + phase;
      const rise = ((t * 0.35) % 1.2);
      spark.position.set(
        Math.cos(t) * radius,
        0.55 + rise * (active ? 1.5 : 0.55),
        Math.sin(t) * radius,
      );
      spark.rotation.y += dt * 2.2;
      const mat = spark.material as THREE.MeshToonMaterial;
      mat.opacity = active
        ? 0.55 + Math.sin(t * 2) * 0.35
        : 0.12 + (1 - this.cooldownRemain / this.cooldownMax) * 0.15;
      spark.visible = mat.opacity > 0.08;
    }

    // Heal-use burst — sparkles rise and fade
    if (this.healBurstT >= 0) {
      this.healBurstT += dt;
      const t = Math.min(1, this.healBurstT / HEAL_BURST_DURATION);
      const ease = 1 - (1 - t) * (1 - t);
      for (let i = 0; i < this.burstSparks.length; i++) {
        const burst = this.burstSparks[i]!;
        const a = burst.userData.angle as number;
        const r = 0.3 + ease * 1.4;
        burst.position.set(
          Math.cos(a + ease) * r,
          0.7 + ease * 2.2,
          Math.sin(a + ease) * r,
        );
        burst.rotation.y += dt * 4;
        const mat = burst.material as THREE.MeshToonMaterial;
        mat.opacity = (1 - t) * 0.95;
        mat.emissiveIntensity = 1.2 + (1 - t) * 0.6;
      }
      // Extra flash on the column during the burst
      this.columnMat.emissiveIntensity = 1.4 * (1 - t) + 0.2;
      this.glowMat.opacity = 0.85 * (1 - t) + 0.1;
      if (t >= 1) {
        this.healBurstT = -1;
        for (const burst of this.burstSparks) burst.visible = false;
      }
    }
  }
}
