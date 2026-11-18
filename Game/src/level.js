export const STEP = 1 / 120;
export const BODY = { w: .75, h: 1.5 };
export const MOTION = {
  speed: 6.5, carrySpeed: 4.5, groundAccel: 42, airAccel: 28,
  groundBrake: 38, airBrake: 8, gravity: 32, jump: 13, cut: 8.95,
  fall: 24, coyote: .11, buffer: .14, slide: 3, wallX: 7, wallY: 12.5,
  wallLock: .10, dashSpeed: 15, dashTime: .16, dashCooldown: .45,
};
export const RESONANCE = { max: 100, pulse: 35, shield: 50, cooldown: .7, delay: 1.5, regen: 20, radius: 6, waveTime: .35 };

export const REGIONS = [
  { id: 'A', name: 'Buried Workshop', start: -8, end: 56.8, color: '#deac71', bounds: [-7, 57] },
  { id: 'B', name: 'Crystal Reservoir', start: 56.8, end: 114.2, color: '#65d6d4', bounds: [56, 115] },
  { id: 'C', name: 'Silent Foundry', start: 114.2, end: 183.5, color: '#ef9f64', bounds: [113, 184] },
  { id: '↑', name: 'Ascent Shaft', start: 183.5, end: 242, color: '#cfddd6', bounds: [182, 241] },
];
export function regionIndex(x, y = 0) {
  // The reservoir's upper pocket sits above the workshop's last shutter.
  if (x >= 55.4 && x < REGIONS[1].start && y >= 5.3) return 1;
  return x < REGIONS[1].start ? 0 : x < REGIONS[2].start ? 1 : x < REGIONS[3].start ? 2 : 3;
}

// All rectangles are left/bottom anchored. Only these and the dynamic landings
// participate in collision. The scenery is built independently.
let terrainId = 0;
const slab = (x, y, w, h, kind = 'rock') => ({ id: `terrain-${terrainId++}`, x, y, w, h, kind, wall: true });
const deck = (left, right, top, depth = 5, kind = 'rock') => slab(left, top - depth, right - left, depth, kind);
export const TERRAIN = [
  slab(-9, -6, 1, 20), deck(-8, 18, 0, 6),
  deck(-8, 1.5, 3.9, 1.1), deck(9.8, 12.8, .82, .82), deck(13.8, 16.3, 1.3, 1.3),
  deck(18, 19.3, -1.55, 4.45), deck(19.3, 21.6, -2.15, 3.85),
  deck(21.6, 39.5, 0, 5), deck(39.5, 56.8, 0, 5, 'metal'),
  slab(46.65, 4.1, 1.45, 10, 'metal'), slab(55.6, 4.1, 1.2, 5.7, 'metal'),

  deck(56.8, 66, 0, 6), slab(57.7, 1.92, 4.7, 3.38),
  slab(55.4, 5.30, 2.9, 4.5), slab(60.4, 8.25, 1.8, 2.18),
  deck(66, 79.9, 6.6, 9.6), deck(99.3, 114.2, 6.6, 9.6),
  slab(112.65, 10.7, 1.55, 8, 'metal'),
  deck(114.2, 118.4, 5.4, 6, 'metal'), deck(118.4, 122.5, 3.75, 6, 'metal'),
  deck(122.5, 127.8, 1.9, 6, 'metal'),

  deck(127.8, 160.5, 0, 6, 'metal'), deck(160.5, 183.5, 0, 6, 'metal'),
  deck(133.4, 135.65, 2.03, 2.03, 'metal'), deck(159.2, 163.8, 4.6, .62, 'metal'),
  deck(165.45, 171.55, 2.16, .34, 'metal'), slab(171.55, 2.16, .78, 4.6, 'metal'),
  slab(165.45, 5.35, 6.88, .65, 'metal'), slab(172.22, 4.1, 1.05, 12, 'metal'),
  slab(182.15, 4.1, 1.35, 12, 'metal'),

  deck(183.5, 194.25, 0, 6), slab(186.35, 1.92, 4.38, 3.34, 'metal'),
  deck(194.25, 204, 6.2, 9, 'metal'), deck(207.2, 219, 12.35, 3.15, 'metal'),
  slab(226.25, 8.85, 1.35, 19, 'metal'), deck(224.95, 242, 31.1, 3.5, 'surface'),
  slab(241.8, 31.1, 2.0, 7.5, 'surface'),
];
export const SEAMS = [
  { id: 'archive-seam', x: .8, y: 0, w: .63, h: 2.8, kind: 'crystal', transmits: true, hidden: true },
  { id: 'training-seam', x: 25.2, y: 0, w: .55, h: 3.15, kind: 'crystal', transmits: true, hidden: false },
];
export const GATES = [
  { id: 'workshop-shutter', x: 46.9, y: 0, w: .9, h: 4.1, needs: ['socket:workshop', 'relay:A'] },
  { id: 'relay-a-gate', x: 55.85, y: 0, w: .7, h: 4.1, needs: ['relay:A'] },
  { id: 'relay-b-gate', x: 112.97, y: 6.6, w: .67, h: 4.1, needs: ['relay:B'] },
  { id: 'service-shutter', x: 165.52, y: 2.16, w: .63, h: 3.19, needs: ['switch:latch'] },
  { id: 'foundry-shutter', x: 172.49, y: 0, w: .65, h: 4.1, needs: ['switch:latch'] },
  { id: 'ascent-gate', x: 182.56, y: 0, w: .56, h: 4.1, needs: ['relay:C'] },
].map(gate => ({ ...gate, kind: 'gate' }));

