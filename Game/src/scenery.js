import * as T from '../vendor/three.module.min.js';
import { DEEP_WATER, INSCRIPTIONS, REGIONS, TERRAIN, regionIndex } from './level.js';
import { clamp, mix } from './geometry.js';

export const seeded = seed => () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
  return (seed >>> 0) / 4294967296;
};
export const CUBE = new T.BoxGeometry(1, 1, 1);
const plane = new T.PlaneGeometry(1, 1);
const temp = new T.Object3D();
const makeCanvas = (width, height) => Object.assign(document.createElement('canvas'), { width, height });

export function block(parent, material, x, y, z, w, h, depth) {
  const mesh = new T.Mesh(CUBE, material);
  mesh.position.set(x, y, z);
  mesh.scale.set(w, h, depth);
  parent.add(mesh);
  return mesh;
}

function stoneTexture() {
  const canvas = makeCanvas(16, 16);
  const context = canvas.getContext('2d');
  const random = seeded(76931);
  context.fillStyle = '#eeeeec';
  context.fillRect(0, 0, 16, 16);
  for (let i = 0; i < 38; i++) {
    const shade = 188 + Math.floor(random() * 65);
    context.fillStyle = `rgb(${shade},${shade},${shade})`;
    context.fillRect(random() * 16 | 0, random() * 16 | 0, 1 + (random() * 3 | 0), 1 + (random() * 2 | 0));
  }
  const map = new T.CanvasTexture(canvas);
  map.colorSpace = T.SRGBColorSpace;
  map.magFilter = T.NearestFilter;
  map.minFilter = T.NearestMipmapLinearFilter;
  return map;
}

