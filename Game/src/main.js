import { Expedition } from './game.js';
import { STEP } from './level.js';
import { ExpeditionAudio } from './audio.js';
import { Input } from './input.js';
import { Records, browserStorage, userSettings } from './records.js';
import { createView } from './render.js';
import { GameUI } from './ui.js';

const storage = browserStorage();
const preferences = userSettings(storage);
const records = new Records(storage);
const game = new Expedition();
const audio = new ExpeditionAudio(preferences.settings.muted);
const canvas = document.getElementById('view');
canvas.tabIndex = -1;
const render = createView(canvas);
const verification = new URLSearchParams(location.search).has('verify');
let recorded = null;
let inputVersion = game.inputVersion;
let accumulator = 0;

const actions = {
  start: () => {
    audio.unlock();
    audio.cancel();
    game.restart();
    recorded = null;
    ui.dialog = '';
    present(0);
  },
  pause: () => {
    if (ui.dialog === 'guide') return actions.closeGuide();
    if (game.pause()) present(0);
  },
  retry: () => {
    if (game.state === 'paused') game.pause();
    if (game.beginRecovery('Checkpoint retry')) present(0);
  },
  mute: () => {
    audio.unlock();
    preferences.settings.muted = !preferences.settings.muted;
    audio.mute(preferences.settings.muted);
    preferences.save();
    present(0);
  },
  guide: () => {
    if (game.state === 'play') game.pause();
    if (game.state !== 'title' && game.state !== 'paused') return;
    ui.dialog = 'guide';
    input.clear();
    present(0);
  },
  closeGuide: () => {
    if (!ui.dialog) return;
    ui.dialog = '';
    present(0);
    if (game.state === 'title') document.getElementById('guide').focus({ preventScroll: true });
  },
  motion: enabled => {
    preferences.settings.motion = enabled;
    preferences.save();
  },
  dismiss: () => {
    game.fragment = null;
    render.focus();
    present(0);
  },
  focus: () => render.focus(),
};
const ui = new GameUI(preferences.settings, actions);
const input = new Input(ui.touchButtons, {
  active: () => game.state === 'play' && !ui.dialog,
  command: action => {
    if (action === 'confirm') ui.confirmed(game.state);
    else actions.pause();
  },
});

function transitions() {
  if (inputVersion !== game.inputVersion) {
    inputVersion = game.inputVersion;
    input.clear();
    accumulator = 0;
  }
  if (game.state === 'complete' && game.result && recorded !== game.result) {
    recorded = game.result;
    records.commit(recorded);
  }
}

function present(dt) {
  transitions();
  audio.tick(game.state, game.region, game.takeEvents(), document.hidden);
  render.frame(game, dt, preferences.settings.motion);
  ui.update(game, records.best);
}

function oneTick() {
  game.step(input.next());
  transitions();
}

window.addEventListener('pointerdown', () => audio.unlock(), { passive: true });
window.addEventListener('keydown', event => { if (!event.repeat) audio.unlock(); });
window.addEventListener('blur', () => {
  if (game.state === 'play') actions.pause();
});
document.addEventListener('visibilitychange', () => {
  accumulator = 0;
  input.clear();
  if (document.hidden) {
    audio.cancel();
    if (game.state === 'play') actions.pause();
  }
});

let lastTime;
function frame(now) {
  const dt = lastTime === undefined ? 0 : Math.min(.1, (now - lastTime) / 1000);
  lastTime = now;
  if (!document.hidden && !verification) {
    if (game.state !== 'paused' && game.state !== 'title' && game.state !== 'complete') {
      accumulator = Math.min(accumulator + dt, .1);
      while (accumulator >= STEP) {
        accumulator -= STEP;
        oneTick();
      }
    }
    present(dt);
  }
  requestAnimationFrame(frame);
}

window.deepwake = Object.freeze({
  inspect: () => ({
    ...game.inspect(), renderer: render.mode, audio: audio.inspect(), records: structuredClone(records.best),
  }),
  ...(verification ? {
    // Run the real input queue and serve the same frame used during play.
    advance(ticks = 1) {
      const count = Math.min(1500, Math.max(0, Math.floor(ticks)));
      for (let i = 0; i < count; i++) oneTick();
      present(Math.max(STEP, count * STEP));
      return game.inspect();
    },
  } : {}),
});
present(0);
if (verification) window.addEventListener('resize', () => present(0));
requestAnimationFrame(frame);
