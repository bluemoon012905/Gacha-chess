# Gacha-chess

This repository is now being repurposed from a design-only tactics game concept into a browser-based multiplayer prototype.

The first implementation target is:

- a browser client
- a Cloudflare Worker backend
- a Durable Object per room
- shareable room links for head-to-head play

## Current Status

The repository now contains an initial scaffold for:

- a React + Vite browser client
- a Cloudflare Worker API
- a `GameRoom` Durable Object
- room creation and join endpoints
- realtime room updates over WebSockets
- browser-local player identity for seat reclaim on refresh
- documentation for the pivot and local development flow

## Project Layout

```text
Gacha-chess/
├── docs/
│   ├── browser-pivot.md
│   └── game-design.md
├── public/
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   └── styles.css
├── worker/
│   └── index.ts
├── index.html
├── package.json
├── tsconfig.json
├── tsconfig.worker.json
├── vite.config.ts
└── wrangler.jsonc
```

## Commands

After installing dependencies:

```bash
npm install
npm run dev
```

Useful additional commands:

```bash
npm run build
npm run deploy
npm run cf-typegen
```

## Local Vs Public Use

- `npm run dev` is local development only. It is for previewing the app on your machine while you are building it.
- Public room links require deployment to Cloudflare because the app depends on a Worker and Durable Objects.
- GitHub Pages alone is not enough for the current architecture because it cannot run the room API or WebSocket room server.

## Deployment

The intended deployment target is Cloudflare:

- static frontend assets served through the Cloudflare build/deploy flow
- Worker API deployed with Wrangler
- `GameRoom` Durable Object bound in the same deployment

Basic deploy flow:

```bash
npm install
npm run build
npm run deploy
```

You will also need:

- a Cloudflare account
- Wrangler authentication via `npx wrangler login`
- a unique Worker name if `gacha-chess` is already taken in your account

## Cloudflare Setup

1. Create a Cloudflare account if you do not already have one.
2. Run `npx wrangler login` on your machine.
3. Complete the browser-based authorization flow.
4. Open the Cloudflare Workers dashboard once if this is the first Worker on the account so Cloudflare can create the account's `workers.dev` subdomain.
5. Run `npm run deploy`.

Do not paste Cloudflare tokens, cookies, or other secrets into chat. If you want me to verify progress, paste only the non-secret command output or tell me the login succeeded.

## Documentation

- [Browser Pivot Notes](docs/browser-pivot.md)
- [Deployment Notes](docs/deployment.md)
- [Original Game Design Notes](docs/game-design.md)

## Notes

- The original single-player Fairy-Stockfish design document is still preserved in `docs/game-design.md`.
- The Windows Fairy-Stockfish binary is still in the repo, but it is not part of the new browser room scaffold.
