# Browser Pivot Notes

## Goal

The repo has moved from a single-screen chess room prototype toward a browser-first multiplayer platform where multiple games can share the same room infrastructure.

The current milestone is:

- a user opens the homepage
- the user selects a game
- the user creates or joins a room
- room state is hosted authoritatively on Cloudflare
- game behavior is delegated through a game registry instead of being embedded directly in the room object

## Current Technical Direction

This implementation uses:

- React for the browser UI
- Vite for frontend development and build
- a Cloudflare Worker for HTTP endpoints
- a Durable Object named `GameRoom` for per-room state
- WebSockets for live room updates
- a shared game registry for dispatching room actions to game modules

## Frontend Structure

The browser app now has two primary modes:

- homepage lobby flow for game selection and room entry
- room page flow for live room state and game-specific UI

The homepage is responsible for:

- selecting the active `gameKey`
- creating a new room for that game
- joining an existing room by room code

The room page is responsible for:

- seat claims
- displaying generated player names
- showing room metadata
- rendering the selected game's interface

## Lobby Design Direction

The pregame room lobby should stay compact across every game:

- shared room metadata should collapse into a single summary strip instead of several separate stat panels
- game facts, room state, member count, and created time should sit together in one compact panel row when space allows
- player identity, host info, seat assignment, and filled-seat count should share that same condensed summary treatment
- seat occupancy, roster management, and game setup can remain separate panels, but the sidebar should avoid stacking small one-value cards

This is the default direction for future room-page UI changes unless a game has a strong reason to break it.

## Shared Code Structure

The shared layer is now separated into:

- generic room and player types in `shared/types.ts`
- player identity generation in `shared/player.ts`
- game registry glue in `shared/games/index.ts`
- per-game modules in `shared/games/<game>/`

For chess specifically:

- `logic/types.ts` holds chess-specific state shapes
- `logic/state.ts` holds initial state construction
- `behaviors/engine.ts` holds move rules, clocks, and action behavior

This split is the basis for adding future games without rewriting the room lifecycle.

## Implemented Endpoints

The current Worker exposes:

- `GET /api/health`
- `GET /api/games`
- `POST /api/rooms`
- `GET /api/rooms/:roomId`
- `POST /api/rooms/:roomId/join`
- `POST /api/rooms/:roomId/configure`
- `POST /api/rooms/:roomId/start`
- `POST /api/rooms/:roomId/action`
- `GET /api/rooms/:roomId/socket`

## Durable Object Responsibilities

`GameRoom` now owns:

- room creation timestamp
- the chosen `gameKey`
- host and guest seats
- player display names
- derived room readiness state
- generic game configuration and start flow
- WebSocket fanout for room-state updates

Game-specific modules own:

- initial game state
- game-specific configuration validation
- start behavior
- legal action handling
- state normalization and timeout refresh

## Development Flow

1. Install dependencies with `npm install`.
2. Start local development with `npm run dev`.
3. Open the local URL from Vite.
4. Pick a game from the homepage.
5. Create a room or open an existing room code.
6. Join from a second tab or browser session and verify the generated names and room updates.

The browser client stores a persistent player identity in a browser cookie, including:

- a stable player ID
- a generated display name

That identity is reused across refreshes so room seats can be reclaimed.

## Hosting Reality

- `npm run dev` is local development only.
- Public room links require deployment to Cloudflare.
- GitHub Pages alone cannot host the backend because the room system depends on Workers and Durable Objects.

See [Deployment Notes](deployment.md) for the current hosting model.

## Near-Term Next Steps

The next useful expansions are:

1. add a second game module to prove the registry flow
2. introduce a lobby metadata view for game-specific room rules
3. define a clearer spectator experience
4. add reconnect and stale-session policies
5. add automated tests around room dispatch and chess actions

## Future Games TODO

Planned games to add later:

- Guessing Chess
- Rule set will be provided later by you and is waiting on upload
- Find 14
- Jinzhou 510K
- Documented in `docs/jinzhou-510k.md`; implementation spec still needed before coding
- Fight the Landlord

## Relationship To Existing Design Docs

The older `docs/game-design.md` file still contains useful game direction, but it assumes:

- single-player progression first
- Fairy-Stockfish server integration
- Raspberry Pi hosting

Those assumptions do not drive the current architecture. Treat them as archived design notes until the multiplayer direction stabilizes further.
