import * as THREE from 'three';
import { OCCLUDER_SKIP, markOccluderFade } from '../../camera/OccluderFade';
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
  private readonly glows: Array<{ mat: THREE.Material; base: number; phase: number }> = [];
  /** Arch, wings, and other stone that may sit between the yard camera and the hero. */
  readonly occluderRoots: THREE.Object3D[] = [];
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
        base * (0.78 + Math.sin(this.time * 11 + phase) * 0.16 + Math.cos(this.time * 17 + phase) * 0.08);
    }
    for (const glow of this.glows) {
      const flicker =
        0.84 +
        Math.sin(this.time * 6.5 + glow.phase) * 0.12 +
        Math.cos(this.time * 12.5 + glow.phase) * 0.06;
      glow.mat.opacity = glow.base * flicker;
    }
  }

  private build(): void {
    const stone = createToonMaterial(Palette.castleSlate);
    const stoneDark = createToonMaterial(Palette.castleSlateDark);
    const stoneLight = createToonMaterial(Palette.castleSlateLight);
    const moss = createToonMaterial(Palette.moss);
    const ivyMat = createToonMaterial(0x2f6b34, { side: THREE.DoubleSide });
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xffb15a });
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xffb15a,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const spillMat = new THREE.MeshBasicMaterial({
      color: 0xff7a28,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const voidMat = createToonMaterial(0x2a140c, { emissive: 0xff6a28, emissiveIntensity: 0.95 });

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

    this.addArch(arch, stone, stoneLight, stoneDark, voidMat, glowMat, spillMat, ivyMat, flameMat);

    this.addWings(stone, stoneLight);
    this.addPath(arch, stoneDark, stoneLight);
    this.addRubble(arch, stone, stoneDark);

    // Block the mouth and the hillside so the player cannot walk through the postern.
    this.addArchObstacle(1.22, 0, 0.74);
    this.addArchObstacle(-1.22, 0, 0.74);
    this.addArchObstacle(0, -2.15, 2.2);
    this.addArchObstacle(2.35, 1.35, 0.32);
    this.addArchObstacle(-2.35, 1.35, 0.32);
    this.addArchObstacle(0, 0.72, 0.62);
  }

  private addArch(
    arch: THREE.Group,
    stone: THREE.Material,
    stoneLight: THREE.Material,
    stoneDark: THREE.Material,
    voidMat: THREE.Material,
    glowMat: THREE.Material,
    spillMat: THREE.MeshBasicMaterial,
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

    // Cavity sits behind the opening so the warm glow is what the yard sees.
    const hollow = new THREE.Mesh(new THREE.BoxGeometry(1.35, 3.05, 1.7), voidMat);
    hollow.position.set(0, 1.65, -1.55);
    arch.add(hollow);

    const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.05, 3.15), glowMat);
    glow.position.set(0, 1.7, 0.22);
    // Tilt the face up toward the yard so the steep iso camera does not see it edge-on.
    glow.rotation.x = -0.62;
    glow.userData[OCCLUDER_SKIP] = true;
    arch.add(glow);
    this.glows.push({ mat: glowMat, base: 0.88, phase: 0.4 });

    const innerGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.15, 2.1),
      glowMat.clone(),
    );
    const innerMat = innerGlow.material as THREE.MeshBasicMaterial;
    innerMat.color.set(0xffd2a0);
    innerMat.opacity = 0.55;
    innerGlow.position.set(0, 1.45, -0.35);
    innerGlow.userData[OCCLUDER_SKIP] = true;
    arch.add(innerGlow);
    this.glows.push({ mat: innerMat, base: 0.55, phase: 1.3 });

    // Warm pool on the apron — the mouth reads as an entrance from the high camera.
    // Hotter than the sunset sky so the spill is not the same orange as the clouds.
    spillMat.color.set(0xff4a12);
    spillMat.opacity = 0.78;
    const spill = new THREE.Mesh(new THREE.CircleGeometry(6.4, 32), spillMat);
    spill.rotation.x = -Math.PI / 2;
    spill.position.set(0, 0.28, 2.55);
    spill.renderOrder = 2;
    spill.userData[OCCLUDER_SKIP] = true;
    arch.add(spill);
    this.glows.push({ mat: spillMat, base: 0.78, phase: 0.2 });

    const spillCore = new THREE.Mesh(new THREE.CircleGeometry(3.1, 24), spillMat.clone());
    const coreMat = spillCore.material as THREE.MeshBasicMaterial;
    coreMat.color.set(0xffe3a0);
    coreMat.opacity = 0.92;
    spillCore.rotation.x = -Math.PI / 2;
    spillCore.position.set(0, 0.32, 1.55);
    spillCore.renderOrder = 3;
    spillCore.userData[OCCLUDER_SKIP] = true;
    arch.add(spillCore);
    this.glows.push({ mat: coreMat, base: 0.92, phase: 1.1 });

    this.addMouthBeacon(arch);

    const sill = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.12, 0.7), stoneDark);
    sill.position.set(0, 0.08, 0.55);
    sill.receiveShadow = true;
    arch.add(sill);

    // Big sconces on the courtyard face of the opening, plus a smaller outer pair.
    for (const side of [-1, 1]) {
      this.addTorch(arch, side * 1.02, 1.05, flameMat, stoneDark, 1.55);
      this.addTorch(arch, side * 2.25, 1.7, flameMat, stoneDark, 1.05);
    }
    this.addBonfire(arch, flameMat, stoneDark);

    const light = addDynamicPointLight(arch, 0xff8a32, 4.2, 22, 2);
    if (light) {
      light.position.set(0, 1.85, 0.55);
      light.userData.phase = 0.4;
      light.userData.base = 4.2;
      this.lights.push(light);
    }
    const groundLight = addDynamicPointLight(arch, 0xff9440, 2.6, 14, 2);
    if (groundLight) {
      groundLight.position.set(0, 0.55, 1.7);
      groundLight.userData.phase = 1.6;
      groundLight.userData.base = 2.6;
      this.lights.push(groundLight);
    }

    this.tagOccluder(arch);
  }

  private tagOccluder(root: THREE.Object3D): void {
    markOccluderFade(root);
    this.occluderRoots.push(root);
  }

  private addTorch(
    parent: THREE.Group,
    x: number,
    z: number,
    flameMat: THREE.Material,
    iron: THREE.Material,
    scale: number,
  ): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.scale.setScalar(scale);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.85, 6), iron);
    pole.position.y = 0.92;
    pole.castShadow = true;
    group.add(pole);
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.12, 0.2, 7), iron);
    cup.position.y = 1.9;
    group.add(cup);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.05, 7), flameMat);
    flame.position.y = 2.55;
    flame.userData.phase = x * 1.7 + z;
    flame.userData.base = 1;
    flame.userData[OCCLUDER_SKIP] = true;
    group.add(flame);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0xffb060,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
    });
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), haloMat);
    halo.position.y = 2.45;
    halo.userData[OCCLUDER_SKIP] = true;
    group.add(halo);
    this.glows.push({ mat: haloMat, base: 0.38, phase: x + z });
    this.flames.push(flame);
    parent.add(group);
  }

  /**
   * Camera-facing cards. Cone flames disappear into the sunset from the steep
   * yard orbit; these stay large and white-hot against the dark opening.
   */
  private addMouthBeacon(parent: THREE.Group): void {
    // Sit on the courtyard face of the opening. Cards tucked inside the jambs
    // vanish from the oblique yard camera and the mouth stays a dark hole.
    const cards: Array<[number, number, number, number, number, number, number]> = [
      [0, 2.15, 1.25, 2.6, 3.2, 0xfff4d2, 0.92],
      [-1.15, 2.7, 1.45, 1.35, 1.9, 0xffb15a, 0.88],
      [1.15, 2.7, 1.45, 1.35, 1.9, 0xffb15a, 0.88],
      [0, 0.9, 1.7, 3.2, 1.35, 0xff5a18, 0.85],
    ];
    for (const [x, y, z, w, h, color, opacity] of cards) {
      const mat = new THREE.SpriteMaterial({
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const card = new THREE.Sprite(mat);
      card.position.set(x, y, z);
      card.scale.set(w, h, 1);
      card.userData[OCCLUDER_SKIP] = true;
      parent.add(card);
      this.glows.push({ mat, base: opacity, phase: x + y });
    }
  }

  /** Threshold bonfire so the opening reads as a mouth from the high yard camera. */
  private addBonfire(parent: THREE.Group, flameMat: THREE.Material, iron: THREE.Material): void {
    const group = new THREE.Group();
    group.position.set(0, 0, 0.72);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.4, 0.28, 8), iron);
    bowl.position.y = 0.22;
    bowl.castShadow = true;
    group.add(bowl);
    const coals = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), flameMat);
    coals.position.y = 0.38;
    coals.scale.y = 0.45;
    coals.userData[OCCLUDER_SKIP] = true;
    group.add(coals);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.35, 8), flameMat);
    flame.position.y = 1.15;
    flame.userData.phase = 0.6;
    flame.userData.base = 1.15;
    flame.userData[OCCLUDER_SKIP] = true;
    group.add(flame);
    const outer = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.9, 8), flameMat);
    outer.position.y = 0.85;
    outer.userData.phase = 2.1;
    outer.userData.base = 1;
    outer.userData[OCCLUDER_SKIP] = true;
    group.add(outer);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0xffc070,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
    });
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), haloMat);
    halo.position.y = 1.05;
    halo.userData[OCCLUDER_SKIP] = true;
    group.add(halo);
    this.glows.push({ mat: haloMat, base: 0.4, phase: 0.8 });
    this.flames.push(flame, outer);
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
      this.tagOccluder(wing);
      this.root.add(wing);
    }
  }

  private addPath(arch: THREE.Group, stoneDark: THREE.Material, stoneLight: THREE.Material): void {
    for (let i = 0; i < 4; i++) {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 0.85), i % 2 ? stoneLight : stoneDark);
      slab.position.set((i % 2) * 0.08 - 0.04, 0.1, 3.15 + i * 0.95);
      slab.receiveShadow = true;
      slab.userData[OCCLUDER_SKIP] = true;
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
