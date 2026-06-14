import { applyTimeoutIfNeeded } from "./chess/behaviors/engine";
import { applyChessAction, CHESS_GAME_META, configureChessGame, createChessGameState, normalizeChessState, startChessGame } from "./chess";
import type { ChessState } from "./chess/logic/types";
import type { AnyGameState, GameAction, GameCatalogEntry, GameKey, PlayerIdentity, RoomState } from "../types";

export const GAME_CATALOG: GameCatalogEntry[] = [CHESS_GAME_META];

export function isGameKey(value: string): value is GameKey {
  return GAME_CATALOG.some((entry) => entry.key === value);
}

export function getGameCatalogEntry(gameKey: GameKey): GameCatalogEntry {
  const entry = GAME_CATALOG.find((item) => item.key === gameKey);
  if (!entry) {
    throw new Error(`Unknown game key: ${gameKey}`);
  }
  return entry;
}

export function createGameState(gameKey: GameKey): AnyGameState {
  switch (gameKey) {
    case "chess":
      return createChessGameState();
  }
}

export function configureGameState(
  gameKey: GameKey,
  state: AnyGameState,
  config: unknown,
): AnyGameState {
  switch (gameKey) {
    case "chess":
      return configureChessGame(state as ChessState, config as Record<string, unknown>);
  }
}

export function startGameState(
  gameKey: GameKey,
  state: AnyGameState,
  startedAt: string,
): AnyGameState {
  switch (gameKey) {
    case "chess":
      return startChessGame(state as ChessState, startedAt);
  }
}

export function applyGameAction(
  gameKey: GameKey,
  state: AnyGameState,
  room: RoomState,
  player: PlayerIdentity,
  action: GameAction,
): AnyGameState {
  switch (gameKey) {
    case "chess":
      return applyChessAction(state as ChessState, room, player, action);
  }
}

export function refreshGameState(
  gameKey: GameKey,
  state: AnyGameState,
  nowIso: string,
): AnyGameState {
  switch (gameKey) {
    case "chess":
      return normalizeChessState(applyTimeoutIfNeeded(state as ChessState, nowIso));
  }
}

export function normalizeGameState(gameKey: GameKey, state: AnyGameState): AnyGameState {
  switch (gameKey) {
    case "chess":
      return normalizeChessState(state as ChessState);
  }
}
