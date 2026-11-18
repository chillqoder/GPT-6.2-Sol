import {
  ARCHIVES, BODY, CACHES, CELLS, DEEP_WATER, ENEMIES, GATES, GUIDANCE, MAIN_LIFT,
  MOTION, PLATFORMS, RELAYS, RESONANCE, SEAMS, SOCKETS, STATIONS, STEP, SWITCHES, TERRAIN,
  VENTS, regionIndex,
} from './level.js';
import { approach, box, clamp, distance, mix, overlap, rayFraction, smooth, sweep } from './geometry.js';

const M = MOTION;
const R = RESONANCE;
const MAX_EFFECTS = 32;
const approachZero = (value, dt) => Math.max(0, value - dt);
const top = solid => solid.y + solid.h;
const hitbox = p => box(p.x, p.y, BODY.w, BODY.h);
const cellBox = (x, y) => box(x, y, .58, .62);
const keyIn = (list, id) => list.includes(id);
const initialWorld = () => ({
  relays: [], archives: [], caches: [], broken: [], disabled: [], switches: [],
  cells: CELLS.map(cell => ({ ...cell, socket: null })), carry: null,
});
const initialPlayer = station => ({
  x: station.x, y: station.y, vx: 0, vy: 0, face: 1, ground: null, wall: 0, sliding: false,
  integrity: 3, energy: R.max, immune: .65, recoil: 0, regen: 0, pulseCooldown: 0,
  dashCooldown: 0, dashTime: 0, dashReady: true, dashFace: 1, dashTrail: 0,
  coyote: 0, buffer: 0, wallLock: 0, land: 0, gesture: '', gestureTime: 0, stride: 0,
});

function enemyBody(machine) {
  if (machine.type === 'skitter') return box(machine.x, machine.y, 1.08, .64);
  if (machine.type === 'drone') return box(machine.x, machine.y - .39, .86, .78);
  return box(machine.x, machine.y - .55, .83, 1.1);
}

export class Expedition {
  constructor() {
    this.cameraVersion = 0;
    this.inputVersion = 0;
    this.restart('title');
  }

  restart(state = 'play') {
    this.world = initialWorld();
    this.timeTicks = 0;
    this.localTicks = 0;
    this.recoveries = 0;
    this.result = null;
    this.relayFocus = null;
    this.events = [];
    this.serial = 0;
    this.checkpoint = { station: STATIONS[0].id, world: structuredClone(this.world) };
    this.restoreLocal(STATIONS[0]);
    this.transition(state);
    if (state === 'play') this.sound('reboot');
  }

  restoreLocal(station) {
    this.player = initialPlayer(station);
    this.platforms = PLATFORMS.map(platform => ({
      ...platform, originX: platform.x, originY: platform.y, phase: 0, blocked: 0, powered: false,
    }));
    this.gates = GATES.map(gate => ({ ...gate, open: gate.needs.some(need => this.powered(need)), delay: 0 }));
    this.enemies = ENEMIES.map(enemy => ({
      ...enemy, originY: enemy.y, t: 0, orbit: 0, aimX: 0, aimY: 0,
      state: keyIn(this.world.disabled, enemy.id) ? 'disabled' : enemy.type === 'sentinel' ? 'closed'
        : enemy.type === 'skitter' ? 'dormant' : 'patrol',
    }));
    this.vents = VENTS.map(vent => ({ ...vent, t: 0, state: 'dormant' }));
    this.lift = { y: MAIN_LIFT.y, barrier: 0, dawn: 0, walk: 0 };
    this.bolts = [];
    this.effects = [];
    this.pulse = null;
    this.revealed = new Map();
    this.notice = null;
    this.fragment = null;
    this.failure = '';
    this.localTicks = 0;
    this.cameraVersion++;
    this.updateSolids();
    this.player.ground = sweep(hitbox(this.player), -.035, 'y', this.solids).hit?.id ?? null;
  }

  transition(state) {
    this.state = state;
    this.stateTime = 0;
    this.inputVersion++;
  }

  get time() { return Math.round(this.timeTicks * STEP * 1000); }
  get localTime() { return this.localTicks * STEP; }
  get region() { return regionIndex(this.player.x, this.player.y); }

  pause() {
    if (this.state === 'play') {
      this.transition('paused');
      return true;
    }
    if (this.state === 'paused') {
      this.transition('play');
      return true;
    }
    return false;
  }

  powered(requirement) {
    if (!requirement) return true;
    const [kind, id] = requirement.split(':');
    if (kind === 'relay') return keyIn(this.world.relays, id);
    if (kind === 'switch') return keyIn(this.world.switches, id);
    return this.world.cells.some(cell => cell.socket === id);
  }

  sound(name, surface) { this.events.push({ name, surface }); }
  takeEvents() { return this.events.splice(0); }

