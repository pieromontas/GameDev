/** Move-key tap latch: discrete keydown+keyup still yields a visible step. */
const MOVE_LATCH_MS = 80;

const MOVE_CODES = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowLeft',
  'ArrowDown',
  'ArrowRight',
]);

export class InputManager {
  private readonly keys = new Set<string>();
  private readonly justPressed = new Set<string>();
  /** performance.now() expiry per move code — held keys stay via `keys`; taps keep latch. */
  private readonly moveLatchUntil = new Map<string, number>();
  /**
   * One-shot: non-repeat move press forces that axis fully active until endFrame,
   * so a same-tick keyup or a tiny dt frame still counts as a step.
   */
  private readonly moveImpulse = new Set<string>();
  private pointerX = 0;
  private pointerY = 0;
  private yawDragging = false;
  private yawDelta = 0;
  private pitchDelta = 0;
  private resetCameraRequested = false;
  /** Accumulated orbit zoom (world units of distance). Positive = zoom out. */
  private zoomDelta = 0;
  /** Analog stick axes in the same space as WASD (`x` right, `z` down/back). */
  private touchMoveX = 0;
  private touchMoveZ = 0;
  /** Touch look pointer (right-half drag). Independent of mouse RMB. */
  private lookPointerId: number | null = null;
  private lookLastX = 0;
  private lookLastY = 0;

  constructor(private readonly target: HTMLElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    target.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    window.addEventListener('pointermove', this.onPointerMove);
    // passive:false so we can prevent page scroll / browser pinch-zoom over the canvas.
    target.addEventListener('wheel', this.onWheel, { passive: false });
    target.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.target.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
    window.removeEventListener('pointermove', this.onPointerMove);
    this.target.removeEventListener('wheel', this.onWheel);
  }

  /** Call once per frame after gameplay has consumed edge-triggered inputs. */
  endFrame(): void {
    this.justPressed.clear();
    this.moveImpulse.clear();
    this.yawDelta = 0;
    this.pitchDelta = 0;
    this.resetCameraRequested = false;
    this.zoomDelta = 0;
  }

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  wasPressed(code: string): boolean {
    return this.justPressed.has(code);
  }

  consumeAttackClick(): boolean {
    // Primary click attack — never tied to camera yaw (RMB-only rotate).
    return this.justPressed.has('PointerPrimary');
  }

  /**
   * Virtual left stick. Axes match WASD (`x` right, `z` screen-down / KeyS).
   * Magnitude is clamped to 1. Finger up should pass (0, 0).
   */
  setTouchMove(x: number, z: number): void {
    const mag = Math.hypot(x, z);
    if (mag > 1) {
      x /= mag;
      z /= mag;
    } else if (mag < 1e-6) {
      x = 0;
      z = 0;
    }
    this.touchMoveX = x;
    this.touchMoveZ = z;
  }

  /**
   * One-frame key / pointer edge for on-screen buttons (skills, dodge, E, LMB).
   * Does not leave `keys` held — matches keyboard tap → `wasPressed`.
   */
  tapVirtual(code: string): void {
    this.justPressed.add(code);
    if (MOVE_CODES.has(code)) {
      this.moveLatchUntil.set(code, performance.now() + MOVE_LATCH_MS);
      this.moveImpulse.add(code);
    }
  }

  getMoveAxes(): { x: number; z: number } {
    let x = 0;
    let z = 0;
    // Held keys OR tap latch / impulse (hosts that emit keydown+keyup or latch-refreshing repeats).
    // wasPressed covers the same-frame edge if latch somehow missed.
    if (this.moveActive('KeyA') || this.moveActive('ArrowLeft')) x -= 1;
    if (this.moveActive('KeyD') || this.moveActive('ArrowRight')) x += 1;
    if (this.moveActive('KeyW') || this.moveActive('ArrowUp')) z -= 1;
    if (this.moveActive('KeyS') || this.moveActive('ArrowDown')) z += 1;
    x += this.touchMoveX;
    z += this.touchMoveZ;
    const mag = Math.hypot(x, z);
    if (mag > 1) {
      x /= mag;
      z /= mag;
    }
    return { x, z };
  }

  /** True while key is held, while tap latch is live, on press frame, or impulse frame. */
  private moveActive(code: string): boolean {
    if (this.keys.has(code) || this.justPressed.has(code) || this.moveImpulse.has(code)) {
      return true;
    }
    const until = this.moveLatchUntil.get(code);
    if (until === undefined) return false;
    if (performance.now() < until) return true;
    this.moveLatchUntil.delete(code);
    return false;
  }

  consumeYawDelta(): number {
    const d = this.yawDelta;
    this.yawDelta = 0;
    return d;
  }

  consumePitchDelta(): number {
    const d = this.pitchDelta;
    this.pitchDelta = 0;
    return d;
  }

  consumeResetCamera(): boolean {
    const r = this.resetCameraRequested;
    this.resetCameraRequested = false;
    return r;
  }

  /** Orbit zoom delta in distance units (positive = out). Cleared when consumed. */
  consumeZoomDelta(): number {
    const d = this.zoomDelta;
    this.zoomDelta = 0;
    return d;
  }

