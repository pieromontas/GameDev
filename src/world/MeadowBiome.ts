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
  NortheastResidentialStreet,
  NortheastHarborDocks,
  NortheastCastleGatehouse,
  NortheastCastleKeep,
  hash2,
} from '../render/stylized';
import { addDynamicPointLight } from '../render/deviceQuality';
import type { WorldPropLibrary } from './WorldPropLibrary';
import {
  PROP_COLLISION_SCALE,
  TREE_TRUNK_RADIUS,
  WELL_OFFSET,
} from './WorldPropLibrary';
import {
  MARKET_ALLEY_SPOT,
  MARKET_BLACKSMITH_SPOT,
  MARKET_EXTRA_STALL,
  MARKET_EXTRA_STALL_YAW,
  MARKET_FORGE_SPOT,
  MARKET_FOUNTAIN_SPOT,
  MARKET_INN_SPOT,
  MARKET_NOTICE_BOARD_SPOT,
  MARKET_NOTICE_BOARD_YAW,
  MARKET_PLAZA_LANTERNS,
  MARKET_SIGN_SPOT,
  MARKET_WAGON_SPOT,
  MARKET_WAGON_YAW,
} from './MarketDistrict';
import {
  MARKET_VENDOR_NPC,
  MARKET_VENDOR_STALL,
} from './MarketStreetVendor';
import { GATE_GUARD_NPC, GATE_GUARD_YAW } from './GateGuard';
import {
  RESIDENTIAL_CHAPEL_DOOR,
  RESIDENTIAL_CHAPEL_SPOT,
  RESIDENTIAL_DOOR_SPOT,
  RESIDENTIAL_GARDEN_SPOT,
  RESIDENTIAL_HOME_SPOTS,
  RESIDENTIAL_STREET_FENCES,
  RESIDENTIAL_STREET_LANTERNS,
  RESIDENTIAL_WELL_SPOT,
} from './ResidentialStreet';
import { HARBOR_CATCH_SIGN } from './HarborDocks';
import {
  CASTLE_BANNER_POSTS,
  CASTLE_BRAZIER_SPOTS,
  CASTLE_KNIGHT_CAPTAIN,
  CASTLE_KNIGHT_CAPTAIN_YAW,
  CASTLE_ARMORY_SPOT,
  CASTLE_CHEST_SPOT,
} from './CastleDistrict';

export type Obstacle = { x: number; z: number; radius: number };

type PropPlacement = { x: number; z: number; scale: number };

/** KayKit cottage reused as a market shop facade (pack-swapped like the NW cottage). */
type ShopPlacement = { x: number; z: number; scale: number; yaw: number };

type SignFacing = 'east' | 'west' | 'north' | 'south' | 'northeast';

/** Shared stylized meadow: living ground, tiered trees, rocks, landmarks. */
export class MeadowBiome {
  readonly root = new THREE.Group();
  /** Larger disk so clearings + NE gate / market / homes / docks / castle sit on painted ground. */
  readonly groundSize = 220;
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
  /** Eighth playable stub — residential street past the market’s open NE exit. */
  readonly northeastHomes = NortheastResidentialStreet;
  /** Soft corridor half-width connecting market plaza → residential street. */
  readonly residentialCorridorHalfWidth = 5.5;
  /** Ninth playable stub — harbor / docks past the market’s open SE exit. */
  readonly northeastDocks = NortheastHarborDocks;
  /** Soft corridor half-width connecting market plaza → harbor docks. */
  readonly docksCorridorHalfWidth = 5.5;
  /** Tenth playable stub — outer barbican / castle gatehouse. */
  readonly northeastCastleGatehouse = NortheastCastleGatehouse;
  /** Eleventh playable district — royal castle keep and courtyard. */
  readonly northeastCastle = NortheastCastleKeep;
  /** Soft corridor half-width connecting residential street → castle gatehouse → castle keep. */
  readonly castleCorridorHalfWidth = 6.0;
  /** World XZ of the city gate arch (for minimap / discovery cues). */
  readonly cityGatePosition = new THREE.Vector3(NortheastCityGate.x, 0, NortheastCityGate.z);
  /** World XZ of the market plaza center (for minimap / discovery cues). */
  readonly marketPosition = new THREE.Vector3(
    NortheastMarketDistrict.x,
    0,
    NortheastMarketDistrict.z,
  );
  /** World XZ of the residential street pocket (for minimap / discovery cues). */
  readonly residentialPosition = new THREE.Vector3(
    NortheastResidentialStreet.x,
    0,
    NortheastResidentialStreet.z,
  );
  /** World XZ of the harbor / docks pocket (for minimap / discovery cues). */
  readonly docksPosition = new THREE.Vector3(
    NortheastHarborDocks.x,
    0,
    NortheastHarborDocks.z,
  );
  /** World XZ of the castle gatehouse (for minimap / discovery cues). */
  readonly castleGatehousePosition = new THREE.Vector3(
    NortheastCastleGatehouse.x,
    0,
    NortheastCastleGatehouse.z,
  );
  /** World XZ of the castle keep center (for minimap / discovery cues). */
  readonly castlePosition = new THREE.Vector3(
    NortheastCastleKeep.x,
    0,
    NortheastCastleKeep.z,
  );
  /** Solid props used for soft collision (trees + rocks + landmarks). */
  readonly obstacles: Obstacle[] = [];
  /**
   * Tree / bush roots tagged for camera→hero foliage fade (not buildings / ground).
   * Populated by procedural trees, then rebuilt when the KayKit pack swaps in.
   */
  private readonly foliageOccluders: THREE.Object3D[] = [];

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
  /** Residential street KayKit cottage homes (pack-swapped). */
  private readonly homePlacements: ShopPlacement[] = [];
  /** Residential town chapel / KayKit church (pack-swapped; porch props stay procedural). */
  private chapelPlacement: ShopPlacement | null = null;
  private residentialWellPlacement: { x: number; z: number } | null = null;
  private packApplied = false;

  /** Idle fountain / forge VFX driven by `updateMarketAmbience`. */
  private marketAmbienceT = 0;
  private readonly marketFountainSparkles: THREE.Mesh[] = [];
  private readonly marketForgeSmoke: THREE.Mesh[] = [];
  private readonly marketForgeEmbers: THREE.Mesh[] = [];
  private marketForgeLight: THREE.PointLight | null = null;
  /** Gate sentry mesh — idle sway + slight head-track toward nearby players. */
  private gateGuardGroup: THREE.Group | null = null;
  private gateGuardHead: THREE.Object3D | null = null;
  private gateGuardBaseYaw = 0;
  private gateGuardIdleT = 0;
  /** City-gate cloth pivots — wind sine in `updateGateBanners` (no collision). */
  private readonly gateBannerPivots: THREE.Group[] = [];
  private gateBannerT = 0;

  /** Castle banners, braziers, and Knight Captain state. */
  private readonly castleBannerPivots: THREE.Group[] = [];
  private readonly castleBrazierFlames: THREE.Mesh[] = [];
  private knightCaptainGroup: THREE.Group | null = null;
  private knightCaptainHead: THREE.Object3D | null = null;
  private knightCaptainBaseYaw = 0;
  private knightCaptainIdleT = 0;
  private castleAnimT = 0;

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
  private readonly royalBlueMat = createToonMaterial(Palette.royalBlue, {
    side: THREE.DoubleSide,
  });
  private readonly royalGoldMat = createToonMaterial(Palette.royalGold, {
    emissive: Palette.royalGold,
    emissiveIntensity: 0.2,
  });
  private readonly castleSlateMat = createToonMaterial(Palette.castleSlate);
  private readonly castleSlateLightMat = createToonMaterial(Palette.castleSlateLight);
  private readonly castleSlateDarkMat = createToonMaterial(Palette.castleSlateDark);
  private readonly ironMat = createToonMaterial(Palette.iron);
  private readonly brazierFlameMat = createToonMaterial(0xff7722, {
    emissive: 0xffaa33,
    emissiveIntensity: 0.85,
  });
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
    this.buildNortheastResidentialStreet();
    this.buildNortheastHarborDocks();
    this.buildNortheastCastleKeep();
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

    // Soft grass RING under the residential street — leave center open for cobble lane.
    const homesPad = new THREE.Mesh(
      new THREE.RingGeometry(3.4, this.northeastHomes.radius + 1.4, 32),
      createToonMaterial(0x62965a),
    );
    homesPad.rotation.x = -Math.PI / 2;
    homesPad.position.set(this.northeastHomes.x, 0.025, this.northeastHomes.z);
    homesPad.receiveShadow = true;
    this.root.add(homesPad);

    // Soft grass RING under the harbor docks — leave center open for pier boards.
    const docksPad = new THREE.Mesh(
      new THREE.RingGeometry(3.0, this.northeastDocks.radius + 1.3, 28),
      createToonMaterial(0x5a8a62),
    );
    docksPad.rotation.x = -Math.PI / 2;
    docksPad.position.set(this.northeastDocks.x, 0.025, this.northeastDocks.z);
    docksPad.receiveShadow = true;
    this.root.add(docksPad);

    // Soft grass RING under the castle gatehouse — leave center open for paved causeway.
    const gatehousePad = new THREE.Mesh(
      new THREE.RingGeometry(3.0, this.northeastCastleGatehouse.radius + 1.4, 32),
      createToonMaterial(0x546e5a),
    );
    gatehousePad.rotation.x = -Math.PI / 2;
    gatehousePad.position.set(
      this.northeastCastleGatehouse.x,
      0.025,
      this.northeastCastleGatehouse.z,
    );
    gatehousePad.receiveShadow = true;
    this.root.add(gatehousePad);

    // Soft grass RING under the castle keep & courtyard — grand fortified footprint.
    const castlePad = new THREE.Mesh(
      new THREE.RingGeometry(4.5, this.northeastCastle.radius + 1.8, 36),
      createToonMaterial(0x4f6356),
    );
    castlePad.rotation.x = -Math.PI / 2;
    castlePad.position.set(this.northeastCastle.x, 0.025, this.northeastCastle.z);
    castlePad.receiveShadow = true;
    this.root.add(castlePad);

    this.buildEastPathRibbon();
    this.buildWestPathRibbon();
    this.buildNorthPathRibbon();
    this.buildSouthPathRibbon();
    this.buildNortheastPathRibbon();
    this.buildMarketStreetRibbon();
    this.buildCastlePathRibbon();
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

