// Skyhand phone app: live view of the cloud browser + chat with Claude.
const $ = (id) => document.getElementById(id);
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  del: (k) => { try { localStorage.removeItem(k); } catch { /* private mode */ } },
};

const canvas = $('view');
const ctx = canvas.getContext('2d');
const screenEl = $('screen');
const cursor = $('cursor');
const cursorLabel = $('cursorLabel');
const log = $('log');

let ws = null;
let password = store.get('skyhand.pw');
let viewport = { width: 412, height: 780 };
let running = false;
let retryDelay = 500;
let currentBubble = null;
let settings = { effort: 'low', turbo: false, mode: 'phone' };

// Keep the layout above the iOS keyboard.
const syncHeight = () => document.documentElement.style.setProperty('--app-h', `${(window.visualViewport?.height || innerHeight)}px`);
window.visualViewport?.addEventListener('resize', syncHeight);
addEventListener('resize', syncHeight);
syncHeight();

// ---------- connection ----------
function send(obj) { if (ws?.readyState === 1) ws.send(JSON.stringify(obj)); }

function connect() {
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  ws.binaryType = 'arraybuffer';
  ws.onopen = () => { retryDelay = 500; send({ type: 'auth', password }); };
  ws.onmessage = (e) => (typeof e.data === 'string' ? onMessage(JSON.parse(e.data)) : onFrame(e.data));
  ws.onclose = (e) => {
    if (e.code === 4003) { showLogin('Too many wrong passwords. Reload to try again.'); return; }
    if (!password) return;
    $('conn').hidden = false;
    $('conn').textContent = 'Reconnecting…';
    setTimeout(connect, retryDelay);
    retryDelay = Math.min(retryDelay * 2, 5000);
  };
}

function showLogin(error = '') {
  $('app').hidden = true;
  $('login').hidden = false;
  $('loginError').textContent = error;
}

$('loginForm').addEventListener('submit', (e) => {
  e.preventDefault();
  password = $('pw').value;
  store.set('skyhand.pw', password);
  $('loginError').textContent = '';
  if (ws && ws.readyState <= 1) send({ type: 'auth', password });
  else connect();
});

// ---------- live frames ----------
let decoding = false;
let pendingFrame = null;
async function onFrame(buf) {
  pendingFrame = buf;
  if (decoding) return; // always draw the newest frame, skip stale ones
  decoding = true;
  while (pendingFrame) {
    const b = pendingFrame;
    pendingFrame = null;
    try {
      const bmp = await createImageBitmap(new Blob([b], { type: 'image/jpeg' }));
      if (canvas.width !== bmp.width || canvas.height !== bmp.height) { canvas.width = bmp.width; canvas.height = bmp.height; }
      ctx.drawImage(bmp, 0, 0);
      bmp.close?.();
      $('conn').hidden = true;
    } catch { /* corrupt frame, skip */ }
  }
  decoding = false;
}

function fitScreen() {
  const stage = $('stage').getBoundingClientRect();
  const pad = 16;
  const aspect = viewport.width / viewport.height;
  let w = stage.width - pad;
  let h = w / aspect;
  if (h > stage.height - pad) { h = stage.height - pad; w = h * aspect; }
  screenEl.style.width = `${Math.max(0, Math.floor(w))}px`;
  screenEl.style.height = `${Math.max(0, Math.floor(h))}px`;
}
new ResizeObserver(fitScreen).observe($('stage'));

// Ask the server to size the cloud browser to this screen (phone mode), so the
// live view is pixel-for-pixel. Skipped while the keyboard is up.
let fitTimer = 0;
function requestFit() {
  clearTimeout(fitTimer);
  fitTimer = setTimeout(() => {
    const a = document.activeElement;
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) return;
    if ($('sheet').classList.contains('expanded')) return;
    const r = $('stage').getBoundingClientRect();
    if (r.width > 0 && r.height > 0) send({ type: 'fit', width: r.width - 16, height: r.height - 16 });
  }, 250);
}
addEventListener('orientationchange', requestFit);
addEventListener('resize', requestFit);
const scale = () => screenEl.clientWidth / viewport.width;

