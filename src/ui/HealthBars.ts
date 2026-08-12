import * as THREE from 'three';
import { Entity } from '../entities/Entity';

type Bar = {
  root: THREE.Group;
  fill: THREE.Mesh;
  entity: Entity;
};

const bgGeo = new THREE.PlaneGeometry(1, 0.12);
const fillGeo = new THREE.PlaneGeometry(1, 0.12);

/** Billboard HP bars for living entities. */
export class HealthBars {
  private readonly bars: Bar[] = [];
  private readonly root = new THREE.Group();

  constructor(scene: THREE.Scene) {
    this.root.name = 'HealthBars';
    scene.add(this.root);
  }

  track(entity: Entity, height = 2.1): void {
    const group = new THREE.Group();
    group.position.y = height;

    const bg = new THREE.Mesh(
      bgGeo,
      new THREE.MeshBasicMaterial({ color: 0x1f2a24, transparent: true, opacity: 0.55, depthWrite: false }),
    );
    const fill = new THREE.Mesh(
      fillGeo,
      new THREE.MeshBasicMaterial({
        color: entity.team === 'player' ? 0x3bb273 : 0xff6b6b,
        depthWrite: false,
      }),
    );
    fill.position.z = 0.01;
    group.add(bg, fill);
    entity.mesh.add(group);
    this.bars.push({ root: group, fill, entity });
  }

  /** Drop HP bar for despawned shrine-wave (or other transient) enemies. */
  untrack(entity: Entity): void {
    for (let i = this.bars.length - 1; i >= 0; i--) {
      const bar = this.bars[i]!;
      if (bar.entity !== entity) continue;
      entity.mesh.remove(bar.root);
      this.bars.splice(i, 1);
    }
  }

  update(camera: THREE.Camera): void {
    for (const bar of this.bars) {
      const visible = bar.entity.alive && bar.entity.hp < bar.entity.maxHp;
      bar.root.visible = visible || bar.entity.team === 'player';
      if (!bar.root.visible) continue;

      const ratio = Math.max(0, bar.entity.hpRatio);
      bar.fill.scale.x = Math.max(0.001, ratio);
      bar.fill.position.x = -(1 - ratio) * 0.5;
      bar.root.quaternion.copy(camera.quaternion);
    }
  }
}
