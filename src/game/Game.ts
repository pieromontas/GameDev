import * as THREE from 'three';
import { GameLoop } from './loop';
import { InputManager } from '../input/InputManager';
import { FollowCamera } from '../camera/FollowCamera';
import { MeadowBiome } from '../world/MeadowBiome';
import { ShrineObjective } from '../world/ShrineObjective';
import { Player } from '../entities/Player';
import { Enemy, createStarterMobs } from '../entities/Mob';
import { createStarterSpitters, Spitter } from '../entities/Spitter';
import { LootPickup } from '../entities/Loot';
import { CombatSystem } from '../combat/CombatSystem';
import { HUD } from '../ui/HUD';
import { HealthBars } from '../ui/HealthBars';
import { Palette, createSkyDome } from '../render/stylized';

export class Game {
  private readonly scene = new THREE.Scene();
  private readonly renderer: THREE.WebGLRenderer;
  private readonly cameraRig: FollowCamera;
  private readonly input: InputManager;
  private readonly loop: GameLoop;
  private readonly meadow: MeadowBiome;
  private readonly shrine: ShrineObjective;
  private readonly player: Player;
  private readonly mobs: Enemy[];
  private readonly loot: LootPickup[] = [];
  private readonly combat: CombatSystem;
  private readonly hud: HUD;
  private readonly healthBars: HealthBars;
  private readonly sun: THREE.DirectionalLight;
  private readonly sky: THREE.Object3D;

  private readonly moveDir = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly sepPush = new THREE.Vector3();
  private readonly navTarget = new THREE.Vector3();

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
    // Soft contact shadows — closer to the style-target meadow lighting
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    // Fallback clear color under the sky dome; fog tints distance into meadow air.
    this.scene.background = new THREE.Color(Palette.skyHorizon);
    // Far plane nudged out so the east shrine clearing stays readable
    this.scene.fog = new THREE.Fog(Palette.fog, 24, 78);
    this.sky = createSkyDome(110);
    this.scene.add(this.sky);

    this.sun = this.addLights();

    this.meadow = new MeadowBiome();
    this.scene.add(this.meadow.root);

    this.player = new Player();
    this.scene.add(this.player.mesh);

    this.mobs = [...createStarterMobs(), ...createStarterSpitters()];
    for (const mob of this.mobs) this.scene.add(mob.mesh);

    this.cameraRig = new FollowCamera(window.innerWidth / window.innerHeight);
    this.cameraRig.snapTo(this.player.position);

    this.input = new InputManager(canvas);
    this.hud = new HUD(hudHost);
    this.healthBars = new HealthBars(this.scene);
    this.healthBars.track(this.player, 2.45);
    for (const mob of this.mobs) {
      this.healthBars.track(mob, mob instanceof Spitter ? 2.05 : 1.55);
    }

    this.combat = new CombatSystem(this.scene, {
      onLootDrop: (pickup) => {
        this.loot.push(pickup);
        this.scene.add(pickup.mesh);
      },
      onPlayerDamaged: () => {
        /* flash / i-frames handled on entity + combat */
      },
      onKill: (enemy) => {
        this.kills += 1;
        const label = enemy.kind === 'spitter' ? 'Spitter defeated!' : 'Blob defeated!';
        this.hud.showToast(label, 1.0);
      },
      onQuakeImpact: () => {
        this.cameraRig.addImpactPunch(0.16);
      },
      onBashImpact: () => {
        this.cameraRig.addImpactPunch(0.1);
      },
    });

    this.shrine = new ShrineObjective(this.meadow, {
      onSpawnEnemy: (enemy) => this.addEnemy(enemy),
      onDespawnEnemy: (enemy) => this.removeEnemy(enemy),
      onLootBurst: (pickups) => {
        for (const pickup of pickups) {
          this.loot.push(pickup);
          this.scene.add(pickup.mesh);
        }
      },
      onToast: (message, duration) => this.hud.showToast(message, duration),
    });

    this.loop = new GameLoop({
      update: (dt) => this.update(dt),
      render: () => this.render(),
    });

