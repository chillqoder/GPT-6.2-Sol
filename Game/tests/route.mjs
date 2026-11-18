// Both drivers start at the title or a fresh expedition and use the same
// movement buttons. The browser driver sends real keyboard events.
export async function runCourse(driver, explore = false) {
  let state = await driver.inspect();
  const marks = [];
  const check = (condition, message) => {
    if (!condition) {
      const p = state.player;
      throw new Error(`${message} at (${p.x.toFixed(2)}, ${p.y.toFixed(2)}) ${state.state}, velocity (${p.vx.toFixed(2)}, ${p.vy.toFixed(2)}), after [${marks.map(item => item[0]).join(', ')}]`);
    }
  };
  const step = async (ticks, keys = '') => { state = await driver.step(ticks, keys); };
  const mark = async (name, keys) => {
    marks.push([name, state.time, ...(keys ?? [])]);
    await driver.mark?.(name, state);
  };
  const waitFor = async (predicate, label, { keys = '', chunk = 12, limit = 1600 } = {}) => {
    for (let elapsed = 0; !predicate(state) && elapsed < limit; elapsed += chunk) {
      check(!['shutdown', 'reboot'].includes(state.state), `Unexpected recovery during ${label}`);
      await step(chunk, keys);
    }
    check(predicate(state), label);
  };
  const walk = async x => {
    await waitFor(s => Math.abs(s.player.x - x) <= .58, `Could not walk to ${x}`, {
      keys: state.player.x < x ? 'r' : 'l', chunk: 7, limit: 2000,
    });
    await step(31);
  };
  const use = async (type) => {
    check(state.target === type, `Expected ${type}, got ${state.target}`);
    await step(1, 'e');
    await step(6);
  };
  const echoRelay = async id => {
    await step(161, 'q');
    await step(2);
    check(state.world.relays.includes(id) && state.state === 'play', `Expected Relay ${id}`);
    await mark(`relay-${id.toLowerCase()}`, [state.checkpoint]);
  };
  const climb = async (start, rightX, leftX, topY) => {
    await walk(start);
    await waitFor(s => s.player.x >= rightX && s.player.y >= 2.45, 'First right-wall contact', {
      keys: 'rj', chunk: 4, limit: 60,
    });
    await step(1, 'r');
    await waitFor(s => s.player.x <= leftX && s.player.y >= 4.55, 'First wall jump to the left', {
      keys: 'lj', chunk: 4, limit: 66,
    });
    await step(1, 'l');
    await waitFor(s => s.player.y >= topY - .01 && s.player.ground && s.player.x >= rightX + .2, 'Second wall jump to the ledge', {
      keys: 'rj', chunk: 6, limit: 96,
    });
    await step(30);
  };

  if (explore) {
    await walk(2.43);
    await step(27, 'ld');
    await walk(-3.85);
    await use('archive');
    await mark('workshop-archive');
    await walk(-5.75);
    await use('cache');
    await walk(4.4);
    await use('station');
  }
  await walk(8.62);
  await step(61, 'rj');
  await walk(12.28);
  await step(61, 'rj');
  await walk(16.85);
  await step(89, 'rj');
  await walk(23.55);
  await step(1, 'r');
  await step(26, 'rd');
  check(state.world.broken.includes('training-seam'), 'Training seam survived dash');
  await step(57, 'r');
  await step(34, 'rq');
  await step(133, 'rj');
  await step(31);
  await use('pick');
  await walk(45.34);
  await use('insert');
  check(state.world.cells[0].socket === 'workshop', 'Workshop cell not inserted');
  await walk(50.24);
  await echoRelay('A');

  await climb(64.45, 65.62, 62.78, 6.6);
  await mark('reservoir-shaft');
  if (explore) {
    await walk(67.0);
    await step(20, 'l');
    await waitFor(s => s.player.x <= 62.59, 'Optional reservoir wall contact', { keys: 'lj', chunk: 2, limit: 85 });
    await step(1, 'l');
    await step(45, 'lj');
    check(state.player.y > 10.43, 'Optional reservoir wall jump height');
    await step(21, 'ldj');
    await waitFor(s => s.player.ground && s.player.y >= 9.75, 'Optional shelf landing', { keys: 'l', chunk: 4, limit: 120 });
    await step(26);
    await walk(61.54);
    await use('cache');
    await step(4, 'l');
    await step(75, 'lj');
    await walk(56.68);
    await use('archive');
    check(state.region === 1, 'Reservoir archive region');
    await mark('reservoir-archive');
    await walk(57.75);
    await step(74, 'rj');
    await step(1, 'r');
    await step(21, 'rjd');
    await waitFor(s => s.player.x >= 66.2 && s.player.y > 6.59, 'Return from reservoir archive', { keys: 'r', chunk: 8, limit: 100 });
    await step(40);
  }
  await walk(74.34);
  await use('switch');
  await walk(81.12);
  check(state.player.ground === 'crossing', 'Missed crossing dock');
  await waitFor(s => s.platforms[0].x >= 95.45, 'Crossing far dock', { chunk: 30 });
  await mark('reservoir-crossing');
  await step(102, 'rjq');
  await walk(105.35);
  if (state.player.energy < 35) {
    await waitFor(s => s.player.energy >= 35, 'Regenerate resonance near Relay B', { chunk: 12 });
  }
  await echoRelay('B');

  await walk(132.57);
  await step(83, 'rj');
  await step(41, 'r');
  await step(64, 'rj');
  await step(21, 'rd');
  await walk(150.78);
  await use('pick');
  await walk(154.37);
  await use('insert');
  await walk(157.12);
  check(state.player.ground === 'counterweight', 'Missed counterweight car');
  await waitFor(s => s.platforms[1].y >= 4.59, 'Counterweight upper dock', { chunk: 12 });
  await walk(161.42);
  await use('switch');
  check(state.world.switches.includes('latch'), 'Foundry route failed to latch');
  await mark('foundry-latch');
  if (explore) {
    await step(146, 'r');
    await walk(168.55);
    check(state.player.y >= 2.15, 'Did not enter the foundry service room');
    await use('archive');
    await mark('foundry-archive');
    await walk(170.12);
    await use('cache');
  }
  await walk(154.34);
  await waitFor(s => s.player.ground && s.player.y < .01, 'Counterweight lower landing', { chunk: 7, limit: 250 });
  await walk(154.34);
  await use('remove');
  await waitFor(s => s.platforms[1].y < .015, 'Return counterweight to its lower dock', { chunk: 21 });
  await walk(174.76);
  await use('insert');
  check(state.world.cells[1].socket === 'foundry' && state.gates.find(g => g.id === 'foundry-shutter').open, 'Latched route lost power when moving the cell');
  await walk(177.75);
  await echoRelay('C');
  await walk(185.11);
  await use('station');
  if (explore) {
    await step(128, 't');
    check(state.checkpoint === 'ascent' && state.player.integrity === 3 && state.player.energy === 100, 'Ascent retry did not return to the station');
    check(state.world.archives.length === 3 && state.world.caches.length === 3 && state.recoveries === 1, 'Optional discoveries did not survive the committed retry');
    await mark('ascent-retry');
  }

  await climb(192.65, 193.87, 191.11, 6.2);
  await mark('ascent-shaft');
  await walk(202.95);
  // Board as the service platform returns to its lower dock.
  await waitFor(s => s.platforms[2].y < 6.22, 'Service lift lower dock', { chunk: 14 });
  await walk(205.45);
  check(state.player.ground === 'service-lift', 'Missed service lift car');
  await waitFor(s => {
    const drone = s.enemies[3];
    return s.platforms[2].y >= 12.34 || (drone.state === 'aim' && s.player.y >= 11.2
      && Math.hypot(drone.x - s.player.x, drone.y - s.player.y - .79) < 5.8);
  }, 'Ascent drone or upper dock', { chunk: 6 });
  if (state.platforms[2].y < 12.34) await step(43, 'q');
  await waitFor(s => s.platforms[2].y >= 12.34, 'Service lift upper dock', { chunk: 18 });
  await step(48, 'rj');
  await step(45, 'rjq');
  await walk(214.02);
  await waitFor(s => s.vents[2].state === 'dormant', 'Clear ascent vent', { chunk: 12 });
  await step(23, 'rd');
  await walk(222.45);
  check(state.target === 'lift' && state.player.ground === 'main-lift', 'Lift boarding area');
  await step(1, 'e');
  check(state.state === 'liftSequence' && state.result, 'Main lift rejected valid boarding');
  const finalTime = state.result.time;
  await mark('lift-boarding');
  await step(510);
  await mark('lift-motion');
  await step(449);
  await mark('lift-terrace');
  await step(75);
  check(state.state === 'complete' && state.time === finalTime && state.lift.dawn === 1, 'Ending did not reach the terrace with a stopped clock');
  check(state.result.archives === (explore ? 3 : 0) && state.result.caches === (explore ? 3 : 0), 'Completion discovery count');
  check(state.result.recoveries === (explore ? 1 : 0), 'Unexpected recovery count');
  await mark('surface');
  return { marks, result: state.result };
}

export function simulationDriver(game) {
  const mapping = { j: 'jump', d: 'dash', q: 'pulse', e: 'interact', t: 'retry' };
  let previous = '';
  let inputVersion = game.inputVersion;
  return {
    inspect: () => game.inspect(),
    step(ticks, keys) {
      let held = keys;
      for (let i = 0; i < ticks; i++) {
        const input = { left: held.includes('l'), right: held.includes('r'), jumpHeld: held.includes('j') };
        if (i === 0) for (const key of held) if (mapping[key] && !previous.includes(key)) input[mapping[key]] = true;
        game.step(input);
        if (inputVersion !== game.inputVersion) {
          inputVersion = game.inputVersion;
          held = '';
        }
      }
      previous = held;
      return game.inspect();
    },
  };
}
