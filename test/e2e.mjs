// End-to-end test with a scripted fake Claude API, so it runs without an API key.
// It boots Skyhand, opens it on an emulated iPhone, asks it to fill a form,
// and checks the live view, the cursor, the chat and what was sent to the API.
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium, devices } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = process.env.SHOT_DIR || root;
const listen = (srv) => new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv.address().port)));

// 1) A small website to operate on.
const site = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'text/html');
  if (req.url.startsWith('/popup')) {
    // 300 links behind a modal whose button comes last in the DOM.
    res.end(`<title>Popup</title>${Array.from({ length: 300 }, (_, i) => `<a href="#${i}">Link ${i}</a> `).join('')}
      <div style="position:fixed;inset:0;background:#0006;display:grid;place-items:center"><div style="background:#fff;padding:20px"><button>Pick me</button></div></div>`);
  } else if (req.url.startsWith('/swap')) {
    // Shows a disabled box, then swaps in a fresh enabled one 400 ms later
    // (like Showdown re-rendering once its server connection is up).
    res.end(`<title>Swap</title><div id="app"><input aria-label="Team name" disabled></div><script>
      setTimeout(() => { app.innerHTML = '<input aria-label="Team name">'; }, 400);
    </script>`);
  } else if (req.url.startsWith('/rerender')) {
    // Rebuilds its buttons after every click, like React/Backbone apps do.
    res.end(`<title>Rerender</title><div id="app"></div><script>
      const clicked = [];
      const render = () => { app.innerHTML = '<button data-k="one">Step one</button><button data-k="two">Step two</button><p>clicked: ' + clicked.join(',') + '</p>'; };
      document.addEventListener('click', (e) => { const k = e.target.dataset.k; if (k) { clicked.push(k); render(); } });
      render();
    </script>`);
  } else if (req.url.startsWith('/hello')) {
    const name = new URL(req.url, 'http://x').searchParams.get('name');
    res.end(`<title>Greeting</title><h1>Hello, ${name.replace(/[<>&]/g, '')}!</h1>`);
  } else {
    res.end(`<title>Sign-up</title><meta name="viewport" content="width=device-width">
      <h1>Join the club</h1><form action="/hello"><label>Your name <input name="name"></label>
      <button>Say hello</button></form>`);
  }
});
const sitePort = await listen(site);
const SITE = `http://127.0.0.1:${sitePort}/`;

// 2) A fake Claude API that streams a scripted, three-turn plan.
const requests = [];
const sse = (events) => events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
function turn(id, blocks, stop) {
  const ev = [{ type: 'message_start', message: { id, type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 50, output_tokens: 1 } } }];
  blocks.forEach((b, index) => {
    if (b.text) {
      ev.push({ type: 'content_block_start', index, content_block: { type: 'text', text: '' } });
      for (const part of b.text.match(/.{1,6}/g)) ev.push({ type: 'content_block_delta', index, delta: { type: 'text_delta', text: part } });
    } else {
      ev.push({ type: 'content_block_start', index, content_block: { type: 'tool_use', id: b.id, name: b.name, input: {} } });
      const json = JSON.stringify(b.input);
      for (let i = 0; i < json.length; i += 12) ev.push({ type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: json.slice(i, i + 12) } });
    }
    ev.push({ type: 'content_block_stop', index });
  });
  ev.push({ type: 'message_delta', delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 40 } });
  ev.push({ type: 'message_stop' });
  return sse(ev);
}
const lastToolText = (body) => {
  const last = body.messages.at(-1);
  const r = Array.isArray(last.content) ? last.content.find((c) => c.type === 'tool_result') : null;
  return typeof r?.content === 'string' ? r.content : '';
};
const mock = http.createServer(async (req, res) => {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw);
  requests.push({ headers: req.headers, body });
  const step = body.messages.filter((m) => m.role === 'assistant').length;
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  if (step === 0) {
    res.end(turn('msg_1', [{ text: 'On it.' }, { id: 'toolu_1', name: 'navigate', input: { url: SITE } }], 'tool_use'));
  } else if (step === 1) {
    const snap = lastToolText(body);
    const input = snap.match(/\[(\d+)\] textbox "Your name"/)?.[1];
    const button = snap.match(/\[(\d+)\] button "Say hello"/)?.[1];
    res.end(turn('msg_2', [{ id: 'toolu_2', name: 'act', input: { actions: [
      { type: 'type', ref: Number(input), text: 'Ada' },
      { type: 'click', ref: Number(button) },
    ] } }], 'tool_use'));
  } else {
    const ok = lastToolText(body).includes('Hello, Ada!');
    res.end(turn('msg_3', [{ text: ok ? 'Done! The page now says "Hello, Ada!"' : 'FAILED: greeting not found' }], 'end_turn'));
  }
});
const mockPort = await listen(mock);

