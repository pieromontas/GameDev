import * as THREE from 'three';
import { OCCLUDER_SKIP, markOccluderFade } from '../../camera/OccluderFade';
import { Palette, createToonMaterial } from '../../render/stylized';
import { addDynamicPointLight, isMobilePlay } from '../../render/deviceQuality';
import {
  HALL_DUST_COUNT,
  HALL_DUST_COUNT_MOBILE,
  createDustMotes,
  stepDustMote,
  type DustMote,
} from './hallDust';
import {
  DUNGEON_HALL_ORIGIN,
  HALL_BOUNDS,
  HALL_EXIT_ARCH_Z,
  LEAVE_PROMPT,
  SEALED_PROMPT,
  hallPromptKind,
  type HallPromptKind,
} from './layout';

export type HallPrompt = { visible: boolean; text: string; kind: HallPromptKind | null };

type Circle = { x: number; z: number; radius: number };

/**
 * Finished entry hall: stone room, torchlight, a stair back out, and a barred
 * gate that reads as the next wing rather than a stuck corridor.
 * Geometries are created on ensure and released on leave so re-entry cannot leak.
 */
export class DungeonHall {
  readonly root = new THREE.Group();
  private built = false;
  private readonly geos: THREE.BufferGeometry[] = [];
  private readonly mats: THREE.Material[] = [];
  private readonly flames: THREE.Object3D[] = [];
  private readonly lights: THREE.PointLight[] = [];
  private readonly circles: Circle[] = [];
  private readonly occluders: THREE.Object3D[] = [];
  private readonly dust: DustMote[] = [];
  private dustMesh: THREE.InstancedMesh | null = null;
  private fogMats: THREE.ShaderMaterial[] = [];
  private readonly dustDummy = new THREE.Object3D();
  private time = 0;
  disposedGeometries = 0;
  disposedMaterials = 0;

  constructor() {
    this.root.name = 'DungeonHall';
    this.root.position.set(DUNGEON_HALL_ORIGIN.x, 0, DUNGEON_HALL_ORIGIN.z);
  }

  get attached(): boolean {
    return this.root.parent != null;
  }

  ensureBuilt(): void {
    if (this.built) return;
    this.build();
    this.built = true;
  }

  attach(scene: THREE.Scene): void {
    this.ensureBuilt();
    if (this.root.parent === scene) return;
    scene.add(this.root);
  }

  /** Detach and free GPU resources. The next enter builds a fresh hall. */
  release(): void {
    this.root.parent?.remove(this.root);
    this.disposeBuilt();
  }

