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
  NortheastCityGate,
  NortheastMarketDistrict,
  hash2,
} from '../render/stylized';
import type { WorldPropLibrary } from './WorldPropLibrary';
import { PROP_COLLISION_SCALE, WELL_OFFSET } from './WorldPropLibrary';
import {
  MARKET_ALLEY_SPOT,
  MARKET_BLACKSMITH_SPOT,
  MARKET_FORGE_SPOT,
  MARKET_FOUNTAIN_SPOT,
  MARKET_INN_SPOT,
  MARKET_SIGN_SPOT,
} from './MarketDistrict';

export type Obstacle = { x: number; z: number; radius: number };

type PropPlacement = { x: number; z: number; scale: number };

/** KayKit cottage reused as a market shop facade (pack-swapped like the NW cottage). */
type ShopPlacement = { x: number; z: number; scale: number; yaw: number };

type SignFacing = 'east' | 'west' | 'north' | 'south' | 'northeast';

/** Shared stylized meadow: living ground, tiered trees, rocks, landmarks. */
export class MeadowBiome {
  readonly root = new THREE.Group();
  /** Larger disk so east/west/north/south clearings + NE gate sit on painted ground. */
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
  /** Sixth playable stub — city gate plaza northeast of the main ring. */
  readonly northeastGate = NortheastCityGate;
  /** Soft corridor half-width connecting main meadow → NE city gate. */
  readonly northeastCorridorHalfWidth = 6.0;
  /** Seventh playable stub — market district behind the NE gate (first town slice). */
  readonly northeastMarket = NortheastMarketDistrict;
  /** Soft corridor half-width connecting gate plaza → market district. */
  readonly marketCorridorHalfWidth = 6.0;
  /** World XZ of the city gate arch (for minimap / discovery cues). */
  readonly cityGatePosition = new THREE.Vector3(NortheastCityGate.x, 0, NortheastCityGate.z);
  /** World XZ of the market plaza center (for minimap / discovery cues). */
  readonly marketPosition = new THREE.Vector3(
    NortheastMarketDistrict.x,
    0,
    NortheastMarketDistrict.z,
  );
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
  /** Market district KayKit shop cottages (pack-swapped; not the NW merchant cottage). */
  private readonly shopPlacements: ShopPlacement[] = [];
  /** Market blacksmith KayKit cottage (pack-swapped; forge props stay procedural). */
  private blacksmithPlacement: ShopPlacement | null = null;
  /** Market inn / tavern KayKit cottage (pack-swapped; porch props stay procedural). */
  private innPlacement: ShopPlacement | null = null;
  private marketWellPlacement: { x: number; z: number } | null = null;
  private packApplied = false;

  /** Idle fountain / forge VFX driven by `updateMarketAmbience`. */
  private marketAmbienceT = 0;
  private readonly marketFountainSparkles: THREE.Mesh[] = [];
  private readonly marketForgeSmoke: THREE.Mesh[] = [];
  private readonly marketForgeEmbers: THREE.Mesh[] = [];
  private marketForgeLight: THREE.PointLight | null = null;

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
  private readonly bannerMat = createToonMaterial(Palette.roofTile, {
    emissive: Palette.roofTile,
    emissiveIntensity: 0.12,
    side: THREE.DoubleSide,
  });
  private readonly bannerTrimMat = createToonMaterial(Palette.warriorTrimGold);

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
    this.buildNortheastCityGate();
    this.buildNortheastMarketDistrict();
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

    // Soft grass RING under the NE gate plaza — leave center open for the road pad.
    const gatePad = new THREE.Mesh(
      new THREE.RingGeometry(4.4, this.northeastGate.radius + 1.6, 36),
      createToonMaterial(Palette.grassB),
    );
    gatePad.rotation.x = -Math.PI / 2;
    gatePad.position.set(this.northeastGate.x, 0.025, this.northeastGate.z);
    gatePad.receiveShadow = true;
    this.root.add(gatePad);

    // Soft grass RING under the market district — leave center open for cobble plaza.
    const marketPad = new THREE.Mesh(
      new THREE.RingGeometry(5.0, this.northeastMarket.radius + 1.6, 36),
      createToonMaterial(0x6a8a52),
    );
    marketPad.rotation.x = -Math.PI / 2;
    marketPad.position.set(this.northeastMarket.x, 0.025, this.northeastMarket.z);
    marketPad.receiveShadow = true;
    this.root.add(marketPad);

    this.buildEastPathRibbon();
    this.buildWestPathRibbon();
    this.buildNorthPathRibbon();
    this.buildSouthPathRibbon();
    this.buildNortheastPathRibbon();
    this.buildMarketStreetRibbon();
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

  /** Dirt/stone road ribbon so the NE city-gate spur reads clearly at iso distance. */
  private buildNortheastPathRibbon(): void {
    const pathMat = createToonMaterial(Palette.pathDark);
    const edgeMat = createToonMaterial(Palette.rockLight);
    const ax = 16;
    const az = 16;
    const bx = this.northeastGate.x;
    const bz = this.northeastGate.z;
    const segments = 14;
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
      // Wider than nature trails — reads as a road toward town.
      const width = 4.1 + Math.sin(t0 * Math.PI) * 0.55;

      const plank = new THREE.Mesh(new THREE.BoxGeometry(width, 0.045, len + 0.15), pathMat);
      plank.position.set(mx, 0.048, mz);
      plank.rotation.y = ang;
      plank.receiveShadow = true;
      this.root.add(plank);

      const edge = new THREE.Mesh(
        new THREE.BoxGeometry(width + 0.7, 0.025, len + 0.2),
        edgeMat,
      );
      edge.position.set(mx, 0.032, mz);
      edge.rotation.y = ang;
      edge.receiveShadow = true;
      this.root.add(edge);

      // Occasional cobble accents so the road feels stone-lined, not pure dirt.
      if (i % 3 === 1) {
        const cobble = new THREE.Mesh(
          new THREE.BoxGeometry(width * 0.55, 0.03, Math.min(len * 0.7, 1.1)),
          createToonMaterial(Palette.rock),
        );
        cobble.position.set(mx, 0.055, mz);
        cobble.rotation.y = ang + 0.04;
        cobble.receiveShadow = true;
        this.root.add(cobble);
      }
    }

