const EPS = 1e-7;
export const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
export const approach = (value, target, amount) => value < target
  ? Math.min(value + amount, target)
  : Math.max(value - amount, target);
export const mix = (a, b, t) => a + (b - a) * t;
export const smooth = t => t * t * (3 - 2 * t);
export const within = (a, b, c, d) => a < d - EPS && b > c + EPS;
export const overlap = (a, b) =>
  within(a.x, a.x + a.w, b.x, b.x + b.w) && within(a.y, a.y + a.h, b.y, b.y + b.h);
export const box = (x, y, w, h) => ({ x: x - w / 2, y, w, h });
export const distance = (x, y, a, b) => Math.hypot(a - x, b - y);

export function sweep(a, delta, axis, solids, ignore = null) {
  const side = axis === 'x' ? 'y' : 'x';
  const span = axis === 'x' ? 'w' : 'h';
  const sideSpan = axis === 'x' ? 'h' : 'w';
  let move = delta;
  let hit = null;
  if (!delta) return { move, hit };

  for (const b of solids) {
    if (b.id === ignore || !within(a[side], a[side] + a[sideSpan], b[side], b[side] + b[sideSpan])) continue;
    if (delta > 0) {
      const gap = b[axis] - (a[axis] + a[span]);
      if (gap >= -EPS && gap <= move + EPS) {
        move = Math.max(0, gap);
        hit = b;
      }
    } else {
      const gap = b[axis] + b[span] - a[axis];
      if (gap <= EPS && gap >= move - EPS) {
        move = Math.min(0, gap);
        hit = b;
      }
    }
  }
  return { move, hit };
}

// Intersect a finite ray against the open interiors of solid rectangles.
export function rayFraction(x, y, dx, dy, solids, ignore = null, throughCrystal = false) {
  let nearest = 1;
  for (const b of solids) {
    if (ignore === b.id || (throughCrystal && b.transmits)) continue;
    let low = 0;
    let high = nearest;
    for (const [start, delta, near, far] of [[x, dx, b.x, b.x + b.w], [y, dy, b.y, b.y + b.h]]) {
      if (Math.abs(delta) < EPS) {
        if (start <= near + EPS || start >= far - EPS) high = -1;
        continue;
      }
      const t1 = (near - start) / delta;
      const t2 = (far - start) / delta;
      low = Math.max(low, Math.min(t1, t2));
      high = Math.min(high, Math.max(t1, t2));
    }
    if (low + EPS < high) nearest = low;
  }
  return nearest;
}
