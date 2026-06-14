# Game Design Overview

## High Concept

This project is a server-side tactics game that blends:

- chess-style board combat
- gacha-style piece unlock progression
- puzzle-like level design
- Fairy-Stockfish-controlled enemies

The player does not build a deck in the card-game sense. Instead, they gradually unlock additional piece types and then use those unlocked pieces to assemble a starting board position before a level begins.

## Core Fantasy

The player should feel like they are:

- collecting stronger and stranger piece types over time
- solving combat encounters through preparation, not just move-by-move tactics
- mastering multiple board-game rule systems inside one progression game

## Core Game Loop

1. The player unlocks new piece types through progression.
2. The player selects a level.
3. The player configures their starting position before the level begins.
4. The enemy enters with a predefined setup for that stage.
5. The player always moves second.
6. The match is played out against Fairy-Stockfish.
7. The player clears a sequence of battles to complete the level.
8. Completion grants further progression, rewards, or new unlocks.

## Progression Structure

### Starting State

At the beginning of the game, the player has only:

- a chess pawn
- a chess rook

This deliberately creates a constrained early experience. The first levels should teach:

- how starting placement matters
- how moving second changes tactics
- how enemy setup defines the problem to solve

### Unlock Model

Piece access expands over time. New unlocks should come in layers:

- more standard chess pieces first
- then more complex or variant-specific pieces
- then hybrid or high-complexity rule interactions

The unlock model should support a gacha presentation, but game balance should not depend on pure randomness alone. Even if the UI and reward loop feel like a gacha game, progression should remain controllable enough that level design stays fair.

## Level Structure

Each level is a curated challenge rather than an open-ended match.

### Level Flow

- the player prepares one starting position ahead of time
- the player enters a series of games or encounters
- each encounter uses a different enemy setup
- the player must win the full sequence to clear the level

This means the player's preparation is part of the puzzle. The level is not only about tactical play after turn one; it is also about whether the chosen starting formation is flexible enough to survive multiple enemy scenarios.

### Design Implications

- levels can be tuned around specific unlocked piece pools
- enemy setups can teach new mechanics one at a time
- replay value can come from solving the same level with different unlocked rosters

## Ruleset Roadmap

The long-term design includes multiple chess-family systems. These should be introduced in phases.

### Phase 1: Standard Chess Only

The earliest implementation should use standard chess movement and capture rules only. This keeps the first playable version small enough to validate:

- board representation
- level flow
- player-side setup
- enemy AI integration
- save/progression structure

### Phase 2: Chinese Chess Inspired Rules

Later, the game should support Chinese chess style units and rules, including at minimum:

- pawn-like units that gain new movement after crossing the river
- those pawns can never move backward

Current design note:

- your description says these pawns "promote" halfway across the river; implementation-wise, that likely means a state change after crossing the river that expands movement options rather than a full piece replacement

This should be modeled explicitly in the rules engine instead of hard-coding it as a standard chess promotion event.

### Phase 3: Shogi Inspired Rules

Later, the game should support shogi mechanics, including:

- captured pieces going into the capturer's hand
- hand pieces being droppable back onto the board
- promotable pieces promoting in or across the last three ranks

Current design note:

- the design should treat "piece in hand" as a first-class game state, not as a side effect
- drop rules will require move generation that includes non-board-origin moves

## Mixed-System Design Considerations

Because the project eventually combines chess, Chinese chess, and shogi ideas, the rules engine should not assume one global ruleset forever.

It should eventually support:

- per-piece movement definitions
- per-piece promotion logic
- per-ruleset capture behavior
- optional hand/drop systems
- board-state triggers such as river crossing or promotion zones

That suggests a data-driven rules layer will be safer than baking all movement logic directly into one chess-only implementation.

## AI Direction

Enemy behavior will use Fairy-Stockfish.

### Immediate Use

In the first phase, use Fairy-Stockfish for standard chess encounters only.

### Long-Term Use

As additional piece types and rulesets are introduced, verify that the chosen Fairy-Stockfish setup can support:

- the relevant variant definitions
- custom piece movement
- promotion behavior
- hand/drop mechanics where applicable

If a desired hybrid ruleset falls outside what Fairy-Stockfish can cleanly express, the design may need to constrain variants to supported forms instead of allowing arbitrary mixing.

## Deployment And System Structure

The recommended system model is a single authoritative server hosted on a Raspberry Pi.