  effect(type, x = this.player.x, y = this.player.y + .75, duration = .42, face = 1) {
    if (this.effects.length >= MAX_EFFECTS) this.effects.shift();
    this.effects.push({ id: ++this.serial, type, x, y, life: duration, duration, face });
  }

  notify(text, kind = 'info', duration = 2.5) { this.notice = { text, kind, time: duration }; }

  updateSolids() {
    const landings = this.platforms.map(p => ({ id: p.id, x: p.x, y: p.y - .32, w: p.w, h: .32, kind: 'metal' }));
    this.solids = [
      ...TERRAIN, ...SEAMS.filter(seam => !keyIn(this.world.broken, seam.id)),
      ...this.gates.filter(gate => !gate.open), ...landings,
      { ...MAIN_LIFT, y: this.lift.y - MAIN_LIFT.h, kind: 'metal' },
    ];
  }

  syncGates(dt) {
    for (const gate of this.gates) {
      const enabled = gate.needs.some(need => this.powered(need));
      if (enabled || this.gateOccupied(gate)) {
        gate.open = true;
        gate.delay = .24;
      } else if (gate.open) {
        gate.delay -= dt;
        if (gate.delay <= 0) gate.open = false;
      }
    }
  }

  gateOccupied(gate) {
    const p = this.player;
    if (overlap(hitbox(p), gate)) return true;
    if (this.world.carry && overlap(cellBox(p.x + p.face * .51, p.y + .5), gate)) return true;
    return this.world.cells.some(cell =>
      !cell.socket && cell.id !== this.world.carry && overlap(cellBox(cell.x, cell.y), gate));
  }

  commit(stationId) {
    this.checkpoint = { station: stationId, world: structuredClone(this.world) };
    this.player.integrity = 3;
    this.player.energy = R.max;
    this.player.regen = 0;
  }

  beginRecovery(reason) {
    if (this.state !== 'play') return false;
    this.recoveries++;
    this.failure = reason;
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.dashTime = 0;
    this.player.sliding = false;
    this.pulse = null;
    this.fragment = null;
    this.transition('shutdown');
    this.sound('shutdown');
    this.effect('shutdown', this.player.x, this.player.y + .8, .45);
    return true;
  }

  updatePresentation(dt) {
    if (this.state === 'shutdown' && this.stateTime >= .48) {
      const reason = this.failure;
      this.world = structuredClone(this.checkpoint.world);
      this.restoreLocal(STATIONS.find(station => station.id === this.checkpoint.station));
      this.failure = reason;
      this.transition('reboot');
      this.sound('reboot');
      this.effect('reboot', this.player.x, this.player.y + .75, .55);
    } else if (this.state === 'reboot' && this.stateTime >= .53) {
      this.transition('play');
    } else if (this.state === 'relayActivation' && this.stateTime >= .96) {
      this.relayFocus = null;
      this.transition('play');
    } else if (this.state === 'liftSequence') {
      this.updateEnding();
    }
  }

  step(input = {}, dt = STEP) {
    if (this.state === 'paused' || this.state === 'title' || this.state === 'complete') return;
    this.stateTime += dt;
    for (const effect of this.effects) effect.life -= dt;
    this.effects = this.effects.filter(effect => effect.life > 0);

    if (this.state !== 'play') {
      this.updatePresentation(dt);
      return;
    }
    if (input.retry) {
      this.beginRecovery('Checkpoint retry');
      return;
    }

    this.timeTicks++;
    this.localTicks++;
    if (this.notice && (this.notice.time -= dt) <= 0) this.notice = null;
    if (this.fragment && (this.fragment.time -= dt) <= 0) this.fragment = null;
    for (const [id, until] of this.revealed) if (until <= this.localTime) this.revealed.delete(id);

    const p = this.player;
    for (const timer of ['immune', 'recoil', 'regen', 'pulseCooldown', 'dashCooldown', 'wallLock', 'land', 'gestureTime']) {
      p[timer] = approachZero(p[timer], dt);
    }
    if (!p.regen) p.energy = Math.min(R.max, p.energy + R.regen * dt);

    if (input.interact) this.interact();
    if (this.state !== 'play') return;
    if (input.pulse && !this.world.carry) this.startPulse();
    this.syncGates(dt);
    this.updateSolids();
    this.movePlatforms(dt);
    if (this.state !== 'play') return;
    this.updateVents(dt);
    const wasX = p.x;
    const dash = this.movePlayer(input, dt);
    if (p.y < -6.3 || DEEP_WATER.some(water => p.x > water.x && p.x < water.x + water.w && p.y < water.y)) {
      this.beginRecovery('Deep channel');
      return;
    }
    this.updatePulse(dt);
    if (this.state !== 'play') return;
    this.updateEnemies(dt, dash, wasX);
    if (this.state !== 'play') return;
    this.updateBolts(dt);
    if (this.state !== 'play') return;
    for (const vent of this.vents) {
      if (vent.state === 'active' && overlap(hitbox(p), vent)) this.damage(vent.x + vent.w / 2);
    }
  }