  /** Paved stone causeway: Residential Street -> Castle Gatehouse -> Royal Courtyard. */
  private buildCastlePathRibbon(): void {
    const pathMat = createToonMaterial(Palette.castleSlateDark);
    const edgeMat = createToonMaterial(Palette.castleSlateLight);
    const cobbleMat = createToonMaterial(Palette.castleSlate);

    // Segment 1: Homes (67, 67) -> Castle Gatehouse (78, 78)
    const ax = this.northeastHomes.x;
    const az = this.northeastHomes.z;
    const bx = this.northeastCastleGatehouse.x;
    const bz = this.northeastCastleGatehouse.z;
    const segs1 = 8;
    for (let i = 0; i < segs1; i++) {
      const t0 = i / segs1;
      const t1 = (i + 1) / segs1;
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
      const width = 4.6 + Math.sin(t0 * Math.PI) * 0.4;

      const plank = new THREE.Mesh(new THREE.BoxGeometry(width, 0.052, len + 0.15), pathMat);
      plank.position.set(mx, 0.05, mz);
      plank.rotation.y = ang;
      plank.receiveShadow = true;
      this.root.add(plank);

      const edge = new THREE.Mesh(new THREE.BoxGeometry(width + 0.7, 0.03, len + 0.2), edgeMat);
      edge.position.set(mx, 0.035, mz);
      edge.rotation.y = ang;
      edge.receiveShadow = true;
      this.root.add(edge);

      if (i % 2 === 1) {
        const stone = new THREE.Mesh(
          new THREE.BoxGeometry(width * 0.7, 0.035, Math.min(len * 0.8, 1.3)),
          cobbleMat,
        );
        stone.position.set(mx, 0.06, mz);
        stone.rotation.y = ang + 0.04;
        stone.receiveShadow = true;
        this.root.add(stone);
      }
    }

    // Gatehouse arrival stone apron
    const gateApron = new THREE.Mesh(new THREE.CircleGeometry(4.6, 24), cobbleMat);
    gateApron.rotation.x = -Math.PI / 2;
    gateApron.position.set(this.northeastCastleGatehouse.x, 0.045, this.northeastCastleGatehouse.z);
    gateApron.receiveShadow = true;
    this.root.add(gateApron);

    // Segment 2: Gatehouse (78, 78) -> Castle Keep (89, 89)
    const kx0 = this.northeastCastleGatehouse.x;
    const kz0 = this.northeastCastleGatehouse.z;
    const kx1 = this.northeastCastle.x;
    const kz1 = this.northeastCastle.z;
    const segs2 = 8;
    for (let i = 0; i < segs2; i++) {
      const t0 = i / segs2;
      const t1 = (i + 1) / segs2;
      const x0 = kx0 + (kx1 - kx0) * t0;
      const z0 = kz0 + (kz1 - kz0) * t0;
      const x1 = kx0 + (kx1 - kx0) * t1;
      const z1 = kz0 + (kz1 - kz0) * t1;
      const mx = (x0 + x1) * 0.5;
      const mz = (z0 + z1) * 0.5;
      const dx = x1 - x0;
      const dz = z1 - z0;
      const len = Math.hypot(dx, dz);
      const ang = Math.atan2(dx, dz);
      const width = 5.2 + Math.sin(t0 * Math.PI) * 0.45;

      const plank = new THREE.Mesh(new THREE.BoxGeometry(width, 0.055, len + 0.15), pathMat);
      plank.position.set(mx, 0.052, mz);
      plank.rotation.y = ang;
      plank.receiveShadow = true;
      this.root.add(plank);

      const edge = new THREE.Mesh(new THREE.BoxGeometry(width + 0.8, 0.032, len + 0.2), edgeMat);
      edge.position.set(mx, 0.038, mz);
      edge.rotation.y = ang;
      edge.receiveShadow = true;
      this.root.add(edge);

      if (i % 2 === 0) {
        const stone = new THREE.Mesh(
          new THREE.BoxGeometry(width * 0.72, 0.036, Math.min(len * 0.85, 1.4)),
          cobbleMat,
        );
        stone.position.set(mx, 0.062, mz);
        stone.rotation.y = ang + 0.03;
        stone.receiveShadow = true;
        this.root.add(stone);
      }
    }

    // Grand Castle Courtyard cobblestone plaza
    const courtyard = new THREE.Mesh(new THREE.CircleGeometry(7.8, 32), cobbleMat);
    courtyard.rotation.x = -Math.PI / 2;
    courtyard.position.set(this.northeastCastle.x, 0.045, this.northeastCastle.z);
    courtyard.receiveShadow = true;
    this.root.add(courtyard);

    // Inner courtyard mosaic ring & crest
    const innerRing = new THREE.Mesh(new THREE.RingGeometry(3.6, 6.2, 28), this.castleSlateLightMat);
    innerRing.rotation.x = -Math.PI / 2;
    innerRing.position.set(this.northeastCastle.x, 0.052, this.northeastCastle.z);
    innerRing.receiveShadow = true;
    this.root.add(innerRing);

    // Royal gold crest star in courtyard center
    const crestStar = new THREE.Mesh(new THREE.CircleGeometry(1.6, 8), this.royalGoldMat);
    crestStar.rotation.x = -Math.PI / 2;
    crestStar.rotation.z = Math.PI / 8;
    crestStar.position.set(this.northeastCastle.x, 0.058, this.northeastCastle.z);
    crestStar.receiveShadow = true;
    this.root.add(crestStar);
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
      // Was (−12, 8) / (−18, 4) — keep wide of the south spawn cam’s near-left.
      [-22, 10, 0.95],
      // Was (6, 12) — sat on the old NE spawn-camera ray (read as a green hill dome).
      // Was (15, 28) — clustered with (16,34) + NE rim tree + moss ledge into a foliage cage.
      // Parked east of the north corridor cone, west of the gate road (still off (6,12)).
      [14, 28, 1.1],
      // Was (−8, 18) / (−3, 16) — kept west of the north path, off the south spawn cam.
      [-16, 24, 1],
      // Was (14, 6) → (14, 12) → (19, 9) — spread farther S of camp, clear of east shrine branch.
      // Still off the old NE spawn-camera ray at (6, 12).
      [20, 2, 1.05],
      // Was (−16, −2) — nudged south so the west path branch stays open
      [-16, -8, 1.2],
      // Was (3, −12) — nudged east so the south path branch stays open
      [8, -14, 1.05],
      // Was (−18, 10) — pulled farther west so south boot frame isn’t canopy-heavy.
      [-26, 12, 0.92],
      [16, -12, 1.08],
      // Outer-band fillers for the expanded meadow ring
      [28, -14, 1.05],
      [-30, 14, 0.98],
      // Was (20, 30) → (16, 34) — (16, 34) sat in the NE foliage cage with (15,28) + rim tree.
      // Parked on the far-north rim (east of north corridor |x−3|<11, west of NE pocket skip).
      [14, 38, 1.1],
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
    // Townsfolk sentry beside the arch — soft collision, walk-through lane stays open.
    this.addGateGuard(GATE_GUARD_NPC.x, GATE_GUARD_NPC.z, GATE_GUARD_YAW);
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
   * KayKit cottage shops + stylized stalls/awning props + plaza lanterns;
   * residential street continues through the open far-NE exit; harbor docks
   * through the open SE exit.
   */
  private buildNortheastMarketDistrict(): void {
    const { x: cx, z: cz, radius } = this.northeastMarket;

    // Flavor sign just past the gate (E interact wired in Game via MarketDistrictSign).
    this.addMarketDistrictSign(MARKET_SIGN_SPOT.x, MARKET_SIGN_SPOT.z);

    // Street-facing KayKit shops (procedural stand-ins → pack swap). Yaw faces cobble.
    // Street runs along the NE diagonal; shops sit well off the walk lane
    // (KayKit cottage collision ≈ 1.6 × PROP_SCALE.cottage after pack apply).
    this.addMarketShop(44.8, 58.2, 1.08, Math.PI * 0.78);
    // SE shop — nudged SW so the open SE docks spur clears pack r≈4.4
    this.addMarketShop(57.2, 43.2, 1.12, -Math.PI * 0.22);
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
    // NW stall hosts the street vendor NPC (E shop — see MarketStreetVendor).
    // SE + E stalls flank the east-rim notice board; west-rim extra stall is toast-only.
    // SE cobble hosts the parked traveling cart (toast-only — see MarketTravelingCart).
    this.addMarketStall(
      MARKET_VENDOR_STALL.x,
      MARKET_VENDOR_STALL.z,
      Math.PI * 0.7,
      Palette.roofTile,
    );
    this.addMarketStall(54.2, 47.8, -Math.PI * 0.28, Palette.flowerYellow);
    this.addMarketStall(55.8, 52.4, -Math.PI * 0.9, Palette.flowerCyan);
    this.addMarketStall(
      MARKET_EXTRA_STALL.x,
      MARKET_EXTRA_STALL.z,
      MARKET_EXTRA_STALL_YAW,
      Palette.flowerPink,
    );
    this.addMarketStreetVendor(
      MARKET_VENDOR_NPC.x,
      MARKET_VENDOR_NPC.z,
      Math.atan2(
        MARKET_FOUNTAIN_SPOT.x - MARKET_VENDOR_NPC.x,
        MARKET_FOUNTAIN_SPOT.z - MARKET_VENDOR_NPC.z,
      ),
    );

    this.addMarketCrates(47.2, 51.4, 0.2);
    this.addMarketCrates(54.0, 49.2, -0.35);
    this.addMarketBannerPost(47.0, 49.2, 0.1);
    this.addMarketBannerPost(55.0, 52.6, -0.08);

    // Town notice / bounty board on the east plaza rim (E interact via MarketNoticeBoard).
    this.addMarketNoticeBoard(
      MARKET_NOTICE_BOARD_SPOT.x,
      MARKET_NOTICE_BOARD_SPOT.z,
      MARKET_NOTICE_BOARD_YAW,
    );

    // Parked traveling cart on SE cobble (E flavor via MarketTravelingCart).
    this.addMarketTravelingWagon(
      MARKET_WAGON_SPOT.x,
      MARKET_WAGON_SPOT.z,
      MARKET_WAGON_YAW,
    );

    // Warm plaza street lanterns on the cobble rim — town-hub read at a glance.
    for (const lamp of MARKET_PLAZA_LANTERNS) {
      this.addMarketPlazaLantern(lamp.x, lamp.z);
    }

    // KayKit well accent off the fountain — pack-swapped with shops.
    this.marketWellPlacement = { x: 47.8, z: 55.4 };
    this.addMarketWellStandIn(this.marketWellPlacement.x, this.marketWellPlacement.z);

    // Low curtain walls + corner posts — enclose parts of the rim, link to the gate.
    // Leave SW (gate), far NE (homes), and SE (harbor docks) exits open.
    this.buildMarketPerimeterWalls();
    // Short west-rim alley off the plaza (walkable crate lane + E flavor).
    this.buildMarketSideAlley();

    // Sparse rim trees — leave SW open toward the gate, far NE for homes, SE for docks.
    // Skip blacksmith + inn pads so foliage doesn't swallow the landmark silhouettes.
    const rimTrees = 6;
    for (let i = 0; i < rimTrees; i++) {
      const a = (i / rimTrees) * Math.PI * 2 + 0.55;
      if (Math.cos(a) + Math.sin(a) < -0.7) continue;
      if (Math.cos(a) + Math.sin(a) > 1.2) continue;
      // SE bearing toward the harbor spur — keep the open exit readable.
      if (Math.cos(a) > 0.55 && Math.sin(a) < -0.15) continue;
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
      // Keep the west-rim produce stall silhouette clear.
      if (Math.hypot(tx - MARKET_EXTRA_STALL.x, tz - MARKET_EXTRA_STALL.z) < 4.5) {
        continue;
      }
      // Keep the east-rim notice board silhouette clear.
      if (
        Math.hypot(tx - MARKET_NOTICE_BOARD_SPOT.x, tz - MARKET_NOTICE_BOARD_SPOT.z) < 4.5
      ) {
        continue;
      }
      // Keep the SE plaza traveling cart silhouette clear.
      if (Math.hypot(tx - MARKET_WAGON_SPOT.x, tz - MARKET_WAGON_SPOT.z) < 4.5) {
        continue;
      }
      this.addTree(tx, tz, 0.86 + (i % 3) * 0.06);
    }
  }

  /**
   * Compact residential street stub past the market’s open far-NE exit.
   * 3 KayKit cottage homes + town chapel landmark + denser fences / lanterns / garden / well;
   * clear street lane market → homes (door pads + chapel porch stay open).
   */
  private buildNortheastResidentialStreet(): void {
    const { x: cx, z: cz, radius } = this.northeastHomes;

    this.buildResidentialStreetRibbon();

    for (const home of RESIDENTIAL_HOME_SPOTS) {
      this.addResidentialHome(home.x, home.z, home.scale, home.yaw);
    }

    // Soft door marker — E flavor via ResidentialDoor (no collision on the pad).
    this.addResidentialDoorMarker(RESIDENTIAL_DOOR_SPOT.x, RESIDENTIAL_DOOR_SPOT.z);

    // Town chapel landmark on the east rim — KayKit church + soft porch (E bless).
    this.addResidentialChapel(
      RESIDENTIAL_CHAPEL_SPOT.x,
      RESIDENTIAL_CHAPEL_SPOT.z,
      RESIDENTIAL_CHAPEL_SPOT.scale,
      RESIDENTIAL_CHAPEL_SPOT.yaw,
    );
    this.addResidentialChapelYard(
      RESIDENTIAL_CHAPEL_SPOT.x,
      RESIDENTIAL_CHAPEL_SPOT.z,
    );
    this.addResidentialDoorMarker(RESIDENTIAL_CHAPEL_DOOR.x, RESIDENTIAL_CHAPEL_DOOR.z);

    // Fence runs + warm street lanterns along the cobble (not market plaza lamps).
    for (const fence of RESIDENTIAL_STREET_FENCES) {
      this.addResidentialFence(fence.x, fence.z, fence.yaw, fence.length);
    }
    for (const lamp of RESIDENTIAL_STREET_LANTERNS) {
      this.addResidentialLantern(lamp.x, lamp.z);
    }
    this.addResidentialGarden(RESIDENTIAL_GARDEN_SPOT.x, RESIDENTIAL_GARDEN_SPOT.z);

    this.residentialWellPlacement = {
      x: RESIDENTIAL_WELL_SPOT.x,
      z: RESIDENTIAL_WELL_SPOT.z,
    };
    this.addResidentialWellStandIn(
      this.residentialWellPlacement.x,
      this.residentialWellPlacement.z,
    );

    // Sparse rim trees — leave SW open toward the market street.
    const rimTrees = 5;
    for (let i = 0; i < rimTrees; i++) {
      const a = (i / rimTrees) * Math.PI * 2 + 0.4;
      if (Math.cos(a) + Math.sin(a) < -0.65) continue;
      const r = radius + 0.25 + (i % 2) * 0.35;
      const tx = cx + Math.cos(a) * r;
      const tz = cz + Math.sin(a) * r;
      if (meadowPathInfluence(tx, tz) > 0.45) continue;
      let nearHome = false;
      for (const home of RESIDENTIAL_HOME_SPOTS) {
        if (Math.hypot(tx - home.x, tz - home.z) < 5.2) {
          nearHome = true;
          break;
        }
      }
      if (nearHome) continue;
      if (Math.hypot(tx - RESIDENTIAL_WELL_SPOT.x, tz - RESIDENTIAL_WELL_SPOT.z) < 3.5) {
        continue;
      }
      if (
        Math.hypot(tx - RESIDENTIAL_CHAPEL_SPOT.x, tz - RESIDENTIAL_CHAPEL_SPOT.z) < 5.5
      ) {
        continue;
      }
      this.addTree(tx, tz, 0.84 + (i % 3) * 0.05);
    }
  }

  /** Cobble ribbon from the market’s far-NE exit into the residential pocket. */
  private buildResidentialStreetRibbon(): void {
    const pathMat = createToonMaterial(Palette.pathDark);
    const edgeMat = createToonMaterial(Palette.rockLight);
    const cobbleMat = createToonMaterial(Palette.rock);
    const ax = this.northeastMarket.x + 5.0;
    const az = this.northeastMarket.z + 5.0;
    const bx = this.northeastHomes.x;
    const bz = this.northeastHomes.z;
    const segments = 7;
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
      const width = 3.6 + Math.sin(t0 * Math.PI) * 0.35;

      const plank = new THREE.Mesh(new THREE.BoxGeometry(width, 0.05, len + 0.12), pathMat);
      plank.position.set(mx, 0.048, mz);
      plank.rotation.y = ang;
      plank.receiveShadow = true;
      this.root.add(plank);

      const edge = new THREE.Mesh(
        new THREE.BoxGeometry(width + 0.55, 0.028, len + 0.16),
        edgeMat,
      );
      edge.position.set(mx, 0.032, mz);
      edge.rotation.y = ang;
      edge.receiveShadow = true;
      this.root.add(edge);

      if (i % 2 === 0) {
        const cobble = new THREE.Mesh(
          new THREE.BoxGeometry(width * 0.58, 0.03, Math.min(len * 0.7, 1.05)),
          cobbleMat,
        );
        cobble.position.set(mx, 0.056, mz);
        cobble.rotation.y = ang + 0.04;
        cobble.receiveShadow = true;
        this.root.add(cobble);
      }
    }

    const plaza = new THREE.Mesh(new THREE.CircleGeometry(3.6, 22), cobbleMat);
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.set(this.northeastHomes.x, 0.04, this.northeastHomes.z);
    plaza.receiveShadow = true;
    this.root.add(plaza);
  }

