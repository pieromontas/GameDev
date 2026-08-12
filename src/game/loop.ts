/** Semi-fixed timestep game loop driven by requestAnimationFrame. */

export type FrameCallbacks = {
  update: (dt: number) => void;
  render: (alpha: number) => void;
};

const MAX_FRAME_DT = 0.05;
const FIXED_DT = 1 / 60;

export class GameLoop {
  private running = false;
  private rafId = 0;
  private lastTime = 0;
  private accumulator = 0;
  private readonly callbacks: FrameCallbacks;

  constructor(callbacks: FrameCallbacks) {
    this.callbacks = callbacks;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.rafId = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  private tick = (now: number): void => {
    if (!this.running) return;

    let frameDt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    frameDt = Math.min(frameDt, MAX_FRAME_DT);
    this.accumulator += frameDt;

    while (this.accumulator >= FIXED_DT) {
      this.callbacks.update(FIXED_DT);
      this.accumulator -= FIXED_DT;
    }

    const alpha = this.accumulator / FIXED_DT;
    this.callbacks.render(alpha);
    this.rafId = requestAnimationFrame(this.tick);
  };
}
