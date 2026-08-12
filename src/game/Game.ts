import * as THREE from 'three';
import { GameLoop } from './loop';
import { InputManager } from '../input/InputManager';
import { FollowCamera } from '../camera/FollowCamera';
import { MeadowBiome } from '../world/MeadowBiome';
import { Player } from '../entities/Player';
import { Mob, createStarterMobs } from '../entities/Mob';
import { LootPickup } from '../entities/Loot';
import { CombatSystem } from '../combat/CombatSystem';
import { HUD } from '../ui/HUD';
import { HealthBars } from '../ui/HealthBars';

export class Game {
  private readonly scene = new THREE.Scene();
  private readonly renderer: THREE.WebGLRenderer;
  private readonly cameraRig: FollowCamera;
  private readonly input: InputManager;
  private readonly loop: GameLoop;
  private readonly meadow: MeadowBiome;
  private readonly player: Player;
  private readonly mobs: Mob[];
  private readonly loot: LootPickup[] = [];
  private readonly combat: CombatSystem;
  private readonly hud: HUD;
  private readonly healthBars: HealthBars;

  private readonly moveDir = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly sepPush = new THREE.Vector3();

  private lootCount = 0;
  private kills = 0;
  private playerRespawnTimer = -1;

  constructor(canvas: HTMLCanvasElement, hudHost: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.BasicShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene.background = new THREE.Color(0x9fd8ff);
    this.scene.fog = new THREE.Fog(0xbfe8ff, 40, 90);

    this.addLights();

    this.meadow = new MeadowBiome();
    this.scene.add(this.meadow.root);

    this.player = new Player();
    this.scene.add(this.player.mesh);

    this.mobs = createStarterMobs();
    for (const mob of this.mobs) this.scene.add(mob.mesh);

    this.cameraRig = new FollowCamera(window.innerWidth / window.innerHeight);
    this.cameraRig.snapTo(this.player.position);

    this.input = new InputManager(canvas);
    this.hud = new HUD(hudHost);
    this.healthBars = new HealthBars(this.scene);
    this.healthBars.track(this.player, 2.3);
    for (const mob of this.mobs) this.healthBars.track(mob, 1.5);

    this.combat = new CombatSystem(this.scene, {
      onLootDrop: (pickup) => {
        this.loot.push(pickup);
        this.scene.add(pickup.mesh);
      },
      onPlayerDamaged: () => {
        /* flash / i-frames handled on entity + combat */
      },
      onKill: () => {
        this.kills += 1;
        this.hud.showToast('Blob defeated!', 1.0);
      },
    });

    this.loop = new GameLoop({
      update: (dt) => this.update(dt),
      render: () => this.render(),
    });

    window.addEventListener('resize', this.onResize);
    this.hud.showToast('Welcome to the meadow training grounds', 2.2);
  }

  start(): void {
    this.loop.start();
  }

  dispose(): void {
    this.loop.stop();
    this.input.dispose();
    window.removeEventListener('resize', this.onResize);
    this.renderer.dispose();
  }

  private addLights(): void {
    const hemi = new THREE.HemisphereLight(0xfff2d6, 0x6fbf5a, 1.1);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff4dc, 1.35);
    sun.position.set(18, 28, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 2;
    sun.shadow.camera.far = 70;
    sun.shadow.camera.left = -30;
    sun.shadow.camera.right = 30;
    sun.shadow.camera.top = 30;
    sun.shadow.camera.bottom = -30;
    this.scene.add(sun);

    const fill = new THREE.DirectionalLight(0xa0d4ff, 0.35);
    fill.position.set(-12, 10, -8);
    this.scene.add(fill);
  }