    window.addEventListener('resize', this.onResize);
  }

  /**
   * Load KayKit Warrior + Mage GLTFs, then start the sim.
   * On failure: logs clearly and still starts (soft shadow only / other class).
   */
  async start(): Promise<void> {
    this.hud.setLoading(true, 'Loading Warrior & Mage…');
    const result = await this.player.loadVisuals();
    this.hud.setLoading(false);
    if (!result.warrior && !result.mage) {
      this.hud.showToast('Hero models failed to load — check console', 3.5);
    } else if (!result.warrior) {
      this.hud.showToast('Warrior model failed — Mage still available (press C)', 3.2);
    } else if (!result.mage) {
      this.hud.showToast('Mage model failed — Warrior still playable', 3.2);
    } else {
      this.hud.showToast('Welcome — press C to switch · E at the east shrine', 2.8);
    }
    this.loop.start();
  }

  dispose(): void {
    this.loop.stop();
    this.input.dispose();
    window.removeEventListener('resize', this.onResize);
    this.renderer.dispose();
  }

  private addEnemy(enemy: Enemy): void {
    this.mobs.push(enemy);
    this.scene.add(enemy.mesh);
    this.healthBars.track(enemy, enemy instanceof Spitter ? 2.05 : 1.55);
  }

  private removeEnemy(enemy: Enemy): void {
    const idx = this.mobs.indexOf(enemy);
    if (idx >= 0) this.mobs.splice(idx, 1);
    this.scene.remove(enemy.mesh);
    this.healthBars.untrack(enemy);
    enemy.mesh.visible = false;
  }

  private addLights(): THREE.DirectionalLight {
    // Keep hemi modest so the key sun can carve MeshToon cel bands.
    const hemi = new THREE.HemisphereLight(Palette.hemiSky, Palette.hemiGround, 0.55);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(Palette.sun, 2.0);
    sun.position.set(22, 34, 14);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.05;
    sun.shadow.radius = 3;
    sun.shadow.camera.near = 2;
    sun.shadow.camera.far = 72;
    sun.shadow.camera.left = -28;
    sun.shadow.camera.right = 28;
    sun.shadow.camera.top = 28;
    sun.shadow.camera.bottom = -28;
    sun.shadow.camera.updateProjectionMatrix();
    this.scene.add(sun);
    this.scene.add(sun.target);

    const fill = new THREE.DirectionalLight(Palette.fill, 0.28);
    fill.position.set(-14, 12, -10);
    this.scene.add(fill);

    // Tiny warm bounce so shaded sides stay colorful (not gray).
    const bounce = new THREE.AmbientLight(0xfff6e8, 0.1);
    this.scene.add(bounce);

    return sun;
  }

  private update(rawDt: number): void {
    // Hit-stop uses real time; simulation briefly slows on successful hits.
    const dt = this.combat.scaleDt(rawDt);
    this.cameraRig.addYaw(this.input.consumeYawDelta());

    this.player.tickSkills(dt);

    const wasAlive = this.player.alive;

    if (this.player.alive) {
      this.updatePlayerMovement(dt);
      this.handleClassSwitch();
      this.handlePlayerSkills();
      this.handleShrineInteract();
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
        // Shrine wave spawns are despawned by ShrineObjective — never reform in the meadow.
        if (this.shrine.isWaveEnemy(mob)) continue;
        if (mob.readyToRespawn()) {
          mob.respawnNearHome();
          const label =
            mob.kind === 'spitter' ? 'A spitter reforms nearby…' : 'A blob reforms nearby…';
          this.hud.showToast(label, 1.0);
        }
        continue;
      }

      if (mob.isStunned) {
        // Shield Bash hold — no chase/leash while dazed.
      } else if (mob instanceof Spitter) {
        const target = mob.getMoveTarget(this.player.position, this.navTarget);
        if (target) {
          mob.moveToward(target, dt, (p) => this.constrainEntity(p, mob.radius));
        }
      } else if (mob.ai === 'chase') {
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

    this.shrine.update(dt, this.player);
    this.hud.setShrineHud(this.shrine.getHudState(this.player));

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
    this.combat.update(dt, this.player);
    this.cameraRig.update(this.player.position, dt);
    // Keep the sun shadow frustum centered on the player (cheap soft shadows).
    this.sun.target.position.copy(this.player.position);
    this.sun.position.set(
      this.player.position.x + 22,
      34,
      this.player.position.z + 14,
    );
    // Sky follows the camera so the gradient always fills the backdrop.
    this.sky.position.copy(this.cameraRig.camera.position);
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

  private handleClassSwitch(): void {
    if (this.input.wasPressed('KeyC') || this.input.wasPressed('Tab')) {
      // Tab is a common class-swap habit — prevent browser focus stealing.
      // (keydown default isn't cancelable here; Tab still works via wasPressed.)
      const next = this.player.toggleClass();
      const label = next === 'mage' ? 'Mage' : 'Warrior';
      const kit =
        next === 'mage'
          ? 'Bolt / Frost Nova / Arcane Ward'
          : 'Slash / Quake / Shield Bash';
      this.hud.showToast(`${label} ready — ${kit}`, 1.8);
    }
  }

  private handleShrineInteract(): void {
    if (this.input.wasPressed('KeyE')) {
      this.shrine.tryInteract(this.player);
    }
  }

  private handlePlayerSkills(): void {
    if (this.input.wasPressed('Digit1') || this.input.wasPressed('Numpad1') || this.input.consumeAttackClick()) {
      this.combat.tryPlayerSkill(this.player, 'basic', this.mobs);
    }
    if (this.input.wasPressed('Digit2') || this.input.wasPressed('Numpad2')) {
      this.combat.tryPlayerSkill(this.player, 'slam', this.mobs);
    }
    if (this.input.wasPressed('Digit3') || this.input.wasPressed('Numpad3')) {
      if (this.combat.tryPlayerSkill(this.player, 'bash', this.mobs)) {
        // Clamp knockback so shoved blobs stay in the playable meadow.
        for (const mob of this.mobs) {
          if (!mob.alive) continue;
          this.constrainEntity(mob.position, mob.radius);
          mob.syncMesh();
        }
      }
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
