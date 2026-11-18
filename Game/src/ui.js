import { ARCHIVES, REGIONS } from './level.js';
import { formatTime } from './records.js';

const byId = id => document.getElementById(id);
const setText = (node, text) => { if (node.textContent !== text) node.textContent = text; };
const shown = (node, value) => { node.hidden = !value; };
const ROWS = (dl, pairs) => {
  dl.replaceChildren(...pairs.map(([term, value]) => {
    const row = document.createElement('div');
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    dt.textContent = term;
    dd.textContent = value;
    row.append(dt, dd);
    return row;
  }));
};

export class GameUI {
  constructor(settings, actions) {
    this.settings = settings;
    this.actions = actions;
    this.dialog = '';
    this.previous = '';
    this.touchMedia = matchMedia('(pointer: coarse)');
    this.useTouch = this.touchMedia.matches;
    this.touchMedia.addEventListener('change', event => { this.useTouch = event.matches; });
    window.addEventListener('pointerdown', event => {
      if (event.pointerType === 'touch') this.useTouch = true;
    }, { passive: true });
    this.nodes = Object.fromEntries([
      'shell', 'title', 'begin', 'pause', 'mute', 'hud', 'sector', 'region', 'integrity', 'resonance', 'resonance-value',
      'resonance-group', 'relays', 'archives', 'clock', 'carrying', 'prompt', 'prompt-layer', 'prompt-key',
      'prompt-text', 'toast', 'fragment', 'fragment-title', 'fragment-text', 'dismiss-fragment', 'transition',
      'transition-kicker', 'transition-title', 'touch', 'modal-layer', 'pause-panel', 'pause-summary', 'pause-archive-count',
      'archive-panel', 'archive-list', 'guide-panel', 'complete-panel', 'result-type', 'result-stats', 'records',
      'resume', 'retry', 'restart', 'motion', 'again', 'guide', 'pause-guide', 'close-guide',
    ].map(id => [id, byId(id)]));
    const n = this.nodes;
    const click = (id, action) => n[id].addEventListener('click', action);
    click('begin', actions.start);
    click('again', actions.start);
    click('pause', actions.pause);
    click('resume', actions.pause);
    click('retry', actions.retry);
    click('restart', actions.start);
    click('mute', actions.mute);
    click('guide', actions.guide);
    click('pause-guide', actions.guide);
    click('close-guide', actions.closeGuide);
    click('dismiss-fragment', actions.dismiss);
    n.motion.checked = settings.motion;
    n.motion.addEventListener('change', () => actions.motion(n.motion.checked));
    this.touchButtons = [...n.touch.querySelectorAll('button')];
    this.integrityBars = [...n.integrity.children];
    this.relayBars = [...n.relays.children];
    window.addEventListener('keydown', event => this.trap(event));
  }

  trap(event) {
    if (event.code !== 'Tab' || !this.activeDialog) return;
    const focusables = [...this.activeDialog.querySelectorAll('button, input, summary')]
      .filter(node => !node.disabled && node.getClientRects().length);
    if (!focusables.length) return;
    const end = event.shiftKey ? focusables[0] : focusables.at(-1);
    const next = event.shiftKey ? focusables.at(-1) : focusables[0];
    if (document.activeElement === end || !this.activeDialog.contains(document.activeElement)) {
      event.preventDefault();
      next.focus();
    }
  }

  confirmed(state) {
    if (this.dialog === 'guide') this.actions.closeGuide();
    else if (state === 'title' || state === 'complete') this.actions.start();
    else if (state === 'paused') this.actions.pause();
  }

