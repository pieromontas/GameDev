import * as THREE from 'three';
import { Palette, createToonMaterial } from '../../render/stylized';
import { addDynamicPointLight } from '../../render/deviceQuality';
import {
  DUNGEON_MOUTH,
  DUNGEON_MOUTH_YAW,
  DUNGEON_POCKET_RADIUS,
  ENTER_PROMPT,
  NORTH_POSTERN,
  isNearDungeonEntrance,
} from './layout';
import type { Player } from '../../entities/Player';

export type DungeonPrompt = { visible: boolean; text: string };

type Obstacle = { x: number; z: number; radius: number };

/**
 * Overworld crypt mouth — carved arch in the north-wall postern, hillside
 * behind it, torches and firelight spilling out of a cold interior.
 * Built once with the meadow. Repeated rubble / moss use instancing.
 */
export class DungeonMouth {
  readonly root = new THREE.Group();
  readonly obstacles: Obstacle[] = [];
  private readonly flames: THREE.Object3D[] = [];
  private readonly lights: THREE.PointLight[] = [];
  private time = 0;

  constructor() {
    this.root.name = 'DungeonMouth';
    this.root.position.set(DUNGEON_MOUTH.x, 0, DUNGEON_MOUTH.z);
    this.build();
  }

  isNear(position: THREE.Vector3): boolean {
    const dx = position.x - DUNGEON_MOUTH.x;
    const dz = position.z - DUNGEON_MOUTH.z;
    return dx * dx + dz * dz <= (DUNGEON_POCKET_RADIUS + 2) * (DUNGEON_POCKET_RADIUS + 2);
  }

  getInteractPrompt(player: Player): DungeonPrompt {
    if (!player.alive || !isNearDungeonEntrance(player.position.x, player.position.z)) {
      return { visible: false, text: '' };
    }
    return { visible: true, text: ENTER_PROMPT };
  }

  tryInteract(player: Player): boolean {
    if (!player.alive) return false;
    return isNearDungeonEntrance(player.position.x, player.position.z);
  }

  update(dt: number): void {
    this.time += dt;
    for (const flame of this.flames) {
      const phase = (flame.userData.phase as number) ?? 0;
      const base = (flame.userData.base as number) ?? 1;
      const flicker =
        1 +
        Math.sin(this.time * 9.5 + phase) * 0.14 +
        Math.cos(this.time * 14.5 + phase) * 0.07;
      flame.scale.set(base * flicker, base * (1.22 + flicker * 0.18), base * flicker);
    }
    for (const light of this.lights) {
      const phase = (light.userData.phase as number) ?? 0;
      const base = (light.userData.base as number) ?? 1;
      light.intensity =
        base * (0.82 + Math.sin(this.time * 11 + phase) * 0.12 + Math.cos(this.time * 17 + phase) * 0.06);
    }
  }