export const STATIONS = [
  { id: 'start', x: 4.4, y: 0, name: 'Workshop station' },
  { id: 'after-a', x: 53.65, y: 0, name: 'Relay A station' },
  { id: 'after-b', x: 110.0, y: 6.6, name: 'Relay B station' },
  { id: 'after-c', x: 180.55, y: 0, name: 'Relay C station' },
  { id: 'ascent', x: 185.1, y: 0, name: 'Ascent station' },
];
export const CELLS = [
  { id: 'workshop-cell', type: 'workshop', x: 38.4, y: 0 },
  { id: 'foundry-cell', type: 'foundry', x: 151.15, y: 0 },
];
export const SOCKETS = [
  { id: 'workshop', type: 'workshop', x: 45.35, y: 0, label: 'Shutter socket', lock: 'A' },
  { id: 'counterweight', type: 'foundry', x: 154.38, y: 0, label: 'Counterweight socket' },
  { id: 'foundry', type: 'foundry', x: 174.78, y: 0, label: 'Relay socket', lock: 'C' },
];
export const RELAYS = [
  { id: 'A', x: 51.4, y: 1.25, station: 'after-a', needs: ['socket:workshop'], blocked: 'Power the workshop shutter first' },
  { id: 'B', x: 106.6, y: 7.85, station: 'after-b', needs: ['relay:A', 'switch:bridge'], blocked: 'Start the reservoir crossing first' },
  { id: 'C', x: 178.1, y: 1.25, station: 'after-c', needs: ['relay:B', 'socket:foundry', 'switch:latch'], blocked: 'Supply the foundry relay socket first' },
];
export const SWITCHES = [
  { id: 'bridge', x: 74.35, y: 7.36, action: 'Power crossing platform', notice: 'Crossing platform online' },
  { id: 'latch', x: 161.45, y: 5.36, action: 'Latch upper route', notice: 'Route latched · Move the cell to the relay socket', needs: 'socket:counterweight' },
];

export const PLATFORMS = [
  { id: 'crossing', x: 79.9, y: 6.6, toX: 95.5, toY: 6.6, w: 3.8, travel: 5.25, dwell: 1.85, needs: 'switch:bridge' },
  { id: 'counterweight', x: 155.6, y: 0, toX: 155.6, toY: 4.6, w: 3.6, travel: 2.5, dwell: 1.65, needs: 'socket:counterweight' },
  { id: 'service-lift', x: 204, y: 6.2, toX: 204, toY: 12.35, w: 3.2, travel: 3.2, dwell: 1.75, needs: 'relay:C' },
];
export const MAIN_LIFT = { id: 'main-lift', x: 219, y: 12.35, w: 7.25, h: .5, endY: 31.1, console: 222.5, board: [220.17, 224.7], exitX: 229.35 };
export const VENTS = [
  { id: 'foundry-vent-west', x: 138.68, y: 0, w: 1.13, h: 2.37, idle: 2.25, warning: .85, active: 1.05 },
  { id: 'foundry-vent-east', x: 147.55, y: 0, w: 1.2, h: 2.77, idle: 2.9, warning: .8, active: 1.15 },
  { id: 'ascent-vent', x: 215.03, y: 12.35, w: 1.32, h: 2.82, idle: 2.4, warning: .95, active: 1.05 },
];
export const DEEP_WATER = [{ x: 79.9, w: 19.4, y: -4.95 }];

