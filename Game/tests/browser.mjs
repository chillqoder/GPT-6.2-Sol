import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { runCourse } from './route.mjs';
import { liveControls, touchControls } from './browser-controls.mjs';

const url = process.env.DEEPWAKE_URL ?? 'http://127.0.0.1:8768/';
const temp = await mkdtemp(join(tmpdir(), 'deepwake-browser-'));
const session = `deepwake-${process.pid}`;
const scripts = {
  play: join(temp, 'play.js'), live: join(temp, 'live.js'), touch: join(temp, 'touch.js'),
};

const verify = async (page, course, output) => {
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForFunction(() => window.deepwake?.inspect());
  if (await page.evaluate(() => window.deepwake.inspect().renderer) !== 'three') throw Error('Expected Three.js');
  const existing = await page.evaluate(() => window.deepwake.inspect().records);
  const capture = async name => {
    await page.screenshot({ path: `${output}/${name}.png`, animations: 'disabled' });
  };
  await page.evaluate(() => document.fonts.ready);
  await capture('title-desktop');
  await page.getByRole('button', { name: 'Controls', exact: true }).click();
  await page.getByRole('heading', { name: 'Controls' }).waitFor({ state: 'visible' });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Begin Expedition' }).click();
  const keys = { l: 'ArrowLeft', r: 'ArrowRight', j: 'Space', d: 'KeyX', q: 'KeyQ', e: 'KeyE', t: 'KeyR' };
  let held = '';
  let explore = false;
  const driver = {
    inspect: () => page.evaluate(() => window.deepwake.inspect()),
    async step(ticks, next) {
      for (const key of held) if (!next.includes(key)) await page.keyboard.up(keys[key]);
      for (const key of next) if (!held.includes(key)) await page.keyboard.down(keys[key]);
      held = next;
      return await page.evaluate(ticks => window.deepwake.advance(ticks), ticks);
    },
    async mark(name) {
      const shots = ['lift-boarding', 'lift-terrace', 'surface', 'reservoir-shaft', 'reservoir-crossing',
        'foundry-latch', 'foundry-archive', 'reservoir-archive'];
      if (shots.includes(name)) await capture(`${explore ? 'archive' : 'main'}-${name}`);
    },
  };
  const ordinary = await course(driver);
  await page.getByRole('heading', { name: 'Signal Restored' }).waitFor({ state: 'visible' });
  const before = await driver.inspect();
  if (before.records.time !== Math.min(existing.time ?? Infinity, ordinary.result.time)
      || before.records.full !== existing.full || before.records.fewest.count !== 0) {
    throw Error('Ordinary result was saved under the wrong record');
  }
  await driver.step(200, 'e');
  if (JSON.stringify(before.result) !== JSON.stringify((await driver.inspect()).result)) throw Error('Repeated ending commit');
  await driver.step(1, '');
  await page.getByRole('button', { name: 'New Expedition' }).click();
  if ((await driver.inspect()).world.relays.length) throw Error('Replay retained relay state');
  explore = true;
  const full = await course(driver, true);
  await page.setViewportSize({ width: 393, height: 852 });
  const results = await page.locator('#complete-panel').boundingBox();
  if (!results || results.x < 0 || results.y < 0 || results.y + results.height > 852) throw Error('Results overflow portrait');
  await capture('results-portrait');
  await page.setViewportSize({ width: 812, height: 375 });
  const panel = page.locator('#complete-panel');
  const bounds = await panel.boundingBox();
  const touch = await page.context().newCDPSession(page);
  await touch.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 4 });
  const x = bounds.x + bounds.width / 2;
  const y = bounds.y + bounds.height - 45;
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let offset = 23; offset <= 207; offset += 23) {
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - offset }] });
  }
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForFunction(() => document.getElementById('complete-panel').scrollTop >= 80);
  const scroll = await panel.evaluate(el => [el.scrollTop, el.clientHeight, el.scrollHeight]);
  await touch.send('Emulation.setTouchEmulationEnabled', { enabled: false });
  await touch.detach();
  await capture('results-landscape');
  if (errors.length) throw Error(errors.join('\n'));
  const records = (await driver.inspect()).records;
  if (records.full !== Math.min(existing.full ?? Infinity, full.result.time)) throw Error('Full-archive result was not saved');
  await page.reload();
  await page.waitForFunction(() => window.deepwake?.inspect());
  if (JSON.stringify(records) !== JSON.stringify((await driver.inspect()).records)) throw Error('Records changed on reload');
  return { ordinary, full, records, resultPanelScroll: scroll, pageErrors: errors };
};

function run(sessionName, args) {
  const result = spawnSync('playwright-cli', [`-s=${sessionName}`, ...args], { cwd: temp, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error(`Playwright CLI exited with status ${result.status}`);
}

function browser(sessionName, flags, files) {
  run(sessionName, ['open', checkUrl.href, ...flags]);
  try {
    for (const script of files) run(sessionName, ['run-code', `--filename=${script}`]);
  } finally {
    run(sessionName, ['close']);
  }
}

const checkUrl = new URL(url);
checkUrl.searchParams.set('verify', '');
await Promise.all([
  writeFile(scripts.play, `async page => (${verify})(page, ${runCourse}, ${JSON.stringify(temp)})`, 'utf8'),
  writeFile(scripts.live, `async page => (${liveControls})(page, ${JSON.stringify(url)}, ${JSON.stringify(temp)})`, 'utf8'),
  writeFile(scripts.touch, `async page => (${touchControls})(page, ${JSON.stringify(temp)})`, 'utf8'),
]);
console.log(`Browser scripts and screenshots: ${temp}`);
if (!process.argv.includes('--prepare')) {
  browser(session, [], [scripts.play, scripts.live]);
  browser(`${session}-mobile`, ['--mobile'], [scripts.touch]);
}