  gesture(name, seconds = .34) {
    this.player.gesture = name;
    this.player.gestureTime = seconds;
  }

  movePlayer(input, dt) {
    const p = this.player;
    const carry = Boolean(this.world.carry);
    const direction = Number(Boolean(input.right)) - Number(Boolean(input.left));
    let grounded = Boolean(p.ground);
    const body = hitbox(p);
    const preferred = direction || p.wall || p.face;
    const contact = sweep(body, .047 * preferred, 'x', this.solids).hit;
    const opposite = !contact?.wall ? sweep(body, -.047 * preferred, 'x', this.solids).hit : null;
    p.wall = !grounded && !carry ? (contact?.wall ? preferred : opposite?.wall ? -preferred : 0) : 0;

    p.coyote = grounded ? M.coyote : approachZero(p.coyote, dt);
    p.buffer = input.jump ? M.buffer : approachZero(p.buffer, dt);
    if (grounded && !p.dashTime) p.dashReady = true;
    if (direction && !p.dashTime && !p.wallLock && !p.recoil) p.face = direction;

    if (!p.dashTime && p.buffer && (p.coyote || p.wall)) {
      if (!p.coyote && p.wall) {
        p.face = -p.wall;
        p.vx = p.face * M.wallX;
        p.vy = M.wallY;
        p.wallLock = M.wallLock;
        p.dashReady = true;
        this.gesture('wallJump', .22);
        this.effect('wall', p.x + p.wall * .36, p.y + .26, .24, -p.wall);
        this.sound('wallJump');
      } else {
        p.vy = M.jump;
        this.gesture('takeoff', .16);
        this.sound('jump');
      }
      p.ground = null;
      p.coyote = 0;
      p.buffer = 0;
      grounded = false;
    }

    if (input.dash && !carry && p.dashReady && !p.dashCooldown && !p.recoil) {
      p.dashTime = M.dashTime;
      p.dashCooldown = M.dashCooldown;
      p.dashFace = p.face;
      p.dashReady = false;
      p.dashTrail = 0;
      p.vy = 0;
      this.sound('dash');
      this.effect('dash', p.x, p.y + .66, .19, p.dashFace);
    }

    const dash = p.dashTime > 0;
    p.sliding = !dash && !grounded && Boolean(p.wall && direction === p.wall && p.vy <= 0 && !p.wallLock);

    if (dash) {
      p.vx = p.dashFace * M.dashSpeed;
      p.dashTrail -= dt;
      if (p.dashTrail <= 0) {
        this.effect('dash', p.x, p.y + .65, .16, p.dashFace);
        p.dashTrail = .043;
      }
    } else {
      if (!p.wallLock && p.recoil <= .12) {
        const accel = direction ? grounded ? M.groundAccel : M.airAccel
          : grounded ? M.groundBrake : M.airBrake;
        p.vx = approach(p.vx, direction * (carry ? M.carrySpeed : M.speed), accel * dt);
      }
      if (!input.jumpHeld && p.vy > M.cut) p.vy = M.cut;
      p.vy = Math.max(p.vy - M.gravity * dt, p.sliding ? -M.slide : -M.fall);
    }

    const oldX = p.x;
    let horizontal = sweep(hitbox(p), p.vx * dt, 'x', this.solids);
    if (dash && horizontal.hit?.kind === 'crystal') {
      this.breakSeam(horizontal.hit);
      horizontal = sweep(hitbox(p), p.vx * dt, 'x', this.solids);
    }
    p.x += horizontal.move;
    if (horizontal.hit) {
      p.vx = 0;
      if (dash) p.dashTime = 0;
    }

    const startingVy = p.vy;
    const vertical = sweep(hitbox(p), p.vy * dt, 'y', this.solids);
    p.y += vertical.move;
    if (vertical.hit) p.vy = 0;
    const floor = startingVy <= 0
      ? vertical.hit ?? sweep(hitbox(p), -.001, 'y', this.solids).hit
      : null;
    if (floor && !p.ground && startingVy <= 0) {
      p.dashReady = true;
      if (startingVy < -2.7) {
        p.land = .15;
        if (startingVy < -5) {
          this.effect('floor', p.x, p.y + .05, .28);
          this.sound('land', floor.kind);
        }
      }
    }
    p.ground = floor?.id ?? null;
    if (dash && p.dashTime > 0) {
      p.dashTime = approachZero(p.dashTime, dt);
      if (!p.dashTime) p.vx = p.dashFace * M.speed;
    }
    if (p.ground) p.sliding = false;
    if (p.sliding && this.localTicks % 24 === 0) {
      this.sound('slide');
      this.effect('wall', p.x + p.wall * .38, p.y + .35, .2);
    }
    if (p.ground && !dash) {
      p.stride += Math.abs(p.x - oldX);
      if (p.stride > (carry ? 1.3 : 1.53)) {
        p.stride = 0;
        this.sound('step', floor.kind);
      }
    }
    return dash;
  }

