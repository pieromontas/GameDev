import { Player } from '../entities/Player';
import { SkillId } from '../combat/Skills';

export class HUD {
  private readonly root: HTMLElement;
  private readonly hpFill: HTMLElement;
  private readonly hpText: HTMLElement;
  private readonly lootText: HTMLElement;
  private readonly killsText: HTMLElement;
  private readonly toast: HTMLElement;
  private readonly skillEls: Record<SkillId, { root: HTMLElement; overlay: HTMLElement }>;
  private toastTimer = 0;

  constructor(host: HTMLElement) {
    this.root = host;
    this.root.innerHTML = `
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
      <div class="hud-panel hud-hint">
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

    const skillsHost = this.root.querySelector('#skills')!;
    this.skillEls = {
      basic: this.makeSkillSlot(skillsHost, 'basic', 'Slash', '1'),
      slam: this.makeSkillSlot(skillsHost, 'slam', 'Quake', '2'),
    };
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
      <div class="cd-overlay">0</div>
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
  }

  private syncSkill(id: SkillId, player: Player): void {
    const state = player.skills[id];
    const el = this.skillEls[id];
    const cd = state.cooldownRemaining;
    if (cd <= 0) {
      el.root.classList.add('ready');
      el.overlay.style.transform = 'translateY(100%)';
      el.overlay.textContent = '';
    } else {
      el.root.classList.remove('ready');
      const pct = cd / state.def.cooldown;
      el.overlay.style.transform = `translateY(${(1 - pct) * 100}%)`;
      el.overlay.textContent = cd.toFixed(1);
    }
  }

  showToast(message: string, duration = 1.4): void {
    this.toast.textContent = message;
    this.toast.classList.add('show');
    this.toastTimer = duration;
  }
}
