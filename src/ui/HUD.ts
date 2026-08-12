import { Player } from '../entities/Player';
import { CLASS_LABEL, PlayerClass, SkillId } from '../combat/Skills';

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
  private readonly prevReady: Record<SkillId, boolean> = { basic: true, slam: true, bash: true };
  private readonly loading: HTMLElement;
  private readonly interactPrompt: HTMLElement;
  private readonly objectiveBanner: HTMLElement;
  private readonly buffChip: HTMLElement;
  private shownClass: PlayerClass | null = null;

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
        <p class="meta class-line" id="class-text">Class: Warrior · press <kbd>C</kbd> to switch</p>
      </div>
      <div class="hud-panel hud-top-right">
        <p class="meta" id="loot-text">Loot: 0</p>
        <p class="meta" id="kills-text">Kills: 0</p>
      </div>
      <div class="hud-panel hud-bottom" id="skills"></div>
      <div class="hud-panel hud-hint" id="controls-hint">
        <strong>Controls</strong><br/>
        WASD — move<br/>
        LMB / 1 — skill 1<br/>
        2 / 3 — skills 2 &amp; 3<br/>
        <kbd>C</kbd> — switch Warrior / Mage<br/>
        <kbd>E</kbd> — awaken east shrine<br/>
        Follow the dirt path west to the misty grove<br/>
        RMB drag — rotate camera
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

    const skillsHost = this.root.querySelector('#skills')!;
    this.skillEls = {
      basic: this.makeSkillSlot(skillsHost, 'basic', 'Slash', '1'),
      slam: this.makeSkillSlot(skillsHost, 'slam', 'Quake', '2'),
      bash: this.makeSkillSlot(skillsHost, 'bash', 'Bash', '3'),
    };
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
    this.classText.innerHTML = `Class: ${label} · press <kbd>C</kbd> to switch`;
    this.root.dataset.class = cls;

    for (const id of Object.keys(this.skillEls) as SkillId[]) {
      const def = player.skills[id].def;
      const el = this.skillEls[id];
      el.name.textContent = shortSkillName(def.name);
      el.root.title = `${def.name} (${def.keyHint})`;
      el.root.dataset.class = cls;
      // Force ready-pop refresh after rename.
      this.prevReady[id] = player.skills[id].cooldownRemaining <= 0;
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

    this.lootText.textContent = `Loot: ${lootCount}`;
    this.killsText.textContent = `Kills: ${kills}`;

    this.syncSkill('basic', player);
    this.syncSkill('slam', player);
    this.syncSkill('bash', player);

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
      this.buffChip.textContent = `Shrine Blessing  ·  ${Math.ceil(player.shrineBuffRemain)}s`;
    } else {
      this.buffChip.hidden = true;
    }
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

  private syncSkill(id: SkillId, player: Player): void {
    const state = player.skills[id];
    const el = this.skillEls[id];
    const cd = state.cooldownRemaining;
    const num = el.root.querySelector('.cd-num') as HTMLElement | null;
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
    this.toast.classList.toggle('level-up', /Level Up/i.test(message));
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
  return name;
}
