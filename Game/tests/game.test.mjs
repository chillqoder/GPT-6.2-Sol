import assert from 'node:assert/strict';
import test from 'node:test';
import { Expedition } from '../src/game.js';
import { BODY, MAIN_LIFT, MOTION, RESONANCE, STEP } from '../src/level.js';
import { box, overlap, rayFraction } from '../src/geometry.js';
import { Records } from '../src/records.js';
import { runCourse, simulationDriver } from './route.mjs';

const makeGame = () => {
  const game = new Expedition();
  game.restart();
  game.takeEvents();
  return game;
};
const step = (g, n, input = {}) => {
  for (let i = 0; i < n; i++) g.step(i ? { left: input.left, right: input.right, jumpHeld: input.jumpHeld } : input);
};
const position = (g, x, y) => {
  Object.assign(g.player, { x, y, vx: 0, vy: 0, coyote: 0, buffer: 0, ground: null, wall: 0, face: 1, immune: 0 });
  step(g, 1);
};
const approximately = (actual, expected, tolerance = .0001) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} vs ${expected}`);

test('measured running, braking, variable-height jumps, and no double jump', () => {
  const g = makeGame();
  step(g, 10, { right: true });
  approximately(g.player.vx, 3.5);
  step(g, 18, { right: true });
  approximately(g.player.vx, MOTION.speed);
  const x = g.player.x;
  step(g, 25);
  assert.equal(g.player.vx, 0);
  assert.ok(g.player.x - x > .49 && g.player.x - x < .57);
  assert.ok(g.player.ground);

  const heights = [];
  for (const held of [false, true]) {
    const jump = makeGame();
    step(jump, 1, { jump: true, jumpHeld: held });
    let apex = 0;
    for (let i = 0; i < 125; i++) {
      if (i === 15) {
        const previous = jump.player.vy;
        step(jump, 1, { jump: true, jumpHeld: held });
        assert.ok(jump.player.vy < previous);
      } else step(jump, 1, { jumpHeld: held });
      apex = Math.max(apex, jump.player.y);
    }
    assert.ok(jump.player.ground);
    heights.push(apex);
  }
  assert.ok(heights[0] > 1.15 && heights[0] < 1.50, heights.join(', '));
  assert.ok(heights[1] > 2.53 && heights[1] < 2.64, heights.join(', '));
});

test('coyote takeoff, a pre-landing jump buffer, and ceiling resolution', () => {
  const g = makeGame();
  position(g, 17.82, 0);
  step(g, 24, { right: true });
  assert.ok(!g.player.ground && g.player.y < 0 && g.player.coyote > 0);
  step(g, 1, { jump: true, jumpHeld: true });
  assert.ok(g.player.vy > 12.4);

  position(g, 6.3, .65);
  g.player.vy = -7;
  step(g, 20, { jump: true, jumpHeld: true });
  assert.ok(g.player.vy > 8 && g.player.y > 0);

  position(g, 60.0, 0);
  step(g, 10, { jump: true, jumpHeld: true });
  assert.ok(g.player.y <= 1.92 - BODY.h + .001);
  assert.ok(g.player.vy <= 0);
  assert.ok(!g.solids.some(solid => overlap(box(g.player.x, g.player.y, BODY.w, BODY.h), solid)));
});

test('wall contact requires an airborne body, with a locked deliberate wall jump', () => {
  const g = makeGame();
  position(g, 65.625, 0);
  step(g, 20, { right: true });
  assert.ok(g.player.ground && !g.player.sliding);
  position(g, 65.625, 2.9);
  g.player.vy = -8;
  step(g, 2, { right: true });
  assert.ok(g.player.sliding && g.player.vy === -MOTION.slide);
  const x = g.player.x;
  g.player.dashReady = false;
  g.player.dashCooldown = .25;
  step(g, 1, { left: true, jump: true, jumpHeld: true });
  assert.ok(g.player.x < x && g.player.vx < -6.9 && g.player.vy > 12);
  assert.ok(g.player.dashReady && g.player.wallLock >= .09);
  step(g, 8, { right: true, jumpHeld: true, dash: true });
  approximately(g.player.vx, -7);
  assert.equal(g.player.dashTime, 0);
});

test('locked dash direction, cooldown, swept solids and brittle seam', () => {
  const g = makeGame();
  step(g, 14, { jump: true, jumpHeld: true });
  const { x, y } = g.player;
  step(g, 1, { dash: true, right: true });
  step(g, 18, { left: true });
  approximately(g.player.x - x, 19 * 15 / 120);
  approximately(g.player.y, y);
  step(g, 1, { left: true });
  assert.equal(g.player.dashTime, 0);
  assert.ok(g.player.vx > 0 && g.player.dashCooldown > .28 && !g.player.dashReady);
  step(g, 18, { dash: true });
  assert.equal(g.player.dashTime, 0);
  step(g, 102);
  assert.ok(g.player.dashReady && g.player.ground);

  position(g, 24.74, 0);
  step(g, 1, { right: true, dash: true });
  assert.ok(g.world.broken.includes('training-seam'));
  position(g, 46.51, 0);
  g.player.dashCooldown = 0;
  step(g, 4, { right: true, dash: true });
  approximately(g.player.x, 46.9 - BODY.w / 2);
  assert.equal(g.player.dashTime, 0);
});

test('pulse has fixed cost, cooldown, delayed regeneration and bounded one-hit wave', () => {
  const g = makeGame();
  position(g, 29.7, 0);
  step(g, 1, { pulse: true });
  approximately(g.player.energy, 65);
  step(g, 12, { pulse: true });
  assert.ok(g.pulse.radius < 2.3 && g.pulse.radius > 1.5);
  step(g, 30);
  assert.equal(g.enemies[0].state, 'stunned');
  assert.equal(g.takeEvents().filter(e => e.name === 'stun').length, 1);
  assert.equal(g.pulse, null);
  approximately(g.player.energy, 65);
  step(g, 131);
  approximately(g.player.energy, 65);
  step(g, 10);
  assert.ok(g.player.energy > 65 && g.player.energy < 67);
  g.player.energy = 34;
  g.player.regen = 2;
  step(g, 40, { pulse: true });
  assert.equal(g.pulse, null);
  assert.equal(g.player.energy, 34);
  assert.equal(g.takeEvents().filter(e => e.name === 'empty').length, 1);

  const far = makeGame();
  position(far, 26.1, 0);
  step(far, 44, { pulse: true });
  assert.notEqual(far.enemies[0].state, 'stunned');
});

test('solid cover blocks a powered relay; crystal lets the wave reach a marked target', () => {
  const g = makeGame();
  position(g, 49, 0);
  g.world.cells[0].socket = 'workshop';
  g.syncGates(0);
  g.updateSolids();
  g.solids.push({ id: 'fixture-cover', x: 49.8, y: 0, w: .72, h: 3.6 });
  g.startPulse();
  for (let i = 0; i < 48; i++) g.updatePulse(STEP);
  assert.deepEqual(g.world.relays, []);
  assert.equal(g.checkpoint.station, 'start');
  g.updateSolids();
  g.player.pulseCooldown = 0;
  g.startPulse();
  for (let i = 0; i < 48 && g.state === 'play'; i++) g.updatePulse(STEP);
  assert.deepEqual(g.world.relays, ['A']);
  assert.equal(g.checkpoint.station, 'after-a');

  const reveal = makeGame();
  position(reveal, 1.85, 0);
  step(reveal, 44, { pulse: true });
  assert.ok(reveal.revealed.has('archive-seam'));
  assert.ok(reveal.revealed.has('maintenance'));
  assert.equal(reveal.world.broken.length, 0);
  assert.ok(reveal.solids.find(s => s.id === 'archive-seam'));
  step(reveal, 605);
  assert.equal(reveal.revealed.size, 0);
});

test('shield threshold, immunity, wall-safe recoil and singular shutdown', () => {
  const g = makeGame();
  position(g, 65.57, 0);
  g.player.energy = 50;
  assert.equal(g.damage(64), true);
  assert.equal(g.player.energy, 0);
  assert.equal(g.player.integrity, 3);
  approximately(g.player.immune, .8);
  assert.equal(g.damage(64), false);
  step(g, 100);
  assert.ok(g.player.x <= 65.625 + .001);
  g.player.energy = 49.99;
  assert.equal(g.damage(64), true);
  assert.equal(g.player.energy, 49.99);
  assert.equal(g.player.integrity, 2);
  approximately(g.player.immune, 1.2);
  g.player.immune = 0;
  g.player.integrity = 1;
  assert.equal(g.damage(64), true);
  assert.equal(g.state, 'shutdown');
  assert.equal(g.damage(64), false);
  assert.equal(g.recoveries, 1);
  const time = g.time;
  step(g, 125, { retry: true });
  assert.equal(g.state, 'play');
  assert.equal(g.time, time + 25);
  assert.equal(g.recoveries, 1);
  assert.equal(g.player.integrity, 3);
});

test('deep water and sustained upward obstruction cause one recovery without spending shield', () => {
  const g = makeGame();
  g.player.x = 89;
  g.player.y = -4.96;
  step(g, 1);
  assert.equal(g.state, 'shutdown');
  assert.equal(g.failure, 'Deep channel');
  assert.equal(g.player.energy, 100);
  step(g, 123);
  assert.equal(g.recoveries, 1);
  const platform = g.platforms[1];
  Object.assign(platform, { x: 5, y: 0 });
  position(g, 6.1, 0);
  g.player.ground = platform.id;
  g.updateSolids();
  g.solids.push({ id: 'fixture-ceiling', x: 5, y: 1.5, w: 3.6, h: .42 });
  for (let i = 0; i < 25; i++) assert.equal(g.advancePlatform(platform, 5, .04, STEP), false);
  assert.equal(g.state, 'play');
  assert.equal(platform.y, 0);
  for (let i = 0; i < 8; i++) g.advancePlatform(platform, 5, .04, STEP);
  assert.equal(g.state, 'shutdown');
  assert.equal(g.failure, 'Machinery crush');
  assert.equal(g.recoveries, 2);
});

test('skitter telegraphs and locks attacks; stun prevents damaging contact and allows one disable', () => {
  const g = makeGame();
  position(g, 29.9, 0);
  const skitter = g.enemies[0];
  assert.equal(skitter.state, 'alert');
  assert.ok(skitter.t >= .48);
  const dir = skitter.dir;
  step(g, 62);
  assert.equal(skitter.state, 'lunge');
  assert.equal(skitter.dir, dir);
  step(g, 20, { pulse: true });
  assert.equal(skitter.state, 'stunned');
  position(g, skitter.x - .44, 0);
  assert.equal(g.player.integrity, 3);
  assert.equal(g.player.immune, 0);
  step(g, 4, { right: true, dash: true });
  assert.equal(skitter.state, 'disabled');
  assert.deepEqual(g.world.disabled, ['skitter']);
  step(g, 30);
  assert.deepEqual(g.world.disabled, ['skitter']);

  const active = makeGame();
  position(active, 31.4, 0);
  step(active, 8, { right: true, dash: true });
  assert.equal(active.world.disabled.length, 0);
  assert.ok(active.player.energy <= 50);
});

test('drone aim locks before firing; bolt collision and lifetime use live solids', () => {
  const g = makeGame();
  position(g, 100.15, 6.6);
  const drone = g.enemies[1];
  assert.equal(drone.state, 'aim');
  const aim = [drone.aimX, drone.aimY];
  step(g, 32, { right: true, jump: true, jumpHeld: true });
  assert.deepEqual([drone.aimX, drone.aimY], aim);
  step(g, 68);
  assert.ok(g.bolts.length <= 1 && g.takeEvents().some(event => event.name === 'bolt'));
  if (g.bolts.length) {
    const bolt = g.bolts[0];
    approximately(bolt.vx, aim[0] * 5.4);
    approximately(bolt.vy, aim[1] * 5.4);
  }
  position(g, 4.4, 0);
  step(g, 370);
  assert.equal(g.bolts.length, 0);
  g.bolts.push({ id: 2, x: 2.5, y: 4.0, vx: -5.4, vy: -1, life: 3 });
  step(g, 34);
  assert.equal(g.bolts.length, 0);
});

test('sentinel warns, beam stops at cover, and only a venting core accepts pulse', () => {
  const g = makeGame();
  position(g, 138.15, 0);
  const sentry = g.enemies[2];
  step(g, 36, { pulse: true, left: true });
  assert.equal(sentry.state, 'closed');
  assert.ok(g.takeEvents().some(event => event.name === 'deflect'));
  const lane = g.beam(sentry);
  approximately(lane.x, 135.65);
  approximately(lane.h, .23);
  position(g, 137.5, 3.5);
  step(g, 83);
  assert.ok(['warning', 'firing'].includes(sentry.state));
  assert.ok(g.takeEvents().some(event => event.name === 'beamWarn'));
  step(g, 212, { jump: true, jumpHeld: true });
  assert.equal(sentry.state, 'venting');
  g.player.energy = 100;
  g.player.pulseCooldown = 0;
  position(g, 140.13, 0);
  step(g, 30, { pulse: true });
  assert.equal(sentry.state, 'disabled');
  assert.ok(g.world.disabled.includes('sentinel'));
});

test('cell ownership, carrying limits, safe placement, socket priority and shutter safety', () => {
  const g = makeGame();
  position(g, 38.4, 0);
  assert.equal(g.interaction().type, 'pick');
  step(g, 1, { interact: true });
  const id = g.world.carry;
  assert.equal(id, 'workshop-cell');
  step(g, 39, { right: true, pulse: true, dash: true });
  approximately(g.player.vx, MOTION.carrySpeed);
  assert.equal(g.pulse, null);
  assert.equal(g.player.dashTime, 0);
  position(g, 18.14, 0);
  assert.equal(g.interact(), false);
  assert.equal(g.world.carry, id);
  position(g, 43.4, 0);
  assert.equal(g.interact(), true);
  assert.equal(g.world.carry, null);
  assert.equal(g.world.cells.filter(cell => cell.id === id).length, 1);
  position(g, 44.45, 0);
  assert.equal(g.interact(), true);
  assert.equal(g.interaction().type, 'insert');
  assert.equal(g.interact(), true);
  assert.equal(g.world.cells[0].socket, 'workshop');
  step(g, 1);
  const gate = g.gates[0];
  assert.ok(gate.open);
  position(g, 47.15, 0);
  g.world.cells[0].socket = null;
  g.world.carry = id;
  step(g, 60);
  assert.ok(gate.open);
  position(g, 46.48, 0);
  step(g, 60);
  assert.ok(gate.open, 'Carried cell holds shutter');
  position(g, 44.1, 0);
  step(g, 39);
  assert.ok(!gate.open);
});

test('counterweight platform displaces once, dwells, departs on jump, and resets on retry', () => {
  const g = makeGame();
  g.world.cells[1].socket = 'counterweight';
  g.commit('start');
  position(g, 157.2, 0);
  const platform = g.platforms[1];
  assert.equal(g.player.ground, platform.id);
  step(g, 125);
  assert.equal(platform.y, 0);
  step(g, 170);
  assert.ok(platform.y > .8 && platform.y < 4.6);
  approximately(g.player.y, platform.y);
  assert.equal(g.player.vy, 0);
  const initialY = g.player.y;
  step(g, 1, { jump: true, jumpHeld: true });
  assert.equal(g.player.ground, null);
  assert.ok(g.player.y > initialY + .1);
  approximately(g.player.vy, MOTION.jump - MOTION.gravity * STEP);
  step(g, 122, { retry: true });
  assert.equal(g.world.cells[1].socket, 'counterweight');
  assert.equal(g.platforms[1].y, 0);
});

test('timed vent telegraphs, applies a single shield hit, and stays dormant out of range', () => {
  const g = makeGame();
  const vent = g.vents[1];
  step(g, 490);
  assert.equal(vent.t, 0);
  position(g, 146.92, 0);
  while (vent.state === 'dormant') step(g, 1);
  const warningStart = g.time;
  assert.ok(g.takeEvents().some(event => event.name === 'ventWarn'));
  while (vent.state === 'warning') step(g, 1);
  assert.ok(g.time - warningStart >= 790);
  assert.equal(vent.state, 'active');
  position(g, 147.82, 0);
  assert.equal(g.player.energy, 50);
  assert.equal(g.player.integrity, 3);
  step(g, 30);
  assert.equal(g.takeEvents().filter(event => event.name === 'shield').length, 1);
});

test('salvage refills up to its capacity and is consumed once, including at full resonance', () => {
  for (const energy of [57, 93, 100]) {
    const g = makeGame();
    position(g, -5.9, 0);
    g.player.energy = energy;
    assert.equal(g.interaction().type, 'cache');
    assert.ok(g.interact());
    assert.equal(g.player.energy, Math.min(100, energy + 25));
    assert.equal(g.interact(), false);
    assert.deepEqual(g.world.caches, ['bench-cache']);
    assert.equal(g.takeEvents().filter(event => event.name === 'cache').length, 1);
  }
});

test('atomic checkpoint rolls back later routes, discoveries, enemy and cell mutations', () => {
  const g = makeGame();
  position(g, 45, 0);
  g.world.carry = 'workshop-cell';
  assert.equal(g.interact(), true);
  g.world.archives.push('maintenance');
  g.world.caches.push('bench-cache');
  g.world.broken.push('training-seam');
  position(g, 50.7, 0);
  step(g, 138, { pulse: true });
  step(g, 15);
  assert.equal(g.checkpoint.station, 'after-a');
  const committed = structuredClone(g.world);
  g.world.cells[0].socket = null;
  g.world.carry = 'foundry-cell';
  g.world.archives.push('reservoir');
  g.world.caches.push('crystal-cache');
  g.world.switches.push('bridge');
  g.world.relays.push('B');
  g.world.broken.push('archive-seam');
  g.world.disabled.push('skitter');
  g.bolts.push({ id: 8, x: 50, y: .6, vx: 1, vy: 0, life: 3 });
  const time = g.time;
  step(g, 120, { retry: true });
  assert.equal(g.time, time);
  assert.equal(g.recoveries, 1);
  assert.deepEqual(g.world, committed);
  assert.equal(g.player.x, 53.65);
  assert.ok(g.gates[1].open && !g.gates[2].open);
  assert.equal(g.bolts.length, 0);
  assert.equal(g.pulse, null);
  assert.deepEqual(g.platforms.map(platform => platform.phase), [0, 0, 0]);
  assert.equal(g.player.vx, 0);
});

test('pause freezes complete simulation state and restart clears the expedition', () => {
  const g = makeGame();
  step(g, 7, { right: true, pulse: true });
  g.pause();
  const snapshot = g.inspect();
  step(g, 150, { right: true, jump: true, dash: true, interact: true, retry: true });
  assert.deepEqual(g.inspect(), snapshot);
  for (let i = 0; i < 15; i++) {
    g.restart();
    step(g, 124, { retry: true });
    assert.equal(g.world.cells.length, 2);
    assert.equal(g.enemies.length, 4);
    assert.equal(g.platforms.length, 3);
    assert.equal(g.effects.length <= 1, true);
    assert.equal(g.recoveries, 1);
    assert.equal(g.bolts.length, 0);
  }
  g.restart();
  assert.equal(g.time, 0);
  assert.equal(g.recoveries, 0);
  assert.equal(g.result, null);
  assert.deepEqual(g.world.relays, []);
});

test('final lift checks each relay and the boarding pad before a single result commit', () => {
  const g = makeGame();
  position(g, MAIN_LIFT.console, MAIN_LIFT.y);
  assert.equal(g.startEnding(), false);
  g.world.relays = ['A', 'B', 'D'];
  assert.equal(g.startEnding(), false);
  g.world.relays = ['A', 'B', 'C'];
  position(g, MAIN_LIFT.x + .3, MAIN_LIFT.y);
  assert.equal(g.startEnding(), false);
  position(g, MAIN_LIFT.console, MAIN_LIFT.y);
  assert.equal(g.startEnding(), true);
  assert.equal(g.startEnding(), false);
  assert.equal(g.damage(222), false);
  const result = g.result;
  step(g, 84);
  assert.ok(g.lift.barrier > .98 && g.lift.y > MAIN_LIFT.y);
  step(g, 970, { interact: true, right: true });
  assert.equal(g.state, 'complete');
  assert.equal(g.result, result);
  assert.equal(g.time, result.time);
  assert.equal(g.player.x, MAIN_LIFT.exitX);
  assert.equal(g.lift.dawn, 1);
});

test('local records validate versions, require completion and handle ties and blocked storage', () => {
  const store = new Map();
  const storage = { getItem: key => store.get(key), setItem: (key, value) => store.set(key, value) };
  const g = new Records(storage);
  const finish = (time, recoveries, archives, relays = ['A', 'B', 'C']) => g.commit({ time, recoveries, archives, relays });
  assert.equal(finish(95_000, 1, 2, ['A', 'B']), false);
  assert.equal(store.size, 0);
  finish(96_000, 1, 2);
  finish(117_000, 0, 3);
  finish(102_000, 0, 2);
  finish(99_000, 2, 3);
  assert.deepEqual(g.best, { version: 1, time: 96000, full: 99000, fewest: { time: 102000, count: 0 } });
  assert.deepEqual(new Records(storage).best, g.best);
  storage.setItem('deepwake.records.v1', 'broken');
  assert.equal(new Records(storage).best.time, null);
  storage.setItem('deepwake.records.v1', JSON.stringify({ version: 1, time: -12, full: '42', fewest: { time: 45, count: -.5 } }));
  assert.equal(new Records(storage).best.fewest, null);
  const locked = new Records({ getItem() { throw Error('Denied'); }, setItem() { throw Error('Quota'); } });
  assert.ok(locked.commit({ time: 30000, recoveries: 0, archives: 3, relays: ['A', 'B', 'C'] }));
  assert.equal(locked.best.full, 30000);
});

test('line clipping is the same for projectiles, beams, and pulses except transmitting seams', () => {
  const crystal = { id: 'test', x: 1.0, y: 0, w: .4, h: 2, transmits: true };
  assert.equal(rayFraction(0, 1, 5, 0, [crystal]), .2);
  assert.equal(rayFraction(0, 1, 5, 0, [crystal], null, true), 1);
  assert.equal(rayFraction(0, 3, 5, 0, [crystal]), 1);
});

test('main course from start through all mechanisms and ending', async () => {
  const game = makeGame();
  const driver = simulationDriver(game);
  const drive = driver.step;
  driver.step = (...args) => {
    const state = drive(...args);
    assert.ok(!game.takeEvents().some(event => event.name === 'shield' || event.name === 'damage'),
      'The main course should be reachable without shield absorption or a damage boost');
    return state;
  };
  const route = await runCourse(driver);
  assert.equal(route.result.archives, 0);
  assert.equal(route.result.disabled, 0);
  assert.equal(route.result.recoveries, 0);
});

test('optional routes to every archive and cache, with an ascent checkpoint retry', async () => {
  const route = await runCourse(simulationDriver(makeGame()), true);
  assert.equal(route.result.archives, 3);
  assert.equal(route.result.caches, 3);
  assert.equal(route.result.recoveries, 1);
});
