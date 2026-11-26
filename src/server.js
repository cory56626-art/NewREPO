// Serves the phone app and bridges it to the cloud browser + Claude over one WebSocket.
import http from 'node:http';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { BrowserSession } from './browser.js';
import { Agent } from './agent.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.resolve(here, '../public');
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const PASSWORD = process.env.APP_PASSWORD || crypto.randomBytes(6).toString('base64url');
const KEYS = new Set(['Enter', 'Backspace', 'Tab', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Space']);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };

// ---------- shared state ----------
const browser = new BrowserSession({ allowPrivate: process.env.ALLOW_PRIVATE_NETWORK === '1' });
const clients = new Set();
let state = { url: '', title: '', mode: 'phone', viewport: { width: 412, height: 780 } };
let transcript = []; // what the chat shows, so reopening the app restores it
let running = false;

const send = (ws, obj) => { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); };
const broadcast = (obj) => { for (const ws of clients) send(ws, obj); };
const remember = (item) => { transcript.push(item); if (transcript.length > 300) transcript = transcript.slice(-300); };

const agent = new Agent(browser, (evt) => {
  switch (evt.event) {
    case 'start': running = true; remember({ role: 'user', text: evt.task }); break;
    case 'text': {
      const last = transcript.at(-1);
      if (last?.role === 'assistant' && !last.closed) last.text += evt.delta;
      else remember({ role: 'assistant', text: evt.delta });
      break;
    }
    case 'thinking': case 'retry': { const last = transcript.at(-1); if (last?.role === 'assistant') last.closed = true; break; }
    case 'action': remember({ role: 'action', text: evt.label }); break;
    case 'notice': remember({ role: 'notice', text: evt.text }); break;
    case 'error': remember({ role: 'error', text: evt.message }); break;
    case 'done': running = false; remember({ role: 'done', text: `${evt.stopped ? 'Stopped' : 'Done'} in ${(evt.ms / 1000).toFixed(1)}s` }); break;
  }
  broadcast({ ...evt, type: 'agent' });
});

browser.on('frame', (buf) => {
  for (const ws of clients) {
    // Drop frames for slow connections instead of queueing them: the view stays live.
    if (ws.readyState === 1 && ws.bufferedAmount < 1_500_000) ws.send(buf, { binary: true });
  }
});
browser.on('state', (s) => { state = s; broadcast({ ...s, type: 'state' }); });
browser.on('cursor', (c) => broadcast({ ...c, type: 'cursor' }));
browser.on('focus', (f) => broadcast({ ...f, type: 'focus' }));
browser.on('notice', (text) => { remember({ role: 'notice', text }); broadcast({ type: 'agent', event: 'notice', text }); });

// ---------- http ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/healthz') { res.end('ok'); return; }
  const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
  const file = path.resolve(PUBLIC, rel);
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss:; frame-ancestors 'none'",
    });
    res.end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
});

// ---------- websocket ----------
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 256 * 1024 });
const safeEqual = (a, b) => {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
};
// Global brute-force guard: after 20 wrong passwords in 15 minutes, refuse all logins for a while.
let recentFailures = [];
const lockedOut = () => {
  const cutoff = Date.now() - 15 * 60 * 1000;
  recentFailures = recentFailures.filter((t) => t > cutoff);
  return recentFailures.length >= 20;
};
const num = (v, lo, hi) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : null);

wss.on('connection', (ws) => {
  let authed = false;
  let failures = 0;
  const authTimer = setTimeout(() => { if (!authed) ws.close(4001, 'auth timeout'); }, 15000);

  ws.on('message', async (raw, isBinary) => {
    if (isBinary) return;
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (!authed) {
      if (msg.type === 'auth' && !lockedOut() && safeEqual(msg.password ?? '', PASSWORD)) {
        authed = true;
        clearTimeout(authTimer);
        clients.add(ws);
        send(ws, { type: 'hello', ...state, settings: { ...agent.settings, mode: browser.mode }, transcript, running });
        if (browser.lastFrame) ws.send(browser.lastFrame, { binary: true });
      } else {
        failures++;
        recentFailures.push(Date.now());
        setTimeout(() => send(ws, { type: 'auth_failed' }), 600);
        if (failures >= 5) ws.close(4003, 'too many attempts');
      }
      return;
    }

    try {
      switch (msg.type) {
        case 'task': {
          const text = String(msg.text ?? '').trim().slice(0, 4000);
          if (text) agent.run(text);
          break;
        }
        case 'stop': agent.stop(); break;
        case 'reset':
          agent.reset();
          transcript = [];
          broadcast({ type: 'transcript', transcript });
          break;
        case 'settings': {
          if (['low', 'medium', 'high'].includes(msg.effort)) agent.settings.effort = msg.effort;
          if (typeof msg.turbo === 'boolean') agent.settings.turbo = msg.turbo;
          if (msg.mode === 'phone' || msg.mode === 'desktop') await browser.setMode(msg.mode);
          broadcast({ type: 'settings', ...agent.settings, mode: browser.mode });
          break;
        }
        case 'fit': {
          const w = num(msg.width, 0, 5000), h = num(msg.height, 0, 5000);
          if (w && h) await browser.fitPhone(w, h);
          break;
        }
        case 'nav': await browser.goto(String(msg.url ?? '').slice(0, 2000)); break;
        case 'back': await browser.back(); break;
        case 'forward': await browser.forward(); break;
        case 'reload': await browser.reload(); break;
        case 'tap': {
          const x = num(msg.x, 0, 4000), y = num(msg.y, 0, 4000);
          if (x !== null && y !== null) await browser.tap(x, y);
          break;
        }
        case 'scroll': {
          const dx = num(msg.dx ?? 0, -5000, 5000), dy = num(msg.dy, -5000, 5000);
          const x = num(msg.x, 0, 4000), y = num(msg.y, 0, 4000);
          if (dy !== null && x !== null && y !== null) await browser.scrollBy(dx ?? 0, dy, x, y);
          break;
        }
        case 'text': await browser.typeText(String(msg.text ?? '').slice(0, 5000), !!msg.enter); break;
        case 'key': if (KEYS.has(msg.key)) await browser.pressKey(msg.key === 'Space' ? ' ' : msg.key); break;
      }
    } catch (err) {
      send(ws, { type: 'agent', event: 'notice', text: String(err.message).split('\n')[0].slice(0, 200) });
    }
  });

  ws.on('close', () => { clearTimeout(authTimer); clients.delete(ws); });
});

// ---------- boot ----------
await browser.start();
server.listen(PORT, HOST, () => {
  console.log(`\n  Skyhand is running on http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  if (!process.env.APP_PASSWORD) console.log(`  No APP_PASSWORD set. Temporary password for this run: ${PASSWORD}`);
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    console.log('  Warning: ANTHROPIC_API_KEY is not set. You can browse, but Claude cannot act until you add it.');
  }
  console.log('');
});

const shutdown = async () => { await browser.close(); process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