  breakSeam(seam) {
    this.world.broken.push(seam.id);
    this.effect('seam', seam.x + seam.w / 2, clamp(this.player.y + .75, seam.y + .2, top(seam)), .61, this.player.dashFace);
    this.sound('seam');
    this.updateSolids();
  }

  movePlatforms(dt) {
    for (const p of this.platforms) {
      p.powered = this.powered(p.needs);
      if (!p.powered && p.phase === 0) continue;
      if (!p.powered) {
        if (this.advancePlatform(p, p.originX, approach(p.y, p.originY, dt * 1.8), dt)
            && Math.abs(p.y - p.originY) < .001) p.phase = 0;
        continue;
      }

      const half = p.dwell + p.travel;
      const phase = (p.phase + dt) % (half * 2);
      const outward = phase < half;
      const leg = outward ? phase : phase - half;
      const blend = smooth(clamp((leg - p.dwell) / p.travel, 0, 1));
      const t = outward ? blend : 1 - blend;
      if (this.advancePlatform(p, mix(p.originX, p.toX, t), mix(p.originY, p.toY, t), dt)) p.phase = phase;
      if (this.state !== 'play') break;
    }
    this.updateSolids();
  }

  advancePlatform(platform, x, y, dt) {
    const p = this.player;
    const dx = x - platform.x;
    const dy = y - platform.y;
    if (!dx && !dy) return true;

    const body = hitbox(p);
    const next = { x, y: y - .32, w: platform.w, h: .32 };
    const rider = p.ground === platform.id;
    const pushing = overlap(body, next);
    if (rider || pushing) {
      const shiftX = sweep(body, dx, 'x', this.solids, platform.id);
      const shiftY = sweep({ ...body, x: body.x + shiftX.move }, dy, 'y', this.solids, platform.id);
      const target = { ...body, x: body.x + shiftX.move, y: body.y + shiftY.move };
      if (overlap(target, next)) {
        const pinned = dy > 0 && Boolean(shiftY.hit) && (rider || pushing);
        platform.blocked = pinned ? platform.blocked + dt : 0;
        if (platform.blocked >= .26) this.beginRecovery('Machinery crush');
        return false;
      }
      p.x += shiftX.move;
      p.y += shiftY.move;
    }
    platform.blocked = 0;
    platform.x = x;
    platform.y = y;
    return true;
  }

  updateVents(dt) {
    for (const vent of this.vents) {
      if (distance(this.player.x, this.player.y, vent.x, vent.y) > 12) {
        vent.t = 0;
        vent.state = 'dormant';
        continue;
      }
      const cycle = vent.idle + vent.warning + vent.active;
      vent.t = (vent.t + dt) % cycle;
      const state = vent.t >= vent.idle + vent.warning ? 'active' : vent.t >= vent.idle ? 'warning' : 'dormant';
      if (state !== vent.state && state !== 'dormant') this.sound(state === 'warning' ? 'ventWarn' : 'vent');
      vent.state = state;
    }
  }

  startPulse() {
    const p = this.player;
    if (p.pulseCooldown > 0) return;
    if (p.energy < R.pulse) {
      this.notify('Echo needs 35 resonance', 'energy', 1.25);
      this.sound('empty');
      return;
    }
    p.energy -= R.pulse;
    p.pulseCooldown = R.cooldown;
    p.regen = R.delay;
    this.pulse = { x: p.x, y: p.y + .79, age: 0, radius: 0, hit: new Set() };
    this.gesture('pulse', .36);
    this.sound('pulse');
  }

  canSee(x, y, tx, ty, throughCrystal = false) {
    return rayFraction(x, y, tx - x, ty - y, this.solids, null, throughCrystal) >= .9999;
  }

