import { Player } from '../entities/Player';
import { CLASS_LABEL, PlayerClass, SKILL4_UNLOCK_LEVEL, SkillId } from '../combat/Skills';
import {
  EastShrineClearing,
  WestMistyGrove,
  NorthRuinsClearing,
  SouthRiverFordClearing,
  NortheastCityGate,
  NortheastMarketDistrict,
} from '../render/stylized';
import { CHEST_SPOTS } from '../world/TreasureChests';
import { SPRING_SPOT } from '../world/HealingSprings';
import {
  COTTAGE_SPOT,
  DAMAGE_CHARM_COST,
  HEALTH_POTION_COST,
} from '../world/CottageMerchant';
import { MARKET_BLACKSMITH_SPOT, MARKET_INN_SPOT } from '../world/MarketDistrict';

/** World half-extent projected onto the radar (covers clearings + a little padding). */
const MINIMAP_EXTENT = 70;
const MINIMAP_SIZE = 152;

type MinimapLandmark = {
  x: number;
  z: number;
  color: string;
  /** Drawn radius in CSS pixels. */
  r: number;
};

const MINIMAP_LANDMARKS: MinimapLandmark[] = [
  { x: EastShrineClearing.x, z: EastShrineClearing.z, color: '#7b5cff', r: 4.5 },
  { x: WestMistyGrove.x, z: WestMistyGrove.z, color: '#3ecf9a', r: 4.5 },
  { x: NorthRuinsClearing.x, z: NorthRuinsClearing.z, color: '#c4a574', r: 4.5 },
  { x: SouthRiverFordClearing.x, z: SouthRiverFordClearing.z, color: '#4aa8e8', r: 4.5 },
  { x: NortheastCityGate.x, z: NortheastCityGate.z, color: '#d4a04a', r: 4.8 },
  // Market square also marks the central plaza fountain.
  { x: NortheastMarketDistrict.x, z: NortheastMarketDistrict.z, color: '#e07a3a', r: 4.6 },
  { x: MARKET_BLACKSMITH_SPOT.x, z: MARKET_BLACKSMITH_SPOT.z, color: '#c45a2e', r: 2.8 },
  { x: MARKET_INN_SPOT.x, z: MARKET_INN_SPOT.z, color: '#e8a04a', r: 2.8 },
  ...CHEST_SPOTS.map((c) => ({ x: c.x, z: c.z, color: '#f0c040', r: 3 })),
  { x: SPRING_SPOT.x, z: SPRING_SPOT.z, color: '#5ed4ef', r: 3.2 },
  { x: COTTAGE_SPOT.x, z: COTTAGE_SPOT.z, color: '#c4784a', r: 3.2 },
];

export class HUD {
  private readonly root: HTMLElement;
  private readonly brand: HTMLElement;
  private readonly hpFill: HTMLElement;
  private readonly hpText: HTMLElement;
  private readonly xpFill: HTMLElement;
  private readonly levelText: HTMLElement;
  private readonly lootText: HTMLElement;
  private readonly killsText: HTMLElement;
  private readonly classText: HTMLElement;
  private readonly toast: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly skillEls: Record<SkillId, { root: HTMLElement; overlay: HTMLElement; name: HTMLElement }>;
  private toastTimer = 0;
  private hintAge = 0;
  private hintHidden = false;
  private levelFlashTimer = 0;
  /** Delay before swapping the Level Up toast for the skill-4 unlock line. */
  private skill4ToastDelay = -1;
  private skill4ToastMsg: string | null = null;
  private readonly prevReady: Record<SkillId, boolean> = {
    basic: true,
    slam: true,
    bash: true,
    burst: false,
  };
  private readonly prevLocked: Record<SkillId, boolean> = {
    basic: false,
    slam: false,
    bash: false,
    burst: true,
  };
  private readonly loading: HTMLElement;
  private readonly interactPrompt: HTMLElement;
  private readonly objectiveBanner: HTMLElement;
  private readonly buffChip: HTMLElement;
  private readonly dodgePip: HTMLElement;
  private readonly dodgeOverlay: HTMLElement;
  private readonly dodgeNum: HTMLElement;
  private readonly shopPanel: HTMLElement;
  private readonly shopGold: HTMLElement;
  private shopOpen = false;
  private shopHandlers: {
    onBuyPotion: () => void;
    onBuyCharm: () => void;
    onClose: () => void;
  } | null = null;
  private prevDodgeReady = true;
  private shownClass: PlayerClass | null = null;
  /** North-up radar canvas (world +Z = up). */
  private readonly minimapCanvas: HTMLCanvasElement;
  private readonly minimapCtx: CanvasRenderingContext2D;

