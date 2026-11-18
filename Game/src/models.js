import * as T from '../vendor/three.module.min.js';
import { MAIN_LIFT } from './level.js';
import { block, glow, sign } from './scenery.js';

const colors = {
  ceramic: '#d9ded3', light: '#eee9d8', dark: '#202a31', charcoal: '#34424a', steel: '#52616a', edge: '#85908e',
  rust: '#9a6047', amber: '#e6a656', lens: '#ffcf75', teal: '#83dfd0', dullTeal: '#48847f',
  ice: '#adf0e4', red: '#f58156', unlit: '#5f605d', deep: '#182328', bronze: '#82664e',
};
const illuminated = new Set(['lens', 'teal', 'ice', 'red']);
export const MATERIALS = Object.fromEntries(Object.entries(colors).map(([name, color]) => [
  name, illuminated.has(name) ? new T.MeshBasicMaterial({ color }) : new T.MeshLambertMaterial({ color }),
]));

export const part = (root, key, x, y, z, w, h, d) => block(root, MATERIALS[key], x, y, z, w, h, d);
const pivot = (root, x, y, z) => {
  const group = new T.Group();
  group.position.set(x, y, z);
  root.add(group);
  return group;
};

export function makeRobot(root) {
  const node = pivot(root, 0, 0, 0);
  const hips = pivot(node, 0, .56, 0);
  const torso = pivot(hips, 0, .02, 0);
  part(torso, 'charcoal', 0, .05, 0, .43, .16, .30);
  part(torso, 'ceramic', 0, .29, 0, .49, .39, .37);
  part(torso, 'light', 0, .46, .02, .43, .09, .37);
  part(torso, 'dark', 0, .27, .194, .29, .244, .03);
  part(torso, 'dullTeal', .014, .272, .218, .19, .174, .04);
  const chest = part(torso, 'teal', .014, .272, .245, .117, .105, .02);
  part(torso, 'ice', .014, .273, .258, .045, .062, .016);
  part(torso, 'bronze', -.08, .115, -.24, .36, .36, .14);
  part(torso, 'charcoal', 0, .54, 0, .24, .14, .24);

  const head = pivot(torso, 0, .70, .014);
  part(head, 'ceramic', 0, .02, 0, .683, .39, .408);
  part(head, 'light', -.02, .239, 0, .56, .083, .355);
  part(head, 'light', -.023, .148, .016, .651, .13, .401);
  part(head, 'edge', -.008, -.201, -.002, .54, .089, .35);
  part(head, 'dark', .006, .036, .215, .567, .286, .042);
  part(head, 'steel', 0, -.105, .246, .53, .022, .021);
  part(head, 'bronze', .119, .037, .249, .213, .178, .049);
  const lens = part(head, 'lens', .132, .04, .282, .116, .101, .036);
  part(head, 'light', .147, .06, .305, .031, .03, .013);
  part(head, 'steel', -.145, .044, .247, .158, .065, .022);
  part(head, 'dark', -.239, -.015, -.226, .14, .20, .11);
  part(head, 'rust', -.285, .07, .236, .05, .182, .035);
  const antenna = pivot(head, -.201, .283, -.075);
  part(antenna, 'charcoal', 0, .078, 0, .045, .19, .05);
  part(antenna, 'amber', 0, .179, 0, .095, .07, .08);

  const cape = pivot(torso, -.177, .437, -.263);
  part(cape, 'rust', 0, -.27, 0, .255, .52, .057);
  part(cape, 'bronze', -.025, -.536, 0, .21, .07, .057);
  part(cape, 'amber', .052, -.057, .035, .065, .073, .04);

  const arms = [];
  const legs = [];
  for (const s of [-1, 1]) {
    const shoulder = pivot(torso, s * .285, .408, -.03 + s * .057);
    part(shoulder, 'edge', s * .018, .003, .01, .166, .146, .16);
    part(shoulder, 'charcoal', s * .036, -.116, .011, .102, .21, .12);
    const elbow = pivot(shoulder, s * .04, -.222, .024);
    part(elbow, 'steel', 0, -.01, 0, .123, .096, .125);
    part(elbow, 'ceramic', .008 * s, -.106, .012, .151, .168, .148);
    part(elbow, 'dark', .01 * s, -.205, .02, .145, .079, .151);
    arms.push({ shoulder, elbow, sign: s });

    const hip = pivot(node, s * .151, .555, s * .088);
    part(hip, 'charcoal', 0, -.101, 0, .128, .212, .125);
    const knee = pivot(hip, 0, -.217, .015);
    part(knee, 'steel', 0, 0, .015, .148, .127, .147);
    part(knee, 'ceramic', 0, -.125, 0, .154, .225, .158);
    const foot = pivot(knee, .021, -.266, .045);
    part(foot, 'dark', .045, -.041, .04, .218, .083, .295);
    part(foot, 'edge', .055, .024, .055, .208, .056, .255);
    legs.push({ hip, knee, foot, sign: s });
  }
  return { node, hips, torso, head, antenna, cape, arms, legs, lens, chest };
}

