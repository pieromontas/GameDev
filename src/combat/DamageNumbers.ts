import * as THREE from 'three';

type Floater = {
  sprite: THREE.Sprite;
  age: number;
  life: number;
  velocity: THREE.Vector3;
};

const canvas = document.createElement('canvas');
canvas.width = 128;
canvas.height = 64;
const ctx = canvas.getContext('2d')!;

function makeDamageTexture(text: string, color: string): THREE.CanvasTexture {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = 'bold 42px Nunito, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(20,30,24,0.75)';
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
    const color = critical ? '#ffd166' : '#fff6f0';
    const map = makeDamageTexture(String(amount), color);
    const mat = new THREE.SpriteMaterial({
      map,
      transparent: true,
      depthTest: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.copy(position);
    sprite.position.y += 1.4;
    sprite.scale.set(critical ? 1.6 : 1.2, critical ? 0.8 : 0.6, 1);
    this.root.add(sprite);
    this.active.push({
      sprite,
      age: 0,
      life: 0.85,
      velocity: new THREE.Vector3((Math.random() - 0.5) * 0.6, 1.8, (Math.random() - 0.5) * 0.6),
    });
  }

  update(dt: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const f = this.active[i]!;
      f.age += dt;
      f.sprite.position.addScaledVector(f.velocity, dt);
      f.velocity.y -= 2.5 * dt;
      const t = f.age / f.life;
      const mat = f.sprite.material as THREE.SpriteMaterial;
      mat.opacity = Math.max(0, 1 - t);
      if (f.age >= f.life) {
        this.root.remove(f.sprite);
        mat.map?.dispose();
        mat.dispose();
        this.active.splice(i, 1);
      }
    }
  }
}