export function radialTexture() {
  const canvas = makeCanvas(64, 64);
  const context = canvas.getContext('2d');
  const glow = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  glow.addColorStop(0, 'rgba(255,255,255,.95)');
  glow.addColorStop(.25, 'rgba(255,255,255,.56)');
  glow.addColorStop(.65, 'rgba(255,255,255,.13)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = glow;
  context.fillRect(0, 0, 64, 64);
  return new T.CanvasTexture(canvas);
}

export function glow(parent, map, color, x, y, z, width, height, opacity) {
  const sprite = new T.Sprite(new T.SpriteMaterial({
    map, color, opacity, transparent: true, depthWrite: false, blending: T.AdditiveBlending,
  }));
  sprite.position.set(x, y, z);
  sprite.scale.set(width, height, 1);
  parent.add(sprite);
  return sprite;
}

export function sign(parent, title, x, y, z, width = 2.2, color = '#e5c59a', background = '#28343a') {
  const canvas = makeCanvas(192, 52);
  const context = canvas.getContext('2d');
  context.fillStyle = background;
  context.fillRect(0, 0, 192, 52);
  context.strokeStyle = color;
  context.globalAlpha = .46;
  context.strokeRect(4, 4, 184, 44);
  context.globalAlpha = 1;
  context.font = 'bold 23px monospace';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = color;
  context.fillText(title, 96, 27, 173);
  const map = new T.CanvasTexture(canvas);
  map.colorSpace = T.SRGBColorSpace;
  map.magFilter = T.NearestFilter;
  const mesh = new T.Mesh(plane, new T.MeshBasicMaterial({ map, transparent: true }));
  mesh.position.set(x, y, z);
  mesh.scale.set(width, width * 52 / 192, 1);
  parent.add(mesh);
  return mesh;
}

class Voxels {
  constructor(group) {
    this.group = group;
    this.batches = new Map();
    this.materials = new Map();
    this.texture = stoneTexture();
  }

  put(x, y, z, w, h, d, color, spin = 0, plain = false) {
    if (w <= 0 || h <= 0 || d <= 0) return;
    const materialKey = `${color}/${plain}`;
    const chunk = Math.floor(x / 19);
    const key = `${chunk}/${materialKey}`;
    if (!this.batches.has(key)) this.batches.set(key, { materialKey, items: [] });
    this.batches.get(key).items.push([x, y, z, w, h, d, spin]);
    if (!this.materials.has(materialKey)) {
      this.materials.set(materialKey, plain
        ? new T.MeshBasicMaterial({ color })
        : new T.MeshLambertMaterial({ color, map: this.texture }));
    }
  }

  beam(x, y, toX, toY, z, width, depth, color, plain = false) {
    this.put((x + toX) / 2, (y + toY) / 2, z, Math.hypot(toX - x, toY - y), width, depth,
      color, Math.atan2(toY - y, toX - x), plain);
  }

  finish() {
    for (const { materialKey, items } of this.batches.values()) {
      const mesh = new T.InstancedMesh(CUBE, this.materials.get(materialKey), items.length);
      items.forEach(([x, y, z, w, h, d, spin], i) => {
        temp.position.set(x, y, z);
        temp.scale.set(w, h, d);
        temp.rotation.set(0, 0, spin);
        temp.updateMatrix();
        mesh.setMatrixAt(i, temp.matrix);
      });
      mesh.computeBoundingSphere();
      this.group.add(mesh);
    }
    this.batches.clear();
  }
}

const palettes = [
  { rock: ['#384650', '#414e55', '#34424d', '#47565d'], edge: '#73858a', front: '#657477', backdrop: ['#17252e', '#1e2e36', '#22333a'] },
  { rock: ['#3a5160', '#3d5362', '#324857', '#435a66'], edge: '#7d9fa6', front: '#5a797f', backdrop: ['#153039', '#1c3944', '#20414b'] },
  { rock: ['#3e4247', '#505056', '#45484c', '#555255'], edge: '#9e9182', front: '#6e665c', backdrop: ['#29282e', '#312a2e', '#3a3135'] },
  { rock: ['#465058', '#424d58', '#38434a', '#4b5961'], edge: '#8e9b9c', front: '#6d7d80', backdrop: ['#233039', '#283842', '#30414a'] },
];
const pick = (list, random) => list[Math.floor(random() * list.length)];

function terrain(vox, random) {
  for (const s of TERRAIN) {
    const palette = palettes[regionIndex(s.x + s.w / 2)];
    const metal = s.kind === 'metal';
    const surface = s.kind === 'surface';
    const top = s.y + s.h;
    const base = surface ? '#877469' : metal ? '#353d42' : palette.rock[0];
    const interior = Math.max(.03, s.h - .13);
    vox.put(s.x + s.w / 2, s.y + interior / 2, -.43, s.w, interior, 3.43, base);
    for (let dx = 0; dx < s.w; dx += 1) {
      const w = Math.min(1, s.w - dx);
      const x = s.x + dx + w / 2;
      const topExposed = !TERRAIN.some(a => a !== s && x > a.x && x < a.x + a.w && top + .034 > a.y && top + .034 < a.y + a.h);
      if (topExposed) {
        const edge = surface ? '#c6a185' : metal ? '#a7a499' : palette.edge;
        vox.put(x, top - .10, -.35, w - .018, .20, 3.58, edge);
        vox.put(x, top - .245, 1.32, w - .035, .105, .12, metal ? '#726b60' : palette.front);
      }
      for (let dy = 0; dy < Math.min(s.h, 10); dy += .79) {
        const h = Math.min(.79, s.h - dy);
        const y = top - dy - h / 2;
        vox.put(x, y, 1.28 + random() * .15, w - .024, h - .025, .15, surface ? '#867366' : pick(palette.rock, random));
        if (metal && h > .38 && random() > .35) {
          const slot = random() > .5 ? .27 : -.26;
          vox.put(x + slot * w, y + h * .28, 1.44, .072, .072, .08, '#909a94');
          vox.put(x, y - h * .23, 1.43, w * .7, .025, .035, '#232c33');
        } else if (!metal && w > .25 && h > .26 && random() < .36) {
          vox.put(x - w * .12, y - h * .13, 1.44, w * .45, h * .43, .08, pick(palette.rock, random));
        }
      }
      if (topExposed && metal && dx % 2 === 0) vox.put(x, top - .139, 1.46, w * .41, .048, .039, '#c1ac77');
    }
    for (const side of [s.x, s.x + s.w]) {
      if (s.h < 1.6) continue;
      for (let y = s.y + .30; y < top - .31; y += .62) {
        const offset = side === s.x ? -.018 : .018;
        const adjoining = TERRAIN.some(a => a !== s && side + offset > a.x && side + offset < a.x + a.w && y > a.y && y < a.y + a.h);
        if (!adjoining) {
          const tint = metal ? '#8c8880' : palette.front;
          vox.put(side - offset, y, .35, .036, .11, 1.78, tint);
        }
      }
    }
  }
}

function chambers(vox, far, random) {
  for (let offset = -16; offset < 250; offset += 5.4) {
    const color = palettes[regionIndex(offset)].backdrop;
    const h = 10 + random() * 12;
    const base = regionIndex(offset) === 3 ? 6 : 0;
    far.put(offset, base + 4, -24, 6.1, 31, 2, pick(color, random));
    far.put(offset + random(), base + h / 2 - 3, -18, 2.9 + random() * 2, h + 5, 2.2, pick(color, random));
    far.put(offset + 2.2, base - h / 2 + 1.2, -15.4, 3.8, h * .68, 2.4, color[0]);
    for (let i = 0; i < 3; i++) {
      far.put(offset + (random() - .5) * 5, base + 9 + random() * 11, -13 - i, 3.2, 3.2 + random() * 4, 3.6, pick(color, random));
      vox.put(offset + (random() - .5) * 5, base + 9.5 + random() * 4, -4.8 - i, 2.5, 3.1 + random() * 3, 2.4, pick(color, random));
    }
    vox.put(offset + .2, base - 7.6, -1.5, 5.4, 3.9, 3.5, color[0]);
  }
  for (let x = -9; x < 56; x += 6.8) {
    vox.put(x, 3.25, -5.2, .68, 10.35, .8, '#293940');
    vox.put(x, 3.4, -4.72, .15, 10.35, .22, '#495659');
    vox.put(x, 6.1, -4.1, 6.8, .32, .55, '#475457');
    vox.put(x, 2.05, -7.2, 5.8, 4.3, .3, '#253237');
    vox.put(x + 1.4, 1.35, -3, 1.0, 1.3, .72, '#364448');
    vox.put(x + 1.4, 2.06, -3, 1.36, .14, .94, '#65635c');
    vox.beam(x + 2, 6, x + 2.55, 4.55, -3.93, .065, .08, '#795c4c');
    vox.beam(x + 2.55, 4.55, x + 3.15, 4.3, -3.93, .08, .08, '#785b4b');
    vox.put(x + 3.17, 4.25, -3.92, .45, .20, .30, '#585752');
    vox.put(x + 3.17, 4.17, -3.78, .35, .09, .05, '#ebad73', 0, true);
  }
}

function workshop(vox, root, map) {
  const doorX = 5.95;
  vox.put(doorX, 3.3, -6.0, 7.8, 6.7, 1.35, '#303f46');
  vox.put(doorX, 3.13, -5.2, 6.2, 5.35, .65, '#16282f');
  vox.put(doorX, 3.13, -4.8, 4.75, 5.09, .38, '#2a3c40');
  vox.put(doorX, 3.0, -4.55, .22, 5.1, .28, '#101f25');
  for (const s of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      vox.put(doorX + s * (2.75 + Math.abs(i - 2.5) * -.17), i * .86 + .92, -4.21, .79, .84, .91,
        i % 2 ? '#556367' : '#4c5b60');
      vox.put(doorX + s * 1.18, i * .64 + 1.15, -4.56, 1.94, .028, .07, '#567376');
    }
    vox.put(doorX + s * 2.65, 3.1, -3.73, .081, 3.15, .06, '#63c3bf', 0, true);
    vox.put(doorX + s * 3.78, 1.3, -3.48, .57, 2.9, .81, '#394951');
    vox.put(doorX + s * 3.79, 2.15, -3.04, .32, .47, .08, '#a77955');
    vox.put(doorX + s * 3.79, 2.17, -2.99, .16, .16, .045, '#efb66c', 0, true);
    vox.beam(doorX + s * 3.75, 3, doorX + s * 4.55, 5.5, -4.6, .13, .12, '#625d51');
    glow(root, map, '#6adbcf', doorX + s * 2.57, 3.08, -3.62, 2.85, 5.95, .38);
  }
  vox.put(doorX, 5.7, -4.4, 4.65, .72, .94, '#617074');
  vox.put(doorX, 5.16, -4.07, 3.84, .12, .22, '#70c4c0', 0, true);
  vox.put(doorX, .21, -2.75, 5.6, .39, 3.1, '#4d5c5c');
  vox.put(doorX, .35, -1.17, 4.75, .13, .09, '#657e7b');
  sign(root, 'WORKSHOP', doorX, 5.69, -3.917, 3.0);
  vox.beam(9.1, 7.9, 9.13, 6, -2.67, .14, .14, '#947b58');
  vox.beam(9.13, 6.0, 10.3, 5.37, -2.67, .14, .14, '#947b58');
  vox.put(10.41, 5.25, -2.65, .76, .33, .43, '#565558');
  vox.put(10.41, 5.12, -2.4, .58, .076, .10, '#f6b969', 0, true);
  glow(root, map, '#72afa1', 6.9, 2.15, -3.55, 10.1, 8.4, .36);
  glow(root, map, '#eea24f', 10.44, 4.89, -2.27, 6.6, 5.4, .51);
}