export function poseRobot(model, game, time, reduced) {
  const p = game.player;
  const state = game.state;
  const dx = state === 'liftSequence' ? (game.lift.walk > 0 && game.lift.walk < 1 ? 4.3 : 0) : p.vx;
  const baseMotion = reduced ? .55 : 1;
  const running = Math.min(Math.abs(dx) / 6.5, 1);
  const stride = Math.sin(time * (running > .66 ? 18.6 : 14.2));
  const carrying = Boolean(game.world.carry);
  const dashed = p.dashTime > 0;
  const landed = Math.min(p.land / .15, 1);
  const air = !p.ground && (state === 'play' || state === 'paused');
  const rising = air && p.vy > 0;
  const launching = rising && p.gestureTime > 0 && p.gesture === 'takeoff';
  const shutting = state === 'shutdown' ? Math.min(game.stateTime * 2.4, 1) : 0;
  const boot = state === 'reboot' ? Math.max(1 - game.stateTime * 2, 0) : 0;
  const bent = Math.max(shutting, boot);
  const pulse = p.gesture === 'pulse' ? p.gestureTime / .36 : 0;
  const gesture = p.gestureTime > 0 ? p.gesture : '';
  model.node.position.set(p.x, p.y, .15);
  model.node.rotation.y = p.face * .53 + (!running && !air ? Math.sin(time * 1.05) * .13 * baseMotion : 0);
  model.node.rotation.z = -shutting * .41 * p.face;
  model.hips.position.y = .56 - landed * .088 - bent * .22 + Math.abs(stride) * running * .04;
  model.torso.rotation.z = -p.face * (dashed ? .44 : p.sliding ? -.12 : running * .12)
    + p.recoil * 1.3 * p.face + bent * .56 * p.face;
  model.head.rotation.y = p.face * (.10 + Math.sin(time * 1.65) * .11 * (1 - running) * baseMotion);
  model.head.rotation.x = (air ? -.15 * Math.sign(p.vy) : -.03) + bent * .66 - pulse * .28;
  model.antenna.rotation.z = Math.sin(time * 7.8) * (.045 + running * .16) * baseMotion + (dashed ? .65 : 0);
  model.cape.rotation.x = -running * .57 - (dashed ? .78 : 0) + Math.sin(time * 7) * .055 * baseMotion;
  model.lens.visible = state !== 'shutdown' || game.stateTime < .16;
  model.chest.visible = model.lens.visible;

  for (const arm of model.arms) {
    const swing = stride * running * arm.sign * p.face;
    const reaching = gesture === 'socket' || gesture === 'liftCell';
    arm.shoulder.rotation.x = carrying ? -.94 : reaching ? -.81
      : launching ? -.68 : rising ? -.31 + arm.sign * .22 : air ? .28 + arm.sign * .24 : swing * .66;
    arm.shoulder.rotation.z = carrying ? -arm.sign * .28 : p.sliding ? -p.face * .44 : pulse ? -arm.sign * .35 : -arm.sign * .13;
    if (dashed) arm.shoulder.rotation.x = .79;
    if (gesture === 'relay') arm.shoulder.rotation.x = -.58;
    arm.elbow.rotation.x = carrying ? -.71 : -.16 - Math.abs(swing) * .17 - pulse * .52;
  }
  for (const leg of model.legs) {
    const swing = stride * running * leg.sign * p.face;
    leg.hip.rotation.x = dashed ? leg.sign * .48 + .2 : p.sliding ? -.45
      : rising ? -.41 + leg.sign * .28 : air ? -.17 + leg.sign * .14 : swing * .7;
    leg.hip.rotation.z = dashed ? p.face * .19 : p.sliding ? -p.face * .24 : -.025 * leg.sign;
    leg.knee.rotation.x = (rising ? .61 : air ? .24 : Math.max(0, -swing) * .88) + landed * .38 + bent;
    leg.foot.rotation.x = -(leg.hip.rotation.x + leg.knee.rotation.x) * .7;
  }
}

