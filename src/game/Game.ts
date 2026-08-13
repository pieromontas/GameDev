import * as THREE from 'three';
import { GameLoop } from './loop';
import { InputManager } from '../input/InputManager';
import { FollowCamera } from '../camera/FollowCamera';
import { MeadowBiome } from '../world/MeadowBiome';
import { WorldPropLibrary } from '../world/WorldPropLibrary';
import { ShrineObjective } from '../world/ShrineObjective';
import { TreasureChests } from '../world/TreasureChests';
import { HealingSprings } from '../world/HealingSprings';
import { CottageMerchant } from '../world/CottageMerchant';
import {
  MarketAlley,
  MarketBlacksmith,
  MarketDistrictSign,
  MarketExtraStall,
  MarketInn,
  MarketNoticeBoard,
} from '../world/MarketDistrict';
import { MarketStreetVendor } from '../world/MarketStreetVendor';
import { GateGuard } from '../world/GateGuard';
import { ResidentialChapel, ResidentialDoor } from '../world/ResidentialStreet';
import { HarborCatchSign } from '../world/HarborDocks';
import { Player } from '../entities/Player';
import { Enemy, createStarterMobs } from '../entities/Mob';
import { createStarterSpitters, Spitter } from '../entities/Spitter';
import { createStarterBrutes, ArmoredBrute } from '../entities/ArmoredBrute';
import { createStarterWisps, SpiritWisp } from '../entities/SpiritWisp';
import { LootPickup } from '../entities/Loot';
import { CombatSystem } from '../combat/CombatSystem';
import { HUD } from '../ui/HUD';
import { HealthBars } from '../ui/HealthBars';
import { Palette, createSkyDome } from '../render/stylized';
import {
  SPAWN_AGGRO_GRACE,
  isInsideSpawnSafe,
  pushOutOfSpawnSafe,
} from '../world/spawnSafe';

export class Game {
  private readonly scene = new THREE.Scene();
  private readonly renderer: THREE.WebGLRenderer;
  private readonly cameraRig: FollowCamera;
  private readonly input: InputManager;
  private readonly loop: GameLoop;
  private readonly meadow: MeadowBiome;
  private readonly shrine: ShrineObjective;
  private readonly chests: TreasureChests;
  private readonly springs: HealingSprings;
  private readonly merchant: CottageMerchant;
  private readonly marketSign: MarketDistrictSign;
  private readonly marketBlacksmith: MarketBlacksmith;
  private readonly marketVendor: MarketStreetVendor;
  private readonly marketExtraStall: MarketExtraStall;
  private readonly marketNoticeBoard: MarketNoticeBoard;
  private readonly marketInn: MarketInn;
  private readonly marketAlley: MarketAlley;
  private readonly gateGuard: GateGuard;
  private readonly residentialDoor: ResidentialDoor;
  private readonly residentialChapel: ResidentialChapel;
  private readonly harborCatchSign: HarborCatchSign;
  /** Public for DevTools playtests via `window.__game`. */
  readonly player: Player;
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
  /** After camp respawn — enemies ignore the player until this elapses. */
  private spawnAggroGrace = 0;
  /** One-shot toast so the Shift dodge binding is obvious on first use. */
  private dodgeHintShown = false;
  /** One-shot toast when the player first finds the NE city-gate road. */
  private cityGateHintShown = false;
  /** One-shot toast when the player first enters the market district. */
  private marketHintShown = false;
  /** One-shot toast when the player first enters the residential street. */
  private homesHintShown = false;
  /** One-shot toast when the player first enters the harbor docks. */
  private docksHintShown = false;

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
    // Far plane nudged out so east/west/north/south clearings stay readable
    this.scene.fog = new THREE.Fog(Palette.fog, 30, 115);
    this.sky = createSkyDome(145);
    this.scene.add(this.sky);

    this.sun = this.addLights();

    this.meadow = new MeadowBiome();
    this.scene.add(this.meadow.root);

    this.player = new Player();
    this.scene.add(this.player.mesh);

