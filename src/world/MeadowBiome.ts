import * as THREE from 'three';
import {
  Palette,
  createToonMaterial,
  paintGroundVertexColors,
} from '../render/stylized';

export type Obstacle = { x: number; z: number; radius: number };

/** Shared stylized meadow: green ground, trees, rocks. Reuses geometries/materials. */
export class MeadowBiome {
  readonly root = new THREE.Group();
  readonly groundSize = 80;
  readonly playRadius = 34;
  /** Solid props used for soft collision (trees + rocks). */
  readonly obstacles: Obstacle[] = [];

  private readonly treeGeo = new THREE.ConeGeometry(0.95, 2.2, 7);
  private readonly treeTopGeo = new THREE.ConeGeometry(0.62, 1.35, 7);
  private readonly trunkGeo = new THREE.CylinderGeometry(0.2, 0.3, 1.05, 7);
  private readonly rockGeo = new THREE.DodecahedronGeometry(0.58, 0);
  private readonly rockSmallGeo = new THREE.DodecahedronGeometry(0.28, 0);
  private readonly flowerPetalGeo = new THREE.SphereGeometry(0.13, 7, 7);
  private readonly flowerCenterGeo = new THREE.SphereGeometry(0.07, 6, 6);
  private readonly stemGeo = new THREE.CylinderGeometry(0.025, 0.035, 0.28, 5);

  // White base so vertex colors carry the meadow mottling without a second multiply.
  private readonly grassMat = createToonMaterial(0xffffff);
  private readonly leafMat = createToonMaterial(Palette.leafA);
  private readonly leafMatB = createToonMaterial(Palette.leafB);
  private readonly leafMatC = createToonMaterial(Palette.leafC);
  private readonly trunkMat = createToonMaterial(Palette.trunk);
  private readonly rockMat = createToonMaterial(Palette.rock);
  private readonly mossMat = createToonMaterial(Palette.moss);
  private readonly stemMat = createToonMaterial(Palette.stem);
  private readonly flowerCenterMat = createToonMaterial(Palette.flowerWhite, {
    emissive: Palette.flowerYellow,
    emissiveIntensity: 0.12,
  });
  private readonly flowerMats = [
    createToonMaterial(Palette.flowerPink),
    createToonMaterial(Palette.flowerYellow),
    createToonMaterial(Palette.flowerCyan),
  ];
  private readonly pathMat = createToonMaterial(Palette.path);

  constructor() {
    this.root.name = 'MeadowBiome';
    this.grassMat.vertexColors = true;
    this.buildGround();
    this.buildRingOfTrees();
    this.scatterProps();
  }

  private buildGround(): void {
    // Higher segment count so vertex-color mottling reads as meadow, not flat paint.
    const groundGeo = new THREE.CircleGeometry(this.groundSize * 0.5, 64);
    paintGroundVertexColors(groundGeo, {
      a: Palette.grassA,
      b: Palette.grassB,
      c: Palette.grassC,
    });
    const ground = new THREE.Mesh(groundGeo, this.grassMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.root.add(ground);

    // Soft color band for mid-field depth without a second texture.
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(17, 27, 48),
      createToonMaterial(Palette.grassC),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.012;
    ring.receiveShadow = true;
    this.root.add(ring);

    const path = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 24), this.pathMat);
    path.rotation.x = -Math.PI / 2;
    path.position.set(0, 0.02, 3.5);
    path.receiveShadow = true;
    this.root.add(path);