export function makeCell(root) {
  const group = pivot(root, 0, 0, 0);
  part(group, 'bronze', 0, .26, 0, .54, .47, .42);
  part(group, 'amber', 0, .3, 0, .46, .34, .45);
  part(group, 'dark', 0, .077, 0, .59, .135, .49);
  part(group, 'dark', 0, .487, 0, .49, .12, .45);
  part(group, 'dark', -.132, .57, 0, .08, .137, .12);
  part(group, 'dark', .132, .57, 0, .08, .137, .12);
  part(group, 'steel', 0, .65, 0, .33, .063, .14);
  part(group, 'lens', 0, .295, .24, .267, .073, .029);
  part(group, 'light', .08, .3, .258, .046, .071, .018);
  return group;
}

export function makeStation(root, station, map) {
  const group = pivot(root, station.x, station.y, -.86);
  part(group, 'charcoal', 0, .073, .7, 1.75, .115, 1.71);
  part(group, 'steel', 0, .15, -.12, 1.5, .31, .89);
  part(group, 'charcoal', 0, .686, -.14, .96, 1.05, .76);
  part(group, 'edge', 0, 1.16, -.115, 1.23, .17, .82);
  part(group, 'dark', 0, .754, .263, .72, .51, .09);
  part(group, 'dullTeal', 0, .75, .312, .58, .32, .022);
  for (let i = -1; i < 2; i++) part(group, 'teal', i * .158, .75, .328, .077, .189, .022);
  for (const x of [-.66, .66]) {
    part(group, 'dullTeal', x, .322, .22, .10, .29, .58);
    part(group, 'teal', x, .125, .72, .10, .032, 1.29);
  }
  glow(group, map, '#89e6d2', 0, .7, .36, 2, 1.65, .25);
  sign(group, 'REBOOT', 0, 1.38, .247, 1.02, '#a4dfd0');
}

export function makeSocket(root, socket) {
  const group = pivot(root, socket.x, socket.y, -.72);
  part(group, 'steel', 0, .14, 0, .95, .26, .83);
  part(group, 'dark', 0, .45, -.22, .66, .68, .39);
  part(group, 'bronze', 0, .25, .14, .71, .16, .59);
  part(group, 'rust', -.39, .43, .025, .11, .38, .49);
  part(group, 'rust', .39, .43, .025, .11, .38, .49);
  const lamp = part(group, 'unlit', 0, .814, -.18, .335, .08, .42);
  return { group, lamp };
}

export function makeRelay(root, relay, map) {
  const group = pivot(root, relay.x, relay.y - 1.25, -.55);
  part(group, 'charcoal', 0, .12, 0, 1.55, .24, 1.38);
  part(group, 'steel', 0, .525, -.1, 1.23, .62, .79);
  part(group, 'bronze', 0, .312, .35, 1.1, .16, .096);
  const core = pivot(group, 0, 1.25, .13);
  const glass = part(core, 'teal', 0, 0, 0, .424, .424, .315);
  const crystal = part(core, 'ice', .005, 0, .025, .218, .589, .301);
  part(group, 'steel', 0, 1.71, -.1, .95, .16, .498);
  for (const s of [-1, 1]) {
    part(group, 'edge', .578 * s, 1.28, -.083, .155, .85, .45);
    part(group, 'charcoal', .45 * s, 1.3, -.067, .13, .63, .41);
    part(group, 'bronze', .56 * s, .94, .15, .16, .14, .24);
  }
  const light = glow(group, map, '#80e5d6', 0, 1.27, .37, 2.89, 2.9, .37);
  sign(group, `RELAY ${relay.id}`, 0, 1.977, -.022, 1.47);
  return { group, core, glass, crystal, light };
}

