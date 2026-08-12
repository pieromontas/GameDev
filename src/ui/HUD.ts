import { Player } from '../entities/Player';
import { SkillId } from '../combat/Skills';

export class HUD {
  private readonly root: HTMLElement;
  private readonly hpFill: HTMLElement;
  private readonly hpText: HTMLElement;
  private readonly lootText: HTMLElement;
  private readonly killsText: HTMLElement;
  private readonly toast: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly skillEls: Record<SkillId, { root: HTMLElement; overlay: HTMLElement }>;
  private toastTimer = 0;
  private hintAge = 0;
  private hintHidden = false;
  private readonly prevReady: Record<SkillId, boolean> = { basic: true, slam: true };
  private readonly loading: HTMLElement;

  constructor(host: HTMLElement) {
    this.root = host;
    this.root.innerHTML = `
      <div class="loading-overlay" id="loading-overlay" hidden>
        <div class="loading-card">
          <p class="loading-title">SpiritVale Slice</p>
          <p class="loading-msg" id="loading-msg">Loading warrior…</p>
        </div>
      </div>
      <div class="hud-panel hud-top-left">
        <p class="brand">SpiritVale Slice · Warrior</p>
        <div class="bar-row">
          <span class="bar-label">HP</span>
          <div class="bar-track"><div class="bar-fill" id="hp-fill"></div></div>
        </div>
        <p class="meta" id="hp-text">120 / 120</p>
      </div>
      <div class="hud-panel hud-top-right">
        <p class="meta" id="loot-text">Loot: 0</p>
        <p class="meta" id="kills-text">Kills: 0</p>
      </div>
      <div class="hud-panel hud-bottom" id="skills"></div>
      <div class="hud-panel hud-hint" id="controls-hint">
        <strong>Controls</strong><br/>
        WASD — move<br/>
        LMB / 1 — Slash<br/>
        2 — Quake (AoE)<br/>
        RMB drag — rotate camera
      </div>
      <div class="toast" id="toast"></div>
    `;

    this.hpFill = this.root.querySelector('#hp-fill')!;
    this.hpText = this.root.querySelector('#hp-text')!;
    this.lootText = this.root.querySelector('#loot-text')!;
    this.killsText = this.root.querySelector('#kills-text')!;
    this.toast = this.root.querySelector('#toast')!;
    this.hint = this.root.querySelector('#controls-hint')!;
    this.loading = this.root.querySelector('#loading-overlay')!;

    const skillsHost = this.root.querySelector('#skills')!;
    this.skillEls = {
      basic: this.makeSkillSlot(skillsHost, 'basic', 'Slash', '1'),
      slam: this.makeSkillSlot(skillsHost, 'slam', 'Quake', '2'),
    };
  }

  setLoading(active: boolean, message = 'Loading warrior…'): void {
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
  ): { root: HTMLElement; overlay: HTMLElement } {
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
    return { root: el, overlay: el.querySelector('.cd-overlay') as HTMLElement };
  }

  update(player: Player, lootCount: number, kills: number, dt: number): void {
    const ratio = player.hpRatio;
    this.hpFill.style.transform = `scaleX(${ratio})`;
    this.hpFill.classList.toggle('hurt', ratio < 0.35);
    this.hpText.textContent = `${Math.ceil(player.hp)} / ${player.maxHp}`;
    this.lootText.textContent = `Loot: ${lootCount}`;
    this.killsText.textContent = `Kills: ${kills}`;

    this.syncSkill('basic', player);
    this.syncSkill('slam', player);

    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toast.classList.remove('show');
    }

    if (!this.hintHidden) {
      this.hintAge += dt;
      if (this.hintAge > 10) {
        this.hint.classList.add('fade');
        this.hintHidden = true;
      }
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
        // restart CSS animation
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
    this.toastTimer = duration;
  }
}