    this.mobs = [
      ...createStarterMobs(),
      ...createStarterSpitters(),
      ...createStarterBrutes(),
      ...createStarterWisps(),
    ];
    for (const mob of this.mobs) this.scene.add(mob.mesh);
    // Boot: keep camp clear even if a home ever drifts inside the safe radius.
    this.clearEnemiesFromSpawnSafe();
    this.spawnAggroGrace = SPAWN_AGGRO_GRACE;

    this.cameraRig = new FollowCamera(window.innerWidth / window.innerHeight);
    this.cameraRig.snapTo(this.player.position);

    this.input = new InputManager(canvas);
    this.hud = new HUD(hudHost);
    this.healthBars = new HealthBars(this.scene);
    // Player HP is HUD-only; world bars are for enemies (camera-facing billboards).
    for (const mob of this.mobs) {
      this.healthBars.track(mob, this.enemyBarHeight(mob));
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
        this.grantKillXp(enemy);
        if (enemy.kind === 'blob') {
          this.marketNoticeBoard.onBlobKilled();
        }
        if (enemy.kind === 'brute') {
          this.hud.showToast('Armored Brute crushed!  ·  rich loot + XP', 2.0);
        }
      },
      onQuakeImpact: () => {
        this.cameraRig.addImpactPunch(0.16);
      },
      onBashImpact: () => {
        this.cameraRig.addImpactPunch(0.1);
      },
      onBurstImpact: () => {
        this.cameraRig.addImpactPunch(0.18);
      },
      onPlayerDisplace: (player) => {
        this.constrainEntity(player.position, player.radius);
        player.syncMesh();
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

    this.chests = new TreasureChests(this.meadow, {
      onLootBurst: (pickups) => {
        for (const pickup of pickups) {
          this.loot.push(pickup);
          this.scene.add(pickup.mesh);
        }
      },
      onToast: (message, duration) => this.hud.showToast(message, duration),
      onXpGranted: (amount, worldPos) => this.grantChestXp(amount, worldPos),
    });

    this.springs = new HealingSprings(this.meadow, {
      onToast: (message, duration) => this.hud.showToast(message, duration),
    });

    this.merchant = new CottageMerchant({
      onToast: (message, duration) => this.hud.showToast(message, duration),
      getGold: () => this.lootCount,
      trySpend: (amount) => {
        if (this.lootCount < amount) return false;
        this.lootCount -= amount;
        return true;
      },
      onShopChanged: (open) => this.hud.setShopOpen(open, this.lootCount),
    });
    this.marketSign = new MarketDistrictSign({
      onToast: (message, duration) => this.hud.showToast(message, duration),
    });
    this.marketBlacksmith = new MarketBlacksmith({
      onToast: (message, duration) => this.hud.showToast(message, duration),
    });
    this.marketVendor = new MarketStreetVendor({
      onToast: (message, duration) => this.hud.showToast(message, duration),
      getGold: () => this.lootCount,
      trySpend: (amount) => {
        if (this.lootCount < amount) return false;
        this.lootCount -= amount;
        return true;
      },
      onShopChanged: (open) => this.hud.setVendorOpen(open, this.lootCount),
    });
    this.marketExtraStall = new MarketExtraStall({
      onToast: (message, duration) => this.hud.showToast(message, duration),
    });
    this.marketNoticeBoard = new MarketNoticeBoard({
      onToast: (message, duration) => this.hud.showToast(message, duration),
      onBoardChanged: (open, lines) => this.hud.setNoticeOpen(open, lines),
      onBountyReward: (gold, xp) => this.grantBountyReward(gold, xp),
    });
    this.marketInn = new MarketInn({
      onToast: (message, duration) => this.hud.showToast(message, duration),
      getGold: () => this.lootCount,
      trySpend: (amount) => {
        if (this.lootCount < amount) return false;
        this.lootCount -= amount;
        return true;
      },
    });
    this.marketAlley = new MarketAlley({
      onToast: (message, duration) => this.hud.showToast(message, duration),
    });
    this.gateGuard = new GateGuard({
      onToast: (message, duration) => this.hud.showToast(message, duration),
      getKills: () => this.kills,
    });
    this.residentialDoor = new ResidentialDoor({
      onToast: (message, duration) => this.hud.showToast(message, duration),
    });
    this.residentialChapel = new ResidentialChapel({
      onToast: (message, duration) => this.hud.showToast(message, duration),
    });
    this.harborCatchSign = new HarborCatchSign({
      onToast: (message, duration) => this.hud.showToast(message, duration),
    });
    this.hud.bindShopHandlers({
      onBuyPotion: () => this.merchant.buyHealthPotion(this.player),
      onBuyCharm: () => this.merchant.buyDamageCharm(this.player),
      onClose: () => this.merchant.close(),
    });
    this.hud.bindVendorHandlers({
      onBuyBread: () => this.marketVendor.buyBread(this.player),
      onBuyNibble: () => this.marketVendor.buySpeedNibble(this.player),
      onClose: () => this.marketVendor.close(),
    });
    this.hud.bindNoticeHandlers({
      onClose: () => this.marketNoticeBoard.close(),
      onAction: (actionId) => this.marketNoticeBoard.tryBoardAction(actionId),
    });

    this.loop = new GameLoop({
      update: (dt) => this.update(dt),
      render: () => this.render(),
    });

    window.addEventListener('resize', this.onResize);
  }

