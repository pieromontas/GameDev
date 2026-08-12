export class InputManager {
  private readonly keys = new Set<string>();
  private readonly justPressed = new Set<string>();
  private pointerDown = false;
  private pointerX = 0;
  private pointerY = 0;
  private dragging = false;
  private lastPointerX = 0;
  private yawDelta = 0;

  constructor(private readonly target: HTMLElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    target.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointermove', this.onPointerMove);
    target.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.target.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointermove', this.onPointerMove);
  }

  /** Call once per frame after gameplay has consumed edge-triggered inputs. */
  endFrame(): void {
    this.justPressed.clear();
    this.yawDelta = 0;
  }

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  wasPressed(code: string): boolean {
    return this.justPressed.has(code);
  }

  consumeAttackClick(): boolean {
    if (!this.pointerDown || this.dragging) return false;
    // Primary click attack is edged via pointerdown flag consumed each frame.
    const clicked = this.justPressed.has('PointerPrimary');
    return clicked;
  }

  getMoveAxes(): { x: number; z: number } {
    let x = 0;
    let z = 0;
    if (this.isDown('KeyA') || this.isDown('ArrowLeft')) x -= 1;
    if (this.isDown('KeyD') || this.isDown('ArrowRight')) x += 1;
    if (this.isDown('KeyW') || this.isDown('ArrowUp')) z -= 1;
    if (this.isDown('KeyS') || this.isDown('ArrowDown')) z += 1;
    return { x, z };
  }

  consumeYawDelta(): number {
    const d = this.yawDelta;
    this.yawDelta = 0;
    return d;
  }

  getPointerNdc(width: number, height: number): { x: number; y: number } {
    return {
      x: (this.pointerX / width) * 2 - 1,
      y: -(this.pointerY / height) * 2 + 1,
    };
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    this.keys.add(e.code);
    this.justPressed.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private onPointerDown = (e: PointerEvent): void => {
    if (e.button === 0) {
      this.pointerDown = true;
      this.dragging = false;
      this.lastPointerX = e.clientX;
      this.pointerX = e.clientX;
      this.pointerY = e.clientY;
      this.justPressed.add('PointerPrimary');
      this.target.setPointerCapture(e.pointerId);
    } else if (e.button === 2) {
      this.dragging = true;
      this.lastPointerX = e.clientX;
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (e.button === 0) {
      this.pointerDown = false;
      try {
        this.target.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    if (e.button === 2) {
      this.dragging = false;
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    this.pointerX = e.clientX;
    this.pointerY = e.clientY;

    const buttonsMiddleOrRight = (e.buttons & 2) !== 0 || (e.buttons & 4) !== 0;
    if (buttonsMiddleOrRight || (this.pointerDown && e.buttons === 1 && Math.abs(e.clientX - this.lastPointerX) > 3)) {
      if (buttonsMiddleOrRight || Math.abs(e.movementX) > 0) {
        this.dragging = true;
        this.yawDelta += e.movementX * 0.005;
      }
    }
    this.lastPointerX = e.clientX;
  };
}