  constructor(host: HTMLElement) {
    this.root = host;
    this.root.innerHTML = `
      <div class="loading-overlay" id="loading-overlay" hidden>
        <div class="loading-card">
          <p class="loading-title">SpiritVale Slice</p>
          <p class="loading-msg" id="loading-msg">Loading heroes…</p>
        </div>
      </div>
      <div class="hud-panel hud-top-left">
        <p class="brand" id="brand">SpiritVale Slice · Warrior</p>
        <div class="bar-row">
          <span class="bar-label">HP</span>
          <div class="bar-track"><div class="bar-fill" id="hp-fill"></div></div>
        </div>
        <p class="meta" id="hp-text">120 / 120</p>
        <div class="bar-row xp-row">
          <span class="bar-label">XP</span>
          <div class="bar-track"><div class="bar-fill xp-fill" id="xp-fill"></div></div>
        </div>
        <p class="meta" id="level-text">Level 1 · XP 0/20</p>
        <p class="meta class-line" id="class-text">Class: Warrior · <kbd>C</kbd>/<kbd>Tab</kbd> cycle</p>
      </div>
      <div class="hud-panel hud-top-right">
        <p class="meta" id="loot-text">Gold: 0</p>
        <p class="meta" id="kills-text">Kills: 0</p>
      </div>
      <div class="hud-panel shop-panel" id="shop-panel" hidden>
        <div class="shop-head">
          <p class="shop-title">Cottage Merchant</p>
          <button type="button" class="shop-close" id="shop-close" aria-label="Close shop">✕</button>
        </div>
        <p class="shop-gold" id="shop-gold">Gold: 0</p>
        <p class="shop-blurb">Spend chest gold on supplies.</p>
        <button type="button" class="shop-item" id="shop-buy-potion">
          <span class="shop-item-name">Health Potion</span>
          <span class="shop-item-desc">Instant heal · +50 HP</span>
          <span class="shop-item-price">${HEALTH_POTION_COST} gold</span>
        </button>
        <button type="button" class="shop-item" id="shop-buy-charm">
          <span class="shop-item-name">Damage Charm</span>
          <span class="shop-item-desc">+35% damage · 45s</span>
          <span class="shop-item-price">${DAMAGE_CHARM_COST} gold</span>
        </button>
        <p class="shop-hint"><kbd>E</kbd> / <kbd>Esc</kbd> close</p>
      </div>
      <div class="hud-panel hud-minimap" id="minimap-panel" title="Minimap · north up">
        <div class="minimap-head">
          <span class="minimap-title">Map</span>
          <span class="minimap-north">N</span>
        </div>
        <canvas id="minimap" width="${MINIMAP_SIZE}" height="${MINIMAP_SIZE}"></canvas>
        <div class="minimap-legend">
          <span><i class="lg shrine"></i>Shrine</span>
          <span><i class="lg grove"></i>Grove</span>
          <span><i class="lg ruins"></i>Ruins</span>
          <span><i class="lg ford"></i>Ford</span>
          <span><i class="lg gate"></i>Gate</span>
          <span><i class="lg market"></i>Market</span>
          <span><i class="lg cottage"></i>Shop</span>
        </div>
      </div>
      <div class="hud-panel hud-bottom" id="skills"></div>
      <div class="hud-panel hud-hint" id="controls-hint">
        <strong>Controls</strong><br/>
        WASD — move<br/>
        <kbd>Shift</kbd> — dodge roll<br/>
        LMB / 1 — skill 1<br/>
        2 / 3 / 4 — skills 2–4<br/>
        Skill 4 unlocks at Level ${SKILL4_UNLOCK_LEVEL}<br/>
        <kbd>C</kbd> / <kbd>Tab</kbd> — cycle Warrior → Mage → Rogue<br/>
        <kbd>E</kbd> — shrine / chests / spring / market sign / blacksmith / inn / cottage merchant<br/>
        Follow the dirt path west to the misty grove<br/>
        Follow the dirt path north to the ruins (healing spring)<br/>
        Follow the dirt path south to the river ford<br/>
        Follow the stone road northeast to the city gate &amp; market<br/>
        NW cottage — spend gold at the merchant<br/>
        RMB drag — rotate camera<br/>
        Scroll / pinch — zoom · <kbd>-</kbd><kbd>=</kbd> or <kbd>[</kbd><kbd>]</kbd>
      </div>
      <div class="interact-prompt" id="interact-prompt" hidden></div>
      <div class="objective-banner" id="objective-banner" hidden></div>
      <div class="buff-chip" id="buff-chip" hidden></div>
      <div class="toast" id="toast"></div>
    `;

    this.brand = this.root.querySelector('#brand')!;
    this.hpFill = this.root.querySelector('#hp-fill')!;
    this.hpText = this.root.querySelector('#hp-text')!;
    this.xpFill = this.root.querySelector('#xp-fill')!;
    this.levelText = this.root.querySelector('#level-text')!;
    this.lootText = this.root.querySelector('#loot-text')!;
    this.killsText = this.root.querySelector('#kills-text')!;
    this.classText = this.root.querySelector('#class-text')!;
    this.toast = this.root.querySelector('#toast')!;
    this.hint = this.root.querySelector('#controls-hint')!;
    this.loading = this.root.querySelector('#loading-overlay')!;
    this.interactPrompt = this.root.querySelector('#interact-prompt')!;
    this.objectiveBanner = this.root.querySelector('#objective-banner')!;
    this.buffChip = this.root.querySelector('#buff-chip')!;
    this.shopPanel = this.root.querySelector('#shop-panel')!;
    this.shopGold = this.root.querySelector('#shop-gold')!;

    this.root.querySelector('#shop-close')!.addEventListener('click', () => {
      this.shopHandlers?.onClose();
    });
    this.root.querySelector('#shop-buy-potion')!.addEventListener('click', () => {
      this.shopHandlers?.onBuyPotion();
    });
    this.root.querySelector('#shop-buy-charm')!.addEventListener('click', () => {
      this.shopHandlers?.onBuyCharm();
    });

    const skillsHost = this.root.querySelector('#skills')!;
    this.skillEls = {
      basic: this.makeSkillSlot(skillsHost, 'basic', 'Slash', '1'),
      slam: this.makeSkillSlot(skillsHost, 'slam', 'Quake', '2'),
      bash: this.makeSkillSlot(skillsHost, 'bash', 'Bash', '3'),
      burst: this.makeSkillSlot(skillsHost, 'burst', 'Leap', '4'),
    };

    // Compact dodge cooldown pip next to the skill row (Shift).
    this.dodgePip = document.createElement('div');
    this.dodgePip.className = 'dodge-pip ready';
    this.dodgePip.title = 'Dodge Roll (Shift)';
    this.dodgePip.innerHTML = `
      <span class="key">⇧</span>
      <span class="name">Dodge</span>
      <div class="cd-overlay"></div>
      <span class="cd-num"></span>
    `;
    skillsHost.appendChild(this.dodgePip);
    this.dodgeOverlay = this.dodgePip.querySelector('.cd-overlay') as HTMLElement;
    this.dodgeNum = this.dodgePip.querySelector('.cd-num') as HTMLElement;

    this.minimapCanvas = this.root.querySelector('#minimap') as HTMLCanvasElement;
    this.minimapCtx = this.minimapCanvas.getContext('2d')!;
  }

