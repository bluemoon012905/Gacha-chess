# Gacha-chess

Server-side strategy game built around chess-family pieces, gacha-style progression, and Fairy-Stockfish-driven enemy encounters.

## Project Direction

The game combines:

- staged progression through authored levels
- collectible and unlockable piece types
- pre-battle squad and board setup
- multiple chess-family rulesets over time
- Fairy-Stockfish as the enemy AI engine

## Documentation

- [Game Design Overview](docs/game-design.md)

## Current Scope

The initial version should stay narrow:

- start with standard chess pieces only
- player begins with a pawn and a rook unlocked
- player always moves second
- levels consist of a predefined series of enemy setups
- the player must choose a starting formation that can defeat the full encounter sequence

Later expansions can introduce Chinese chess and shogi rulesets after the core loop is stable.

## Hosting Direction

The recommended deployment model is:

- host the game server on a Raspberry Pi
- run Fairy-Stockfish locally on that same Pi
- have browser or remote clients talk to the backend only
- keep the source code in GitHub for version control and backup

The client should not communicate with Fairy-Stockfish directly. The backend should be the only process that talks to the engine.
