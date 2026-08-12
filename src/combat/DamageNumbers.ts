import * as THREE from 'three';

type Floater = {
  sprite: THREE.Sprite;
  age: number;
  life: number;
  velocity: THREE.Vector3;
};

function makeDamageTexture(text: string, color: string): THREE.CanvasTexture {
  // Fresh canvas per number — shared canvas was overwriting older sprites.
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = 'bold 42px Nunito, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 7;
  ctx.strokeStyle = 'rgba(20,30,24,0.85)';
  ctx.strokeText(text, 64, 32);
  ctx.fillStyle = color;
  ctx.fillText(text, 64, 32);
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
    const map = makeDamageTexture(String(amount), color);
    const mat = new THREE.SpriteMaterial({
      map,
      transparent: true,
      depthTest: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.copy(position);
    sprite.position.y += 1.55;
    sprite.position.x += (Math.random() - 0.5) * 0.35;
    sprite.scale.set(critical ? 1.75 : 1.35, critical ? 0.9 : 0.68, 1);
    this.root.add(sprite);
    this.active.push({
      sprite,
      age: 0,
      life: critical ? 0.95 : 0.8,
      velocity: new THREE.Vector3((Math.random() - 0.5) * 0.55, 2.2, (Math.random() - 0.5) * 0.55),
    });
  }

  update(dt: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const f = this.active[i]!;
      f.age += dt;
      f.sprite.position.addScaledVector(f.velocity, dt);
      f.velocity.y -= 3.2 * dt;
      const t = f.age / f.life;
      const mat = f.sprite.material as THREE.SpriteMaterial;
      mat.opacity = Math.max(0, 1 - t * t);
      const pop = 1 + Math.sin(Math.min(1, t * 6) * Math.PI) * 0.12;
      const baseX = f.life > 0.9 ? 1.75 : 1.35;
      const baseY = f.life > 0.9 ? 0.9 : 0.68;
      f.sprite.scale.set(baseX * pop * (1 - t * 0.15), baseY * pop * (1 - t * 0.15), 1);
      if (f.age >= f.life) {
        this.root.remove(f.sprite);
        mat.map?.dispose();
        mat.dispose();
        this.active.splice(i, 1);
      }
    }
  }
}