export const ENEMIES = [
  { id: 'skitter', type: 'skitter', x: 32.85, y: 0, min: 29.4, max: 35.6, dir: -1 },
  { id: 'prism', type: 'drone', x: 103.7, y: 7.57, min: 101.55, max: 105.1, dir: -1 },
  { id: 'sentinel', type: 'sentinel', x: 142.45, y: 1.42, dir: -1 },
  { id: 'ascent-prism', type: 'drone', x: 211.7, y: 14.28, min: 209.9, max: 213.85, dir: -1 },
];

export const ARCHIVES = [
  { id: 'maintenance', x: -3.9, y: .65, name: 'Last inspection', text: 'The tremors keep interrupting my rounds. I left the little ceramic unit powered. If the station goes quiet, something should still be listening.' },
  { id: 'reservoir', x: 56.65, y: 10.45, name: 'Reservoir transmission', text: 'There is a current in the crystal that survives the blackout. I heard the surface beacon in it this morning. The signal was faint, but it was real.' },
  { id: 'surface', x: 168.6, y: 2.86, name: 'Surface clearance', text: 'The final lift has clearance. Leave the shutters latched and follow the conduit up. If you reach the terrace, look east. The sun will be there.' },
];
export const CACHES = [
  { id: 'bench-cache', x: -5.9, y: .36 },
  { id: 'crystal-cache', x: 61.55, y: 10.79 },
  { id: 'service-cache', x: 170.18, y: 2.52 },
];
export const INSCRIPTIONS = [
  { x: 8.5, y: 2.65, text: 'MAINTENANCE', tint: 'amber' },
  { x: 41.85, y: 2.25, text: 'A / CIRCUIT', tint: 'amber' },
  { x: 62.65, y: 5.95, text: '↑', tint: 'teal' },
  { x: 75.1, y: 9.3, text: 'B / ACCESS', tint: 'teal' },
  { x: 130.4, y: 2.65, text: 'C / FOUNDRY', tint: 'amber' },
  { x: 156.4, y: 3.4, text: '↑ LATCH', tint: 'amber' },
  { x: 190.35, y: 5.1, text: '↑ ASCENT', tint: 'teal' },
];
export const GUIDANCE = [
  { x: [3, 8.2], y: [-.1, 2.5], key: '← →', text: 'Move east', touch: 'Hold a direction to move' },
  { x: [8.2, 22.6], y: [-.2, 3.4], key: 'SPACE', text: 'Hold for a higher jump', touch: 'Hold Jump for more height' },
  { x: [22.6, 25.2], y: [-.2, 2], key: 'SHIFT', text: 'Dash through cracked amber', touch: 'Dash through cracked amber' },
  { x: [26.3, 31.15], y: [-.3, 2.8], key: 'Q', text: 'Pulse to stun the skitter', touch: 'Pulse to stun the skitter' },
  { x: [48.2, 53], y: [-.1, 2], key: 'Q', text: 'Pulse Relay A', touch: 'Pulse Relay A', until: 'relay:A' },
  { x: [57.0, 66.1], y: [-.1, 6.5], key: 'SPACE', text: 'Hold toward a wall, then jump away', touch: 'Hold toward a wall, then tap Jump' },
  { x: [60.8, 68.5], y: [6.5, 9.5], key: 'Q', text: 'Echo for a side passage', touch: 'Pulse to find a side passage' },
  { x: [76.0, 81.4], y: [6.4, 9.5], text: 'Board at the dock when the platform stops', needs: 'switch:bridge' },
  { x: [103.8, 108.4], y: [6.4, 10.2], key: 'Q', text: 'Pulse Relay B', touch: 'Pulse Relay B', until: 'relay:B' },
  { x: [130.5, 137.1], y: [0, 4.7], text: 'Take cover · Watch the beam lane' },
  { x: [155.6, 159.2], y: [-.1, 4.5], text: 'Ride the counterweight to the latch', needs: 'socket:counterweight', until: 'switch:latch' },
  { x: [163.8, 172.5], y: [0, 4.7], key: 'Q', text: 'Echo to trace the service conduit', touch: 'Pulse to trace the service conduit', needs: 'switch:latch' },
  { x: [175.8, 179.7], y: [-.1, 2.5], key: 'Q', text: 'Pulse Relay C', touch: 'Pulse Relay C', until: 'relay:C' },
  { x: [186, 194.3], y: [0, 6.1], key: 'SPACE', text: 'Wall-jump toward the service lift', touch: 'Wall-jump toward the service lift' },
];
