// The cloud browser: one Chromium, streamed live to the phone, driven by
// element refs (fast + precise) instead of guessing pixels from screenshots.
import { chromium } from 'playwright';
import { EventEmitter } from 'node:events';
import { START_PAGE } from './start-page.js';

const MODES = {
  phone: { viewport: { width: 412, height: 780 }, deviceScaleFactor: 1, isMobile: true },
  desktop: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, isMobile: false },
};

const SEARCH_URL = process.env.SKYHAND_SEARCH_URL || 'https://duckduckgo.com/?q=';
const CURSOR_LEAD_MS = 90; // lets the cursor visibly arrive before the click lands
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const short = (s, n = 60) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

export function normalizeUrl(input) {
  const s = String(input ?? '').trim();
  if (!s) return 'about:blank';
  if (/^(https?|about|data|blob|file|chrome|view-source|javascript):/i.test(s)) return s;
  if (/^(localhost|\d{1,3}(\.\d{1,3}){3})(:\d+)?(\/.*)?$/i.test(s)) return 'http://' + s;
  if (!/\s/.test(s) && /^[\w-]+(\.[\w-]+)+(:\d+)?([/?#].*)?$/.test(s)) return 'https://' + s;
  return SEARCH_URL + encodeURIComponent(s);
}

export function isPrivateHost(hostname) {
  const h = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (h === 'localhost' || /\.(localhost|local|internal)$/.test(h)) return true;
  const v4 = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b] = [+v4[1], +v4[2]];
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  if (h.includes(':')) return h === '::' || h === '::1' || /^f[cd]/.test(h) || /^fe[89ab]/.test(h) || h.startsWith('::ffff:');
  return false;
}

// Runs inside the page. Tags interactive elements with data-sk-ref and
// returns a compact, model-friendly description of what is on screen.
function snapshotInPage({ maxEls, maxText }) {
  const W = window.innerWidth, H = window.innerHeight;
  if (window.__skN === undefined) window.__skN = 0;
  const SEL = 'a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=link],' +
    '[role=checkbox],[role=radio],[role=tab],[role=menuitem],[role=option],[role=switch],[role=combobox],' +
    '[role=textbox],[role=searchbox],[role=slider],[contenteditable=""],[contenteditable=true],[onclick],' +
    '[tabindex]:not([tabindex="-1"])';
  const VIS = { checkOpacity: true, checkVisibilityCSS: true, opacityProperty: true, visibilityProperty: true };
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
  const names = new Map();
  const nameOf = (el) => {
    if (names.has(el)) return names.get(el);
    let n = clean(el.getAttribute('aria-label'));
    const lb = el.getAttribute('aria-labelledby');
    if (!n && lb) n = clean(lb.split(/\s+/).map((id) => document.getElementById(id)?.innerText || '').join(' '));
    if (!n && el.labels && el.labels.length) n = clean(el.labels[0].innerText);
    const tag = el.tagName;
    if (!n && (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT')) {
      n = clean(el.getAttribute('placeholder') || el.getAttribute('title') ||
        (['submit', 'button', 'reset'].includes(el.type) ? el.value : '') || el.getAttribute('name'));
    } else if (!n) {
      n = clean(el.innerText);
      if (!n) {
        const img = el.querySelector('img[alt],svg[aria-label],[title]');
        n = clean(el.getAttribute('title') || (img && (img.getAttribute('alt') || img.getAttribute('aria-label') || img.getAttribute('title'))));
      }
    }
    n = cut(n, 80);
    names.set(el, n);
    return n;
  };
  const roleOf = (el) => {
    const r = el.getAttribute('role');
    if (r) return r;
    const tag = el.tagName.toLowerCase();
    if (tag === 'a') return 'link';
    if (tag === 'button') return 'button';
    if (tag === 'textarea') return 'textbox';
    if (tag === 'select') return 'combobox';
    if (tag === 'summary') return 'disclosure';
    if (tag === 'input') {
      const t = (el.type || 'text').toLowerCase();
      if (['submit', 'button', 'reset', 'image'].includes(t)) return 'button';
      if (t === 'checkbox' || t === 'radio') return t;
      if (t === 'range') return 'slider';
      if (t === 'search') return 'searchbox';
      return 'textbox';
    }
    if (el.isContentEditable) return 'textbox';
    return 'clickable';
  };
  const extraOf = (el, role) => {
    const x = [];
    const tag = el.tagName;
    if (tag === 'INPUT' && !['text', 'search', 'submit', 'button', 'checkbox', 'radio'].includes(el.type)) x.push(`type=${el.type}`);
    if ((tag === 'INPUT' || tag === 'TEXTAREA') && !['checkbox', 'radio', 'submit', 'button'].includes(el.type)) {
      x.push(el.type === 'password' ? `value=${el.value ? '"••••"' : '""'}` : `value=${JSON.stringify(cut(el.value || '', 60))}`);
    }
    if (tag === 'SELECT') x.push(`selected=${JSON.stringify(cut(el.selectedOptions[0]?.text || '', 40))}`);
    if (el.checked || el.getAttribute('aria-checked') === 'true') x.push('checked');
    if (el.getAttribute('aria-expanded')) x.push(`expanded=${el.getAttribute('aria-expanded')}`);
    if (el.getAttribute('aria-selected') === 'true' || el.getAttribute('aria-pressed') === 'true') x.push('selected');
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') x.push('disabled');
    if (role === 'link' && !nameOf(el)) x.push(`href=${cut(el.getAttribute('href') || '', 60)}`);
    return x.join(' ');
  };

  const els = [];
  const listed = new Set();
  let below = 0;
  for (const el of document.querySelectorAll(SEL)) {
    if (els.length >= maxEls) { below++; continue; }
    if (el.closest('[aria-hidden="true"],[inert]')) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    if (r.bottom < -H * 0.25 || r.right < 0 || r.left > W) continue;
    if (r.top > H * 2) { below++; continue; }
    if (el.checkVisibility && !el.checkVisibility(VIS)) continue;
    const anc = el.parentElement && el.parentElement.closest(SEL);
    if (anc && listed.has(anc) && nameOf(anc) === nameOf(el)) continue; // <a><button>Same</button></a>
    if (!el.hasAttribute('data-sk-ref')) el.setAttribute('data-sk-ref', String(++window.__skN));
    const role = roleOf(el);
    listed.add(el);
    els.push({ ref: +el.getAttribute('data-sk-ref'), role, name: nameOf(el), extra: extraOf(el, role), below: r.top >= H });
  }

  // Visible text, grouped into visual lines.
  let text = '';
  let lastTop = null;
  const range = document.createRange();
  const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      const p = n.parentElement;
      if (!p || !n.nodeValue.trim() || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(p.tagName)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  while (text.length < maxText && walker.nextNode()) {
    const n = walker.currentNode;
    range.selectNodeContents(n);
    const rr = range.getBoundingClientRect();
    if (rr.width < 1 || rr.bottom < 0 || rr.top > H || rr.right < 0 || rr.left > W) continue;
    if (n.parentElement.checkVisibility && !n.parentElement.checkVisibility(VIS)) continue;
    const t = clean(n.nodeValue);
    if (lastTop !== null) text += Math.abs(rr.top - lastTop) > 4 ? '\n' : ' ';
    text += t;
    lastTop = rr.top;
  }

  return {
    title: document.title, url: location.href, els, below, text: cut(text, maxText),
    W, H, scrollY: Math.round(window.scrollY), scrollH: document.documentElement.scrollHeight,
  };
}

// Waits until the DOM stops changing (SPAs) instead of a fixed sleep.
function domQuietInPage({ quietMs, capMs }) {
  return new Promise((resolve) => {
    let t = setTimeout(done, quietMs);
    const cap = setTimeout(done, capMs);
    const mo = new MutationObserver(() => { clearTimeout(t); t = setTimeout(done, quietMs); });
    mo.observe(document, { subtree: true, childList: true, characterData: true });
    function done() { mo.disconnect(); clearTimeout(t); clearTimeout(cap); resolve(); }
  });
}

// Who each element is (role + name + which one among equals), independent of DOM identity.
function identities(els) {
  const seen = new Map();
  const out = new Map();
  for (const e of els) {
    const key = `${e.role}\u0000${e.name}`;
    const nth = seen.get(key) ?? 0;
    seen.set(key, nth + 1);
    out.set(e.ref, { key, nth });
  }
  return out;
}

export class BrowserSession extends EventEmitter {
  constructor({ allowPrivate = false } = {}) {
    super();
    this.allowPrivate = allowPrivate;
    this.mode = 'phone';
    this.pages = [];
    this.page = null;
    this.cdp = null;
    this.lastFrame = null;
    this.refNames = new Map();
    this.refInfo = new Map();
    this.lastDialog = null;
    this.phoneViewport = { ...MODES.phone.viewport }; // resized to match the user's screen
  }

  get viewport() { return this.mode === 'phone' ? this.phoneViewport : MODES[this.mode].viewport; }

  async start() {
    const args = [];
    if (!this.allowPrivate) {
      args.push('--host-resolver-rules=MAP localhost ~NOTFOUND, MAP *.localhost ~NOTFOUND, MAP *.local ~NOTFOUND, MAP *.internal ~NOTFOUND');
    }
    this.browser = await chromium.launch({ args });
    this.major = this.browser.version().split('.')[0];
    await this.openContext(null);
  }

  async close() { await this.browser?.close().catch(() => {}); }

  userAgent() {
    return MODES[this.mode].isMobile
      ? `Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${this.major}.0.0.0 Mobile Safari/537.36`
      : `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${this.major}.0.0.0 Safari/537.36`;
  }

  async openContext(url, storageState) {
    const m = MODES[this.mode];
    const old = this.context;
    this.pages = [];
    this.context = await this.browser.newContext({
      viewport: this.viewport,
      deviceScaleFactor: m.deviceScaleFactor,
      isMobile: m.isMobile,
      userAgent: this.userAgent(),
      locale: process.env.SKYHAND_LOCALE || 'en-US',
      timezoneId: process.env.SKYHAND_TIMEZONE || undefined,
      storageState,
    });
    this.context.on('page', (p) => this.adopt(p));
    const page = await this.context.newPage();
    await this.adopt(page);
    if (old) await old.close().catch(() => {});
    if (url && url !== 'about:blank') await this.goto(url).catch(() => {});
    else await page.setContent(START_PAGE).catch(() => {});
  }

  async setMode(mode) {
    if (!MODES[mode] || mode === this.mode) return;
    const url = this.page?.url();
    const state = await this.context.storageState().catch(() => undefined);
    this.mode = mode;
    await this.openContext(url, state); // keeps cookies/logins across the switch
  }

  // Make the cloud browser exactly the size of the phone's view area, so the
  // live picture fills the screen 1:1 instead of being letterboxed.
  async fitPhone(width, height) {
    const vp = { width: Math.round(Math.min(600, Math.max(320, width))), height: Math.round(Math.min(1000, Math.max(320, height))) };
    if (vp.width === this.phoneViewport.width && vp.height === this.phoneViewport.height) return;
    this.phoneViewport = vp;
    if (this.mode !== 'phone') return;
    for (const p of this.pages) await p.setViewportSize(vp).catch(() => {});
    if (this.page) await this.startScreencast(this.cdp);
    this.emitState();
  }

  async adopt(p) {
    if (this.pages.includes(p)) return;
    this.pages.push(p);
    const size = p.viewportSize();
    if (size && (size.width !== this.viewport.width || size.height !== this.viewport.height)) await p.setViewportSize(this.viewport).catch(() => {});
    p.on('close', () => {
      this.pages = this.pages.filter((x) => x !== p);
      if (this.page === p && this.pages.length) this.activate(this.pages.at(-1));
    });
    p.on('framenavigated', (f) => { if (f === p.mainFrame()) this.onNavigated(p); });
    p.on('load', () => { if (p === this.page) this.emitState(); });
    p.on('dialog', (d) => {
      // Default answer is the safe one: OK for alerts, Cancel for confirm/prompt.
      this.lastDialog = `${d.type()}: ${short(d.message(), 200)}`;
      (d.type() === 'alert' || d.type() === 'beforeunload' ? d.accept() : d.dismiss()).catch(() => {});
    });
    await this.activate(p);
  }

  async activate(p) {
    const prev = this.cdp;
    this.page = p;
    this.cdp = null;
    if (prev) prev.detach().catch(() => {});
    const cdp = await p.context().newCDPSession(p);
    this.cdp = cdp;
    cdp.on('Page.screencastFrame', ({ data, sessionId }) => {
      cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
      if (cdp !== this.cdp) return;
      this.lastFrame = Buffer.from(data, 'base64');
      this.emit('frame', this.lastFrame);
    });
    await this.startScreencast(cdp);
    this.emitState();
  }

  async startScreencast(cdp) {
    if (!cdp) return;
    await cdp.send('Page.stopScreencast').catch(() => {});
    await cdp.send('Page.startScreencast', {
      format: 'jpeg', quality: 70, everyNthFrame: 1,
      maxWidth: this.viewport.width, maxHeight: this.viewport.height,
    }).catch(() => {});
  }

  isAllowed(raw) {
    let u;
    try { u = new URL(raw); } catch { return false; }
    if (['about:', 'data:', 'blob:', 'chrome-error:'].includes(u.protocol)) return true;
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    return this.allowPrivate || !isPrivateHost(u.hostname);
  }

  onNavigated(p) {
    const url = p.url();
    if (!this.isAllowed(url)) {
      this.emit('notice', `Blocked ${short(url, 80)} (local/private addresses are off-limits).`);
      p.goto('about:blank').catch(() => {});
    }
    if (p === this.page) this.emitState();
  }

  emitState() {
    const p = this.page;
    if (!p) return;
    p.title().catch(() => '').then((title) => {
      const url = p.url();
      this.emit('state', { url: url === 'about:blank' ? '' : url, title, mode: this.mode, viewport: this.viewport });
    });
  }

  // ---------- navigation ----------
  async goto(raw) {
    const url = normalizeUrl(raw);
    if (!this.isAllowed(url)) throw new Error(`Blocked: ${url} is not a public web address`);
    await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await this.settle();
  }
  async back() { await this.page.goBack({ waitUntil: 'domcontentloaded', timeout: 10000 }); await this.settle(); }
  async forward() { await this.page.goForward({ waitUntil: 'domcontentloaded', timeout: 10000 }); await this.settle(); }
  async reload() { await this.page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 }); }

  async settle() {
    const p = this.page;
    await p.waitForLoadState('domcontentloaded', { timeout: 6000 }).catch(() => {});
    await p.evaluate(domQuietInPage, { quietMs: 150, capMs: 1200 }).catch(async () => {
      await p.waitForLoadState('domcontentloaded', { timeout: 6000 }).catch(() => {});
    });
  }

  // ---------- what the model sees ----------
  async snapshot() {
    let d;
    for (let i = 0; i < 3 && !d; i++) {
      d = await this.page.evaluate(snapshotInPage, { maxEls: 120, maxText: 2500 }).catch(async () => {
        await this.page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
        return null;
      });
    }
    if (!d) return `URL: ${this.page.url()}\n(The page is still loading; try again.)`;
    this.refNames = new Map(d.els.map((e) => [e.ref, e.name]));
    this.refInfo = identities(d.els);
    const maxScroll = Math.max(0, d.scrollH - d.H);
    const lines = [
      `Title: ${d.title || '(none)'}`,
      `URL: ${d.url}`,
      `Viewport ${d.W}x${d.H}, scrolled ${d.scrollY}/${maxScroll}px${d.scrollY < maxScroll - 4 ? ' (more below)' : ''}`,
    ];
    if (this.lastDialog) { lines.push(`A dialog popped up and was auto-answered: ${this.lastDialog}`); this.lastDialog = null; }
    lines.push('', 'Elements:');
    for (const e of d.els) {
      lines.push(`[${e.ref}] ${e.role}${e.name ? ` ${JSON.stringify(e.name)}` : ''}${e.extra ? ' ' + e.extra : ''}${e.below ? ' (below fold)' : ''}`);
    }
    if (!d.els.length) lines.push('(no interactive elements in view)');
    if (d.below) lines.push(`(+${d.below} more further down the page)`);
    lines.push('', 'Visible text:', d.text || '(none)');
    return lines.join('\n');
  }

  async readPage() {
    const text = await this.page.evaluate(() => {
      const main = document.querySelector('main,article,[role=main]');
      const t = (main && main.innerText.trim().length > 300 ? main : document.body).innerText;
      return t.replace(/\n{3,}/g, '\n\n').trim();
    });
    return `URL: ${this.page.url()}\n\n${text.length > 15000 ? text.slice(0, 15000) + '\n…(truncated)' : text}`;
  }

  async screenshotBase64() {
    const buf = await this.page.screenshot({ type: 'jpeg', quality: 70, scale: 'css', timeout: 10000 });
    return buf.toString('base64');
  }

  // ---------- actions ----------
  describe(a) {
    const nm = a.ref != null && this.refNames.get(a.ref);
    const target = nm ? JSON.stringify(short(nm, 40)) : a.ref != null ? `[${a.ref}]` : '';
    switch (a.type) {
      case 'click': return `Click ${target}`;
      case 'type': return `Type ${JSON.stringify(short(a.text ?? '', 40))} into ${target}${a.submit ? ' + Enter' : ''}`;
      case 'press': return `Press ${a.key}`;
      case 'select': return `Select ${JSON.stringify(a.option)} in ${target}`;
      case 'hover': return `Hover ${target}`;
      case 'scroll': return a.ref != null ? `Scroll to ${target}` : `Scroll ${a.direction || 'down'}`;
      case 'click_at': return `Click at (${Math.round(a.x)}, ${Math.round(a.y)})`;
      case 'wait': return `Wait ${Math.min(a.ms ?? 1000, 5000)}ms`;
      default: return a.type[0].toUpperCase() + a.type.slice(1);
    }
  }

  // Finds the element for a ref. Apps built with React, Vue, Backbone etc. often
  // re-render and replace DOM nodes right after a click; when that happens, find
  // the same element again by role + name instead of failing the action.
  async locate(ref) {
    if (ref == null) throw new Error('this action needs a ref');
    const loc = this.page.locator(`[data-sk-ref="${ref}"]`).first();
    if (await loc.count()) return loc;
    const info = this.refInfo.get(ref);
    if (info) {
      const d = await this.page.evaluate(snapshotInPage, { maxEls: 400, maxText: 0 }).catch(() => null);
      if (d) {
        const now = identities(d.els);
        const same = [...now].filter(([, v]) => v.key === info.key);
        const hit = same.find(([, v]) => v.nth === info.nth) ?? (same.length === 1 ? same[0] : null);
        if (hit) {
          this.recovered = true;
          return this.page.locator(`[data-sk-ref="${hit[0]}"]`).first();
        }
      }
    }
    throw new Error('ref not found on the page anymore (page changed - use the newest snapshot)');
  }

  async pointAt(loc, kind, label) {
    await loc.scrollIntoViewIfNeeded({ timeout: 2500 }).catch(() => {});
    const box = await loc.boundingBox({ timeout: 2500 });
    if (!box) throw new Error('element is not visible');
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    this.emit('cursor', { x, y, kind, label });
    await sleep(CURSOR_LEAD_MS);
    return { x, y };
  }

  async runAction(a) {
    const p = this.page;
    const label = this.describe(a);
    switch (a.type) {
      case 'click': {
        const loc = await this.locate(a.ref);
        await this.pointAt(loc, 'click', label);
        try { await loc.click({ timeout: 3500 }); }
        catch { await loc.click({ force: true, timeout: 2000 }); return 'forced (something was covering it)'; }
        return '';
      }
      case 'type': {
        const loc = await this.locate(a.ref);
        await this.pointAt(loc, 'type', label);
        try { await loc.fill(a.text ?? '', { timeout: 3500 }); }
        catch { await loc.click({ timeout: 2500 }); await p.keyboard.press('ControlOrMeta+A'); await p.keyboard.insertText(a.text ?? ''); }
        if (a.submit) await p.keyboard.press('Enter');
        return '';
      }
      case 'press': await p.keyboard.press(a.key); return '';
      case 'select': {
        const loc = await this.locate(a.ref);
        await this.pointAt(loc, 'click', label);
        await loc.selectOption({ label: a.option }, { timeout: 3000 }).catch(() => loc.selectOption(a.option, { timeout: 3000 }));
        return '';
      }
      case 'hover': { const loc = await this.locate(a.ref); await this.pointAt(loc, 'move', label); await loc.hover({ timeout: 3000 }); return ''; }
      case 'scroll': {
        if (a.ref != null) { await this.pointAt(await this.locate(a.ref), 'move', label); return ''; }
        const { width, height } = this.viewport;
        this.emit('cursor', { x: width / 2, y: height / 2, kind: 'scroll', label });
        await p.mouse.move(width / 2, height / 2);
        await p.mouse.wheel(0, (a.direction === 'up' ? -1 : 1) * height * 0.85);
        await sleep(250);
        return '';
      }
      case 'back': await this.back(); return '';
      case 'forward': await this.forward(); return '';
      case 'wait': await sleep(Math.min(Math.max(a.ms ?? 1000, 0), 5000)); return '';
      case 'click_at': {
        if (typeof a.x !== 'number' || typeof a.y !== 'number') throw new Error('click_at needs x and y');
        this.emit('cursor', { x: a.x, y: a.y, kind: 'click', label });
        await sleep(CURSOR_LEAD_MS);
        await p.mouse.click(a.x, a.y);
        return '';
      }
      default: throw new Error(`unknown action type ${a.type}`);
    }
  }

  async act(actions, { onAction, isCancelled } = {}) {
    const log = [];
    for (let i = 0; i < actions.length; i++) {
      if (isCancelled?.()) { log.push('Stopped by the user.'); break; }
      const a = actions[i];
      const label = this.describe(a);
      onAction?.(label);
      const before = this.page.url();
      try {
        this.recovered = false;
        let note = await this.runAction(a);
        if (this.recovered) note = [note, 'page had re-rendered; matched the same element by name'].filter(Boolean).join('; ');
        log.push(`ok: ${label}${note ? ` (${note})` : ''}`);
      } catch (e) {
        log.push(`FAILED: ${label} - ${short(String(e.message).split('\n')[0], 200)}`);
        if (i < actions.length - 1) log.push(`Skipped the remaining ${actions.length - 1 - i} action(s).`);
        break;
      }
      if (i < actions.length - 1 && this.page.url() !== before) {
        log.push(`The page changed to ${this.page.url()}; skipped the remaining ${actions.length - 1 - i} action(s) because their refs are stale.`);
        break;
      }
    }
    await this.settle();
    return { log: log.join('\n'), snapshot: await this.snapshot() };
  }

  // ---------- manual control from the phone ----------
  async tap(x, y) {
    await this.page.mouse.click(x, y);
    await sleep(250);
    const info = await this.page.evaluate(() => {
      const a = document.activeElement;
      if (!a) return { editable: false };
      const skip = ['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'range', 'color', 'image', 'hidden'];
      const editable = a.isContentEditable || a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && !skip.includes(a.type));
      return editable ? { editable: true, label: a.getAttribute('aria-label') || a.placeholder || '', inputType: a.type || 'text' } : { editable: false };
    }).catch(() => ({ editable: false }));
    this.emit('focus', info);
  }

  async scrollBy(dx, dy, x, y) {
    await this.page.mouse.move(x, y);
    await this.page.mouse.wheel(dx, dy);
  }

  async typeText(text, enter) {
    if (text) await this.page.keyboard.insertText(text);
    if (enter) await this.page.keyboard.press('Enter');
  }

  async pressKey(key) { await this.page.keyboard.press(key); }
}