// ---------- messages from the server ----------
function onMessage(m) {
  switch (m.type) {
    case 'auth_failed': password = null; store.del('skyhand.pw'); showLogin('Wrong password.'); break;
    case 'hello':
      $('login').hidden = true;
      $('app').hidden = false;
      applyState(m);
      applySettings(m.settings);
      renderTranscript(m.transcript);
      setRunning(m.running);
      requestFit();
      break;
    case 'state': applyState(m); break;
    case 'settings': applySettings(m); break;
    case 'transcript': renderTranscript(m.transcript); break;
    case 'cursor': showCursor(m); break;
    case 'focus': if (m.editable) openTyper(m.label); break;
    case 'agent': onAgent(m); break;
  }
}

function applyState(s) {
  if (document.activeElement !== $('url')) $('url').value = s.url || '';
  if (s.viewport && (s.viewport.width !== viewport.width || s.viewport.height !== viewport.height)) {
    viewport = s.viewport;
    fitScreen();
  }
}

function applySettings(s) {
  settings = { ...settings, ...s };
  for (const seg of document.querySelectorAll('.seg')) {
    for (const b of seg.children) b.classList.toggle('on', settings[seg.dataset.key] === b.dataset.value);
  }
  $('turbo').checked = !!settings.turbo;
}

// ---------- chat log ----------
const nearBottom = () => log.scrollHeight - log.scrollTop - log.clientHeight < 80;
function add(el) {
  const stick = nearBottom();
  log.append(el);
  if (stick) log.scrollTop = log.scrollHeight;
  return el;
}
function bubble(role, text) {
  const d = document.createElement('div');
  d.className = `msg ${role}`;
  d.textContent = text; // textContent: page-derived text is never parsed as HTML
  return add(d);
}
function step(text) {
  let list = log.lastElementChild;
  if (!list || list.tagName !== 'UL') list = add(document.createElement('ul'));
  list.className = 'steps';
  const li = document.createElement('li');
  li.textContent = text;
  const stick = nearBottom();
  list.append(li);
  if (stick) log.scrollTop = log.scrollHeight;
}
function note(text, cls = '') {
  const d = document.createElement('div');
  d.className = `note ${cls}`;
  d.textContent = text;
  add(d);
}

function renderTranscript(items = []) {
  log.textContent = '';
  currentBubble = null;
  for (const it of items) {
    if (it.role === 'user' || it.role === 'assistant') bubble(it.role, it.text);
    else if (it.role === 'action') step(it.text);
    else note(it.text, it.role === 'error' ? 'error' : '');
  }
  log.scrollTop = log.scrollHeight;
}

function setStatus(text) {
  $('status').hidden = !text;
  if (text) $('statusText').textContent = text;
}

function setRunning(on) {
  running = !!on;
  screenEl.classList.toggle('working', running);
  if (!running) setStatus('');
  updateSendButton();
}

function onAgent(m) {
  switch (m.event) {
    case 'start': bubble('user', m.task); currentBubble = null; setRunning(true); setStatus('Thinking…'); break;
    case 'thinking': currentBubble = null; setStatus('Thinking…'); break;
    case 'tool': setStatus(m.name === 'navigate' ? 'Opening a page…' : m.name === 'read_page' ? 'Reading…' : 'Choosing what to do…'); break;
    case 'text':
      if (!currentBubble) currentBubble = bubble('assistant', '');
      currentBubble.textContent += m.delta;
      if (nearBottom()) log.scrollTop = log.scrollHeight;
      break;
    case 'action': step(m.label); setStatus(m.label); break;
    case 'retry': if (currentBubble) { currentBubble.remove(); currentBubble = null; } note(m.note); break;
    case 'notice': note(m.text); break;
    case 'error': note(m.message, 'error'); break;
    case 'done': setRunning(false); note(`${m.stopped ? 'Stopped' : 'Done'} in ${(m.ms / 1000).toFixed(1)}s`); currentBubble = null; break;
  }
}

