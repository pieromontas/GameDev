export class InputManager {
  private readonly keys = new Set<string>();
  private readonly justPressed = new Set<string>();
  private pointerX = 0;
  private pointerY = 0;
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
    // Fire on primary pointerdown edge; camera yaw is RMB-only so clicks aren't eaten by drag.
    return this.justPressed.has('PointerPrimary');
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
      this.pointerX = e.clientX;
      this.pointerY = e.clientY;
      this.justPressed.add('PointerPrimary');
      this.target.setPointerCapture(e.pointerId);
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (e.button === 0) {
      try {
        this.target.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    this.pointerX = e.clientX;
    this.pointerY = e.clientY;

    // Only right-button drag rotates the camera (middle button also allowed).
    if ((e.buttons & 2) !== 0 || (e.buttons & 4) !== 0) {
      this.yawDelta += e.movementX * 0.005;
    }
  };
}
