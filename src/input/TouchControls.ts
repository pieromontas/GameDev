import type { InputManager } from './InputManager';

const STICK_DEADZONE = 0.14;
const STICK_RADIUS_PX = 58;
const ROTATE_HINT = 'Rotate for landscape';

/** Primary pointing device is a finger (phone / tablet), not a desktop mouse. */
export function isCoarsePointer(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (new URLSearchParams(window.location.search).get('touch') === '1') return true;
  } catch {
    /* ignore */
  }
  if (window.matchMedia('(pointer: coarse)').matches) return true;
  if ('ontouchstart' in window && window.matchMedia('(hover: none)').matches) {
    return true;
  }
  return false;
}

/**
 * On-screen left stick + action cluster for phone browsers.
 * Feeds InputManager so Game movement / skills / E / dodge stay on one path.
 */
export class TouchControls {
  private readonly root: HTMLElement;
  private readonly stickZone: HTMLElement;
  private readonly stick: HTMLElement;
  private readonly knob: HTMLElement;
  private readonly rotateHint: HTMLElement;
  private readonly coarseMq: MediaQueryList;
  private readonly hoverMq: MediaQueryList;
  private stickPointerId: number | null = null;
  private originX = 0;
  private originY = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly input: InputManager,
    host: HTMLElement,
  ) {
    this.root = document.createElement('div');
    this.root.id = 'touch-controls';
    this.root.hidden = true;
    this.root.setAttribute('aria-hidden', 'true');
    this.root.innerHTML = `
      <p class="touch-rotate-hint" id="touch-rotate-hint">${ROTATE_HINT}</p>
      <div class="touch-stick-zone" id="touch-stick-zone">
        <div class="touch-stick" id="touch-stick">
          <div class="touch-stick-base">
            <div class="touch-stick-knob" id="touch-stick-knob"></div>
          </div>
        </div>
      </div>
      <div class="touch-actions" id="touch-actions">
        <button type="button" class="touch-btn touch-btn-skill" data-code="Digit2" aria-label="Skill 2">2</button>
        <button type="button" class="touch-btn touch-btn-skill" data-code="Digit3" aria-label="Skill 3">3</button>
        <button type="button" class="touch-btn touch-btn-skill" data-code="Digit4" aria-label="Skill 4">4</button>
        <button type="button" class="touch-btn touch-btn-atk" data-code="PointerPrimary" aria-label="Attack, skill 1">1</button>
        <button type="button" class="touch-btn touch-btn-dodge" data-code="ShiftLeft" aria-label="Dodge">Dodge</button>
        <button type="button" class="touch-btn touch-btn-use" data-code="KeyE" aria-label="Interact">E</button>
      </div>
    `;
    host.appendChild(this.root);

    this.stickZone = this.root.querySelector('#touch-stick-zone')!;
    this.stick = this.root.querySelector('#touch-stick')!;
    this.knob = this.root.querySelector('#touch-stick-knob')!;
    this.rotateHint = this.root.querySelector('#touch-rotate-hint')!;

    this.stickZone.addEventListener('pointerdown', this.onStickDown);
    this.stick.addEventListener('pointerdown', this.onStickDown);
    // Capture so a left-half press still starts the stick if the canvas wins hit-testing.
    document.addEventListener('pointerdown', this.onGlobalStickDown, true);
    window.addEventListener('pointermove', this.onStickMove, { passive: false });
    window.addEventListener('pointerup', this.onStickUp);
    window.addEventListener('pointercancel', this.onStickUp);
    this.stickZone.addEventListener('contextmenu', (e) => e.preventDefault());

    this.root.querySelectorAll<HTMLButtonElement>('.touch-btn').forEach((btn) => {
      btn.addEventListener('pointerdown', this.onButtonDown);
      btn.addEventListener('pointerup', this.onButtonUp);
      btn.addEventListener('pointercancel', this.onButtonUp);
      btn.addEventListener('lostpointercapture', this.onButtonUp);
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    });

    this.canvas.addEventListener('touchmove', this.suppressScroll, { passive: false });
    this.root.addEventListener('touchmove', this.suppressScroll, { passive: false });
    document.addEventListener('touchmove', this.suppressScroll, { passive: false });

    this.coarseMq = window.matchMedia('(pointer: coarse)');
    this.hoverMq = window.matchMedia('(hover: none)');
    this.coarseMq.addEventListener('change', this.syncMode);
    this.hoverMq.addEventListener('change', this.syncMode);
    window.addEventListener('resize', this.syncMode);
    window.addEventListener('orientationchange', this.syncMode);

    this.syncMode();
  }

  dispose(): void {
    this.clearStick();
    this.stickZone.removeEventListener('pointerdown', this.onStickDown);
    this.stick.removeEventListener('pointerdown', this.onStickDown);
    document.removeEventListener('pointerdown', this.onGlobalStickDown, true);
    window.removeEventListener('pointermove', this.onStickMove);
    window.removeEventListener('pointerup', this.onStickUp);
    window.removeEventListener('pointercancel', this.onStickUp);
    this.canvas.removeEventListener('touchmove', this.suppressScroll);
    this.root.removeEventListener('touchmove', this.suppressScroll);
    document.removeEventListener('touchmove', this.suppressScroll);
    this.coarseMq.removeEventListener('change', this.syncMode);
    this.hoverMq.removeEventListener('change', this.syncMode);
    window.removeEventListener('resize', this.syncMode);
    window.removeEventListener('orientationchange', this.syncMode);
    this.root.remove();
    this.input.setCanvasTouchPlay(false);
    document.documentElement.classList.remove('touch-play', 'touch-portrait');
  }

  private syncMode = (): void => {
    const show = isCoarsePointer();
    this.root.hidden = !show;
    this.root.setAttribute('aria-hidden', show ? 'false' : 'true');
    document.documentElement.classList.toggle('touch-play', show);
    document.documentElement.classList.toggle(
      'touch-portrait',
      show && window.innerHeight > window.innerWidth,
    );
    this.input.setCanvasTouchPlay(show);
    this.rotateHint.hidden = !(show && window.innerHeight > window.innerWidth);
    if (!show) this.clearStick();
  };

  private suppressScroll = (e: TouchEvent): void => {
    const el = e.target as HTMLElement | null;
    if (el?.closest('.shop-panel')) return;
    e.preventDefault();
  };

  /** Left-half press starts the stick even when the canvas is the hit target. */
  private onGlobalStickDown = (e: PointerEvent): void => {
    if (this.root.hidden) return;
    if (this.stickPointerId !== null) return;
    const t = e.target as HTMLElement | null;
    if (t?.closest('.touch-btn, .shop-panel, #minimap-panel')) return;
    const zone = this.stickZone.getBoundingClientRect();
    if (zone.width <= 0 || zone.height <= 0) return;
    if (e.clientX > zone.right || e.clientY < zone.top) return;
    this.onStickDown(e);
  };

  private onStickDown = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' && !isCoarsePointer()) return;
    if (this.stickPointerId !== null) return;
    e.preventDefault();
    e.stopPropagation();
    this.stickPointerId = e.pointerId;
    const rect = this.stick.getBoundingClientRect();
    this.originX = rect.left + rect.width * 0.5;
    this.originY = rect.top + rect.height * 0.5;
    this.stick.classList.add('active');
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    this.applyStick(e.clientX, e.clientY);
  };

  private onStickMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.stickPointerId) return;
    e.preventDefault();
    this.applyStick(e.clientX, e.clientY);
  };

  private onStickUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.stickPointerId) return;
    e.preventDefault();
    this.clearStick();
  };

  private applyStick(clientX: number, clientY: number): void {
    const dx = clientX - this.originX;
    const dy = clientY - this.originY;
    const mag = Math.hypot(dx, dy);
    const radius = STICK_RADIUS_PX;
    const nx = mag > 1e-6 ? dx / mag : 0;
    const ny = mag > 1e-6 ? dy / mag : 0;
    const clamped = Math.min(mag, radius);
    this.knob.style.transform = `translate(${nx * clamped}px, ${ny * clamped}px)`;

    const analog = mag / radius;
    if (analog < STICK_DEADZONE) {
      this.input.setTouchMove(0, 0);
      return;
    }
    const scaled = Math.min(1, (analog - STICK_DEADZONE) / (1 - STICK_DEADZONE));
    // Screen right = +x (D); screen down = +z (S) — same as getMoveAxes().
    this.input.setTouchMove(nx * scaled, ny * scaled);
  }

  private clearStick(): void {
    this.stickPointerId = null;
    this.input.setTouchMove(0, 0);
    this.knob.style.transform = 'translate(0px, 0px)';
    this.stick.classList.remove('active');
  }

  private onButtonDown = (e: PointerEvent): void => {
    const btn = e.currentTarget as HTMLButtonElement;
    const code = btn.dataset.code;
    if (!code) return;
    e.preventDefault();
    e.stopPropagation();
    btn.classList.add('is-down');
    try {
      btn.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    this.input.tapVirtual(code);
  };

  private onButtonUp = (e: PointerEvent): void => {
    const btn = e.currentTarget as HTMLButtonElement;
    btn.classList.remove('is-down');
    try {
      btn.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };
}
