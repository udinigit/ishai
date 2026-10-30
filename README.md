# Watching Ishai

A live, AI-written pixel-art reality feed. Runs on a free Cloudflare Worker.

- `src/index.js` — the deployed Worker (page + story engine). Generated; do not edit by hand.
- `source/` — the real sources: `public/index.html` (the page), `public/director.html` (director page), `src/worker.template.js` (story engine). Run `node build.mjs` inside `source/` to rebuild into `../src/index.js`.
- `wrangler.toml` — Cloudflare settings: storage (KV `ISHAI`), Workers AI (`AI`), the 4-minute schedule. The `ADMIN_KEY` secret lives in the Cloudflare dashboard.