// ---------- the cursor Claude moves ----------
let labelTimer = 0;
let idleTimer = 0;
function showCursor(c) {
  const s = scale();
  const x = c.x * s, y = c.y * s;
  cursor.classList.remove('idle');
  cursor.style.transform = `translate(${x}px, ${y}px)`;
  if (c.label) {
    cursorLabel.textContent = c.label;
    cursorLabel.classList.toggle('left', x > screenEl.clientWidth * 0.55);
    cursorLabel.classList.add('show');
    clearTimeout(labelTimer);
    labelTimer = setTimeout(() => cursorLabel.classList.remove('show'), 1400);
  }
  if (c.kind === 'click' || c.kind === 'type') setTimeout(() => ripple(x, y), 150);
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => cursor.classList.add('idle'), 2500);
}
function ripple(x, y, user = false) {
  const r = document.createElement('div');
  r.className = `ripple${user ? ' user' : ''}`;
  r.style.left = `${x}px`;
  r.style.top = `${y}px`;
  screenEl.append(r);
  setTimeout(() => r.remove(), 500);
}

// ---------- you can drive too: tap, swipe, type ----------
function toPage(clientX, clientY) {
  const r = screenEl.getBoundingClientRect();
  const s = scale();
  return { x: (clientX - r.left) / s, y: (clientY - r.top) / s, lx: clientX - r.left, ly: clientY - r.top };
}
function tapAt(clientX, clientY) {
  const p = toPage(clientX, clientY);
  ripple(p.lx, p.ly, true);
  send({ type: 'tap', x: p.x, y: p.y });
}

let touch = null;
let acc = { dx: 0, dy: 0, x: 0, y: 0 };
let flushQueued = false;
let fling = 0;
function queueScroll(dx, dy, clientX, clientY) {
  const s = scale();
  const p = toPage(clientX, clientY);
  acc.dx += dx / s; acc.dy += dy / s; acc.x = p.x; acc.y = p.y;
  if (flushQueued) return;
  flushQueued = true;
  requestAnimationFrame(() => {
    flushQueued = false;
    if (Math.abs(acc.dx) + Math.abs(acc.dy) >= 1) send({ type: 'scroll', dx: acc.dx, dy: acc.dy, x: acc.x, y: acc.y });
    acc.dx = 0; acc.dy = 0;
  });
}

screenEl.addEventListener('touchstart', (e) => {
  cancelAnimationFrame(fling);
  const t = e.touches[0];
  touch = { x0: t.clientX, y0: t.clientY, x: t.clientX, y: t.clientY, t0: performance.now(), tl: performance.now(), vx: 0, vy: 0, moved: false };
}, { passive: true });

screenEl.addEventListener('touchmove', (e) => {
  if (!touch) return;
  e.preventDefault();
  const t = e.touches[0];
  const now = performance.now();
  const dx = touch.x - t.clientX, dy = touch.y - t.clientY;
  const dt = Math.max(1, now - touch.tl);
  touch.vx = 0.8 * (dx / dt) + 0.2 * touch.vx;
  touch.vy = 0.8 * (dy / dt) + 0.2 * touch.vy;
  touch.x = t.clientX; touch.y = t.clientY; touch.tl = now;
  if (!touch.moved && Math.hypot(t.clientX - touch.x0, t.clientY - touch.y0) > 8) touch.moved = true;
  if (touch.moved) queueScroll(dx, dy, t.clientX, t.clientY);
}, { passive: false });

