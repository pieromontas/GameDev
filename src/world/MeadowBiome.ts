import * as THREE from 'three';
import {
  Palette,
  createToonMaterial,
  paintGroundVertexColors,
  displaceGroundHeight,
  meadowPathInfluence,
  EastShrineClearing,
  hash2,
} from '../render/stylized';

export type Obstacle = { x: number; z: number; radius: number };

/** Shared stylized meadow: living ground, tiered trees, rocks, landmarks. */
export class MeadowBiome {
  readonly root = new THREE.Group();
  /** Larger disk so the east shrine clearing sits on painted ground. */
  readonly groundSize = 110;
  readonly playRadius = 34;
  /** Second playable pocket — ancient shrine clearing east of the main ring. */
  readonly eastClearing = EastShrineClearing;
  /** Soft corridor half-width connecting main meadow → east clearing. */
  readonly eastCorridorHalfWidth = 5.6;
  /** Solid props used for soft collision (trees + rocks + landmarks). */
  readonly obstacles: Obstacle[] = [];

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

  constructor() {
    this.root.name = 'MeadowBiome';
    this.grassMat.vertexColors = true;
    this.buildGround();
    this.buildGrassInstances();
    this.buildRingOfTrees();
    this.scatterProps();
    this.buildLandmarks();
    this.buildEastShrineClearing();
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
      new THREE.RingGeometry(26, 34, 56),
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

    this.buildEastPathRibbon();
  }

