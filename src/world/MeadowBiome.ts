import * as THREE from 'three';
import {
  Palette,
  createToonMaterial,
  paintGroundVertexColors,
  displaceGroundHeight,
  meadowPathInfluence,
  EastShrineClearing,
  WestMistyGrove,
  NorthRuinsClearing,
  SouthRiverFordClearing,
  hash2,
} from '../render/stylized';
import type { WorldPropLibrary } from './WorldPropLibrary';
import { PROP_COLLISION_SCALE, WELL_OFFSET } from './WorldPropLibrary';

export type Obstacle = { x: number; z: number; radius: number };

type PropPlacement = { x: number; z: number; scale: number };

type SignFacing = 'east' | 'west' | 'north' | 'south';

/** Shared stylized meadow: living ground, tiered trees, rocks, landmarks. */
export class MeadowBiome {
  readonly root = new THREE.Group();
  /** Larger disk so east/west/north/south clearings sit on painted ground. */
  readonly groundSize = 145;
  readonly playRadius = 44;
  /** Second playable pocket — ancient shrine clearing east of the main ring. */
  readonly eastClearing = EastShrineClearing;
  /** Soft corridor half-width connecting main meadow → east clearing. */
  readonly eastCorridorHalfWidth = 6.0;
  /** Third playable pocket — misty grove clearing west of the main ring. */
  readonly westClearing = WestMistyGrove;
  /** Soft corridor half-width connecting main meadow → west grove. */
  readonly westCorridorHalfWidth = 6.0;
  /** Fourth playable pocket — crumbled ruins courtyard north of the main ring. */
  readonly northClearing = NorthRuinsClearing;
  /** Soft corridor half-width connecting main meadow → north ruins. */
  readonly northCorridorHalfWidth = 6.0;
  /** Fifth playable pocket — river ford clearing south of the main ring. */
  readonly southClearing = SouthRiverFordClearing;
  /** Soft corridor half-width connecting main meadow → south river ford. */
  readonly southCorridorHalfWidth = 6.0;
  /** Solid props used for soft collision (trees + rocks + landmarks). */
  readonly obstacles: Obstacle[] = [];

  /** Interact radius for the east shrine crystal (player proximity). */
  readonly shrineInteractRadius = 5.8;
  /** World XZ of the ancient shrine crystal/tower. */
  readonly shrinePosition = new THREE.Vector3(EastShrineClearing.x, 0, EastShrineClearing.z);

  private shrineCrystal: THREE.Mesh | null = null;
  private shrineCrystalTip: THREE.Mesh | null = null;
  private shrineCrystalMat: THREE.MeshToonMaterial | null = null;
  private shrineActivated = false;
  private shrinePulseT = 0;

  /** Recorded so KayKit pack visuals can replace procedural meshes; radii retuned on apply. */
  private readonly treePlacements: PropPlacement[] = [];
  private readonly rockPlacements: PropPlacement[] = [];
  private cottagePlacement: { x: number; z: number } | null = null;
  private windmillPlacement: { x: number; z: number } | null = null;
  private packApplied = false;

  private readonly canopyLowGeo = new THREE.ConeGeometry(1.15, 1.55, 7);
  private readonly canopyMidGeo = new THREE.ConeGeometry(0.88, 1.35, 7);
  private readonly canopyTopGeo = new THREE.ConeGeometry(0.55, 1.1, 7);
  private readonly trunkGeo = new THREE.CylinderGeometry(0.18, 0.32, 1.25, 7);
  private readonly trunkFatGeo = new THREE.CylinderGeometry(0.22, 0.38, 1.05, 7);
  private readonly rockGeo = new THREE.DodecahedronGeometry(0.62, 0);
  private readonly rockSmallGeo = new THREE.DodecahedronGeometry(0.3, 0);
  private readonly rockChunkGeo = new THREE.DodecahedronGeometry(0.4, 0);
  private readonly flowerPetalGeo = new THREE.SphereGeometry(0.12, 7, 7);
  private readonly flowerCenterGeo = new THREE.SphereGeometry(0.065, 6, 6);
  private readonly stemGeo = new THREE.CylinderGeometry(0.022, 0.032, 0.26, 5);
  private readonly grassBladeGeo = this.makeGrassTuftGeo();