screenEl.addEventListener('touchend', () => {
  if (!touch) return;
  const t = touch;
  touch = null;
  if (!t.moved && performance.now() - t.t0 < 500) { tapAt(t.x0, t.y0); return; }
  // Momentum, like native scrolling.
  let { vx, vy } = t;
  let last = performance.now();
  const glide = (now) => {
    const dt = now - last; last = now;
    vx *= Math.pow(0.95, dt / 16); vy *= Math.pow(0.95, dt / 16);
    if (Math.abs(vx) + Math.abs(vy) < 0.05) return;
    queueScroll(vx * dt, vy * dt, t.x, t.y);
    fling = requestAnimationFrame(glide);
  };
  if (Math.abs(vy) + Math.abs(vx) > 0.3) fling = requestAnimationFrame(glide);
});

// Mouse + trackpad, for using it on a computer.
screenEl.addEventListener('click', (e) => { if (e.pointerType !== 'touch' && !('ontouchstart' in window)) tapAt(e.clientX, e.clientY); });
screenEl.addEventListener('wheel', (e) => { e.preventDefault(); queueScroll(e.deltaX * scale(), e.deltaY * scale(), e.clientX, e.clientY); }, { passive: false });

function openTyper(label) {
  $('typer').hidden = false;
  $('typerInput').placeholder = label ? `Type into “${label.slice(0, 30)}”` : 'Type into the page';
}
$('kbd').addEventListener('click', () => { openTyper(''); $('typerInput').focus(); });
$('typerClose').addEventListener('click', () => { $('typer').hidden = true; });
$('typer').addEventListener('submit', (e) => {
  e.preventDefault();
  send({ type: 'text', text: $('typerInput').value, enter: true });
  $('typerInput').value = '';
});
$('typerInput').addEventListener('keydown', (e) => {
  if (e.key === 'Backspace' && !e.target.value) send({ type: 'key', key: 'Backspace' });
});

// ---------- toolbar ----------
$('back').addEventListener('click', () => send({ type: 'back' }));
$('fwd').addEventListener('click', () => send({ type: 'forward' }));
$('reload').addEventListener('click', () => send({ type: 'reload' }));
$('url').addEventListener('focus', (e) => e.target.select());
$('urlForm').addEventListener('submit', (e) => {
  e.preventDefault();
  send({ type: 'nav', url: $('url').value });
  $('url').blur();
});

// ---------- composer ----------
const prompt = $('prompt');
function updateSendButton() {
  const stop = running && !prompt.value.trim();
  $('send').classList.toggle('stop', stop);
  $('send').setAttribute('aria-label', stop ? 'Stop' : 'Send');
  $('send').firstElementChild.firstElementChild.setAttribute('href', stop ? '#i-stop' : '#i-send');
}
prompt.addEventListener('input', () => {
  prompt.style.height = 'auto';
  prompt.style.height = `${Math.min(prompt.scrollHeight, 120)}px`;
  updateSendButton();
});
prompt.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('composer').requestSubmit(); }
});
$('composer').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = prompt.value.trim();
  if (!text) { if (running) send({ type: 'stop' }); return; }
  send({ type: 'task', text });
  prompt.value = '';
  prompt.style.height = 'auto';
  updateSendButton();
});
$('handle').addEventListener('click', () => $('sheet').classList.toggle('expanded'));

// ---------- settings ----------
$('gear').addEventListener('click', () => $('settings').showModal());
for (const seg of document.querySelectorAll('.seg')) {
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    send({ type: 'settings', [seg.dataset.key]: b.dataset.value });
  });
}
$('turbo').addEventListener('change', (e) => send({ type: 'settings', turbo: e.target.checked }));
$('newChat').addEventListener('click', () => { send({ type: 'reset' }); $('settings').close(); });
$('signOut').addEventListener('click', () => {
  store.del('skyhand.pw');
  password = null;
  $('settings').close();
  ws?.close();
  showLogin('');
});

// ---------- go ----------
if (password) connect();
else showLogin('');
