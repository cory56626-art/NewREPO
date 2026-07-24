// Small easing + spring helpers. The head tilt, the lamp sway and every scene
// transition run through these so motion always feels weighted rather than snapped.

export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t) => t * t * t;
export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutBack = (t) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));

/** Frame-rate independent exponential approach. `speed` is roughly "per second". */
export function approach(current, target, speed, dt) {
  return lerp(current, target, 1 - Math.exp(-speed * dt));
}

/** A value that eases toward whatever you set it to. */
export class Smooth {
  constructor(value = 0, speed = 8) {
    this.value = value;
    this.target = value;
    this.speed = speed;
  }
  set(target) { this.target = target; return this; }
  snap(value) { this.value = this.target = value; return this; }
  update(dt) {
    this.value = approach(this.value, this.target, this.speed, dt);
    return this.value;
  }
  get done() { return Math.abs(this.value - this.target) < 0.0005; }
}

/** One-shot timeline: t goes 0 -> 1 over `duration`, then stays. */
export class Timer {
  constructor(duration = 1) { this.duration = duration; this.elapsed = 0; }
  reset(duration = this.duration) { this.duration = duration; this.elapsed = 0; return this; }
  update(dt) { this.elapsed = Math.min(this.duration, this.elapsed + dt); return this.t; }
  get t() { return this.duration <= 0 ? 1 : this.elapsed / this.duration; }
  get done() { return this.elapsed >= this.duration; }
}
