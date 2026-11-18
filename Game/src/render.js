import * as T from '../vendor/three.module.min.js';
import {
  ARCHIVES, CACHES, GATES, MAIN_LIFT, PLATFORMS, REGIONS, RELAYS, SEAMS, SOCKETS, STATIONS, SWITCHES, VENTS,
} from './level.js';
import { clamp, mix, rayFraction } from './geometry.js';
import { block, CUBE, createScenery, glow, radialTexture, seeded, sign } from './scenery.js';
import {
  makeArchive, makeCache, makeCell, makeGate, makeMachine, makeMainLift, makePlatform, makeRelay,
  makeRobot, makeSeam, makeSocket, makeStation, makeSwitch, MATERIALS, part, poseRobot,
} from './models.js';
import { CanvasView } from './render-flat.js';

const UNDERGROUND = ['#101923', '#10232d', '#1d1922', '#13212c'].map(color => new T.Color(color));
const SUNRISE = new T.Color('#cbb0a0');
const DAWN = new T.Color('#ffe1aa');
const tmp = new T.Object3D();
const particleTints = Object.fromEntries(Object.entries({
  dash: '#b4ddda', seam: '#e6aa6b', shield: '#a5e8da', damage: '#ef815e', floor: '#b6a59a',
  wall: '#a8baba', stun: '#91e6da', deflect: '#edaa6c', disable: '#f5b47c',
  spark: '#ed9966', socket: '#ffce85', relay: '#f8d088', shutdown: '#eaa88b', reboot: '#95d6cc', archive: '#91e2d1',
}).map(([type, color]) => [type, new T.Color(color)]));
const partColor = color => new T.MeshBasicMaterial({ color });
const nearX = (x, target, distance) => Math.abs(x - target) < distance;

function makeVent(scene, vent, map) {
  const root = new T.Group();
  root.position.set(vent.x, vent.y, 0);
  scene.add(root);
  part(root, 'dark', vent.w / 2, -.074, .295, vent.w, .13, 1.97);
  for (let x = .13; x < vent.w; x += .21) part(root, 'steel', x, -.014, .295, .082, .034, 1.91);
  const warning = part(root, 'unlit', vent.w / 2, -.044, 1.3, vent.w * .8, .065, .09);
  const jet = new T.Group();
  block(jet, new T.MeshBasicMaterial({
    color: '#fc784b', transparent: true, opacity: .37, depthWrite: false,
  }), vent.w / 2, vent.h / 2, .04, vent.w, vent.h, .4);
  const tongues = [];
  for (let i = 0; i < 7; i++) {
    tongues.push(part(jet, i % 2 ? 'red' : 'lens', .06 + i * vent.w / 7, vent.h * .4, .24, .105, .74, .088));
  }
  root.add(jet);
  const light = glow(root, map, '#f58c50', vent.w / 2, vent.h * .3, .4, 2.45, vent.h * 1.7, .28);
  return { root, jet, warning, tongues, light };
}

function makeConduit(root, id, path, z = -2.11) {
  const group = new T.Group();
  root.add(group);
  const strips = path.slice(1).map(([x, y], index) => {
    const [prevX, prevY] = path[index];
    const width = Math.hypot(x - prevX, y - prevY);
    const angle = Math.atan2(y - prevY, x - prevX);
    const center = [(x + prevX) / 2, (y + prevY) / 2];
    const outline = part(group, 'dark', ...center, z, width, .15, .12);
    outline.rotation.z = angle;
    const line = part(group, 'bronze', ...center, z + .068, width, .058, .043);
    line.rotation.z = angle;
    return line;
  });
  return { id, group, strips, mid: (path[0][0] + path.at(-1)[0]) / 2 };
}

