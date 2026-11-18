export async function liveControls(page, url, output) {
  const assert = (value, message) => { if (!value) throw Error(message); };
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.addInitScript(() => {
    const Native = window.AudioContext;
    if (!Native) return;
    window.AudioContext = class extends Native {
      constructor(...args) {
        super(...args);
        const analyser = this.createAnalyser();
        analyser.fftSize = 1024;
        const originalConnect = AudioNode.prototype.connect;
        AudioNode.prototype.connect = function (target, ...ports) {
          if (this.context === analyser.context && target === analyser.context.destination) {
            originalConnect.call(this, analyser);
          }
          return originalConnect.call(this, target, ...ports);
        };
        window.__audioRms = () => {
          const samples = new Float32Array(analyser.fftSize);
          analyser.getFloatTimeDomainData(samples);
          return Math.sqrt(samples.reduce((sum, sample) => sum + sample ** 2, 0) / samples.length);
        };
      }
    };
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(url);
  await page.waitForFunction(() => window.deepwake);
  const read = () => page.evaluate(() => window.deepwake.inspect());
  const wait = async (condition, label) => {
    try { await page.waitForFunction(condition, undefined, { timeout: 6500 }); }
    catch {
      const { state, audio, player, time } = await read();
      throw Error(`${label}, state=${state}, time=${time}, x=${player.x.toFixed(2)}, audio=${JSON.stringify(audio)}`);
    }
  };
  assert((await read()).audio.context === 'idle', 'Audio initialized before a gesture');
  await page.keyboard.down('Enter');
  await page.keyboard.down('Enter');
  await page.keyboard.up('Enter');
  await wait(() => window.deepwake.inspect().state === 'play', 'Title confirmation');
  await wait(() => window.deepwake.inspect().audio.context === 'running', 'Gesture unlocked audio');
  await wait(() => window.__audioRms?.() > .001, 'Initial audio signal');
  const measuredRms = await page.evaluate(() => window.__audioRms());

  await page.keyboard.down('ArrowRight');
  await wait(() => window.deepwake.inspect().player.x >= 5.75, 'Live RAF movement');
  await page.keyboard.press('Escape');
  const paused = await read();
  assert(paused.state === 'paused', 'Pause key');
  await page.waitForTimeout(220);
  const frozen = await read();
  assert(frozen.time === paused.time && frozen.player.x === paused.player.x, 'Pause failed to freeze world');
  await wait(() => window.__audioRms() < .0002, 'Paused audio signal');
  await page.screenshot({ path: `${output}/pause-desktop.png` });
  await page.keyboard.press('Enter');
  await wait(() => window.deepwake.inspect().state === 'play', 'Resume or reboot completed');
  await page.waitForTimeout(200);
  const released = await read();
  assert(released.player.x - paused.player.x < .59, 'Movement remained held after pause');
  await page.keyboard.up('ArrowRight');

  await page.getByRole('button', { name: 'Mute audio' }).click();
  await wait(() => window.deepwake.inspect().audio.muted && window.__audioRms() < .0002, 'Muted audio signal');
  await page.getByRole('button', { name: 'Unmute audio' }).click();
  await wait(() => window.__audioRms() > .001, 'Unmuted audio signal');

  await page.keyboard.down('KeyD');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  assert((await read()).state === 'paused', 'Focus loss did not pause');
  await page.keyboard.up('KeyD');
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  const hiddenTriggered = await page.evaluate(() => {
    // Chromium headless keeps tabs visible. Exercise the page visibility handler.
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
    const state = window.deepwake.inspect().state;
    delete document.hidden;
    document.dispatchEvent(new Event('visibilitychange'));
    return state;
  });
  assert(hiddenTriggered === 'paused', 'Visibility handler did not pause and clear inputs');
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  const timeBefore = (await read()).time;
  await page.keyboard.press('KeyR');
  await page.getByText('Rebooting at Station').waitFor({ state: 'visible' });
  await wait(() => window.deepwake.inspect().state === 'play', 'Resume or reboot completed');
  const retried = await read();
  assert(retried.recoveries === 1 && retried.time >= timeBefore && Math.abs(retried.player.x - 4.4) < .01, 'Checkpoint retry');
  await page.getByRole('button', { name: 'Pause expedition' }).click();
  await page.locator('#motion').check();
  await page.getByRole('button', { name: 'Restart Expedition' }).click();
  const restarted = await read();
  assert(restarted.recoveries === 0 && restarted.world.relays.length === 0 && restarted.time < 300, 'Full restart did not clear run');

  // Exercise the canvas-only renderer and audio/storage rejection on a fresh page.
  await page.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return type.includes('webgl') ? null : get.call(this, type, ...args);
    };
    Object.defineProperty(window, 'AudioContext', { value: class { constructor() { throw Error('Audio disabled'); } } });
    Object.defineProperty(window, 'localStorage', { get() { throw Error('Storage disabled'); } });
  });
  const verify = new URL(url);
  verify.searchParams.set('verify', '');
  await page.goto(verify.href);
  await wait(() => window.deepwake?.inspect().renderer === 'canvas', 'Canvas fallback');
  await page.getByRole('button', { name: 'Begin Expedition' }).click();
  await page.keyboard.down('ArrowRight');
  await page.evaluate(() => window.deepwake.advance(38));
  await page.keyboard.up('ArrowRight');
  assert((await read()).player.x > 5.5, 'Canvas fallback failed to play');
  assert(errors.length === 0, errors.join('\n'));
  return { rendererFallback: 'canvas', measuredAudioRms: measuredRms.toFixed(5), keyboardPauseRetryRestart: true, visibilityHandler: true, pageErrors: errors };
}

