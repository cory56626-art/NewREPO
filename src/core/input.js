// Immediate-mode input. Everything on screen is drawn to the canvas, so every
// clickable thing is just a rectangle tested during render. Clicks live for exactly
// one frame and are consumed by the first region that claims them, which means
// draw order is also hit-test order — draw modal layers last and let them swallow
// what is left with `consumeRemaining()`.

export const VIEW_W = 1600;
export const VIEW_H = 900;

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.x = VIEW_W / 2;
    this.y = VIEW_H / 2;
    /** Normalised -1..1 offset from screen centre, for parallax. */
    this.nx = 0;
    this.ny = 0;
    this.down = false;
    this.pendingClick = null;
    this.pendingRightClick = null;
    this.wheel = 0;
    this.keysDown = new Set();
    this.keysPressed = new Set();
    this.hovering = false;
    this.anyInputYet = false;

    canvas.addEventListener('pointermove', (e) => this._move(e));
    canvas.addEventListener('pointerdown', (e) => {
      this._move(e);
      this.down = true;
      this.anyInputYet = true;
    });
    canvas.addEventListener('pointerup', (e) => {
      this._move(e);
      if (this.down) {
        if (e.button === 2) this.pendingRightClick = { x: this.x, y: this.y };
        else this.pendingClick = { x: this.x, y: this.y };
      }
      this.down = false;
    });
    canvas.addEventListener('pointerleave', () => { this.down = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.wheel += Math.sign(e.deltaY);
    }, { passive: false });

    window.addEventListener('keydown', (e) => {
      if (['Tab', 'Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
      if (!this.keysDown.has(e.code)) this.keysPressed.add(e.code);
      this.keysDown.add(e.code);
      this.anyInputYet = true;
    });
    window.addEventListener('keyup', (e) => this.keysDown.delete(e.code));
    window.addEventListener('blur', () => { this.keysDown.clear(); this.down = false; });
  }

  _move(e) {
    const r = this.canvas.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    this.x = ((e.clientX - r.left) / r.width) * VIEW_W;
    this.y = ((e.clientY - r.top) / r.height) * VIEW_H;
    this.nx = (this.x / VIEW_W) * 2 - 1;
    this.ny = (this.y / VIEW_H) * 2 - 1;
    this.anyInputYet = true;
  }

  beginFrame() { this.hovering = false; }

  endFrame() {
    this.pendingClick = null;
    this.pendingRightClick = null;
    this.wheel = 0;
    this.keysPressed.clear();
    this.canvas.classList.toggle('pointing', this.hovering);
  }

  held(code) { return this.keysDown.has(code); }
  pressed(code) { return this.keysPressed.has(code); }
  pressedAny(...codes) { return codes.some((c) => this.keysPressed.has(c)); }

  inRect(r) {
    return this.x >= r.x && this.x <= r.x + r.w && this.y >= r.y && this.y <= r.y + r.h;
  }

  /** Hover test that also flags the pointer cursor. */
  hover(r) {
    const on = this.inRect(r);
    if (on) this.hovering = true;
    return on;
  }

  /** Returns true once, on the frame the region was clicked. */
  clicked(r) {
    if (!this.pendingClick) return false;
    const c = this.pendingClick;
    if (c.x >= r.x && c.x <= r.x + r.w && c.y >= r.y && c.y <= r.y + r.h) {
      this.pendingClick = null;
      return true;
    }
    return false;
  }

  /** Swallow any click that no region claimed. Call last, from modal backdrops. */
  consumeRemaining() {
    const had = !!this.pendingClick;
    this.pendingClick = null;
    return had;
  }
}

export const rect = (x, y, w, h) => ({ x, y, w, h });
export const inflate = (r, n) => ({ x: r.x - n, y: r.y - n, w: r.w + n * 2, h: r.h + n * 2 });