export function makeSwitch(root, item) {
  const group = pivot(root, item.x, item.y - .76, -.5);
  part(group, 'charcoal', 0, .07, 0, .8, .14, .78);
  part(group, 'steel', 0, .39, -.04, .38, .57, .43);
  part(group, 'edge', 0, .71, .048, .56, .25, .44).rotation.x = -.26;
  const lever = part(group, 'amber', .021, .856, .142, .24, .13, .145);
  return { group, lever };
}

export function makeArchive(root, item, map) {
  const group = pivot(root, item.x, item.y, -.62);
  part(group, 'charcoal', 0, -.57, .024, .91, .14, .61);
  part(group, 'bronze', 0, -.38, -.05, .12, .35, .24);
  const core = pivot(group, 0, .043, .055);
  part(core, 'ceramic', 0, 0, 0, .39, .354, .36);
  part(core, 'charcoal', 0, -.008, .193, .313, .263, .049);
  part(core, 'teal', 0, .015, .232, .201, .087, .029);
  for (let n = -1; n <= 1; n++) part(core, 'ice', n * .061, -.063, .224, .027, .031, .017);
  const light = glow(group, map, '#73cdbb', 0, 0, .18, 1.98, 2.1, .2);
  return { group, core, light };
}

export function makeCache(root, item) {
  const group = pivot(root, item.x, item.y, -.29);
  part(group, 'charcoal', 0, -.13, 0, .7, .41, .54);
  part(group, 'bronze', 0, .087, 0, .73, .14, .57);
  for (const n of [-1, 1]) part(group, 'amber', n * .224, .088, .294, .10, .11, .047);
  part(group, 'steel', 0, .16, .05, .233, .065, .16);
  return group;
}

export function makeGate(root, gate) {
  const group = pivot(root, gate.x + gate.w / 2, gate.y, 0);
  const door = pivot(group, 0, 0, 0);
  part(door, 'steel', 0, gate.h / 2, -.43, gate.w, gate.h, 2.31);
  for (let y = .17; y < gate.h; y += .29) {
    part(door, 'charcoal', 0, y, .77, gate.w * .96, .255, .17);
    part(door, 'bronze', 0, y + .09, .878, gate.w * .96, .055, .085);
  }
  part(group, 'dark', 0, gate.h + .14, -.43, gate.w + .26, .25, 2.43);
  const lamp = part(group, 'red', 0, gate.h + .12, .862, gate.w * .59, .065, .07);
  part(group, 'steel', 0, gate.h / 2, -1.54, .17, gate.h, .17);
  return { group, door, lamp };
}

export function makePlatform(root, definition, depth = 2.42) {
  const group = pivot(root, definition.x, definition.y, 0);
  const w = definition.w;
  part(group, 'charcoal', w / 2, -.175, -.11, w, .338, depth);
  part(group, 'edge', w / 2, -.047, -.11, w, .09, depth + .08);
  part(group, 'bronze', w / 2, -.192, depth / 2 - .07, w * .98, .13, .10);
  for (let x = .25; x < w - .19; x += .42) {
    part(group, 'amber', x, -.195, depth / 2, .18, .08, .049).rotation.z = .35;
  }
  const bar = part(group, 'unlit', w / 2, -.286, depth / 2 + .006, w * .52, .046, .074);
  return { group, bar };
}

export function makeMainLift(root, map) {
  const { group, bar } = makePlatform(root, MAIN_LIFT, 2.72);
  const w = MAIN_LIFT.w;
  const midpoint = w / 2;
  for (const x of [.14, w - .14]) {
    part(group, 'steel', x, 1.2, -1.25, .18, 2.41, .32);
    part(group, 'bronze', x, 1.13, -1.05, .083, 2.25, .069);
  }
  part(group, 'steel', midpoint, 2.44, -1.25, w, .22, .37);
  part(group, 'charcoal', midpoint, .39, -1.24, w * .95, .48, .19);
  part(group, 'teal', midpoint, 2.44, -1.02, 2.1, .109, .079);
  const barrier = pivot(group, midpoint, .03, 1.47);
  part(barrier, 'bronze', 0, .59, 0, w - .31, .122, .151);
  part(barrier, 'steel', 0, .27, 0, w - .31, .091, .10);
  for (let x = -w / 2 + .3; x < w / 2 - .11; x += .5) part(barrier, 'bronze', x, .285, 0, .08, .57, .119);
  const console = MAIN_LIFT.console - MAIN_LIFT.x;
  part(group, 'charcoal', console, .45, -.72, .36, .9, .482);
  part(group, 'edge', console, .91, -.7, .63, .251, .51);
  part(group, 'teal', console, .995, -.426, .34, .101, .028);
  glow(group, map, '#93dcca', console, 1.05, -.39, 2.4, 1.65, .16);
  return { group, bar, barrier };
}

