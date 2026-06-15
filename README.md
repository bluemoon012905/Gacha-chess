# Gacha-chess

This repository now uses a multi-game room architecture instead of a single hard-wired chess room.

The current playable path is still standard chess, but the room system, frontend entry flow, and shared models have been split so additional games can be added without rewriting the lobby or Durable Object lifecycle.

## What Changed

- a homepage now acts as the game selector and room entry screen
- room creation is generic and requires a `gameKey`
- room lifecycle logic is shared across games
- game-specific logic lives under `shared/games/<game>/`
- chess state definitions and chess behavior rules are stored separately
- players get a generated persistent display name stored in a browser cookie
- rooms display host and guest by generated name

## Current Flow

1. Open the homepage.
2. Select a game.
3. Create a room or paste an existing room code.
4. Join the room as host or guest.
5. Start the match once both seats are filled.

## Project Layout

```text
Gacha-chess/
├── docs/
│   ├── browser-pivot.md
│   ├── deployment.md
│   └── game-design.md
├── shared/
│   ├── games/
│   │   └── chess/
│   │       ├── behaviors/
│   │       │   └── engine.ts
│   │       ├── logic/
│   │       │   ├── state.ts
│   │       │   └── types.ts
│   │       └── index.ts
│   ├── player.ts
│   └── types.ts
├── src/
│   ├── games/
│   │   └── chess/
│   │       └── ChessRoomView.tsx
│   ├── lib/
│   │   ├── player.ts
│   │   └── routes.ts
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

## Architecture

### Shared Room Layer

`worker/index.ts` owns:

- room creation
- host/guest seat claims
- generated room IDs
- WebSocket fanout
- room snapshots
- generic game dispatch by `gameKey`

### Game Modules

Each game can expose:

- metadata for the home screen
- initial state creation
- configuration rules
- start rules
- action handling
- normalization and timeout refresh behavior

Chess currently uses:

- [`shared/games/chess/logic/types.ts`](shared/games/chess/logic/types.ts)
- [`shared/games/chess/logic/state.ts`](shared/games/chess/logic/state.ts)
- [`shared/games/chess/behaviors/engine.ts`](shared/games/chess/behaviors/engine.ts)

## Commands

```bash
npm install
npm run dev
```

Useful additional commands:

```bash
npm run typecheck
npm run build
npm run deploy
```

## API Shape

Current Worker endpoints:

- `GET /api/health`
- `GET /api/games`
- `POST /api/rooms`
- `GET /api/rooms/:roomId`
- `POST /api/rooms/:roomId/join`
- `POST /api/rooms/:roomId/configure`
- `POST /api/rooms/:roomId/start`
- `POST /api/rooms/:roomId/action`
- `GET /api/rooms/:roomId/socket`

## Deployment

The intended production target remains Cloudflare:

- static frontend assets
- a Worker API
- one Durable Object instance per room
- SPA routes such as `/room/:roomId`

See [Deployment Notes](docs/deployment.md) for the current hosting model.

## Notes

- The original design notes are still preserved in [docs/game-design.md](docs/game-design.md).
- Only chess is implemented today, but the repo is now structured for additional room-based games.