    const pad = new THREE.Mesh(new THREE.CircleGeometry(5.0, 28), pathMat);
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(this.northeastGate.x, 0.04, this.northeastGate.z);
    pad.receiveShadow = true;
    this.root.add(pad);
  }

  /** Cobble/stone street from the gate plaza into the market district stub. */
  private buildMarketStreetRibbon(): void {
    const pathMat = createToonMaterial(Palette.pathDark);
    const edgeMat = createToonMaterial(Palette.rockLight);
    const cobbleMat = createToonMaterial(Palette.rock);
    const ax = this.northeastGate.x + 2.2;
    const az = this.northeastGate.z + 2.2;
    const bx = this.northeastMarket.x;
    const bz = this.northeastMarket.z;
    const segments = 8;
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
      const width = 4.4 + Math.sin(t0 * Math.PI) * 0.45;

      const plank = new THREE.Mesh(new THREE.BoxGeometry(width, 0.05, len + 0.12), pathMat);
      plank.position.set(mx, 0.05, mz);
      plank.rotation.y = ang;
      plank.receiveShadow = true;
      this.root.add(plank);

      const edge = new THREE.Mesh(
        new THREE.BoxGeometry(width + 0.65, 0.028, len + 0.18),
        edgeMat,
      );
      edge.position.set(mx, 0.034, mz);
      edge.rotation.y = ang;
      edge.receiveShadow = true;
      this.root.add(edge);

      if (i % 2 === 0) {
        const cobble = new THREE.Mesh(
          new THREE.BoxGeometry(width * 0.62, 0.032, Math.min(len * 0.75, 1.2)),
          cobbleMat,
        );
        cobble.position.set(mx, 0.058, mz);
        cobble.rotation.y = ang + 0.05;
        cobble.receiveShadow = true;
        this.root.add(cobble);
      }
    }

    const plaza = new THREE.Mesh(new THREE.CircleGeometry(5.4, 28), cobbleMat);
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.set(this.northeastMarket.x, 0.042, this.northeastMarket.z);
    plaza.receiveShadow = true;
    this.root.add(plaza);

    const plazaTop = new THREE.Mesh(
      new THREE.CircleGeometry(4.2, 24),
      createToonMaterial(Palette.rockLight),
    );
    plazaTop.rotation.x = -Math.PI / 2;
    plazaTop.position.set(this.northeastMarket.x, 0.055, this.northeastMarket.z);
    plazaTop.receiveShadow = true;
    this.root.add(plazaTop);
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
      // Bias later placements into clearings / gate / market so pockets feel inhabited.
      if (placed > 555) {
        const ang = hash2(placed * 1.7, guard * 0.3) * Math.PI * 2;
        const rad = 4.5 + hash2(guard * 2.1, placed * 0.9) * (this.northeastMarket.radius - 5.2);
        x = this.northeastMarket.x + Math.cos(ang) * rad;
        z = this.northeastMarket.z + Math.sin(ang) * rad;
      } else if (placed > 530) {
        const ang = hash2(placed * 1.7, guard * 0.3) * Math.PI * 2;
        const rad = hash2(guard * 2.1, placed * 0.9) * (this.northeastGate.radius - 1.4);
        x = this.northeastGate.x + Math.cos(ang) * rad;
        z = this.northeastGate.z + Math.sin(ang) * rad;
      } else if (placed > 480) {
        const ang = hash2(placed * 1.7, guard * 0.3) * Math.PI * 2;
        const rad = hash2(guard * 2.1, placed * 0.9) * (this.southClearing.radius - 1.2);
        x = this.southClearing.x + Math.cos(ang) * rad;
        z = this.southClearing.z + Math.sin(ang) * rad;
      } else if (placed > 420) {
        const ang = hash2(placed * 1.7, guard * 0.3) * Math.PI * 2;
        const rad = hash2(guard * 2.1, placed * 0.9) * (this.northClearing.radius - 1.2);
        x = this.northClearing.x + Math.cos(ang) * rad;
        z = this.northClearing.z + Math.sin(ang) * rad;
      } else if (placed > 360) {
        const ang = hash2(placed * 1.7, guard * 0.3) * Math.PI * 2;
        const rad = hash2(guard * 2.1, placed * 0.9) * (this.westClearing.radius - 1.2);
        x = this.westClearing.x + Math.cos(ang) * rad;
        z = this.westClearing.z + Math.sin(ang) * rad;
      } else if (placed > 300) {
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
      // Gap for dirt path branches into clearings + NE city-gate road.
      if (this.isOnEastBranchApproach(x, z)) continue;
      if (this.isOnWestBranchApproach(x, z)) continue;
      if (this.isOnNorthBranchApproach(x, z)) continue;
      if (this.isOnSouthBranchApproach(x, z)) continue;
      if (this.isOnNortheastBranchApproach(x, z)) continue;
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
      // Was (20, 30) — nudged off the NE city-gate road
      [16, 34, 1.1],
      [-22, -28, 1.02],
    ];
    for (const [x, z, s] of treeSpots) {
      if (this.isOnEastBranchApproach(x, z)) continue;
      if (this.isOnWestBranchApproach(x, z)) continue;
      if (this.isOnNorthBranchApproach(x, z)) continue;
      if (this.isOnSouthBranchApproach(x, z)) continue;
      if (this.isOnNortheastBranchApproach(x, z)) continue;
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
      // Was (12, 34) — kept north of NE corridor
      [8, 36, 0.85],
      [-14, -32, 1.0],
    ];
    for (const [x, z, s] of rockSpots) {
      if (this.isOnEastBranchApproach(x, z)) continue;
      if (this.isOnWestBranchApproach(x, z)) continue;
      if (this.isOnNorthBranchApproach(x, z)) continue;
      if (this.isOnSouthBranchApproach(x, z)) continue;
      if (this.isOnNortheastBranchApproach(x, z)) continue;
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
    // Branch marker — points players toward the NE city gate / future town
    this.addSignpost(18.5, 17.2, 'northeast');
    // Quiet pond off the path
    this.addPond(-11.5, -11.5);
    // Ruin pillar cluster for a read-able landmark
    this.addRuinPillar(15.5, -6.5);
    // Tiny cottage + windmill silhouette on the rim (out of play collision mostly)
    this.addCottage(-29, 21);
    // Windmill kept north of the east path and south of the NE city-gate road
    this.addWindmill(34, 16);
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
   * Northeast road spur end: intact city gate arch + approach plaza.
   * Market district continues further NE (see `buildNortheastMarketDistrict`).
   */
  private buildNortheastCityGate(): void {
    const { x: cx, z: cz, radius } = this.northeastGate;

    this.addCityGateArch(cx, cz);
    this.addRoadsideDressing();

    // Sparse rim trees — leave the SW entrance open for the road, NE open for market.
    const rimTrees = 7;
    for (let i = 0; i < rimTrees; i++) {
      const a = (i / rimTrees) * Math.PI * 2 + 0.35;
      // Skip SW approach (road) and far NE (market street)
      if (Math.cos(a) + Math.sin(a) < -0.55) continue;
      if (Math.cos(a) + Math.sin(a) > 1.05) continue;
      const r = radius + 0.4 + (i % 3) * 0.45;
      this.addTree(cx + Math.cos(a) * r, cz + Math.sin(a) * r, 0.88 + (i % 3) * 0.07);
    }

    // A couple of roadside rocks clear of the paved pad
    const rocks: Array<[number, number, number]> = [
      [cx + 5.6, cz - 1.8, 0.85],
      [cx - 2.2, cz + 5.8, 0.75],
    ];
    for (const [x, z, s] of rocks) {
      if (meadowPathInfluence(x, z) > 0.5) continue;
      this.addRock(x, z, s);
    }
  }

  /**
   * Compact market district stub behind the NE gate — first town slice.
   * KayKit cottage shops + stylized stalls/awning props; leave hooks for later
   * residential / harbor districts further out.
   */
  private buildNortheastMarketDistrict(): void {
    const { x: cx, z: cz, radius } = this.northeastMarket;

    // Flavor sign just past the gate (E interact wired in Game via MarketDistrictSign).
    this.addMarketDistrictSign(MARKET_SIGN_SPOT.x, MARKET_SIGN_SPOT.z);

    // Street-facing KayKit shops (procedural stand-ins → pack swap). Yaw faces cobble.
    // Street runs along the NE diagonal; shops sit well off the walk lane
    // (KayKit cottage collision ≈ 1.6 × PROP_SCALE.cottage after pack apply).
    this.addMarketShop(44.8, 58.2, 1.08, Math.PI * 0.78);
    this.addMarketShop(58.2, 44.6, 1.12, -Math.PI * 0.22);
    // Far-side shop — stay ≥~5 units off the diagonal so pack-scaled cottage r≈4.4 clears the street
    this.addMarketShop(61.0, 53.0, 1.18, -Math.PI * 0.45);

    // Central plaza fountain — soft blocker; leave walk lanes around the cobble.
    this.addMarketFountain(MARKET_FOUNTAIN_SPOT.x, MARKET_FOUNTAIN_SPOT.z);

    // Blacksmith workshop on the NNE rim (KayKit cottage) + forge/anvil yard toward plaza.
    // Clear of shop A/C pack radii (~4.4) and the gate→market diagonal.
    this.addMarketBlacksmith(
      MARKET_BLACKSMITH_SPOT.x,
      MARKET_BLACKSMITH_SPOT.z,
      1.05,
      Math.atan2(
        MARKET_FOUNTAIN_SPOT.x - MARKET_BLACKSMITH_SPOT.x,
        MARKET_FOUNTAIN_SPOT.z - MARKET_BLACKSMITH_SPOT.z,
      ),
    );
    this.addMarketForgeYard(MARKET_FORGE_SPOT.x, MARKET_FORGE_SPOT.z);

    // Inn / tavern on the south rim (KayKit cottage) — opposite the blacksmith.
    // Clear of shop B pack radius (~4.4), the gate→market diagonal, and fountain lanes.
    this.addMarketInn(
      MARKET_INN_SPOT.x,
      MARKET_INN_SPOT.z,
      1.1,
      Math.atan2(
        MARKET_FOUNTAIN_SPOT.x - MARKET_INN_SPOT.x,
        MARKET_FOUNTAIN_SPOT.z - MARKET_INN_SPOT.z,
      ),
    );
    this.addMarketInnYard(MARKET_INN_SPOT.x, MARKET_INN_SPOT.z);

    // Stylized stall awnings + crates (dense but not a capital).
    // Crates sit off the fountain footprint so the plaza center stays readable.
    this.addMarketStall(48.0, 54.0, Math.PI * 0.7, Palette.roofTile);
    this.addMarketStall(54.2, 47.8, -Math.PI * 0.28, Palette.flowerYellow);
    this.addMarketStall(55.8, 52.4, -Math.PI * 0.9, Palette.flowerCyan);

    this.addMarketCrates(47.2, 51.4, 0.2);
    this.addMarketCrates(54.0, 49.2, -0.35);
    this.addMarketBannerPost(47.0, 49.2, 0.1);
    this.addMarketBannerPost(55.0, 52.6, -0.08);

    // KayKit well accent off the fountain — pack-swapped with shops.
    this.marketWellPlacement = { x: 47.8, z: 55.4 };
    this.addMarketWellStandIn(this.marketWellPlacement.x, this.marketWellPlacement.z);

    // Low curtain walls + corner posts — enclose parts of the rim, link to the gate.
    // Leave SW (gate approach) and far NE (future districts / street exits) open.
    this.buildMarketPerimeterWalls();
    // Short west-rim alley off the plaza (walkable crate lane + E flavor).
    this.buildMarketSideAlley();

    // Sparse rim trees — leave SW open toward the gate, far NE for future districts.
    // Skip blacksmith + inn pads so foliage doesn't swallow the landmark silhouettes.
    const rimTrees = 6;
    for (let i = 0; i < rimTrees; i++) {
      const a = (i / rimTrees) * Math.PI * 2 + 0.55;
      if (Math.cos(a) + Math.sin(a) < -0.7) continue;
      if (Math.cos(a) + Math.sin(a) > 1.2) continue;
      const r = radius + 0.35 + (i % 2) * 0.4;
      const tx = cx + Math.cos(a) * r;
      const tz = cz + Math.sin(a) * r;
      if (meadowPathInfluence(tx, tz) > 0.45) continue;
      if (
        Math.hypot(tx - MARKET_BLACKSMITH_SPOT.x, tz - MARKET_BLACKSMITH_SPOT.z) < 5.5
      ) {
        continue;
      }
      if (Math.hypot(tx - MARKET_INN_SPOT.x, tz - MARKET_INN_SPOT.z) < 5.5) {
        continue;
      }
      // Keep the west-rim alley + curtain-wall walk ring readable.
      if (Math.hypot(tx - MARKET_ALLEY_SPOT.x, tz - MARKET_ALLEY_SPOT.z) < 5.0) {
        continue;
      }
      this.addTree(tx, tz, 0.86 + (i % 3) * 0.06);
    }
  }

  /** Intact stylized city gate — knight-scale archway (taller/wider than the
   * north ruins crumbled gate). Faces southwest toward the meadow road.
   * Tiny stone plaza behind the arch leads into the market street.
   */
  private addCityGateArch(x: number, z: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    // Road arrives from SW (−X, −Z); yaw so the arch faces the approach.
    group.rotation.y = (-Math.PI * 3) / 4;
    group.name = 'CityGateArch';

    // Arrival / under-gate paving
    const approach = new THREE.Mesh(
      new THREE.BoxGeometry(5.2, 0.08, 7.5),
      createToonMaterial(Palette.pathDark),
    );
    approach.position.set(0, 0.05, -0.4);
    approach.receiveShadow = true;
    group.add(approach);

    // Small stone plaza BEHIND the gate (+local Z) — transitions into market street
    const plaza = new THREE.Mesh(
      new THREE.CylinderGeometry(4.0, 4.2, 0.16, 12),
      this.rockMat,
    );
    plaza.position.set(0, 0.06, 3.6);
    plaza.receiveShadow = true;
    group.add(plaza);
    const plazaTop = new THREE.Mesh(
      new THREE.CylinderGeometry(3.4, 3.5, 0.1, 12),
      this.rockLightMat,
    );
    plazaTop.position.set(0, 0.16, 3.6);
    plazaTop.receiveShadow = true;
    group.add(plazaTop);

    // Twin towers / pillars — ~6.4 tall for Adventurers-scale readability
    const pillarH = 6.4;
    const pillarY = pillarH * 0.5;
    const leftPillar = new THREE.Mesh(
      new THREE.BoxGeometry(1.35, pillarH, 1.35),
      this.rockLightMat,
    );
    leftPillar.position.set(-2.55, pillarY, 0);
    leftPillar.castShadow = true;
    leftPillar.receiveShadow = true;
    group.add(leftPillar);

    const rightPillar = new THREE.Mesh(
      new THREE.BoxGeometry(1.35, pillarH, 1.35),
      this.rockLightMat,
    );
    rightPillar.position.set(2.55, pillarY, 0);
    rightPillar.castShadow = true;
    rightPillar.receiveShadow = true;
    group.add(rightPillar);

    // Pillar caps
    for (const px of [-2.55, 2.55]) {
      const cap = new THREE.Mesh(
        new THREE.BoxGeometry(1.7, 0.35, 1.7),
        this.cliffMat,
      );
      cap.position.set(px, pillarH + 0.12, 0);
      cap.castShadow = true;
      group.add(cap);
      const finial = new THREE.Mesh(
        new THREE.ConeGeometry(0.28, 0.55, 5),
        this.bannerTrimMat,
      );
      finial.position.set(px, pillarH + 0.55, 0);
      finial.castShadow = true;
      group.add(finial);
    }

    // Main lintel / arch beam
    const lintel = new THREE.Mesh(
      new THREE.BoxGeometry(6.6, 1.1, 1.5),
      this.rockMat,
    );
    lintel.position.set(0, 5.55, 0);
    lintel.castShadow = true;
    lintel.receiveShadow = true;
    group.add(lintel);

    // Keystone accent
    const keystone = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.85, 1.65),
      this.cliffMat,
    );
    keystone.position.set(0, 5.35, 0.05);
    keystone.castShadow = true;
    group.add(keystone);

    // Soft arch wedges under the lintel (readable opening ~3.6 wide × ~4.8 tall)
    for (const side of [-1, 1]) {
      const wedge = new THREE.Mesh(
        new THREE.BoxGeometry(0.85, 1.4, 1.2),
        this.rockShadowMat,
      );
      wedge.position.set(side * 1.55, 4.55, 0);
      wedge.rotation.z = side * 0.35;
      wedge.castShadow = true;
      group.add(wedge);
    }

    // Open wooden gate leaves (ajar) — walkable through the center
    for (const side of [-1, 1]) {
      const leaf = new THREE.Mesh(
        new THREE.BoxGeometry(1.35, 3.6, 0.14),
        this.woodDarkMat,
      );
      leaf.position.set(side * 1.55, 1.9, side * 0.55);
      leaf.rotation.y = side * 0.55;
      leaf.castShadow = true;
      group.add(leaf);
      const brace = new THREE.Mesh(
        new THREE.BoxGeometry(1.1, 0.12, 0.16),
        this.woodMat,
      );
      brace.position.set(side * 1.55, 2.6, side * 0.55);
      brace.rotation.y = side * 0.55;
      group.add(brace);
    }

    // Banner poles on outer faces
    for (const side of [-1, 1]) {
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.08, 3.2, 5),
        this.woodDarkMat,
      );
      pole.position.set(side * 3.45, 4.2, 0.15);
      pole.castShadow = true;
      group.add(pole);
      const banner = new THREE.Mesh(
        new THREE.PlaneGeometry(0.85, 1.6),
        this.bannerMat,
      );
      banner.position.set(side * 3.45, 3.5, 0.55);
      banner.castShadow = true;
      group.add(banner);
      const stripe = new THREE.Mesh(
        new THREE.PlaneGeometry(0.55, 0.14),
        this.bannerTrimMat,
      );
      stripe.position.set(side * 3.45, 3.85, 0.56);
      group.add(stripe);
    }

    // Low flanking walls — light dressing, not a district
    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(
        new THREE.BoxGeometry(2.8, 1.35, 0.55),
        this.rockMat,
      );
      wall.position.set(side * 4.6, 0.68, 0.8);
      wall.castShadow = true;
      wall.receiveShadow = true;
      group.add(wall);
      const coping = new THREE.Mesh(
        new THREE.BoxGeometry(2.9, 0.22, 0.65),
        this.cliffMat,
      );
      coping.position.set(side * 4.6, 1.45, 0.8);
      group.add(coping);
    }

    this.root.add(group);

    // Soft collision on pillars + side walls — center arch stays walkable
    const yaw = (-Math.PI * 3) / 4;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const toWorld = (lx: number, lz: number): { x: number; z: number } => ({
      x: x + lx * cos + lz * sin,
      z: z - lx * sin + lz * cos,
    });
    const left = toWorld(-2.55, 0);
    const right = toWorld(2.55, 0);
    const wallL = toWorld(-4.6, 0.8);
    const wallR = toWorld(4.6, 0.8);
    this.obstacles.push({ x: left.x, z: left.z, radius: 0.85 });
    this.obstacles.push({ x: right.x, z: right.z, radius: 0.85 });
    this.obstacles.push({ x: wallL.x, z: wallL.z, radius: 0.7 });
    this.obstacles.push({ x: wallR.x, z: wallR.z, radius: 0.7 });
  }

  /** A few roadside posts + banners along the NE spur — optional light dressing. */
  private addRoadsideDressing(): void {
    const posts: Array<[number, number, number]> = [
      [22.5, 19.8, 0.15],
      [27.2, 24.6, -0.12],
      [32.4, 30.1, 0.2],
      [36.0, 35.2, -0.08],
    ];
    for (let i = 0; i < posts.length; i++) {
      const [px, pz, tilt] = posts[i]!;
      // Offset slightly off the road centerline (perpendicular to NE)
      const side = i % 2 === 0 ? 1 : -1;
      const x = px + side * 2.7;
      const z = pz - side * 2.7;
      const group = new THREE.Group();
      group.position.set(x, 0, z);

      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.11, 2.4, 5),
        this.woodDarkMat,
      );
      post.position.y = 1.2;
      post.rotation.z = tilt;
      post.castShadow = true;
      group.add(post);

      if (i % 2 === 0) {
        const banner = new THREE.Mesh(
          new THREE.PlaneGeometry(0.7, 1.15),
          this.bannerMat,
        );
        banner.position.set(0.35, 1.55, 0.05);
        banner.rotation.y = -Math.PI / 4;
        group.add(banner);
      } else {
        // Low stone curb chunk
        const curb = new THREE.Mesh(
          new THREE.BoxGeometry(0.9, 0.45, 0.4),
          this.rockMat,
        );
        curb.position.set(0.55, 0.22, 0.1);
        curb.castShadow = true;
        group.add(curb);
      }

      this.root.add(group);
      this.obstacles.push({ x, z, radius: 0.35 });
    }
  }

  /** Market district welcome sign — soft collision + E flavor interact. */
  private addMarketDistrictSign(x: number, z: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = (-Math.PI * 3) / 4;
    group.name = 'MarketDistrictSign';

    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.12, 2.5, 6),
      this.woodDarkMat,
    );
    post.position.y = 1.25;
    post.castShadow = true;
    group.add(post);

    const board = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.7, 0.1), this.signBoardMat);
    board.position.set(0, 2.15, 0.05);
    board.castShadow = true;
    group.add(board);

    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(1.35, 0.1, 0.12),
      this.bannerTrimMat,
    );
    stripe.position.set(0, 2.35, 0.1);
    group.add(stripe);

    const trim = new THREE.Mesh(
      new THREE.BoxGeometry(1.35, 0.08, 0.12),
      this.bannerMat,
    );
    trim.position.set(0, 1.95, 0.1);
    group.add(trim);

    this.root.add(group);
    this.obstacles.push({ x, z, radius: 0.4 });
  }

  /** Procedural KayKit-cottage stand-in for a market shop (pack-swapped later). */
  private addMarketShop(x: number, z: number, scale: number, yaw: number): void {
    this.shopPlacements.push({ x, z, scale, yaw });
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = yaw;
    group.scale.setScalar(scale);
    group.userData.proceduralProp = true;
    group.name = 'MarketShopStandIn';

    const walls = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.65, 2.15), this.rockLightMat);
    walls.position.y = 0.82;
    walls.castShadow = true;
    walls.receiveShadow = true;
    group.add(walls);

    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.0, 1.25, 4), this.roofMat);
    roof.position.y = 2.2;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    group.add(roof);

    const awning = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 0.08, 0.85),
      this.bannerMat,
    );
    awning.position.set(0, 1.45, 1.35);
    awning.rotation.x = -0.35;
    awning.castShadow = true;
    group.add(awning);

    const door = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.85, 0.1), this.woodDarkMat);
    door.position.set(0, 0.45, 1.1);
    group.add(door);

    const window = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.4, 0.08), this.pondMat);
    window.position.set(-0.7, 1.05, 1.08);
    group.add(window);

    this.root.add(group);
    this.obstacles.push({ x, z, radius: 1.6 });
  }

  /** Stylized market stall with cloth awning — permanent (not pack-swapped). */
  private addMarketStall(x: number, z: number, yaw: number, awningColor: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = yaw;
    group.name = 'MarketStall';

    const counter = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.7, 0.95), this.woodMat);
    counter.position.y = 0.45;
    counter.castShadow = true;
    counter.receiveShadow = true;
    group.add(counter);

    const shelf = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.12, 0.7), this.woodDarkMat);
    shelf.position.y = 0.88;
    shelf.castShadow = true;
    group.add(shelf);

    for (const px of [-0.95, 0.95]) {
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.07, 2.1, 5),
        this.woodDarkMat,
      );
      pole.position.set(px, 1.4, 0.15);
      pole.castShadow = true;
      group.add(pole);
    }

    const awningMat = createToonMaterial(awningColor, {
      emissive: awningColor,
      emissiveIntensity: 0.1,
      side: THREE.DoubleSide,
    });
    const awning = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 1.5), awningMat);
    awning.position.set(0, 2.35, 0.1);
    awning.rotation.x = -0.22;
    awning.castShadow = true;
    group.add(awning);

    // Goods silhouettes on the counter
    for (let i = 0; i < 3; i++) {
      const goods = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.22 + i * 0.05, 0.28),
        i % 2 === 0 ? this.rockLightMat : this.bannerTrimMat,
      );
      goods.position.set(-0.55 + i * 0.55, 1.05, 0.05);
      goods.castShadow = true;
      group.add(goods);
    }

    this.root.add(group);
    this.obstacles.push({ x, z, radius: 1.15 });
  }

  /** Small crate stack prop beside stalls. */
  private addMarketCrates(x: number, z: number, yaw: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = yaw;
    group.name = 'MarketCrates';

    const base = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.55, 0.7), this.woodMat);
    base.position.y = 0.28;
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    const top = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.45, 0.55), this.woodDarkMat);
    top.position.set(0.08, 0.78, -0.05);
    top.rotation.y = 0.25;
    top.castShadow = true;
    group.add(top);

    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.3, 0.55, 8),
      this.woodMat,
    );
    barrel.position.set(-0.55, 0.28, 0.35);
    barrel.castShadow = true;
    group.add(barrel);

    this.root.add(group);
    this.obstacles.push({ x, z, radius: 0.65 });
  }

  /** Banner pole dressing for the market street. */
  private addMarketBannerPost(x: number, z: number, tilt: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.1, 2.8, 5),
      this.woodDarkMat,
    );
    post.position.y = 1.4;
    post.rotation.z = tilt;
    post.castShadow = true;
    group.add(post);

    const banner = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 1.35), this.bannerMat);
    banner.position.set(0.45, 1.85, 0.05);
    banner.castShadow = true;
    group.add(banner);

    const stripe = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.12),
      this.bannerTrimMat,
    );
    stripe.position.set(0.45, 2.15, 0.06);
    group.add(stripe);

    this.root.add(group);
    this.obstacles.push({ x, z, radius: 0.35 });
  }

  /**
   * Low curtain walls + corner towers around parts of the market rim.
   * Matches the city-gate flanking-wall style; does not fully box the district —
   * SW gate approach and far NE street exits stay open.
   */
  private buildMarketPerimeterWalls(): void {
    // Yaw ≈ tangent to the rim (wall length runs along the curtain).
    // West / NW chain — links toward the gate's NW flank, outside shop A pack radius.
    this.addMarketWallTower(41.6, 47.8, true);
    this.addMarketWallSegment(41.4, 50.2, 0.05, 2.6);
    this.addMarketWallSegment(41.6, 52.8, -0.08, 2.5);
    this.addMarketWallTower(42.2, 55.4, false);
    this.addMarketWallSegment(43.6, 57.6, -0.55, 2.4);
    this.addMarketWallSegment(46.0, 61.2, -0.85, 2.5);
    // Sit outside shop A + blacksmith pack radii so no thin softlock pocket forms.
    this.addMarketWallTower(48.0, 63.5, true);

    // Short north stubs near the blacksmith — stop before the open NE exit.
    this.addMarketWallSegment(51.4, 62.6, -1.2, 2.3);
    this.addMarketWallSegment(54.2, 62.2, -1.45, 2.2);

    // South / SE chain — links toward the gate's SE flank, outside the inn footprint.
    this.addMarketWallTower(46.8, 41.2, false);
    this.addMarketWallSegment(49.4, 40.4, 1.45, 2.5);
    this.addMarketWallSegment(52.4, 40.2, 1.55, 2.5);
    this.addMarketWallTower(55.4, 41.0, true);
    this.addMarketWallSegment(57.8, 42.4, 1.85, 2.4);
    this.addMarketWallSegment(60.2, 44.6, 2.05, 2.3);
    this.addMarketWallTower(61.6, 47.2, false);

    // Light east accent only — leave the far NE approach open for later districts.
    this.addMarketWallSegment(62.4, 50.6, 2.35, 2.2);
  }

  /** Low stone curtain segment — same language as the gate flank walls. */
  private addMarketWallSegment(x: number, z: number, yaw: number, length: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = yaw;
    group.name = 'MarketWallSegment';

    const h = 1.45;
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(length, h, 0.52),
      this.rockMat,
    );
    wall.position.y = h * 0.5;
    wall.castShadow = true;
    wall.receiveShadow = true;
    group.add(wall);

    const coping = new THREE.Mesh(
      new THREE.BoxGeometry(length + 0.12, 0.2, 0.62),
      this.cliffMat,
    );
    coping.position.y = h + 0.08;
    coping.castShadow = true;
    group.add(coping);

    // Occasional merlon nubs for curtain-wall silhouette (readable at iso distance).
    for (const ox of [-length * 0.28, length * 0.28]) {
      const merlon = new THREE.Mesh(
        new THREE.BoxGeometry(0.32, 0.28, 0.48),
        this.rockLightMat,
      );
      merlon.position.set(ox, h + 0.28, 0);
      merlon.castShadow = true;
      group.add(merlon);
    }

    this.root.add(group);
    // Soft capsule along the segment — keep radii modest so street lanes stay clear.
    this.obstacles.push({ x, z, radius: Math.min(1.05, 0.45 + length * 0.14) });
  }

  /** Corner / interval tower post — taller than curtain, optional wall banner. */
  private addMarketWallTower(x: number, z: number, withBanner: boolean): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.name = 'MarketWallTower';

    const towerH = 3.35;
    const shaft = new THREE.Mesh(
      new THREE.BoxGeometry(1.05, towerH, 1.05),
      this.rockLightMat,
    );
    shaft.position.y = towerH * 0.5;
    shaft.castShadow = true;
    shaft.receiveShadow = true;
    group.add(shaft);

    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(1.3, 0.28, 1.3),
      this.cliffMat,
    );
    cap.position.y = towerH + 0.1;
    cap.castShadow = true;
    group.add(cap);

    const finial = new THREE.Mesh(
      new THREE.ConeGeometry(0.22, 0.45, 5),
      this.bannerTrimMat,
    );
    finial.position.y = towerH + 0.48;
    finial.castShadow = true;
    group.add(finial);

    if (withBanner) {
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.07, 2.4, 5),
        this.woodDarkMat,
      );
      pole.position.set(0.7, towerH - 0.2, 0.15);
      pole.castShadow = true;
      group.add(pole);
      const banner = new THREE.Mesh(
        new THREE.PlaneGeometry(0.7, 1.25),
        this.bannerMat,
      );
      banner.position.set(0.7, towerH - 0.75, 0.45);
      banner.castShadow = true;
      group.add(banner);
      const stripe = new THREE.Mesh(
        new THREE.PlaneGeometry(0.48, 0.11),
        this.bannerTrimMat,
      );
      stripe.position.set(0.7, towerH - 0.45, 0.46);
      group.add(stripe);
    }

    this.root.add(group);
    this.obstacles.push({ x, z, radius: 0.7 });
  }

  /**
   * Short west-rim side alley off the plaza — narrow cobble lane between the
   * curtain wall and crate/barrel stacks. Walkable from iso; E flavor at the bend.
   */
  private buildMarketSideAlley(): void {
    const ax = MARKET_ALLEY_SPOT.x;
    const az = MARKET_ALLEY_SPOT.z;

    // Cobble ribbon — plaza → west toward the curtain (readable from iso cam).
    const pathMat = createToonMaterial(Palette.pathDark);
    const cobbleMat = createToonMaterial(Palette.rock);
    const pathYaw = -0.15;
    const path = new THREE.Group();
    path.position.set(ax + 1.4, 0, az - 0.15);
    path.rotation.y = pathYaw;
    path.name = 'MarketAlleyPath';

    const ribbon = new THREE.Mesh(
      new THREE.BoxGeometry(5.2, 0.05, 2.15),
      pathMat,
    );
    ribbon.position.y = 0.045;
    ribbon.receiveShadow = true;
    path.add(ribbon);

    const edge = new THREE.Mesh(
      new THREE.BoxGeometry(5.35, 0.03, 2.35),
      cobbleMat,
    );
    edge.position.y = 0.03;
    edge.receiveShadow = true;
    path.add(edge);

    this.root.add(path);

    // North flank — crates / barrels (soft blockers; leave center lane open).
    this.addMarketCrates(45.8, 53.55, 0.35);
    this.addMarketCrates(44.2, 53.7, -0.2);
    this.addMarketCrates(42.9, 53.35, 0.55);

    // South flank — barrel stack + spare crate (mirrors inn-yard dressing).
    this.addMarketAlleyBarrels(45.4, 51.05, 0.1);
    this.addMarketAlleyBarrels(43.5, 51.15, -0.4);
    this.addMarketCrates(42.4, 51.35, 0.25);

    // Dead-end notice board at the alley bend (E interact via MarketAlley).
    this.addMarketAlleySign(ax, az);
  }

  /** Compact barrel cluster for alley flanks (smaller footprint than crate stacks). */
  private addMarketAlleyBarrels(x: number, z: number, yaw: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = yaw;
    group.name = 'MarketAlleyBarrels';

    for (const [bx, by, bz, s] of [
      [0, 0.28, 0, 1],
      [0.45, 0.24, 0.15, 0.88],
      [0.2, 0.68, 0.05, 0.72],
    ] as const) {
      const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.26 * s, 0.28 * s, 0.52 * s, 8),
        s > 0.9 ? this.woodMat : this.woodDarkMat,
      );
      barrel.position.set(bx, by, bz);
      barrel.castShadow = true;
      barrel.receiveShadow = true;
      group.add(barrel);
    }

    this.root.add(group);
    this.obstacles.push({ x, z, radius: 0.55 });
  }

  /** Small alley notice board — soft collision + E flavor interact. */
  private addMarketAlleySign(x: number, z: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = Math.PI * 0.55;
    group.name = 'MarketAlleySign';

    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.1, 2.1, 5),
      this.woodDarkMat,
    );
    post.position.y = 1.05;
    post.castShadow = true;
    group.add(post);

    const board = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.55, 0.08), this.signBoardMat);
    board.position.set(0, 1.75, 0.04);
    board.castShadow = true;
    group.add(board);

    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.08, 0.1),
      this.bannerMat,
    );
    stripe.position.set(0, 1.9, 0.08);
    group.add(stripe);

    this.root.add(group);
    this.obstacles.push({ x, z, radius: 0.35 });
  }

  /** Procedural well stand-in at the market plaza (replaced by KayKit well). */
  private addMarketWellStandIn(x: number, z: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.userData.proceduralProp = true;
    group.name = 'MarketWellStandIn';

    const basin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.85, 0.7, 10),
      this.rockMat,
    );
    basin.position.y = 0.35;
    basin.castShadow = true;
    basin.receiveShadow = true;
    group.add(basin);

    const water = new THREE.Mesh(new THREE.CircleGeometry(0.5, 12), this.pondMat);
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.62;
    group.add(water);

    const postL = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.07, 1.4, 5),
      this.woodDarkMat,
    );
    postL.position.set(-0.45, 1.1, 0);
    postL.castShadow = true;
    group.add(postL);
    const postR = postL.clone();
    postR.position.x = 0.45;
    group.add(postR);

    const beam = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.12, 0.12), this.woodMat);
    beam.position.y = 1.75;
    group.add(beam);

    this.root.add(group);
    this.obstacles.push({ x, z, radius: 0.55 });
  }

  /**
   * Stylized market fountain at plaza center — KayKit-friendly toon basin + spout.
   * Soft collision blocks walking through; lanes around the cobble stay open.
   */
  private addMarketFountain(x: number, z: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.name = 'MarketFountain';

    const plinth = new THREE.Mesh(
      new THREE.CylinderGeometry(1.55, 1.7, 0.28, 12),
      this.rockMat,
    );
    plinth.position.y = 0.14;
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    group.add(plinth);

    const basin = new THREE.Mesh(
      new THREE.CylinderGeometry(1.25, 1.4, 0.55, 12),
      this.rockLightMat,
    );
    basin.position.y = 0.5;
    basin.castShadow = true;
    basin.receiveShadow = true;
    group.add(basin);

    const lip = new THREE.Mesh(
      new THREE.TorusGeometry(1.18, 0.12, 6, 16),
      this.cliffMat,
    );
    lip.rotation.x = Math.PI / 2;
    lip.position.y = 0.78;
    lip.castShadow = true;
    group.add(lip);

    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.42, 0.95, 8),
      this.rockShadowMat,
    );
    pedestal.position.y = 0.95;
    pedestal.castShadow = true;
    group.add(pedestal);

    const bowl = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.4, 0.22, 10),
      this.rockLightMat,
    );
    bowl.position.y = 1.5;
    bowl.castShadow = true;
    group.add(bowl);

    const waterMat = createToonMaterial(Palette.pond, {
      emissive: Palette.flowerCyan,
      emissiveIntensity: 0.35,
      transparent: true,
      opacity: 0.88,
    });
    const pool = new THREE.Mesh(new THREE.CircleGeometry(1.0, 18), waterMat);
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = 0.72;
    group.add(pool);

    const spoutMat = createToonMaterial(Palette.flowerCyan, {
      emissive: Palette.flowerCyan,
      emissiveIntensity: 0.7,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
    });
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.18, 0.85, 8), spoutMat);
    spout.position.y = 1.95;
    group.add(spout);

    const sparkleMat = createToonMaterial(Palette.flowerWhite, {
      emissive: Palette.flowerCyan,
      emissiveIntensity: 1.1,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    for (let i = 0; i < 6; i++) {
      const spark = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.06 + (i % 3) * 0.015, 0),
        sparkleMat.clone(),
      );
      spark.userData.phase = (i / 6) * Math.PI * 2;
      spark.userData.radius = 0.45 + (i % 3) * 0.12;
      this.marketFountainSparkles.push(spark);
      group.add(spark);
    }

    // Gold trim ring — market-readable accent vs the ruins healing spring
    const trim = new THREE.Mesh(
      new THREE.TorusGeometry(0.5, 0.05, 5, 14),
      this.bannerTrimMat,
    );
    trim.rotation.x = Math.PI / 2;
    trim.position.y = 1.58;
    group.add(trim);

    this.root.add(group);
    this.obstacles.push({ x, z, radius: 1.25 });
  }

  /** Procedural KayKit-cottage stand-in for the blacksmith workshop (pack-swapped). */
  private addMarketBlacksmith(x: number, z: number, scale: number, yaw: number): void {
    this.blacksmithPlacement = { x, z, scale, yaw };
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = yaw;
    group.scale.setScalar(scale);
    group.userData.proceduralProp = true;
    group.name = 'MarketBlacksmithStandIn';

    const walls = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.75, 2.3), this.rockShadowMat);
    walls.position.y = 0.88;
    walls.castShadow = true;
    walls.receiveShadow = true;
    group.add(walls);

    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.15, 1.35, 4), this.roofMat);
    roof.position.y = 2.35;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    group.add(roof);

    // Wide open workshop mouth (reads as forge bay)
    const bay = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.15, 0.12), this.woodDarkMat);
    bay.position.set(0, 0.7, 1.2);
    group.add(bay);

    const chimney = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 1.1, 0.45),
      this.cliffMat,
    );
    chimney.position.set(-0.7, 2.55, -0.35);
    chimney.castShadow = true;
    group.add(chimney);

    const soot = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.12, 0.55),
      this.rockShadowMat,
    );
    soot.position.set(-0.7, 3.15, -0.35);
    group.add(soot);

    const emberGlow = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.35, 0.08),
      createToonMaterial(Palette.roofTile, {
        emissive: Palette.roofTile,
        emissiveIntensity: 0.55,
      }),
    );
    emberGlow.position.set(0.15, 0.55, 1.28);
    group.add(emberGlow);

    this.root.add(group);
    this.obstacles.push({ x, z, radius: 1.6 });
  }

  /**
   * Open forge / anvil yard in front of the blacksmith — landmark props + light VFX.
   * Soft collisions leave a walk ring; E interact uses MARKET_FORGE_SPOT.
   */
  private addMarketForgeYard(x: number, z: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.name = 'MarketForgeYard';

    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(1.55, 1.65, 0.12, 10),
      this.rockShadowMat,
    );
    pad.position.y = 0.06;
    pad.receiveShadow = true;
    group.add(pad);

    // Stone forge hearth
    const hearth = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.7, 0.95), this.cliffMat);
    hearth.position.set(-0.35, 0.4, -0.15);
    hearth.castShadow = true;
    hearth.receiveShadow = true;
    group.add(hearth);

    const fireMat = createToonMaterial(Palette.roofTile, {
      emissive: 0xff6a20,
      emissiveIntensity: 0.95,
    });
    const coals = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.55), fireMat);
    coals.position.set(-0.35, 0.82, -0.15);
    group.add(coals);

    const hood = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.55, 0.7, 6),
      this.rockMat,
    );
    hood.position.set(-0.35, 1.25, -0.15);
    hood.castShadow = true;
    group.add(hood);

    // Anvil silhouette (readable at iso distance)
    const anvilBase = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.35, 0.4),
      this.rockShadowMat,
    );
    anvilBase.position.set(0.75, 0.35, 0.2);
    anvilBase.castShadow = true;
    group.add(anvilBase);

    const anvilTop = new THREE.Mesh(
      new THREE.BoxGeometry(0.85, 0.22, 0.32),
      createToonMaterial(0x6a7270, {
        emissive: 0x3a4040,
        emissiveIntensity: 0.15,
      }),
    );
    anvilTop.position.set(0.75, 0.62, 0.2);
    anvilTop.castShadow = true;
    group.add(anvilTop);

    const horn = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.14, 0.16),
      this.rockShadowMat,
    );
    horn.position.set(1.25, 0.62, 0.2);
    group.add(horn);

    // Weapon rack + barrel dressing
    const rack = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 1.1, 0.7),
      this.woodDarkMat,
    );
    rack.position.set(0.15, 0.7, -0.85);
    rack.castShadow = true;
    group.add(rack);
    for (let i = 0; i < 3; i++) {
      const blade = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.7, 0.1),
        this.bannerTrimMat,
      );
      blade.position.set(0.22, 0.75, -1.05 + i * 0.22);
      blade.rotation.z = -0.35;
      group.add(blade);
    }

    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.3, 0.55, 8),
      this.woodMat,
    );
    barrel.position.set(-0.95, 0.28, 0.65);
    barrel.castShadow = true;
    group.add(barrel);

    // Soft ember light + rising smoke puffs (animated in updateMarketAmbience)
    const light = new THREE.PointLight(0xff7a30, 0.85, 7.5, 2);
    light.position.set(-0.35, 1.15, -0.1);
    group.add(light);
    this.marketForgeLight = light;

    const smokeMat = createToonMaterial(0xb0b0b0, {
      transparent: true,
      opacity: 0.28,
      emissive: 0x666666,
      emissiveIntensity: 0.12,
      depthWrite: false,
    });
    for (let i = 0; i < 4; i++) {
      const puff = new THREE.Mesh(
        new THREE.SphereGeometry(0.22 + i * 0.04, 8, 6),
        smokeMat.clone(),
      );
      puff.position.set(-0.35 + (i % 2) * 0.08, 1.4 + i * 0.25, -0.15);
      puff.userData.phase = i * 0.9;
      puff.userData.baseX = puff.position.x;
      puff.userData.baseY = puff.position.y;
      puff.userData.baseZ = puff.position.z;
      this.marketForgeSmoke.push(puff);
      group.add(puff);
    }

    // Ember flecks
    const emberMat = createToonMaterial(0xffaa44, {
      emissive: 0xff6622,
      emissiveIntensity: 1.2,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    for (let i = 0; i < 5; i++) {
      const ember = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.04, 0),
        emberMat.clone(),
      );
      ember.position.set(
        -0.55 + (i % 3) * 0.18,
        0.95 + (i % 2) * 0.15,
        -0.35 + (i % 2) * 0.2,
      );
      ember.userData.phase = i * 1.2;
      ember.userData.baseX = ember.position.x;
      ember.userData.baseY = ember.position.y;
      ember.userData.baseZ = ember.position.z;
      this.marketForgeEmbers.push(ember);
      group.add(ember);
    }

    this.root.add(group);
    // Soft blockers — hearth / anvil only; walk ring around the yard stays open
    this.obstacles.push({ x: x - 0.35, z: z - 0.15, radius: 0.7 });
    this.obstacles.push({ x: x + 0.75, z: z + 0.2, radius: 0.45 });
  }

  /** Procedural KayKit-cottage stand-in for the market inn / tavern (pack-swapped). */
  private addMarketInn(x: number, z: number, scale: number, yaw: number): void {
    this.innPlacement = { x, z, scale, yaw };
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = yaw;
    group.scale.setScalar(scale);
    group.userData.proceduralProp = true;
    group.name = 'MarketInnStandIn';

    const walls = new THREE.Mesh(new THREE.BoxGeometry(2.7, 1.85, 2.35), this.rockLightMat);
    walls.position.y = 0.92;
    walls.castShadow = true;
    walls.receiveShadow = true;
    group.add(walls);

    // Warm timber band — reads as tavern vs soot-dark blacksmith
    const timber = new THREE.Mesh(
      new THREE.BoxGeometry(2.75, 0.22, 2.4),
      this.woodMat,
    );
    timber.position.y = 1.55;
    timber.castShadow = true;
    group.add(timber);

    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.2, 1.4, 4), this.roofMat);
    roof.position.y = 2.45;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    group.add(roof);

    const door = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.95, 0.1), this.woodDarkMat);
    door.position.set(0, 0.5, 1.2);
    group.add(door);

    // Warm lit windows (inn silhouette vs blacksmith ember bay)
    const warmGlass = createToonMaterial(Palette.flowerYellow, {
      emissive: 0xffaa44,
      emissiveIntensity: 0.75,
    });
    for (const px of [-0.75, 0.75]) {
      const window = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.38, 0.08), warmGlass);
      window.position.set(px, 1.1, 1.18);
      group.add(window);
    }

    // Hanging inn sign board
    const signArm = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.08, 0.7),
      this.woodDarkMat,
    );
    signArm.position.set(1.15, 1.7, 0.9);
    group.add(signArm);
    const signBoard = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.45, 0.06),
      this.signBoardMat,
    );
    signBoard.position.set(1.15, 1.45, 1.2);
    signBoard.castShadow = true;
    group.add(signBoard);
    const signTrim = new THREE.Mesh(
      new THREE.BoxGeometry(0.48, 0.08, 0.07),
      this.bannerTrimMat,
    );
    signTrim.position.set(1.15, 1.6, 1.22);
    group.add(signTrim);

    this.root.add(group);
    this.obstacles.push({ x, z, radius: 1.6 });
  }

  /**
   * Outdoor tables / barrels / lanterns in front of the inn — porch toward the plaza.
   * Soft collisions leave the door lane open; E interact uses MARKET_INN_DOOR.
   */
  private addMarketInnYard(innX: number, innZ: number): void {
    // Yard sits toward the fountain / door pad (north-northeast of the cottage).
    const x = innX + 1.0;
    const z = innZ + 3.6;
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.name = 'MarketInnYard';

    const porch = new THREE.Mesh(
      new THREE.CylinderGeometry(1.7, 1.8, 0.1, 10),
      this.woodMat,
    );
    porch.position.y = 0.05;
    porch.receiveShadow = true;
    group.add(porch);

    // Round table + stools
    const table = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.58, 0.12, 8),
      this.woodDarkMat,
    );
    table.position.set(-0.55, 0.55, 0.15);
    table.castShadow = true;
    group.add(table);
    const tableLeg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.1, 0.5, 6),
      this.woodMat,
    );
    tableLeg.position.set(-0.55, 0.28, 0.15);
    tableLeg.castShadow = true;
    group.add(tableLeg);
    for (const [sx, sz] of [
      [-0.95, 0.55],
      [-0.15, 0.55],
      [-0.55, -0.35],
    ] as const) {
      const stool = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.2, 0.35, 6),
        this.woodMat,
      );
      stool.position.set(sx, 0.22, sz);
      stool.castShadow = true;
      group.add(stool);
    }

    // Barrel stack — tavern dressing
    for (const [bx, by, bz, s] of [
      [0.75, 0.28, 0.55, 1],
      [1.15, 0.22, 0.25, 0.85],
      [0.95, 0.7, 0.4, 0.75],
    ] as const) {
      const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.26 * s, 0.28 * s, 0.52 * s, 8),
        this.woodMat,
      );
      barrel.position.set(bx, by, bz);
      barrel.castShadow = true;
      group.add(barrel);
    }

    // Evening lantern posts (warm point lights)
    const lanternMat = createToonMaterial(Palette.flowerYellow, {
      emissive: 0xffaa44,
      emissiveIntensity: 0.95,
    });
    for (const [lx, lz] of [
      [-1.25, -0.85],
      [1.35, -0.55],
    ] as const) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.07, 1.35, 5),
        this.woodDarkMat,
      );
      post.position.set(lx, 0.7, lz);
      post.castShadow = true;
      group.add(post);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 5), lanternMat);
      lamp.position.set(lx, 1.45, lz);
      group.add(lamp);
      const light = new THREE.PointLight(0xffb060, 0.55, 5.5, 2);
      light.position.set(lx, 1.5, lz);
      group.add(light);
    }

    this.root.add(group);
    // Soft blockers — table / barrels only; door approach stays walkable
    this.obstacles.push({ x: x - 0.55, z: z + 0.15, radius: 0.55 });
    this.obstacles.push({ x: x + 0.95, z: z + 0.4, radius: 0.55 });
  }

  /** Idle fountain sparkles + forge smoke / ember flicker for the market landmarks. */
  updateMarketAmbience(dt: number): void {
    this.marketAmbienceT += dt;
    const t = this.marketAmbienceT;

    for (let i = 0; i < this.marketFountainSparkles.length; i++) {
      const spark = this.marketFountainSparkles[i]!;
      const phase = (spark.userData.phase as number) + t * (1.2 + (i % 3) * 0.25);
      const r = spark.userData.radius as number;
      spark.position.set(
        Math.cos(phase) * r,
        1.55 + Math.sin(phase * 1.7) * 0.35 + (i % 2) * 0.12,
        Math.sin(phase) * r,
      );
      const mat = spark.material as THREE.MeshToonMaterial;
      mat.opacity = 0.45 + 0.45 * (0.5 + 0.5 * Math.sin(phase * 2.2));
    }

    for (let i = 0; i < this.marketForgeSmoke.length; i++) {
      const puff = this.marketForgeSmoke[i]!;
      const phase = (puff.userData.phase as number) + t;
      const baseX = puff.userData.baseX as number;
      const baseY = puff.userData.baseY as number;
      const baseZ = puff.userData.baseZ as number;
      const cycle = (phase * 0.45) % 1;
      puff.position.set(
        baseX + Math.sin(phase * 0.7) * 0.12,
        baseY + cycle * 1.1,
        baseZ + Math.cos(phase * 0.55) * 0.08,
      );
      const mat = puff.material as THREE.MeshToonMaterial;
      mat.opacity = 0.32 * (1 - cycle);
      puff.scale.setScalar(0.85 + cycle * 0.7);
    }

    for (let i = 0; i < this.marketForgeEmbers.length; i++) {
      const ember = this.marketForgeEmbers[i]!;
      const phase = (ember.userData.phase as number) + t;
      const baseX = ember.userData.baseX as number;
      const baseY = ember.userData.baseY as number;
      const baseZ = ember.userData.baseZ as number;
      ember.position.set(
        baseX + Math.sin(phase * 4.2) * 0.06,
        baseY + 0.12 + Math.sin(phase * 3.5) * 0.18,
        baseZ + Math.cos(phase * 3.8) * 0.05,
      );
      const mat = ember.material as THREE.MeshToonMaterial;
      mat.opacity = 0.55 + 0.4 * Math.sin(phase * 5);
    }

    if (this.marketForgeLight) {
      this.marketForgeLight.intensity = 0.7 + 0.35 * (0.5 + 0.5 * Math.sin(t * 9.5));
    }
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
      // Was (28, 30) — moved off the NE city-gate road
      [22, 36, 1.1, 0.85],
      [-32, 32, 1.3, 0.95],
      [34, 2, 1.5, 1.1],
      [-34, 16, 1.35, 1],
    ];
    for (const [x, z, s, h] of ledges) {
      if (this.isOnNortheastBranchApproach(x, z)) continue;
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
    // Boards are built along +X; yaw the whole post for cardinal / NE branches.
    if (facing === 'west') group.rotation.y = Math.PI;
    else if (facing === 'north') group.rotation.y = -Math.PI / 2;
    else if (facing === 'south') group.rotation.y = Math.PI / 2;
    else if (facing === 'northeast') group.rotation.y = -Math.PI / 4;

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

    // Market district shops — KayKit cottages facing the cobble street.
    for (const shop of this.shopPlacements) {
      const mesh = library.createCottage(shop.x, shop.z, {
        scale: shop.scale,
        yaw: shop.yaw,
      });
      if (mesh) {
        this.root.add(mesh);
        placed += 1;
      }
    }

    // Market blacksmith workshop — same KayKit cottage piece, street-facing yaw.
    if (this.blacksmithPlacement) {
      const smith = library.createCottage(
        this.blacksmithPlacement.x,
        this.blacksmithPlacement.z,
        {
          scale: this.blacksmithPlacement.scale,
          yaw: this.blacksmithPlacement.yaw,
        },
      );
      if (smith) {
        smith.name = 'MarketBlacksmith';
        this.root.add(smith);
        placed += 1;
      }
    }

    // Market inn / tavern — KayKit cottage facing the plaza (porch props stay procedural).
    if (this.innPlacement) {
      const inn = library.createCottage(this.innPlacement.x, this.innPlacement.z, {
        scale: this.innPlacement.scale,
        yaw: this.innPlacement.yaw,
      });
      if (inn) {
        inn.name = 'MarketInn';
        this.root.add(inn);
        placed += 1;
      }
    }

    if (this.marketWellPlacement) {
      const well = library.createWell(
        this.marketWellPlacement.x,
        this.marketWellPlacement.z,
      );
      if (well) {
        this.root.add(well);
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
    for (const shop of this.shopPlacements) {
      bump(shop.x, shop.z, PROP_COLLISION_SCALE.cottage);
    }
    if (this.blacksmithPlacement) {
      bump(
        this.blacksmithPlacement.x,
        this.blacksmithPlacement.z,
        PROP_COLLISION_SCALE.cottage,
      );
    }
    if (this.innPlacement) {
      bump(this.innPlacement.x, this.innPlacement.z, PROP_COLLISION_SCALE.cottage);
    }
    if (this.marketWellPlacement) {
      bump(
        this.marketWellPlacement.x,
        this.marketWellPlacement.z,
        PROP_COLLISION_SCALE.well,
      );
    }
  }

  /** Soft bush dressing near trees / meadow rim — no collision (walk-through foliage). */
  private scatterPackBushes(library: WorldPropLibrary): void {
    const spots: Array<[number, number, number]> = [];
    // Nestle bushes beside a subset of trees (farther out — trunks are larger now).
    for (let i = 0; i < this.treePlacements.length; i += 2) {
      const t = this.treePlacements[i]!;
      const ang = hash2(t.z, t.x) * Math.PI * 2;
      const r = 2.4 + hash2(t.x, i) * 1.2;
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
      if (this.isOnNortheastBranchApproach(x, z)) continue;
      // Keep shrine / ford / gate centers open.
      if (Math.hypot(x - EastShrineClearing.x, z - EastShrineClearing.z) < 8) continue;
      if (Math.hypot(x - SouthRiverFordClearing.x, z - SouthRiverFordClearing.z) < 8) continue;
      if (Math.hypot(x - NortheastCityGate.x, z - NortheastCityGate.z) < 7) continue;
      if (
        Math.hypot(x - NortheastMarketDistrict.x, z - NortheastMarketDistrict.z) < 9
      ) {
        continue;
      }
      const bush = library.createBush(x, z, s, hash2(x, z) * 500 + i);
      if (bush) this.root.add(bush);
    }
  }

  /** True if inside main meadow, any corridor, clearing, NE gate, or market district. */
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
    const gdx = x - this.northeastGate.x;
    const gdz = z - this.northeastGate.z;
    if (gdx * gdx + gdz * gdz <= this.northeastGate.radius * this.northeastGate.radius) {
      return true;
    }
    const mdx = x - this.northeastMarket.x;
    const mdz = z - this.northeastMarket.z;
    if (
      mdx * mdx + mdz * mdz <= this.northeastMarket.radius * this.northeastMarket.radius
    ) {
      return true;
    }
    if (this.distToEastCorridor(x, z) <= this.eastCorridorHalfWidth) return true;
    if (this.distToWestCorridor(x, z) <= this.westCorridorHalfWidth) return true;
    if (this.distToNorthCorridor(x, z) <= this.northCorridorHalfWidth) return true;
    if (this.distToSouthCorridor(x, z) <= this.southCorridorHalfWidth) return true;
    if (this.distToNortheastCorridor(x, z) <= this.northeastCorridorHalfWidth) return true;
    return this.distToMarketCorridor(x, z) <= this.marketCorridorHalfWidth;
  }

  /** Keep entities inside meadow ∪ corridors ∪ clearings ∪ NE gate ∪ market. */
  clampToPlayArea(position: THREE.Vector3): void {
    if (this.isInPlayArea(position.x, position.z)) return;
    const nearest = this.nearestPlayPoint(position.x, position.z);
    position.x = nearest.x;
    position.z = nearest.z;
  }

  /** True when the player is on the NE road / under the gate (discovery toast). */
  isNearCityGate(position: THREE.Vector3): boolean {
    const dx = position.x - this.northeastGate.x;
    const dz = position.z - this.northeastGate.z;
    if (dx * dx + dz * dz <= 8 * 8) return true;
    return this.distToNortheastCorridor(position.x, position.z) <= 4.5
      && Math.hypot(position.x, position.z) > 28;
  }

  /** True when the player is in the market plaza / street (discovery toast). */
  isNearMarketDistrict(position: THREE.Vector3): boolean {
    const dx = position.x - this.northeastMarket.x;
    const dz = position.z - this.northeastMarket.z;
    if (dx * dx + dz * dz <= 9 * 9) return true;
    return this.distToMarketCorridor(position.x, position.z) <= 4.2;
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

  /** Keep props off the northeast dirt/stone road into the city gate + market. */
  private isOnNortheastBranchApproach(x: number, z: number): boolean {
    if (x < 10 || z < 10) return false;
    // Wide cone along +X/+Z so the tree ring does not choke the NE exit / market street.
    if (x > 22 && z > 22 && Math.abs(x - z) < 12) return true;
    if (this.distToNortheastCorridor(x, z) < this.northeastCorridorHalfWidth + 1.6) {
      return true;
    }
    if (this.distToMarketCorridor(x, z) < this.marketCorridorHalfWidth + 1.4) {
      return true;
    }
    return meadowPathInfluence(x, z) > 0.35 && x > 14 && z > 14;
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

  /** Distance from point to the NE corridor segment (main rim → city gate). */
  private distToNortheastCorridor(x: number, z: number): number {
    const ax = 30;
    const az = 30;
    // Stop short of the gate center so the plaza circle owns the end.
    const bx = this.northeastGate.x - 2.2;
    const bz = this.northeastGate.z - 2.2;
    return this.distToSegment(x, z, ax, az, bx, bz);
  }

  /** Distance from point to the market corridor segment (gate → market plaza). */
  private distToMarketCorridor(x: number, z: number): number {
    const ax = this.northeastGate.x + 2.0;
    const az = this.northeastGate.z + 2.0;
    const bx = this.northeastMarket.x - 1.5;
    const bz = this.northeastMarket.z - 1.5;
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

    // NE city-gate plaza rim
    {
      const dx = x - this.northeastGate.x;
      const dz = z - this.northeastGate.z;
      const d = Math.hypot(dx, dz) || 1;
      consider(
        this.northeastGate.x + (dx / d) * this.northeastGate.radius,
        this.northeastGate.z + (dz / d) * this.northeastGate.radius,
      );
    }

    // Market district rim
    {
      const dx = x - this.northeastMarket.x;
      const dz = z - this.northeastMarket.z;
      const d = Math.hypot(dx, dz) || 1;
      consider(
        this.northeastMarket.x + (dx / d) * this.northeastMarket.radius,
        this.northeastMarket.z + (dz / d) * this.northeastMarket.radius,
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

    // NE city-gate corridor capsule surface
    this.considerCorridorSurface(
      x,
      z,
      30,
      30,
      this.northeastGate.x - 2.2,
      this.northeastGate.z - 2.2,
      this.northeastCorridorHalfWidth,
      consider,
    );

    // Gate → market corridor capsule surface
    this.considerCorridorSurface(
      x,
      z,
      this.northeastGate.x + 2.0,
      this.northeastGate.z + 2.0,
      this.northeastMarket.x - 1.5,
      this.northeastMarket.z - 1.5,
      this.marketCorridorHalfWidth,
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
