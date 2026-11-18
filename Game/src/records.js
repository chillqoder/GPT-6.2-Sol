const KEY = 'deepwake.records.v1';
const SETTINGS = 'deepwake.settings.v1';
const VERSION = 1;
const validTime = time => Number.isSafeInteger(time) && time > 0 && time <= 31_536_000_000;
const validRecoveries = count => Number.isSafeInteger(count) && count >= 0 && count <= 10_000_000;

function load(storage, key) {
  try { return JSON.parse(storage?.getItem(key)); } catch { return null; }
}
function save(storage, key, data) {
  try { storage?.setItem(key, JSON.stringify(data)); } catch { /* Keep session data. */ }
}
export function browserStorage() {
  try { return window.localStorage; } catch { return null; }
}
export function formatTime(ms, tenths = false) {
  const seconds = Math.floor(ms / 1000);
  const clock = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  return tenths ? `${clock}.${Math.floor(ms / 100) % 10}` : clock;
}
export class Records {
  constructor(storage) {
    this.storage = storage;
    const raw = load(storage, KEY);
    this.best = { version: VERSION, time: null, full: null, fewest: null };
    if (raw?.version !== VERSION) return;
    if (validTime(raw.time)) this.best.time = raw.time;
    if (validTime(raw.full)) this.best.full = raw.full;
    if (validTime(raw.fewest?.time) && validRecoveries(raw.fewest?.count)) {
      this.best.fewest = { count: raw.fewest.count, time: raw.fewest.time };
    }
  }

  commit(result) {
    if (!['A', 'B', 'C'].every(id => result.relays?.includes(id))) return false;
    const { time, recoveries, archives } = result;
    if (!validTime(time) || !validRecoveries(recoveries)) return false;
    const best = this.best;
    if (!best.time || time < best.time) best.time = time;
    if (archives === 3 && (!best.full || time < best.full)) best.full = time;
    if (!best.fewest || recoveries < best.fewest.count || (recoveries === best.fewest.count && time < best.fewest.time)) {
      best.fewest = { count: recoveries, time };
    }
    save(this.storage, KEY, best);
    return true;
  }
}
export function userSettings(storage) {
  const data = load(storage, SETTINGS);
  const settings = {
    muted: data?.version === VERSION && data.muted === true,
    motion: data?.version === VERSION && typeof data.motion === 'boolean'
      ? data.motion : globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  };
  return {
    settings,
    save: () => save(storage, SETTINGS, { version: VERSION, ...settings }),
  };
}