  setLoading(active: boolean, message = 'Loading heroes…'): void {
    const msg = this.loading.querySelector('#loading-msg');
    if (msg) msg.textContent = message;
    if (active) this.loading.removeAttribute('hidden');
    else this.loading.setAttribute('hidden', '');
  }

  private makeSkillSlot(
    host: Element,
    id: SkillId,
    name: string,
    key: string,
  ): { root: HTMLElement; overlay: HTMLElement; name: HTMLElement } {
    const el = document.createElement('div');
    el.className = 'skill-slot ready';
    el.dataset.skill = id;
    el.innerHTML = `
      <span class="key">${key}</span>
      <span class="name">${name}</span>
      <div class="cd-overlay"></div>
      <span class="cd-num"></span>
      <span class="lock-hint">Lv ${SKILL4_UNLOCK_LEVEL}</span>
    `;
    host.appendChild(el);
    return {
      root: el,
      overlay: el.querySelector('.cd-overlay') as HTMLElement,
      name: el.querySelector('.name') as HTMLElement,
    };
  }

  /** Refresh skill labels / brand when the active class changes. */
  syncClass(player: Player): void {
    const cls = player.playerClass;
    if (this.shownClass === cls) return;
    this.shownClass = cls;
    const label = CLASS_LABEL[cls];
    this.brand.textContent = `SpiritVale Slice · ${label}`;
    this.classText.innerHTML = `Class: ${label} · <kbd>C</kbd>/<kbd>Tab</kbd> cycle`;
    this.root.dataset.class = cls;

    for (const id of Object.keys(this.skillEls) as SkillId[]) {
      const def = player.skills[id].def;
      const el = this.skillEls[id];
      el.name.textContent = shortSkillName(def.name);
      el.root.title = `${def.name} (${def.keyHint})`;
      el.root.dataset.class = cls;
      // Force ready-pop refresh after rename.
      this.prevReady[id] = player.skills[id].cooldownRemaining <= 0 && !player.isSkillLocked(id);
      this.prevLocked[id] = player.isSkillLocked(id);
    }
  }