class ThreeView {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(1.6, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.scene = new T.Scene();
    this.scene.background = UNDERGROUND[0].clone();
    this.scene.fog = new T.FogExp2(UNDERGROUND[0], .022);
    this.camera = new T.OrthographicCamera(-10, 10, 6, -6, .1, 92);
    this.cameraVersion = -1;
    this.cameraX = 4;
    this.cameraY = 3;
    this.titleTime = 0;
    this.ambientTime = 0;
    this.color = UNDERGROUND[0].clone();
    this.day = new T.Color();
    this.width = 1;
    this.height = 1;
    this.map = radialTexture();
    this.mode = 'three';
    const s = this.scene;

    this.hemi = new T.HemisphereLight('#cce8e1', '#66717e', 1.62);
    this.key = new T.DirectionalLight('#ead3b2', 2.07);
    this.key.position.set(4, 9, 5);
    this.fill = new T.DirectionalLight('#7aabb5', .64);
    this.fill.position.set(-3, 3, -4);
    this.lantern = new T.PointLight('#9ad2ca', 8.4, 6.2, 1.8);
    this.utility = new T.PointLight('#f2b169', 12.5, 13.5, 1.65);
    s.add(this.hemi, this.key, this.fill, this.lantern, this.utility);
    this.scenery = createScenery(s, this.map);
    this.robot = makeRobot(s);
    STATIONS.forEach(station => makeStation(s, station, this.map));
    this.cellModels = [makeCell(s), makeCell(s)];
    this.socketModels = SOCKETS.map(item => makeSocket(s, item));
    this.relayModels = RELAYS.map(item => makeRelay(s, item, this.map));
    this.switchModels = SWITCHES.map(item => makeSwitch(s, item));
    this.archiveModels = ARCHIVES.map(item => makeArchive(s, item, this.map));
    this.cacheModels = CACHES.map(item => makeCache(s, item));
    this.gateModels = GATES.map(item => makeGate(s, item));
    this.platformModels = PLATFORMS.map(item => makePlatform(s, item));
    this.mainLift = makeMainLift(s, this.map);
    this.ventModels = VENTS.map(item => makeVent(s, item, this.map));
    this.seamModels = SEAMS.map(item => makeSeam(s, item));
    this.machineModels = [];
    this.conduits = [
      makeConduit(s, 'socket:workshop', [[45.35, .63], [45.35, 2.1], [47.35, 2.1], [47.35, 4.25], [51.4, 4.25], [51.4, 1.25]]),
      makeConduit(s, 'relay:A', [[51.4, 1.25], [53.1, 1.25], [53.1, 2.69], [60.1, 2.69], [60.1, 5.65], [68, 5.65], [68, 7.35], [74.35, 7.35]]),
      makeConduit(s, 'switch:bridge', [[74.35, 7.36], [74.35, 8.61], [79.9, 8.61], [79.9, 6.4]]),
      makeConduit(s, 'relay:B', [[106.6, 7.85], [109.6, 7.85], [109.6, 9.08], [114.55, 9.08], [114.55, 5.9], [127.2, 5.9], [127.2, 2.1], [138.6, 2.1]]),
      makeConduit(s, 'socket:counterweight', [[154.38, .63], [154.38, 3.2], [155.55, 3.2], [155.55, 5.4], [161.45, 5.4]]),
      makeConduit(s, 'switch:latch', [[161.45, 5.4], [163.95, 5.4], [163.95, 2.83], [167.64, 2.83], [167.64, 3.89], [172.82, 3.89]]),
      makeConduit(s, 'socket:foundry', [[174.8, .63], [174.8, 1.6], [176.4, 1.6], [176.4, 1.25], [178.1, 1.25]]),
      makeConduit(s, 'relay:C', [[178.1, 1.25], [180, 1.25], [180, 3.3], [190.62, 3.3], [190.62, 5.7], [199.25, 5.7], [199.25, 8.25], [204, 8.25]]),
      makeConduit(s, 'relay:C', [[204, 8.25], [204, 12.2], [210.6, 12.2], [210.6, 13.45], [222.5, 13.45]]),
    ];
    this.pathMarkers = [
      { id: 'reservoir-path', node: sign(s, '← ARCHIVE', 64.6, 9.22, -.96, 2.05, '#9de0d1', '#254147') },
      { id: 'service-path', node: sign(s, 'SERVICE  ↑', 164.45, 2.55, -.73, 1.53, '#eed1a3') },
    ];

    this.pulseData = new Float32Array(96 * 6);
    const pulseGeometry = new T.BufferGeometry();
    pulseGeometry.setAttribute('position', new T.BufferAttribute(this.pulseData, 3).setUsage(T.DynamicDrawUsage));
    this.pulseLine = new T.LineSegments(pulseGeometry, new T.LineBasicMaterial({
      color: '#9ce7d7', transparent: true, opacity: .85, depthTest: false,
    }));
    this.pulseLine.frustumCulled = false;
    this.pulseLine.renderOrder = 5;
    s.add(this.pulseLine);
    this.shade = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({
      map: this.map, color: '#141a1d', transparent: true, opacity: .46, depthWrite: false,
    }));
    this.shade.rotation.x = -Math.PI / 2;
    s.add(this.shade);
    this.targetGlow = glow(s, this.map, '#ffe6b8', 0, 0, .8, 1.51, 1.41, .27);
    this.targetMarker = new T.Group();
    const marker = part(this.targetMarker, 'lens', 0, 0, 0, .095, .095, .03);
    marker.rotation.z = Math.PI / 4;
    s.add(this.targetMarker);
    this.aim = block(s, new T.MeshBasicMaterial({ color: '#e6a568', transparent: true, opacity: .64 }), 0, 0, 0, 1, 1, 1);
    this.beamLane = block(s, new T.MeshBasicMaterial({ color: '#ec835a', transparent: true, opacity: .5, depthWrite: false }), 0, 0, 0, 1, 1, 1);
    this.beamCore = block(s, partColor('#ffc593'), 0, 0, 0, 1, 1, 1);
    const particles = new T.InstancedMesh(CUBE, partColor('#ffffff'), 232);
    particles.instanceMatrix.setUsage(T.DynamicDrawUsage);
    particles.frustumCulled = false;
    particles.count = 0;
    this.particles = particles;
    s.add(particles);
    this.bolts = Array.from({ length: 12 }, () => part(s, 'red', 0, 0, 0, .22, .14, .17));
  }

  resize() {
    const { clientWidth: w, clientHeight: h } = this.canvas;
    if (w === this.width && h === this.height) return;
    this.width = Math.max(w, 1);
    this.height = Math.max(h, 1);
    this.renderer.setSize(this.width, this.height, false);
    this.cameraVersion = -1;
  }

  frame(game, dt, reduced = false) {
    this.resize();
    const p = game.player;
    const state = game.state;
    const title = state === 'title';
    const dawn = game.lift.dawn;
    const surface = dawn > .48;
    if (title && !reduced) this.titleTime += dt;
    const anim = title ? this.titleTime : game.localTime + (state === 'play' || state === 'paused' ? 0 : game.stateTime);
    if (state !== 'paused' && !reduced) this.ambientTime += dt;

    const aspect = this.width / this.height;
    const portrait = aspect < 1;
    const short = this.height < 440 && !portrait;
    const viewHeight = title ? portrait ? 9.9 : short ? 8.2 : 10.15
      : surface ? 10.8 : portrait ? Math.max(11.8, 5.55 / aspect) : short ? 9.05 : 11.05;
    const viewWidth = viewHeight * aspect;
    const homeX = title ? (portrait ? 4.68 : 4.4 - viewWidth * .211) : p.x;
    const chamber = REGIONS[game.region];
    const direction = Math.abs(p.vx) > .1 ? Math.sign(p.vx) : p.face;
    const lookAhead = portrait ? .84 : 1.3 + Math.min(Math.abs(p.vx) * .105, 1.1);
    const offset = title ? 0 : game.relayFocus ? 3.6 : direction * lookAhead;
    const low = Math.max(chamber.bounds[0] - 3, chamber.start - 6);
    const high = chamber.bounds[1] + (game.region === 3 ? -2 : 5);
    const targetX = title ? homeX
      : state === 'liftSequence' || state === 'complete' ? p.x + (surface ? 2.5 : 0)
        : clamp(homeX + offset, low, high);
    const shaft = (p.x >= 56.8 && p.x < 66) || (p.x >= 186.3 && p.x < 194.25);
    const rise = shaft ? 1 : portrait ? 1.65 : 1.92;
    const targetY = title ? portrait ? -1.28 : 3.29
      : surface ? p.y + 2.3 : clamp(p.y + rise, 1.18, shaft ? 5.35 : 34.5);
    if (this.cameraVersion !== game.cameraVersion) {
      this.cameraVersion = game.cameraVersion;
      this.cameraX = targetX;
      this.cameraY = targetY;
      this.color.copy(UNDERGROUND[game.region]);
    } else if (state !== 'paused') {
      this.cameraX = mix(this.cameraX, targetX, 1 - Math.exp(-dt * (surface ? 3.3 : 7.4)));
      this.cameraY = mix(this.cameraY, targetY, 1 - Math.exp(-dt * 5.9));
    }
    const shake = reduced || state !== 'play' ? 0 : p.recoil * Math.sin(anim * 83) * .21;
    const x = this.cameraX + shake;
    const y = this.cameraY + shake * .35;
    const angle = title ? (portrait ? 2.4 : 3.8) : 2.45;
    this.camera.position.set(x + angle, y + 4.95, 24);
    this.camera.lookAt(x, y, 0);
    this.camera.left = -viewWidth / 2;
    this.camera.right = viewWidth / 2;
    this.camera.top = viewHeight / 2;
    this.camera.bottom = -viewHeight / 2;
    this.camera.updateProjectionMatrix();

    this.color.lerp(UNDERGROUND[game.region], 1 - Math.exp(-dt * 3));
    this.day.copy(this.color).lerp(SUNRISE, dawn);
    this.scene.background.copy(this.day);
    this.scene.fog.color.copy(this.day);
    this.scene.fog.density = mix(.022, .014, dawn);
    this.hemi.color.set('#cce8e1').lerp(DAWN, dawn);
    this.key.intensity = mix(2.07, 2.55, dawn);
    this.lantern.position.set(p.x + .51, p.y + 1.69, 2.5);
    this.lantern.intensity = mix(title ? 10.2 : 8.4, 0, dawn);
    this.utility.position.set(title ? 10.35 : x + 2.7, title ? 5.05 : p.y + 3.45, -2.4);
    this.utility.color.set(game.region === 1 ? '#6ac9cd' : '#f2b169');
    this.utility.intensity = mix(title ? 18.8 : 11.5, 0, dawn);
    this.scenery.frame(x, this.ambientTime, dawn);
    poseRobot(this.robot, game, anim, reduced);
    this.updateProps(game, anim, viewWidth);
    this.updateMachines(game, anim, viewWidth);
    this.updateEffects(game);
    this.renderer.render(this.scene, this.camera);
  }

  updateProps(game, time, viewWidth) {
    const p = game.player;
    const run = game.world;
    const isNear = x => nearX(x, this.cameraX, viewWidth * .6 + 6);
    this.cellModels.forEach((model, index) => {
      const cell = run.cells[index];
      const carried = cell.id === run.carry;
      model.visible = carried || isNear(cell.x);
      model.position.set(carried ? p.x + p.face * .35 : cell.x, carried ? p.y + .49 : cell.y + (cell.socket ? .26 : 0),
        carried ? .605 : cell.socket ? -.69 : .02);
      model.rotation.y = carried ? p.face * .46 : .10;
      model.scale.setScalar(carried ? .83 : 1);
    });
    this.socketModels.forEach((model, i) => {
      model.group.visible = isNear(SOCKETS[i].x);
      model.lamp.material = game.powered(`socket:${SOCKETS[i].id}`) ? MATERIALS.lens
        : game.revealed.has(SOCKETS[i].id) ? MATERIALS.teal : MATERIALS.unlit;
    });
    this.relayModels.forEach((relay, i) => {
      const id = RELAYS[i].id;
      relay.group.visible = isNear(RELAYS[i].x);
      const lit = run.relays.includes(id);
      relay.core.rotation.z = Math.PI / 4;
      relay.core.rotation.y = time * (lit ? .92 : .51);
      relay.glass.material = lit ? MATERIALS.lens : MATERIALS.teal;
      relay.crystal.material = lit ? MATERIALS.light : MATERIALS.ice;
      relay.light.material.color.set(lit ? '#f0ac59' : '#69d6cd');
    });
    this.switchModels.forEach((item, i) => {
      item.group.visible = isNear(SWITCHES[i].x);
      const on = run.switches.includes(SWITCHES[i].id);
      item.lever.material = on ? MATERIALS.teal : MATERIALS.amber;
      item.lever.rotation.x = on ? .41 : -.39;
    });
    this.archiveModels.forEach((item, i) => {
      const archive = ARCHIVES[i];
      item.group.visible = isNear(archive.x) && !run.archives.includes(archive.id);
      item.core.rotation.y = Math.sin(time * 1.6 + i) * .27;
      item.core.position.y = Math.sin(time * 2.05 + i) * .091;
      item.light.material.opacity = game.revealed.has(archive.id) ? .6 : .19;
    });
    this.cacheModels.forEach((item, i) => { item.visible = isNear(CACHES[i].x) && !run.caches.includes(CACHES[i].id); });
    this.gateModels.forEach((model, i) => {
      const gate = game.gates[i];
      model.group.visible = isNear(gate.x);
      model.door.visible = !gate.open;
      model.lamp.material = gate.open ? MATERIALS.teal : MATERIALS.red;
    });
    this.platformModels.forEach((model, i) => {
      const platform = game.platforms[i];
      model.group.visible = isNear(platform.x);
      model.group.position.set(platform.x, platform.y, 0);
      model.bar.material = platform.powered ? MATERIALS.lens : MATERIALS.unlit;
    });
    this.mainLift.group.visible = isNear(MAIN_LIFT.x);
    this.mainLift.group.position.y = game.lift.y;
    this.mainLift.barrier.visible = game.lift.barrier > .005;
    this.mainLift.barrier.scale.y = Math.max(.001, game.lift.barrier);
    this.mainLift.bar.material = game.world.relays.length === 3 ? MATERIALS.lens : MATERIALS.unlit;

    this.ventModels.forEach((model, i) => {
      const vent = game.vents[i];
      model.root.visible = isNear(vent.x);
      model.jet.visible = vent.state === 'active';
      model.warning.material = vent.state === 'dormant' ? MATERIALS.unlit
        : vent.state === 'warning' && Math.sin(time * 18) < -.1 ? MATERIALS.amber : MATERIALS.red;
      model.light.visible = vent.state !== 'dormant';
      model.light.material.opacity = vent.state === 'active' ? .32 : .11;
      model.tongues.forEach((tongue, j) => {
        const wave = .5 + .5 * Math.sin(time * 19 + j * 2.75);
        tongue.scale.y = vent.h * (.43 + wave * .30);
        tongue.position.y = tongue.scale.y / 2;
      });
    });

    this.seamModels.forEach((model, i) => {
      const seam = SEAMS[i];
      model.group.visible = isNear(seam.x) && !run.broken.includes(seam.id);
      const mark = game.revealed.has(seam.id);
      model.cracks.forEach(crack => {
        crack.material = mark ? MATERIALS.lens : seam.hidden ? MATERIALS.unlit : MATERIALS.amber;
      });
    });
    for (const wire of this.conduits) {
      wire.group.visible = isNear(wire.mid);
      const color = game.powered(wire.id) ? MATERIALS.lens : MATERIALS.bronze;
      wire.strips.forEach(strip => { strip.material = color; });
    }
    this.pathMarkers.forEach(marker => { marker.node.visible = game.revealed.has(marker.id); });

    const floor = game.solids.reduce((best, solid) => {
      const top = solid.y + solid.h;
      return p.x >= solid.x && p.x < solid.x + solid.w && top <= p.y + .002 && top > best ? top : best;
    }, -50);
    const gap = p.y - floor;
    this.shade.visible = gap <= 2.9 && game.state !== 'liftSequence' && game.state !== 'complete';
    this.shade.position.set(p.x, floor + .012, .18);
    this.shade.scale.set(1.25 + gap * .19, .88 + gap * .12, 1);
    this.shade.material.opacity = Math.max(.03, .53 - gap * .135);

    const item = game.state === 'play' ? game.interaction() : null;
    this.targetMarker.visible = Boolean(item?.x && !item.ref?.id?.startsWith('start'));
    this.targetGlow.visible = this.targetMarker.visible;
    if (this.targetGlow.visible) {
      this.targetGlow.position.set(item.x, item.y, .85);
      this.targetMarker.position.set(item.x, item.y + .65 + Math.sin(time * 5) * .07, .67);
    }
  }

  updateMachines(game, time, viewWidth) {
    const p = game.player;
    this.aim.visible = false;
    this.beamLane.visible = false;
    this.beamCore.visible = false;
    for (const [i, enemy] of game.enemies.entries()) {
      const model = this.machineModels[i] ?? (this.machineModels[i] = makeMachine(this.scene, enemy));
      model.group.visible = nearX(enemy.x, this.cameraX, viewWidth * .55 + 5);
      if (!model.group.visible) continue;
      const state = enemy.state;
      const disabled = state === 'disabled';
      const stunned = state === 'stunned';
      model.group.position.set(enemy.x, enemy.y, .11);
      model.eye.material = disabled ? MATERIALS.unlit : stunned ? MATERIALS.teal
        : state === 'warning' || state === 'firing' || state === 'alert' ? MATERIALS.red : MATERIALS.lens;
      if (enemy.type === 'skitter') {
        const moving = state === 'patrol' || state === 'lunge';
        model.group.rotation.y = enemy.dir < 0 ? .72 : -.52;
        model.chassis.scale.x = enemy.dir;
        model.chassis.position.y = disabled ? .20 : state === 'alert' ? .255 + Math.sin(time * 24) * .035 : .32;
        model.chassis.rotation.z = stunned ? Math.sin(time * 27) * .17 : disabled ? -.12 : 0;
        model.legs.forEach((leg, j) => { leg.rotation.y = moving ? Math.sin(time * 24 + j * 2.1) * .37 : .12 * (j % 3); });
        model.cable.rotation.y = moving ? Math.sin(time * 12) * .27 : 0;
      } else if (enemy.type === 'drone') {
        model.group.rotation.y = disabled ? 0 : Math.sin(time * 2) * .19;
        model.chassis.rotation.z = disabled ? -.31 : stunned ? Math.sin(time * 18) * .14 : 0;
        model.plates.forEach((plate, j) => { plate.rotation.z = j * Math.PI * 2 / 3 + time * (disabled ? 0 : stunned ? -.7 : 2.3); });
        if (state === 'aim' && Math.abs(p.x - enemy.x) <= 16) {
          const range = 8.4;
          const length = range * rayFraction(enemy.x, enemy.y, enemy.aimX * range, enemy.aimY * range, game.solids);
          this.aim.visible = length > .08;
          this.aim.position.set(enemy.x + enemy.aimX * length / 2, enemy.y + enemy.aimY * length / 2, .72);
          this.aim.rotation.z = Math.atan2(enemy.aimY, enemy.aimX);
          this.aim.scale.set(length, .025 + .013 * Math.sin(time * 20), .027);
        }
      } else {
        const opened = state === 'venting' || disabled;
        model.panels.forEach((panel, j) => { panel.position.y = (j ? 1 : -1) * (opened ? .43 : .243); });
        if (state === 'warning' || state === 'firing') {
          const beam = game.beam(enemy);
          this.beamLane.visible = beam.w > .02;
          this.beamLane.position.set(beam.x + beam.w / 2, beam.y + beam.h / 2, .20);
          this.beamLane.scale.set(beam.w, state === 'firing' ? beam.h : .044, .95);
          this.beamLane.material.opacity = state === 'firing' ? .59 : .49 + .25 * Math.sin(time * 17);
          this.beamCore.visible = state === 'firing';
          this.beamCore.position.copy(this.beamLane.position);
          this.beamCore.scale.set(beam.w, .069, .967);
        }
      }
    }
    this.bolts.forEach((mesh, i) => {
      const bolt = game.bolts[i];
      mesh.visible = Boolean(bolt) && nearX(bolt.x, this.cameraX, viewWidth * .6 + 3);
      if (mesh.visible) {
        mesh.position.set(bolt.x, bolt.y, .32);
        mesh.rotation.z = Math.atan2(bolt.vy, bolt.vx);
      }
    });
  }

  updateEffects(game) {
    const pulse = game.pulse;
    this.pulseLine.visible = Boolean(pulse);
    if (pulse) {
      const count = this.pulseData.length / 6;
      const verts = Array.from({ length: count }, (_, i) => {
        const angle = i * Math.PI * 2 / count;
        const dx = Math.cos(angle) * pulse.radius;
        const dy = Math.sin(angle) * pulse.radius;
        const f = rayFraction(pulse.x, pulse.y, dx, dy, game.solids, null, true);
        return { x: pulse.x + dx * f, y: pulse.y + dy * f, f };
      });
      for (let i = 0; i < count; i++) {
        const a = verts[i];
        const b = verts[(i + 1) % count];
        const end = Math.abs(a.f - b.f) < .11 && a.f > .12 ? b : a;
        this.pulseData.set([a.x, a.y, 1.46, end.x, end.y, 1.46], i * 6);
      }
      this.pulseLine.geometry.attributes.position.needsUpdate = true;
      this.pulseLine.material.opacity = .82 * (1 - pulse.age / .46);
    }

    let count = 0;
    for (const fx of game.effects) {
      const t = 1 - fx.life / fx.duration;
      const dash = fx.type === 'dash';
      const floor = fx.type === 'floor' || fx.type === 'wall';
      const shell = fx.type === 'shield' || fx.type === 'deflect' || fx.type === 'relay' || fx.type === 'reboot';
      const n = dash ? 3 : floor ? 5 : shell ? 12 : 7;
      const random = seeded(fx.id * 23951);
      for (let i = 0; i < n && count < 232; i++) {
        const r = random();
        const angle = i * Math.PI * 2 / n + r * (shell ? .2 : 1.33);
        const iota = dash ? .28 : (.12 + random() * .76) * (.6 + t * 2);
        const x = dash ? fx.x - fx.face * (.33 + t * 1.03 + i * .1) : fx.x + Math.cos(angle) * iota;
        const y = dash ? fx.y - i * .18 + .29 : fx.y + Math.sin(angle) * iota + (floor ? Math.abs(Math.sin(angle)) * iota : 0) - (fx.type === 'seam' ? t * t * .84 : 0);
        const life = 1 - t;
        const w = (.026 + r * .09) * life;
        tmp.position.set(x, y, .42 + i % 4 * .16);
        tmp.scale.set(dash ? (.52 + r * .34) * life : w * (shell ? 2.1 : 1.41), dash ? .042 * life : w, dash ? .14 : w);
        tmp.rotation.set(0, 0, dash ? 0 : angle + t * 2.4);
        tmp.updateMatrix();
        this.particles.setMatrixAt(count, tmp.matrix);
        this.particles.setColorAt(count, particleTints[fx.type] ?? particleTints.spark);
        count++;
      }
    }
    this.particles.count = count;
    this.particles.instanceMatrix.needsUpdate = true;
    if (this.particles.instanceColor) this.particles.instanceColor.needsUpdate = true;
  }
}

export function createView(canvas) {
  const buildFallback = () => {
    const next = canvas.cloneNode(false);
    canvas.replaceWith(next);
    canvas = next;
    return new CanvasView(next);
  };
  let render;
  try { render = new ThreeView(canvas); } catch { render = buildFallback(); }
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    render = buildFallback();
  }, { once: true });
  return {
    frame: (...args) => render.frame(...args),
    focus: () => canvas.focus({ preventScroll: true }),
    get mode() { return render.mode; },
  };
}
