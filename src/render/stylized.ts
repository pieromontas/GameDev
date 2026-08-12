import * as THREE from 'three';

/** Shared SpiritVale-ish palette — saturated, readable against meadow greens. */
export const Palette = {
  skyZenith: 0x4aaeff,
  skyHorizon: 0xd4ecff,
  skyWarm: 0xffd9a8,
  fog: 0xc8e6ff,
  hemiSky: 0xfff0d2,
  hemiGround: 0x6dbf55,
  sun: 0xfff1c8,
  fill: 0xa8d4ff,
  grassA: 0x68c954,
  grassB: 0x3f9e3a,
  grassC: 0x9ae06a,
  grassTuft: 0x4db343,
  path: 0xc9a66b,
  pathEdge: 0xb8925a,
  pathDark: 0xa07a48,
  leafA: 0x2f9e45,
  leafB: 0x48b85a,
  leafC: 0x1f8740,
  leafDark: 0x187038,
  trunk: 0x9a6238,
  trunkDark: 0x6e4324,
  rock: 0x9aa3a0,
  rockShadow: 0x6f7874,
  rockLight: 0xb8c0bb,
  moss: 0x5aaa4a,
  cliff: 0x8a9290,
  flowerPink: 0xff6b9d,
  flowerYellow: 0xffd24a,
  flowerCyan: 0x5ed4ef,
  flowerPurple: 0xc58cff,
  flowerWhite: 0xfff6e8,
  stem: 0x3d9e4a,
  wood: 0xb07840,
  woodDark: 0x7a5228,
  roofTile: 0xd4543c,
  pond: 0x4a9fd4,
  pondDeep: 0x2f7aa8,
  signBoard: 0xe8d4a8,
  // Novice swordsman — leather + steel trim (style-target silhouette)
  warriorLeather: 0x8a5a38,
  warriorLeatherDark: 0x5c3a22,
  warriorLeatherLight: 0xb07848,
  warriorTrim: 0xe8eef4,
  warriorTrimGold: 0xf0b429,
  warriorSkin: 0xffd2a8,
  warriorHair: 0x4a3020,
  warriorSteel: 0xd8e0ea,
  warriorSteelDark: 0x9aa4b0,
  warriorBoot: 0x3a2a22,
  warriorCloth: 0x3a5a8a,
  warriorClothDark: 0x2a4068,
  blobCheek: 0xffb3c8,
  blobBelly: 0xffffff,
  blobMouth: 0x3a2030,
  lootGold: 0xffd24a,
} as const;

let sharedGradientMap: THREE.DataTexture | null = null;