  update(player: Player, lootCount: number, kills: number, dt: number): void {
    this.syncClass(player);

    const ratio = player.hpRatio;
    this.hpFill.style.transform = `scaleX(${ratio})`;
    this.hpFill.classList.toggle('hurt', ratio < 0.35);
    this.hpText.textContent = `${Math.ceil(player.hp)} / ${player.maxHp}`;

    this.xpFill.style.transform = `scaleX(${player.xpRatio})`;
    this.levelText.textContent = `Level ${player.level} · XP ${player.xp}/${player.xpToNext}`;

    this.lootText.textContent = `Gold: ${lootCount}`;
    this.killsText.textContent = `Kills: ${kills}`;
    if (this.shopOpen) {
      this.shopGold.textContent = `Gold: ${lootCount}`;
    }

    this.syncSkill('basic', player);
    this.syncSkill('slam', player);
    this.syncSkill('bash', player);
    this.syncSkill('burst', player);
    this.syncDodge(player);

    // Slot-4 unlock toast — works for kill XP and any other gainXp path.
    const unlock = player.consumeSkill4UnlockToast();
    if (unlock) {
      this.skill4ToastMsg = unlock;
      this.skill4ToastDelay = 0.85;
    }
    if (this.skill4ToastDelay >= 0) {
      this.skill4ToastDelay -= dt;
      if (this.skill4ToastDelay <= 0 && this.skill4ToastMsg) {
        this.showToast(this.skill4ToastMsg, 2.4);
        this.skill4ToastMsg = null;
        this.skill4ToastDelay = -1;
      }
    }

    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toast.classList.remove('show', 'level-up');
    }

    if (this.levelFlashTimer > 0) {
      this.levelFlashTimer -= dt;
      if (this.levelFlashTimer <= 0) {
        this.levelText.classList.remove('level-flash');
        this.xpFill.classList.remove('level-flash');
      }
    }

    if (!this.hintHidden) {
      this.hintAge += dt;
      if (this.hintAge > 12) {
        this.hint.classList.add('fade');
        this.hintHidden = true;
      }
    }