  updatePulse(dt) {
    const wave = this.pulse;
    if (!wave) return;
    wave.age += dt;
    wave.radius = R.radius * clamp(wave.age / R.waveTime, 0, 1);

    const reached = (id, x, y) => {
      if (wave.hit.has(id) || distance(wave.x, wave.y, x, y) > wave.radius) return false;
      wave.hit.add(id);
      return this.canSee(wave.x, wave.y, x, y, true);
    };
    const reveal = (id, x, y) => {
      if (reached(`reveal:${id}`, x, y)) this.revealed.set(id, this.localTime + 5);
    };
    for (const seam of SEAMS) if (!keyIn(this.world.broken, seam.id)) reveal(seam.id, seam.x + seam.w / 2, seam.y + seam.h / 2);
    for (const archive of ARCHIVES) if (!keyIn(this.world.archives, archive.id)) reveal(archive.id, archive.x, archive.y);
    for (const socket of SOCKETS) reveal(socket.id, socket.x, socket.y + .63);
    for (const marker of [{ id: 'reservoir-path', x: 62.6, y: 8.0 }, { id: 'service-path', x: 164.7, y: 2.65 }]) {
      reveal(marker.id, marker.x, marker.y);
    }
    for (const enemy of this.enemies) {
      if (enemy.state === 'disabled') continue;
      const y = enemy.type === 'skitter' ? enemy.y + .37 : enemy.y;
      if (reached(`enemy:${enemy.id}`, enemy.x, y)) this.pulseEnemy(enemy);
    }
    for (const relay of RELAYS) {
      if (keyIn(this.world.relays, relay.id)) continue;
      if (!reached(`relay:${relay.id}`, relay.x, relay.y)) continue;
      if (relay.needs.every(need => this.powered(need))) {
        this.activateRelay(relay);
        break;
      }
      this.notify(relay.blocked);
    }
    if (wave.age >= R.waveTime) this.pulse = null;
  }

  activateRelay(relay) {
    this.world.relays.push(relay.id);
    this.commit(relay.station);
    this.syncGates(0);
    this.updateSolids();
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.dashTime = 0;
    this.pulse = null;
    this.relayFocus = relay;
    this.transition('relayActivation');
    this.gesture('relay', .9);
    this.notice = null;
    this.effect('relay', relay.x, relay.y, .95);
    this.sound('relay');
  }

  pulseEnemy(enemy) {
    if (enemy.type === 'sentinel') {
      if (enemy.state === 'venting') this.disable(enemy);
      else {
        this.effect('deflect', enemy.x, enemy.y, .42);
        this.sound('deflect');
        this.notify('Armored core · Wait for venting', 'info', 1.7);
      }
      return;
    }
    enemy.state = 'stunned';
    enemy.t = enemy.type === 'skitter' ? 2 : 2.5;
    this.effect('stun', enemy.x, enemy.y + (enemy.type === 'skitter' ? .36 : 0), .43);
    this.sound('stun');
  }

  disable(enemy) {
    if (enemy.state === 'disabled') return;
    enemy.state = 'disabled';
    enemy.t = 0;
    this.world.disabled.push(enemy.id);
    this.effect('disable', enemy.x, enemy.y + (enemy.type === 'skitter' ? .36 : 0), .55);
    this.sound('disable');
  }

  updateEnemies(dt, dash, oldX) {
    const p = this.player;
    const body = hitbox(p);
    const dashBox = { ...body, x: Math.min(oldX, p.x) - BODY.w / 2, w: BODY.w + Math.abs(oldX - p.x) };
    for (const enemy of this.enemies) {
      if (enemy.state === 'disabled' || Math.abs(p.x - enemy.x) > 16 || Math.abs(p.y - enemy.y) > 9) continue;
      if (enemy.state === 'stunned') {
        if (dash && overlap(dashBox, enemyBody(enemy))) this.disable(enemy);
        else if ((enemy.t -= dt) <= 0) enemy.state = 'patrol';
        continue;
      }
      if (enemy.type === 'skitter') this.skitter(enemy, dt);
      else if (enemy.type === 'drone') this.drone(enemy, dt);
      else this.sentinel(enemy, dt);

      if (overlap(body, enemyBody(enemy))) this.damage(enemy.x);
      if (enemy.type === 'sentinel' && enemy.state === 'firing' && overlap(body, this.beam(enemy))) this.damage(enemy.x);
      if (this.state !== 'play') return;
    }
  }

