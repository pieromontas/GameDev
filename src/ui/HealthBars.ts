import * as THREE from 'three';
import { Entity } from '../entities/Entity';

type Bar = {
  root: THREE.Group;
  fill: THREE.Mesh;
  entity: Entity;
  height: number;
};

const bgGeo = new THREE.PlaneGeometry(1, 0.12);
const fillGeo = new THREE.PlaneGeometry(1, 0.12);

/** Reference camera distance used for soft world-space bar scaling. */
const REF_DISTANCE = 18;
const MIN_SCALE = 0.85;
const MAX_SCALE = 1.55;

/**
 * World-space camera-facing HP bars for enemies.
 * Player HP stays on the 2D HUD — do not track the player here.
 */
export class HealthBars {
  private readonly bars: Bar[] = [];
  private readonly root = new THREE.Group();
  private readonly _worldPos = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    this.root.name = 'HealthBars';
    scene.add(this.root);
  }

  track(entity: Entity, height = 2.1): void {
    // Player HP is shown on the HUD; skip world duplicate that can vanish at angles.
    if (entity.team === 'player') return;

    const group = new THREE.Group();
    group.renderOrder = 20;

    const bgMat = new THREE.MeshBasicMaterial({
      color: 0x1f2a24,
      transparent: true,
      opacity: 0.55,
      depthTest: false,
      depthWrite: false,
    });
    const fillMat = new THREE.MeshBasicMaterial({
      color: 0xff6b6b,
      depthTest: false,
      depthWrite: false,
    });

    const bg = new THREE.Mesh(bgGeo, bgMat);
    bg.renderOrder = 20;
    const fill = new THREE.Mesh(fillGeo, fillMat);
    fill.renderOrder = 21;
    fill.position.z = 0.01;

    group.add(bg, fill);
    this.root.add(group);
    this.bars.push({ root: group, fill, entity, height });
  }

  /** Drop HP bar for despawned shrine-wave (or other transient) enemies. */
  untrack(entity: Entity): void {
    for (let i = this.bars.length - 1; i >= 0; i--) {
      const bar = this.bars[i]!;
      if (bar.entity !== entity) continue;
      this.root.remove(bar.root);
      this.bars.splice(i, 1);
    }
  }

  update(camera: THREE.Camera): void {
    for (const bar of this.bars) {
      const visible = bar.entity.alive && bar.entity.hp < bar.entity.maxHp;
      bar.root.visible = visible;
      if (!bar.root.visible) continue;

      // World position above the head (not parented to yawing mesh).
      bar.root.position.copy(bar.entity.position);
      bar.root.position.y += bar.height;

      // True camera-facing billboard in world space.
      bar.root.quaternion.copy(camera.quaternion);

      const ratio = Math.max(0, bar.entity.hpRatio);
      bar.fill.scale.x = Math.max(0.001, ratio);
      bar.fill.position.x = -(1 - ratio) * 0.5;

      // Soft distance scale so distant bars stay readable without dominating close-up.
      this._worldPos.copy(bar.root.position);
      const dist = camera.position.distanceTo(this._worldPos);
      const s = THREE.MathUtils.clamp(dist / REF_DISTANCE, MIN_SCALE, MAX_SCALE);
      bar.root.scale.setScalar(s);
    }
  }
}
