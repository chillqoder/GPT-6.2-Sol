import { ARCHIVES, CACHES, DEEP_WATER, MAIN_LIFT, REGIONS, RELAYS, SOCKETS, STATIONS, SWITCHES } from './level.js';
import { clamp, mix, rayFraction } from './geometry.js';

export class CanvasView {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.mode = 'canvas';
    this.version = -1;
  }

  frame(game, dt) {
    if (!this.ctx) return;
    const c = this.ctx;
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (!width || !height) return;
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const sizeX = Math.round(width * dpr);
    const sizeY = Math.round(height * dpr);
    if (this.canvas.width !== sizeX || this.canvas.height !== sizeY) {
      this.canvas.width = sizeX;
      this.canvas.height = sizeY;
    }
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const p = game.player;
    const title = game.state === 'title';
    const portrait = width < height;
    const dawn = game.lift.dawn;
    const scale = height / Math.max(portrait ? 11.8 : 10.4, 5.6 * height / width);
    const x = title ? p.x - (portrait ? 0 : width * .20 / scale) : p.x + (portrait ? .82 : 1.82) * p.face;
    const y = title ? portrait ? -1.27 : 3.19 : Math.max(1.8, p.y + 1.82);
    if (this.version !== game.cameraVersion) {
      this.version = game.cameraVersion;
      this.x = x;
      this.y = y;
    } else if (game.state !== 'paused') {
      this.x = mix(this.x, x, 1 - Math.exp(-dt * 7));
      this.y = mix(this.y, y, 1 - Math.exp(-dt * 6));
    }
    const px = x => width / 2 + (x - this.x) * scale;
    const py = y => height / 2 - (y - this.y) * scale;
    const rect = (x, y, w, h, color) => {
      if (px(x + w) < 0 || px(x) > width || py(y) < 0 || py(y + h) > height) return;
      c.fillStyle = color;
      c.fillRect(px(x), py(y + h), w * scale, h * scale);
    };
    const bg = c.createLinearGradient(0, 0, 0, height);
    bg.addColorStop(0, dawn > .5 ? '#a99284' : ['#182830', '#183039', '#2d272c', '#202c34'][game.region]);
    bg.addColorStop(1, dawn > .5 ? '#d3a98c' : '#101923');
    c.fillStyle = bg;
    c.fillRect(0, 0, width, height);
    for (let x = Math.floor((this.x - width / scale) / 3.6) * 3.6; x < this.x + width / scale; x += 3.6) {
      const shift = clamp(this.x * .039, -1, 5);
      rect(x + shift, -8, 2.0 + Math.abs(Math.sin(x)) * 1.36, 22 + Math.sin(x * 2) * 2.3, x % 2 ? '#26394255' : '#47585a30');
      rect(x + shift + .1, 2 + Math.sin(x * 3), 1.8, .19, '#687d7f45');
    }
    for (const water of DEEP_WATER) {
      rect(water.x, water.y - .37, water.w, .43, '#326670');
      rect(water.x, water.y + .01, water.w, .057, '#6db8bd');
    }
    for (const solid of game.solids) {
      if (solid.id === MAIN_LIFT.id && (game.state === 'liftSequence' || game.state === 'complete')) continue;
      const stone = solid.kind !== 'metal';
      const color = solid.kind === 'crystal' ? '#986745' : solid.kind === 'gate' ? '#596469'
        : solid.kind === 'surface' ? '#877265' : stone ? '#43545e' : '#485354';
      rect(solid.x, solid.y, solid.w, solid.h, color);
      rect(solid.x, solid.y + solid.h - .14, solid.w, Math.min(solid.h, .14),
        solid.kind === 'crystal' ? '#daa566' : stone ? '#89a2a3' : '#9b9c8c');
      if (px(solid.x + solid.w) > 0 && px(solid.x) < width) {
        for (let x = .98; x < solid.w; x += .98) rect(solid.x + x, solid.y, .022, solid.h - .15, '#29383c');
      }
    }
    if (game.state === 'liftSequence' || game.state === 'complete') {
      rect(MAIN_LIFT.x, game.lift.y - .5, MAIN_LIFT.w, .5, '#727b77');
      rect(MAIN_LIFT.x, game.lift.y, MAIN_LIFT.w, game.lift.barrier * .52, '#947864');
    }
    for (const place of STATIONS) {
      rect(place.x - .49, place.y, .98, 1.23, '#4d6468');
      rect(place.x - .32, place.y + .65, .64, .23, '#8cd4c8');
      rect(place.x - .7, place.y + .035, 1.4, .10, '#6fb0a9');
    }
    for (const relay of RELAYS) {
      const tint = game.world.relays.includes(relay.id) ? '#ffd290' : '#a1e7d9';
      rect(relay.x - .5, relay.y - 1.25, 1, 1.72, '#535c60');
      rect(relay.x - .22, relay.y - .22, .44, .44, tint);
    }
    for (const socket of SOCKETS) {
      rect(socket.x - .37, socket.y, .74, .24, '#626969');
      rect(socket.x - .33, socket.y + .24, .66, .61, '#735c4b');
      rect(socket.x - .17, socket.y + .5, .34, .12, game.powered(`socket:${socket.id}`) ? '#ffce81' : '#b0845a');
    }
    for (const change of SWITCHES) {
      rect(change.x - .18, change.y - .76, .36, .76, '#536169');
      rect(change.x - .28, change.y - .08, .56, .17, game.world.switches.includes(change.id) ? '#89d7cb' : '#deb17b');
    }
    for (const [list, taken] of [[ARCHIVES, game.world.archives], [CACHES, game.world.caches]]) {
      for (const item of list) if (!taken.includes(item.id)) {
        rect(item.x - .23, item.y - .2, .46, .42, '#637578');
        rect(item.x - .14, item.y -.019, .28, .14, list === ARCHIVES ? '#9be2d8' : '#f5c483');
      }
    }
    for (const cell of game.world.cells) {
      const carry = game.world.carry === cell.id;
      const x = carry ? p.x + p.face * .47 : cell.x;
      const y = carry ? p.y + .48 : cell.y + (cell.socket ? .24 : 0);
      rect(x - .26, y, .52, .53, '#9c764f');
      rect(x - .23, y + .12, .46, .25, '#f2be74');
      rect(x - .12, y + .52, .24, .079, '#8d9590');
    }
    for (const vent of game.vents) {
      rect(vent.x, vent.y - .06, vent.w, .08, vent.state === 'warning' ? '#ee985e' : '#60686b');
      if (vent.state === 'active') rect(vent.x, vent.y, vent.w, vent.h, '#ef7449aa');
    }
    for (const enemy of game.enemies) {
      if (enemy.type === 'sentinel' && ['warning', 'firing'].includes(enemy.state)) {
        const beam = game.beam(enemy);
        rect(beam.x, beam.y + .07, beam.w, enemy.state === 'warning' ? .036 : beam.h, '#fb8656');
      }
      if (enemy.type === 'drone' && enemy.state === 'aim') {
        const f = rayFraction(enemy.x, enemy.y, enemy.aimX * 8.4, enemy.aimY * 8.4, game.solids);
        c.strokeStyle = '#eaab71';
        c.beginPath();
        c.moveTo(px(enemy.x), py(enemy.y));
        c.lineTo(px(enemy.x + enemy.aimX * 8.4 * f), py(enemy.y + enemy.aimY * 8.4 * f));
        c.stroke();
      }
      const y = enemy.type === 'skitter' ? enemy.y : enemy.y - .35;
      const h = enemy.type === 'skitter' ? .49 : enemy.type === 'drone' ? .62 : .83;
      const w = enemy.type === 'skitter' ? 1.04 : .77;
      rect(enemy.x - w / 2, y, w, h, enemy.state === 'disabled' ? '#424d52' : '#827362');
      rect(enemy.x - .19, y + h * .57, .38, .1, enemy.state === 'stunned' ? '#96dcd4'
        : enemy.state === 'disabled' ? '#626869' : '#f59d61');
    }
    for (const bolt of game.bolts) rect(bolt.x - .095, bolt.y - .07, .19, .14, '#ffab76');
    if (game.pulse) {
      const { x, y, radius } = game.pulse;
      c.strokeStyle = '#99decb';
      c.lineWidth = 1.3;
      c.beginPath();
      for (let i = 0; i <= 72; i++) {
        const a = i * Math.PI / 36;
        const dx = Math.cos(a) * radius;
        const dy = Math.sin(a) * radius;
        const f = rayFraction(x, y, dx, dy, game.solids, null, true);
        if (f < .999 || !i) c.moveTo(px(x + dx * f), py(y + dy * f));
        else c.lineTo(px(x + dx), py(y + dy));
      }
      c.stroke();
    }

    const color = REGIONS[game.region].color;
    const t = game.localTime;
    const walking = Math.min(Math.abs(p.vx) / 6.5, 1);
    const stride = Math.sin(t * 21) * .15 * walking;
    const heightFactor = game.state === 'shutdown' ? Math.max(.34, 1 - game.stateTime * 1.45) : 1;
    const tilt = p.dashTime ? p.face * .17 : 0;
    const draw = (x, y, w, h, shade) => rect(p.x + x + y * tilt, p.y + y * heightFactor, w, h * heightFactor, shade);
    draw(-.28 + stride, .03, .235, .145, '#35424a');
    draw(.045 - stride, .03, .235, .145, '#27353e');
    draw(-.245 + stride * .32, .16, .146, .43, '#899896');
    draw(.09 - stride * .32, .16, .146, .43, '#899896');
    draw(-.226, .528, .452, .463, '#c7cdc4');
    draw(-.086, .661, .172, .17, '#a3e8d9');
    draw(-.329, .62, .09, .329, '#879390');
    draw(.239, .62, .09, .329, '#b3bdb6');
    draw(-.326, 1.041, .652, .41, '#e0e0cf');
    draw(-.283, 1.136, .566, .20, '#233138');
    draw(p.face * .115 - .057, 1.185, .114, .102, '#f5be72');
    draw(-.16, 1.445, .046, .158, color);
  }
}
