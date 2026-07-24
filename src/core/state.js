// The run state and its persistence. Kept deliberately plain-JSON so a save is
// just a structural clone of this object.

const SAVE_KEY = 'pacing-hams:save:v1';

export const state = {
  version: 1,
  seed: 1,
  day: 1,
  money: 240,
  reputation: 50,
  units: [],
  residents: [],
  upgrades: {},
  stats: {
    processed: 0,
    admitted: 0,
    denied: 0,
    mimicsCaught: 0,
    mimicsAdmitted: 0,
    wrongDenials: 0,
    murders: 0,
    murdersSolved: 0,
    innocentsLost: 0,
    daysSurvived: 0,
  },
  today: null,
  lastNight: null,
  endless: false,
  finished: false,
  settings: { muted: false },
};

export function assign(next) {
  for (const k of Object.keys(next)) state[k] = next[k];
  return state;
}

export function save() {
  try {
    const copy = JSON.parse(JSON.stringify(state));
    copy.today = null; // shifts are never resumed mid-pig
    localStorage.setItem(SAVE_KEY, JSON.stringify(copy));
    return true;
  } catch (e) {
    console.warn('[state] save failed', e);
    return false;
  }
}

export function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return false;
    assign(data);
    return true;
  } catch (e) {
    console.warn('[state] load failed', e);
    return false;
  }
}

export function hasSave() {
  try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; }
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}

export const livingResidents = () => state.residents.filter((r) => r.alive);
export const mimicsInside = () => state.residents.filter((r) => r.alive && r.isMimic);
export const hasUpgrade = (id) => !!state.upgrades[id];