function crystal(vox, x, y, z, h, random) {
  const groups = 3 + (random() * 3 | 0);
  const widths = [.24, .33, .46, .58];
  for (let stem = 0; stem < groups; stem++) {
    const base = x + (stem - groups / 2) * .28;
    const height = h * (.33 + random() * .67);
    const w = pick(widths, random);
    const lean = (random() - .5) * .62;
    for (let i = 0; i < 5; i++) {
      const t = i / 5;
      const color = i > 2 ? '#497f87' : '#2f555f';
      vox.put(base + lean * t, y + (i + .5) * height / 5, z + stem * .09, w * (1 - t * .56), height / 5, w * .8, color);
      if (stem % 2 === 0) vox.put(base + lean * t + w * .19, y + (i + .5) * height / 5, z + stem * .09 + w * .45,
        w * .13, height / 5 * .87, .04, i > 1 ? '#78c7c7' : '#488a88', 0, true);
    }
  }
}

function reservoir(vox, root, map, random, animated) {
  for (let x = 54.2; x < 113; x += 3.56) {
    const inChannel = x > 80 && x < 98;
    const y = inChannel ? -5.25 : 4.15 + random() * 2.5;
    crystal(vox, x, y, -3.75 - random() * 3.5, 2.35 + random() * 3.8, random);
    if ((Math.floor(x) % 3) === 0) glow(root, map, '#338e94', x, y + 1.5, -3.7, 5, 5, .25);
    const vein = y + 4.6 + random() * 2;
    vox.beam(x, vein, x + 1.6, vein + .34, -8.7, .085, .1, '#428585', true);
    vox.beam(x + 1.6, vein + .34, x + 2.45, vein + 1, -8.7, .085, .1, '#428585', true);
  }
  for (const [x, w] of [[82, 1.15], [89.4, .68], [97.5, .92]]) {
    vox.put(x, 2.5, -10, w, 13.3, .31, '#375961');
    vox.put(x + .17, 2.5, -9.8, w * .26, 13, .08, '#57858c');
    const current = new T.MeshBasicMaterial({ color: '#7bb9b4', transparent: true, opacity: .37 });
    for (let i = 0; i < 5; i++) {
      const ribbon = block(root, current, x + w * (i % 3 - 1) * .22, 0, -9.755, .043, .82 + i * .14, .035);
      animated.push({ object: ribbon, x, move: time => { ribbon.position.y = 8.8 - ((time * 1.38 + i * 2.61 + x) % 12.7); } });
    }
  }
  for (const w of DEEP_WATER) {
    vox.put(w.x + w.w / 2, w.y - .09, -1.45, w.w, .19, 7.1, '#1f515c');
    for (let i = 0; i < 28; i++) {
      vox.put(w.x + random() * w.w, w.y + .012, -4.5 + random() * 6, .5 + random() * 2, .019, .045, '#4d8f95', 0, true);
    }
  }
  // Shallow pools sit behind the collision lane.
  for (const [x, y, w] of [[70.9, 6.36, 6.9], [107.6, 6.38, 8.9]]) {
    vox.put(x, y, -4.55, w, .13, 3.45, '#43686b');
    vox.put(x, y + .08, -3.4, w * .85, .023, .061, '#609c9d', 0, true);
  }
}

