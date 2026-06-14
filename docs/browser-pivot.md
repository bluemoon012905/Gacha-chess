# Browser Pivot Notes

## Goal

The repository is moving away from a single-player local-engine-first prototype and toward a browser-first multiplayer room system hosted on Cloudflare.

The first milestone is intentionally narrow:

- a user opens the site
- the user creates a room
- the app generates a shareable link
- a second user opens the same room
- room state is stored authoritatively on Cloudflare

## Current Technical Direction

This scaffold uses:

- React for the browser UI
- Vite for frontend development and build
- a Cloudflare Worker for HTTP endpoints
- a Durable Object named `GameRoom` for per-room state

## Implemented Endpoints

The current scaffold includes:

- `GET /api/health`
- `POST /api/rooms`
- `GET /api/rooms/:roomId`
- `POST /api/rooms/:roomId/join`

## Durable Object Responsibilities

`GameRoom` currently owns:

- room creation timestamp
- whether a host seat has been claimed
- whether a guest seat has been claimed
- derived room readiness state

Later it can grow to own:

- the actual chess game state
- move validation
- turn order
- reconnection handling
- WebSocket-based realtime updates

## Why Durable Objects

Durable Objects are a good fit here because each room needs:

- one authoritative state owner
- stable routing by room ID
- serialization of room mutations
- a clean path to realtime communication later

That maps directly to one Durable Object instance per room.

## Development Flow

1. Install dependencies with `npm install`.
2. Start local development with `npm run dev`.
3. Open the local URL from Vite.
4. Create a room from the landing page.
5. Open the generated room link in a second browser tab or browser session.

## Near-Term Next Steps

The next useful additions are:

1. add WebSocket connections so room updates push immediately instead of polling
2. introduce persistent player identity per browser session
3. add actual match state to the `GameRoom` object
4. define a minimal legal move format and turn model
5. separate room lifecycle from future game lifecycle concerns

## Relationship To Existing Design Docs

The older `docs/game-design.md` file still contains useful game direction, but it assumes:

- single-player progression first
- Fairy-Stockfish server integration
- Raspberry Pi hosting

Those assumptions do not drive this scaffold anymore. They should be treated as archived design notes until the multiplayer direction stabilizes.