  private update(dt: number): void {
    this.cameraRig.addYaw(this.input.consumeYawDelta());

    this.player.tickSkills(dt);

    const wasAlive = this.player.alive;

    if (this.player.alive) {
      this.updatePlayerMovement(dt);
      this.handlePlayerSkills();
    } else if (this.playerRespawnTimer >= 0) {
      this.playerRespawnTimer -= dt;
      if (this.playerRespawnTimer <= 0) {
        this.player.respawn();
        this.playerRespawnTimer = -1;
        this.cameraRig.snapTo(this.player.position);
        this.hud.showToast('You regroup and fight on!', 1.5);
      }
    }

    for (const mob of this.mobs) {
      mob.update(dt);
      if (!mob.alive) {
        if (mob.readyToRespawn()) {
          mob.respawnNearHome();
          this.hud.showToast('A blob reforms nearby…', 1.0);
        }
        continue;
      }

      if (mob.ai === 'chase') {
        mob.moveToward(this.player.position, dt, (p) => this.constrainEntity(p, mob.radius));
      } else if (mob.ai === 'leash') {
        mob.moveToward(mob.home, dt, (p) => this.constrainEntity(p, mob.radius));
      }
    }

    this.separateMobs();

    this.combat.updateMobCombat(this.mobs, this.player);
    if (wasAlive && !this.player.alive) {
      this.playerRespawnTimer = 2.2;
      this.hud.showToast('Defeated — respawning…', 2);
    }

    for (let i = this.loot.length - 1; i >= 0; i--) {
      const pickup = this.loot[i]!;
      pickup.update(dt);
      if (!pickup.alive) {
        this.scene.remove(pickup.mesh);
        pickup.dispose();
        this.loot.splice(i, 1);
        continue;
      }
      if (this.player.alive && pickup.tryCollect(this.player.position, 1.7)) {
        this.lootCount += 1;
        this.hud.showToast(`+1 loot  ·  ${this.lootCount}`, 0.85);
        this.scene.remove(pickup.mesh);
        pickup.dispose();
        this.loot.splice(i, 1);
      }
    }

    this.player.update(dt);
    this.combat.update(dt);
    this.cameraRig.update(this.player.position, dt);
    this.healthBars.update(this.cameraRig.camera);
    this.hud.update(this.player, this.lootCount, this.kills, dt);
    this.input.endFrame();
  }

  private updatePlayerMovement(dt: number): void {
    const axes = this.input.getMoveAxes();
    this.cameraRig.getFlatForward(this.forward);
    this.cameraRig.getFlatRight(this.right);
    this.moveDir.set(0, 0, 0);
    this.moveDir.addScaledVector(this.right, axes.x);
    this.moveDir.addScaledVector(this.forward, -axes.z);

    if (this.moveDir.lengthSq() > 1e-6) {
      this.moveDir.normalize();
    } else {
      this.moveDir.set(0, 0, 0);
    }

    this.player.applyMovement(this.moveDir, dt);
    this.constrainEntity(this.player.position, this.player.radius);
    this.player.syncMesh();
  }

  private constrainEntity(position: THREE.Vector3, radius: number): void {
    this.meadow.resolveObstacles(position, radius);
    this.meadow.clampToPlayArea(position);
  }

  /** Keep blobs from stacking into an unreadable pile. */
  private separateMobs(): void {
    const n = this.mobs.length;
    for (let i = 0; i < n; i++) {
      const a = this.mobs[i]!;
      if (!a.alive) continue;
      for (let j = i + 1; j < n; j++) {
        const b = this.mobs[j]!;
        if (!b.alive) continue;
        const minDist = a.sepRadius + b.sepRadius;
        const dx = b.position.x - a.position.x;
        const dz = b.position.z - a.position.z;
        const d2 = dx * dx + dz * dz;
        if (d2 >= minDist * minDist) continue;
        if (d2 < 1e-6) {
          this.sepPush.set(1, 0, 0);
        } else {
          const d = Math.sqrt(d2);
          this.sepPush.set(dx / d, 0, dz / d);
        }
        const d = Math.sqrt(Math.max(d2, 1e-6));
        const push = (minDist - d) * 0.5;
        a.position.x -= this.sepPush.x * push;
        a.position.z -= this.sepPush.z * push;
        b.position.x += this.sepPush.x * push;
        b.position.z += this.sepPush.z * push;
        this.constrainEntity(a.position, a.radius);
        this.constrainEntity(b.position, b.radius);
        a.syncMesh();
        b.syncMesh();
      }
    }
  }

  private handlePlayerSkills(): void {
    if (this.input.wasPressed('Digit1') || this.input.wasPressed('Numpad1') || this.input.consumeAttackClick()) {
      this.combat.tryPlayerSkill(this.player, 'basic', this.mobs);
    }
    if (this.input.wasPressed('Digit2') || this.input.wasPressed('Numpad2')) {
      this.combat.tryPlayerSkill(this.player, 'slam', this.mobs);
    }
  }

  private render(): void {
    this.renderer.render(this.scene, this.cameraRig.camera);
  }

  private onResize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.cameraRig.setAspect(w / h);
  };
}
