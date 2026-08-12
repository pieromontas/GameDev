import * as THREE from 'three';
import { Palette, createToonMaterial } from '../render/stylized';

const INTERACT_RADIUS = 3.4;
const OPEN_LID_ANGLE = -1.15; // ~66° — readable from iso camera
const OPEN_DURATION = 0.38;

/**
 * Stylized low-poly treasure chest — closed lock glitter vs hinged-open lid.
 * One-shot interactable; never re-closes once looted.
 */
export class TreasureChest {
  readonly mesh: THREE.Group;
  readonly position: THREE.Vector3;
  readonly interactRadius = INTERACT_RADIUS;
  /** Soft collision radius for meadow obstacle resolution. */
  readonly obstacleRadius = 0.85;
  opened = false;

  private readonly lidPivot: THREE.Group;
  private readonly lockMesh: THREE.Mesh;
  private readonly lockMat: THREE.MeshToonMaterial;
  private readonly glitterMat: THREE.MeshToonMaterial;
  private readonly innerGlow: THREE.Mesh;
  private openT = 0;
  private opening = false;
  private age = 0;

  constructor(position: THREE.Vector3, yaw = 0) {
    this.position = position.clone();
    this.mesh = new THREE.Group();
    this.mesh.name = 'TreasureChest';
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = yaw;

    const wood = createToonMaterial(Palette.wood);
    const woodDark = createToonMaterial(Palette.woodDark);
    const trim = createToonMaterial(Palette.warriorTrimGold, {
      emissive: Palette.warriorTrimGold,
      emissiveIntensity: 0.18,
    });
    this.lockMat = createToonMaterial(Palette.lootGold, {
      emissive: Palette.lootGold,
      emissiveIntensity: 0.75,
    });
    this.glitterMat = createToonMaterial(Palette.flowerYellow, {
      emissive: Palette.lootGold,
      emissiveIntensity: 0.9,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });

    // Body
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.58, 0.72), wood);
    body.position.y = 0.34;
    body.castShadow = true;
    body.receiveShadow = true;
    this.mesh.add(body);

    const base = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.1, 0.78), woodDark);
    base.position.y = 0.05;
    base.castShadow = true;
    this.mesh.add(base);

    // Gold band around the body
    const band = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.1, 0.74), trim);
    band.position.y = 0.42;
    this.mesh.add(band);

    // Lid hinge pivot sits on the back top edge of the body
    this.lidPivot = new THREE.Group();
    this.lidPivot.position.set(0, 0.63, -0.34);
    this.mesh.add(this.lidPivot);

    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.22, 0.72), wood);
    lid.position.set(0, 0.11, 0.34);
    lid.castShadow = true;
    this.lidPivot.add(lid);

    const lidTrim = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.06, 0.74), trim);
    lidTrim.position.set(0, 0.22, 0.34);
    this.lidPivot.add(lidTrim);

    // Front lock plate (hidden when open)
    this.lockMesh = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.28, 0.1), this.lockMat);
    this.lockMesh.position.set(0, 0.52, 0.4);
    this.lockMesh.castShadow = true;
    this.mesh.add(this.lockMesh);

    // Closed-state glitter spark above the lock — pulses so it pops at distance
    const glitter = new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 0), this.glitterMat);
    glitter.position.set(0, 0.95, 0.15);
    glitter.name = 'chestGlitter';
    this.mesh.add(glitter);

    // Warm inner glow revealed when the lid opens
    this.innerGlow = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 10, 8),
      createToonMaterial(Palette.lootGold, {
        emissive: Palette.lootGold,
        emissiveIntensity: 1.1,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    );
    this.innerGlow.position.set(0, 0.38, 0);
    this.mesh.add(this.innerGlow);
  }

  isNear(pos: THREE.Vector3): boolean {
    const dx = pos.x - this.position.x;
    const dz = pos.z - this.position.z;
    const r = this.interactRadius;
    return dx * dx + dz * dz <= r * r;
  }

  /** Begin one-shot open anim. Returns false if already opened / opening. */
  beginOpen(): boolean {
    if (this.opened || this.opening) return false;
    this.opening = true;
    this.openT = 0;
    return true;
  }

  update(dt: number): void {
    this.age += dt;

    if (this.opening) {
      this.openT += dt;
      const t = Math.min(1, this.openT / OPEN_DURATION);
      const ease = 1 - (1 - t) * (1 - t) * (1 - t);
      this.lidPivot.rotation.x = OPEN_LID_ANGLE * ease;

      const lockFade = Math.max(0, 1 - t * 1.4);
      this.lockMat.emissiveIntensity = 0.75 * lockFade;
      this.lockMesh.visible = lockFade > 0.05;
      this.glitterMat.opacity = 0.85 * lockFade;

      const glowMat = this.innerGlow.material as THREE.MeshToonMaterial;
      glowMat.opacity = ease * 0.72;
      glowMat.emissiveIntensity = 0.55 + ease * 0.7;

      if (t >= 1) {
        this.opening = false;
        this.opened = true;
        this.lockMesh.visible = false;
        this.glitterMat.opacity = 0;
      }
    }

    // Idle glitter pulse while closed — readable from the follow camera
    if (!this.opened && !this.opening) {
      const pulse = 0.55 + Math.sin(this.age * 3.2) * 0.4;
      this.lockMat.emissiveIntensity = 0.45 + pulse * 0.55;
      this.glitterMat.opacity = 0.55 + pulse * 0.4;
      const glitter = this.mesh.getObjectByName('chestGlitter');
      if (glitter) {
        glitter.rotation.y += dt * 2.4;
        glitter.position.y = 0.95 + Math.sin(this.age * 4.1) * 0.06;
      }
    } else if (this.opened) {
      const glowMat = this.innerGlow.material as THREE.MeshToonMaterial;
      glowMat.emissiveIntensity = 0.85 + Math.sin(this.age * 2.2) * 0.2;
    }
  }
}