  private readonly grassMat = createToonMaterial(0xffffff);
  private readonly leafMat = createToonMaterial(Palette.leafA);
  private readonly leafMatB = createToonMaterial(Palette.leafB);
  private readonly leafMatC = createToonMaterial(Palette.leafC);
  private readonly leafDark = createToonMaterial(Palette.leafDark);
  private readonly trunkMat = createToonMaterial(Palette.trunk);
  private readonly trunkDarkMat = createToonMaterial(Palette.trunkDark);
  private readonly rockMat = createToonMaterial(Palette.rock);
  private readonly rockShadowMat = createToonMaterial(Palette.rockShadow);
  private readonly rockLightMat = createToonMaterial(Palette.rockLight);
  private readonly mossMat = createToonMaterial(Palette.moss);
  private readonly cliffMat = createToonMaterial(Palette.cliff);
  private readonly stemMat = createToonMaterial(Palette.stem);
  private readonly grassTuftMat = createToonMaterial(Palette.grassTuft);
  private readonly woodMat = createToonMaterial(Palette.wood);
  private readonly woodDarkMat = createToonMaterial(Palette.woodDark);
  private readonly roofMat = createToonMaterial(Palette.roofTile);
  private readonly pondMat = createToonMaterial(Palette.pond, {
    transparent: true,
    opacity: 0.82,
    emissive: Palette.pond,
    emissiveIntensity: 0.08,
  });
  private readonly pondDeepMat = createToonMaterial(Palette.pondDeep);
  private readonly signBoardMat = createToonMaterial(Palette.signBoard);
  private readonly flowerCenterMat = createToonMaterial(Palette.flowerWhite, {
    emissive: Palette.flowerYellow,
    emissiveIntensity: 0.12,
  });
  private readonly flowerMats = [
    createToonMaterial(Palette.flowerPink),
    createToonMaterial(Palette.flowerYellow),
    createToonMaterial(Palette.flowerCyan),
    createToonMaterial(Palette.flowerPurple),
  ];
  private readonly mushroomCapMat = createToonMaterial(0xd4e8f0, {
    emissive: 0x7ec8e8,
    emissiveIntensity: 0.55,
  });
  private readonly mushroomStemMat = createToonMaterial(0xf0ebe0);
  private readonly mistMat = createToonMaterial(0xb8d4e8, {
    transparent: true,
    opacity: 0.38,
    emissive: 0x8ec4e0,
    emissiveIntensity: 0.28,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  constructor() {
    this.root.name = 'MeadowBiome';
    this.grassMat.vertexColors = true;
    this.buildGround();
    this.buildGrassInstances();
    this.buildRingOfTrees();
    this.scatterProps();
    this.buildLandmarks();
    this.buildEastShrineClearing();
    this.buildWestMistyGrove();
    this.buildNorthRuinsClearing();
    this.buildSouthRiverFordClearing();
    this.buildEdgeLedges();
  }

  private makeGrassTuftGeo(): THREE.BufferGeometry {
    // Three crossed flat blades — cheap tuft silhouette.
    const geo = new THREE.BufferGeometry();
    const positions: number[] = [];
    const blades = 3;
    for (let i = 0; i < blades; i++) {
      const a = (i / blades) * Math.PI;
      const hx = Math.cos(a) * 0.12;
      const hz = Math.sin(a) * 0.12;
      // triangle blade
      positions.push(-hx, 0, -hz, hx, 0, hz, 0, 0.38 + (i % 2) * 0.08, 0);
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.computeVertexNormals();
    return geo;
  }

  private buildGround(): void {
    const groundGeo = new THREE.CircleGeometry(this.groundSize * 0.5, 72);
    displaceGroundHeight(groundGeo, {
      amplitude: 0.42,
      pathFn: meadowPathInfluence,
    });
    paintGroundVertexColors(
      groundGeo,
      { a: Palette.grassA, b: Palette.grassB, c: Palette.grassC },
      {
        pathFn: meadowPathInfluence,
        pathColor: Palette.path,
        pathEdge: Palette.pathEdge,
      },
    );
    const ground = new THREE.Mesh(groundGeo, this.grassMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.root.add(ground);

    // Soft outer meadow band for depth (sits above displaced ground)
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(34, 44, 56),
      createToonMaterial(Palette.grassB),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    ring.receiveShadow = true;
    this.root.add(ring);

    // Soft grass RING under the east clearing — leave the center open so the
    // dirt path arrival pad (vertex colors on the ground) stays visible.
    const clearingPad = new THREE.Mesh(
      new THREE.RingGeometry(5.2, this.eastClearing.radius + 1.8, 40),
      createToonMaterial(Palette.grassB),
    );
    clearingPad.rotation.x = -Math.PI / 2;
    clearingPad.position.set(this.eastClearing.x, 0.025, this.eastClearing.z);
    clearingPad.receiveShadow = true;
    this.root.add(clearingPad);

    // Soft grass RING under the west misty grove (same idea, cooler tint).
    const westPad = new THREE.Mesh(
      new THREE.RingGeometry(5.2, this.westClearing.radius + 1.8, 40),
      createToonMaterial(0x4a9a58),
    );
    westPad.rotation.x = -Math.PI / 2;
    westPad.position.set(this.westClearing.x, 0.025, this.westClearing.z);
    westPad.receiveShadow = true;
    this.root.add(westPad);

    // Soft grass RING under the north ruins (warmer stone-adjacent tint).
    const northPad = new THREE.Mesh(
      new THREE.RingGeometry(5.2, this.northClearing.radius + 1.8, 40),
      createToonMaterial(0x6a8a52),
    );
    northPad.rotation.x = -Math.PI / 2;
    northPad.position.set(this.northClearing.x, 0.025, this.northClearing.z);
    northPad.receiveShadow = true;
    this.root.add(northPad);

    // Soft grass RING under the south river ford (cooler riverside tint).
    const southPad = new THREE.Mesh(
      new THREE.RingGeometry(5.2, this.southClearing.radius + 1.8, 40),
      createToonMaterial(0x5a9a62),
    );
    southPad.rotation.x = -Math.PI / 2;
    southPad.position.set(this.southClearing.x, 0.025, this.southClearing.z);
    southPad.receiveShadow = true;
    this.root.add(southPad);

    this.buildEastPathRibbon();
    this.buildWestPathRibbon();
    this.buildNorthPathRibbon();
    this.buildSouthPathRibbon();
  }

  /** Explicit dirt ribbon so the east branch reads clearly at iso distance. */
  private buildEastPathRibbon(): void {
    const pathMat = createToonMaterial(Palette.path);
    const edgeMat = createToonMaterial(Palette.pathEdge);
    const ax = 15;
    const az = 5.2;
    const bx = this.eastClearing.x;
    const bz = this.eastClearing.z;
    const segments = 12;
    for (let i = 0; i < segments; i++) {
      const t0 = i / segments;
      const t1 = (i + 1) / segments;
      const x0 = ax + (bx - ax) * t0;
      const z0 = az + (bz - az) * t0;
      const x1 = ax + (bx - ax) * t1;
      const z1 = az + (bz - az) * t1;
      const mx = (x0 + x1) * 0.5;
      const mz = (z0 + z1) * 0.5;
      const dx = x1 - x0;
      const dz = z1 - z0;
      const len = Math.hypot(dx, dz);
      const ang = Math.atan2(dx, dz);
      const width = 3.6 + Math.sin(t0 * Math.PI) * 0.5;

      const plank = new THREE.Mesh(new THREE.BoxGeometry(width, 0.04, len + 0.15), pathMat);
      plank.position.set(mx, 0.045, mz);
      plank.rotation.y = ang;
      plank.receiveShadow = true;
      this.root.add(plank);

      const edge = new THREE.Mesh(
        new THREE.BoxGeometry(width + 0.55, 0.02, len + 0.2),
        edgeMat,
      );
      edge.position.set(mx, 0.03, mz);
      edge.rotation.y = ang;
      edge.receiveShadow = true;
      this.root.add(edge);
    }

    // Arrival dirt disk under the shrine (sits above ground, below dais)
    const pad = new THREE.Mesh(new THREE.CircleGeometry(4.6, 28), pathMat);
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(this.eastClearing.x, 0.04, this.eastClearing.z);
    pad.receiveShadow = true;
    this.root.add(pad);
  }

  /** Explicit dirt ribbon so the west branch reads clearly at iso distance. */
  private buildWestPathRibbon(): void {
    const pathMat = createToonMaterial(Palette.path);
    const edgeMat = createToonMaterial(Palette.pathEdge);
    const ax = -15;
    const az = 1.4;
    const bx = this.westClearing.x;
    const bz = this.westClearing.z;
    const segments = 12;
    for (let i = 0; i < segments; i++) {
      const t0 = i / segments;
      const t1 = (i + 1) / segments;
      const x0 = ax + (bx - ax) * t0;
      const z0 = az + (bz - az) * t0;
      const x1 = ax + (bx - ax) * t1;
      const z1 = az + (bz - az) * t1;
      const mx = (x0 + x1) * 0.5;
      const mz = (z0 + z1) * 0.5;
      const dx = x1 - x0;
      const dz = z1 - z0;
      const len = Math.hypot(dx, dz);
      const ang = Math.atan2(dx, dz);
      const width = 3.6 + Math.sin(t0 * Math.PI) * 0.5;

      const plank = new THREE.Mesh(new THREE.BoxGeometry(width, 0.04, len + 0.15), pathMat);
      plank.position.set(mx, 0.045, mz);
      plank.rotation.y = ang;
      plank.receiveShadow = true;
      this.root.add(plank);

      const edge = new THREE.Mesh(
        new THREE.BoxGeometry(width + 0.55, 0.02, len + 0.2),
        edgeMat,
      );
      edge.position.set(mx, 0.03, mz);
      edge.rotation.y = ang;
      edge.receiveShadow = true;
      this.root.add(edge);
    }

    const pad = new THREE.Mesh(new THREE.CircleGeometry(4.6, 28), pathMat);
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(this.westClearing.x, 0.04, this.westClearing.z);
    pad.receiveShadow = true;
    this.root.add(pad);
  }

  /** Explicit dirt ribbon so the north branch reads clearly at iso distance. */
  private buildNorthPathRibbon(): void {
    const pathMat = createToonMaterial(Palette.path);
    const edgeMat = createToonMaterial(Palette.pathEdge);
    const ax = 3;
    const az = 18;
    const bx = this.northClearing.x;
    const bz = this.northClearing.z;
    const segments = 12;
    for (let i = 0; i < segments; i++) {
      const t0 = i / segments;
      const t1 = (i + 1) / segments;
      const x0 = ax + (bx - ax) * t0;
      const z0 = az + (bz - az) * t0;
      const x1 = ax + (bx - ax) * t1;
      const z1 = az + (bz - az) * t1;
      const mx = (x0 + x1) * 0.5;
      const mz = (z0 + z1) * 0.5;
      const dx = x1 - x0;
      const dz = z1 - z0;
      const len = Math.hypot(dx, dz);
      const ang = Math.atan2(dx, dz);
      const width = 3.6 + Math.sin(t0 * Math.PI) * 0.5;

      const plank = new THREE.Mesh(new THREE.BoxGeometry(width, 0.04, len + 0.15), pathMat);
      plank.position.set(mx, 0.045, mz);
      plank.rotation.y = ang;
      plank.receiveShadow = true;
      this.root.add(plank);

      const edge = new THREE.Mesh(
        new THREE.BoxGeometry(width + 0.55, 0.02, len + 0.2),
        edgeMat,
      );
      edge.position.set(mx, 0.03, mz);
      edge.rotation.y = ang;
      edge.receiveShadow = true;
      this.root.add(edge);
    }

    const pad = new THREE.Mesh(new THREE.CircleGeometry(4.6, 28), pathMat);
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(this.northClearing.x, 0.04, this.northClearing.z);
    pad.receiveShadow = true;
    this.root.add(pad);
  }

  /** Explicit dirt ribbon so the south branch reads clearly at iso distance. */
  private buildSouthPathRibbon(): void {
    const pathMat = createToonMaterial(Palette.path);
    const edgeMat = createToonMaterial(Palette.pathEdge);
    const ax = -3;
    const az = -18;
    const bx = this.southClearing.x;
    const bz = this.southClearing.z;
    const segments = 12;
    for (let i = 0; i < segments; i++) {
      const t0 = i / segments;
      const t1 = (i + 1) / segments;
      const x0 = ax + (bx - ax) * t0;
      const z0 = az + (bz - az) * t0;
      const x1 = ax + (bx - ax) * t1;
      const z1 = az + (bz - az) * t1;
      const mx = (x0 + x1) * 0.5;
      const mz = (z0 + z1) * 0.5;
      const dx = x1 - x0;
      const dz = z1 - z0;
      const len = Math.hypot(dx, dz);
      const ang = Math.atan2(dx, dz);
      const width = 3.6 + Math.sin(t0 * Math.PI) * 0.5;

      const plank = new THREE.Mesh(new THREE.BoxGeometry(width, 0.04, len + 0.15), pathMat);
      plank.position.set(mx, 0.045, mz);
      plank.rotation.y = ang;
      plank.receiveShadow = true;
      this.root.add(plank);

      const edge = new THREE.Mesh(
        new THREE.BoxGeometry(width + 0.55, 0.02, len + 0.2),
        edgeMat,
      );
      edge.position.set(mx, 0.03, mz);
      edge.rotation.y = ang;
      edge.receiveShadow = true;
      this.root.add(edge);
    }

    const pad = new THREE.Mesh(new THREE.CircleGeometry(4.6, 28), pathMat);
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(this.southClearing.x, 0.04, this.southClearing.z);
    pad.receiveShadow = true;
    this.root.add(pad);
  }

  private buildGrassInstances(): void {
    const count = 580;
    const mesh = new THREE.InstancedMesh(this.grassBladeGeo, this.grassTuftMat, count);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    const dummy = new THREE.Object3D();
    let placed = 0;
    let guard = 0;
    while (placed < count && guard < count * 10) {
      guard += 1;
      let x: number;
      let z: number;
      // Bias later placements into east/west/north/south clearings so pockets feel inhabited.
      if (placed > 520) {
        const ang = hash2(placed * 1.7, guard * 0.3) * Math.PI * 2;
        const rad = hash2(guard * 2.1, placed * 0.9) * (this.southClearing.radius - 1.2);
        x = this.southClearing.x + Math.cos(ang) * rad;
        z = this.southClearing.z + Math.sin(ang) * rad;
      } else if (placed > 460) {
        const ang = hash2(placed * 1.7, guard * 0.3) * Math.PI * 2;
        const rad = hash2(guard * 2.1, placed * 0.9) * (this.northClearing.radius - 1.2);
        x = this.northClearing.x + Math.cos(ang) * rad;
        z = this.northClearing.z + Math.sin(ang) * rad;
      } else if (placed > 400) {
        const ang = hash2(placed * 1.7, guard * 0.3) * Math.PI * 2;
        const rad = hash2(guard * 2.1, placed * 0.9) * (this.westClearing.radius - 1.2);
        x = this.westClearing.x + Math.cos(ang) * rad;
        z = this.westClearing.z + Math.sin(ang) * rad;
      } else if (placed > 340) {
        const ang = hash2(placed * 1.7, guard * 0.3) * Math.PI * 2;
        const rad = hash2(guard * 2.1, placed * 0.9) * (this.eastClearing.radius - 1.2);
        x = this.eastClearing.x + Math.cos(ang) * rad;
        z = this.eastClearing.z + Math.sin(ang) * rad;
      } else {
        const ang = hash2(placed * 1.7, guard * 0.3) * Math.PI * 2;
        const rad = 3 + hash2(guard * 2.1, placed * 0.9) * 36;
        x = Math.cos(ang) * rad;
        z = Math.sin(ang) * rad;
        if (Math.hypot(x, z) > this.playRadius - 1) continue;
      }
      // Keep path and spawn camp clearer
      if (meadowPathInfluence(x, z) > 0.55) continue;
      if (Math.hypot(x, z - 6) < 3.2) continue;
      const s = 0.7 + hash2(x, z) * 0.9;
      dummy.position.set(x, 0.01, z);
      dummy.rotation.y = hash2(z, x) * Math.PI * 2;
      dummy.scale.set(s, s * (0.85 + hash2(x * 2, z) * 0.4), s);
      dummy.updateMatrix();
      mesh.setMatrixAt(placed, dummy.matrix);
      placed += 1;
    }
    mesh.count = placed;
    mesh.instanceMatrix.needsUpdate = true;
    this.root.add(mesh);
  }

  private buildRingOfTrees(): void {
    const count = 34;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const radius = 38.5 + (i % 4) * 1.35;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      // Gap for dirt path branches into east shrine / west grove / north ruins / south ford.
      if (this.isOnEastBranchApproach(x, z)) continue;
      if (this.isOnWestBranchApproach(x, z)) continue;
      if (this.isOnNorthBranchApproach(x, z)) continue;
      if (this.isOnSouthBranchApproach(x, z)) continue;
      if (meadowPathInfluence(x, z) > 0.28) continue;
      this.addTree(x, z, 0.88 + (i % 5) * 0.07);
    }
  }

  private scatterProps(): void {
    const treeSpots: Array<[number, number, number]> = [
      [-8, -6, 1.05],
      [10, -4, 1.15],
      [-12, 8, 0.95],
      [6, 12, 1.1],
      // Was (−3, 16) — nudged west so the north path branch stays open
      [-8, 18, 1],
      // Was (14, 6) — moved north so the east path branch stays open
      [14, 12, 1.05],
      // Was (−16, −2) — nudged south so the west path branch stays open
      [-16, -8, 1.2],
      // Was (3, −12) — nudged east so the south path branch stays open
      [8, -14, 1.05],
      [-18, 10, 0.92],
      [16, -12, 1.08],
      // Outer-band fillers for the expanded meadow ring
      [28, -14, 1.05],
      [-30, 14, 0.98],
      [20, 30, 1.1],
      [-22, -28, 1.02],
    ];
    for (const [x, z, s] of treeSpots) {
      if (this.isOnEastBranchApproach(x, z)) continue;
      if (this.isOnWestBranchApproach(x, z)) continue;
      if (this.isOnNorthBranchApproach(x, z)) continue;
      if (this.isOnSouthBranchApproach(x, z)) continue;
      this.addTree(x, z, s);
    }

    const rockSpots: Array<[number, number, number]> = [
      [4.2, -3.1, 0.9],
      [-5.5, 2.4, 1.1],
      [9.1, 5.8, 0.75],
      [-9.4, -7.2, 1],
      // Was (1.6, 11.3) — nudged off the north branch corridor
      [6.2, 9.1, 0.85],
      // Was (−13.2, 1.1) — nudged off the west branch corridor
      [-13.2, 6.1, 1.15],
      [11.8, -9.4, 0.8],
      // Was (−2.8, −10.6) — nudged west so the south path branch stays open
      [-7.2, -10.6, 0.95],
      // Was (7.4, 14.2) — kept east of north corridor
      [11.4, 16.2, 0.7],
      [-7.1, 12.5, 1.05],
      // Was (15.2, 1.8) — nudged off the branch corridor
      [15.2, -2.4, 0.9],
      [-14.6, -5.3, 0.75],
      // Was (5.9, −14.1) — kept east of south corridor
      [9.4, -16.1, 1],
      [-0.8, 7.6, 0.65],
      [12.4, 10.1, 0.85],
      [-10.8, 8.9, 0.8],
      [3.3, 3.7, 0.6],
      // Was (−6.2, −13.4) — kept west of south corridor
      [-10.2, -15.4, 0.95],
      // Was (18, 8) — corridor rocks cleared for the path branch
      [18, 14, 1.2],
      // Was (−17, −10) — kept south of west corridor
      [-17, -12, 1.05],
      // Outer-band rocks in the expanded play ring
      [32, 8, 1.05],
      [-28, -18, 0.9],
      [12, 34, 0.85],
      [-14, -32, 1.0],
    ];
    for (const [x, z, s] of rockSpots) {
      if (this.isOnEastBranchApproach(x, z)) continue;
      if (this.isOnWestBranchApproach(x, z)) continue;
      if (this.isOnNorthBranchApproach(x, z)) continue;
      if (this.isOnSouthBranchApproach(x, z)) continue;
      this.addRock(x, z, s);
    }

    // Flower clusters — denser patches rather than lonely singles
    const clusters: Array<[number, number, number]> = [
      [2, 1, 5],
      [-3, 4, 4],
      [5, -2, 6],
      [-6, -1, 4],
      [8, 3, 5],
      [-1, -5, 4],
      [4, 8, 5],
      [-8, 6, 4],
      [10, -7, 5],
      [-4, 10, 6],
      [1, 13, 4],
      [-11, -3, 5],
      [7, 9, 4],
      [13, 4, 5],
      [0, -9, 4],
      [6, -11, 5],
      [-5, -8, 4],
      [9, 12, 5],
      [-12, 5, 4],
      [14, 7, 5],
      [-13, 9, 4],
      [2, -13, 5],
      [-10, 11, 4],
      [5, 5, 6],
      [-3, -14, 4],
      [12, -12, 5],
      [-14, -1, 4],
      [10, 8, 5],
      [-8, -6, 4],
      [16, -3, 5],
    ];
    for (const [cx, cz, n] of clusters) {
      for (let i = 0; i < n; i++) {
        const ox = (hash2(cx + i, cz) - 0.5) * 1.6;
        const oz = (hash2(cz + i, cx) - 0.5) * 1.6;
        this.addFlower(cx + ox, cz + oz);
      }
    }
  }

  private buildLandmarks(): void {
    // Wooden signpost near spawn — “Prontera South” vibe without text textures
    this.addSignpost(2.8, 8.4);
    // Branch marker — points players toward the east shrine clearing
    this.addSignpost(21, 8.2);
    // Branch marker — points players toward the west misty grove
    this.addSignpost(-21, 3.6, 'west');
    // Branch marker — points players toward the north ruins courtyard
    this.addSignpost(5.2, 21, 'north');
    // Branch marker — points players toward the south river ford
    this.addSignpost(-5.2, -21, 'south');
    // Quiet pond off the path
    this.addPond(-11.5, -11.5);
    // Ruin pillar cluster for a read-able landmark
    this.addRuinPillar(15.5, -6.5);
    // Tiny cottage + windmill silhouette on the rim (out of play collision mostly)
    this.addCottage(-29, 21);
    // Windmill kept north of the east path so the branch stays readable
    this.addWindmill(31, 23);
    // Small outer-ring landmarks so the expanded meadow doesn’t read as empty grass
    this.addStandingStones(26, -24);
    this.addWaysideCairn(-24, 28);
  }

  /** Pair of standing stones — tiny SE spur landmark in the expanded ring. */
  private addStandingStones(x: number, z: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    const tall = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 2.4, 0.4),
      this.cliffMat,
    );
    tall.position.set(-0.55, 1.2, 0.1);
    tall.rotation.z = -0.08;
    tall.castShadow = true;
    tall.receiveShadow = true;
    group.add(tall);
    const short = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 1.7, 0.35),
      this.rockShadowMat,
    );
    short.position.set(0.7, 0.85, -0.15);
    short.rotation.z = 0.12;
    short.castShadow = true;
    short.receiveShadow = true;
    group.add(short);
    const moss = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 6, 5),
      this.mossMat,
    );
    moss.position.set(0.05, 0.2, 0.55);
    moss.scale.set(1.2, 0.55, 1);
    group.add(moss);
    this.root.add(group);
    this.obstacles.push({ x, z, radius: 1.15 });
  }

  /** Low stone cairn — NW path-spur cue without a fifth biome pocket. */
  private addWaysideCairn(x: number, z: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.95, 1.15, 0.45, 7),
      this.cliffMat,
    );
    base.position.y = 0.22;
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);
    const mid = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.75, 0.4, 6),
      this.rockShadowMat,
    );
    mid.position.y = 0.62;
    mid.castShadow = true;
    group.add(mid);
    const tip = new THREE.Mesh(
      new THREE.ConeGeometry(0.28, 0.55, 5),
      this.mossMat,
    );
    tip.position.y = 1.05;
    tip.castShadow = true;
    group.add(tip);
    this.root.add(group);
    this.obstacles.push({ x, z, radius: 1.05 });
  }

  /** Second playable clearing: dirt-path arrival, stone-circle shrine, rim trees. */
  private buildEastShrineClearing(): void {
    const { x: cx, z: cz, radius } = this.eastClearing;

    this.addAncientShrine(cx, cz);

    // Rim trees — leave the western entrance open for the path branch
    const rimTrees = 10;
    for (let i = 0; i < rimTrees; i++) {
      const a = (i / rimTrees) * Math.PI * 2;
      // Skip west-facing arcs (path enters from -X)
      if (Math.cos(a) < -0.35) continue;
      const r = radius + 0.6 + (i % 3) * 0.55;
      this.addTree(cx + Math.cos(a) * r, cz + Math.sin(a) * r, 0.9 + (i % 4) * 0.08);
    }

    const clearingRocks: Array<[number, number, number]> = [
      [cx + 5.2, cz - 3.4, 0.95],
      [cx - 3.8, cz + 5.1, 0.8],
      [cx + 3.6, cz + 4.8, 1.05],
      [cx + 6.4, cz + 1.2, 0.7],
      [cx - 1.5, cz - 6.2, 0.9],
    ];
    for (const [x, z, s] of clearingRocks) {
      if (meadowPathInfluence(x, z) > 0.55) continue;
      this.addRock(x, z, s);
    }

    const flowerPatches: Array<[number, number, number]> = [
      [cx + 4, cz - 5, 5],
      [cx - 5, cz + 2, 4],
      [cx + 2, cz + 6, 5],
      [cx + 6, cz - 1, 4],
      [cx - 4, cz - 4, 5],
    ];
    for (const [fx, fz, n] of flowerPatches) {
      for (let i = 0; i < n; i++) {
        const ox = (hash2(fx + i, fz) - 0.5) * 1.5;
        const oz = (hash2(fz + i, fx) - 0.5) * 1.5;
        this.addFlower(fx + ox, fz + oz);
      }
    }

    // Low mossy ledge on the far rim — readable “edge of the world” cue
    const ledgeX = cx + (radius - 2.5);
    const ledgeZ = cz + 4.2;
    const ledge = new THREE.Group();
    ledge.position.set(ledgeX, 0, ledgeZ);
    const top = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 1.9, 0.3, 7),
      this.mossMat,
    );
    top.position.y = 0.5;
    top.castShadow = true;
    top.receiveShadow = true;
    ledge.add(top);
    const cliff = new THREE.Mesh(
      new THREE.CylinderGeometry(1.5, 1.8, 1.0, 7),
      this.cliffMat,
    );
    cliff.position.y = 0.05;
    cliff.castShadow = true;
    ledge.add(cliff);
    this.root.add(ledge);
    this.obstacles.push({ x: ledgeX, z: ledgeZ, radius: 1.45 });
  }

  /**
   * West playable clearing: dirt-path arrival, fallen giant tree + fairy ring,
   * mist volumes, rim trees — distinct from the east shrine landmark.
   */
  private buildWestMistyGrove(): void {
    const { x: cx, z: cz, radius } = this.westClearing;

    this.addFallenGiantTree(cx, cz);
    this.addFairyRing(cx - 1.2, cz + 0.8, 3.4, 9);
    this.addGroveMist(cx, cz);

    // Rim trees — leave the eastern entrance open for the path branch
    const rimTrees = 10;
    for (let i = 0; i < rimTrees; i++) {
      const a = (i / rimTrees) * Math.PI * 2;
      // Skip east-facing arcs (path enters from +X)
      if (Math.cos(a) > 0.35) continue;
      const r = radius + 0.6 + (i % 3) * 0.55;
      this.addTree(cx + Math.cos(a) * r, cz + Math.sin(a) * r, 0.9 + (i % 4) * 0.08);
    }

    const clearingRocks: Array<[number, number, number]> = [
      [cx - 5.2, cz + 3.4, 0.95],
      [cx + 3.8, cz - 5.1, 0.8],
      [cx - 3.6, cz - 4.8, 1.05],
      [cx - 6.4, cz - 1.2, 0.7],
      [cx + 1.5, cz + 6.2, 0.9],
    ];
    for (const [x, z, s] of clearingRocks) {
      if (meadowPathInfluence(x, z) > 0.55) continue;
      this.addRock(x, z, s);
    }

    const flowerPatches: Array<[number, number, number]> = [
      [cx - 4, cz + 5, 5],
      [cx + 5, cz - 2, 4],
      [cx - 2, cz - 6, 5],
      [cx - 6, cz + 1, 4],
      [cx + 4, cz + 4, 5],
    ];
    for (const [fx, fz, n] of flowerPatches) {
      for (let i = 0; i < n; i++) {
        const ox = (hash2(fx + i, fz) - 0.5) * 1.5;
        const oz = (hash2(fz + i, fx) - 0.5) * 1.5;
        this.addFlower(fx + ox, fz + oz);
      }
    }

    // Extra glowing mushrooms near the fallen crown
    this.addMushroom(cx + 3.2, cz - 2.4, 1.15);
    this.addMushroom(cx + 4.1, cz - 1.6, 0.85);
    this.addMushroom(cx + 2.6, cz - 3.1, 0.7);

    // Low mossy ledge on the far rim
    const ledgeX = cx - (radius - 2.5);
    const ledgeZ = cz - 4.2;
    const ledge = new THREE.Group();
    ledge.position.set(ledgeX, 0, ledgeZ);
    const top = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 1.9, 0.3, 7),
      this.mossMat,
    );
    top.position.y = 0.5;
    top.castShadow = true;
    top.receiveShadow = true;
    ledge.add(top);
    const cliff = new THREE.Mesh(
      new THREE.CylinderGeometry(1.5, 1.8, 1.0, 7),
      this.cliffMat,
    );
    cliff.position.y = 0.05;
    cliff.castShadow = true;
    ledge.add(cliff);
    this.root.add(ledge);
    this.obstacles.push({ x: ledgeX, z: ledgeZ, radius: 1.45 });
  }

  /**
   * North playable clearing: dirt-path arrival, crumbled gate + broken columns /
   * rubble courtyard — distinct from the east shrine and west fairy ring.
   */
  private buildNorthRuinsClearing(): void {
    const { x: cx, z: cz, radius } = this.northClearing;

    this.addRuinsCourtyard(cx, cz);

    // Rim trees — leave the southern entrance open for the path branch
    const rimTrees = 10;
    for (let i = 0; i < rimTrees; i++) {
      const a = (i / rimTrees) * Math.PI * 2;
      // Skip south-facing arcs (path enters from −Z)
      if (Math.sin(a) < -0.35) continue;
      const r = radius + 0.6 + (i % 3) * 0.55;
      this.addTree(cx + Math.cos(a) * r, cz + Math.sin(a) * r, 0.9 + (i % 4) * 0.08);
    }

    const clearingRocks: Array<[number, number, number]> = [
      [cx + 5.4, cz + 3.2, 0.95],
      [cx - 4.8, cz + 4.6, 0.8],
      [cx + 4.2, cz - 5.0, 1.05],
      [cx - 6.0, cz - 2.4, 0.7],
      [cx + 1.8, cz + 6.4, 0.9],
    ];
    for (const [x, z, s] of clearingRocks) {
      if (meadowPathInfluence(x, z) > 0.55) continue;
      this.addRock(x, z, s);
    }

    const flowerPatches: Array<[number, number, number]> = [
      [cx + 4, cz + 5, 5],
      [cx - 5, cz + 3, 4],
      [cx + 5, cz - 3, 5],
      [cx - 4, cz - 5, 4],
      [cx - 1, cz + 6, 5],
    ];
    for (const [fx, fz, n] of flowerPatches) {
      for (let i = 0; i < n; i++) {
        const ox = (hash2(fx + i, fz) - 0.5) * 1.5;
        const oz = (hash2(fz + i, fx) - 0.5) * 1.5;
        this.addFlower(fx + ox, fz + oz);
      }
    }

    // Low mossy ledge on the far (north) rim
    const ledgeX = cx + 3.2;
    const ledgeZ = cz + (radius - 2.5);
    const ledge = new THREE.Group();
    ledge.position.set(ledgeX, 0, ledgeZ);
    const top = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 1.9, 0.3, 7),
      this.mossMat,
    );
    top.position.y = 0.5;
    top.castShadow = true;
    top.receiveShadow = true;
    ledge.add(top);
    const cliff = new THREE.Mesh(
      new THREE.CylinderGeometry(1.5, 1.8, 1.0, 7),
      this.cliffMat,
    );
    cliff.position.y = 0.05;
    cliff.castShadow = true;
    ledge.add(cliff);
    this.root.add(ledge);
    this.obstacles.push({ x: ledgeX, z: ledgeZ, radius: 1.45 });
  }

  /**
   * South playable clearing: dirt-path arrival, shallow river ford + stepping
   * stones, reeds, and a broken cart camping remnant — distinct from shrine /
   * grove / ruins silhouettes.
   */
  private buildSouthRiverFordClearing(): void {
    const { x: cx, z: cz, radius } = this.southClearing;

    this.addRiverFordLandmark(cx, cz);

    // Rim trees — leave the northern entrance open for the path branch
    const rimTrees = 10;
    for (let i = 0; i < rimTrees; i++) {
      const a = (i / rimTrees) * Math.PI * 2;
      // Skip north-facing arcs (path enters from +Z)
      if (Math.sin(a) > 0.35) continue;
      const r = radius + 0.6 + (i % 3) * 0.55;
      this.addTree(cx + Math.cos(a) * r, cz + Math.sin(a) * r, 0.9 + (i % 4) * 0.08);
    }

    const clearingRocks: Array<[number, number, number]> = [
      [cx + 5.4, cz - 3.2, 0.95],
      [cx - 4.8, cz - 4.6, 0.8],
      [cx + 4.2, cz + 5.0, 1.05],
      [cx - 6.0, cz + 2.4, 0.7],
      [cx + 1.8, cz - 6.4, 0.9],
    ];
    for (const [x, z, s] of clearingRocks) {
      if (meadowPathInfluence(x, z) > 0.55) continue;
      this.addRock(x, z, s);
    }

    const flowerPatches: Array<[number, number, number]> = [
      [cx + 4, cz - 5, 5],
      [cx - 5, cz - 3, 4],
      [cx + 5, cz + 3, 5],
      [cx - 4, cz + 5, 4],
      [cx - 1, cz - 6, 5],
    ];
    for (const [fx, fz, n] of flowerPatches) {
      for (let i = 0; i < n; i++) {
        const ox = (hash2(fx + i, fz) - 0.5) * 1.5;
        const oz = (hash2(fz + i, fx) - 0.5) * 1.5;
        this.addFlower(fx + ox, fz + oz);
      }
    }

    // Low mossy ledge on the far (south) rim
    const ledgeX = cx - 3.2;
    const ledgeZ = cz - (radius - 2.5);
    const ledge = new THREE.Group();
    ledge.position.set(ledgeX, 0, ledgeZ);
    const top = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 1.9, 0.3, 7),
      this.mossMat,
    );
    top.position.y = 0.5;
    top.castShadow = true;
    top.receiveShadow = true;
    ledge.add(top);
    const cliff = new THREE.Mesh(
      new THREE.CylinderGeometry(1.5, 1.8, 1.0, 7),
      this.cliffMat,
    );
    cliff.position.y = 0.05;
    cliff.castShadow = true;
    ledge.add(cliff);
    this.root.add(ledge);
    this.obstacles.push({ x: ledgeX, z: ledgeZ, radius: 1.45 });
  }

  /**
   * Shallow river band + ford stones + reeds + broken cart — south-pocket
   * silhouette that reads at iso distance without looking like shrine/grove/ruins.
   */
  private addRiverFordLandmark(x: number, z: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.name = 'RiverFord';

    // Elongated shallow river bed (east–west band across the clearing)
    const bed = new THREE.Mesh(new THREE.CircleGeometry(5.4, 28), this.pondDeepMat);
    bed.rotation.x = -Math.PI / 2;
    bed.scale.set(1.55, 1, 0.55);
    bed.position.y = 0.03;
    bed.receiveShadow = true;
    group.add(bed);

    const water = new THREE.Mesh(new THREE.CircleGeometry(4.9, 28), this.pondMat);
    water.rotation.x = -Math.PI / 2;
    water.scale.set(1.55, 1, 0.52);
    water.position.y = 0.09;
    group.add(water);

    // Soft secondary pool on the far bank for a readable water mass
    const pool = new THREE.Mesh(new THREE.CircleGeometry(1.8, 20), this.pondMat);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(3.2, 0.08, -2.4);
    group.add(pool);

    // Ford stepping stones — walkable-looking path across shallow water
    const fordStones: Array<[number, number, number, number]> = [
      // x, z, scale, yaw
      [-2.4, 0.15, 1.15, 0.4],
      [-1.1, -0.25, 1.0, -0.2],
      [0.15, 0.2, 1.2, 0.55],
      [1.35, -0.15, 0.95, -0.35],
      [2.5, 0.1, 1.1, 0.25],
    ];
    for (const [sx, sz, s, yaw] of fordStones) {
      const stone = new THREE.Mesh(this.rockGeo, this.rockLightMat);
      stone.position.set(sx, 0.18 * s, sz);
      stone.scale.set(s * 0.85, s * 0.45, s * 0.7);
      stone.rotation.y = yaw;
      stone.castShadow = true;
      stone.receiveShadow = true;
      group.add(stone);

      const lip = new THREE.Mesh(this.rockSmallGeo, this.rockMat);
      lip.position.set(sx + 0.35, 0.12, sz + 0.2);
      lip.scale.setScalar(0.45 + hash2(sx, sz) * 0.3);
      group.add(lip);
    }

    // Bank stones along the near (north) and far (south) shores
    for (let i = 0; i < 8; i++) {
      const t = (i / 7) * 2 - 1;
      const near = new THREE.Mesh(this.rockSmallGeo, this.rockMat);
      near.position.set(t * 4.2, 0.14, 1.85 + hash2(i, z) * 0.35);
      near.scale.setScalar(0.55 + hash2(z, i) * 0.45);
      near.castShadow = true;
      group.add(near);

      const far = new THREE.Mesh(this.rockChunkGeo, this.rockShadowMat);
      far.position.set(t * 3.8 + 0.3, 0.16, -1.9 - hash2(i * 2, x) * 0.3);
      far.scale.set(0.55, 0.35, 0.5);
      far.rotation.y = hash2(i, x) * Math.PI;
      far.castShadow = true;
      group.add(far);
    }

    // Reeds along both banks — tall stems so the riverside reads from the meadow
    for (let i = 0; i < 14; i++) {
      const side = i < 7 ? 1 : -1;
      const t = ((i % 7) / 6) * 2 - 1;
      const reedH = 0.85 + hash2(i, x) * 0.55;
      const reed = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.04, reedH, 4),
        this.stemMat,
      );
      reed.position.set(
        t * 4.0 + (hash2(i, z) - 0.5) * 0.6,
        reedH * 0.5,
        side * (2.15 + hash2(z, i) * 0.45),
      );
      reed.rotation.z = (hash2(i, x + i) - 0.5) * 0.35;
      reed.rotation.x = (hash2(z + i, i) - 0.5) * 0.2;
      group.add(reed);

      // Tiny leaf tip for silhouette
      const tip = new THREE.Mesh(
        new THREE.ConeGeometry(0.06, 0.22, 4),
        this.leafMatC,
      );
      tip.position.set(reed.position.x, reedH + 0.05, reed.position.z);
      tip.rotation.z = reed.rotation.z;
      group.add(tip);
    }

    // Broken cart camping remnant on the near (north) bank — path-facing landmark
    const cart = new THREE.Group();
    cart.position.set(-3.4, 0, 3.6);
    cart.rotation.y = 0.55;

    const bedBoard = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 0.18, 1.35),
      this.woodMat,
    );
    bedBoard.position.set(0, 0.55, 0);
    bedBoard.rotation.z = 0.35;
    bedBoard.rotation.x = 0.08;
    bedBoard.castShadow = true;
    cart.add(bedBoard);

    const sideRail = new THREE.Mesh(
      new THREE.BoxGeometry(2.0, 0.45, 0.1),
      this.woodDarkMat,
    );
    sideRail.position.set(0.1, 0.85, 0.55);
    sideRail.rotation.z = 0.35;
    sideRail.castShadow = true;
    cart.add(sideRail);

    // Tipped axle + one attached wheel
    const axle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 1.5, 6),
      this.woodDarkMat,
    );
    axle.rotation.z = Math.PI * 0.5;
    axle.position.set(0.2, 0.35, -0.15);
    cart.add(axle);

    const wheel = new THREE.Mesh(
      new THREE.TorusGeometry(0.55, 0.1, 6, 12),
      this.woodDarkMat,
    );
    wheel.position.set(-0.55, 0.55, -0.15);
    wheel.rotation.y = Math.PI * 0.5;
    wheel.castShadow = true;
    cart.add(wheel);

    // Fallen second wheel nearby
    const wheel2 = new THREE.Mesh(
      new THREE.TorusGeometry(0.5, 0.09, 6, 12),
      this.woodMat,
    );
    wheel2.position.set(1.4, 0.12, 0.7);
    wheel2.rotation.x = Math.PI * 0.5;
    wheel2.rotation.z = 0.4;
    wheel2.castShadow = true;
    cart.add(wheel2);

    // Campfire ring remnant beside the cart
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const ring = new THREE.Mesh(this.rockSmallGeo, this.rockShadowMat);
      ring.position.set(1.6 + Math.cos(a) * 0.55, 0.1, -1.1 + Math.sin(a) * 0.55);
      ring.scale.setScalar(0.4 + hash2(i, 3) * 0.25);
      cart.add(ring);
    }
    const charLog = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.1, 0.7, 5),
      this.woodDarkMat,
    );
    charLog.position.set(1.6, 0.12, -1.1);
    charLog.rotation.z = Math.PI * 0.5;
    charLog.rotation.y = 0.4;
    cart.add(charLog);

    group.add(cart);

    this.root.add(group);
    // Soft collision for cart mass + bank rocks — leave ford stones walkable
    this.obstacles.push({ x: x - 3.4, z: z + 3.6, radius: 1.35 });
    this.obstacles.push({ x: x + 3.2, z: z - 2.4, radius: 1.1 });
    this.obstacles.push({ x: x - 4.0, z: z + 1.9, radius: 0.55 });
    this.obstacles.push({ x: x + 4.0, z: z - 1.9, radius: 0.55 });
  }

  /**
   * Crumbled gate + broken columns + rubble courtyard — north-ruins silhouette
   * that reads at iso distance without looking like the shrine or fairy ring.
   */
  private addRuinsCourtyard(x: number, z: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.name = 'RuinsCourtyard';

    // Low courtyard foundation ring (broken stone plaza)
    const plaza = new THREE.Mesh(
      new THREE.CylinderGeometry(4.2, 4.4, 0.22, 10),
      this.rockMat,
    );
    plaza.position.y = 0.08;
    plaza.receiveShadow = true;
    group.add(plaza);

    const plazaTop = new THREE.Mesh(
      new THREE.CylinderGeometry(3.6, 3.7, 0.12, 10),
      this.rockLightMat,
    );
    plazaTop.position.y = 0.2;
    plazaTop.receiveShadow = true;
    group.add(plazaTop);

    // Crumbled gate facing south (path entrance) — two posts + broken lintel
    const gateZ = -4.4;
    const leftPost = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 3.4, 0.55),
      this.rockLightMat,
    );
    leftPost.position.set(-1.55, 1.7, gateZ);
    leftPost.castShadow = true;
    group.add(leftPost);

    const rightPost = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 2.6, 0.55),
      this.rockMat,
    );
    rightPost.position.set(1.55, 1.3, gateZ);
    rightPost.rotation.z = 0.08;
    rightPost.castShadow = true;
    group.add(rightPost);

    const lintel = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 0.42, 0.5),
      this.rockShadowMat,
    );
    lintel.position.set(-0.15, 3.15, gateZ);
    lintel.rotation.z = -0.22;
    lintel.rotation.y = 0.06;
    lintel.castShadow = true;
    group.add(lintel);

    // Fallen lintel chunk by the gate
    const fallenLintel = new THREE.Mesh(
      new THREE.BoxGeometry(1.3, 0.38, 0.45),
      this.rockMat,
    );
    fallenLintel.position.set(1.1, 0.28, gateZ + 1.1);
    fallenLintel.rotation.y = 0.55;
    fallenLintel.rotation.z = 0.15;
    fallenLintel.castShadow = true;
    group.add(fallenLintel);

    // Broken columns around the courtyard
    const columns: Array<[number, number, number, number, number]> = [
      // x, z, height, leanZ, leanX
      [-3.2, 1.8, 2.8, 0.12, -0.05],
      [3.4, 2.2, 2.1, -0.18, 0.08],
      [-2.6, -1.6, 1.55, 0.35, 0.1],
      [2.9, -0.8, 3.1, -0.06, -0.12],
      [0.4, 3.6, 1.9, 0.22, 0.05],
    ];
    for (const [cx, cz, h, leanZ, leanX] of columns) {
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.42, 0.52, 0.28, 7),
        this.rockMat,
      );
      base.position.set(cx, 0.14, cz);
      base.castShadow = true;
      group.add(base);

      const col = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28, 0.34, h, 7),
        this.rockLightMat,
      );
      col.position.set(cx, 0.28 + h * 0.5, cz);
      col.rotation.z = leanZ;
      col.rotation.x = leanX;
      col.castShadow = true;
      group.add(col);

      if (h > 2.4) {
        const cap = new THREE.Mesh(
          new THREE.CylinderGeometry(0.4, 0.3, 0.22, 7),
          this.rockMat,
        );
        cap.position.set(cx + leanZ * h * 0.35, 0.28 + h + 0.05, cz + leanX * h * 0.35);
        cap.rotation.z = leanZ;
        group.add(cap);
      } else {
        // Toppled drum near short columns
        const drum = new THREE.Mesh(
          new THREE.CylinderGeometry(0.3, 0.3, 0.7, 7),
          this.rockShadowMat,
        );
        drum.position.set(cx + 0.7, 0.28, cz + 0.45);
        drum.rotation.z = Math.PI * 0.5;
        drum.rotation.y = hash2(cx, cz) * Math.PI;
        drum.castShadow = true;
        group.add(drum);
      }
    }

    // Rubble piles for courtyard clutter
    const rubble: Array<[number, number, number]> = [
      [-1.2, 0.6, 0.9],
      [1.8, -1.4, 1.1],
      [-0.4, 2.4, 0.75],
      [2.2, 1.4, 0.85],
      [-2.8, 0.2, 1.0],
    ];
    for (const [rx, rz, s] of rubble) {
      const chunk = new THREE.Mesh(this.rockChunkGeo, this.rockShadowMat);
      chunk.position.set(rx, 0.2 * s, rz);
      chunk.scale.set(s * 1.1, s * 0.7, s * 0.95);
      chunk.rotation.y = hash2(rx, rz) * Math.PI * 2;
      chunk.castShadow = true;
      group.add(chunk);

      const pebble = new THREE.Mesh(this.rockSmallGeo, this.rockMat);
      pebble.position.set(rx + 0.45, 0.12, rz - 0.3);
      pebble.scale.setScalar(0.55 + hash2(rz, rx) * 0.35);
      group.add(pebble);
    }

    // Moss accents on plaza edge
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.4;
      const moss = new THREE.Mesh(this.rockSmallGeo, this.mossMat);
      moss.position.set(Math.cos(a) * 3.5, 0.22, Math.sin(a) * 3.5);
      moss.scale.set(0.55, 0.22, 0.45);
      group.add(moss);
    }

    this.root.add(group);
    // Soft collision for gate posts + plaza mass — leave walkable court interior
    this.obstacles.push({ x: x - 1.55, z: z + gateZ, radius: 0.55 });
    this.obstacles.push({ x: x + 1.55, z: z + gateZ, radius: 0.55 });
    this.obstacles.push({ x: x - 3.2, z: z + 1.8, radius: 0.55 });
    this.obstacles.push({ x: x + 3.4, z: z + 2.2, radius: 0.5 });
    this.obstacles.push({ x: x + 2.9, z: z - 0.8, radius: 0.55 });
    this.obstacles.push({ x: x + 0.4, z: z + 3.6, radius: 0.5 });
  }

  /**
   * Fallen giant tree — primary west-grove silhouette (thick horizontal trunk +
   * root flare + broken canopy pile). Reads at iso distance vs the east tower.
   */
  private addFallenGiantTree(x: number, z: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.name = 'FallenGiantTree';

    // Root plate (upended) near the path-facing side — tall silhouette cue
    const rootBall = new THREE.Mesh(
      new THREE.SphereGeometry(1.7, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55),
      this.trunkDarkMat,
    );
    rootBall.position.set(4.6, 0.85, 0.5);
    rootBall.rotation.z = -0.45;
    rootBall.castShadow = true;
    group.add(rootBall);

    for (let i = 0; i < 6; i++) {
      const a = -0.5 + (i / 5) * 1.6;
      const root = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.28, 2.0 + (i % 2) * 0.4, 5),
        this.trunkMat,
      );
      root.position.set(
        4.6 + Math.cos(a) * 1.15,
        0.55,
        0.5 + Math.sin(a) * 1.25,
      );
      root.rotation.z = Math.PI * 0.5 + (hash2(i, x) - 0.5) * 0.35;
      root.rotation.y = a;
      root.castShadow = true;
      group.add(root);
    }

    // Main fallen trunk — thick enough to read as the grove landmark at iso
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(1.05, 1.35, 10.5, 9),
      this.trunkMat,
    );
    trunk.rotation.z = Math.PI * 0.5;
    trunk.rotation.y = 0.12;
    trunk.position.set(0.1, 1.15, -0.25);
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    group.add(trunk);

    // Darker under-log for depth / readable wood mass
    const underLog = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.85, 8.5, 7),
      this.trunkDarkMat,
    );
    underLog.rotation.z = Math.PI * 0.5;
    underLog.rotation.y = 0.12;
    underLog.position.set(0.3, 0.55, 0.35);
    underLog.castShadow = true;
    group.add(underLog);

    // Bark rings / breaks along the trunk
    for (let i = 0; i < 4; i++) {
      const band = new THREE.Mesh(
        new THREE.TorusGeometry(1.1 + i * 0.05, 0.11, 5, 12),
        this.trunkDarkMat,
      );
      band.rotation.y = Math.PI * 0.5;
      band.position.set(-3.2 + i * 2.1, 1.2, -0.2 - i * 0.06);
      group.add(band);
    }

    // Moss blankets on the top face
    const mossA = new THREE.Mesh(this.rockSmallGeo, this.mossMat);
    mossA.position.set(-1.2, 2.0, -0.55);
    mossA.scale.set(1.8, 0.4, 1.1);
    group.add(mossA);
    const mossB = new THREE.Mesh(this.rockSmallGeo, this.mossMat);
    mossB.position.set(1.8, 1.95, -0.2);
    mossB.scale.set(1.4, 0.35, 0.9);
    group.add(mossB);

    // Broken canopy pile at the far (west) end — keep it OFF the trunk top so wood reads
    const crown = new THREE.Group();
    crown.position.set(-5.4, 0, -2.2);
    const canopyLow = new THREE.Mesh(this.canopyLowGeo, this.leafDark);
    canopyLow.position.set(0.2, 1.1, 0.3);
    canopyLow.rotation.z = 0.9;
    canopyLow.rotation.x = 0.35;
    canopyLow.scale.setScalar(1.55);
    canopyLow.castShadow = true;
    crown.add(canopyLow);
    const canopyMid = new THREE.Mesh(this.canopyMidGeo, this.leafMatC);
    canopyMid.position.set(-0.8, 1.3, -0.5);
    canopyMid.rotation.z = 1.1;
    canopyMid.scale.setScalar(1.35);
    canopyMid.castShadow = true;
    crown.add(canopyMid);
    const canopyTop = new THREE.Mesh(this.canopyTopGeo, this.leafMat);
    canopyTop.position.set(0.6, 0.7, -0.9);
    canopyTop.rotation.x = 1.2;
    canopyTop.scale.setScalar(1.25);
    crown.add(canopyTop);
    const branchStub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.24, 2.6, 5),
      this.trunkDarkMat,
    );
    branchStub.position.set(1.0, 1.1, 0.3);
    branchStub.rotation.z = 0.7;
    branchStub.rotation.y = -0.4;
    branchStub.castShadow = true;
    crown.add(branchStub);
    group.add(crown);

    this.root.add(group);
    // Soft collision along the trunk length (segment samples)
    this.obstacles.push({ x: x + 4.0, z: z + 0.4, radius: 1.35 });
    this.obstacles.push({ x: x + 0.5, z: z - 0.2, radius: 1.15 });
    this.obstacles.push({ x: x - 2.8, z: z - 0.5, radius: 1.2 });
    this.obstacles.push({ x: x - 5.4, z: z - 2.2, radius: 1.45 });
  }

  /** Circle of glowing mushrooms — fairy-ring landmark for the misty grove. */
  private addFairyRing(cx: number, cz: number, radius: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + 0.15;
      const r = radius + (hash2(i, cx) - 0.5) * 0.35;
      const scale = 1.15 + hash2(cz, i) * 0.7;
      this.addMushroom(cx + Math.cos(a) * r, cz + Math.sin(a) * r, scale);
    }
  }

  private addMushroom(x: number, z: number, scale: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.scale.setScalar(scale);

    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.14, 0.55, 6),
      this.mushroomStemMat,
    );
    stem.position.y = 0.28;
    stem.castShadow = true;
    group.add(stem);

    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.36, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55),
      this.mushroomCapMat,
    );
    cap.position.y = 0.58;
    cap.castShadow = true;
    group.add(cap);

    const spot = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 5, 5),
      createToonMaterial(Palette.flowerWhite, {
        emissive: 0xa8e8ff,
        emissiveIntensity: 0.7,
      }),
    );
    spot.position.set(0.1, 0.7, 0.08);
    group.add(spot);

    this.root.add(group);
  }

  /** Soft translucent mist blobs so the grove reads “foggy” from the meadow. */
  private addGroveMist(cx: number, cz: number): void {
    const spots: Array<[number, number, number, number]> = [
      [cx - 2, cz + 3, 3.4, 1.8],
      [cx + 3, cz - 2, 3.8, 2.0],
      [cx - 5, cz - 3, 3.0, 1.5],
      [cx + 1, cz + 5, 3.2, 1.7],
      [cx - 1, cz - 5, 2.8, 1.4],
      [cx + 4.5, cz + 1.5, 2.6, 1.3],
    ];
    for (const [x, z, sx, sy] of spots) {
      const mist = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), this.mistMat);
      mist.position.set(x, sy * 0.65, z);
      mist.scale.set(sx, sy, sx * 0.85);
      mist.renderOrder = 2;
      this.root.add(mist);
    }
  }

  /**
   * Ruined shrine tower + standing stone circle — tall enough to read at iso
   * distance as the east clearing’s landmark (not just another rock pile).
   */
  private addAncientShrine(x: number, z: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.name = 'AncientShrine';

    const dais = new THREE.Mesh(
      new THREE.CylinderGeometry(1.9, 2.15, 0.35, 10),
      this.rockMat,
    );
    dais.position.y = 0.18;
    dais.castShadow = true;
    dais.receiveShadow = true;
    group.add(dais);

    const daisTop = new THREE.Mesh(
      new THREE.CylinderGeometry(1.45, 1.6, 0.18, 10),
      this.rockLightMat,
    );
    daisTop.position.y = 0.42;
    daisTop.castShadow = true;
    group.add(daisTop);

    // Broken tower stump — primary silhouette from the follow camera
    const tower = new THREE.Mesh(
      new THREE.CylinderGeometry(0.85, 1.15, 3.4, 8),
      this.rockLightMat,
    );
    tower.position.y = 2.1;
    tower.castShadow = true;
    group.add(tower);

    const towerBand = new THREE.Mesh(
      new THREE.CylinderGeometry(0.95, 0.95, 0.28, 8),
      this.rockMat,
    );
    towerBand.position.y = 2.9;
    towerBand.castShadow = true;
    group.add(towerBand);

    // Jagged broken crown
    const crown = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.9, 0.85, 6),
      this.rockShadowMat,
    );
    crown.position.set(0.1, 4.05, -0.05);
    crown.rotation.z = 0.18;
    crown.castShadow = true;
    group.add(crown);

    const mossPatch = new THREE.Mesh(this.rockSmallGeo, this.mossMat);
    mossPatch.position.set(0.55, 3.3, 0.35);
    mossPatch.scale.set(0.7, 0.35, 0.55);
    group.add(mossPatch);

    const crystalMat = createToonMaterial(Palette.flowerCyan, {
      emissive: Palette.flowerCyan,
      emissiveIntensity: 0.55,
    });
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), crystalMat);
    crystal.position.set(0, 4.85, 0);
    crystal.rotation.y = Math.PI * 0.2;
    crystal.castShadow = true;
    crystal.name = 'ShrineCrystal';
    group.add(crystal);

    const crystalTip = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), crystalMat);
    crystalTip.position.set(0, 5.45, 0);
    crystalTip.scale.set(0.7, 1.15, 0.7);
    crystalTip.name = 'ShrineCrystalTip';
    group.add(crystalTip);

    this.shrineCrystal = crystal;
    this.shrineCrystalTip = crystalTip;
    this.shrineCrystalMat = crystalMat;

    // Standing stones in a circle around the ruined tower
    const stones = 7;
    for (let i = 0; i < stones; i++) {
      const a = (i / stones) * Math.PI * 2 + 0.2;
      const r = 4.1 + hash2(i, x) * 0.4;
      const stone = new THREE.Group();
      stone.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      stone.rotation.y = a + Math.PI * 0.5;

      const h = 1.7 + hash2(z, i) * 0.9;
      const pillar = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, h, 0.32),
        i % 2 === 0 ? this.rockLightMat : this.rockMat,
      );
      pillar.position.y = h * 0.5;
      pillar.rotation.z = (hash2(i * 2, a) - 0.5) * 0.12;
      pillar.castShadow = true;
      pillar.receiveShadow = true;
      stone.add(pillar);

      const cap = new THREE.Mesh(this.rockSmallGeo, this.mossMat);
      cap.position.set(0.05, h + 0.1, 0);
      cap.scale.set(0.65, 0.32, 0.45);
      stone.add(cap);

      group.add(stone);
      this.obstacles.push({
        x: x + Math.cos(a) * r,
        z: z + Math.sin(a) * r,
        radius: 0.45,
      });
    }

    // Fallen lintel + rubble for ruin read
    const fallen = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.38, 0.42), this.rockShadowMat);
    fallen.position.set(2.4, 0.26, -2.8);
    fallen.rotation.y = 0.7;
    fallen.rotation.z = 0.15;
    fallen.castShadow = true;
    group.add(fallen);

    const rubble = new THREE.Mesh(this.rockChunkGeo, this.rockMat);
    rubble.position.set(-2.6, 0.25, 2.0);
    rubble.scale.set(0.85, 0.55, 0.7);
    rubble.castShadow = true;
    group.add(rubble);

    // Arch fragment leaning on the tower base
    const arch = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.8, 0.35), this.rockMat);
    arch.position.set(-1.3, 1.1, 0.9);
    arch.rotation.z = 0.45;
    arch.castShadow = true;
    group.add(arch);

    this.root.add(group);
    this.obstacles.push({ x, z, radius: 1.55 });
  }

  /** True when the player stands close enough to awaken the shrine. */
  isNearShrine(position: THREE.Vector3): boolean {
    const dx = position.x - this.shrinePosition.x;
    const dz = position.z - this.shrinePosition.z;
    const r = this.shrineInteractRadius;
    return dx * dx + dz * dz <= r * r;
  }

  get shrineIsActivated(): boolean {
    return this.shrineActivated;
  }

  /**
   * Toggle awakened crystal look — brighter emissive + slight scale pulse when active.
   * Inactive returns to the dormant cyan glow so the shrine can cool down for another run.
   */
  setShrineActivated(active: boolean): void {
    this.shrineActivated = active;
    if (!this.shrineCrystalMat || !this.shrineCrystal || !this.shrineCrystalTip) return;
    if (active) {
      this.shrineCrystalMat.color.setHex(0xb8fff8);
      this.shrineCrystalMat.emissive.setHex(0x6ef0ff);
      this.shrineCrystalMat.emissiveIntensity = 1.35;
      this.shrineCrystal.scale.setScalar(1.18);
      this.shrineCrystalTip.scale.set(0.85, 1.35, 0.85);
    } else {
      this.shrineCrystalMat.color.setHex(Palette.flowerCyan);
      this.shrineCrystalMat.emissive.setHex(Palette.flowerCyan);
      this.shrineCrystalMat.emissiveIntensity = 0.55;
      this.shrineCrystal.scale.setScalar(1);
      this.shrineCrystalTip.scale.set(0.7, 1.15, 0.7);
      this.shrinePulseT = 0;
    }
  }

  /** Soft bob/spin on the awakened crystal so the activated state reads at a glance. */
  updateShrineVisual(dt: number): void {
    if (!this.shrineCrystal || !this.shrineCrystalTip) return;
    if (this.shrineActivated) {
      this.shrinePulseT += dt;
      const bob = Math.sin(this.shrinePulseT * 3.2) * 0.08;
      this.shrineCrystal.position.y = 4.85 + bob;
      this.shrineCrystalTip.position.y = 5.45 + bob;
      this.shrineCrystal.rotation.y += dt * 1.1;
      this.shrineCrystalTip.rotation.y -= dt * 1.4;
      if (this.shrineCrystalMat) {
        this.shrineCrystalMat.emissiveIntensity = 1.15 + Math.sin(this.shrinePulseT * 4.5) * 0.35;
      }
    } else {
      this.shrineCrystal.rotation.y += dt * 0.25;
    }
  }

  private buildEdgeLedges(): void {
    const ledges: Array<[number, number, number, number]> = [
      // Outer rim ledges — kept off corridor approaches
      [32, -26, 1.2, 0.9],
      [-34, -20, 1.4, 1],
      [28, 30, 1.1, 0.85],
      [-32, 32, 1.3, 0.95],
      [34, 2, 1.5, 1.1],
      [-34, 16, 1.35, 1],
    ];
    for (const [x, z, s, h] of ledges) {
      const group = new THREE.Group();
      group.position.set(x, 0, z);

      const top = new THREE.Mesh(
        new THREE.CylinderGeometry(1.8 * s, 2.1 * s, 0.35 * h, 7),
        this.mossMat,
      );
      top.position.y = 0.55 * h;
      top.castShadow = true;
      top.receiveShadow = true;
      group.add(top);

      const cliff = new THREE.Mesh(
        new THREE.CylinderGeometry(1.7 * s, 2.0 * s, 1.1 * h, 7),
        this.cliffMat,
      );
      cliff.position.y = 0.05;
      cliff.castShadow = true;
      group.add(cliff);

      // Rocky face accents
      const face = new THREE.Mesh(this.rockChunkGeo, this.rockShadowMat);
      face.position.set(0.9 * s, 0.35 * h, 0.2);
      face.scale.set(0.9, 1.1, 0.7);
      group.add(face);

      this.root.add(group);
      this.obstacles.push({ x, z, radius: 1.5 * s });
    }
  }

  private pickLeafMat(x: number, z: number): THREE.MeshToonMaterial {
    const n = hash2(x * 1.3, z * 1.7);
    if (n > 0.66) return this.leafMatB;
    if (n > 0.33) return this.leafMat;
    return this.leafMatC;
  }

  private addTree(x: number, z: number, scale: number): void {
    this.treePlacements.push({ x, z, scale });
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.scale.setScalar(scale);
    group.rotation.y = hash2(x, z) * Math.PI * 2;
    group.userData.proceduralProp = true;

    const fat = hash2(z, x) > 0.55;
    const trunk = new THREE.Mesh(fat ? this.trunkFatGeo : this.trunkGeo, this.trunkMat);
    trunk.position.y = fat ? 0.52 : 0.62;
    trunk.castShadow = true;
    group.add(trunk);

    // Root flare
    const flare = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.48, 0.22, 6),
      this.trunkDarkMat,
    );
    flare.position.y = 0.1;
    group.add(flare);

    const leafMat = this.pickLeafMat(x, z);
    const low = new THREE.Mesh(this.canopyLowGeo, leafMat);
    low.position.y = 1.55;
    low.castShadow = true;
    group.add(low);

    const mid = new THREE.Mesh(this.canopyMidGeo, hash2(x + 1, z) > 0.5 ? leafMat : this.leafDark);
    mid.position.y = 2.45;
    mid.castShadow = true;
    group.add(mid);

    const top = new THREE.Mesh(this.canopyTopGeo, leafMat);
    top.position.y = 3.25;
    top.castShadow = true;
    group.add(top);

    this.root.add(group);
    this.obstacles.push({ x, z, radius: 0.6 * scale });
  }

  private addRock(x: number, z: number, scale: number): void {
    this.rockPlacements.push({ x, z, scale });
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.userData.proceduralProp = true;

    const rock = new THREE.Mesh(this.rockGeo, this.rockMat);
    rock.position.y = 0.3 * scale;
    rock.scale.set(scale, scale * 0.7, scale * 1.15);
    rock.rotation.y = (x * 1.7 + z * 2.3) % (Math.PI * 2);
    rock.rotation.z = 0.14;
    rock.castShadow = true;
    rock.receiveShadow = true;
    group.add(rock);

    const chunk = new THREE.Mesh(this.rockChunkGeo, this.rockShadowMat);
    chunk.position.set(-0.25 * scale, 0.18 * scale, 0.2 * scale);
    chunk.scale.set(scale * 0.55, scale * 0.4, scale * 0.5);
    chunk.rotation.y = 0.7;
    chunk.castShadow = true;
    group.add(chunk);

    const moss = new THREE.Mesh(this.rockSmallGeo, this.mossMat);
    moss.position.set(0.1 * scale, 0.48 * scale, 0.05 * scale);
    moss.scale.set(scale * 0.65, scale * 0.3, scale * 0.55);
    moss.castShadow = true;
    group.add(moss);

    // Tiny lichen highlight
    const lichen = new THREE.Mesh(this.rockSmallGeo, this.rockLightMat);
    lichen.position.set(-0.05 * scale, 0.4 * scale, -0.15 * scale);
    lichen.scale.set(scale * 0.35, scale * 0.18, scale * 0.3);
    group.add(lichen);

    this.root.add(group);
    this.obstacles.push({ x, z, radius: 0.45 * scale });
  }

  private addFlower(x: number, z: number): void {
    if (meadowPathInfluence(x, z) > 0.7) return;
    const idx = Math.abs(Math.floor(x * 3 + z * 5)) % this.flowerMats.length;
    const petalMat = this.flowerMats[idx]!;
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const stem = new THREE.Mesh(this.stemGeo, this.stemMat);
    stem.position.y = 0.13;
    group.add(stem);

    const petals = new THREE.Mesh(this.flowerPetalGeo, petalMat);
    petals.position.y = 0.3;
    petals.scale.set(1.05, 0.65, 1.05);
    group.add(petals);

    const center = new THREE.Mesh(this.flowerCenterGeo, this.flowerCenterMat);
    center.position.y = 0.36;
    group.add(center);

    this.root.add(group);
  }

  private addSignpost(x: number, z: number, facing: SignFacing = 'east'): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    // Boards are built along +X; yaw the whole post for west/north/south branches.
    if (facing === 'west') group.rotation.y = Math.PI;
    else if (facing === 'north') group.rotation.y = -Math.PI / 2;
    else if (facing === 'south') group.rotation.y = Math.PI / 2;

    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.6, 6), this.woodDarkMat);
    post.position.y = 0.8;
    post.castShadow = true;
    group.add(post);

    const board = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.42, 0.08), this.signBoardMat);
    board.position.set(0.35, 1.35, 0);
    board.rotation.z = -0.08;
    board.castShadow = true;
    group.add(board);

    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.09), this.woodMat);
    stripe.position.set(0.35, 1.35, 0.02);
    stripe.rotation.z = -0.08;
    group.add(stripe);

    // Arrow tip
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.28, 3), this.signBoardMat);
    arrow.rotation.z = -Math.PI / 2;
    arrow.position.set(0.95, 1.32, 0);
    group.add(arrow);

    this.root.add(group);
    this.obstacles.push({ x, z, radius: 0.35 });
  }

  private addPond(x: number, z: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const bed = new THREE.Mesh(new THREE.CircleGeometry(2.6, 24), this.pondDeepMat);
    bed.rotation.x = -Math.PI / 2;
    bed.position.y = 0.03;
    bed.receiveShadow = true;
    group.add(bed);

    const water = new THREE.Mesh(new THREE.CircleGeometry(2.35, 24), this.pondMat);
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.08;
    group.add(water);

    // Shore stones
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const r = 2.5 + hash2(i, x) * 0.35;
      const stone = new THREE.Mesh(this.rockSmallGeo, this.rockMat);
      stone.position.set(Math.cos(a) * r, 0.12, Math.sin(a) * r);
      stone.scale.setScalar(0.55 + hash2(z, i) * 0.4);
      stone.castShadow = true;
      group.add(stone);
    }

    // Reed-like stems
    for (let i = 0; i < 5; i++) {
      const a = hash2(i * 3, z) * Math.PI * 2;
      const reed = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.04, 0.7, 4),
        this.stemMat,
      );
      reed.position.set(Math.cos(a) * 2.2, 0.35, Math.sin(a) * 2.2);
      reed.rotation.z = (hash2(i, a) - 0.5) * 0.3;
      group.add(reed);
    }

    this.root.add(group);
    this.obstacles.push({ x, z, radius: 2.4 });
  }

  private addRuinPillar(x: number, z: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 0.35, 8), this.rockMat);
    base.position.y = 0.18;
    base.castShadow = true;
    group.add(base);

    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 2.4, 8), this.rockLightMat);
    pillar.position.y = 1.35;
    pillar.castShadow = true;
    group.add(pillar);

    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.35, 0.28, 8), this.rockMat);
    cap.position.y = 2.6;
    group.add(cap);

    const broken = new THREE.Mesh(this.rockChunkGeo, this.rockShadowMat);
    broken.position.set(0.7, 0.25, -0.3);
    broken.scale.set(0.8, 0.5, 0.7);
    broken.rotation.y = 0.6;
    group.add(broken);

    const moss = new THREE.Mesh(this.rockSmallGeo, this.mossMat);
    moss.position.set(0.15, 2.1, 0.2);
    moss.scale.set(0.5, 0.25, 0.4);
    group.add(moss);

    this.root.add(group);
    this.obstacles.push({ x, z, radius: 0.75 });
  }

  private addCottage(x: number, z: number): void {
    this.cottagePlacement = { x, z };
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.scale.setScalar(1.15);
    group.userData.proceduralProp = true;

    const walls = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.5, 2.0), this.rockLightMat);
    walls.position.y = 0.75;
    walls.castShadow = true;
    group.add(walls);

    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.9, 1.2, 4), this.roofMat);
    roof.position.y = 2.05;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    group.add(roof);

    const door = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.75, 0.08), this.woodDarkMat);
    door.position.set(0, 0.4, 1.02);
    group.add(door);

    const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.7, 0.35), this.rockMat);
    chimney.position.set(0.7, 2.1, -0.3);
    group.add(chimney);

    this.root.add(group);
    this.obstacles.push({ x, z, radius: 1.6 });
  }

  private addWindmill(x: number, z: number): void {
    this.windmillPlacement = { x, z };
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.userData.proceduralProp = true;

    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.75, 3.2, 8), this.woodMat);
    tower.position.y = 1.6;
    tower.castShadow = true;
    group.add(tower);

    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.85, 0.9, 8), this.roofMat);
    cap.position.y = 3.5;
    cap.castShadow = true;
    group.add(cap);

    const hub = new THREE.Group();
    hub.position.set(0, 2.8, 0.7);
    group.add(hub);
    // Static blades — readable landmark silhouette (no need to spin every frame)
    for (let i = 0; i < 4; i++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.8, 0.08), this.woodDarkMat);
      blade.position.y = 0.9;
      const arm = new THREE.Group();
      arm.rotation.z = (i / 4) * Math.PI * 2 + 0.4;
      arm.add(blade);
      hub.add(arm);
    }

    this.root.add(group);
    this.obstacles.push({ x, z, radius: 1.1 });
  }

  /**
   * Swap the most visible procedural trees / rocks / cottage / windmill for KayKit
   * pack instances. Soft-collision radii are retuned via `PROP_COLLISION_SCALE` so
   * blockers match the larger Adventurers-relative visuals. Paths, shrine/chest
   * interacts, and play clamp stay unchanged.
   * Safe to call once after `WorldPropLibrary.load()`; no-ops if the library is empty.
   */
  applyPropPack(library: WorldPropLibrary): boolean {
    if (this.packApplied || !library.isReady) return false;
    this.packApplied = true;

    // Drop only the marked procedural stand-ins (trees / rocks / cottage / windmill).
    const remove: THREE.Object3D[] = [];
    for (const child of this.root.children) {
      if (child.userData.proceduralProp) remove.push(child);
    }
    for (const obj of remove) this.root.remove(obj);

    let placed = 0;
    for (let i = 0; i < this.treePlacements.length; i++) {
      const p = this.treePlacements[i]!;
      const mesh = library.createTree(p.x, p.z, p.scale, hash2(p.x, p.z) * 1000 + i);
      if (mesh) {
        this.root.add(mesh);
        placed += 1;
      }
    }
    for (let i = 0; i < this.rockPlacements.length; i++) {
      const p = this.rockPlacements[i]!;
      const mesh = library.createRock(p.x, p.z, p.scale, hash2(p.z, p.x) * 1000 + i);
      if (mesh) {
        this.root.add(mesh);
        placed += 1;
      }
    }

    if (this.cottagePlacement) {
      const mesh = library.createCottage(this.cottagePlacement.x, this.cottagePlacement.z);
      if (mesh) {
        this.root.add(mesh);
        placed += 1;
        // Well accent beside the cottage — offset clears the scaled footprint.
        const wellX = this.cottagePlacement.x + WELL_OFFSET.x;
        const wellZ = this.cottagePlacement.z + WELL_OFFSET.z;
        const well = library.createWell(wellX, wellZ);
        if (well) {
          this.root.add(well);
          this.obstacles.push({
            x: wellX,
            z: wellZ,
            radius: 0.55 * PROP_COLLISION_SCALE.well,
          });
          placed += 1;
        }
      }
    }

    if (this.windmillPlacement) {
      const mesh = library.createWindmill(this.windmillPlacement.x, this.windmillPlacement.z);
      if (mesh) {
        this.root.add(mesh);
        placed += 1;
      }
    }

    this.retunePackObstacles();
    this.scatterPackBushes(library);
    return placed > 0;
  }

  /**
   * Grow soft-collision radii for swapped pack props so blockers match `PROP_SCALE`.
   * Matches placements by exact XZ (same values pushed in addTree/addRock/…).
   */
  private retunePackObstacles(): void {
    const bump = (x: number, z: number, factor: number): void => {
      for (const o of this.obstacles) {
        if (o.x === x && o.z === z) {
          o.radius *= factor;
          return;
        }
      }
    };

    for (const p of this.treePlacements) {
      bump(p.x, p.z, PROP_COLLISION_SCALE.tree);
    }
    for (const p of this.rockPlacements) {
      bump(p.x, p.z, PROP_COLLISION_SCALE.rock);
    }
    if (this.cottagePlacement) {
      bump(this.cottagePlacement.x, this.cottagePlacement.z, PROP_COLLISION_SCALE.cottage);
    }
    if (this.windmillPlacement) {
      bump(this.windmillPlacement.x, this.windmillPlacement.z, PROP_COLLISION_SCALE.windmill);
    }
  }

  /** Soft bush dressing near trees / meadow rim — no collision (walk-through foliage). */
  private scatterPackBushes(library: WorldPropLibrary): void {
    const spots: Array<[number, number, number]> = [];
    // Nestle bushes beside a subset of trees (farther out — trunks are larger now).
    for (let i = 0; i < this.treePlacements.length; i += 2) {
      const t = this.treePlacements[i]!;
      const ang = hash2(t.z, t.x) * Math.PI * 2;
      const r = 1.8 + hash2(t.x, i) * 1.0;
      spots.push([
        t.x + Math.cos(ang) * r,
        t.z + Math.sin(ang) * r,
        0.75 + hash2(i, t.z) * 0.45,
      ]);
    }
    // A few pocket-rim accents (clear of shrine / ford walkways).
    spots.push(
      [24, -18, 0.9],
      [-26, 16, 0.85],
      [18, 28, 0.95],
      [-18, -26, 0.8],
      [8, 36, 0.88],
      [-34, -6, 0.92],
    );

    for (let i = 0; i < spots.length; i++) {
      const [x, z, s] = spots[i]!;
      if (meadowPathInfluence(x, z) > 0.55) continue;
      if (this.isOnEastBranchApproach(x, z)) continue;
      if (this.isOnWestBranchApproach(x, z)) continue;
      if (this.isOnNorthBranchApproach(x, z)) continue;
      if (this.isOnSouthBranchApproach(x, z)) continue;
      // Keep shrine / ford centers open.
      if (Math.hypot(x - EastShrineClearing.x, z - EastShrineClearing.z) < 8) continue;
      if (Math.hypot(x - SouthRiverFordClearing.x, z - SouthRiverFordClearing.z) < 8) continue;
      const bush = library.createBush(x, z, s, hash2(x, z) * 500 + i);
      if (bush) this.root.add(bush);
    }
  }

  /** True if inside main meadow, east/west/north/south corridors, or any clearing. */
  isInPlayArea(x: number, z: number): boolean {
    if (x * x + z * z <= this.playRadius * this.playRadius) return true;
    const cdx = x - this.eastClearing.x;
    const cdz = z - this.eastClearing.z;
    if (cdx * cdx + cdz * cdz <= this.eastClearing.radius * this.eastClearing.radius) {
      return true;
    }
    const wdx = x - this.westClearing.x;
    const wdz = z - this.westClearing.z;
    if (wdx * wdx + wdz * wdz <= this.westClearing.radius * this.westClearing.radius) {
      return true;
    }
    const ndx = x - this.northClearing.x;
    const ndz = z - this.northClearing.z;
    if (ndx * ndx + ndz * ndz <= this.northClearing.radius * this.northClearing.radius) {
      return true;
    }
    const sdx = x - this.southClearing.x;
    const sdz = z - this.southClearing.z;
    if (sdx * sdx + sdz * sdz <= this.southClearing.radius * this.southClearing.radius) {
      return true;
    }
    if (this.distToEastCorridor(x, z) <= this.eastCorridorHalfWidth) return true;
    if (this.distToWestCorridor(x, z) <= this.westCorridorHalfWidth) return true;
    if (this.distToNorthCorridor(x, z) <= this.northCorridorHalfWidth) return true;
    return this.distToSouthCorridor(x, z) <= this.southCorridorHalfWidth;
  }

  /** Keep entities inside main meadow ∪ east/west/north/south corridors ∪ clearings. */
  clampToPlayArea(position: THREE.Vector3): void {
    if (this.isInPlayArea(position.x, position.z)) return;
    const nearest = this.nearestPlayPoint(position.x, position.z);
    position.x = nearest.x;
    position.z = nearest.z;
  }

  /** Corridor + path samples used to keep props from blocking the branch. */
  private isOnEastBranchApproach(x: number, z: number): boolean {
    if (x < 10) return false;
    // Wide cone along +X so the tree ring does not choke the east exit.
    if (x > 24 && Math.abs(z - 6.5) < 11) return true;
    if (this.distToEastCorridor(x, z) < this.eastCorridorHalfWidth + 1.6) return true;
    return meadowPathInfluence(x, z) > 0.35 && x > 13;
  }

  /** Keep props off the west dirt branch into the misty grove. */
  private isOnWestBranchApproach(x: number, z: number): boolean {
    if (x > -10) return false;
    // Wide cone along −X so the tree ring does not choke the west exit.
    if (x < -24 && Math.abs(z - -2) < 11) return true;
    if (this.distToWestCorridor(x, z) < this.westCorridorHalfWidth + 1.6) return true;
    return meadowPathInfluence(x, z) > 0.35 && x < -13;
  }

  /** Keep props off the north dirt branch into the ruins courtyard. */
  private isOnNorthBranchApproach(x: number, z: number): boolean {
    if (z < 12) return false;
    // Wide cone along +Z so the tree ring does not choke the north exit.
    if (z > 24 && Math.abs(x - 3) < 11) return true;
    if (this.distToNorthCorridor(x, z) < this.northCorridorHalfWidth + 1.6) return true;
    return meadowPathInfluence(x, z) > 0.35 && z > 15;
  }

  /** Keep props off the south dirt branch into the river ford. */
  private isOnSouthBranchApproach(x: number, z: number): boolean {
    if (z > -12) return false;
    // Wide cone along −Z so the tree ring does not choke the south exit.
    if (z < -24 && Math.abs(x - -3) < 11) return true;
    if (this.distToSouthCorridor(x, z) < this.southCorridorHalfWidth + 1.6) return true;
    return meadowPathInfluence(x, z) > 0.35 && z < -15;
  }

  /** Distance from point to the east corridor segment (main rim → clearing). */
  private distToEastCorridor(x: number, z: number): number {
    // Capsule from just inside the main ring toward the clearing center.
    const ax = 29;
    const az = 5.5;
    const bx = this.eastClearing.x - 3;
    const bz = this.eastClearing.z;
    return this.distToSegment(x, z, ax, az, bx, bz);
  }

  /** Distance from point to the west corridor segment (main rim → grove). */
  private distToWestCorridor(x: number, z: number): number {
    const ax = -29;
    const az = -0.5;
    const bx = this.westClearing.x + 3;
    const bz = this.westClearing.z;
    return this.distToSegment(x, z, ax, az, bx, bz);
  }

  /** Distance from point to the north corridor segment (main rim → ruins). */
  private distToNorthCorridor(x: number, z: number): number {
    const ax = 3;
    const az = 29;
    const bx = this.northClearing.x;
    const bz = this.northClearing.z - 3;
    return this.distToSegment(x, z, ax, az, bx, bz);
  }

  /** Distance from point to the south corridor segment (main rim → river ford). */
  private distToSouthCorridor(x: number, z: number): number {
    const ax = -3;
    const az = -29;
    const bx = this.southClearing.x;
    const bz = this.southClearing.z + 3;
    return this.distToSegment(x, z, ax, az, bx, bz);
  }

  private distToSegment(
    x: number,
    z: number,
    ax: number,
    az: number,
    bx: number,
    bz: number,
  ): number {
    const abx = bx - ax;
    const abz = bz - az;
    const abLen2 = abx * abx + abz * abz;
    const t =
      abLen2 > 1e-8
        ? Math.max(0, Math.min(1, ((x - ax) * abx + (z - az) * abz) / abLen2))
        : 0;
    const px = ax + abx * t;
    const pz = az + abz * t;
    return Math.hypot(x - px, z - pz);
  }

  private nearestPlayPoint(x: number, z: number): { x: number; z: number } {
    let bestX = x;
    let bestZ = z;
    let bestD2 = Infinity;

    const consider = (px: number, pz: number): void => {
      const d2 = (px - x) * (px - x) + (pz - z) * (pz - z);
      if (d2 < bestD2) {
        bestD2 = d2;
        bestX = px;
        bestZ = pz;
      }
    };

    // Main circle rim
    {
      const d = Math.hypot(x, z) || 1;
      consider((x / d) * this.playRadius, (z / d) * this.playRadius);
    }

    // East clearing rim
    {
      const dx = x - this.eastClearing.x;
      const dz = z - this.eastClearing.z;
      const d = Math.hypot(dx, dz) || 1;
      consider(
        this.eastClearing.x + (dx / d) * this.eastClearing.radius,
        this.eastClearing.z + (dz / d) * this.eastClearing.radius,
      );
    }

    // West clearing rim
    {
      const dx = x - this.westClearing.x;
      const dz = z - this.westClearing.z;
      const d = Math.hypot(dx, dz) || 1;
      consider(
        this.westClearing.x + (dx / d) * this.westClearing.radius,
        this.westClearing.z + (dz / d) * this.westClearing.radius,
      );
    }

    // North clearing rim
    {
      const dx = x - this.northClearing.x;
      const dz = z - this.northClearing.z;
      const d = Math.hypot(dx, dz) || 1;
      consider(
        this.northClearing.x + (dx / d) * this.northClearing.radius,
        this.northClearing.z + (dz / d) * this.northClearing.radius,
      );
    }

    // South clearing rim
    {
      const dx = x - this.southClearing.x;
      const dz = z - this.southClearing.z;
      const d = Math.hypot(dx, dz) || 1;
      consider(
        this.southClearing.x + (dx / d) * this.southClearing.radius,
        this.southClearing.z + (dz / d) * this.southClearing.radius,
      );
    }

    // East corridor capsule surface
    this.considerCorridorSurface(
      x,
      z,
      29,
      5.5,
      this.eastClearing.x - 3,
      this.eastClearing.z,
      this.eastCorridorHalfWidth,
      consider,
    );

    // West corridor capsule surface
    this.considerCorridorSurface(
      x,
      z,
      -29,
      -0.5,
      this.westClearing.x + 3,
      this.westClearing.z,
      this.westCorridorHalfWidth,
      consider,
    );

    // North corridor capsule surface
    this.considerCorridorSurface(
      x,
      z,
      3,
      29,
      this.northClearing.x,
      this.northClearing.z - 3,
      this.northCorridorHalfWidth,
      consider,
    );

    // South corridor capsule surface
    this.considerCorridorSurface(
      x,
      z,
      -3,
      -29,
      this.southClearing.x,
      this.southClearing.z + 3,
      this.southCorridorHalfWidth,
      consider,
    );

    return { x: bestX, z: bestZ };
  }

  private considerCorridorSurface(
    x: number,
    z: number,
    ax: number,
    az: number,
    bx: number,
    bz: number,
    halfWidth: number,
    consider: (px: number, pz: number) => void,
  ): void {
    const abx = bx - ax;
    const abz = bz - az;
    const abLen2 = abx * abx + abz * abz;
    const t =
      abLen2 > 1e-8
        ? Math.max(0, Math.min(1, ((x - ax) * abx + (z - az) * abz) / abLen2))
        : 0;
    const cx = ax + abx * t;
    const cz = az + abz * t;
    const dx = x - cx;
    const dz = z - cz;
    const d = Math.hypot(dx, dz);
    if (d < 1e-8) {
      consider(cx, cz + halfWidth);
    } else {
      consider(cx + (dx / d) * halfWidth, cz + (dz / d) * halfWidth);
    }
  }

  /** Soft-push an entity out of solid props. */
  resolveObstacles(position: THREE.Vector3, radius: number): void {
    for (const o of this.obstacles) {
      const minDist = o.radius + radius;
      const dx = position.x - o.x;
      const dz = position.z - o.z;
      const d2 = dx * dx + dz * dz;
      if (d2 >= minDist * minDist || d2 < 1e-8) {
        if (d2 < 1e-8) {
          position.x = o.x + minDist;
          position.z = o.z;
        }
        continue;
      }
      const d = Math.sqrt(d2);
      if (d < minDist) {
        const push = (minDist - d) / d;
        position.x += dx * push;
        position.z += dz * push;
      }
    }
  }
}