  meshCount(): number {
    let n = 0;
    this.root.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) n += 1;
    });
    return n;
  }

  lightCount(): number {
    let n = 0;
    this.root.traverse((obj) => {
      if ((obj as THREE.Light).isLight) n += 1;
    });
    return n;
  }

  /** Exit arch, side walls, and pillars — geometry that can hide the hero. */
  getOccluders(): readonly THREE.Object3D[] {
    return this.occluders;
  }

  update(dt: number): void {
    if (!this.built) return;
    this.time += dt;
    for (const flame of this.flames) {
      const phase = (flame.userData.phase as number) ?? 0;
      const base = (flame.userData.base as number) ?? 1;
      const flicker =
        1 +
        Math.sin(this.time * 8.5 + phase) * 0.13 +
        Math.cos(this.time * 13.5 + phase) * 0.08;
      flame.scale.set(base * flicker, base * (1.28 + flicker * 0.16), base * flicker);
    }
    for (const light of this.lights) {
      const phase = (light.userData.phase as number) ?? 0;
      const base = (light.userData.base as number) ?? 1;
      light.intensity =
        base *
        (0.84 + Math.sin(this.time * 10 + phase) * 0.1 + Math.cos(this.time * 16 + phase) * 0.05);
    }
    this.updateDust(dt);
  }

  /**
   * Pillars, braziers, and the loose stone chunk. A few passes, then a slide
   * when a radial push would leave the hero inside a prop and the wall at once
   * (the old single push jittered against the braziers).
   */
  resolve(position: THREE.Vector3, radius: number): void {
    const originX = DUNGEON_HALL_ORIGIN.x;
    const originZ = DUNGEON_HALL_ORIGIN.z;
    let x = position.x - originX;
    let z = position.z - originZ;
    for (let iter = 0; iter < 6; iter++) {
      for (const circle of this.circles) {
        const next = this.pushCircle(x, z, circle, radius);
        x = next.x;
        z = next.z;
      }
      const clamped = this.clampHall(x, z, radius);
      x = clamped.x;
      z = clamped.z;
    }
    position.x = originX + x;
    position.z = originZ + z;
  }

  getPrompt(x: number, z: number, alive: boolean): HallPrompt {
    if (!alive) return { visible: false, text: '', kind: null };
    const kind = hallPromptKind(x - DUNGEON_HALL_ORIGIN.x, z - DUNGEON_HALL_ORIGIN.z);
    if (kind === 'exit') return { visible: true, text: LEAVE_PROMPT, kind };
    if (kind === 'sealed') return { visible: true, text: SEALED_PROMPT, kind };
    return { visible: false, text: '', kind: null };
  }

  private build(): void {
    const stone = this.mat(createToonMaterial(0x6b645b));
    const stoneDark = this.mat(createToonMaterial(0x3f3a34));
    const stoneLight = this.mat(createToonMaterial(0x8d8478));
    const moss = this.mat(createToonMaterial(Palette.moss));
    const iron = this.mat(createToonMaterial(Palette.iron));
    const bone = this.mat(createToonMaterial(0xd8d0c0));
    const flameMat = this.mat(new THREE.MeshBasicMaterial({ color: 0xffa24a }));
    const webMat = this.mat(
      new THREE.MeshBasicMaterial({
        color: 0xe4ddd2,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    const ivyMat = this.mat(createToonMaterial(0x2c6434, { side: THREE.DoubleSide }));
    const voidMat = this.mat(
      createToonMaterial(0x0c0e14, { emissive: 0x1a2838, emissiveIntensity: 0.45 }),
    );
    const coldMat = this.mat(
      createToonMaterial(0x8eb4c8, { emissive: 0x7eb6d0, emissiveIntensity: 0.8 }),
    );

    this.addFloor(stoneDark, stone, stoneLight);
    this.addWalls(stone, stoneLight, stoneDark);
    this.addGate(voidMat, coldMat, ivyMat, stone);
    this.addExitArch(stone, stoneLight, stoneDark);
    this.addPillars(stone, stoneDark);
    this.addBraziers(stoneDark, stoneLight, flameMat, iron);
    this.addWallTorches(iron, flameMat);
    this.addBones(bone);
    this.addWebs(webMat);
    this.addMoss(moss);
    this.addRubble(stone, stoneDark);
    this.addAtmosphere();

    this.circles.push(
      { x: -2.05, z: -1.35, radius: 0.58 },
      { x: 2.05, z: -1.35, radius: 0.58 },
      { x: -1.65, z: 2.55, radius: 0.46 },
      { x: 1.8, z: 3.05, radius: 0.42 },
      { x: -2.3, z: 0.15, radius: 0.52 },
      { x: 2.3, z: 0.15, radius: 0.52 },
      // Loose chunk near the stair — solid, not a decoration you walk through.
      { x: 1.15, z: 5.15, radius: 0.42 },
    );
  }

  private addFloor(mortar: THREE.Material, stone: THREE.Material, stoneLight: THREE.Material): void {
    const base = new THREE.Mesh(this.geo(new THREE.BoxGeometry(8.5, 0.28, 16.2)), mortar);
    base.position.set(0, -0.08, 0.4);
    base.receiveShadow = true;
    this.root.add(base);

    const cols = 5;
    const rows = 8;
    const mesh = new THREE.InstancedMesh(
      this.geo(new THREE.BoxGeometry(1.42, 0.07, 1.55)),
      stone,
      cols * rows,
    );
    const alt = new THREE.InstancedMesh(
      this.geo(new THREE.BoxGeometry(1.42, 0.07, 1.55)),
      stoneLight,
      cols * rows,
    );
    const dummy = new THREE.Object3D();
    let a = 0;
    let b = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = -2.9 + c * 1.48 + (r % 2) * 0.06;
        const z = -5.6 + r * 1.72;
        dummy.position.set(x, 0.045, z);
        dummy.rotation.set(0, ((c + r) % 3) * 0.015, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        if ((c + r) % 2 === 0) {
          mesh.setMatrixAt(a, dummy.matrix);
          a += 1;
        } else {
          alt.setMatrixAt(b, dummy.matrix);
          b += 1;
        }
      }
    }
    // Unused trailing instances sit at the origin scaled to nothing.
    dummy.position.set(0, -2, 0);
    dummy.scale.set(0.001, 0.001, 0.001);
    dummy.updateMatrix();
    for (let i = a; i < cols * rows; i++) mesh.setMatrixAt(i, dummy.matrix);
    for (let i = b; i < cols * rows; i++) alt.setMatrixAt(i, dummy.matrix);
    mesh.instanceMatrix.needsUpdate = true;
    alt.instanceMatrix.needsUpdate = true;
    mesh.receiveShadow = true;
    alt.receiveShadow = true;
    this.root.add(mesh);
    this.root.add(alt);
  }

  private addWalls(stone: THREE.Material, stoneLight: THREE.Material, stoneDark: THREE.Material): void {
    const wallGeo = this.geo(new THREE.BoxGeometry(0.72, 6.6, 15.4));
    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(wallGeo, stone);
      wall.position.set(side * 4.15, 3.3, 0.35);
      wall.castShadow = true;
      wall.receiveShadow = true;
      const sideGroup = new THREE.Group();
      sideGroup.name = side < 0 ? 'HallWallWest' : 'HallWallEast';
      sideGroup.add(wall);
      const trim = new THREE.Mesh(this.geo(new THREE.BoxGeometry(0.86, 0.28, 15.4)), stoneLight);
      trim.position.set(side * 4.15, 6.55, 0.35);
      sideGroup.add(trim);
      const base = new THREE.Mesh(this.geo(new THREE.BoxGeometry(0.9, 0.45, 15.4)), stoneDark);
      base.position.set(side * 4.15, 0.22, 0.35);
      base.receiveShadow = true;
      sideGroup.add(base);
      this.tagOccluder(sideGroup);
      this.root.add(sideGroup);
    }
  }

  private addGate(
    voidMat: THREE.Material,
    coldMat: THREE.Material,
    ivyMat: THREE.Material,
    stone: THREE.Material,
  ): void {
    // Steel that actually reads: standard metal, not the near-black toon iron
    // that disappeared into the old flat doorway.
    const iron = this.mat(
      new THREE.MeshStandardMaterial({
        color: 0xc5ced6,
        metalness: 0.86,
        roughness: 0.34,
        emissive: 0x243848,
        emissiveIntensity: 0.45,
      }),
    );

    const frame = new THREE.Group();
    frame.name = 'HallSealedGate';

    for (const side of [-1, 1]) {
      const pier = new THREE.Mesh(this.geo(new THREE.BoxGeometry(1.15, 5.4, 0.7)), stone);
      pier.position.set(side * 1.85, 2.7, -6.85);
      pier.castShadow = true;
      pier.receiveShadow = true;
      frame.add(pier);
    }
    const lintel = new THREE.Mesh(this.geo(new THREE.BoxGeometry(4.9, 0.7, 0.75)), stone);
    lintel.position.set(0, 5.15, -6.85);
    lintel.castShadow = true;
    frame.add(lintel);
    this.tagOccluder(frame);
    this.root.add(frame);

    // Recess stays BEHIND the bars. The old box extended into the room and
    // covered them, which is why the gate read as a flat dark-blue door.
    const recess = new THREE.Mesh(this.geo(new THREE.BoxGeometry(2.15, 3.7, 1.45)), voidMat);
    recess.position.set(0, 2.05, -7.85);
    this.root.add(recess);
    const coldWash = new THREE.Mesh(this.geo(new THREE.PlaneGeometry(1.55, 2.8)), coldMat);
    coldWash.position.set(0, 2.1, -7.2);
    coldWash.userData[OCCLUDER_SKIP] = true;
    this.root.add(coldWash);

    const glowMat = this.mat(
      new THREE.MeshBasicMaterial({
        color: 0x9fd4ff,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    const glow = new THREE.Mesh(this.geo(new THREE.PlaneGeometry(2.15, 2.4)), glowMat);
    glow.position.set(0, 2.15, -7.15);
    // Tipped toward the room, with the near lip still behind the bars.
    glow.rotation.x = -0.55;
    glow.userData[OCCLUDER_SKIP] = true;
    this.root.add(glow);
    const glowCore = new THREE.Mesh(
      this.geo(new THREE.PlaneGeometry(0.7, 2.2)),
      this.mat(
        new THREE.MeshBasicMaterial({
          color: 0xd7f2ff,
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      ),
    );
    glowCore.position.set(0, 2.2, -7.35);
    glowCore.rotation.x = -0.55;
    glowCore.userData[OCCLUDER_SKIP] = true;
    this.root.add(glowCore);

    const barGeo = this.geo(new THREE.CylinderGeometry(0.11, 0.11, 3.65, 8));
    const barCount = 5;
    const bars = new THREE.InstancedMesh(barGeo, iron, barCount);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < barCount; i++) {
      dummy.position.set(-0.84 + i * 0.42, 2.05, -6.48);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      bars.setMatrixAt(i, dummy.matrix);
    }
    bars.instanceMatrix.needsUpdate = true;
    bars.castShadow = true;
    this.root.add(bars);

    for (const y of [1.15, 2.15, 3.35]) {
      const rail = new THREE.Mesh(this.geo(new THREE.BoxGeometry(1.9, 0.1, 0.1)), iron);
      rail.position.set(0, y, -6.48);
      rail.castShadow = true;
      this.root.add(rail);
    }

    for (const side of [-1, 1]) {
      const chain = new THREE.Mesh(this.geo(new THREE.TorusGeometry(0.18, 0.045, 8, 12)), iron);
      chain.position.set(side * 0.55, 4.45, -6.42);
      chain.rotation.x = Math.PI / 2;
      chain.castShadow = true;
      this.root.add(chain);
    }

    const ivy = new THREE.Mesh(this.geo(new THREE.PlaneGeometry(0.8, 1.5)), ivyMat);
    ivy.position.set(-1.55, 3.4, -6.45);
    ivy.rotation.z = 0.3;
    this.root.add(ivy);
  }

  private addExitArch(stone: THREE.Material, stoneLight: THREE.Material, stoneDark: THREE.Material): void {
    // Arch is past the leave pad so the beam is not the hero's hat. It still
    // fades if a lower camera looks through it.
    const arch = new THREE.Group();
    arch.name = 'HallExitArch';
    const z = HALL_EXIT_ARCH_Z;
    for (const side of [-1, 1]) {
      const jamb = new THREE.Mesh(this.geo(new THREE.BoxGeometry(0.7, 2.8, 0.7)), stone);
      jamb.position.set(side * 1.55, 1.4, z);
      jamb.castShadow = true;
      arch.add(jamb);
    }
    const lintel = new THREE.Mesh(this.geo(new THREE.BoxGeometry(3.8, 0.42, 0.75)), stoneLight);
    lintel.position.set(0, 2.95, z);
    lintel.castShadow = true;
    arch.add(lintel);
    this.tagOccluder(arch);
    this.root.add(arch);

    for (let i = 0; i < 3; i++) {
      const step = new THREE.Mesh(this.geo(new THREE.BoxGeometry(2.4, 0.08, 0.42)), i === 1 ? stoneLight : stoneDark);
      step.position.set(0, 0.04 - i * 0.015, z - 1.35 + i * 0.38);
      step.receiveShadow = true;
      this.root.add(step);
    }
  }

  private addPillars(stone: THREE.Material, stoneDark: THREE.Material): void {
    const shaft = this.geo(new THREE.CylinderGeometry(0.38, 0.48, 3.4, 8));
    const broken = this.geo(new THREE.CylinderGeometry(0.32, 0.42, 1.5, 8));
    const specs: Array<[number, number, number, THREE.BufferGeometry, number]> = [
      [-2.05, 1.7, -1.35, shaft, 0.08],
      [2.05, 1.7, -1.35, shaft, -0.05],
      [-1.65, 0.7, 2.55, broken, 0.35],
      [1.8, 0.55, 3.05, broken, -0.5],
    ];
    for (const [x, y, z, geo, tilt] of specs) {
      const pillar = new THREE.Mesh(geo, stone);
      pillar.position.set(x, y, z);
      pillar.rotation.z = tilt;
      pillar.castShadow = true;
      pillar.receiveShadow = true;
      this.tagOccluder(pillar);
      this.root.add(pillar);
      const ring = new THREE.Mesh(this.geo(new THREE.CylinderGeometry(0.5, 0.5, 0.12, 8)), stoneDark);
      ring.position.set(x, 0.08, z);
      this.root.add(ring);
    }
  }

  private addBraziers(
    stoneDark: THREE.Material,
    stoneLight: THREE.Material,
    flameMat: THREE.Material,
    iron: THREE.Material,
  ): void {
    for (const side of [-1, 1]) {
      const group = new THREE.Group();
      group.position.set(side * 2.3, 0, 0.15);
      const foot = new THREE.Mesh(this.geo(new THREE.CylinderGeometry(0.38, 0.48, 0.7, 7)), stoneDark);
      foot.position.y = 0.35;
      foot.castShadow = true;
      group.add(foot);
      const bowl = new THREE.Mesh(this.geo(new THREE.CylinderGeometry(0.46, 0.28, 0.22, 7)), stoneLight);
      bowl.position.y = 0.78;
      group.add(bowl);
      const coals = new THREE.Mesh(this.geo(new THREE.SphereGeometry(0.18, 6, 5)), iron);
      coals.position.y = 0.88;
      coals.scale.y = 0.45;
      group.add(coals);
      const flame = new THREE.Mesh(this.geo(new THREE.ConeGeometry(0.16, 0.46, 6)), flameMat);
      flame.position.y = 1.15;
      flame.userData.phase = side * 1.3;
      flame.userData.base = 1;
      group.add(flame);
      this.flames.push(flame);
      this.root.add(group);

      const light = addDynamicPointLight(group, 0xff8a3a, side < 0 ? 1.15 : 0.95, 8.5, 2);
      if (light) {
        light.position.y = 1.25;
        light.userData.phase = side;
        light.userData.base = side < 0 ? 1.15 : 0.95;
        this.lights.push(light);
      }
    }
  }

  private addWallTorches(iron: THREE.Material, flameMat: THREE.Material): void {
    const spots: Array<[number, number, number]> = [
      [-3.7, 2.15, -3.2],
      [3.7, 2.15, -3.2],
      [-3.7, 2.15, 2.4],
      [3.7, 2.15, 2.4],
    ];
    const bracket = this.geo(new THREE.BoxGeometry(0.36, 0.08, 0.08));
    const flameGeo = this.geo(new THREE.ConeGeometry(0.1, 0.32, 5));
    spots.forEach(([x, y, z], i) => {
      const arm = new THREE.Mesh(bracket, iron);
      arm.position.set(x, y, z);
      this.root.add(arm);
      const flame = new THREE.Mesh(flameGeo, flameMat);
      flame.position.set(x + (x > 0 ? -0.12 : 0.12), y + 0.22, z);
      flame.userData.phase = i * 1.4;
      flame.userData.base = 1;
      this.root.add(flame);
      this.flames.push(flame);
    });
  }

  private addBones(bone: THREE.Material): void {
    const geo = this.geo(new THREE.CapsuleGeometry(0.05, 0.28, 3, 5));
    const mesh = new THREE.InstancedMesh(geo, bone, 14);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 14; i++) {
      const side = i < 7 ? -1 : 1;
      const along = (i % 7) - 3;
      dummy.position.set(side * (2.7 + (i % 2) * 0.25), 0.08, along * 0.55 - 0.4);
      dummy.rotation.set(Math.PI / 2, i * 0.4, i * 0.2);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    this.root.add(mesh);

    const skull = new THREE.Mesh(this.geo(new THREE.SphereGeometry(0.16, 7, 6)), bone);
    skull.position.set(-2.55, 0.16, -3.4);
    skull.scale.set(1, 0.8, 0.9);
    this.root.add(skull);
  }

  private addWebs(webMat: THREE.Material): void {
    const geo = this.geo(new THREE.PlaneGeometry(0.9, 0.7));
    const spots: Array<[number, number, number, number, number]> = [
      [-3.75, 4.6, -4.8, 0.4, 0.2],
      [3.75, 4.4, -4.2, -0.3, -0.2],
      [-3.7, 5.1, 3.6, 0.5, 0.4],
      [3.72, 4.9, 4.1, -0.4, 0.1],
      [-1.7, 4.8, -6.4, 0.2, 0.6],
    ];
    for (const [x, y, z, rz, ry] of spots) {
      const web = new THREE.Mesh(geo, webMat);
      web.position.set(x, y, z);
      web.rotation.set(0.3, ry, rz);
      this.root.add(web);
    }
  }

  private addMoss(moss: THREE.Material): void {
    const geo = this.geo(new THREE.SphereGeometry(0.22, 6, 4));
    const mesh = new THREE.InstancedMesh(geo, moss, 8);
    const dummy = new THREE.Object3D();
    const spots: Array<[number, number, number]> = [
      [-3.7, 0.35, -2.2],
      [3.65, 0.32, -1.4],
      [-3.6, 0.4, 1.8],
      [3.7, 0.3, 3.2],
      [-2.0, 0.2, -5.4],
      [1.6, 0.22, -5.2],
      [0.4, 0.18, 5.6],
      [-3.5, 1.2, 0.2],
    ];
    spots.forEach((spot, i) => {
      dummy.position.set(spot[0], spot[1], spot[2]);
      dummy.scale.set(1.1, 0.45, 0.8);
      dummy.rotation.y = i;
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    this.root.add(mesh);
  }

  private addRubble(stone: THREE.Material, stoneDark: THREE.Material): void {
    const geo = this.geo(new THREE.DodecahedronGeometry(0.22, 0));
    const mesh = new THREE.InstancedMesh(geo, stone, 10);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 10; i++) {
      const side = i < 5 ? -1 : 1;
      dummy.position.set(side * (2.85 + (i % 2) * 0.2), 0.12, -2.5 + (i % 5) * 1.1);
      dummy.rotation.set(i, i * 0.5, 0.3);
      const s = 0.65 + (i % 3) * 0.28;
      dummy.scale.set(s, s * 0.6, s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    this.root.add(mesh);

    const chunk = new THREE.Mesh(this.geo(new THREE.DodecahedronGeometry(0.34, 0)), stoneDark);
    chunk.position.set(1.15, 0.2, 5.15);
    chunk.scale.set(1.2, 0.7, 1);
    chunk.castShadow = true;
    this.root.add(chunk);
  }

  private addAtmosphere(): void {
    const count = isMobilePlay() ? HALL_DUST_COUNT_MOBILE : HALL_DUST_COUNT;
    this.dust.push(...createDustMotes(count));
    const dustMat = this.mat(
      new THREE.MeshBasicMaterial({
        color: 0xd5dee6,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      }),
    );
    const dustGeo = this.geo(new THREE.SphereGeometry(0.07, 5, 4));
    const dustMesh = new THREE.InstancedMesh(dustGeo, dustMat, count);
    dustMesh.name = 'HallDust';
    dustMesh.userData[OCCLUDER_SKIP] = true;
    dustMesh.frustumCulled = false;
    this.dustMesh = dustMesh;
    this.root.add(dustMesh);
    this.writeDust();

    const low = this.fogPlane(0.42, 7.4, 12.4, 0.28);
    const high = this.fogPlane(1.45, 7.1, 11.6, 0.12);
    this.root.add(low);
    this.root.add(high);
  }

  private fogPlane(y: number, width: number, depth: number, alpha: number): THREE.Mesh {
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTime: { value: 0 },
        uAlpha: { value: alpha },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uAlpha;
        varying vec2 vUv;
        void main() {
          float n = sin(vUv.x * 8.0 + uTime * 0.15) * sin(vUv.y * 6.0 - uTime * 0.1);
          n += sin((vUv.x + vUv.y) * 15.0 + uTime * 0.22) * 0.4;
          float edge = smoothstep(0.0, 0.16, vUv.x) * smoothstep(1.0, 0.84, vUv.x);
          edge *= smoothstep(0.0, 0.12, vUv.y) * smoothstep(1.0, 0.88, vUv.y);
          float alpha = edge * uAlpha * (0.75 + 0.35 * n);
          gl_FragColor = vec4(0.76, 0.82, 0.88, clamp(alpha, 0.0, 0.32));
        }
      `,
    });
    this.mat(mat);
    this.fogMats.push(mat);
    const mesh = new THREE.Mesh(this.geo(new THREE.PlaneGeometry(width, depth)), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(0, y, 0.4);
    mesh.userData[OCCLUDER_SKIP] = true;
    return mesh;
  }

  private updateDust(dt: number): void {
    for (const mat of this.fogMats) mat.uniforms.uTime!.value = this.time;
    if (!this.dustMesh) return;
    for (const mote of this.dust) stepDustMote(mote, dt, this.time);
    this.writeDust();
  }

  private writeDust(): void {
    const mesh = this.dustMesh;
    if (!mesh) return;
    for (let i = 0; i < this.dust.length; i++) {
      const mote = this.dust[i]!;
      const bob = 1 + Math.sin(this.time * 1.3 + mote.phase) * 0.18;
      this.dustDummy.position.set(mote.x, mote.y, mote.z);
      this.dustDummy.rotation.set(mote.spin, mote.phase, 0);
      this.dustDummy.scale.setScalar(bob);
      this.dustDummy.updateMatrix();
      mesh.setMatrixAt(i, this.dustDummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  private tagOccluder(root: THREE.Object3D): void {
    markOccluderFade(root);
    this.occluders.push(root);
  }

  private clampHall(x: number, z: number, radius: number): { x: number; z: number } {
    return {
      x: Math.min(HALL_BOUNDS.maxX - radius, Math.max(HALL_BOUNDS.minX + radius, x)),
      z: Math.min(HALL_BOUNDS.maxZ - radius, Math.max(HALL_BOUNDS.minZ + radius, z)),
    };
  }

  private overlaps(x: number, z: number, circle: Circle, minDist: number): boolean {
    const dx = x - circle.x;
    const dz = z - circle.z;
    return dx * dx + dz * dz < minDist * minDist - 1e-6;
  }

  /**
   * Push out of one circle. If the wall clamps that push back into the circle,
   * slide to the nearest in-bounds rim point so the hero is not stuck jittering.
   */
  private pushCircle(x: number, z: number, circle: Circle, radius: number): { x: number; z: number } {
    const minDist = circle.radius + radius;
    let dx = x - circle.x;
    let dz = z - circle.z;
    const d2 = dx * dx + dz * dz;
    if (d2 >= minDist * minDist) return { x, z };
    if (d2 < 1e-8) {
      dx = minDist;
      dz = 0;
    } else {
      const scale = minDist / Math.sqrt(d2);
      dx *= scale;
      dz *= scale;
    }
    const pushed = this.clampHall(circle.x + dx, circle.z + dz, radius);
    if (!this.overlaps(pushed.x, pushed.z, circle, minDist)) return pushed;

    let bestX = pushed.x;
    let bestZ = pushed.z;
    let bestD = Infinity;
    for (let i = 0; i < 20; i++) {
      const angle = (i / 20) * Math.PI * 2;
      const candidate = this.clampHall(
        circle.x + Math.cos(angle) * minDist,
        circle.z + Math.sin(angle) * minDist,
        radius,
      );
      if (this.overlaps(candidate.x, candidate.z, circle, minDist)) continue;
      let blocked = false;
      for (const other of this.circles) {
        if (other === circle) continue;
        if (this.overlaps(candidate.x, candidate.z, other, other.radius + radius)) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;
      const ddx = candidate.x - x;
      const ddz = candidate.z - z;
      const dist = ddx * ddx + ddz * ddz;
      if (dist < bestD) {
        bestD = dist;
        bestX = candidate.x;
        bestZ = candidate.z;
      }
    }
    return { x: bestX, z: bestZ };
  }

  private geo<T extends THREE.BufferGeometry>(geometry: T): T {
    this.geos.push(geometry);
    return geometry;
  }

  private mat<T extends THREE.Material>(material: T): T {
    this.mats.push(material);
    return material;
  }

  private disposeBuilt(): void {
    this.root.clear();
    for (const geometry of this.geos) {
      geometry.dispose();
      this.disposedGeometries += 1;
    }
    for (const material of this.mats) {
      material.dispose();
      this.disposedMaterials += 1;
    }
    this.geos.length = 0;
    this.mats.length = 0;
    this.flames.length = 0;
    this.lights.length = 0;
    this.circles.length = 0;
    this.occluders.length = 0;
    this.dust.length = 0;
    this.dustMesh = null;
    this.fogMats = [];
    this.built = false;
  }
}