function foundry(vox, root, map, animated) {
  const iron = new T.MeshLambertMaterial({ color: '#6e6158' });
  for (let x = 121.3; x < 186; x += 5.52) {
    vox.put(x, 4.75, -6.1, 3.35, 11.4, 1.18, '#3e4144');
    vox.put(x, 6.2, -5.32, 2.83, 4.4, .58, '#4f5152');
    vox.put(x, 5.8, -5.02, .63, 2.55, .39, '#706862');
    const piston = block(root, iron, x, 3.85, -4.99, .36, 3.1, .34);
    const head = block(root, iron, x, 2.43, -4.97, 1.58, .40, .65);
    animated.push({ object: piston, x, move: time => { piston.position.y = 4.2 + Math.sin(time * .69 + x) * .74; } });
    animated.push({ object: head, x, move: time => { head.position.y = 2.59 + Math.sin(time * .69 + x) * .74; } });
    vox.put(x, 2.1, -4.68, 2.42, .53, .82, '#493d39');
    vox.put(x - 1.1, 9.75, -4.83, .13, 8.1, .14, '#71605b');
    vox.put(x + 1.12, 9.75, -4.83, .13, 8.1, .14, '#71605b');
    vox.put(x, 7.57, -4.84, 2.77, .22, .38, '#756156');
    vox.put(x, 1.4, -4.76, 1.55, .09, .18, '#ae784e', 0, true);
    if ((Math.floor(x) % 3) !== 0) glow(root, map, '#ce6837', x, 1.62, -4.4, 5.2, 3.1, .22);
  }
  for (const x of [155.6, 159.2, 204.0, 207.2]) {
    const y = x < 200 ? 2.65 : 9.55;
    vox.put(x, y, -1.66, .16, 7.1, .32, '#718080');
    vox.put(x + .11, y, -1.77, .054, 7.1, .12, '#a98e67');
  }
  for (const x of [219.26, 225.96]) {
    vox.put(x, 21.95, -1.18, .34, 19.7, .33, '#546162');
    vox.put(x, 22.2, -1.36, .1, 19.85, .1, '#a08d6c');
  }
  for (let y = 13.2; y < 30.2; y += 2.6) {
    vox.put(222.4, y, -2.12, 7.45, .3, .61, '#4a545a');
    vox.put(222.4, y + .25, -2.06, .55, .14, .08, '#718b8d', 0, true);
  }
  vox.put(222.5, 31.15, -3.1, 7.8, .43, .65, '#d0cab2');
  glow(root, map, '#ecedcf', 222.3, 31.8, -3.19, 11.15, 6.85, .34);
}

