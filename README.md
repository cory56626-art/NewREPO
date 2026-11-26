# Skyhand

**Your own AI browser that runs in the cloud. Watch Claude browse from your iPhone.**

You type a task like *"find me a blender under $50 with good reviews"*. Claude drives a real Chrome browser on a cloud server. You watch it live on your phone: the cursor zips to the right button, clicks, types, and Claude tells you the answer. You can also take over at any time: tap and swipe the live view, type into fields, or use the address bar like a normal browser.

Nothing gets installed on your phone. It's a web app you add to your Home Screen.

## Why it's fast

| Trick | What it does |
|---|---|
| **Element refs, not pixel guessing** | Claude gets a compact list of what's on screen (`[12] button "Sign in"`) and clicks by number. It doesn't look at screenshots and guess coordinates, so it's quick and precise. |
| **Batched actions** | Claude can fill every field and press Submit in one step, with one round-trip to the AI instead of five. |
| **Tiny page snapshots** | Usually 200–1,000 tokens per page, so Claude reads and replies quickly. |
| **Waits for the page, not the clock** | After each action it waits until the page stops changing (often 150 ms) instead of sleeping a fixed time. |
| **Prompt caching** | Each step re-uses the cached conversation, which is faster and cheaper. |
| **"Fast" thinking by default** | Claude uses low effort for snappy decisions. Switch to *Balanced* or *Thorough* for harder jobs. |
| **Turbo mode** (optional) | Claude writes up to 2.5× faster. Costs 2× per token. |
| **Live video stream** | Chrome's own screencast is streamed as binary over a WebSocket. Stale frames are dropped, so the view never lags behind. |
| **Pixel-perfect phone view** | The cloud browser resizes to exactly match your phone's screen. |

## Set it up from your iPhone (about 10 minutes)

You need a GitHub account (free) and an Anthropic API key (pay per use, usually a few cents per task).

1. **Get an API key.** In Safari, go to **console.anthropic.com**, sign up, add a little credit under *Billing*, then open *API keys* → *Create key*. Copy it.
2. **Start the cloud computer.** On this repository's GitHub page, tap **Code** → **Codespaces** → **⋯** → **New with options**. Under *Branch*, pick **skyhand**. Paste your API key into `ANTHROPIC_API_KEY`, make up a long password for `APP_PASSWORD`, then tap **Create codespace**. The first start takes about 3 minutes.
3. **Open Skyhand.** When the codespace opens, find the **PORTS** tab and the row labeled **Skyhand (3000)**. Tap the globe icon, or copy the address and open it in Safari.
   - If Safari asks you to sign in to GitHub, the port is still private. Long-press the port → **Port Visibility** → **Public**. Skyhand still requires your password.
4. **Add it to your Home Screen.** In Safari, tap **Share** → **Add to Home Screen**. It now opens full screen like an app.
5. **Unlock** with your `APP_PASSWORD`, and ask Claude to do something.

**Later:** Codespaces go to sleep after 30 minutes of no use. To wake it up, open **github.com/codespaces** and tap your codespace; Skyhand starts by itself. You can raise the sleep timer to 4 hours under GitHub → *Settings* → *Codespaces*. GitHub's free plan includes 120 core-hours a month, which is about 60 hours of Skyhand.

### Other ways to host it
The included `Dockerfile` runs on Railway, Fly.io, Render or any Docker host with **at least 1 GB of memory**. Set the `ANTHROPIC_API_KEY` and `APP_PASSWORD` environment variables and expose port 3000. Use HTTPS so your password isn't sent in plain text.

## Using it

- **Ask Claude:** type in the bottom box. While it works, the screen glows and the button turns into **Stop**.
- **Drive it yourself:** tap to click, swipe to scroll, use the address bar. When you tap a text field, a **Type into the page** bar appears. That's how you enter passwords yourself, since Claude is told never to type them.
- **Settings (⚙):** thinking speed, Turbo, Phone or Desktop browser shape, and New chat.

## Safety built in

- Claude treats web page text as untrusted and is told to ignore instructions it finds on pages.
- Claude must **ask before** buying, paying, sending messages, deleting things, or changing account settings. It never types passwords or card numbers itself, and it won't solve CAPTCHAs. It hands those to you.
- The browser refuses local and private network addresses (`localhost`, `10.x`, `192.168.x`, cloud metadata IPs, `file://`). That stops a web page from making Claude poke around the server. This check uses host names and IP addresses; it can't see what a public name resolves to.
- Logins are password-protected, with a lockout after repeated wrong guesses.
- Pop-up `confirm()` dialogs are answered "Cancel" by default.

Anyone who has your app address **and** password can use your API credit, so keep the password long and private.

## Settings (environment variables)

| Variable | Default | What it does |
|---|---|---|
| `ANTHROPIC_API_KEY` | (required) | Your Anthropic API key |
| `APP_PASSWORD` | random (printed at startup) | Password to unlock the app |
| `PORT` / `HOST` | `3000` / `0.0.0.0` | Where the server listens |
| `SKYHAND_MODEL` | `claude-opus-5-5` | Which Claude model drives the browser |
| `SKYHAND_TIMEZONE` | server's | For example `America/New_York`, so sites show your local times |
| `SKYHAND_LOCALE` | `en-US` | Browser language |
| `SKYHAND_SEARCH_URL` | DuckDuckGo | Where plain words in the address bar go |

## How it works

```
iPhone (web app)  ⇄  WebSocket  ⇄  Node server ──► Chrome (Playwright)
   live view, chat,                 │   screencast frames ◄─┘
   tap/swipe/type                   └──► Claude API (streaming + tools)
```

- `src/browser.js` runs Chrome, streams the screen, builds the page snapshot, and does the clicking and typing.
- `src/agent.js` is the Claude loop. It streams Claude's reply, runs its four tools (`navigate`, `act`, `read_page`, `screenshot`), and repeats until the task is done. If Claude declines a request, the API automatically retries it on a fallback model.
- `src/server.js` serves the app, handles the password, and relays everything over one WebSocket.
- `public/` is the iPhone app: HTML, CSS and JS with no build step.

Run the tests (no API key needed, since they use a scripted fake Claude):

```bash
npm install
npx playwright install chromium
npm test
```

## Ideas for next steps
- Keep logins between restarts by saving cookies to disk.
- Voice input: hold to talk.
- Multiple tabs in the UI.
- A "watch mode" that replays what Claude did, step by step.