  skitter(enemy, dt) {
    const p = this.player;
    enemy.t -= dt;
    if (enemy.state === 'dormant' && Math.abs(p.x - enemy.x) < 9) enemy.state = 'patrol';
    if (enemy.state === 'alert' && enemy.t <= 0) {
      enemy.state = 'lunge';
      enemy.t = .28;
      this.sound('lunge');
    } else if (enemy.state === 'lunge' && enemy.t <= 0) {
      enemy.state = 'recover';
      enemy.t = .68;
    } else if (enemy.state === 'recover' && enemy.t <= 0) {
      enemy.state = 'patrol';
    }
    if (enemy.state === 'patrol' && distance(enemy.x, enemy.y + .42, p.x, p.y + .68) <= 5
        && this.canSee(enemy.x, enemy.y + .42, p.x, p.y + .68)) {
      enemy.dir = Math.sign(p.x - enemy.x) || enemy.dir;
      enemy.state = 'alert';
      enemy.t = .5;
      this.sound('skitterWarn');
    }
    if (enemy.state !== 'patrol' && enemy.state !== 'lunge') return;
    const speed = enemy.state === 'lunge' ? 7.1 : 1.4;
    const x = enemy.x + enemy.dir * speed * dt;
    const foot = box(x + enemy.dir * .47, enemy.y + .04, .12, .12);
    const floor = sweep(foot, -.28, 'y', this.solids).hit;
    const wall = sweep(enemyBody(enemy), x - enemy.x, 'x', this.solids).hit;
    if (x < enemy.min || x > enemy.max || !floor || wall) {
      if (enemy.state === 'lunge') {
        enemy.state = 'recover';
        enemy.t = .68;
      } else enemy.dir *= -1;
    } else enemy.x = x;
  }

  drone(enemy, dt) {
    const p = this.player;
    enemy.t -= dt;
    if (enemy.state === 'aim' && enemy.t <= 0) {
      enemy.state = 'fire';
      enemy.t = .11;
      if (this.bolts.length < 12) {
        this.bolts.push({ id: ++this.serial, x: enemy.x, y: enemy.y, vx: enemy.aimX * 5.4, vy: enemy.aimY * 5.4, life: 3 });
      }
      this.sound('bolt');
    } else if (enemy.state === 'fire' && enemy.t <= 0) {
      enemy.state = 'cooldown';
      enemy.t = 1.6;
    } else if (enemy.state === 'cooldown' && enemy.t <= 0) {
      enemy.state = 'patrol';
    }
    if (enemy.state !== 'patrol') return;
    const reach = distance(enemy.x, enemy.y, p.x, p.y + .69);
    if (reach > .01 && reach <= 7.5 && this.canSee(enemy.x, enemy.y, p.x, p.y + .69)) {
      enemy.aimX = (p.x - enemy.x) / reach;
      enemy.aimY = (p.y + .69 - enemy.y) / reach;
      enemy.state = 'aim';
      enemy.t = .8;
      this.sound('droneWarn');
      return;
    }
    enemy.orbit += dt;
    enemy.y = enemy.originY + Math.sin(enemy.orbit * 2.3) * .27;
    enemy.x = clamp(enemy.x + enemy.dir * 1.07 * dt, enemy.min, enemy.max);
    if (enemy.x <= enemy.min || enemy.x >= enemy.max) enemy.dir *= -1;
  }

  sentinel(enemy, dt) {
    if (enemy.state === 'closed') {
      if (Math.abs(this.player.x - enemy.x) > 10.5 || Math.abs(this.player.y - enemy.y) > 5) return;
      enemy.t += dt;
      if (enemy.t >= .8) {
        enemy.state = 'warning';
        enemy.t = .88;
        this.sound('beamWarn');
      }
      return;
    }
    enemy.t -= dt;
    if (enemy.t > 0) return;
    if (enemy.state === 'warning') {
      enemy.state = 'firing';
      enemy.t = .9;
      this.sound('beam');
    } else if (enemy.state === 'firing') {
      enemy.state = 'venting';
      enemy.t = 2;
      this.sound('vent');
    } else {
      enemy.state = 'closed';
      enemy.t = 0;
    }
  }

  beam(enemy) {
    const range = 11.7 * enemy.dir;
    const height = .23;
    const fraction = Math.min(...[-.11, 0, .11].map(offset =>
      rayFraction(enemy.x, enemy.y + offset, range, 0, this.solids)));
    const stop = enemy.x + range * fraction;
    return { x: Math.min(enemy.x, stop), y: enemy.y - height / 2, w: Math.abs(stop - enemy.x), h: height };
  }

  updateBolts(dt) {
    const p = this.player;
    const body = hitbox(p);
    const target = [{ ...body, x: body.x - .1, y: body.y - .1, w: body.w + .2, h: body.h + .2 }];
    this.bolts = this.bolts.filter(bolt => {
      bolt.life -= dt;
      if (bolt.life <= 0) return false;
      const dx = bolt.vx * dt;
      const dy = bolt.vy * dt;
      const terrain = rayFraction(bolt.x, bolt.y, dx, dy, this.solids);
      const contact = rayFraction(bolt.x, bolt.y, dx, dy, target);
      if (contact < terrain) {
        this.damage(bolt.x);
        return false;
      }
      if (terrain < 1) {
        this.effect('spark', bolt.x + dx * terrain, bolt.y + dy * terrain, .22);
        return false;
      }
      bolt.x += dx;
      bolt.y += dy;
      return true;
    });
  }