export async function touchControls(page, output) {
  const assert = (value, message) => { if (!value) throw Error(message); };
  const read = () => page.evaluate(() => window.deepwake.inspect());
  const advance = n => page.evaluate(n => window.deepwake.advance(n), n);
  const viewport = { width: 393, height: 852 };
  await page.setViewportSize(viewport);
  await page.waitForFunction(() => window.deepwake);
  await page.screenshot({ path: `${output}/title-portrait.png` });
  await page.getByRole('button', { name: 'Begin Expedition' }).tap();
  const session = await page.context().newCDPSession(page);
  const center = async (selector, id) => {
    const rect = await page.locator(selector).boundingBox();
    assert(rect && rect.width >= 37 && rect.x >= 0 && rect.x + rect.width <= viewport.width, `Touch button out of bounds: ${selector}`);
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, id };
  };
  const right = await center('[data-control="right"]', 1);
  const jump = await center('[data-control="jump"]', 2);
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [right, jump] });
  await advance(31);
  const airborne = await read();
  assert(airborne.player.x > 4.9 && airborne.player.y > 1.6, 'Simultaneous touch movement and jump failed');
  await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await advance(32);
  const cancelled = await read();
  assert(cancelled.player.vx < airborne.player.vx, 'Cancelled pointer left held movement');
  await page.screenshot({ path: `${output}/play-portrait.png` });

  viewport.width = 812;
  viewport.height = 375;
  await page.setViewportSize(viewport);
  await page.waitForTimeout(100);
  for (const control of ['left', 'right', 'jump', 'dash', 'pulse', 'interact']) {
    const point = await center(`[data-control="${control}"]`, 1);
    assert(point.y > 220 && point.y < 351, `Landscape control left its safe area: ${control}`);
  }
  await page.screenshot({ path: `${output}/play-landscape.png` });
  await page.getByRole('button', { name: 'Pause expedition' }).tap();
  await page.getByRole('heading', { name: 'Expedition Paused' }).waitFor({ state: 'visible' });
  return { testedViewports: ['393×852', '812×375'], simultaneousJumpAndMove: true, pointerCancellation: true, landscapePause: true };
}