### Server Responsibilities

The Pi should run:

- the backend application
- the game rules and progression logic
- the save data layer
- the Fairy-Stockfish engine process

This keeps all authoritative decisions on one machine and avoids trusting the client with game state, rules enforcement, or engine communication.

### Client Responsibilities

Remote devices should act as thin clients. They should handle:

- the user interface
- setup and battle interaction
- rendering board state
- sending player actions to the backend

The client should not talk to Fairy-Stockfish directly. It should only communicate with the backend API or realtime server.

### Recommended Runtime Structure

Split the application into these layers:

- frontend client
- backend API
- engine adapter
- data layer

#### Frontend Client

The frontend is the browser-facing interface for:

- account or player session handling, if added
- piece setup and formation editing
- battle view
- progression and reward screens

#### Backend API

The backend is the authoritative application layer. It should manage:

- legal move validation
- level flow
- unlocked piece tracking
- battle start and end conditions
- communication with the engine adapter
- persistence of player progress

#### Engine Adapter

The engine adapter is a server-side module responsible for:

- starting Fairy-Stockfish as a local process
- sending positions and variant configuration to the engine
- requesting the enemy move
- parsing the engine response

This layer should isolate engine-specific protocol handling from the rest of the game server.

#### Data Layer

For the first version, persistence can be simple.

Recommended first choice:

- SQLite for player progression, unlocks, levels, and battle metadata

Possible later upgrades:

- PostgreSQL if multi-user scale or more complex operational needs appear

## Hosting Recommendation

The simplest practical first deployment is:

- one Raspberry Pi
- one backend service
- one locally installed Fairy-Stockfish binary
- one SQLite database file

This is enough for early development and personal hosting.

## Network Model

The browser or remote device should send requests to the backend over the network. The backend should then communicate with Fairy-Stockfish locally on the Pi.

This means:

- remote clients can play from another machine
- Fairy-Stockfish does not need to be exposed on the network
- the engine remains a private server-side dependency

## Domain And Remote Access

### Local-Only Use

If the game is only used inside the home network, a domain is not required.

### External Access

If the game should be reachable outside the house, a domain is useful but optional.

A domain becomes valuable when you want:

- a stable public URL
- HTTPS
- easier device access without remembering an IP and port

If the server is exposed publicly, place a reverse proxy in front of the application and apply basic hardening rather than exposing raw services directly.

## GitHub Role

GitHub should be used for:

- source control
- backup
- collaboration history
- future deployment automation, if desired

GitHub does not replace the game server. The backend, engine process, and save data should still run on the Pi.

## Recommended First Technical Bias

For the first implementation, favor:

- one backend application
- one local Fairy-Stockfish process
- one SQLite database
- one web frontend

The initial deployment should be simple enough that infrastructure does not become the main project.

## Suggested Repository Structure

One practical layout is:

```text
Gacha-chess/
├── README.md
├── docs/
│   └── game-design.md
├── client/
│   ├── src/
│   ├── public/
│   └── package.json
├── server/
│   ├── src/
│   │   ├── api/
│   │   ├── game/
│   │   ├── levels/
│   │   ├── progression/
│   │   ├── engine/
│   │   ├── db/
│   │   └── config/
│   ├── data/
│   ├── package.json
│   └── tsconfig.json
├── assets/
│   ├── pieces/
│   └── ui/
├── scripts/
├── deploy/
│   ├── systemd/
│   └── nginx/
└── third_party/
    └── fairy-stockfish/
```

### Directory Responsibilities

#### `client/`

Holds the browser application.

Suggested responsibilities:

- board rendering
- piece placement UI
- battle interaction UI
- progression screens
- API or websocket calls to the server

#### `server/`

Holds the authoritative game backend.

Suggested responsibilities:

- REST or websocket endpoints
- save and load behavior
- move validation
- level sequencing
- progression and unlock logic
- communication with Fairy-Stockfish

#### `server/src/api/`

Network-facing routes and request handling.

Examples:

- start level
- submit setup
- submit move
- fetch player progress

#### `server/src/game/`

Core match and rules logic.

Examples:

- board state representation
- turn order
- move application
- win and loss checks
- ruleset abstractions

#### `server/src/levels/`

Authored enemy encounters and stage definitions.

Examples:

- fixed enemy setups
- battle sequence definitions
- reward definitions

#### `server/src/progression/`

Player advancement systems.