  damage(sourceX) {
    const p = this.player;
    if (this.state !== 'play' || p.immune > 0) return false;
    const shield = p.energy >= R.shield;
    if (shield) {
      p.energy -= R.shield;
      p.regen = R.delay;
      p.immune = .8;
    } else {
      p.integrity--;
      p.immune = 1.2;
    }
    this.sound(shield ? 'shield' : 'damage');
    this.effect(shield ? 'shield' : 'damage', p.x, p.y + .74, .42);
    if (p.integrity <= 0) {
      this.beginRecovery('Integrity depleted');
      return true;
    }
    const knock = Math.sign(p.x - sourceX) || -p.face;
    p.dashTime = 0;
    p.vx = knock * (shield ? 3.6 : 4.7);
    p.vy = shield ? 2.7 : 4.4;
    p.ground = null;
    p.coyote = 0;
    p.recoil = .25;
    if (shield) this.notify('Shield absorbed hit · −50 resonance', 'energy', 1.55);
    return true;
  }

  interaction() {
    const p = this.player;
    const near = (object, offset = 0) => distance(p.x, p.y + .74, object.x, object.y + offset);
    const closest = (items, range, offset = 0) => items
      .map(item => ({ item, d: near(item, offset) }))
      .filter(entry => entry.d <= range && this.canSee(p.x, p.y + .74, entry.item.x, entry.item.y + offset))
      .sort((a, b) => a.d - b.d)[0]?.item;
    const occupied = id => this.world.cells.some(cell => cell.socket === id);
    const carried = this.world.cells.find(cell => cell.id === this.world.carry);
    if (carried) {
      const socket = closest(SOCKETS.filter(socket => socket.type === carried.type && !occupied(socket.id)), 1.34, .59);
      if (socket) return { type: 'insert', ref: socket, action: 'Insert cell', x: socket.x, y: socket.y + .73 };
      return { type: 'place', ref: carried, action: 'Set cell down' };
    }
    const loose = closest(this.world.cells.filter(cell => !cell.socket), 1.31, .32);
    if (loose) return { type: 'pick', ref: loose, action: 'Pick up power cell', x: loose.x, y: loose.y + .72 };
    const removable = closest(SOCKETS.filter(socket => occupied(socket.id) && !keyIn(this.world.relays, socket.lock)), 1.32, .59);
    if (removable) return { type: 'remove', ref: removable, action: 'Remove cell', x: removable.x, y: removable.y + .73 };
    const available = [
      ...SWITCHES.filter(item => !keyIn(this.world.switches, item.id) && this.powered(item.needs)).map(item =>
        ({ type: 'switch', ref: item, action: item.action, x: item.x, y: item.y })),
      ...STATIONS.map(item => ({ type: 'station', ref: item, action: 'Reboot station', x: item.x, y: item.y + .72 })),
      ...ARCHIVES.filter(item => !keyIn(this.world.archives, item.id)).map(item =>
        ({ type: 'archive', ref: item, action: 'Read memory archive', x: item.x, y: item.y })),
      ...CACHES.filter(item => !keyIn(this.world.caches, item.id)).map(item =>
        ({ type: 'cache', ref: item, action: 'Salvage cache', x: item.x, y: item.y })),
    ];
    if (this.isBoarded()) {
      available.push({ type: 'lift', action: 'Activate lift', x: MAIN_LIFT.console, y: MAIN_LIFT.y + .8 });
    }
    return closest(available, 1.4) ?? null;
  }

  placement() {
    const p = this.player;
    if (!p.ground) return null;
    for (const offset of [1.03, .8, 1.26]) {
      const x = p.x + p.face * offset;
      const grounded = TERRAIN.find(solid =>
        Math.abs(top(solid) - p.y) < .16 && x - .32 >= solid.x && x + .32 <= solid.x + solid.w);
      if (!grounded) continue;
      const y = top(grounded);
      const footprint = cellBox(x, y);
      const obstructions = [...this.solids, ...GATES, ...VENTS];
      if (obstructions.some(solid => overlap(footprint, solid))) continue;
      if (!this.canSee(p.x, p.y + .3, x, y + .3)) continue;
      if (this.world.cells.some(cell => cell.id !== this.world.carry && !cell.socket && overlap(footprint, cellBox(cell.x, cell.y)))) continue;
      return { x, y };
    }
    return null;
  }