  /**
   * Load KayKit world props + Warrior/Mage/Rogue GLTFs, then start the sim.
   * On failure: logs clearly and still starts (procedural meadow / soft shadow / other classes).
   */
  async start(): Promise<void> {
    this.hud.setLoading(true, 'Loading meadow props & heroes…');
    const [propLibrary, result] = await Promise.all([
      WorldPropLibrary.load(),
      this.player.loadVisuals(),
    ]);
    const propsOk = this.meadow.applyPropPack(propLibrary);
    this.hud.setLoading(false);
    const failed = [
      !result.warrior ? 'Warrior' : null,
      !result.mage ? 'Mage' : null,
      !result.rogue ? 'Rogue' : null,
    ].filter(Boolean) as string[];
    if (failed.length === 3) {
      this.hud.showToast('Hero models failed to load — check console', 3.5);
    } else if (failed.length > 0) {
      this.hud.showToast(`${failed.join(' + ')} model failed — others still playable (C)`, 3.2);
    } else if (propsOk) {
      this.hud.showToast(
        'Welcome — KayKit meadow · chests · healing spring in north ruins',
        2.8,
      );
    } else {
      this.hud.showToast(
        'Welcome — chests · east shrine · west grove · north ruins spring · south ford',
        2.8,
      );
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
    this.healthBars.track(enemy, this.enemyBarHeight(enemy));
  }

  private enemyBarHeight(enemy: Enemy): number {
    if (enemy instanceof ArmoredBrute) return 2.75;
    if (enemy instanceof Spitter) return 2.05;
    if (enemy instanceof SpiritWisp) return 2.15;
    return 1.55;
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
    sun.shadow.camera.far = 95;
    sun.shadow.camera.left = -40;
    sun.shadow.camera.right = 40;
    sun.shadow.camera.top = 40;
    sun.shadow.camera.bottom = -40;
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
    this.applyCameraZoom(dt);

    this.player.tickSkills(dt);
    if (this.spawnAggroGrace > 0) {
      this.spawnAggroGrace = Math.max(0, this.spawnAggroGrace - dt);
    }

    if (this.player.alive) {
      this.updatePlayerMovement(dt);
      this.handleClassSwitch();
      this.handlePlayerSkills();
      this.handleInteract();
    } else if (this.playerRespawnTimer >= 0) {
      this.playerRespawnTimer -= dt;
      if (this.playerRespawnTimer <= 0) {
        this.player.respawn();
        this.playerRespawnTimer = -1;
        this.combat.clearSpitProjectiles();
        this.clearEnemiesFromSpawnSafe();
        this.spawnAggroGrace = SPAWN_AGGRO_GRACE;
        this.cameraRig.snapTo(this.player.position);
        this.hud.showToast('You regroup and fight on!', 1.5);
      }
    }

    // Camp sanctuary: no aggro while grace is active or the player is still in the clear circle.
    const campProtected =
      !this.player.alive ||
      this.spawnAggroGrace > 0 ||
      isInsideSpawnSafe(this.player.position.x, this.player.position.z);

    for (const mob of this.mobs) {
      mob.update(dt);
      if (!mob.alive) {
        // Shrine wave spawns are despawned by ShrineObjective — never reform in the meadow.
        if (this.shrine.isWaveEnemy(mob)) continue;
        if (mob.readyToRespawn()) {
          mob.respawnNearHome();
          const label =
            mob.kind === 'brute'
              ? 'An armored brute reforms nearby…'
              : mob.kind === 'spitter'
                ? 'A spitter reforms nearby…'
                : mob.kind === 'wisp'
                  ? 'A spirit wisp reforms nearby…'
                  : 'A blob reforms nearby…';
          this.hud.showToast(label, 1.0);
        }
        continue;
      }

      if (campProtected) {
        // Hold idle at current pose — don't chase into / linger on the camp.
        if (mob.ai === 'chase' || mob.ai === 'attack' || mob.ai === 'retreat') {
          mob.ai = 'idle';
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

    if (campProtected) {
      // Force idle AI so bites / spit windups cannot start on the camp.
      for (const mob of this.mobs) {
        if (mob.alive) mob.think(this.player.position, false);
      }
    } else {
      this.combat.updateMobCombat(this.mobs, this.player);
    }
    // Always arm respawn when dead with no timer — covers same-frame death right after
    // a prior respawn (wasAlive was false at frame start), which previously softlocked.
    if (!this.player.alive && this.playerRespawnTimer < 0) {
      this.playerRespawnTimer = 2.2;
      this.hud.showToast('Defeated — respawning…', 2);
    }

    this.shrine.update(dt, this.player);
    this.chests.update(dt);
    this.springs.update(dt);
    this.meadow.updateMarketAmbience(dt);
    this.meadow.updateGateBanners(dt);
    this.meadow.updateGateGuard(dt, this.player.position);
    this.marketInn.update(dt);
    this.residentialChapel.update(dt);
    this.merchant.update(this.player);
    this.marketVendor.update(this.player);
    this.marketNoticeBoard.update(this.player);
    if (this.input.wasPressed('Escape')) {
      if (this.merchant.isOpen) this.merchant.close();
      if (this.marketVendor.isOpen) this.marketVendor.close();
      if (this.marketNoticeBoard.isOpen) this.marketNoticeBoard.close();
    }
    this.syncInteractHud();

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
        this.hud.showToast(`+1 gold  ·  ${this.lootCount}`, 0.85);
        this.scene.remove(pickup.mesh);
        pickup.dispose();
        this.loot.splice(i, 1);
      }
    }

    this.player.update(dt);
    this.combat.update(dt, this.player, this.mobs);
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
    this.hud.updateMinimap(this.player, this.mobs);
    this.input.endFrame();
  }

  /** Wheel / trackpad pinch + optional -/= and [/] zoom keys. */
  private applyCameraZoom(dt: number): void {
    let zoom = this.input.consumeZoomDelta();
    const keyRate = 10 * dt;
    if (this.input.isDown('Minus') || this.input.isDown('BracketLeft')) zoom += keyRate;
    if (this.input.isDown('Equal') || this.input.isDown('BracketRight')) zoom -= keyRate;
    this.cameraRig.addZoom(zoom);
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

    if (this.input.wasPressed('ShiftLeft') || this.input.wasPressed('ShiftRight')) {
      if (this.player.tryDodge(this.moveDir)) {
        if (!this.dodgeHintShown) {
          this.dodgeHintShown = true;
          this.hud.showToast('Dodge Roll — Shift  ·  brief i-frames', 1.6);
        }
      }
    }

    this.player.applyMovement(this.moveDir, dt);
    // Soft unstick vs living enemies so adjacent WASD is not zeroed (dodge still punches through).
    this.separatePlayerFromEnemies();
    this.constrainEntity(this.player.position, this.player.radius);
    this.player.syncMesh();

    if (!this.cityGateHintShown && this.meadow.isNearCityGate(this.player.position)) {
      this.cityGateHintShown = true;
      this.hud.showToast('City gate ahead — Market District beyond the arch', 2.2);
    }
    if (!this.marketHintShown && this.meadow.isNearMarketDistrict(this.player.position)) {
      this.marketHintShown = true;
      this.hud.showToast('Market District  ·  first slice of town', 2.0);
    }
    if (!this.homesHintShown && this.meadow.isNearResidentialStreet(this.player.position)) {
      this.homesHintShown = true;
      this.hud.showToast('Homes  ·  quiet residential street', 2.0);
    }
    if (!this.docksHintShown && this.meadow.isNearHarborDocks(this.player.position)) {
      this.docksHintShown = true;
      this.hud.showToast('Docks  ·  harbor pier stub', 2.0);
    }
  }

  private constrainEntity(position: THREE.Vector3, radius: number): void {
    this.meadow.resolveObstacles(position, radius);
    this.meadow.clampToPlayArea(position);
  }

  /** Teleport living enemies out of the camp clear circle (boot + player respawn). */
  private clearEnemiesFromSpawnSafe(): void {
    for (const mob of this.mobs) {
      if (!mob.alive) continue;
      if (!isInsideSpawnSafe(mob.position.x, mob.position.z)) continue;
      if (!pushOutOfSpawnSafe(mob.position)) continue;
      this.constrainEntity(mob.position, mob.radius);
      // Prefer leash home so they don't immediately re-enter after a shove.
      mob.ai = 'leash';
      mob.syncMesh();
    }
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

  /**
   * Soft capsule push between the player and living enemies (same spirit as mob-mob sep).
   * Lets WASD slide past an adjacent blob instead of hard body-blocking to zero displacement.
   * Caller must still `constrainEntity` the player afterward so world solids win.
   */
  private separatePlayerFromEnemies(): void {
    if (!this.player.alive) return;
    for (const mob of this.mobs) {
      if (!mob.alive) continue;
      const minDist = this.player.radius + mob.sepRadius;
      const dx = mob.position.x - this.player.position.x;
      const dz = mob.position.z - this.player.position.z;
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
      this.player.position.x -= this.sepPush.x * push;
      this.player.position.z -= this.sepPush.z * push;
      mob.position.x += this.sepPush.x * push;
      mob.position.z += this.sepPush.z * push;
      this.constrainEntity(mob.position, mob.radius);
      mob.syncMesh();
    }
  }

  private handleClassSwitch(): void {
    if (this.input.wasPressed('KeyC') || this.input.wasPressed('Tab')) {
      // Tab is a common class-swap habit — prevent browser focus stealing.
      // Cancel in-flight leaps first so a mid-leap swap never softlocks movement.
      this.combat.cancelPlayerLeaps(this.player);
      const next = this.player.toggleClass();
      const unlocked = !this.player.isSkillLocked('burst');
      let kit: string;
      if (next === 'mage') {
        kit = unlocked
          ? 'Bolt / Nova / Ward / Meteor'
          : 'Bolt / Nova / Ward · Meteor at Lv 3';
      } else if (next === 'rogue') {
        kit = unlocked
          ? 'Stab / Fan / Smoke / Shadow Leap'
          : 'Stab / Fan / Smoke · Shadow at Lv 3';
      } else {
        kit = unlocked
          ? 'Slash / Quake / Bash / Leap Strike'
          : 'Slash / Quake / Bash · Leap at Lv 3';
      }
      this.hud.showToast(`${this.player.classLabel} ready — ${kit}`, 1.8);
    }
  }

  /**
   * E key: closed chests → healing spring → east shrine → gate guard →
   * blacksmith → street vendor → produce stall → market sign → notice board →
   * inn → alley → harbor catch crate → residential door → town chapel →
   * cottage merchant.
   * Produce stall is before the market sign so the west-rim pad wins on overlap;
   * street vendor stays ahead so the snack shop still wins if those pads overlap.
   * Open shop / stall / notice panel always closes on E first so it never blocks
   * other interactables.
   */
  private handleInteract(): void {
    if (!this.input.wasPressed('KeyE')) return;
    if (this.merchant.isOpen) {
      this.merchant.close();
      return;
    }
    if (this.marketVendor.isOpen) {
      this.marketVendor.close();
      return;
    }
    if (this.marketNoticeBoard.isOpen) {
      // Accept / claim bounty, or close — handled inside tryInteract.
      this.marketNoticeBoard.tryInteract(this.player);
      return;
    }
    if (this.chests.tryInteract(this.player)) return;
    if (this.springs.tryInteract(this.player)) return;
    if (this.shrine.tryInteract(this.player)) return;
    if (this.gateGuard.tryInteract(this.player)) return;
    if (this.marketBlacksmith.tryInteract(this.player)) return;
    if (this.marketVendor.tryInteract(this.player)) return;
    if (this.marketExtraStall.tryInteract(this.player)) return;
    if (this.marketSign.tryInteract(this.player)) return;
    if (this.marketNoticeBoard.tryInteract(this.player)) return;
    if (this.marketInn.tryInteract(this.player)) return;
    if (this.marketAlley.tryInteract(this.player)) return;
    if (this.harborCatchSign.tryInteract(this.player)) return;
    if (this.residentialDoor.tryInteract(this.player)) return;
    if (this.residentialChapel.tryInteract(this.player)) return;
    this.merchant.tryInteract(this.player);
  }

  /** Merge shrine objective HUD with chest / spring / shrine / market / homes / merchant prompts. */
  private syncInteractHud(): void {
    const shrineHud = this.shrine.getHudState(this.player);
    // Bounty progress banner when shrine defense isn't already using the slot.
    const bountyBanner = this.marketNoticeBoard.getObjectiveBanner();
    if (!shrineHud.objectiveVisible && bountyBanner) {
      shrineHud.objectiveVisible = true;
      shrineHud.objectiveText = bountyBanner;
    }
    const chestPrompt = this.chests.getInteractPrompt(this.player);
    const springPrompt = this.springs.getInteractPrompt(this.player);
    const gateGuardPrompt = this.gateGuard.getInteractPrompt(this.player);
    const marketPrompt = this.marketSign.getInteractPrompt(this.player);
    const smithPrompt = this.marketBlacksmith.getInteractPrompt(this.player);
    const vendorPrompt = this.marketVendor.getInteractPrompt(this.player);
    const extraStallPrompt = this.marketExtraStall.getInteractPrompt(this.player);
    const noticePrompt = this.marketNoticeBoard.getInteractPrompt(this.player);
    const innPrompt = this.marketInn.getInteractPrompt(this.player);
    const alleyPrompt = this.marketAlley.getInteractPrompt(this.player);
    const harborPrompt = this.harborCatchSign.getInteractPrompt(this.player);
    const homeDoorPrompt = this.residentialDoor.getInteractPrompt(this.player);
    const chapelPrompt = this.residentialChapel.getInteractPrompt(this.player);
    const merchantPrompt = this.merchant.getInteractPrompt(this.player);
    if (chestPrompt.visible) {
      this.hud.setShrineHud({
        ...shrineHud,
        promptVisible: true,
        promptText: chestPrompt.text,
      });
    } else if (springPrompt.visible) {
      this.hud.setShrineHud({
        ...shrineHud,
        promptVisible: true,
        promptText: springPrompt.text,
      });
    } else if (shrineHud.promptVisible) {
      this.hud.setShrineHud(shrineHud);
    } else if (gateGuardPrompt.visible) {
      this.hud.setShrineHud({
        ...shrineHud,
        promptVisible: true,
        promptText: gateGuardPrompt.text,
      });
    } else if (smithPrompt.visible) {
      this.hud.setShrineHud({
        ...shrineHud,
        promptVisible: true,
        promptText: smithPrompt.text,
      });
    } else if (vendorPrompt.visible) {
      this.hud.setShrineHud({
        ...shrineHud,
        promptVisible: true,
        promptText: vendorPrompt.text,
      });
    } else if (extraStallPrompt.visible) {
      this.hud.setShrineHud({
        ...shrineHud,
        promptVisible: true,
        promptText: extraStallPrompt.text,
      });
    } else if (marketPrompt.visible) {
      this.hud.setShrineHud({
        ...shrineHud,
        promptVisible: true,
        promptText: marketPrompt.text,
      });
    } else if (noticePrompt.visible) {
      this.hud.setShrineHud({
        ...shrineHud,
        promptVisible: true,
        promptText: noticePrompt.text,
      });
    } else if (innPrompt.visible) {
      this.hud.setShrineHud({
        ...shrineHud,
        promptVisible: true,
        promptText: innPrompt.text,
      });
    } else if (alleyPrompt.visible) {
      this.hud.setShrineHud({
        ...shrineHud,
        promptVisible: true,
        promptText: alleyPrompt.text,
      });
    } else if (harborPrompt.visible) {
      this.hud.setShrineHud({
        ...shrineHud,
        promptVisible: true,
        promptText: harborPrompt.text,
      });
    } else if (homeDoorPrompt.visible) {
      this.hud.setShrineHud({
        ...shrineHud,
        promptVisible: true,
        promptText: homeDoorPrompt.text,
      });
    } else if (chapelPrompt.visible) {
      this.hud.setShrineHud({
        ...shrineHud,
        promptVisible: true,
        promptText: chapelPrompt.text,
      });
    } else if (merchantPrompt.visible) {
      this.hud.setShrineHud({
        ...shrineHud,
        promptVisible: true,
        promptText: merchantPrompt.text,
      });
    } else {
      this.hud.setShrineHud(shrineHud);
    }
  }

  /**
   * Kill → XP loop. Wisps pay a bit more than blobs; spitters more; brutes most.
   * Floating "+XP" every kill; level-up gets a toast + FX; occasional XP toast.
   */
  private grantKillXp(enemy: Enemy): void {
    const amount =
      enemy.kind === 'brute'
        ? 28
        : enemy.kind === 'spitter'
          ? 14
          : enemy.kind === 'wisp'
            ? 11
            : 8;
    const result = this.applyXpGain(amount, enemy.position);

    if (result.leveled) return;

    // Brute kills already toasted in onKill — skip the generic XP pulse.
    if (enemy.kind === 'brute') return;

    // Occasional toast so XP still reads if floaters are missed in the scrap.
    if (this.kills % 5 === 0) {
      this.hud.showToast(`+${amount} XP  ·  Lv.${this.player.level}`, 0.9);
    }
  }

  /** Chest open → XP floater + level-up feedback (loot toast already fired). */
  private grantChestXp(amount: number, worldPos: THREE.Vector3): void {
    this.applyXpGain(amount, worldPos);
  }

  /** Notice-board bounty turn-in — gold to purse + XP floater at the player. */
  private grantBountyReward(gold: number, xp: number): void {
    this.lootCount += gold;
    this.applyXpGain(xp, this.player.position);
  }

  private applyXpGain(amount: number, worldPos: THREE.Vector3): ReturnType<Player['gainXp']> {
    const result = this.player.gainXp(amount);
    this.combat.damageNumbers.spawnXp(worldPos, amount);

    if (result.leveled) {
      const lv = this.player.level;
      const dmg = result.damageGained;
      const hp = result.hpGained;
      const multi = result.levelsGained > 1 ? ` ×${result.levelsGained}` : '';
      this.hud.showToast(
        `Level Up${multi}!  ·  Lv.${lv}  ·  +${hp} HP  ·  +${dmg} dmg`,
        2.6,
      );
      this.hud.flashLevelUp();
      this.combat.playLevelUpFx(this.player);
      this.cameraRig.addImpactPunch(0.2);
    }
    return result;
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
    if (this.input.wasPressed('Digit4') || this.input.wasPressed('Numpad4')) {
      this.combat.tryPlayerSkill(this.player, 'burst', this.mobs);
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