// 3) Boot Skyhand against the fake API.
const appPort = 3900 + Math.floor(Math.random() * 90);
const app = spawn(process.execPath, ['src/server.js'], {
  cwd: root,
  env: { ...process.env, PORT: String(appPort), HOST: '127.0.0.1', APP_PASSWORD: 'test-pass', ANTHROPIC_API_KEY: 'test-key',
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${mockPort}`, ALLOW_PRIVATE_NETWORK: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let appLog = '';
app.stdout.on('data', (d) => { appLog += d; });
app.stderr.on('data', (d) => { appLog += d; });
for (let i = 0; i < 100 && !appLog.includes('Skyhand is running'); i++) await new Promise((r) => setTimeout(r, 100));
assert.ok(appLog.includes('Skyhand is running'), `server did not start:\n${appLog}`);

const browser = await chromium.launch();
let failed = false;
try {
  // 0) Batched clicks keep working when the page replaces its elements mid-batch.
  const { BrowserSession } = await import('../src/browser.js');
  const bs = new BrowserSession({ allowPrivate: true });
  await bs.start();
  try {
    await bs.goto(`${SITE}rerender`);
    const snap = await bs.snapshot();
    const one = snap.match(/\[(\d+)\] button "Step one"/)[1];
    const two = snap.match(/\[(\d+)\] button "Step two"/)[1];
    const r = await bs.act([{ type: 'click', ref: +one }, { type: 'click', ref: +two }]);
    assert.match(r.log, /re-rendered/, r.log);
    assert.match(r.snapshot, /clicked: one,two/, r.snapshot);
    console.log('ok  stale elements after a re-render are found again by name');

    await bs.goto(`${SITE}swap`);
    const box = (await bs.snapshot()).match(/\[(\d+)\] textbox "Team name"/)[1];
    const t = Date.now();
    const typed = await bs.act([{ type: 'type', ref: +box, text: 'Hello' }]);
    const ms = Date.now() - t;
    assert.match(typed.log, /^ok: .*re-rendered/m, typed.log);
    assert.match(typed.snapshot, /textbox "Team name" value="Hello"/, typed.snapshot);
    assert.ok(ms < 2500, `took ${ms}ms`);
    console.log(`ok  element swapped out mid-action: retried on the new one (${ms}ms)`);

    await bs.goto(`${SITE}popup`);
    const pop = await bs.snapshot();
    assert.match(pop.split('\n').slice(0, 12).join('\n'), /button "Pick me"/, 'the popup button should be listed first');
    assert.match(pop, /link "Link 0" \(covered\)/);
    console.log('ok  popups are listed first; elements behind them are marked covered');
  } finally { await bs.close(); }

  // 4) Open it like an iPhone would.
  const phone = await browser.newContext({ ...devices['iPhone 15'], deviceScaleFactor: 2 });
  const page = await phone.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${appPort}/`);
  await page.locator('#pw').fill('wrong');
  await page.locator('#loginForm button').click();
  await page.locator('#loginError', { hasText: 'Wrong password' }).waitFor();
  await page.locator('#pw').fill('test-pass');
  await page.locator('#loginForm button').click();
  await page.locator('#app').waitFor();
  await page.waitForFunction(() => document.getElementById('view').width > 0, null, { timeout: 10000 });
  console.log('ok  login + live frames are streaming');

  // Cursor events: record every position the overlay is sent to.
  await page.evaluate(() => {
    window.__moves = [];
    new MutationObserver(() => window.__moves.push(document.getElementById('cursor').style.transform))
      .observe(document.getElementById('cursor'), { attributes: true, attributeFilter: ['style'] });
  });

  // 5) Give Claude a task.
  await page.locator('#prompt').fill('Sign me up as Ada');
  await page.locator('#send').click();
  await page.locator('.msg.assistant', { hasText: 'Hello, Ada!' }).waitFor({ timeout: 20000 });
  await page.locator('.note', { hasText: /Done in/ }).waitFor();
  console.log('ok  Claude finished the task and replied in the chat');

  const steps = await page.locator('.steps li').allTextContents();
  assert.ok(steps.some((s) => s.startsWith('Open http://127.0.0.1')), `steps: ${steps}`);
  assert.ok(steps.some((s) => s.startsWith('Type "Ada"')), `steps: ${steps}`);
  assert.ok(steps.some((s) => s.startsWith('Click "Say hello"')), `steps: ${steps}`);
  console.log('ok  action steps shown:', steps.join(' | '));

  const moves = await page.evaluate(() => window.__moves.filter((t) => !t.includes('-40px')));
  assert.ok(moves.length >= 2, 'cursor should have moved to the input and the button');
  console.log(`ok  cursor animated to ${moves.length} targets`);

  const url = await page.locator('#url').inputValue();
  assert.match(url, /\/hello\?name=Ada/);
  console.log('ok  address bar followed the cloud browser:', url);

  // 6) Check what we sent to the API.
  const first = requests[0];
  assert.equal(first.body.model, 'claude-opus-5-5');
  assert.equal(first.body.stream, true);
  assert.equal(first.body.fallbacks, 'default');
  assert.match(first.headers['anthropic-beta'], /server-side-fallback-2026-07-01/);
  assert.deepEqual(first.body.output_config, { effort: 'low' });
  assert.deepEqual(first.body.cache_control, { type: 'ephemeral' });
  assert.ok(first.body.tools.every((t) => t.eager_input_streaming === true));
  assert.ok(!('thinking' in first.body), 'thinking must be omitted (always on for this model)');
  assert.match(first.body.messages[0].content[0].text, /<current_page>/);
  assert.equal(requests.length, 3);
  // History must be append-only: each request extends the previous one.
  assert.deepEqual(requests[2].body.messages.slice(0, requests[1].body.messages.length), requests[1].body.messages);
  console.log('ok  API requests: model, streaming, fallbacks, caching, eager tool input, append-only history');

  // 7) You can drive it yourself: tap the field, type, press Enter.
  await page.locator('#url').fill(SITE);
  await page.locator('#url').press('Enter');
  await page.waitForFunction((s) => document.getElementById('url').value === s, SITE);
  const box = await page.locator('#screen').boundingBox();
  const vp = await page.evaluate(() => ({ width: document.getElementById('view').width, height: document.getElementById('view').height }));
  assert.ok(Math.abs(box.width / box.height - vp.width / vp.height) < 0.02, 'live view keeps the page aspect ratio');
  assert.ok(box.width > 360, `live view should fill the phone width, got ${box.width}px`);
  console.log(`ok  cloud browser resized to this phone: ${vp.width}x${vp.height}, shown ${Math.round(box.width)}x${Math.round(box.height)}`);
  const scale = box.width / vp.width;
  // Find where the input is in a browser of the same size, then tap it on the live view.
  const target = await (async () => {
    const b = await chromium.launch();
    try {
      const p = await b.newPage({ viewport: vp, isMobile: true });
      await p.goto(SITE);
      const r = await p.locator('input[name=name]').boundingBox();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    } finally { await b.close(); }
  })();
  await page.touchscreen.tap(box.x + target.x * scale, box.y + target.y * scale);
  await page.locator('#typer').waitFor({ state: 'visible', timeout: 5000 });
  await page.locator('#typerInput').fill('Grace');
  await page.locator('#typerInput').press('Enter');
  await page.waitForFunction(() => document.getElementById('url').value.includes('name=Grace'), null, { timeout: 8000 });
  console.log('ok  manual tap + typing from the phone works');

  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outDir, 'skyhand-iphone.png') });
  assert.deepEqual(errors, [], `page errors: ${errors}`);
  console.log('\nAll checks passed.');
} catch (err) {
  failed = true;
  console.error('\nFAILED:', err.message, '\n--- server log ---\n', appLog);
} finally {
  await browser.close();
  app.kill('SIGTERM');
  site.close();
  mock.close();
  process.exitCode = failed ? 1 : 0;
}
