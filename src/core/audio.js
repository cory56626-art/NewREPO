// Everything you hear is synthesised at runtime — no audio files ship with the
// game. The room tone is a filtered noise bed plus a mains hum; every one-shot is
// a short envelope over noise or a couple of oscillators.

let ctx = null;
let master = null;
let bed = null;
let muted = false;
let started = false;

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.9;
    master.connect(ctx.destination);
  }
  return ctx;
}

function noiseBuffer(seconds = 2, brown = false) {
  const c = ac();
  const len = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  let lastOut = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    if (brown) {
      lastOut = (lastOut + 0.02 * white) / 1.02;
      d[i] = lastOut * 3.5;
    } else {
      d[i] = white;
    }
  }
  return buf;
}

/** Must be called from a user gesture on most browsers. */
export function unlock() {
  const c = ac();
  if (!c) return;
  if (c.state === 'suspended') c.resume();
  if (!started) {
    started = true;
    startRoomTone();
  }
}

function startRoomTone() {
  const c = ac();
  bed = c.createGain();
  bed.gain.value = 0.0;
  bed.connect(master);

  // Low rumble of a building that shouldn't still have power.
  const rumble = c.createBufferSource();
  rumble.buffer = noiseBuffer(4, true);
  rumble.loop = true;
  const rumbleFilter = c.createBiquadFilter();
  rumbleFilter.type = 'lowpass';
  rumbleFilter.frequency.value = 180;
  const rumbleGain = c.createGain();
  rumbleGain.gain.value = 0.55;
  rumble.connect(rumbleFilter).connect(rumbleGain).connect(bed);
  rumble.start();

  // Mains hum from the lamp.
  const hum = c.createOscillator();
  hum.type = 'sawtooth';
  hum.frequency.value = 50;
  const humFilter = c.createBiquadFilter();
  humFilter.type = 'lowpass';
  humFilter.frequency.value = 320;
  const humGain = c.createGain();
  humGain.gain.value = 0.020;
  hum.connect(humFilter).connect(humGain).connect(bed);
  hum.start();

  // Air.
  const air = c.createBufferSource();
  air.buffer = noiseBuffer(4, false);
  air.loop = true;
  const airFilter = c.createBiquadFilter();
  airFilter.type = 'bandpass';
  airFilter.frequency.value = 900;
  airFilter.Q.value = 0.6;
  const airGain = c.createGain();
  airGain.gain.value = 0.012;
  air.connect(airFilter).connect(airGain).connect(bed);
  air.start();

  bed.gain.linearRampToValueAtTime(0.5, c.currentTime + 2.5);
}

export function setMuted(v) {
  muted = v;
  if (master) master.gain.setTargetAtTime(v ? 0 : 0.9, ctx.currentTime, 0.05);
}
export function isMuted() { return muted; }

/** Duck the room tone, e.g. during the night shift. */
export function setBedLevel(v) {
  if (bed && ctx) bed.gain.setTargetAtTime(v, ctx.currentTime, 0.6);
}

function envNoise({ dur = 0.2, type = 'bandpass', freq = 1200, q = 1, gain = 0.2, brown = false, sweepTo = null, delay = 0 }) {
  const c = ac();
  if (!c || muted) return;
  const t0 = c.currentTime + delay;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(Math.max(0.25, dur + 0.1), brown);
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t0);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + Math.min(0.02, dur * 0.2));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t0);
  src.stop(t0 + dur + 0.05);
}

function envTone({ freq = 220, type = 'sine', dur = 0.3, gain = 0.15, glideTo = null, delay = 0 }) {
  const c = ac();
  if (!c || muted) return;
  const t0 = c.currentTime + delay;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

export const sfx = {
  paper: () => envNoise({ dur: 0.18, type: 'highpass', freq: 2600, gain: 0.10 }),
  paperBig: () => {
    envNoise({ dur: 0.26, type: 'highpass', freq: 1800, gain: 0.13 });
    envNoise({ dur: 0.2, type: 'highpass', freq: 3400, gain: 0.07, delay: 0.09 });
  },
  chairScrape: () => envNoise({ dur: 0.7, type: 'bandpass', freq: 320, q: 3, gain: 0.14, sweepTo: 180, brown: true }),
  hoofstep: (i = 0) => {
    envNoise({ dur: 0.09, type: 'lowpass', freq: 400 + (i % 2) * 90, gain: 0.13, brown: true });
    envTone({ freq: 88 + (i % 2) * 8, type: 'sine', dur: 0.1, gain: 0.09 });
  },
  buzzer: () => {
    envTone({ freq: 116, type: 'square', dur: 0.42, gain: 0.10, glideTo: 82 });
    envTone({ freq: 58, type: 'sawtooth', dur: 0.45, gain: 0.06 });
  },
  chime: () => {
    envTone({ freq: 523.25, type: 'sine', dur: 0.5, gain: 0.09 });
    envTone({ freq: 784, type: 'sine', dur: 0.42, gain: 0.05, delay: 0.06 });
  },
  click: () => envNoise({ dur: 0.05, type: 'bandpass', freq: 2200, q: 2, gain: 0.10 }),
  clunk: () => {
    envNoise({ dur: 0.08, type: 'lowpass', freq: 700, gain: 0.14 });
    envTone({ freq: 150, type: 'triangle', dur: 0.1, gain: 0.09, glideTo: 90 });
  },
  stamp: () => {
    envNoise({ dur: 0.07, type: 'lowpass', freq: 900, gain: 0.2 });
    envTone({ freq: 120, type: 'square', dur: 0.09, gain: 0.10, glideTo: 70 });
  },
  lampFlicker: () => envNoise({ dur: 0.12, type: 'bandpass', freq: 3000, q: 6, gain: 0.05 }),
  coin: () => {
    envTone({ freq: 1180, type: 'triangle', dur: 0.14, gain: 0.05 });
    envTone({ freq: 1560, type: 'triangle', dur: 0.12, gain: 0.035, delay: 0.05 });
  },
  heartbeat: () => {
    envTone({ freq: 62, type: 'sine', dur: 0.19, gain: 0.16, glideTo: 44 });
    envTone({ freq: 56, type: 'sine', dur: 0.22, gain: 0.11, glideTo: 40, delay: 0.26 });
  },
  drone: () => envTone({ freq: 44, type: 'sawtooth', dur: 2.2, gain: 0.05 }),
  sting: () => {
    envTone({ freq: 320, type: 'sawtooth', dur: 1.1, gain: 0.11, glideTo: 41 });
    envNoise({ dur: 0.9, type: 'highpass', freq: 1800, gain: 0.09 });
  },
  squeal: () => {
    envTone({ freq: 780, type: 'sawtooth', dur: 0.5, gain: 0.08, glideTo: 1500 });
    envNoise({ dur: 0.45, type: 'bandpass', freq: 1400, q: 4, gain: 0.07 });
  },
  door: () => {
    envNoise({ dur: 0.5, type: 'bandpass', freq: 260, q: 2.5, gain: 0.11, sweepTo: 520, brown: true });
    envNoise({ dur: 0.1, type: 'lowpass', freq: 500, gain: 0.14, delay: 0.5 });
  },
  wet: () => envNoise({ dur: 0.22, type: 'bandpass', freq: 700, q: 1.5, gain: 0.09, sweepTo: 300 }),
};