  interact() {
    const target = this.interaction();
    if (!target) {
      if (this.fragment) this.fragment = null;
      return false;
    }
    const { type, ref } = target;
    const p = this.player;
    if (type === 'insert') {
      const cell = this.world.cells.find(item => item.id === this.world.carry);
      Object.assign(cell, { socket: ref.id, x: ref.x, y: ref.y });
      this.world.carry = null;
      this.gesture('socket');
      this.effect('socket', ref.x, ref.y + .65, .62);
      this.sound('socket');
      if (ref.id === 'counterweight' && !this.powered('switch:latch')) this.notify('Counterweight online · Ride to the latch');
    } else if (type === 'place') {
      const placed = this.placement();
      if (!placed) {
        this.notify('Find level ground to set down the cell', 'info', 1.7);
        this.sound('empty');
        return false;
      }
      Object.assign(ref, placed);
      this.world.carry = null;
      this.gesture('socket');
      this.sound('cell');
    } else if (type === 'pick' || type === 'remove') {
      const cell = type === 'pick' ? ref : this.world.cells.find(item => item.socket === ref.id);
      cell.socket = null;
      this.world.carry = cell.id;
      p.dashTime = 0;
      p.vx = clamp(p.vx, -M.carrySpeed, M.carrySpeed);
      this.gesture('liftCell');
      this.sound('cell');
    } else if (type === 'station') {
      this.commit(ref.id);
      this.notify('Checkpoint secured', 'station');
      this.sound('station');
      this.effect('reboot', ref.x, ref.y + .7, .5);
    } else if (type === 'switch') {
      this.world.switches.push(ref.id);
      this.notify(ref.notice, 'station', 3.25);
      this.gesture('socket');
      this.effect('socket', ref.x, ref.y, .55);
      this.sound('socket');
    } else if (type === 'archive') {
      this.world.archives.push(ref.id);
      this.fragment = { ...ref, time: 12 };
      this.sound('archive');
      this.effect('archive', ref.x, ref.y, .65);
    } else if (type === 'cache') {
      this.world.caches.push(ref.id);
      const gain = Math.ceil(Math.min(25, R.max - p.energy));
      p.energy = Math.min(R.max, p.energy + 25);
      this.notify(gain ? `Salvage recovered · +${gain} resonance` : 'Salvage recovered · Resonance full', 'station');
      this.sound('cache');
      this.effect('socket', ref.x, ref.y, .45);
    } else if (type === 'lift') {
      return this.startEnding();
    }
    return true;
  }

  guidance() {
    const p = this.player;
    if (!this.world.carry && this.enemies.some(machine =>
      machine.state === 'stunned' && distance(p.x, p.y, machine.x, machine.y) <= 3.85)) {
      return { key: 'SHIFT', text: 'Dash into the stunned machine' };
    }
    return GUIDANCE.find(item => p.x >= item.x[0] && p.x <= item.x[1] &&
      p.y >= item.y[0] && p.y <= item.y[1] && (!item.needs || this.powered(item.needs)) &&
      (!item.until || !this.powered(item.until)));
  }

  isBoarded() {
    const p = this.player;
    return p.ground === MAIN_LIFT.id && p.x >= MAIN_LIFT.board[0] && p.x <= MAIN_LIFT.board[1];
  }

  startEnding() {
    if (this.state !== 'play' || this.result || !this.isBoarded()) return false;
    if (!RELAYS.every(relay => this.powered(`relay:${relay.id}`))) {
      this.notify('Restore all three relays to power the lift');
      return false;
    }
    this.result = {
      time: this.time, recoveries: this.recoveries, archives: this.world.archives.length, caches: this.world.caches.length,
      disabled: this.world.disabled.length, relays: [...this.world.relays],
    };
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.face = 1;
    this.player.dashTime = 0;
    this.pulse = null;
    this.bolts = [];
    this.lift.boardedX = this.player.x;
    this.transition('liftSequence');
    this.sound('lift');
    return true;
  }

  updateEnding() {
    const t = this.stateTime;
    const lift = this.lift;
    lift.barrier = smooth(clamp(t / .62, 0, 1)) * (1 - smooth(clamp((t - 5.48) / .6, 0, 1)));
    lift.y = mix(MAIN_LIFT.y, MAIN_LIFT.endY, smooth(clamp((t - .62) / 4.85, 0, 1)));
    lift.dawn = smooth(clamp((t - 4.63) / 1.5, 0, 1));
    lift.walk = smooth(clamp((t - 6.03) / 1.82, 0, 1));
    this.player.y = lift.y;
    this.player.x = mix(lift.boardedX, MAIN_LIFT.exitX, lift.walk);
    if (t >= 8.48) {
      this.transition('complete');
      this.sound('arrival');
    }
  }

  inspect() {
    return structuredClone({
      state: this.state, stateTime: this.stateTime, time: this.time, region: this.region,
      localTime: this.localTime, recoveries: this.recoveries, player: this.player,
      world: this.world, checkpoint: this.checkpoint.station, gates: this.gates,
      platforms: this.platforms, vents: this.vents, enemies: this.enemies,
      bolts: this.bolts, result: this.result, lift: this.lift, failure: this.failure,
      target: this.state === 'play' ? this.interaction()?.type ?? null : null,
    });
  }
}