export function makeMachine(root, enemy) {
  const group = pivot(root, enemy.x, enemy.y, .11);
  if (enemy.type === 'skitter') {
    const chassis = pivot(group, 0, .31, 0);
    part(chassis, 'dark', .03, -.005, 0, .94, .28, .56);
    part(chassis, 'bronze', .03, .107, -.007, .81, .24, .492);
    part(chassis, 'edge', .058, .247, -.048, .56, .088, .35);
    part(chassis, 'dark', .405, .075, .022, .258, .221, .415);
    const eye = part(chassis, 'lens', .42, .086, .248, .213, .082, .042);
    const legs = [];
    for (let i = -1; i <= 1; i++) {
      for (const s of [-1, 1]) {
        const hinge = pivot(chassis, i * .28, -.013, s * .221);
        part(hinge, 'steel', 0, -.014, s * .086, .069, .070, .251).rotation.x = s * .22;
        const knee = pivot(hinge, i * .058, -.033, s * .211);
        part(knee, 'charcoal', 0, -.108, s * .064, .059, .279, .061).rotation.x = -s * .43;
        part(knee, 'edge', 0, -.235, s * .11, .132, .06, .093);
        legs.push(hinge);
      }
    }
    const cable = pivot(chassis, -.40, -.065, -.13);
    const tail = part(cable, 'bronze', -.257, -.023, 0, .54, .043, .065);
    tail.rotation.z = .17;
    part(cable, 'rust', -.49, -.096, 0, .21, .066, .075).rotation.z = .34;
    return { group, chassis, eye, legs, cable };
  }
  if (enemy.type === 'drone') {
    const chassis = pivot(group, 0, 0, 0);
    part(chassis, 'steel', 0, 0, 0, .53, .53, .49).rotation.z = Math.PI / 4;
    part(chassis, 'ceramic', 0, .04, .046, .458, .449, .334).rotation.z = Math.PI / 4;
    part(chassis, 'charcoal', 0, 0, .267, .37, .27, .12);
    const eye = part(chassis, 'teal', .012, .005, .331, .235, .099, .029);
    const plates = [];
    for (let i = 0; i < 3; i++) {
      const spin = pivot(group, 0, 0, 0);
      part(spin, 'bronze', 0, .537, .003, .29, .123, .192);
      part(spin, 'edge', 0, .592, .02, .22, .065, .167);
      plates.push(spin);
    }
    return { group, chassis, plates, eye };
  }

  part(group, 'charcoal', .26, .025, -.21, .67, 1.36, .72);
  part(group, 'bronze', .055, 0, .011, .86, 1.03, .67);
  part(group, 'dark', -.03, .008, .369, .64, .69, .11);
  const eye = part(group, 'red', -.042, 0, .45, .405, .225, .140);
  const panels = [-1, 1].map(s => {
    const panel = pivot(group, -.047, s * .243, .505);
    part(panel, 'steel', 0, 0, 0, .754, .453, .17);
    part(panel, 'edge', -.018, s * .176, .108, .70, .061, .065);
    part(panel, 'dark', .042, -s * .151, .11, .52, .041, .057);
    return panel;
  });
  return { group, panels, eye };
}

export function makeSeam(root, data) {
  const group = pivot(root, data.x + data.w / 2, data.y, 0);
  const cracks = [];
  for (let i = 0; i < 12; i++) {
    const h = data.h / 12;
    const w = data.w * (.85 + .13 * Math.sin(i * 3.17));
    const x = Math.sin(i * 1.5) * data.w * .067;
    part(group, data.hidden ? 'steel' : i % 3 ? 'bronze' : 'rust',
      x, (i + .5) * h, -.10, w, h - .012, 2.45 - (i % 3) * .077);
    const fragment = part(group, data.hidden ? 'unlit' : 'amber', x - .036, (i + .43) * h, 1.163, .082, h * .93, .035);
    fragment.rotation.z = Math.sin(i * 2.6) * .56;
    cracks.push(fragment);
  }
  return { group, cracks };
}
