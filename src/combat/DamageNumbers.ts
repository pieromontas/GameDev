import * as THREE from 'three';

type Floater = {
  sprite: THREE.Sprite;
  age: number;
  life: number;
  velocity: THREE.Vector3;
  baseX: number;
  baseY: number;
};

function makeDamageTexture(text: string, color: string): THREE.CanvasTexture {
  // Fresh canvas per number — shared canvas was overwriting older sprites.
  const wide = text.length > 3;
  const canvas = document.createElement('canvas');
  canvas.width = wide ? 192 : 128;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = wide ? 'bold 34px Nunito, sans-serif' : 'bold 42px Nunito, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 7;
  ctx.strokeStyle = 'rgba(20,30,24,0.85)';
  const cx = canvas.width / 2;
  ctx.strokeText(text, cx, 32);
  ctx.fillStyle = color;
  ctx.fillText(text, cx, 32);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

export class DamageNumbers {
  private readonly root = new THREE.Group();
  private readonly active: Floater[] = [];

  constructor(scene: THREE.Scene) {
    this.root.name = 'DamageNumbers';
    scene.add(this.root);
  }

  spawn(position: THREE.Vector3, amount: number, critical = false): void {
    const color = critical ? '#ffd166' : '#fff8f0';
    this.spawnLabel(position, String(amount), color, {
      critical,
      yOffset: 1.55,
    });
  }

  /** Floating world text — used for XP pickups ("+12 XP") and similar beats. */
  spawnLabel(
    position: THREE.Vector3,
    text: string,
    color: string,
    opts?: { critical?: boolean; yOffset?: number; life?: number },
  ): void {
    const critical = opts?.critical ?? false;
    const map = makeDamageTexture(text, color);
    const mat = new THREE.SpriteMaterial({
      map,
      transparent: true,
      depthTest: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.copy(position);
    sprite.position.y += opts?.yOffset ?? 1.55;
    sprite.position.x += (Math.random() - 0.5) * 0.35;
    const wide = text.length > 3;
    const baseX = critical ? 1.85 : wide ? 1.95 : 1.42;
    const baseY = critical ? 0.95 : wide ? 0.78 : 0.72;
    // Start slightly undersized so the pop reads as a snap.
    sprite.scale.set(baseX * 0.55, baseY * 0.55, 1);
    this.root.add(sprite);
    this.active.push({
      sprite,
      age: 0,
      life: opts?.life ?? (critical ? 0.82 : 0.68),
      velocity: new THREE.Vector3((Math.random() - 0.5) * 0.45, 3.1, (Math.random() - 0.5) * 0.45),
      baseX,
      baseY,
    });
  }

  /** Readable XP floater above a slain enemy. */
  spawnXp(position: THREE.Vector3, amount: number): void {
    this.spawnLabel(position, `+${amount} XP`, '#7dff9a', {
      yOffset: 1.85,
      life: 0.95,
    });
  }

  update(dt: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const f = this.active[i]!;
      f.age += dt;
      f.sprite.position.addScaledVector(f.velocity, dt);
      f.velocity.y -= 4.4 * dt;
      const t = f.age / f.life;
      const mat = f.sprite.material as THREE.SpriteMaterial;
      mat.opacity = Math.max(0, 1 - t * t);
      // Fast overshoot pop in the first ~120ms, then settle.
      const popT = Math.min(1, f.age / 0.12);
      const pop = 0.55 + popT * 0.55 + Math.sin(popT * Math.PI) * 0.22;
      const settle = 1 - t * 0.18;
      f.sprite.scale.set(f.baseX * pop * settle, f.baseY * pop * settle, 1);
      if (f.age >= f.life) {
        this.root.remove(f.sprite);
        mat.map?.dispose();
        mat.dispose();
        this.active.splice(i, 1);
      }
    }
  }
}
