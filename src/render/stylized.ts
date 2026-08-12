import * as THREE from 'three';

/** Shared SpiritVale-ish palette — saturated, readable against meadow greens. */
export const Palette = {
  skyZenith: 0x5eb8ff,
  skyHorizon: 0xd9f0ff,
  skyWarm: 0xffe2b8,
  fog: 0xc5e8ff,
  hemiSky: 0xfff0d2,
  hemiGround: 0x6dbf55,
  sun: 0xfff1c8,
  fill: 0xa8d4ff,
  grassA: 0x68c954,
  grassB: 0x3f9e3a,
  grassC: 0x9ae06a,
  path: 0xd4b878,
  pathEdge: 0xc4a868,
  leafA: 0x2f9e45,
  leafB: 0x48b85a,
  leafC: 0x1f8740,
  trunk: 0x9a6238,
  trunkDark: 0x6e4324,
  rock: 0xa8b0aa,
  rockShadow: 0x7e8882,
  moss: 0x5aaa4a,
  flowerPink: 0xff6b9d,
  flowerYellow: 0xffd24a,
  flowerCyan: 0x5ed4ef,
  flowerWhite: 0xfff6e8,
  stem: 0x3d9e4a,
  warriorCloth: 0x2f7de8,
  warriorClothDark: 0x1f5bb8,
  warriorTrim: 0xf0b429,
  warriorSkin: 0xffd2a8,
  warriorSteel: 0xd8e0ea,
  warriorBoot: 0x3a2a22,
  blobCheek: 0xffb3c8,
  blobBelly: 0xffffff,
  lootGold: 0xffd24a,
} as const;

let sharedGradientMap: THREE.DataTexture | null = null;

/** 3-band cel gradient for MeshToonMaterial (shared, never dispose). */
export function getToonGradientMap(): THREE.DataTexture {
  if (sharedGradientMap) return sharedGradientMap;
  // Soft / mid / lit bands — nearest filtering keeps the cel edges crisp.
  // Wider step gaps so MeshToon reads as cel, not smooth Lambert.
  const data = new Uint8Array([
    70, 70, 70, 255,
    155, 155, 155, 255,
    255, 255, 255, 255,
  ]);
  const tex = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  tex.colorSpace = THREE.NoColorSpace;
  sharedGradientMap = tex;
  return tex;
}

export function createToonMaterial(
  color: number,
  opts: {
    emissive?: number;
    emissiveIntensity?: number;
    transparent?: boolean;
    opacity?: number;
    side?: THREE.Side;
  } = {},
): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({
    color,
    gradientMap: getToonGradientMap(),
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 0,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    side: opts.side ?? THREE.FrontSide,
  });
}

/** Soft vertical sky dome — no textures, one draw call. */
export function createSkyDome(radius = 120): THREE.Mesh {
  const geo = new THREE.SphereGeometry(radius, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    toneMapped: false,
    uniforms: {
      topColor: { value: new THREE.Color(Palette.skyZenith) },
      midColor: { value: new THREE.Color(Palette.skyHorizon) },
      bottomColor: { value: new THREE.Color(Palette.skyWarm) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldPos;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorldPos = world.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        // Keep sky behind everything in depth
        gl_Position.z = gl_Position.w;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 topColor;
      uniform vec3 midColor;
      uniform vec3 bottomColor;
      varying vec3 vWorldPos;
      void main() {
        float h = normalize(vWorldPos).y;
        vec3 col = mix(bottomColor, midColor, smoothstep(-0.15, 0.18, h));
        col = mix(col, topColor, smoothstep(0.18, 0.9, h));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'SkyDome';
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return mesh;
}

/** Apply a soft hash-style green variation onto a BufferGeometry's vertices. */
export function paintGroundVertexColors(
  geometry: THREE.BufferGeometry,
  colors: { a: number; b: number; c: number },
): void {
  const pos = geometry.getAttribute('position') as THREE.BufferAttribute;
  const arr = new Float32Array(pos.count * 3);
  const ca = new THREE.Color(colors.a);
  const cb = new THREE.Color(colors.b);
  const cc = new THREE.Color(colors.c);
  const tmp = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    // CircleGeometry lies in XY before we rotate it onto XZ.
    const n1 = hash2(x * 0.55, y * 0.55);
    const n2 = hash2(x * 0.18 + 17.1, y * 0.18 - 9.3);
    const n3 = hash2(x * 1.4, y * 1.4);
    tmp.copy(ca).lerp(cb, n1 * 0.85);
    tmp.lerp(cc, n2 * 0.55 + n3 * 0.15);
    // Radial darkening toward the rim for horizon read
    const r = Math.hypot(x, y);
    const rim = THREE.MathUtils.smoothstep(r, 24, 39);
    tmp.multiplyScalar(1 - rim * 0.28);
    arr[i * 3] = tmp.r;
    arr[i * 3 + 1] = tmp.g;
    arr[i * 3 + 2] = tmp.b;
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(arr, 3));
}

function hash2(x: number, z: number): number {
  const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return s - Math.floor(s);
}
