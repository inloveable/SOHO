# AGENTS.md

## Cursor Cloud specific instructions

This repository is **黛云丝绸 · DAIYUN SILK**, a single-page three.js silk-brand landing page. It is a **zero-dependency static site** — there is no build step, no bundler, no linter, and no automated test suite. `package.json` declares no dependencies; `node_modules` is intentionally absent.

### Running the app (dev = prod here)
- Start the dev server with `npm start` (alias: `npm run dev`), which runs `node server.js`. It serves the static files on port `8080` and binds to `0.0.0.0`.
- Override the port via the `PORT` env var, e.g. `PORT=3000 npm start`.
- Then open `http://localhost:8080/`.

### Non-obvious caveats
- **CDN dependency / internet required**: `three.js` is loaded at runtime via an ESM importmap from `https://unpkg.com` (see `index.html`), and fonts come from Google Fonts. Without outbound internet access the 3D silk-wave background and custom fonts will not render. The page HTML/CSS still loads, but the core 3D scene needs the CDN.
- Must be served over HTTP (the server, not `file://`) because the page uses ES modules.
- The server has no hot-reload/watch; restart `node server.js` after editing files (a browser refresh is enough to pick up static file changes since there is no caching — `Cache-Control: no-cache`).

### Lint / test / build
- There are no lint, test, or build commands in this repo. Verification is manual: run the server and load the page, then exercise the core interaction = switching between the four sections (序章 / 织品 / 匠艺 / 洽谈) via the top nav, side dots, scroll/arrow keys.
