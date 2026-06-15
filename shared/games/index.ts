import { applyTimeoutIfNeeded } from "./chess/behaviors/engine";
import { applyChessAction, CHESS_GAME_META, configureChessGame, createChessGameState, normalizeChessState, startChessGame } from "./chess";
import {
  applyFiveTenKingAction,
  configureFiveTenKingGame,
  createFiveTenKingGameState,
  FIVE_TEN_KING_GAME_META,
  normalizeFiveTenKingState,
  startFiveTenKingGame,
} from "./five-ten-king";
import type { FiveTenKingState } from "./five-ten-king/logic/types";
import type { ChessState } from "./chess/logic/types";
import {
  applyFourteenPointsAction,
  chooseFourteenPointsAiAction,
  FOURTEEN_POINTS_GAME_META,
  createFourteenPointsGameState,
  normalizeFourteenPointsState,
  startFourteenPointsGame,
} from "./fourteen-points";
import type { FourteenPointsState } from "./fourteen-points/logic/types";
import type { AnyGameState, GameAction, GameCatalogEntry, GameKey, PlayerIdentity, RoomState, PlayableSeatRole } from "../types";

export const GAME_CATALOG: GameCatalogEntry[] = [
  CHESS_GAME_META,
  FOURTEEN_POINTS_GAME_META,
  FIVE_TEN_KING_GAME_META,
];

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
    case "fourteen-points":
      return createFourteenPointsGameState();
    case "five-ten-king":
      return createFiveTenKingGameState();
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
    case "fourteen-points":
      return state as FourteenPointsState;
    case "five-ten-king":
      return configureFiveTenKingGame(state as FiveTenKingState, config as Record<string, unknown>);
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
    case "fourteen-points":
      return startFourteenPointsGame(state as FourteenPointsState);
    case "five-ten-king":
      return startFiveTenKingGame(state as FiveTenKingState);
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
    case "fourteen-points":
      return applyFourteenPointsAction(state as FourteenPointsState, room, player, action);
    case "five-ten-king":
      return applyFiveTenKingAction(state as FiveTenKingState, room, player, action);
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
    case "fourteen-points":
      return normalizeFourteenPointsState(state as FourteenPointsState);
    case "five-ten-king":
      return normalizeFiveTenKingState(state as FiveTenKingState);
  }
}

export function normalizeGameState(gameKey: GameKey, state: AnyGameState): AnyGameState {
  switch (gameKey) {
    case "chess":
      return normalizeChessState(state as ChessState);
    case "fourteen-points":
      return normalizeFourteenPointsState(state as FourteenPointsState);
    case "five-ten-king":
      return normalizeFiveTenKingState(state as FiveTenKingState);
  }
}

export function getSeatOrderForGame(gameKey: GameKey): PlayableSeatRole[] {
  return getGameCatalogEntry(gameKey).seatOrder;
}

export { chooseFourteenPointsAiAction };
