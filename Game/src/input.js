const KEYS = {
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  Space: 'jump', KeyZ: 'jump', ShiftLeft: 'dash', ShiftRight: 'dash', KeyX: 'dash',
  KeyQ: 'pulse', KeyE: 'interact', KeyR: 'retry', KeyP: 'pause', Escape: 'escape', Enter: 'confirm',
};
const ABILITY = new Set(['jump', 'dash', 'pulse', 'interact', 'retry']);

export class Input {
  constructor(buttons, controls) {
    this.buttons = Array.from(buttons);
    this.controls = controls;
    this.keys = new Map();
    this.pointers = new Map();
    this.edges = new Set();
    window.addEventListener('keydown', event => this.keyDown(event));
    window.addEventListener('keyup', event => {
      const action = KEYS[event.code];
      if (action) this.keys.delete(event.code);
    });
    window.addEventListener('blur', () => this.clear());

    for (const button of this.buttons) {
      button.addEventListener('pointerdown', event => this.pointerDown(event, button));
      button.addEventListener('pointerup', event => this.pointerUp(event));
      for (const type of ['pointercancel', 'lostpointercapture']) {
        button.addEventListener(type, event => {
          if (this.pointers.has(event.pointerId)) this.clear();
        });
      }
      button.addEventListener('contextmenu', event => event.preventDefault());
    }
  }

  keyDown(event) {
    const action = KEYS[event.code];
    if (!action || event.altKey || event.metaKey || event.ctrlKey) return;
    const button = event.target instanceof Element && event.target.closest('button, summary, input');
    if (button && !button.matches('[data-control]') && (action === 'confirm' || action === 'jump')) {
      if (event.repeat) event.preventDefault();
      return;
    }
    event.preventDefault();
    if (event.repeat || this.keys.has(event.code)) return;
    if (action === 'confirm' || action === 'pause' || action === 'escape') {
      this.controls.command(action);
      return;
    }
    if (!this.controls.active()) return;
    const held = this.held(action);
    this.keys.set(event.code, action);
    if (!held && ABILITY.has(action)) this.edges.add(action);
  }

  pointerDown(event, button) {
    if (!this.controls.active() || (event.button !== 0 && event.pointerType === 'mouse')) return;
    event.preventDefault();
    const action = button.dataset.control;
    const held = this.held(action);
    this.pointers.set(event.pointerId, { button, action });
    try { button.setPointerCapture(event.pointerId); } catch { /* Synthetic events may have no capture target. */ }
    if (!held && ABILITY.has(action)) this.edges.add(action);
    button.classList.add('held');
  }

  pointerUp(event) {
    const entry = this.pointers.get(event.pointerId);
    if (!entry) return;
    this.pointers.delete(event.pointerId);
    if (![...this.pointers.values()].some(item => item.button === entry.button)) entry.button.classList.remove('held');
  }

  held(action) {
    return [...this.keys.values()].includes(action) || [...this.pointers.values()].some(item => item.action === action);
  }

  next() {
    const state = { left: this.held('left'), right: this.held('right'), jumpHeld: this.held('jump') };
    for (const edge of this.edges) state[edge] = true;
    this.edges.clear();
    return state;
  }

  clear() {
    this.keys.clear();
    this.edges.clear();
    const pointers = [...this.pointers];
    this.pointers.clear();
    for (const [id, entry] of pointers) {
      if (entry.button.hasPointerCapture(id)) entry.button.releasePointerCapture(id);
    }
    for (const button of this.buttons) button.classList.remove('held');
  }
}
