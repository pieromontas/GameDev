import * as THREE from 'three';

/** Shared stylized meadow: green ground, trees, rocks. Reuses geometries/materials. */
export class MeadowBiome {
  readonly root = new THREE.Group();
  readonly groundSize = 80;
  readonly playRadius = 34;

  private readonly treeGeo = new THREE.ConeGeometry(0.9, 2.4, 6);
  private readonly trunkGeo = new THREE.CylinderGeometry(0.22, 0.28, 0.9, 6);
  private readonly rockGeo = new THREE.DodecahedronGeometry(0.55, 0);
  private readonly flowerGeo = new THREE.SphereGeometry(0.12, 6, 6);

  private readonly grassMat = new THREE.MeshLambertMaterial({ color: 0x6fbf5a });
  private readonly leafMat = new THREE.MeshLambertMaterial({ color: 0x3f9e4a });
  private readonly leafMatB = new THREE.MeshLambertMaterial({ color: 0x57b35f });
  private readonly trunkMat = new THREE.MeshLambertMaterial({ color: 0x8b5a3c });
  private readonly rockMat = new THREE.MeshLambertMaterial({ color: 0x9aa3a0 });
  private readonly flowerMats = [
    new THREE.MeshLambertMaterial({ color: 0xff8fab }),
    new THREE.MeshLambertMaterial({ color: 0xffd166 }),
    new THREE.MeshLambertMaterial({ color: 0x90e0ef }),
  ];

  constructor() {
    this.root.name = 'MeadowBiome';
    this.buildGround();
    this.buildRingOfTrees();
    this.scatterProps();
  }

  private buildGround(): void {
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(this.groundSize * 0.5, 48),
      this.grassMat,
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.root.add(ground);

    // Soft color bands for depth without textures
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(18, 28, 48),
      new THREE.MeshLambertMaterial({ color: 0x7ec96a }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    this.root.add(ring);

    const path = new THREE.Mesh(
      new THREE.PlaneGeometry(4, 22),
      new THREE.MeshLambertMaterial({ color: 0xc9b27c }),
    );
    path.rotation.x = -Math.PI / 2;
    path.position.set(0, 0.02, 4);
    this.root.add(path);
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

    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 4 + Math.random() * 22;
      this.addRock(Math.cos(a) * r, Math.sin(a) * r, 0.6 + Math.random() * 0.7);
    }

    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 3 + Math.random() * 24;
      this.addFlower(Math.cos(a) * r, Math.sin(a) * r);
    }
  }

  private addTree(x: number, z: number, scale: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.scale.setScalar(scale);

    const trunk = new THREE.Mesh(this.trunkGeo, this.trunkMat);
    trunk.position.y = 0.45;
    trunk.castShadow = true;
    group.add(trunk);

    const leaves = new THREE.Mesh(
      this.treeGeo,
      Math.random() > 0.5 ? this.leafMat : this.leafMatB,
    );
    leaves.position.y = 1.9;
    leaves.castShadow = true;
    group.add(leaves);

    this.root.add(group);
  }

  private addRock(x: number, z: number, scale: number): void {
    const rock = new THREE.Mesh(this.rockGeo, this.rockMat);
    rock.position.set(x, 0.25 * scale, z);
    rock.scale.set(scale, scale * 0.75, scale * 1.1);
    rock.rotation.y = Math.random() * Math.PI;
    rock.castShadow = true;
    rock.receiveShadow = true;
    this.root.add(rock);
  }

  private addFlower(x: number, z: number): void {
    const mat = this.flowerMats[Math.floor(Math.random() * this.flowerMats.length)]!;
    const flower = new THREE.Mesh(this.flowerGeo, mat);
    flower.position.set(x, 0.12, z);
    this.root.add(flower);
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
}