  /** Explicit dirt ribbon so the east branch reads clearly at iso distance. */
  private buildEastPathRibbon(): void {
    const pathMat = createToonMaterial(Palette.path);
    const edgeMat = createToonMaterial(Palette.pathEdge);
    const ax = 12;
    const az = 4.2;
    const bx = this.eastClearing.x;
    const bz = this.eastClearing.z;
    const segments = 10;
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

  private buildGrassInstances(): void {
    const count = 520;
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
      // Bias later placements into the east clearing so it feels inhabited.
      if (placed > 380) {
        const ang = hash2(placed * 1.7, guard * 0.3) * Math.PI * 2;
        const rad = hash2(guard * 2.1, placed * 0.9) * (this.eastClearing.radius - 1.2);
        x = this.eastClearing.x + Math.cos(ang) * rad;
        z = this.eastClearing.z + Math.sin(ang) * rad;
      } else {
        const ang = hash2(placed * 1.7, guard * 0.3) * Math.PI * 2;
        const rad = 3 + hash2(guard * 2.1, placed * 0.9) * 28;
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
    const count = 30;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const radius = 29.5 + (i % 4) * 1.35;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      // Gap for the dirt path branch into the east shrine clearing.
      if (this.isOnEastBranchApproach(x, z)) continue;
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
      [-3, 16, 1],
      // Was (14, 6) — moved north so the east path branch stays open
      [14, 12, 1.05],
      [-16, -2, 1.2],
      [3, -12, 1.05],
      [-18, 10, 0.92],
      [16, -12, 1.08],
    ];
    for (const [x, z, s] of treeSpots) {
      if (this.isOnEastBranchApproach(x, z)) continue;
      this.addTree(x, z, s);
    }

    const rockSpots: Array<[number, number, number]> = [
      [4.2, -3.1, 0.9],
      [-5.5, 2.4, 1.1],
      [9.1, 5.8, 0.75],
      [-9.4, -7.2, 1],
      [1.6, 11.3, 0.85],
      [-13.2, 1.1, 1.15],
      [11.8, -9.4, 0.8],
      [-2.8, -10.6, 0.95],
      [7.4, 14.2, 0.7],
      [-7.1, 12.5, 1.05],
      // Was (15.2, 1.8) — nudged off the branch corridor
      [15.2, -2.4, 0.9],
      [-14.6, -5.3, 0.75],
      [5.9, -14.1, 1],
      [-0.8, 7.6, 0.65],
      [12.4, 10.1, 0.85],
      [-10.8, 8.9, 0.8],
      [3.3, 3.7, 0.6],
      [-6.2, -13.4, 0.95],
      // Was (18, 8) — corridor rocks cleared for the path branch
      [18, 14, 1.2],
      [-17, -10, 1.05],
    ];
    for (const [x, z, s] of rockSpots) {
      if (this.isOnEastBranchApproach(x, z)) continue;
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
    this.addSignpost(16.5, 6.8);
    // Quiet pond off the path
    this.addPond(-11.5, -11.5);
    // Ruin pillar cluster for a read-able landmark
    this.addRuinPillar(15.5, -6.5);
    // Tiny cottage + windmill silhouette on the rim (out of play collision mostly)
    this.addCottage(-22, 16);
    // Windmill kept north of the east path so the branch stays readable
    this.addWindmill(24, 18);
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
    const ledgeX = cx + 9.5;
    const ledgeZ = cz + 3.5;
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
    group.add(crystal);

    const crystalTip = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), crystalMat);
    crystalTip.position.set(0, 5.45, 0);
    crystalTip.scale.set(0.7, 1.15, 0.7);
    group.add(crystalTip);

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

  private buildEdgeLedges(): void {
    const ledges: Array<[number, number, number, number]> = [
      [20, -18, 1.2, 0.9],
      [-22, -14, 1.4, 1],
      [18, 20, 1.1, 0.85],
      [-19, 22, 1.3, 0.95],
      [26, 0, 1.5, 1.1],
      [-26, 4, 1.35, 1],
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
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.scale.setScalar(scale);
    group.rotation.y = hash2(x, z) * Math.PI * 2;

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
    const group = new THREE.Group();
    group.position.set(x, 0, z);

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

  private addSignpost(x: number, z: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

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
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.scale.setScalar(1.15);

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
    const group = new THREE.Group();
    group.position.set(x, 0, z);

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

  /** True if inside main meadow, east corridor, or shrine clearing. */
  isInPlayArea(x: number, z: number): boolean {
    if (x * x + z * z <= this.playRadius * this.playRadius) return true;
    const cdx = x - this.eastClearing.x;
    const cdz = z - this.eastClearing.z;
    if (cdx * cdx + cdz * cdz <= this.eastClearing.radius * this.eastClearing.radius) {
      return true;
    }
    return this.distToEastCorridor(x, z) <= this.eastCorridorHalfWidth;
  }

  /** Keep entities inside the main meadow ∪ east path corridor ∪ shrine clearing. */
  clampToPlayArea(position: THREE.Vector3): void {
    if (this.isInPlayArea(position.x, position.z)) return;
    const nearest = this.nearestPlayPoint(position.x, position.z);
    position.x = nearest.x;
    position.z = nearest.z;
  }

  /** Corridor + path samples used to keep props from blocking the branch. */
  private isOnEastBranchApproach(x: number, z: number): boolean {
    if (x < 8) return false;
    // Wide cone along +X so the tree ring does not choke the east exit.
    if (x > 18 && Math.abs(z - 5) < 9.5) return true;
    if (this.distToEastCorridor(x, z) < this.eastCorridorHalfWidth + 1.6) return true;
    return meadowPathInfluence(x, z) > 0.35 && x > 10;
  }

  /** Distance from point to the east corridor segment (main rim → clearing). */
  private distToEastCorridor(x: number, z: number): number {
    // Capsule from just inside the main ring toward the clearing center.
    const ax = 22;
    const az = 4.4;
    const bx = this.eastClearing.x - 2.5;
    const bz = this.eastClearing.z;
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

    // Corridor capsule surface
    {
      const ax = 22;
      const az = 4.4;
      const bx = this.eastClearing.x - 2.5;
      const bz = this.eastClearing.z;
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
        consider(cx, cz + this.eastCorridorHalfWidth);
      } else {
        consider(
          cx + (dx / d) * this.eastCorridorHalfWidth,
          cz + (dz / d) * this.eastCorridorHalfWidth,
        );
      }
    }

    return { x: bestX, z: bestZ };
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