function surface(vox, root, map, random) {
  for (let x = 214; x < 253; x += 1.3) {
    vox.put(x, 28.3 + random() * 1.4, -15.3, 1.5, 3.1 + random() * 4.7, 3.7, '#968684', 0, true);
    vox.put(x, 29.45 + random(), -9.3, 1.55, 4.3 + random() * 2.9, 1.5, '#887d7a', 0, true);
  }
  for (const [x, y, w, h] of [[226.3, 32.1, .48, 2], [233.1, 32.85, .85, 3.5], [238.2, 32.6, .85, 3], [234.9, 33.9, 3.7, .44]]) {
    vox.put(x, y, -1.45, w, h, .71, '#ad907d');
  }
  const sun = new T.Mesh(new T.CircleGeometry(1.35, 16), new T.MeshBasicMaterial({ color: '#ffe3ab' }));
  sun.position.set(236.3, 33.5, -15.7);
  root.add(sun);
  glow(root, map, '#f9ba76', 236.3, 33.5, -15.56, 18, 15, .50);
}

export function createScenery(scene, map) {
  const root = new T.Group();
  const distant = new T.Group();
  const surfaceGroup = new T.Group();
  scene.add(distant, root, surfaceGroup);
  const voxel = new Voxels(root);
  const far = new Voxels(distant);
  const terrace = new Voxels(surfaceGroup);
  const animated = [];
  const random = seeded(19843);
  chambers(voxel, far, random);
  terrain(voxel, random);
  workshop(voxel, root, map);
  reservoir(voxel, root, map, random, animated);
  foundry(voxel, root, map, animated);
  surface(terrace, surfaceGroup, map, random);

  for (const note of INSCRIPTIONS) {
    const tint = note.tint === 'teal' ? '#9cdfd7' : '#e2bd8b';
    sign(root, note.text, note.x, note.y, -1.21, note.text === '↑' ? .70 : 2.15, tint);
  }
  const dustObjects = [];
  for (const region of REGIONS) {
    const dust = [];
    for (let i = 0; i < 94; i++) dust.push(mix(region.start, region.end, random()), mix(-1, 13, random()), mix(-13, -.9, random()));
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute(dust, 3));
    const points = new T.Points(geometry, new T.PointsMaterial({
      color: region.color, size: .038, transparent: true, opacity: .5, depthWrite: false,
    }));
    root.add(points);
    dustObjects.push(points);
  }
  voxel.finish();
  far.finish();
  terrace.finish();
  surfaceGroup.visible = false;

  return {
    frame(x, time, dawn) {
      distant.position.x = clamp((x - 4) * .018, -1, 4);
      surfaceGroup.visible = dawn > 0;
      for (const detail of animated) {
        detail.object.visible = Math.abs(x - detail.x) < 27;
        if (detail.object.visible) detail.move(time);
      }
      dustObjects.forEach((dust, i) => {
        dust.visible = x > REGIONS[i].start - 28 && x < REGIONS[i].end + 28;
        dust.position.set(Math.sin(time * .22 + i) * .37, Math.sin(time * .63 + i) * .12, 0);
      });
    },
  };
}
