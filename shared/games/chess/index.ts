import { applyMoveToGame, applyTimeoutIfNeeded, createFreshChessGame, createInitialCastlingRights, createInitialChessState } from "./behaviors/engine";
import type { ChessState, MovePrioritySeat, TimerPreset } from "./logic/types";
import type { GameCatalogEntry, GameAction, PlayerIdentity, RoomState, SeatRole } from "../../types";

export const CHESS_GAME_META: GameCatalogEntry = {
  key: "chess",
  name: "Standard Chess",
  summary: "Classic real-time room play with clocks, legal move enforcement, and seat-based turns.",
  accent: "Match Room",
};

export type ChessConfigInput = {
  timerMs?: number;
  movePrioritySeat?: string;
};

const TIMER_PRESETS: TimerPreset[] = [60_000, 180_000, 300_000, 600_000];

export function isTimerPreset(value: number): value is TimerPreset {
  return TIMER_PRESETS.includes(value as TimerPreset);
}

export function isMovePrioritySeat(value: string): value is MovePrioritySeat {
  return value === "host" || value === "guest";
}

export function createChessGameState(): ChessState {
  return createInitialChessState("host", 300_000);
}

export function configureChessGame(state: ChessState, body: ChessConfigInput): ChessState {
  const timerMs = body.timerMs;
  const movePrioritySeat = body.movePrioritySeat;

  if (typeof timerMs !== "number" || !isTimerPreset(timerMs)) {
    throw new Error("Choose a supported timer preset.");
  }

  if (typeof movePrioritySeat !== "string" || !isMovePrioritySeat(movePrioritySeat)) {
    throw new Error("Choose which seat moves first.");
  }

  return createInitialChessState(movePrioritySeat, timerMs);
}

export function startChessGame(state: ChessState, startedAt: string): ChessState {
  return createFreshChessGame(state.movePrioritySeat, state.timerMs, startedAt);
}

export function applyChessAction(
  state: ChessState,
  room: RoomState,
  player: PlayerIdentity,
  action: GameAction,
): ChessState {
  const seatRole = resolveSeatRole(room, player.playerId);
  const withClock = applyTimeoutIfNeeded(state, new Date().toISOString());
  const playerColor =
    seatRole === "host"
      ? withClock.hostColor
      : seatRole === "guest"
        ? withClock.guestColor
        : null;

  if (!playerColor) {
    throw new Error("Spectators cannot act in the game.");
  }

  if (withClock.status !== "active") {
    throw new Error("The game is not active.");
  }

  if (withClock.activeColor !== playerColor) {
    throw new Error("It is not your turn.");
  }

  if (action.type !== "move") {
    throw new Error("Unsupported chess action.");
  }

  return applyMoveToGame(
    withClock,
    action.payload.from,
    action.payload.to,
    new Date().toISOString(),
  ).next;
}

export function normalizeChessState(state: ChessState): ChessState {
  return {
    ...state,
    key: "chess",
    castlingRights: state.castlingRights ?? createInitialCastlingRights(),
    enPassantTarget: state.enPassantTarget ?? null,
    lastMove: state.lastMove
      ? {
          ...state.lastMove,
          special: state.lastMove.special ?? null,
        }
      : null,
    moves: state.moves.map((move) => ({
      ...move,
      special: move.special ?? null,
    })),
  };
}

function resolveSeatRole(room: RoomState, playerId: string): SeatRole {
  if (room.host.playerId === playerId) return "host";
  if (room.guest.playerId === playerId) return "guest";
  return "spectator";
}
