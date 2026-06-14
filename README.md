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

## Documentation

- [Browser Pivot Notes](docs/browser-pivot.md)
- [Original Game Design Notes](docs/game-design.md)

## Notes

- The original single-player Fairy-Stockfish design document is still preserved in `docs/game-design.md`.
- The Windows Fairy-Stockfish binary is still in the repo, but it is not part of the new browser room scaffold.