  private build(): void {
    const stone = createToonMaterial(Palette.castleSlate);
    const stoneDark = createToonMaterial(Palette.castleSlateDark);
    const stoneLight = createToonMaterial(Palette.castleSlateLight);
    const moss = createToonMaterial(Palette.moss);
    const ivyMat = createToonMaterial(0x2f6b34, { side: THREE.DoubleSide });
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xff9a3a });
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xff7a32,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    const voidMat = createToonMaterial(0x07060a, { emissive: 0x140c08, emissiveIntensity: 0.35 });

    const arch = new THREE.Group();
    arch.name = 'DungeonArch';
    arch.rotation.y = DUNGEON_MOUTH_YAW;
    this.root.add(arch);

    const apron = new THREE.Mesh(new THREE.CircleGeometry(6.4, 28), stoneDark);
    apron.rotation.x = -Math.PI / 2;
    apron.position.y = 0.06;
    apron.receiveShadow = true;
    this.root.add(apron);

    // Hillside behind the arch (local −Z is away from the yard).
    const hillSpots: Array<[number, number, number, number]> = [
      [0, 2.1, -2.6, 2.4],
      [-2.1, 1.5, -2.2, 1.7],
      [2.2, 1.6, -2.3, 1.8],
      [-0.6, 3.2, -3.4, 1.5],
      [1.4, 2.8, -3.6, 1.35],
    ];
    const hillGeo = new THREE.IcosahedronGeometry(1, 0);
    for (const [x, y, z, s] of hillSpots) {
      const rock = new THREE.Mesh(hillGeo, stone);
      rock.position.set(x, y, z);
      rock.scale.set(s, s * 0.82, s * 0.9);
      rock.castShadow = true;
      rock.receiveShadow = true;
      arch.add(rock);
    }
    const mossGeo = new THREE.SphereGeometry(0.28, 6, 5);
    const mossMesh = new THREE.InstancedMesh(mossGeo, moss, 7);
    const mossDummy = new THREE.Object3D();
    const mossSpots: Array<[number, number, number, number]> = [
      [-1.2, 1.4, -1.7, 1.1],
      [1.1, 1.2, -1.5, 0.9],
      [0.2, 2.4, -2.4, 1.3],
      [-2.0, 0.7, -1.4, 0.8],
      [2.1, 0.8, -1.6, 0.85],
      [0.6, 0.45, -1.1, 0.7],
      [-0.4, 3.1, -3.0, 0.75],
    ];
    mossSpots.forEach((spot, i) => {
      mossDummy.position.set(spot[0], spot[1], spot[2]);
      mossDummy.scale.setScalar(spot[3]);
      mossDummy.updateMatrix();
      mossMesh.setMatrixAt(i, mossDummy.matrix);
    });
    mossMesh.instanceMatrix.needsUpdate = true;
    arch.add(mossMesh);

    this.addArch(arch, stone, stoneLight, stoneDark, voidMat, glowMat, ivyMat, flameMat);

    this.addWings(stone, stoneLight);
    this.addPath(arch, stoneDark, stoneLight);
    this.addRubble(arch, stone, stoneDark);

    // Block the mouth and the hillside so the player cannot walk through the postern.
    this.addArchObstacle(1.22, 0, 0.74);
    this.addArchObstacle(-1.22, 0, 0.74);
    this.addArchObstacle(0, -2.15, 2.2);
    this.addArchObstacle(2.35, 1.35, 0.32);
    this.addArchObstacle(-2.35, 1.35, 0.32);
  }

  private addArch(
    arch: THREE.Group,
    stone: THREE.Material,
    stoneLight: THREE.Material,
    stoneDark: THREE.Material,
    voidMat: THREE.Material,
    glowMat: THREE.Material,
    ivyMat: THREE.Material,
    flameMat: THREE.Material,
  ): void {
    const jambGeo = new THREE.BoxGeometry(0.74, 4.5, 1.2);
    for (const side of [-1, 1]) {
      const jamb = new THREE.Mesh(jambGeo, stone);
      jamb.position.set(side * 1.22, 2.25, 0);
      jamb.castShadow = true;
      jamb.receiveShadow = true;
      arch.add(jamb);

      const ivy = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.6), ivyMat);
      ivy.position.set(side * 0.82, 2.6, 0.62);
      ivy.rotation.z = side * 0.25;
      arch.add(ivy);
    }

    const lintel = new THREE.Mesh(new THREE.BoxGeometry(3.35, 0.72, 1.28), stoneLight);
    lintel.position.set(0, 4.72, 0);
    lintel.castShadow = true;
    arch.add(lintel);

    const cap = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.38, 1.4), stone);
    cap.position.set(0, 5.22, 0);
    cap.castShadow = true;
    arch.add(cap);

    // Rough voussoirs so the opening reads as a carved arch, not a doorway slab.
    for (let i = 0; i < 5; i++) {
      const t = (i - 2) / 2;
      const voussoir = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.42, 0.55), stoneLight);
      voussoir.position.set(t * 0.72, 4.15 - Math.abs(t) * 0.28, 0.42);
      voussoir.rotation.z = -t * 0.35;
      voussoir.castShadow = true;
      arch.add(voussoir);
    }

    const key = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.48), stoneDark);
    key.position.set(0, 4.35, 0.55);
    arch.add(key);

    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 7), stoneLight);
    skull.position.set(0, 5.55, 0.35);
    skull.scale.set(1, 0.85, 0.8);
    arch.add(skull);

    const hollow = new THREE.Mesh(new THREE.BoxGeometry(1.45, 3.35, 2.4), voidMat);
    hollow.position.set(0, 1.7, -0.85);
    arch.add(hollow);

    const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 2.5), glowMat);
    glow.position.set(0, 1.45, 0.2);
    arch.add(glow);

    const sill = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.12, 0.7), stoneDark);
    sill.position.set(0, 0.08, 0.55);
    sill.receiveShadow = true;
    arch.add(sill);

    for (const side of [-1, 1]) {
      this.addTorch(arch, side * 2.35, 1.35, flameMat, stoneDark);
    }

    const light = addDynamicPointLight(arch, 0xff7a32, 1.45, 10, 2);
    if (light) {
      light.position.set(0, 1.7, 0.35);
      light.userData.phase = 0.4;
      light.userData.base = 1.45;
      this.lights.push(light);
    }
  }

  private addTorch(
    parent: THREE.Group,
    x: number,
    z: number,
    flameMat: THREE.Material,
    iron: THREE.Material,
  ): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.7, 6), iron);
    pole.position.y = 0.85;
    pole.castShadow = true;
    group.add(pole);
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.1, 0.16, 6), iron);
    cup.position.y = 1.72;
    group.add(cup);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.38, 6), flameMat);
    flame.position.y = 2.0;
    flame.userData.phase = x * 1.7 + z;
    flame.userData.base = 1;
    group.add(flame);
    this.flames.push(flame);
    parent.add(group);
  }

  /** Short curtain stubs so the postern reads as a gate, not a missing wall. */
  private addWings(stone: THREE.Material, stoneLight: THREE.Material): void {
    const yaw = Math.atan2(
      -(NORTH_POSTERN.to.z - NORTH_POSTERN.from.z),
      NORTH_POSTERN.to.x - NORTH_POSTERN.from.x,
    );
    const spots = [NORTH_POSTERN.from, NORTH_POSTERN.to];
    for (const spot of spots) {
      const wing = new THREE.Group();
      // Pull the stub slightly toward the arch so it overlaps the curtain end.
      const towardX = DUNGEON_MOUTH.x - spot.x;
      const towardZ = DUNGEON_MOUTH.z - spot.z;
      const len = Math.hypot(towardX, towardZ) || 1;
      // Root is already at the mouth, so wings store a local offset.
      const worldX = spot.x + (towardX / len) * 0.85;
      const worldZ = spot.z + (towardZ / len) * 0.85;
      wing.position.set(worldX - DUNGEON_MOUTH.x, 0, worldZ - DUNGEON_MOUTH.z);
      wing.rotation.y = yaw;
      const wall = new THREE.Mesh(new THREE.BoxGeometry(2.5, 3.4, 1.2), stone);
      wall.position.y = 1.7;
      wall.castShadow = true;
      wall.receiveShadow = true;
      wing.add(wall);
      const walk = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.32, 1.35), stoneLight);
      walk.position.y = 3.52;
      wing.add(walk);
      this.root.add(wing);
    }
  }

  private addPath(arch: THREE.Group, stoneDark: THREE.Material, stoneLight: THREE.Material): void {
    for (let i = 0; i < 4; i++) {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 0.85), i % 2 ? stoneLight : stoneDark);
      slab.position.set((i % 2) * 0.08 - 0.04, 0.1, 3.15 + i * 0.95);
      slab.receiveShadow = true;
      arch.add(slab);
    }
  }

  private addRubble(arch: THREE.Group, stone: THREE.Material, stoneDark: THREE.Material): void {
    const geo = new THREE.DodecahedronGeometry(0.28, 0);
    const mesh = new THREE.InstancedMesh(geo, stone, 8);
    const dark = new THREE.InstancedMesh(geo, stoneDark, 4);
    const dummy = new THREE.Object3D();
    const spots: Array<[number, number, number]> = [
      [-1.85, 0.2, 1.7],
      [1.9, 0.18, 1.55],
      [-2.2, 0.16, 2.4],
      [2.15, 0.22, 2.5],
      [-1.5, 0.14, 0.4],
      [1.55, 0.15, 0.35],
      [-2.4, 0.2, 0.2],
      [0.9, 0.12, 2.15],
    ];
    spots.forEach((spot, i) => {
      dummy.position.set(spot[0], spot[1], spot[2]);
      dummy.rotation.set(spot[0], spot[2], 0.4);
      const s = 0.7 + (i % 3) * 0.25;
      dummy.scale.set(s, s * 0.7, s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    arch.add(mesh);
    for (let i = 0; i < 4; i++) {
      dummy.position.set(-1.2 + i * 0.15, 0.1, -0.4);
      dummy.scale.setScalar(0.45);
      dummy.updateMatrix();
      dark.setMatrixAt(i, dummy.matrix);
    }
    dark.instanceMatrix.needsUpdate = true;
    arch.add(dark);
  }

  private addArchObstacle(localX: number, localZ: number, radius: number): void {
    const yaw = DUNGEON_MOUTH_YAW;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    this.obstacles.push({
      x: DUNGEON_MOUTH.x + localX * cos + localZ * sin,
      z: DUNGEON_MOUTH.z - localX * sin + localZ * cos,
      radius,
    });
  }
}