    // Warm rim path accents so the dirt reads intentional, not a lone plane.
    const pathEdgeMat = createToonMaterial(Palette.pathEdge);
    for (const x of [-1.95, 1.95]) {
      const edge = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 24), pathEdgeMat);
      edge.rotation.x = -Math.PI / 2;
      edge.position.set(x, 0.021, 3.5);
      this.root.add(edge);
    }
  }

  private buildRingOfTrees(): void {
    const count = 28;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const radius = 30 + (i % 3) * 1.5;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      this.addTree(x, z, 0.85 + (i % 4) * 0.08);
    }
  }

  private scatterProps(): void {
    const treeSpots: Array<[number, number, number]> = [
      [-8, -6, 1],
      [10, -4, 1.1],
      [-12, 8, 0.9],
      [6, 12, 1.05],
      [-3, 16, 0.95],
      [14, 6, 1],
      [-16, -2, 1.15],
      [3, -12, 1],
    ];
    for (const [x, z, s] of treeSpots) this.addTree(x, z, s);

    // Deterministic rock placements so collision matches visuals across reloads
    const rockSpots: Array<[number, number, number]> = [
      [4.2, -3.1, 0.85],
      [-5.5, 2.4, 1.05],
      [9.1, 5.8, 0.7],
      [-9.4, -7.2, 0.95],
      [1.6, 11.3, 0.8],
      [-13.2, 1.1, 1.1],
      [11.8, -9.4, 0.75],
      [-2.8, -10.6, 0.9],
      [7.4, 14.2, 0.65],
      [-7.1, 12.5, 1.0],
      [15.2, 1.8, 0.85],
      [-14.6, -5.3, 0.7],
      [5.9, -14.1, 0.95],
      [-0.8, 7.6, 0.6],
      [12.4, 10.1, 0.8],
      [-10.8, 8.9, 0.75],
      [3.3, 3.7, 0.55],
      [-6.2, -13.4, 0.9],
    ];
    for (const [x, z, s] of rockSpots) this.addRock(x, z, s);

    const flowerSpots: Array<[number, number]> = [
      [2, 1],
      [-3, 4],
      [5, -2],
      [-6, -1],
      [8, 3],
      [-1, -5],
      [4, 8],
      [-8, 6],
      [10, -7],
      [-4, 10],
      [1, 13],
      [-11, -3],
      [7, 9],
      [-9, 0],
      [13, 4],
      [0, -9],
      [6, -11],
      [-5, -8],
      [9, 12],
      [-12, 5],
      [3, -6],
      [-2, 2],
      [11, -1],
      [-7, -11],
      [14, 7],
      [-13, 9],
      [2, -13],
      [8, -4],
      [-10, 11],
      [5, 5],
      [-3, -14],
      [12, -12],
      [-1, 8],
      [4, -8],
      [-14, -1],
      [0, 4],
      [7, 1],
      [-6, 7],
      [10, 8],
      [-8, -6],
    ];
    for (const [x, z] of flowerSpots) this.addFlower(x, z);
  }

  private pickLeafMat(x: number, z: number): THREE.MeshToonMaterial {
    const n = (Math.abs(Math.sin(x * 12.9898 + z * 78.233)) * 43758.5453) % 1;
    if (n > 0.66) return this.leafMatB;
    if (n > 0.33) return this.leafMat;
    return this.leafMatC;
  }

  private addTree(x: number, z: number, scale: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.scale.setScalar(scale);

    const trunk = new THREE.Mesh(this.trunkGeo, this.trunkMat);
    trunk.position.y = 0.52;
    trunk.castShadow = true;
    group.add(trunk);

    const leafMat = this.pickLeafMat(x, z);
    const canopy = new THREE.Mesh(this.treeGeo, leafMat);
    canopy.position.y = 1.85;
    canopy.castShadow = true;
    group.add(canopy);

    // Second cone for a chunkier low-poly silhouette (still one shared geo).
    const top = new THREE.Mesh(this.treeTopGeo, leafMat);
    top.position.y = 2.85;
    top.castShadow = true;
    group.add(top);

    this.root.add(group);
    this.obstacles.push({ x, z, radius: 0.55 * scale });
  }

  private addRock(x: number, z: number, scale: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const rock = new THREE.Mesh(this.rockGeo, this.rockMat);
    rock.position.y = 0.28 * scale;
    rock.scale.set(scale, scale * 0.72, scale * 1.12);
    rock.rotation.y = (x * 1.7 + z * 2.3) % (Math.PI * 2);
    rock.rotation.z = 0.12;
    rock.castShadow = true;
    rock.receiveShadow = true;
    group.add(rock);

    // Tiny moss cap — cheap color block so rocks aren't pure gray.
    const moss = new THREE.Mesh(this.rockSmallGeo, this.mossMat);
    moss.position.set(0.08 * scale, 0.42 * scale, 0.05 * scale);
    moss.scale.set(scale * 0.55, scale * 0.28, scale * 0.5);
    moss.castShadow = true;
    group.add(moss);

    this.root.add(group);
    this.obstacles.push({ x, z, radius: 0.42 * scale });
  }

  private addFlower(x: number, z: number): void {
    const idx = Math.abs(Math.floor(x * 3 + z * 5)) % this.flowerMats.length;
    const petalMat = this.flowerMats[idx]!;
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const stem = new THREE.Mesh(this.stemGeo, this.stemMat);
    stem.position.y = 0.14;
    group.add(stem);

    const petals = new THREE.Mesh(this.flowerPetalGeo, petalMat);
    petals.position.y = 0.32;
    petals.scale.set(1.05, 0.7, 1.05);
    group.add(petals);

    const center = new THREE.Mesh(this.flowerCenterGeo, this.flowerCenterMat);
    center.position.y = 0.38;
    group.add(center);

    this.root.add(group);
  }

  /** Keep entities inside the meadow play circle. */
  clampToPlayArea(position: THREE.Vector3): void {
    const r2 = this.playRadius * this.playRadius;
    const d2 = position.x * position.x + position.z * position.z;
    if (d2 > r2) {
      const d = Math.sqrt(d2);
      position.x = (position.x / d) * this.playRadius;
      position.z = (position.z / d) * this.playRadius;
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