/** 3-band cel gradient for MeshToonMaterial (shared, never dispose). */
export function getToonGradientMap(): THREE.DataTexture {
  if (sharedGradientMap) return sharedGradientMap;
  // Soft / mid / lit bands — nearest filtering keeps the cel edges crisp.
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
    depthWrite?: boolean;
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
    depthWrite: opts.depthWrite ?? true,
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
      varying vec3 vLocalDir;
      void main() {
        vLocalDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position.z = gl_Position.w;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 topColor;
      uniform vec3 midColor;
      uniform vec3 bottomColor;
      varying vec3 vLocalDir;
      void main() {
        float h = vLocalDir.y;
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
  opts: {
    pathFn?: (x: number, z: number) => number;
    pathColor?: number;
    pathEdge?: number;
  } = {},
): void {
  const pos = geometry.getAttribute('position') as THREE.BufferAttribute;
  const arr = new Float32Array(pos.count * 3);
  const ca = new THREE.Color(colors.a);
  const cb = new THREE.Color(colors.b);
  const cc = new THREE.Color(colors.c);
  const pathCol = new THREE.Color(opts.pathColor ?? Palette.path);
  const pathEdge = new THREE.Color(opts.pathEdge ?? Palette.pathEdge);
  const tmp = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const n1 = hash2(x * 0.55, y * 0.55);
    const n2 = hash2(x * 0.18 + 17.1, y * 0.18 - 9.3);
    const n3 = hash2(x * 1.4, y * 1.4);
    tmp.copy(ca).lerp(cb, n1 * 0.85);
    tmp.lerp(cc, n2 * 0.55 + n3 * 0.15);
    const r = Math.hypot(x, y);
    const rim = THREE.MathUtils.smoothstep(r, 24, 39);
    tmp.multiplyScalar(1 - rim * 0.28);

    if (opts.pathFn) {
      const p = opts.pathFn(x, y);
      if (p > 0) {
        const dirt = pathCol.clone().lerp(pathEdge, hash2(x * 2.1, y * 2.1) * 0.45);
        // Stronger dirt blend so the winding path reads at iso distance
        tmp.lerp(dirt, Math.min(1, p * 1.15));
      }
    }

    arr[i * 3] = tmp.r;
    arr[i * 3 + 1] = tmp.g;
    arr[i * 3 + 2] = tmp.b;
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(arr, 3));
}

/** Mild height displace on CircleGeometry (XY plane) via Z — becomes world Y after rotateX. */
export function displaceGroundHeight(
  geometry: THREE.BufferGeometry,
  opts: {
    amplitude?: number;
    pathFn?: (x: number, z: number) => number;
  } = {},
): void {
  const amp = opts.amplitude ?? 0.22;
  const pos = geometry.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const n =
      hash2(x * 0.12, y * 0.12) * 0.55 +
      hash2(x * 0.35 + 3.1, y * 0.35 - 1.7) * 0.3 +
      hash2(x * 0.9, y * 0.9) * 0.15;
    let h = (n - 0.42) * amp;
    if (opts.pathFn) {
      const p = opts.pathFn(x, y);
      h *= 1 - Math.min(1, p * 1.15);
    }
    // Keep center camp flat for readable combat footing.
    const centerFlat = 1 - THREE.MathUtils.smoothstep(Math.hypot(x, y), 0, 7);
    h *= 1 - centerFlat * 0.85;
    pos.setZ(i, h);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
}

export function hash2(x: number, z: number): number {
  const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

/** Second playable pocket east of the main meadow (shrine clearing). */
export const EastShrineClearing = {
  x: 40,
  z: 6,
  radius: 11.5,
} as const;

/** Third playable pocket west of the main meadow (misty grove clearing). */
export const WestMistyGrove = {
  x: -40,
  z: -2,
  radius: 11.5,
} as const;

/** Fourth playable pocket north of the main meadow (ruins courtyard). */
export const NorthRuinsClearing = {
  x: 2,
  z: 40,
  radius: 11.5,
} as const;

/** Fifth playable pocket south of the main meadow (river ford clearing). */
export const SouthRiverFordClearing = {
  x: -2,
  z: -40,
  radius: 11.5,
} as const;

/** Smooth 0–1 influence of dirt paths (main S-curve + east/west/north/south branches). */
export function meadowPathInfluence(x: number, z: number): number {
  return Math.max(
    mainMeadowPathInfluence(x, z),
    eastBranchPathInfluence(x, z),
    westBranchPathInfluence(x, z),
    northBranchPathInfluence(x, z),
    southBranchPathInfluence(x, z),
  );
}

/** Soft S-curve path from south toward north-west through the main meadow. */
function mainMeadowPathInfluence(x: number, z: number): number {
  const t = THREE.MathUtils.clamp((z + 18) / 36, 0, 1);
  const cx = Math.sin(t * Math.PI * 1.35) * 4.2 + Math.sin(t * Math.PI * 0.5) * 1.5;
  const dx = x - cx;
  const halfW = 1.85 + Math.sin(t * Math.PI * 2) * 0.3;
  const d = Math.abs(dx) / halfW;
  if (d >= 1.35) return 0;
  if (d <= 0.75) return 1;
  return 1 - (d - 0.75) / 0.6;
}

/**
 * Dirt path branch from the main meadow east into the shrine clearing.
 * Includes a soft dirt pad around the clearing center so the path “arrives”.
 */
function eastBranchPathInfluence(x: number, z: number): number {
  // Branch leaves the main path near (+10, +4) and runs to the clearing center.
  const ax = 10;
  const az = 4;
  const bx = EastShrineClearing.x;
  const bz = EastShrineClearing.z;
  const abx = bx - ax;
  const abz = bz - az;
  const abLen2 = abx * abx + abz * abz;
  const t = abLen2 > 1e-8 ? THREE.MathUtils.clamp(((x - ax) * abx + (z - az) * abz) / abLen2, 0, 1) : 0;
  const px = ax + abx * t;
  const pz = az + abz * t;
  const dist = Math.hypot(x - px, z - pz);
  // Slightly wider than the main path so the branch reads at iso distance.
  const halfW = 2.45 + Math.sin(t * Math.PI) * 0.35;
  let branch = 0;
  const d = dist / halfW;
  if (d < 1.35) {
    branch = d <= 0.75 ? 1 : 1 - (d - 0.75) / 0.6;
  }

  // Arrival pad — readable dirt around the shrine without covering the whole clearing.
  const cdx = x - EastShrineClearing.x;
  const cdz = z - EastShrineClearing.z;
  const cr = Math.hypot(cdx, cdz);
  let pad = 0;
  if (cr < 5.0) {
    pad = cr < 2.6 ? 0.95 : 0.95 * (1 - (cr - 2.6) / 2.4);
  }

  return Math.max(branch, pad);
}

/**
 * Dirt path branch from the main meadow west into the misty grove clearing.
 * Includes a soft dirt pad around the grove center so the path “arrives”.
 */
function westBranchPathInfluence(x: number, z: number): number {
  // Branch leaves the main path near (−8, +1) and runs to the grove center.
  const ax = -8;
  const az = 1;
  const bx = WestMistyGrove.x;
  const bz = WestMistyGrove.z;
  const abx = bx - ax;
  const abz = bz - az;
  const abLen2 = abx * abx + abz * abz;
  const t = abLen2 > 1e-8 ? THREE.MathUtils.clamp(((x - ax) * abx + (z - az) * abz) / abLen2, 0, 1) : 0;
  const px = ax + abx * t;
  const pz = az + abz * t;
  const dist = Math.hypot(x - px, z - pz);
  const halfW = 2.45 + Math.sin(t * Math.PI) * 0.35;
  let branch = 0;
  const d = dist / halfW;
  if (d < 1.35) {
    branch = d <= 0.75 ? 1 : 1 - (d - 0.75) / 0.6;
  }

  const cdx = x - WestMistyGrove.x;
  const cdz = z - WestMistyGrove.z;
  const cr = Math.hypot(cdx, cdz);
  let pad = 0;
  if (cr < 5.0) {
    pad = cr < 2.6 ? 0.95 : 0.95 * (1 - (cr - 2.6) / 2.4);
  }

  return Math.max(branch, pad);
}

/**
 * Dirt path branch from the main meadow north into the ruins clearing.
 * Includes a soft dirt pad around the courtyard center so the path “arrives”.
 */
function northBranchPathInfluence(x: number, z: number): number {
  // Branch leaves the main path near (+2, +12) and runs to the ruins center.
  const ax = 2;
  const az = 12;
  const bx = NorthRuinsClearing.x;
  const bz = NorthRuinsClearing.z;
  const abx = bx - ax;
  const abz = bz - az;
  const abLen2 = abx * abx + abz * abz;
  const t = abLen2 > 1e-8 ? THREE.MathUtils.clamp(((x - ax) * abx + (z - az) * abz) / abLen2, 0, 1) : 0;
  const px = ax + abx * t;
  const pz = az + abz * t;
  const dist = Math.hypot(x - px, z - pz);
  const halfW = 2.45 + Math.sin(t * Math.PI) * 0.35;
  let branch = 0;
  const d = dist / halfW;
  if (d < 1.35) {
    branch = d <= 0.75 ? 1 : 1 - (d - 0.75) / 0.6;
  }

  const cdx = x - NorthRuinsClearing.x;
  const cdz = z - NorthRuinsClearing.z;
  const cr = Math.hypot(cdx, cdz);
  let pad = 0;
  if (cr < 5.0) {
    pad = cr < 2.6 ? 0.95 : 0.95 * (1 - (cr - 2.6) / 2.4);
  }

  return Math.max(branch, pad);
}

/**
 * Dirt path branch from the main meadow south into the river ford clearing.
 * Includes a soft dirt pad around the riverside center so the path “arrives”.
 */
function southBranchPathInfluence(x: number, z: number): number {
  // Branch leaves the main path near (−2, −12) and runs to the ford center.
  const ax = -2;
  const az = -12;
  const bx = SouthRiverFordClearing.x;
  const bz = SouthRiverFordClearing.z;
  const abx = bx - ax;
  const abz = bz - az;
  const abLen2 = abx * abx + abz * abz;
  const t = abLen2 > 1e-8 ? THREE.MathUtils.clamp(((x - ax) * abx + (z - az) * abz) / abLen2, 0, 1) : 0;
  const px = ax + abx * t;
  const pz = az + abz * t;
  const dist = Math.hypot(x - px, z - pz);
  const halfW = 2.45 + Math.sin(t * Math.PI) * 0.35;
  let branch = 0;
  const d = dist / halfW;
  if (d < 1.35) {
    branch = d <= 0.75 ? 1 : 1 - (d - 0.75) / 0.6;
  }

  const cdx = x - SouthRiverFordClearing.x;
  const cdz = z - SouthRiverFordClearing.z;
  const cr = Math.hypot(cdx, cdz);
  let pad = 0;
  if (cr < 5.0) {
    pad = cr < 2.6 ? 0.95 : 0.95 * (1 - (cr - 2.6) / 2.4);
  }

  return Math.max(branch, pad);
}