Examples:

- unlocked piece tracking
- gacha reward tables
- progression milestones

#### `server/src/engine/`

Fairy-Stockfish integration layer.

Examples:

- process spawn logic
- engine protocol handling
- variant selection
- position serialization
- engine move requests

#### `server/src/db/`

Persistence logic and schema management.

Examples:

- SQLite connection
- migrations
- player save access
- level completion records

#### `server/data/`

Runtime data that should not live in source files.

Examples:

- SQLite database file
- local save snapshots
- generated logs, if desired

#### `assets/`

Shared static content.

Examples:

- piece sprites
- board textures
- UI art

#### `deploy/`

Deployment-specific files for the Raspberry Pi.

Examples:

- `systemd` service units
- `nginx` reverse proxy config
- environment templates

#### `third_party/fairy-stockfish/`

Third-party engine assets and metadata.

This is a reasonable place to store:

- the engine binary for supported platforms
- install notes
- version notes

If the binary is large or platform-specific, it may be cleaner to document installation steps instead of committing every build artifact into the repository.

## Suggested Server Module Boundaries

Inside the backend, keep these boundaries clear:

- API layer: accepts requests and returns responses
- game layer: contains rules and battle state
- engine layer: talks to Fairy-Stockfish
- persistence layer: stores and loads state

Do not let the frontend or API handlers directly encode engine protocol details. Keep Fairy-Stockfish isolated behind a small interface so the rest of the server can ask for things like:

- initialize battle
- request enemy move
- evaluate current position

## Raspberry Pi Deployment Checklist

For the first deployment, use a simple manual process.

### Pi Setup

- install the operating system on the Pi
- enable SSH
- give the Pi a stable local IP if possible
- install the runtime needed by the backend
- install or copy the Fairy-Stockfish binary onto the Pi

### Server Setup

- clone the repository from GitHub onto the Pi
- create the production environment file
- install backend dependencies
- build the server if the stack requires a build step
- create the SQLite database file and any schema bootstrap

### Process Management

- run the backend as a `systemd` service
- configure it to restart on boot
- ensure the backend can locate the Fairy-Stockfish binary by config path

### Network Setup

- start with LAN-only access first
- expose a single application port
- if public access is needed later, add a reverse proxy such as `nginx`
- only expose the web application, not the engine process

### Optional Public Access

If external access is needed later:

- get a domain
- point DNS to the home network entry point
- configure router port forwarding carefully
- terminate HTTPS at the reverse proxy

### Operational Basics

- keep periodic backups of the SQLite database
- log backend and engine failures
- pin the engine version being used
- document environment variables and deployment steps in the repo

## Recommended Near-Term Deliverables

A sensible implementation order is:

1. create the repo structure
2. choose the backend stack
3. implement a minimal server with health endpoints
4. integrate local Fairy-Stockfish process control
5. define the board and move state model
6. implement one playable standard-chess encounter
7. add progression and save data
8. add the setup UI

This order keeps infrastructure simple while proving the hardest game-specific integration early.

## First Playable Slice

A good first milestone is:

- standard chess board
- player unlock pool contains only pawn and rook
- authored enemy encounters with fixed setups
- player chooses a legal starting setup from their unlocked pool
- player always moves second
- single-level progression with a short sequence of battles
- Fairy-Stockfish controls the enemy side during play

This slice is enough to answer the most important questions:

- is the setup phase fun
- does moving second create good puzzle pressure
- can authored encounters and AI coexist well
- is progression meaningful with a very small piece pool

## Open Design Questions

These should be resolved before implementation goes too far:

- What constraints limit the player's setup phase:
  fixed budget, fixed slots, fixed squares, or free placement within a zone?
- Does the player carry the exact same setup through the whole level sequence, or reconfigure between battles?
- Are unlocks permanent collection items, consumable units, or just permission to include that piece type?
- Will different rulesets appear in separate campaigns, or can one encounter mix chess, Chinese chess, and shogi pieces?
- What loss condition applies across a level sequence:
  fail one battle and restart, or allow limited retries/checkpoints?
- How deterministic should gacha progression be for balance-sensitive content?

## Recommended Implementation Bias

For the first build, keep these boundaries:

- standard chess only
- no drops
- no river logic
- no shogi promotion zones
- no hybrid cross-ruleset encounters

Build the system so those features can be added later, but do not let later ambitions complicate the first playable version.