  /**
   * Compact harbor / docks stub past the market’s open SE exit (not the NE homes lane).
   * Stone/wood spur, small pier with pilings, crates, hanging nets, and moored boats.
   * Soft collisions on boats/crates; center pier lane stays walkable. No new enemies.
   */
  private buildNortheastHarborDocks(): void {
    const { x: cx, z: cz, radius } = this.northeastDocks;

    this.buildHarborStreetRibbon();
    this.buildHarborWaterPad(cx, cz);
    this.buildHarborPier(cx, cz);

    // Catch crate / sign — E flavor via HarborCatchSign (pad itself is not a blocker).
    this.addHarborCatchCrate(HARBOR_CATCH_SIGN.x, HARBOR_CATCH_SIGN.z);

    // Flank crates — soft blockers off the pier lane.
    this.addMarketCrates(62.4, 44.8, 0.35);
    this.addMarketCrates(64.2, 41.2, -0.4);
    this.addMarketCrates(68.2, 40.6, 0.2);

    // Moored boats beside the pier (soft collision; leave center boards open).
    this.addHarborBoat(69.4, 39.2, -0.55, 1.05);
    this.addHarborBoat(71.2, 43.6, 0.85, 0.92);

    this.addHarborNetRack(65.6, 45.2, -0.35);
    this.addHarborNetRack(70.0, 41.8, 0.9);
    this.addHarborLantern(63.2, 42.4);
    this.addHarborLantern(67.6, 40.0);

    // Sparse rim trees — leave NW open toward the market spur.
    const rimTrees = 4;
    for (let i = 0; i < rimTrees; i++) {
      const a = (i / rimTrees) * Math.PI * 2 + 0.9;
      // NW bearing back to market — keep the approach clear.
      if (Math.cos(a) < -0.2 && Math.sin(a) > 0.15) continue;
      const r = radius + 0.2 + (i % 2) * 0.3;
      const tx = cx + Math.cos(a) * r;
      const tz = cz + Math.sin(a) * r;
      if (meadowPathInfluence(tx, tz) > 0.45) continue;
      if (Math.hypot(tx - HARBOR_CATCH_SIGN.x, tz - HARBOR_CATCH_SIGN.z) < 3.5) {
        continue;
      }
      this.addTree(tx, tz, 0.82 + (i % 3) * 0.05);
    }
  }