  update(game, records) {
    const n = this.nodes;
    const state = game.state;
    const play = state === 'play';
    const title = state === 'title';
    const paused = state === 'paused';
    const complete = state === 'complete';
    const guide = this.dialog === 'guide';
    const transition = ['relayActivation', 'shutdown', 'reboot'].includes(state);
    const hud = !title && !complete && state !== 'liftSequence';
    const touch = this.useTouch;
    const carrying = Boolean(game.world.carry);
    const previous = this.previous;
    if (previous !== state) {
      n.shell.dataset.state = state;
      this.previous = state;
    }
    n.shell.classList.toggle('using-touch', touch);
    n.shell.dataset.carrying = String(carrying);
    shown(n.title, title);
    shown(n.pause, play || paused);
    n.pause.setAttribute('aria-label', paused ? 'Resume expedition' : 'Pause expedition');
    shown(n.hud, hud && !guide);
    shown(n.clock, !title);
    shown(n.guide, (title || play || paused) && !guide);
    shown(n.touch, touch && play && !guide);
    shown(n['prompt-layer'], play && !guide);
    shown(n.transition, transition);
    shown(n['modal-layer'], paused || complete || guide);
    shown(n['pause-panel'], paused && !guide);
    shown(n['guide-panel'], guide);
    shown(n['complete-panel'], complete && !guide);
    const dialog = guide ? n['guide-panel'] : paused ? n['pause-panel'] : complete ? n['complete-panel'] : null;
    if (this.activeDialog !== dialog || (previous !== state && play)) {
      this.activeDialog = dialog;
      dialog?.scrollTo(0, 0);
      if (dialog) (guide ? n['close-guide'] : paused ? n.resume : n.again).focus({ preventScroll: true });
      else if (play) this.actions.focus();
    }

    const muted = this.settings.muted;
    n.mute.setAttribute('aria-pressed', String(muted));
    n.mute.setAttribute('aria-label', muted ? 'Unmute audio' : 'Mute audio');
    n.mute.querySelector('use').setAttribute('href', muted ? '#i-muted' : '#i-sound');
    setText(n.mute.querySelector('span'), muted ? 'Sound off' : 'Sound on');
    if (!title) setText(n.clock.querySelector('span'), formatTime(game.time));

    if (hud) {
      const region = REGIONS[game.region];
      n.sector.lastChild.nodeValue = region.id === '↑' ? 'Ascent' : `Sector ${region.id}`;
      n.region.parentNode.style.setProperty('--area', region.color);
      setText(n.region, region.name);
      const p = game.player;
      n.integrity.setAttribute('aria-valuenow', p.integrity);
      this.integrityBars.forEach((bar, index) => bar.classList.toggle('empty', index >= p.integrity));
      const energy = Math.floor(p.energy + .001);
      n.resonance.style.setProperty('--energy', `${p.energy}%`);
      n.resonance.setAttribute('aria-valuenow', energy);
      setText(n['resonance-value'], String(energy));
      n['resonance-group'].classList.toggle('warn', game.notice?.kind === 'energy');
      this.relayBars.forEach((bar, i) => {
        const id = 'ABC'[i];
        const active = game.world.relays.includes(id);
        bar.classList.toggle('active', active);
        bar.setAttribute('aria-label', `Relay ${id} ${active ? 'online' : 'offline'}`);
      });
      setText(n.archives, `${game.world.archives.length} / 3`);
    }

    if (play) {
      const target = game.interaction();
      const guide = game.guidance();
      const useTarget = target && !(target.ref?.id === 'start' && game.time < 1400 && guide);
      const prompt = useTarget ? target.action : touch ? guide?.touch ?? guide?.text : guide?.text;
      const key = useTarget ? touch ? 'Use' : 'E' : touch ? '' : guide?.key;
      shown(n.prompt, Boolean(prompt));
      shown(n['prompt-key'], Boolean(key));
      if (prompt) {
        setText(n['prompt-text'], prompt);
        setText(n['prompt-key'], key ?? '');
      }
      shown(n.carrying, carrying);
      this.touchButtons.forEach(button => {
        button.classList.toggle('restricted', carrying && ['dash', 'pulse'].includes(button.dataset.control));
      });
    }

    const notice = play && game.notice;
    shown(n.toast, Boolean(notice));
    if (notice) {
      setText(n.toast, notice.text);
      n.toast.dataset.kind = notice.kind;
    }
    const fragment = play && game.fragment;
    shown(n.fragment, Boolean(fragment));
    if (fragment) {
      setText(n['fragment-title'], fragment.name);
      setText(n['fragment-text'], fragment.text);
    }
    if (transition) {
      const relay = state === 'relayActivation';
      setText(n['transition-kicker'], relay ? 'Conduit online · Checkpoint secured' : game.failure);
      setText(n['transition-title'], relay ? `Relay ${game.relayFocus.id} online` : 'Rebooting at Station');
    }

    if (paused && previous !== state) {
      setText(n['pause-summary'], `${REGIONS[game.region].name} · ${formatTime(game.time, true)}`);
      setText(n['pause-archive-count'], `${game.world.archives.length} / 3`);
      n['archive-panel'].open = false;
      const fragments = ARCHIVES.filter(archive => game.world.archives.includes(archive.id)).map(archive => {
        const article = document.createElement('article');
        const title = document.createElement('strong');
        const p = document.createElement('p');
        title.textContent = archive.name;
        p.textContent = archive.text;
        article.append(title, p);
        return article;
      });
      if (fragments.length) n['archive-list'].replaceChildren(...fragments);
      else {
        const message = document.createElement('p');
        message.textContent = 'Recovered fragments appear here.';
        n['archive-list'].replaceChildren(message);
      }
    }
    if (complete && previous !== state) {
      const r = game.result;
      setText(n['result-type'], r.archives === 3 ? 'Full archive recovered' : 'Expedition complete');
      ROWS(n['result-stats'], [
        ['Expedition time', formatTime(r.time, true)], ['Recoveries', String(r.recoveries)],
        ['Archives recovered', `${r.archives} / 3`], ['Caches found', String(r.caches)],
        ['Machines disabled', String(r.disabled)], ['Relays online', r.relays.join(' · ')],
      ]);
      ROWS(n.records, [
        ['Best Completion Time', records.time ? formatTime(records.time, true) : '—'],
        ['Best Full-Archive Time', records.full ? formatTime(records.full, true) : '—'],
        ['Fewest Recoveries', records.fewest ? String(records.fewest.count) : '—'],
      ]);
    }
  }
}