    if (player.hasShrineBuff) {
      this.buffChip.hidden = false;
      this.buffChip.textContent = `${player.activeBuffLabel}  ·  ${Math.ceil(player.shrineBuffRemain)}s`;
    } else {
      this.buffChip.hidden = true;
    }
  }

  /** Wire shop buy / close callbacks once after Game constructs the merchant. */
  bindShopHandlers(handlers: {
    onBuyPotion: () => void;
    onBuyCharm: () => void;
    onClose: () => void;
  }): void {
    this.shopHandlers = handlers;
  }

  setShopOpen(open: boolean, gold: number): void {
    this.shopOpen = open;
    this.shopGold.textContent = `Gold: ${gold}`;
    if (open) this.shopPanel.removeAttribute('hidden');
    else this.shopPanel.setAttribute('hidden', '');
  }

  /**
   * Compact north-up radar: world +Z = screen up, +X = screen right.
   * North-up (not camera-relative) so shrine/grove/ruins/ford stay fixed landmarks
   * while the player arrow rotates with facing.
   */
  updateMinimap(
    player: Player,
    enemies: ReadonlyArray<{ position: { x: number; z: number }; alive: boolean }>,
  ): void {
    const ctx = this.minimapCtx;
    const size = MINIMAP_SIZE;
    const half = size * 0.5;
    const scale = (half - 8) / MINIMAP_EXTENT;

    const toScreen = (x: number, z: number): { sx: number; sy: number } => ({
      sx: half + x * scale,
      sy: half - z * scale,
    });

    ctx.clearRect(0, 0, size, size);

    // Meadow air wash
    const wash = ctx.createRadialGradient(half, half, 8, half, half, half);
    wash.addColorStop(0, '#d8f0c8');
    wash.addColorStop(0.55, '#9ed67a');
    wash.addColorStop(1, '#6fb35a');
    ctx.fillStyle = wash;
    ctx.beginPath();
    ctx.arc(half, half, half - 1, 0, Math.PI * 2);
    ctx.fill();

    // Soft play ring
    ctx.strokeStyle = 'rgba(255, 252, 245, 0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(half, half, 44 * scale, 0, Math.PI * 2);
    ctx.stroke();

    // Cardinal path hints (faint)
    ctx.strokeStyle = 'rgba(140, 96, 48, 0.35)';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    const paths: Array<[number, number, number, number]> = [
      [0, 0, EastShrineClearing.x, EastShrineClearing.z],
      [0, 0, WestMistyGrove.x, WestMistyGrove.z],
      [0, 0, NorthRuinsClearing.x, NorthRuinsClearing.z],
      [0, 0, SouthRiverFordClearing.x, SouthRiverFordClearing.z],
      [0, 0, NortheastCityGate.x, NortheastCityGate.z],
      [NortheastCityGate.x, NortheastCityGate.z, NortheastMarketDistrict.x, NortheastMarketDistrict.z],
    ];
    for (const [ax, az, bx, bz] of paths) {
      const a = toScreen(ax, az);
      const b = toScreen(bx, bz);
      ctx.beginPath();
      ctx.moveTo(a.sx, a.sy);
      ctx.lineTo(b.sx, b.sy);
      ctx.stroke();
    }

    // Enemy dots
    for (const e of enemies) {
      if (!e.alive) continue;
      const p = toScreen(e.position.x, e.position.z);
      if (p.sx < 2 || p.sy < 2 || p.sx > size - 2 || p.sy > size - 2) continue;
      ctx.fillStyle = '#d64545';
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Landmark markers
    for (const mark of MINIMAP_LANDMARKS) {
      const p = toScreen(mark.x, mark.z);
      const isGate =
        mark.x === NortheastCityGate.x && mark.z === NortheastCityGate.z;
      const isMarket =
        mark.x === NortheastMarketDistrict.x && mark.z === NortheastMarketDistrict.z;
      ctx.fillStyle = mark.color;
      ctx.strokeStyle = 'rgba(31, 42, 36, 0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (isGate || isMarket) {
        // Town icons — small squares so they read apart from clearing dots
        const s = mark.r;
        ctx.rect(p.sx - s * 0.7, p.sy - s * 0.7, s * 1.4, s * 1.4);
      } else {
        ctx.arc(p.sx, p.sy, mark.r, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.stroke();
    }

    // Player facing arrow (yaw 0 = +Z / north)
    const me = toScreen(player.position.x, player.position.z);
    const yaw = Math.atan2(player.facing.x, player.facing.z);
    ctx.save();
    ctx.translate(me.sx, me.sy);
    ctx.rotate(yaw);
    ctx.fillStyle = '#1f2a24';
    ctx.strokeStyle = '#fff8e8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(0, 3.5);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Clip ring border
    ctx.strokeStyle = 'rgba(47, 143, 91, 0.65)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(half, half, half - 1.5, 0, Math.PI * 2);
    ctx.stroke();
  }

  /** Proximity prompt + defense objective / cooldown readouts for the east shrine. */
  setShrineHud(state: {
    promptVisible: boolean;
    promptText: string;
    objectiveVisible: boolean;
    objectiveText: string;
    cooldownVisible: boolean;
    cooldownText: string;
  }): void {
    if (state.promptVisible) {
      this.interactPrompt.hidden = false;
      this.interactPrompt.textContent = state.promptText;
    } else {
      this.interactPrompt.hidden = true;
    }

    if (state.objectiveVisible) {
      this.objectiveBanner.hidden = false;
      this.objectiveBanner.textContent = state.objectiveText;
    } else if (state.cooldownVisible) {
      this.objectiveBanner.hidden = false;
      this.objectiveBanner.textContent = state.cooldownText;
    } else {
      this.objectiveBanner.hidden = true;
    }
  }

  private syncDodge(player: Player): void {
    const cd = player.dodgeCooldownRemaining;
    const ready = cd <= 0;
    if (ready) {
      this.dodgePip.classList.add('ready');
      this.dodgeOverlay.style.transform = 'translateY(100%)';
      this.dodgeNum.textContent = '';
      this.dodgeNum.classList.remove('show');
      if (!this.prevDodgeReady) {
        this.dodgePip.classList.remove('pop');
        void this.dodgePip.offsetWidth;
        this.dodgePip.classList.add('pop');
      }
    } else {
      this.dodgePip.classList.remove('ready');
      const pct = 1 - player.dodgeReadyRatio;
      this.dodgeOverlay.style.transform = `translateY(${(1 - pct) * 100}%)`;
      this.dodgeNum.textContent = cd.toFixed(1);
      this.dodgeNum.classList.add('show');
    }
    this.prevDodgeReady = ready;
  }

  private syncSkill(id: SkillId, player: Player): void {
    const state = player.skills[id];
    const el = this.skillEls[id];
    const locked = player.isSkillLocked(id);
    const cd = state.cooldownRemaining;
    const num = el.root.querySelector('.cd-num') as HTMLElement | null;
    const lockHint = el.root.querySelector('.lock-hint') as HTMLElement | null;

    el.root.classList.toggle('locked', locked);
    if (lockHint) {
      lockHint.textContent = `Lv ${SKILL4_UNLOCK_LEVEL}`;
      lockHint.classList.toggle('show', locked);
    }

    if (locked) {
      el.root.classList.remove('ready', 'pop');
      el.overlay.style.transform = 'translateY(0%)';
      if (num) {
        num.textContent = '';
        num.classList.remove('show');
      }
      this.prevReady[id] = false;
      this.prevLocked[id] = true;
      return;
    }

    if (this.prevLocked[id]) {
      // Just unlocked — brief ready pop so the new slot is obvious.
      el.root.classList.remove('pop');
      void el.root.offsetWidth;
      el.root.classList.add('pop');
    }
    this.prevLocked[id] = false;

    const ready = cd <= 0;
    if (ready) {
      el.root.classList.add('ready');
      el.overlay.style.transform = 'translateY(100%)';
      if (num) {
        num.textContent = '';
        num.classList.remove('show');
      }
      if (!this.prevReady[id]) {
        el.root.classList.remove('pop');
        void el.root.offsetWidth;
        el.root.classList.add('pop');
      }
    } else {
      el.root.classList.remove('ready');
      const pct = cd / state.def.cooldown;
      el.overlay.style.transform = `translateY(${(1 - pct) * 100}%)`;
      if (num) {
        num.textContent = cd.toFixed(1);
        num.classList.add('show');
      }
    }
    this.prevReady[id] = ready;
  }

  showToast(message: string, duration = 1.4): void {
    this.toast.textContent = message;
    this.toast.classList.add('show');
    this.toast.classList.toggle('level-up', /Level Up|Unlocked:/i.test(message));
    this.toastTimer = duration;
  }

  /** Brief HUD pop when the player levels — bar + level line pulse. */
  flashLevelUp(): void {
    this.levelText.classList.remove('level-flash');
    this.xpFill.classList.remove('level-flash');
    void this.levelText.offsetWidth;
    this.levelText.classList.add('level-flash');
    this.xpFill.classList.add('level-flash');
    this.levelFlashTimer = 0.85;
  }
}

function shortSkillName(name: string): string {
  // Fit HUD slots: "Shield Bash" → "Bash", "Arcane Bolt" → "Bolt", etc.
  if (name === 'Shield Bash') return 'Bash';
  if (name === 'Arcane Bolt') return 'Bolt';
  if (name === 'Frost Nova') return 'Nova';
  if (name === 'Arcane Ward') return 'Ward';
  if (name === 'Leap Strike') return 'Leap';
  if (name === 'Meteor') return 'Meteor';
  if (name === 'Fan of Knives') return 'Fan';
  if (name === 'Smoke Bomb') return 'Smoke';
  if (name === 'Shadow Leap') return 'Shadow';
  if (name === 'Stab') return 'Stab';
  return name;
}