  /** Stone/wood ribbon from the market’s SE exit into the docks pocket. */
  private buildHarborStreetRibbon(): void {
    const pathMat = createToonMaterial(Palette.pathDark);
    const edgeMat = createToonMaterial(Palette.rockLight);
    const woodMat = createToonMaterial(Palette.wood);
    // Clear of SE shop pack r≈4.4 and the NE homes diagonal.
    const ax = this.northeastMarket.x + 6.5;
    const az = this.northeastMarket.z - 1.5;
    const bx = this.northeastDocks.x - 1.0;
    const bz = this.northeastDocks.z + 1.0;
    const segments = 6;
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
      const width = 3.3 + Math.sin(t0 * Math.PI) * 0.3;

      const plank = new THREE.Mesh(
        new THREE.BoxGeometry(width, 0.05, len + 0.12),
        i < 3 ? pathMat : woodMat,
      );
      plank.position.set(mx, 0.048, mz);
      plank.rotation.y = ang;
      plank.receiveShadow = true;
      this.root.add(plank);

      const edge = new THREE.Mesh(
        new THREE.BoxGeometry(width + 0.5, 0.028, len + 0.16),
        edgeMat,
      );
      edge.position.set(mx, 0.032, mz);
      edge.rotation.y = ang;
      edge.receiveShadow = true;
      this.root.add(edge);
    }
  }

  /** Shallow harbor water under / beside the pier (reads as docks, not a river ford). */
  private buildHarborWaterPad(cx: number, cz: number): void {
    const water = new THREE.Mesh(
      new THREE.CircleGeometry(5.8, 28),
      this.pondMat,
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(cx + 2.4, 0.02, cz - 1.6);
    water.receiveShadow = true;
    this.root.add(water);

    const deep = new THREE.Mesh(
      new THREE.CircleGeometry(3.2, 22),
      this.pondDeepMat,
    );
    deep.rotation.x = -Math.PI / 2;
    deep.position.set(cx + 3.2, 0.015, cz - 2.2);
    deep.receiveShadow = true;
    this.root.add(deep);
  }

  /** Walkable pier boards + pilings — center lane clear of boat/crate blockers. */
  private buildHarborPier(cx: number, cz: number): void {
    const deckMat = createToonMaterial(Palette.wood);
    const railMat = createToonMaterial(Palette.woodDark);
    const pierYaw = -0.55;
    const pier = new THREE.Group();
    pier.position.set(cx + 1.2, 0, cz - 0.6);
    pier.rotation.y = pierYaw;
    pier.name = 'HarborPier';

    // Main walk deck — knight-scale width (~3.2) so WASD feels open.
    const deck = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.12, 9.2), deckMat);
    deck.position.y = 0.18;
    deck.castShadow = true;
    deck.receiveShadow = true;
    pier.add(deck);

    // Cross planks for silhouette.
    for (let i = 0; i < 5; i++) {
      const board = new THREE.Mesh(
        new THREE.BoxGeometry(3.35, 0.04, 0.55),
        railMat,
      );
      board.position.set(0, 0.25, -3.6 + i * 1.8);
      board.receiveShadow = true;
      pier.add(board);
    }

    // Pilings along both edges — obstacles only at world positions, not deck center.
    const pilingOffsets: Array<[number, number]> = [
      [-1.45, -3.8],
      [1.45, -3.6],
      [-1.45, -1.2],
      [1.45, -1.0],
      [-1.45, 1.4],
      [1.45, 1.6],
      [-1.45, 3.6],
      [1.45, 3.8],
    ];
    for (const [ox, oz] of pilingOffsets) {
      const piling = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.2, 1.35, 6),
        this.woodDarkMat,
      );
      piling.position.set(ox, 0.2, oz);
      piling.castShadow = true;
      pier.add(piling);
    }

    // Light side rails — leave ends open for boarding / walk-off.
    for (const side of [-1.55, 1.55]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.35, 7.2), railMat);
      rail.position.set(side, 0.45, 0.2);
      rail.castShadow = true;
      pier.add(rail);
    }

    this.root.add(pier);

    // Soft blockers for edge pilings only — center of pier stays walkable.
    const cos = Math.cos(pierYaw);
    const sin = Math.sin(pierYaw);
    for (const [ox, oz] of pilingOffsets) {
      const wx = cx + 1.2 + ox * cos + oz * sin;
      const wz = cz - 0.6 - ox * sin + oz * cos;
      this.obstacles.push({ x: wx, z: wz, radius: 0.38 });
    }
  }

  /** Catch crate stack + small board — E flavor pad (soft collision modest). */
  private addHarborCatchCrate(x: number, z: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = 0.4;
    group.name = 'HarborCatchCrate';

    const base = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.6, 0.75), this.woodMat);
    base.position.y = 0.3;
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 0.6), this.woodDarkMat);
    lid.position.set(0.05, 0.66, 0);
    lid.castShadow = true;
    group.add(lid);

    const board = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.4, 0.06),
      this.signBoardMat,
    );
    board.position.set(0.15, 1.05, 0.2);
    board.castShadow = true;
    group.add(board);

    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.06, 1.1, 5),
      this.woodDarkMat,
    );
    post.position.set(0.15, 0.55, 0.22);
    post.castShadow = true;
    group.add(post);

    this.root.add(group);
    // Keep radius modest so the pier lane beside the crate stays open.
    this.obstacles.push({ x, z, radius: 0.55 });
  }

  /** Simple moored skiff — soft hull blocker off the pier walk lane. */
  private addHarborBoat(x: number, z: number, yaw: number, scale: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = yaw;
    group.scale.setScalar(scale);
    group.name = 'HarborBoat';

    const hull = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.45, 2.6),
      this.woodMat,
    );
    hull.position.y = 0.22;
    hull.castShadow = true;
    hull.receiveShadow = true;
    group.add(hull);

    const bow = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.9, 4), this.woodDarkMat);
    bow.rotation.x = Math.PI / 2;
    bow.position.set(0, 0.28, -1.55);
    bow.castShadow = true;
    group.add(bow);

    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.06, 2.1, 5),
      this.woodDarkMat,
    );
    mast.position.y = 1.2;
    mast.castShadow = true;
    group.add(mast);

    const sail = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 1.2),
      createToonMaterial(0xe8e0d0, { side: THREE.DoubleSide }),
    );
    sail.position.set(0.35, 1.35, 0.1);
    sail.rotation.y = 0.2;
    group.add(sail);

    this.root.add(group);
    this.obstacles.push({ x, z, radius: 1.05 * scale });
  }

  /** Drying-net rack dressing for the pier apron. */
  private addHarborNetRack(x: number, z: number, yaw: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = yaw;
    group.name = 'HarborNetRack';

    for (const ox of [-0.55, 0.55]) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.07, 1.8, 5),
        this.woodDarkMat,
      );
      post.position.set(ox, 0.9, 0);
      post.castShadow = true;
      group.add(post);
    }

    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(1.3, 0.08, 0.08),
      this.woodMat,
    );
    beam.position.y = 1.65;
    beam.castShadow = true;
    group.add(beam);

    const netMat = createToonMaterial(0x8aa8a0, {
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const net = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.1), netMat);
    net.position.set(0, 1.0, 0.05);
    group.add(net);

    this.root.add(group);
    this.obstacles.push({ x, z, radius: 0.5 });
  }

  /** Small dock lantern post — readable at iso distance. */
  private addHarborLantern(x: number, z: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.name = 'HarborLantern';

    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.09, 2.2, 5),
      this.woodDarkMat,
    );
    post.position.y = 1.1;
    post.castShadow = true;
    group.add(post);

    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 8, 8),
      createToonMaterial(Palette.flowerYellow, {
        emissive: Palette.flowerYellow,
        emissiveIntensity: 0.45,
      }),
    );
    lamp.position.y = 2.25;
    lamp.castShadow = true;
    group.add(lamp);

    this.root.add(group);
    this.obstacles.push({ x, z, radius: 0.3 });
  }

  /**
   * Grand Castle District past the upper residential street.
   * Features: Outer Gatehouse / Barbican, Fortified Curtain Walls, Grand Citadel Keep with high spires,
   * Royal Courtyard with crest mosaic, Knight Captain NPC, Training Yard, Royal Chest, Braziers, and Banners.
   */
  private buildNortheastCastleKeep(): void {
    // 1. Outer Gatehouse / Barbican at (78, 78) facing SW down the causeway approach
    this.addCastleGatehouse(this.northeastCastleGatehouse.x, this.northeastCastleGatehouse.z, -Math.PI * 0.75);

    // 2. Fortified stone curtain walls flanking the gatehouse and surrounding the courtyard
    this.addCastleCurtainWall(73.5, 82.5, -Math.PI * 0.25, 8.5);
    this.addCastleCurtainWall(82.5, 73.5, Math.PI * 0.75, 8.5);
    this.addCastleCurtainWall(78.0, 95.0, -Math.PI * 0.25, 9.0);
    this.addCastleCurtainWall(95.0, 78.0, Math.PI * 0.75, 9.0);

    // 3. Grand Citadel Keep & Throne Hall facade at (94.5, 94.5)
    this.addCastleCitadelKeep(94.5, 94.5, -Math.PI * 0.75);

    // 4. Royal Knight Captain NPC standing guard in the courtyard
    this.addCastleKnightCaptain(CASTLE_KNIGHT_CAPTAIN.x, CASTLE_KNIGHT_CAPTAIN.z, CASTLE_KNIGHT_CAPTAIN_YAW);

    // 5. Royal Armory & Training Grounds in the western courtyard quadrant
    this.addCastleTrainingYard(CASTLE_ARMORY_SPOT.x, CASTLE_ARMORY_SPOT.z, -Math.PI * 0.25);

    // 6. Royal Treasury Gilded Chest
    this.addCastleRoyalChest(CASTLE_CHEST_SPOT.x, CASTLE_CHEST_SPOT.z);

    // 7. Stone braziers lighting the approach, gatehouse, and keep entrance
    for (const b of CASTLE_BRAZIER_SPOTS) {
      this.addCastleBrazier(b.x, b.z);
    }

    // 8. Heraldic royal banners
    for (const p of CASTLE_BANNER_POSTS) {
      this.addCastleBanner(p.x, p.z, p.yaw);
    }
  }

  /**
   * Fortified stone Barbican / Gatehouse archway with twin bastion towers and heavy portcullis.
   */
  private addCastleGatehouse(x: number, z: number, yaw: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = yaw;
    group.name = 'CastleGatehouse';

    // Approach paving underneath
    const paving = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.08, 6.0), this.castleSlateDarkMat);
    paving.position.y = 0.04;
    paving.receiveShadow = true;
    group.add(paving);

    // Twin flanking bastion towers
    for (const side of [-2.6, 2.6]) {
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.45, 6.2, 8), this.castleSlateMat);
      tower.position.set(side, 3.1, 0);
      tower.castShadow = true;
      tower.receiveShadow = true;
      group.add(tower);

      const cornice = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.25, 0.45, 8), this.castleSlateLightMat);
      cornice.position.set(side, 6.35, 0);
      cornice.castShadow = true;
      group.add(cornice);

      // Crenellations
      for (let i = 0; i < 4; i++) {
        const merlon = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.65, 0.35), this.castleSlateMat);
        const ang = (i / 4) * Math.PI * 2;
        merlon.position.set(side + Math.cos(ang) * 1.15, 6.8, Math.sin(ang) * 1.15);
        merlon.rotation.y = -ang;
        merlon.castShadow = true;
        group.add(merlon);
      }

      // Conical roof
      const roof = new THREE.Mesh(new THREE.ConeGeometry(1.35, 2.4, 8), this.royalBlueMat);
      roof.position.set(side, 7.8, 0);
      roof.castShadow = true;
      group.add(roof);

      // Golden spire top
      const finial = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.65, 4), this.royalGoldMat);
      finial.position.set(side, 9.2, 0);
      group.add(finial);
    }

    // High bridge arch connecting the two towers
    const archLintel = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.4, 1.8), this.castleSlateMat);
    archLintel.position.set(0, 5.2, 0);
    archLintel.castShadow = true;
    archLintel.receiveShadow = true;
    group.add(archLintel);

    const parapet = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.75, 0.3), this.castleSlateLightMat);
    parapet.position.set(0, 6.2, -0.85);
    parapet.castShadow = true;
    group.add(parapet);

    // Royal heraldic shield on arch face
    const shield = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.2, 0.12), this.royalBlueMat);
    shield.position.set(0, 5.2, -0.96);
    group.add(shield);
    const shieldTrim = new THREE.Mesh(new THREE.BoxGeometry(0.96, 1.26, 0.08), this.royalGoldMat);
    shieldTrim.position.set(0, 5.2, -0.94);
    group.add(shieldTrim);

    // Portcullis iron bars hanging in the archway
    const portcullis = new THREE.Group();
    portcullis.position.set(0, 3.8, 0);
    for (let i = -1.2; i <= 1.2; i += 0.4) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.8, 4), this.ironMat);
      bar.position.set(i, 0, 0);
      bar.castShadow = true;
      portcullis.add(bar);
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.25, 4), this.ironMat);
      spike.position.set(i, -1.5, 0);
      spike.rotation.x = Math.PI;
      portcullis.add(spike);
    }
    for (let y = -0.9; y <= 0.9; y += 0.6) {
      const cross = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.08, 0.08), this.ironMat);
      cross.position.set(0, y, 0);
      portcullis.add(cross);
    }
    group.add(portcullis);

    this.root.add(group);

    // Obstacles: flank towers only — center 3.4-wide walkway stays clear
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const toWorld = (lx: number, lz: number): { x: number; z: number } => ({
      x: x + lx * cos + lz * sin,
      z: z - lx * sin + lz * cos,
    });
    const leftTower = toWorld(-2.6, 0);
    const rightTower = toWorld(2.6, 0);
    this.obstacles.push({ x: leftTower.x, z: leftTower.z, radius: 1.4 });
    this.obstacles.push({ x: rightTower.x, z: rightTower.z, radius: 1.4 });
  }

  /**
   * Stone curtain wall segment with crenellated parapets.
   */
  private addCastleCurtainWall(x: number, z: number, yaw: number, length: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = yaw;
    group.name = 'CastleCurtainWall';

    const wall = new THREE.Mesh(new THREE.BoxGeometry(length, 3.8, 1.2), this.castleSlateMat);
    wall.position.y = 1.9;
    wall.castShadow = true;
    wall.receiveShadow = true;
    group.add(wall);

    const walkway = new THREE.Mesh(new THREE.BoxGeometry(length, 0.35, 1.4), this.castleSlateLightMat);
    walkway.position.y = 3.9;
    walkway.castShadow = true;
    group.add(walkway);

    // Crenellations along outer edge
    const merlonCount = Math.floor(length / 1.4);
    for (let i = 0; i < merlonCount; i++) {
      const merlon = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.75, 0.3), this.castleSlateMat);
      merlon.position.set(-length * 0.45 + i * 1.35, 4.4, -0.6);
      merlon.castShadow = true;
      group.add(merlon);
    }

    this.root.add(group);
    this.obstacles.push({ x, z, radius: length * 0.45 });
  }

  /**
   * Grand Citadel Keep — the massive royal palace & fortress keep.
   * Multi-tiered masonry with grand central spire, arched portal, rose window, and battlements.
   */
  private addCastleCitadelKeep(x: number, z: number, yaw: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = yaw;
    group.name = 'CastleCitadelKeep';

    // 1. Lower Great Hall base
    const greatHall = new THREE.Mesh(new THREE.BoxGeometry(10.5, 5.2, 8.5), this.castleSlateMat);
    greatHall.position.y = 2.6;
    greatHall.castShadow = true;
    greatHall.receiveShadow = true;
    group.add(greatHall);

    // Base plinth
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(11.2, 0.6, 9.2), this.castleSlateDarkMat);
    plinth.position.y = 0.3;
    plinth.receiveShadow = true;
    group.add(plinth);

    // Buttresses on facade
    for (const bx of [-4.2, -1.8, 1.8, 4.2]) {
      const buttress = new THREE.Mesh(new THREE.BoxGeometry(0.65, 4.6, 0.75), this.castleSlateLightMat);
      buttress.position.set(bx, 2.3, -4.4);
      buttress.castShadow = true;
      group.add(buttress);
    }

    // 2. Central Citadel Tower (rises high above the hall)
    const keepTower = new THREE.Mesh(new THREE.BoxGeometry(5.2, 6.8, 5.2), this.castleSlateMat);
    keepTower.position.set(0, 8.2, 0.5);
    keepTower.castShadow = true;
    group.add(keepTower);

    const keepParapet = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.5, 5.6), this.castleSlateLightMat);
    keepParapet.position.set(0, 11.8, 0.5);
    keepParapet.castShadow = true;
    group.add(keepParapet);

    // Grand conical royal-blue slate roof
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.6, 5.2, 8), this.royalBlueMat);
    roof.position.set(0, 14.5, 0.5);
    roof.castShadow = true;
    group.add(roof);

    // Golden spire spear & royal pennant
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.14, 2.4, 5), this.royalGoldMat);
    spire.position.set(0, 17.5, 0.5);
    group.add(spire);

    const spireBall = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 8), this.royalGoldMat);
    spireBall.position.set(0, 18.8, 0.5);
    group.add(spireBall);

    // 3. Flanking front turrets on the keep facade
    for (const side of [-4.8, 4.8]) {
      const turret = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.6, 8.2, 8), this.castleSlateMat);
      turret.position.set(side, 4.1, -3.8);
      turret.castShadow = true;
      turret.receiveShadow = true;
      group.add(turret);

      const turretRoof = new THREE.Mesh(new THREE.ConeGeometry(1.6, 2.8, 8), this.royalBlueMat);
      turretRoof.position.set(side, 9.4, -3.8);
      turretRoof.castShadow = true;
      group.add(turretRoof);

      const turretSpire = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.7, 4), this.royalGoldMat);
      turretSpire.position.set(side, 11.0, -3.8);
      group.add(turretSpire);
    }

    // 4. Grand Entrance Portal (E interactable pad)
    const portalArch = new THREE.Mesh(new THREE.BoxGeometry(3.2, 3.8, 0.8), this.castleSlateLightMat);
    portalArch.position.set(0, 1.9, -4.4);
    portalArch.castShadow = true;
    group.add(portalArch);

    const door = new THREE.Mesh(new THREE.BoxGeometry(2.2, 3.0, 0.2), this.woodDarkMat);
    door.position.set(0, 1.5, -4.75);
    group.add(door);

    // Iron strap hinges on doors
    for (const dy of [0.6, 1.6, 2.4]) {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.08, 0.24), this.ironMat);
      strap.position.set(0, dy, -4.75);
      group.add(strap);
    }

    // Royal Blue canopy awning with gold border over entrance
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.15, 1.2), this.royalBlueMat);
    canopy.position.set(0, 3.9, -4.8);
    canopy.rotation.x = 0.2;
    group.add(canopy);
    const canopyTrim = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.18, 0.1), this.royalGoldMat);
    canopyTrim.position.set(0, 3.8, -5.35);
    group.add(canopyTrim);

    // 5. Stained Glass Royal Rose Window
    const roseWindow = new THREE.Mesh(
      new THREE.CircleGeometry(0.9, 12),
      createToonMaterial(Palette.flowerCyan, {
        emissive: Palette.flowerCyan,
        emissiveIntensity: 0.65,
      }),
    );
    roseWindow.position.set(0, 5.8, -4.26);
    group.add(roseWindow);

    const roseTrim = new THREE.Mesh(new THREE.TorusGeometry(0.92, 0.08, 6, 16), this.royalGoldMat);
    roseTrim.position.set(0, 5.8, -4.24);
    group.add(roseTrim);

    this.root.add(group);

    // Keep obstacle: large solid fortress bulk
    this.obstacles.push({ x, z, radius: 4.8 });
  }

  /**
   * Royal Knight Captain NPC standing in the courtyard.
   * Model: Polished steel plate armor, gold lion pauldrons, knight helmet with gold visor and plume,
   * steel halberd, and heater shield. Head tracks nearby players.
   */
  private addCastleKnightCaptain(x: number, z: number, yaw: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = yaw;
    group.name = 'CastleKnightCaptain';

    const steelMat = createToonMaterial(Palette.warriorSteel, {
      emissive: Palette.warriorSteel,
      emissiveIntensity: 0.08,
    });
    const steelDarkMat = createToonMaterial(Palette.warriorSteelDark);
    const goldMat = this.royalGoldMat;
    const capeMat = this.royalBlueMat;
    const skinMat = createToonMaterial(Palette.warriorSkin);
    const bootMat = createToonMaterial(Palette.warriorBoot);

    // Shadow
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.48, 14), createToonMaterial(0x1a2228, {
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    group.add(shadow);

    // Legs / Greaves
    for (const lx of [-0.14, 0.14]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.62, 0.2), steelMat);
      leg.position.set(lx, 0.31, 0);
      leg.castShadow = true;
      group.add(leg);
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.18, 0.28), bootMat);
      boot.position.set(lx, 0.09, 0.04);
      group.add(boot);
    }

    // Torso / Cuirass
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.65, 0.38), steelMat);
    torso.position.y = 0.88;
    torso.castShadow = true;
    group.add(torso);

    const breastplateTrim = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.12, 0.4), goldMat);
    breastplateTrim.position.y = 1.05;
    group.add(breastplateTrim);

    // Royal Blue Cape
    const cape = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 1.15), capeMat);
    cape.position.set(0, 0.8, -0.22);
    cape.rotation.x = 0.15;
    cape.castShadow = true;
    group.add(cape);

    // Pauldrons (shoulder armor)
    for (const sx of [-0.36, 0.36]) {
      const pauldron = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.22, 0.26), goldMat);
      pauldron.position.set(sx, 1.15, 0);
      pauldron.castShadow = true;
      group.add(pauldron);
    }

    // Right Arm holding Halberd
    const rArm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.55, 0.16), steelDarkMat);
    rArm.position.set(0.38, 0.85, 0.1);
    rArm.rotation.x = -0.25;
    group.add(rArm);

    // Halberd Weapon
    const halberdGroup = new THREE.Group();
    halberdGroup.position.set(0.48, 0, 0.22);
    halberdGroup.rotation.z = -0.06;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 2.9, 6), this.woodDarkMat);
    shaft.position.y = 1.45;
    shaft.castShadow = true;
    halberdGroup.add(shaft);

    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.42, 0.04), steelMat);
    blade.position.set(0.24, 2.7, 0);
    blade.castShadow = true;
    halberdGroup.add(blade);

    const axeSpike = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.45, 4), goldMat);
    axeSpike.position.set(0, 3.05, 0);
    axeSpike.castShadow = true;
    halberdGroup.add(axeSpike);
    group.add(halberdGroup);

    // Left Arm holding Heater Shield
    const lArm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.55, 0.16), steelDarkMat);
    lArm.position.set(-0.38, 0.85, 0.1);
    lArm.rotation.x = -0.25;
    group.add(lArm);

    const shield = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.82, 0.08), this.royalBlueMat);
    shield.position.set(-0.52, 0.85, 0.22);
    shield.rotation.y = 0.3;
    shield.castShadow = true;
    group.add(shield);

    const shieldBoss = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.12), goldMat);
    shieldBoss.position.set(-0.54, 0.85, 0.25);
    shieldBoss.rotation.y = 0.3;
    group.add(shieldBoss);

    // Head / Helm with plumage
    const head = new THREE.Group();
    head.name = 'KnightCaptainHead';
    head.position.y = 1.48;

    const skull = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.38, 0.36), skinMat);
    head.add(skull);

    const helm = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.36, 0.42), steelMat);
    helm.position.y = 0.08;
    helm.castShadow = true;
    head.add(helm);

    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.14, 0.16), goldMat);
    visor.position.set(0, 0.06, 0.18);
    head.add(visor);

    // Feathered Royal Blue plume
    const plume = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.38, 0.3), this.royalBlueMat);
    plume.position.set(0, 0.42, -0.05);
    head.add(plume);
    const plumeGold = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.42, 0.12), goldMat);
    plumeGold.position.set(0, 0.45, 0.04);
    head.add(plumeGold);

    group.add(head);

    this.root.add(group);
    this.obstacles.push({ x, z, radius: 0.65 });

    this.knightCaptainGroup = group;
    this.knightCaptainHead = head;
    this.knightCaptainBaseYaw = yaw;
  }

  /**
   * Royal Training Yard — weapon racks, archery targets, and combat dummy.
   */
  private addCastleTrainingYard(x: number, z: number, yaw: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = yaw;
    group.name = 'CastleTrainingYard';

    // 1. Weapon Rack (CASTLE_ARMORY_SPOT)
    const rack = new THREE.Group();
    for (const rx of [-0.6, 0.6]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.4, 0.1), this.woodDarkMat);
      post.position.set(rx, 0.7, 0);
      post.castShadow = true;
      rack.add(post);
    }
    const crossTop = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.08), this.woodMat);
    crossTop.position.set(0, 1.25, 0);
    rack.add(crossTop);
    const crossMid = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.08), this.woodMat);
    crossMid.position.set(0, 0.65, 0);
    rack.add(crossMid);

    // Swords & spears resting in the rack
    for (let i = -0.4; i <= 0.4; i += 0.25) {
      const sword = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 1.2, 0.02),
        createToonMaterial(Palette.warriorSteel, { emissive: Palette.warriorSteel, emissiveIntensity: 0.1 }),
      );
      sword.position.set(i, 0.85, 0.05);
      sword.rotation.z = 0.05;
      rack.add(sword);
    }
    group.add(rack);

    // 2. Training Dummy (CASTLE_DUMMY_SPOT)
    const dummy = new THREE.Group();
    dummy.position.set(1.5, 0, 1.2);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.8, 6), this.woodDarkMat);
    pole.position.y = 0.9;
    dummy.add(pole);

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.28, 0.85, 8), createToonMaterial(Palette.path));
    body.position.y = 1.1;
    body.castShadow = true;
    dummy.add(body);

    const arms = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 0.12), this.woodMat);
    arms.position.y = 1.35;
    dummy.add(arms);

    const dummyHelm = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.35, 6), this.ironMat);
    dummyHelm.position.y = 1.7;
    dummy.add(dummyHelm);
    group.add(dummy);

    // 3. Archery Target (CASTLE_TARGET_SPOT)
    const target = new THREE.Group();
    target.position.set(-1.6, 0, 1.4);
    target.rotation.y = 0.2;

    const tripodA = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.6, 4), this.woodDarkMat);
    tripodA.position.set(-0.3, 0.75, 0);
    tripodA.rotation.z = 0.2;
    target.add(tripodA);
    const tripodB = tripodA.clone();
    tripodB.position.x = 0.3;
    tripodB.rotation.z = -0.2;
    target.add(tripodB);

    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.65, 0.12, 16), createToonMaterial(Palette.pathDark));
    disc.rotation.x = Math.PI / 2;
    disc.position.set(0, 1.05, 0.08);
    target.add(disc);

    const bullseye = new THREE.Mesh(new THREE.CircleGeometry(0.25, 12), createToonMaterial(0xd84545));
    bullseye.position.set(0, 1.05, 0.15);
    target.add(bullseye);
    group.add(target);

    this.root.add(group);
    this.obstacles.push({ x, z, radius: 1.6 });
  }

  /**
   * Fortified stone brazier with burning flame and warm light.
   */
  private addCastleBrazier(x: number, z: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.name = 'CastleBrazier';

    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.55, 1.1, 8), this.castleSlateMat);
    pedestal.position.y = 0.55;
    pedestal.castShadow = true;
    pedestal.receiveShadow = true;
    group.add(pedestal);

    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.38, 0.35, 8), this.castleSlateLightMat);
    bowl.position.y = 1.25;
    bowl.castShadow = true;
    group.add(bowl);

    // Glowing flame cluster
    const flame = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28, 0), this.brazierFlameMat);
    flame.position.y = 1.55;
    flame.scale.set(1.0, 1.4, 1.0);
    flame.userData.baseScale = 1.0;
    flame.userData.phase = hash2(x, z) * 10;
    this.castleBrazierFlames.push(flame);
    group.add(flame);

    const light = addDynamicPointLight(group, 0xff9933, 0.65, 6.5, 2);
    if (light) light.position.y = 1.65;

    this.root.add(group);
    this.obstacles.push({ x, z, radius: 0.45 });
  }

  /**
   * Royal banner on high pole with wind animation.
   */
  private addCastleBanner(x: number, z: number, yaw: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = yaw;
    group.name = 'CastleBanner';

    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 4.2, 6), this.woodDarkMat);
    pole.position.y = 2.1;
    pole.castShadow = true;
    group.add(pole);

    const spearFinial = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.45, 4), this.royalGoldMat);
    spearFinial.position.y = 4.35;
    group.add(spearFinial);

    const pivot = new THREE.Group();
    pivot.position.set(0, 4.0, 0.05);
    pivot.userData.phase = hash2(x, z) * 6;
    pivot.userData.amp = 0.14;

    const crossArm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.4, 4), this.woodMat);
    crossArm.rotation.z = Math.PI / 2;
    pivot.add(crossArm);

    // Royal Blue banner body
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.4), this.royalBlueMat);
    cloth.position.set(0, -1.2, 0);
    cloth.castShadow = true;
    pivot.add(cloth);

    // Golden border & emblem stripe
    const border = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.18), this.royalGoldMat);
    border.position.set(0, -0.6, 0.01);
    pivot.add(border);

    const emblem = new THREE.Mesh(new THREE.CircleGeometry(0.28, 6), this.royalGoldMat);
    emblem.position.set(0, -1.2, 0.01);
    pivot.add(emblem);

    group.add(pivot);
    this.castleBannerPivots.push(pivot);

    this.root.add(group);
    this.obstacles.push({ x, z, radius: 0.35 });
  }

  /**
   * Royal Treasury Chest in the castle grounds.
   */
  private addCastleRoyalChest(x: number, z: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = -Math.PI * 0.35;
    group.name = 'CastleRoyalChest';

    // Stone chest dais
    const dais = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.18, 1.4), this.castleSlateLightMat);
    dais.position.y = 0.09;
    dais.receiveShadow = true;
    group.add(dais);

    // Gilded royal chest body
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.55, 0.65), this.royalBlueMat);
    body.position.y = 0.45;
    body.castShadow = true;
    group.add(body);

    const goldBands = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.57, 0.68), this.royalGoldMat);
    goldBands.position.y = 0.45;
    goldBands.scale.set(0.9, 1.02, 1.02);
    group.add(goldBands);

    // Chest lid
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.95, 8), this.royalBlueMat);
    lid.rotation.z = Math.PI / 2;
    lid.position.set(0, 0.72, 0);
    lid.scale.set(1, 0.6, 1);
    lid.castShadow = true;
    group.add(lid);

    const lock = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), this.royalGoldMat);
    lock.position.set(0, 0.55, 0.34);
    group.add(lock);

    this.root.add(group);
    this.obstacles.push({ x, z, radius: 0.6 });
  }

  /** Procedural KayKit-cottage stand-in for a residential home (pack-swapped later). */
  private addResidentialHome(x: number, z: number, scale: number, yaw: number): void {
    this.homePlacements.push({ x, z, scale, yaw });
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = yaw;
    group.scale.setScalar(scale);
    group.userData.proceduralProp = true;
    group.name = 'ResidentialHomeStandIn';

    const walls = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.6, 2.1), this.rockLightMat);
    walls.position.y = 0.8;
    walls.castShadow = true;
    walls.receiveShadow = true;
    group.add(walls);

    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.95, 1.2, 4), this.roofMat);
    roof.position.y = 2.15;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    group.add(roof);

    const door = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.82, 0.1), this.woodDarkMat);
    door.position.set(0, 0.42, 1.08);
    group.add(door);

    const window = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.36, 0.08), this.pondMat);
    window.position.set(-0.65, 1.0, 1.06);
    group.add(window);

    this.root.add(group);
    this.obstacles.push({ x, z, radius: 1.6 });
  }

  /** Tiny door stoop marker — no soft collision (walk-up E interact). */
  private addResidentialDoorMarker(x: number, z: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.name = 'ResidentialDoorMarker';

    const step = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.1, 0.55), this.rockLightMat);
    step.position.y = 0.06;
    step.receiveShadow = true;
    group.add(step);

    const mat = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.04, 0.35), this.woodMat);
    mat.position.y = 0.12;
    group.add(mat);

    this.root.add(group);
  }

  /**
   * Procedural town-chapel stand-in (nave + steeple) — pack-swapped for KayKit church.
   * Distinct silhouette from cottages and from the east meadow ruin shrine.
   */
  private addResidentialChapel(x: number, z: number, scale: number, yaw: number): void {
    this.chapelPlacement = { x, z, scale, yaw };
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = yaw;
    group.scale.setScalar(scale);
    group.userData.proceduralProp = true;
    group.name = 'ResidentialChapelStandIn';

    const nave = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.9, 3.1), this.rockLightMat);
    nave.position.y = 0.95;
    nave.castShadow = true;
    nave.receiveShadow = true;
    group.add(nave);

    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.15, 1.15, 4), this.roofMat);
    roof.position.set(0, 2.35, -0.15);
    roof.rotation.y = Math.PI / 4;
    roof.scale.set(1, 1, 1.15);
    roof.castShadow = true;
    group.add(roof);

    // Steeple / tower — readable landmark vs cottage peaks and market fountain.
    const tower = new THREE.Mesh(new THREE.BoxGeometry(1.05, 2.4, 1.05), this.rockMat);
    tower.position.set(0, 2.0, -1.15);
    tower.castShadow = true;
    group.add(tower);

    const spire = new THREE.Mesh(new THREE.ConeGeometry(0.85, 1.55, 4), this.roofMat);
    spire.position.set(0, 3.9, -1.15);
    spire.rotation.y = Math.PI / 4;
    spire.castShadow = true;
    group.add(spire);

    const door = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.05, 0.12), this.woodDarkMat);
    door.position.set(0, 0.55, 1.58);
    group.add(door);

    const rose = new THREE.Mesh(
      new THREE.CircleGeometry(0.28, 8),
      createToonMaterial(Palette.flowerCyan, {
        emissive: Palette.flowerCyan,
        emissiveIntensity: 0.35,
      }),
    );
    rose.position.set(0, 1.55, 1.56);
    group.add(rose);

    // Soft gold trim band — chapel accent (not fountain gold spout / cyan crystal).
    const trim = new THREE.Mesh(
      new THREE.BoxGeometry(2.65, 0.12, 3.15),
      createToonMaterial(0xc9a24a, {
        emissive: 0xc9a24a,
        emissiveIntensity: 0.12,
      }),
    );
    trim.position.y = 1.7;
    group.add(trim);

    this.root.add(group);
    // Slightly tighter than cottage so the east-rim pack radius clears the lane.
    this.obstacles.push({ x, z, radius: 1.55 });
  }

  /**
   * Small chapel apron — cobble pad, benches, lantern toward the street.
   * Soft collisions leave the door lane open; E interact uses RESIDENTIAL_CHAPEL_DOOR.
   */
  private addResidentialChapelYard(chapelX: number, chapelZ: number): void {
    // Apron sits toward the homes plaza / door pad (west-southwest of the church).
    const x = chapelX - 2.6;
    const z = chapelZ - 0.6;
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.name = 'ResidentialChapelYard';

    const apron = new THREE.Mesh(
      new THREE.CylinderGeometry(1.85, 1.95, 0.08, 12),
      createToonMaterial(Palette.rock),
    );
    apron.position.y = 0.04;
    apron.receiveShadow = true;
    group.add(apron);

    // Two simple benches flanking the approach
    for (const [bx, bz] of [
      [-0.95, 0.55],
      [0.85, -0.35],
    ] as const) {
      const bench = new THREE.Group();
      bench.position.set(bx, 0, bz);
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.1, 0.32), this.woodMat);
      seat.position.y = 0.38;
      seat.castShadow = true;
      bench.add(seat);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.35, 0.08), this.woodDarkMat);
      back.position.set(0, 0.58, -0.14);
      bench.add(back);
      for (const lx of [-0.38, 0.38]) {
        const leg = new THREE.Mesh(
          new THREE.BoxGeometry(0.08, 0.36, 0.08),
          this.woodDarkMat,
        );
        leg.position.set(lx, 0.18, 0.08);
        bench.add(leg);
      }
      group.add(bench);
      this.obstacles.push({ x: x + bx, z: z + bz, radius: 0.42 });
    }

    // Soft candle glow on a low plinth (not the meadow shrine crystal)
    const plinth = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.28, 0.35, 6),
      this.rockLightMat,
    );
    plinth.position.set(0.15, 0.18, -0.85);
    plinth.castShadow = true;
    group.add(plinth);
    const candleMat = createToonMaterial(Palette.flowerYellow, {
      emissive: 0xffcc66,
      emissiveIntensity: 0.85,
    });
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.1, 5, 4), candleMat);
    flame.position.set(0.15, 0.48, -0.85);
    group.add(flame);
    const light = addDynamicPointLight(group, 0xffc070, 0.35, 4.2, 2);
    if (light) light.position.set(0.15, 0.55, -0.85);

    this.root.add(group);
  }

  /** Low wooden fence segment beside the street lane. */
  private addResidentialFence(x: number, z: number, yaw: number, length: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = yaw;
    group.name = 'ResidentialFence';

    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(length, 0.1, 0.1),
      this.woodMat,
    );
    rail.position.y = 0.55;
    rail.castShadow = true;
    group.add(rail);

    const railLow = new THREE.Mesh(
      new THREE.BoxGeometry(length * 0.95, 0.08, 0.08),
      this.woodDarkMat,
    );
    railLow.position.y = 0.28;
    group.add(railLow);

    for (const ox of [-length * 0.4, 0, length * 0.4]) {
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.85, 0.12),
        this.woodDarkMat,
      );
      post.position.set(ox, 0.42, 0);
      post.castShadow = true;
      group.add(post);
    }

    this.root.add(group);
    this.obstacles.push({ x, z, radius: Math.min(0.85, 0.35 + length * 0.12) });
  }

  /**
   * Warm street lantern post — light dressing along the homes lane.
   * Soft post collision only; modest point light (plaza-like) so MeshToon stays readable.
   */
  private addResidentialLantern(x: number, z: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.name = 'ResidentialLantern';

    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.09, 2.1, 5),
      this.woodDarkMat,
    );
    post.position.y = 1.05;
    post.castShadow = true;
    group.add(post);

    const lanternMat = createToonMaterial(Palette.flowerYellow, {
      emissive: 0xffaa44,
      emissiveIntensity: 0.85,
    });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5), lanternMat);
    lamp.position.y = 2.15;
    group.add(lamp);

    // Dim + short range — denser street lamps must not blow out MeshToon.
    const light = addDynamicPointLight(group, 0xffb060, 0.4, 4.8, 2);
    if (light) light.position.y = 2.2;

    this.root.add(group);
    this.obstacles.push({ x, z, radius: 0.32 });
  }

  /** Small garden / veggie patch between homes — soft blocker, reads from iso. */
  private addResidentialGarden(x: number, z: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.name = 'ResidentialGarden';

    const soil = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.12, 1.35),
      createToonMaterial(Palette.pathDark),
    );
    soil.position.y = 0.06;
    soil.receiveShadow = true;
    group.add(soil);

    const bedMat = createToonMaterial(Palette.leafA, {
      emissive: Palette.leafA,
      emissiveIntensity: 0.08,
    });
    for (let i = 0; i < 5; i++) {
      const row = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.14, 0.16), bedMat);
      row.position.set(0, 0.16, -0.45 + i * 0.22);
      group.add(row);
    }

    const flowerColors = [Palette.flowerPink, Palette.flowerYellow, Palette.flowerCyan];
    for (let i = 0; i < 4; i++) {
      const bloom = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 5, 5),
        createToonMaterial(flowerColors[i % flowerColors.length]!, {
          emissive: flowerColors[i % flowerColors.length]!,
          emissiveIntensity: 0.15,
        }),
      );
      bloom.position.set(-0.45 + i * 0.3, 0.32, (i % 2 === 0 ? -0.2 : 0.25));
      group.add(bloom);
    }

    this.root.add(group);
    this.obstacles.push({ x, z, radius: 0.85 });
  }

  /** Procedural well stand-in for the residential accent (KayKit pack-swapped). */
  private addResidentialWellStandIn(x: number, z: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.userData.proceduralProp = true;
    group.name = 'ResidentialWellStandIn';

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.65, 0.55, 8),
      this.rockMat,
    );
    base.position.y = 0.28;
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.48, 0.08, 6, 12),
      this.rockLightMat,
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.55;
    group.add(rim);

    const postL = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.06, 1.1, 5),
      this.woodDarkMat,
    );
    postL.position.set(-0.4, 1.05, 0);
    group.add(postL);
    const postR = postL.clone();
    postR.position.x = 0.4;
    group.add(postR);

    const beam = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.1, 0.1), this.woodMat);
    beam.position.y = 1.55;
    group.add(beam);

    this.root.add(group);
    this.obstacles.push({ x, z, radius: 0.55 });
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

    // Banner poles on outer faces — cloth hangs from a top pivot (wind sway).
    for (const side of [-1, 1]) {
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.08, 3.2, 5),
        this.woodDarkMat,
      );
      pole.position.set(side * 3.45, 4.2, 0.15);
      pole.castShadow = true;
      group.add(pole);

      const pivot = new THREE.Group();
      pivot.position.set(side * 3.45, 4.25, 0.55);
      pivot.userData.phase = side * 0.7;
      pivot.userData.amp = 0.11;
      const banner = new THREE.Mesh(
        new THREE.PlaneGeometry(0.95, 1.75),
        this.bannerMat,
      );
      banner.position.set(0, -0.88, 0);
      banner.castShadow = true;
      pivot.add(banner);
      const stripe = new THREE.Mesh(
        new THREE.PlaneGeometry(0.6, 0.14),
        this.bannerTrimMat,
      );
      stripe.position.set(0, -0.45, 0.01);
      pivot.add(stripe);
      group.add(pivot);
      this.gateBannerPivots.push(pivot);
    }

    // Large readable cloth on the approach face of the lintel — hangs above the
    // walk lane (no soft collision; cloth must not shove the player).
    {
      const hang = new THREE.Group();
      hang.name = 'CityGateArchBanner';
      hang.position.set(0, 5.0, -0.82);
      hang.userData.phase = 0.2;
      hang.userData.amp = 0.14;
      const rod = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 2.55, 5),
        this.woodDarkMat,
      );
      rod.rotation.z = Math.PI / 2;
      rod.castShadow = true;
      hang.add(rod);
      const cloth = new THREE.Mesh(
        new THREE.PlaneGeometry(2.35, 2.05),
        this.bannerMat,
      );
      cloth.position.set(0, -1.05, 0);
      cloth.castShadow = true;
      hang.add(cloth);
      const stripe = new THREE.Mesh(
        new THREE.PlaneGeometry(1.55, 0.18),
        this.bannerTrimMat,
      );
      stripe.position.set(0, -0.55, 0.01);
      hang.add(stripe);
      const tip = new THREE.Mesh(
        new THREE.PlaneGeometry(0.55, 0.35),
        this.bannerTrimMat,
      );
      tip.position.set(0, -1.95, 0.01);
      hang.add(tip);
      group.add(hang);
      this.gateBannerPivots.push(hang);
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

  /**
   * Low-poly toon gate sentry — steel/teal kit (distinct from terracotta street vendor).
   * Soft collision beside the left pillar; arch center stays walkable into market.
   */
  private addGateGuard(x: number, z: number, yaw: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = yaw;
    group.name = 'CityGateGuard';

    // Steel + deep teal — KayKit-adjacent townsfolk sentry (not the plaza vendor).
    const skinMat = createToonMaterial(Palette.warriorSkin);
    const tunicMat = createToonMaterial(0x3d6b6e, {
      emissive: 0x2a4a4c,
      emissiveIntensity: 0.05,
    });
    const armorMat = createToonMaterial(Palette.warriorSteel, {
      emissive: Palette.warriorSteel,
      emissiveIntensity: 0.04,
    });
    const trimMat = createToonMaterial(Palette.warriorTrimGold, {
      emissive: Palette.warriorTrimGold,
      emissiveIntensity: 0.1,
    });
    const bootMat = createToonMaterial(Palette.warriorBoot);
    const hairMat = createToonMaterial(0x2a2430);
    const woodMat = createToonMaterial(Palette.woodDark);
    const bladeMat = createToonMaterial(Palette.warriorSteelDark, {
      emissive: Palette.warriorSteel,
      emissiveIntensity: 0.08,
    });

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.4, 14),
      createToonMaterial(0x1a2818, { transparent: true, opacity: 0.28 }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    group.add(shadow);

    const boots = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.18, 0.38), bootMat);
    boots.position.y = 0.1;
    boots.castShadow = true;
    group.add(boots);

    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.58, 0.3), tunicMat);
    legs.position.y = 0.46;
    legs.castShadow = true;
    group.add(legs);

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.64, 0.36), armorMat);
    torso.position.y = 1.04;
    torso.castShadow = true;
    group.add(torso);

    const tabard = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.55, 0.08), tunicMat);
    tabard.position.set(0, 0.9, 0.22);
    tabard.castShadow = true;
    group.add(tabard);

    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.1, 0.38), trimMat);
    belt.position.y = 0.74;
    group.add(belt);

    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.52, 0.17), armorMat);
    armL.position.set(-0.4, 1.0, 0.04);
    armL.rotation.z = 0.22;
    armL.castShadow = true;
    group.add(armL);

    const armR = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.52, 0.17), armorMat);
    armR.position.set(0.4, 1.0, 0.04);
    armR.rotation.z = -0.12;
    armR.castShadow = true;
    group.add(armR);

    // Round shield on left arm — readable sentry silhouette from iso.
    const shield = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.34, 0.08, 10),
      createToonMaterial(0x4a7a7e, {
        emissive: 0x3d6b6e,
        emissiveIntensity: 0.08,
      }),
    );
    shield.rotation.z = Math.PI / 2;
    shield.rotation.y = 0.35;
    shield.position.set(-0.52, 1.05, 0.18);
    shield.castShadow = true;
    group.add(shield);
    const boss = new THREE.Mesh(new THREE.CircleGeometry(0.1, 8), trimMat);
    boss.position.set(-0.56, 1.05, 0.22);
    boss.rotation.y = 0.35;
    group.add(boss);

    // Spear planted beside the right side — idle stance, not blocking the arch.
    const spearGroup = new THREE.Group();
    spearGroup.position.set(0.42, 0, 0.12);
    spearGroup.rotation.z = -0.08;
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.04, 2.55, 5),
      woodMat,
    );
    shaft.position.y = 1.35;
    shaft.castShadow = true;
    spearGroup.add(shaft);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.32, 5), bladeMat);
    tip.position.y = 2.75;
    tip.castShadow = true;
    spearGroup.add(tip);
    group.add(spearGroup);

    const head = new THREE.Group();
    head.name = 'GateGuardHead';
    head.position.y = 1.52;
    const skull = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.34), skinMat);
    skull.castShadow = true;
    head.add(skull);
    const helm = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.2, 0.4), armorMat);
    helm.position.y = 0.18;
    helm.castShadow = true;
    head.add(helm);
    const plume = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.28, 0.12), tunicMat);
    plume.position.set(0, 0.38, -0.02);
    head.add(plume);
    const hair = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.12, 0.2), hairMat);
    hair.position.set(0, 0.08, -0.12);
    head.add(hair);
    group.add(head);

    this.root.add(group);
    this.obstacles.push({ x, z, radius: 0.55 });

    this.gateGuardGroup = group;
    this.gateGuardHead = head;
    this.gateGuardBaseYaw = yaw;
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

  /**
   * Low-poly toon street vendor at the NW plaza stall — no civilian KayKit mesh in pack.
   * Soft collision keeps the player from walking through; plaza lanes stay open.
   */
  private addMarketStreetVendor(x: number, z: number, yaw: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = yaw;
    group.name = 'MarketStreetVendor';

    const skinMat = createToonMaterial(Palette.warriorSkin);
    const tunicMat = createToonMaterial(0xc45a3a, {
      emissive: 0xc45a3a,
      emissiveIntensity: 0.06,
    });
    const apronMat = createToonMaterial(Palette.signBoard);
    const hairMat = createToonMaterial(Palette.warriorHair);
    const bootMat = createToonMaterial(Palette.warriorBoot);

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.38, 14),
      createToonMaterial(0x1a2818, { transparent: true, opacity: 0.28 }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    group.add(shadow);

    const boots = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.36), bootMat);
    boots.position.y = 0.1;
    boots.castShadow = true;
    group.add(boots);

    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.55, 0.28), tunicMat);
    legs.position.y = 0.45;
    legs.castShadow = true;
    group.add(legs);

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.62, 0.34), tunicMat);
    torso.position.y = 1.02;
    torso.castShadow = true;
    group.add(torso);

    const apron = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.5, 0.08), apronMat);
    apron.position.set(0, 0.88, 0.2);
    apron.castShadow = true;
    group.add(apron);

    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.16), skinMat);
    armL.position.set(-0.38, 0.98, 0.05);
    armL.rotation.z = 0.18;
    armL.castShadow = true;
    group.add(armL);

    const armR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.16), skinMat);
    armR.position.set(0.38, 0.98, 0.05);
    armR.rotation.z = -0.18;
    armR.castShadow = true;
    group.add(armR);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.34), skinMat);
    head.position.y = 1.52;
    head.castShadow = true;
    group.add(head);

    const hair = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.38), hairMat);
    hair.position.y = 1.72;
    hair.castShadow = true;
    group.add(hair);

    // Tiny bread loaf silhouette so the stall reads as a snack vendor from iso.
    const loaf = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.1, 0.12, 3, 6),
      createToonMaterial(0xe8b060, { emissive: 0xe8b060, emissiveIntensity: 0.08 }),
    );
    loaf.position.set(0.22, 1.05, 0.28);
    loaf.rotation.z = Math.PI / 2;
    loaf.castShadow = true;
    group.add(loaf);

    this.root.add(group);
    this.obstacles.push({ x, z, radius: 0.55 });
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

  /**
   * Warm street lantern on the market cobble rim — procedural post + toon bulb.
   * Soft pole collision only; modest point light so MeshToon stays readable.
   */
  private addMarketPlazaLantern(x: number, z: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.name = 'MarketPlazaLantern';

    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.09, 2.2, 5),
      this.woodDarkMat,
    );
    post.position.y = 1.1;
    post.castShadow = true;
    group.add(post);

    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 0.07, 0.07),
      this.woodDarkMat,
    );
    arm.position.set(0.22, 2.05, 0);
    arm.castShadow = true;
    group.add(arm);

    const lanternMat = createToonMaterial(Palette.flowerYellow, {
      emissive: 0xffaa44,
      emissiveIntensity: 0.85,
    });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.15, 6, 5), lanternMat);
    lamp.position.set(0.38, 1.95, 0);
    group.add(lamp);

    // Dim + short range — several plaza lamps must not blow out MeshToon.
    const light = addDynamicPointLight(group, 0xffb060, 0.4, 4.8, 2);
    if (light) light.position.set(0.38, 2.0, 0);

    this.root.add(group);
    this.obstacles.push({ x, z, radius: 0.32 });
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
   * SW gate approach, far NE homes exit, and SE docks exit stay open.
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

    // South chain — links toward the gate's SE flank, outside the inn footprint.
    // Stop before the open SE docks exit (do not continue to the old SE tower).
    this.addMarketWallTower(46.8, 41.2, false);
    this.addMarketWallSegment(49.4, 40.4, 1.45, 2.5);
    this.addMarketWallSegment(52.4, 40.2, 1.55, 2.5);
    this.addMarketWallTower(55.4, 41.0, true);
    this.addMarketWallSegment(57.2, 41.8, 1.75, 2.1);

    // Light east accent only — leave far NE for homes; leave SE gap for docks.
    this.addMarketWallSegment(62.4, 53.2, 2.35, 2.2);
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

  /**
   * Stylized plaza notice / bounty board — twin posts, papers, nails.
   * Soft collision only; fountain / stall lanes stay open.
   */
  private addMarketNoticeBoard(x: number, z: number, yaw: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = yaw;
    group.name = 'MarketNoticeBoard';

    const paperMat = createToonMaterial(0xf3e6c8);
    const paperAltMat = createToonMaterial(0xe8d9b0);
    const nailMat = createToonMaterial(0x6a6e72);

    for (const px of [-0.72, 0.72] as const) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.09, 2.35, 6),
        this.woodDarkMat,
      );
      post.position.set(px, 1.15, 0);
      post.castShadow = true;
      post.receiveShadow = true;
      group.add(post);
    }

    const beam = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.14, 0.12), this.woodMat);
    beam.position.set(0, 2.28, 0);
    beam.castShadow = true;
    group.add(beam);

    const board = new THREE.Mesh(new THREE.BoxGeometry(1.55, 1.15, 0.1), this.signBoardMat);
    board.position.set(0, 1.55, 0.02);
    board.castShadow = true;
    board.receiveShadow = true;
    group.add(board);

    const header = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.16, 0.12), this.bannerMat);
    header.position.set(0, 2.05, 0.08);
    group.add(header);

    const papers: Array<[number, number, number, number, number, THREE.Material]> = [
      [-0.32, 1.85, 0.09, 0.42, 0.34, paperMat],
      [0.28, 1.78, 0.1, 0.38, 0.4, paperAltMat],
      [-0.18, 1.35, 0.09, 0.48, 0.3, paperMat],
      [0.35, 1.32, 0.1, 0.34, 0.28, paperAltMat],
    ];
    for (const [px, py, pz, w, h, mat] of papers) {
      const paper = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.02), mat);
      paper.position.set(px, py, pz);
      paper.rotation.z = (hash2(px + x, py + z) - 0.5) * 0.22;
      paper.castShadow = true;
      group.add(paper);

      const nail = new THREE.Mesh(new THREE.SphereGeometry(0.035, 5, 4), nailMat);
      nail.position.set(px, py + h * 0.38, pz + 0.02);
      group.add(nail);
    }

    this.root.add(group);
    this.obstacles.push({ x, z, radius: 0.42 });
  }

  /**
   * Intact traveling merchant wagon on the SE plaza cobble — wheels, bed,
   * crate/barrel load, cloth tarp. Distinct from the south-ford wreck.
   * Soft collision only; fountain / gate lanes stay open. No extra lights.
   */
  private addMarketTravelingWagon(x: number, z: number, yaw: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = yaw;
    group.name = 'MarketTravelingWagon';

    const tarpMat = createToonMaterial(0xe07038, {
      emissive: 0xe07038,
      emissiveIntensity: 0.14,
      side: THREE.DoubleSide,
    });
    const sackWarmMat = createToonMaterial(Palette.flowerYellow);
    const sackSpiceMat = createToonMaterial(Palette.roofTile);
    const sackDustMat = createToonMaterial(0xc4a06a);

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1.15, 14),
      createToonMaterial(0x1a2818, { transparent: true, opacity: 0.28 }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    group.add(shadow);

    const bed = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.16, 1.95), this.woodMat);
    bed.position.y = 0.62;
    bed.castShadow = true;
    bed.receiveShadow = true;
    group.add(bed);

    const under = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.18, 1.55), this.woodDarkMat);
    under.position.y = 0.44;
    under.castShadow = true;
    group.add(under);

    for (const sz of [-0.56, 0.56] as const) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.42, 1.8), this.woodDarkMat);
      rail.position.set(sz, 0.88, 0);
      rail.castShadow = true;
      group.add(rail);
    }
    const tailgate = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.38, 0.09), this.woodDarkMat);
    tailgate.position.set(0, 0.86, -0.94);
    tailgate.castShadow = true;
    group.add(tailgate);
    const headboard = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.32, 0.09), this.woodMat);
    headboard.position.set(0, 0.84, 0.94);
    headboard.castShadow = true;
    group.add(headboard);

    for (const zAxle of [-0.58, 0.58] as const) {
      const axle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.055, 0.055, 1.42, 6),
        this.woodDarkMat,
      );
      axle.rotation.z = Math.PI * 0.5;
      axle.position.set(0, 0.4, zAxle);
      group.add(axle);
      for (const xWheel of [-0.68, 0.68] as const) {
        // Solid disk wheels — torus rims vanish in the iso camera.
        const wheel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.4, 0.4, 0.12, 10),
          this.woodDarkMat,
        );
        wheel.rotation.z = Math.PI * 0.5;
        wheel.position.set(xWheel, 0.4, zAxle);
        wheel.castShadow = true;
        group.add(wheel);
        const rim = new THREE.Mesh(
          new THREE.TorusGeometry(0.4, 0.045, 5, 10),
          this.woodMat,
        );
        rim.rotation.y = Math.PI * 0.5;
        rim.position.set(xWheel, 0.4, zAxle);
        group.add(rim);
        const hub = new THREE.Mesh(
          new THREE.CylinderGeometry(0.09, 0.09, 0.16, 6),
          this.woodMat,
        );
        hub.rotation.z = Math.PI * 0.5;
        hub.position.set(xWheel, 0.4, zAxle);
        group.add(hub);
      }
    }

    const tongue = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.9), this.woodDarkMat);
    tongue.position.set(0, 0.44, 1.36);
    tongue.rotation.x = 0.16;
    tongue.castShadow = true;
    group.add(tongue);

    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.42, 0.46), this.woodMat);
    crate.position.set(-0.24, 0.92, 0.28);
    crate.rotation.y = 0.18;
    crate.castShadow = true;
    group.add(crate);
    const crate2 = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.3, 0.36), this.woodDarkMat);
    crate2.position.set(-0.2, 1.28, 0.24);
    crate2.rotation.y = -0.22;
    crate2.castShadow = true;
    group.add(crate2);

    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.26, 0.52, 8),
      this.woodMat,
    );
    barrel.position.set(0.3, 0.96, -0.12);
    barrel.castShadow = true;
    group.add(barrel);

    const sackA = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 5), sackWarmMat);
    sackA.position.set(0.26, 0.88, 0.48);
    sackA.scale.set(1.2, 0.85, 1.08);
    sackA.castShadow = true;
    group.add(sackA);
    const sackB = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 5), sackSpiceMat);
    sackB.position.set(-0.3, 0.86, -0.48);
    sackB.scale.set(1.25, 0.82, 1.12);
    sackB.castShadow = true;
    group.add(sackB);
    const sackC = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5), sackDustMat);
    sackC.position.set(0.1, 0.84, -0.7);
    sackC.scale.set(1.15, 0.78, 1.2);
    sackC.castShadow = true;
    group.add(sackC);

    // Peaked spice tarp — reads at iso distance over the load.
    const tarpL = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.07, 1.35), tarpMat);
    tarpL.position.set(-0.28, 1.42, -0.06);
    tarpL.rotation.z = 0.48;
    tarpL.castShadow = true;
    group.add(tarpL);
    const tarpR = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.07, 1.35), tarpMat);
    tarpR.position.set(0.28, 1.42, -0.06);
    tarpR.rotation.z = -0.48;
    tarpR.castShadow = true;
    group.add(tarpR);
    const tarpFlap = new THREE.Mesh(new THREE.PlaneGeometry(1.12, 0.5), tarpMat);
    tarpFlap.position.set(0, 1.12, -0.72);
    tarpFlap.rotation.x = 0.48;
    group.add(tarpFlap);

    this.root.add(group);
    this.obstacles.push({ x, z, radius: 1.1 });
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
    const light = addDynamicPointLight(group, 0xff7a30, 0.85, 7.5, 2);
    if (light) light.position.set(-0.35, 1.15, -0.1);
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
      const light = addDynamicPointLight(group, 0xffb060, 0.55, 5.5, 2);
      if (light) light.position.set(lx, 1.5, lz);
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
   * Cheap wind sine on city-gate cloth pivots (arch face + flank banners).
   * Call once per frame from the game loop; no cloth sim / no collision.
   */
  updateGateBanners(dt: number): void {
    if (this.gateBannerPivots.length === 0) return;
    this.gateBannerT += dt;
    const t = this.gateBannerT;
    for (let i = 0; i < this.gateBannerPivots.length; i++) {
      const pivot = this.gateBannerPivots[i]!;
      const phase = (pivot.userData.phase as number) ?? i * 0.85;
      const amp = (pivot.userData.amp as number) ?? 0.12;
      // Gust along local X (out from arch) + soft lateral flutter.
      pivot.rotation.x = Math.sin(t * 1.55 + phase) * amp;
      pivot.rotation.z = Math.sin(t * 2.1 + phase * 1.3) * amp * 0.35;
    }
  }

  /**
   * Idle spear sway + slight head yaw toward the player when close.
   * Call once per frame from the game loop (optional flavor; no combat AI).
   */
  updateGateGuard(dt: number, playerPos: THREE.Vector3): void {
    const group = this.gateGuardGroup;
    const head = this.gateGuardHead;
    if (!group || !head) return;

    this.gateGuardIdleT += dt;
    const idle = this.gateGuardIdleT;
    // Soft planted stance — tiny vertical bob, not a full walk cycle.
    group.position.y = Math.sin(idle * 1.7) * 0.012;

    const dx = playerPos.x - group.position.x;
    const dz = playerPos.z - group.position.z;
    const distSq = dx * dx + dz * dz;
    const trackRadiusSq = 9 * 9;
    let headYaw = 0;
    if (distSq < trackRadiusSq && distSq > 1e-4) {
      const worldYaw = Math.atan2(dx, dz);
      let delta = worldYaw - this.gateGuardBaseYaw;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      // Cap so the helmet doesn't spin through the body.
      headYaw = THREE.MathUtils.clamp(delta, -0.55, 0.55);
    }
    head.rotation.y = THREE.MathUtils.lerp(head.rotation.y, headYaw, 1 - Math.exp(-6 * dt));
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
      // Was (28, 30) → (22, 36) — (22, 36) r≈1.65 moss mound caged with NE rim trees.
      // Parked farther NE rim (outside gate-road cone and NE pocket skip).
      [27, 42, 1.1, 0.85],
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
    // Camera occlusion fade (pack swap rebuilds this list with KayKit crowns).
    group.userData.foliageOccluder = true;

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
    low.userData.foliageOccluder = true;
    group.add(low);

    const mid = new THREE.Mesh(this.canopyMidGeo, hash2(x + 1, z) > 0.5 ? leafMat : this.leafDark);
    mid.position.y = 2.45;
    mid.castShadow = true;
    mid.userData.foliageOccluder = true;
    group.add(mid);

    const top = new THREE.Mesh(this.canopyTopGeo, leafMat);
    top.position.y = 3.25;
    top.castShadow = true;
    top.userData.foliageOccluder = true;
    group.add(top);

    this.root.add(group);
    this.foliageOccluders.push(group);
    // Trunk-only from birth — procedural leftovers must not keep a crown cylinder
    // when pack swap is skipped / partial. Crowns stay walk-under dressing.
    this.obstacles.push({ x, z, radius: TREE_TRUNK_RADIUS * scale });
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
   * pack instances. Soft-collision radii are retuned via `PROP_COLLISION_SCALE`
   * (buildings match Adventurers-relative bulk; trees keep absolute trunk radii so
   * crowns stay walk-under; bushes stay walk-through dressing). Paths, shrine/chest
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
    // Procedural tree groups are gone — rebuild the occlusion list with pack crowns.
    this.foliageOccluders.length = 0;

    let placed = 0;
    for (let i = 0; i < this.treePlacements.length; i++) {
      const p = this.treePlacements[i]!;
      const mesh = library.createTree(p.x, p.z, p.scale, hash2(p.x, p.z) * 1000 + i);
      if (mesh) {
        this.root.add(mesh);
        this.foliageOccluders.push(mesh);
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

    // Residential street homes — KayKit cottages facing the lane.
    for (const home of this.homePlacements) {
      const mesh = library.createCottage(home.x, home.z, {
        scale: home.scale,
        yaw: home.yaw,
      });
      if (mesh) {
        mesh.name = 'ResidentialHome';
        this.root.add(mesh);
        placed += 1;
      }
    }

    // Residential town chapel — KayKit church (porch / benches stay procedural).
    if (this.chapelPlacement) {
      const chapel = library.createChurch(
        this.chapelPlacement.x,
        this.chapelPlacement.z,
        {
          scale: this.chapelPlacement.scale,
          yaw: this.chapelPlacement.yaw,
        },
      );
      if (chapel) {
        chapel.name = 'ResidentialChapel';
        this.root.add(chapel);
        placed += 1;
      }
    }

    if (this.residentialWellPlacement) {
      const well = library.createWell(
        this.residentialWellPlacement.x,
        this.residentialWellPlacement.z,
      );
      if (well) {
        well.name = 'ResidentialWell';
        this.root.add(well);
        placed += 1;
      }
    }

    this.retunePackObstacles();
    this.scatterPackBushes(library);
    return placed > 0;
  }

  /**
   * Retune soft-collision radii for swapped pack props via `PROP_COLLISION_SCALE`.
   * Trees: *set* trunk-only radius (never multiply by visual `PROP_SCALE.tree`).
   * Buildings / rocks still multiply so footprints match Adventurers bulk.
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
    const setRadius = (x: number, z: number, radius: number): void => {
      for (const o of this.obstacles) {
        if (o.x === x && o.z === z) {
          o.radius = radius;
          return;
        }
      }
    };

    // Absolute trunk radius — pack-swapped and procedural share the same stem collider.
    for (const p of this.treePlacements) {
      setRadius(p.x, p.z, PROP_COLLISION_SCALE.tree * p.scale);
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
    for (const home of this.homePlacements) {
      bump(home.x, home.z, PROP_COLLISION_SCALE.cottage);
    }
    if (this.chapelPlacement) {
      bump(
        this.chapelPlacement.x,
        this.chapelPlacement.z,
        PROP_COLLISION_SCALE.church,
      );
    }
    if (this.residentialWellPlacement) {
      bump(
        this.residentialWellPlacement.x,
        this.residentialWellPlacement.z,
        PROP_COLLISION_SCALE.well,
      );
    }
  }

  /**
   * Soft bush / shrub dressing near trees / meadow rim.
   * Walk-through only — never pushes into `obstacles` (camera must not sit inside
   * a bush collider; foliage is visual dressing around trunk-only trees).
   */
  private scatterPackBushes(library: WorldPropLibrary): void {
    const spots: Array<[number, number, number]> = [];
    // Nestle bushes beside a subset of trees (farther out — clear of stem colliders).
    for (let i = 0; i < this.treePlacements.length; i += 2) {
      const t = this.treePlacements[i]!;
      const ang = hash2(t.z, t.x) * Math.PI * 2;
      const r = 3.2 + hash2(t.x, i) * 1.4;
      spots.push([
        t.x + Math.cos(ang) * r,
        t.z + Math.sin(ang) * r,
        0.75 + hash2(i, t.z) * 0.45,
      ]);
    }
    // A few pocket-rim accents (clear of shrine / ford / NE spawn→gate walkways).
    spots.push(
      [24, -18, 0.9],
      [-26, 16, 0.85],
      // Was (18, 28) — sat in the NE foliage pocket beside camp trees.
      [4, 34, 0.95],
      [-18, -26, 0.8],
      // Was (8, 36) — kept west of the north/NE approach seam.
      [2, 38, 0.88],
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
      // Keep the NE/E spawn→gate meadow open — no bush wall beside trunk clusters.
      if (x > 8 && z > 20 && x < 28 && z < 42) continue;
      // Keep shrine / ford / gate centers open.
      if (Math.hypot(x - EastShrineClearing.x, z - EastShrineClearing.z) < 8) continue;
      if (Math.hypot(x - SouthRiverFordClearing.x, z - SouthRiverFordClearing.z) < 8) continue;
      if (Math.hypot(x - NortheastCityGate.x, z - NortheastCityGate.z) < 7) continue;
      if (
        Math.hypot(x - NortheastMarketDistrict.x, z - NortheastMarketDistrict.z) < 9
      ) {
        continue;
      }
      if (
        Math.hypot(x - NortheastResidentialStreet.x, z - NortheastResidentialStreet.z) < 8
      ) {
        continue;
      }
      if (Math.hypot(x - NortheastHarborDocks.x, z - NortheastHarborDocks.z) < 7.5) {
        continue;
      }
      const bush = library.createBush(x, z, s, hash2(x, z) * 500 + i);
      if (bush) {
        this.root.add(bush);
        this.foliageOccluders.push(bush);
      }
    }
  }

  /** KayKit / procedural tree & bush roots for camera foliage occlusion. */
  getFoliageOccluders(): readonly THREE.Object3D[] {
    return this.foliageOccluders;
  }

  /** True if inside main meadow, any corridor, clearing, NE gate, market, homes, or docks. */
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
    const hdx = x - this.northeastHomes.x;
    const hdz = z - this.northeastHomes.z;
    if (
      hdx * hdx + hdz * hdz <= this.northeastHomes.radius * this.northeastHomes.radius
    ) {
      return true;
    }
    const ddx = x - this.northeastDocks.x;
    const ddz = z - this.northeastDocks.z;
    if (
      ddx * ddx + ddz * ddz <= this.northeastDocks.radius * this.northeastDocks.radius
    ) {
      return true;
    }
    const cgx = x - this.northeastCastleGatehouse.x;
    const cgz = z - this.northeastCastleGatehouse.z;
    if (
      cgx * cgx + cgz * cgz <= this.northeastCastleGatehouse.radius * this.northeastCastleGatehouse.radius
    ) {
      return true;
    }
    const ckx = x - this.northeastCastle.x;
    const ckz = z - this.northeastCastle.z;
    if (
      ckx * ckx + ckz * ckz <= this.northeastCastle.radius * this.northeastCastle.radius
    ) {
      return true;
    }
    if (this.distToEastCorridor(x, z) <= this.eastCorridorHalfWidth) return true;
    if (this.distToWestCorridor(x, z) <= this.westCorridorHalfWidth) return true;
    if (this.distToNorthCorridor(x, z) <= this.northCorridorHalfWidth) return true;
    if (this.distToSouthCorridor(x, z) <= this.southCorridorHalfWidth) return true;
    if (this.distToNortheastCorridor(x, z) <= this.northeastCorridorHalfWidth) return true;
    if (this.distToMarketCorridor(x, z) <= this.marketCorridorHalfWidth) return true;
    if (this.distToResidentialCorridor(x, z) <= this.residentialCorridorHalfWidth) {
      return true;
    }
    if (this.distToDocksCorridor(x, z) <= this.docksCorridorHalfWidth) return true;
    if (this.distToCastleGateCorridor(x, z) <= this.castleCorridorHalfWidth) return true;
    return this.distToCastleCourtyardCorridor(x, z) <= this.castleCorridorHalfWidth;
  }

  /** Keep entities inside meadow ∪ corridors ∪ clearings ∪ NE gate ∪ market ∪ homes ∪ docks ∪ castle. */
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

  /** True when the player is on the residential street stub (discovery toast). */
  isNearResidentialStreet(position: THREE.Vector3): boolean {
    const dx = position.x - this.northeastHomes.x;
    const dz = position.z - this.northeastHomes.z;
    if (dx * dx + dz * dz <= 7.5 * 7.5) return true;
    return this.distToResidentialCorridor(position.x, position.z) <= 3.8;
  }

  /** True when the player is on the harbor / docks stub (discovery toast). */
  isNearHarborDocks(position: THREE.Vector3): boolean {
    const dx = position.x - this.northeastDocks.x;
    const dz = position.z - this.northeastDocks.z;
    if (dx * dx + dz * dz <= 7.0 * 7.0) return true;
    return this.distToDocksCorridor(position.x, position.z) <= 3.6;
  }

  /** True when the player approaches the Castle Gatehouse (discovery toast). */
  isNearCastleGatehouse(position: THREE.Vector3): boolean {
    const dx = position.x - this.northeastCastleGatehouse.x;
    const dz = position.z - this.northeastCastleGatehouse.z;
    if (dx * dx + dz * dz <= 7.5 * 7.5) return true;
    return this.distToCastleGateCorridor(position.x, position.z) <= 4.0;
  }

  /** True when the player enters the Grand Castle Keep courtyard (discovery toast). */
  isNearCastleKeep(position: THREE.Vector3): boolean {
    const dx = position.x - this.northeastCastle.x;
    const dz = position.z - this.northeastCastle.z;
    if (dx * dx + dz * dz <= 12.0 * 12.0) return true;
    return this.distToCastleCourtyardCorridor(position.x, position.z) <= 4.5;
  }

  /** Update castle banner wind sway, brazier flame flicker, and knight captain head tracking. */
  updateCastleAmbience(dt: number, heroPosition?: THREE.Vector3): void {
    this.castleAnimT += dt;
    this.knightCaptainIdleT += dt;

    // 1. Wind sway on heraldic banners
    for (const pivot of this.castleBannerPivots) {
      const phase = (pivot.userData.phase as number) ?? 0;
      const amp = (pivot.userData.amp as number) ?? 0.12;
      pivot.rotation.z = Math.sin(this.castleAnimT * 2.2 + phase) * amp;
      pivot.rotation.x = Math.cos(this.castleAnimT * 1.6 + phase) * (amp * 0.45);
    }

    // 2. Flame scale / flicker on stone braziers
    for (const flame of this.castleBrazierFlames) {
      const phase = (flame.userData.phase as number) ?? 0;
      const base = (flame.userData.baseScale as number) ?? 1.0;
      const flicker = 1.0 + Math.sin(this.castleAnimT * 8.0 + phase) * 0.12 + Math.cos(this.castleAnimT * 14.0 + phase) * 0.08;
      flame.scale.set(base * flicker, base * (1.3 + flicker * 0.2), base * flicker);
      flame.rotation.y += dt * 1.5;
    }

    // 3. Knight Captain head tracking & idle breathing
    if (this.knightCaptainHead && heroPosition) {
      const dx = heroPosition.x - CASTLE_KNIGHT_CAPTAIN.x;
      const dz = heroPosition.z - CASTLE_KNIGHT_CAPTAIN.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 14.0 && dist > 0.1) {
        const targetYaw = Math.atan2(dx, dz) - this.knightCaptainBaseYaw;
        const clampedYaw = THREE.MathUtils.clamp(targetYaw, -Math.PI * 0.45, Math.PI * 0.45);
        this.knightCaptainHead.rotation.y = THREE.MathUtils.lerp(
          this.knightCaptainHead.rotation.y,
          clampedYaw,
          dt * 4.0,
        );
      } else {
        this.knightCaptainHead.rotation.y = THREE.MathUtils.lerp(
          this.knightCaptainHead.rotation.y,
          0,
          dt * 2.0,
        );
      }
    }

    if (this.knightCaptainGroup) {
      this.knightCaptainGroup.position.y = Math.sin(this.knightCaptainIdleT * 1.8) * 0.015;
    }
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

  /** Keep props off the northeast dirt/stone road into the city gate + market + homes + docks + castle. */
  private isOnNortheastBranchApproach(x: number, z: number): boolean {
    if (x < 10 || z < 10) return false;
    // Wide cone along +X/+Z so the tree ring does not choke the NE exit / market street.
    if (x > 22 && z > 22 && Math.abs(x - z) < 12) return true;
    if (x > 15 && z > 32 && x < 24 && z < 40) return true;
    if (this.distToNortheastCorridor(x, z) < this.northeastCorridorHalfWidth + 1.6) {
      return true;
    }
    if (this.distToMarketCorridor(x, z) < this.marketCorridorHalfWidth + 1.4) {
      return true;
    }
    if (
      this.distToResidentialCorridor(x, z) < this.residentialCorridorHalfWidth + 1.3
    ) {
      return true;
    }
    if (this.distToDocksCorridor(x, z) < this.docksCorridorHalfWidth + 1.3) {
      return true;
    }
    if (this.distToCastleGateCorridor(x, z) < this.castleCorridorHalfWidth + 1.5) {
      return true;
    }
    if (this.distToCastleCourtyardCorridor(x, z) < this.castleCorridorHalfWidth + 1.5) {
      return true;
    }
    if (Math.hypot(x - this.northeastCastleGatehouse.x, z - this.northeastCastleGatehouse.z) < 8.0) {
      return true;
    }
    if (Math.hypot(x - this.northeastCastle.x, z - this.northeastCastle.z) < 14.0) {
      return true;
    }
    return meadowPathInfluence(x, z) > 0.35 && x > 14 && z > 14;
  }

  /** Distance from point to the east corridor segment (main rim → clearing). */
  private distToEastCorridor(x: number, z: number): number {
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

  /** Distance from point to the residential corridor segment (market → homes). */
  private distToResidentialCorridor(x: number, z: number): number {
    const ax = this.northeastMarket.x + 4.0;
    const az = this.northeastMarket.z + 4.0;
    const bx = this.northeastHomes.x - 1.5;
    const bz = this.northeastHomes.z - 1.5;
    return this.distToSegment(x, z, ax, az, bx, bz);
  }

  /** Distance from point to the docks corridor segment (market → harbor). */
  private distToDocksCorridor(x: number, z: number): number {
    const ax = this.northeastMarket.x + 6.5;
    const az = this.northeastMarket.z - 1.5;
    const bx = this.northeastDocks.x - 1.0;
    const bz = this.northeastDocks.z + 1.0;
    return this.distToSegment(x, z, ax, az, bx, bz);
  }

  /** Distance from point to the castle gatehouse corridor segment (homes → gatehouse). */
  private distToCastleGateCorridor(x: number, z: number): number {
    const ax = this.northeastHomes.x + 2.0;
    const az = this.northeastHomes.z + 2.0;
    const bx = this.northeastCastleGatehouse.x - 1.0;
    const bz = this.northeastCastleGatehouse.z - 1.0;
    return this.distToSegment(x, z, ax, az, bx, bz);
  }

  /** Distance from point to the castle keep corridor segment (gatehouse → keep). */
  private distToCastleCourtyardCorridor(x: number, z: number): number {
    const ax = this.northeastCastleGatehouse.x + 1.5;
    const az = this.northeastCastleGatehouse.z + 1.5;
    const bx = this.northeastCastle.x - 2.0;
    const bz = this.northeastCastle.z - 2.0;
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

    // Residential street rim
    {
      const dx = x - this.northeastHomes.x;
      const dz = z - this.northeastHomes.z;
      const d = Math.hypot(dx, dz) || 1;
      consider(
        this.northeastHomes.x + (dx / d) * this.northeastHomes.radius,
        this.northeastHomes.z + (dz / d) * this.northeastHomes.radius,
      );
    }

    // Harbor docks rim
    {
      const dx = x - this.northeastDocks.x;
      const dz = z - this.northeastDocks.z;
      const d = Math.hypot(dx, dz) || 1;
      consider(
        this.northeastDocks.x + (dx / d) * this.northeastDocks.radius,
        this.northeastDocks.z + (dz / d) * this.northeastDocks.radius,
      );
    }

    // Castle Gatehouse rim
    {
      const dx = x - this.northeastCastleGatehouse.x;
      const dz = z - this.northeastCastleGatehouse.z;
      const d = Math.hypot(dx, dz) || 1;
      consider(
        this.northeastCastleGatehouse.x + (dx / d) * this.northeastCastleGatehouse.radius,
        this.northeastCastleGatehouse.z + (dz / d) * this.northeastCastleGatehouse.radius,
      );
    }

    // Castle Keep rim
    {
      const dx = x - this.northeastCastle.x;
      const dz = z - this.northeastCastle.z;
      const d = Math.hypot(dx, dz) || 1;
      consider(
        this.northeastCastle.x + (dx / d) * this.northeastCastle.radius,
        this.northeastCastle.z + (dz / d) * this.northeastCastle.radius,
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

    // Market → residential corridor capsule surface
    this.considerCorridorSurface(
      x,
      z,
      this.northeastMarket.x + 4.0,
      this.northeastMarket.z + 4.0,
      this.northeastHomes.x - 1.5,
      this.northeastHomes.z - 1.5,
      this.residentialCorridorHalfWidth,
      consider,
    );

    // Market → docks corridor capsule surface
    this.considerCorridorSurface(
      x,
      z,
      this.northeastMarket.x + 6.5,
      this.northeastMarket.z - 1.5,
      this.northeastDocks.x - 1.0,
      this.northeastDocks.z + 1.0,
      this.docksCorridorHalfWidth,
      consider,
    );

    // Homes → Castle Gatehouse corridor capsule surface
    this.considerCorridorSurface(
      x,
      z,
      this.northeastHomes.x + 2.0,
      this.northeastHomes.z + 2.0,
      this.northeastCastleGatehouse.x - 1.0,
      this.northeastCastleGatehouse.z - 1.0,
      this.castleCorridorHalfWidth,
      consider,
    );

    // Gatehouse → Castle Courtyard corridor capsule surface
    this.considerCorridorSurface(
      x,
      z,
      this.northeastCastleGatehouse.x + 1.5,
      this.northeastCastleGatehouse.z + 1.5,
      this.northeastCastle.x - 2.0,
      this.northeastCastle.z - 2.0,
      this.castleCorridorHalfWidth,
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