  getPointerNdc(width: number, height: number): { x: number; y: number } {
    return {
      x: (this.pointerX / width) * 2 - 1,
      y: -(this.pointerY / height) * 2 + 1,
    };
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    // Keep Tab for in-game class switch instead of browser focus cycling.
    if (e.code === 'Tab') e.preventDefault();
    // Avoid page zoom / find when using camera zoom keys.
    if (
      e.code === 'Minus' ||
      e.code === 'Equal' ||
      e.code === 'BracketLeft' ||
      e.code === 'BracketRight' ||
      e.code === 'PageUp' ||
      e.code === 'PageDown' ||
      e.code === 'Home'
    ) {
      e.preventDefault();
    }

    if (e.code === 'Home' || e.code === 'Backquote') {
      this.resetCameraRequested = true;
    }

    // Synthetic / remote hosts often pulse keydown+keyup then stream keydown.repeat
    // with no lasting `keys` entry — and often no final keyup. Refresh latch only
    // so walking continues while repeats arrive, then stops ~MOVE_LATCH_MS later.
    // Never keys.add on repeat (would stick if keyup never comes); never justPressed.
    if (e.repeat) {
      if (MOVE_CODES.has(e.code)) {
        this.moveLatchUntil.set(e.code, performance.now() + MOVE_LATCH_MS);
      }
      return;
    }

    this.keys.add(e.code);
    this.justPressed.add(e.code);
    // Latch move axes past a same-tick keyup so getMoveAxes() still samples a step.
    if (MOVE_CODES.has(e.code)) {
      this.moveLatchUntil.set(e.code, performance.now() + MOVE_LATCH_MS);
      this.moveImpulse.add(e.code);
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
    // Do not clear moveLatchUntil here — latch lasts until expiry (or keep holding via keys).
  };

  private onPointerDown = (e: PointerEvent): void => {
    this.pointerX = e.clientX;
    this.pointerY = e.clientY;

    // Touch: never LMB-attack from the canvas. Right half = look; left half is the stick overlay.
    if (e.pointerType === 'touch') {
      const rect = this.target.getBoundingClientRect();
      const midX = rect.left + rect.width * 0.5;
      if (e.clientX >= midX && this.lookPointerId === null) {
        this.lookPointerId = e.pointerId;
        this.lookLastX = e.clientX;
        this.lookLastY = e.clientY;
        try {
          this.target.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      }
      return;
    }

    if (e.button === 0 && !e.altKey && !e.ctrlKey) {
      this.justPressed.add('PointerPrimary');
      try {
        this.target.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    } else if (e.button === 2 || e.button === 1 || (e.button === 0 && (e.altKey || e.ctrlKey))) {
      this.yawDragging = true;
      try {
        this.target.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    try {
      this.target.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (this.lookPointerId === e.pointerId) {
      this.lookPointerId = null;
    }
    if (e.button === 2 || e.button === 1 || (e.button === 0 && (e.altKey || e.ctrlKey))) {
      this.yawDragging = false;
    }
    // Mouse LMB look (alt/ctrl) may end without alt still down; also stop if no buttons held.
    if ((e.buttons & 6) === 0 && (e.buttons & 1) === 0) {
      this.yawDragging = false;
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    const prevX = this.pointerX;
    const prevY = this.pointerY;
    this.pointerX = e.clientX;
    this.pointerY = e.clientY;

    if (this.lookPointerId === e.pointerId) {
      const dx =
        e.movementX !== undefined && Math.abs(e.movementX) > 0
          ? e.movementX
          : e.clientX - this.lookLastX;
      const dy =
        e.movementY !== undefined && Math.abs(e.movementY) > 0
          ? e.movementY
          : e.clientY - this.lookLastY;
      this.lookLastX = e.clientX;
      this.lookLastY = e.clientY;
      this.yawDelta += dx * 0.0075;
      this.pitchDelta += dy * 0.0055;
      return;
    }

    const dx = e.movementX !== undefined && Math.abs(e.movementX) > 0 ? e.movementX : e.clientX - prevX;
    const dy = e.movementY !== undefined && Math.abs(e.movementY) > 0 ? e.movementY : e.clientY - prevY;

    // Camera rotation & tilt via RMB, MMB, or Alt/Ctrl+LMB
    const rightOrMiddleHeld = (e.buttons & 2) !== 0 || (e.buttons & 4) !== 0;
    const isAltDrag = (e.buttons & 1) !== 0 && (e.altKey || e.ctrlKey);
    if (this.yawDragging || rightOrMiddleHeld || isAltDrag) {
      this.yawDelta += dx * 0.0075;
      this.pitchDelta += dy * 0.0055;
    }
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    // Normalize line/page modes so mouse wheels and trackpads feel similar.
    let dy = e.deltaY;
    if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) dy *= 16;
    else if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) dy *= 400;
    // Scroll up / pinch-in → zoom in (negative distance). ctrl+wheel is common for trackpad pinch.
    const scale = e.ctrlKey ? 0.045 : 0.018;
    this.zoomDelta += dy * scale;
  };
}
