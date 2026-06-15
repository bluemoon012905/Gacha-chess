import { applyMoveToGame, applyTimeoutIfNeeded, createFreshChessGame, createInitialCastlingRights, createInitialChessState } from "./behaviors/engine";
import type { ChessState, HostColorChoice, TimerPreset } from "./logic/types";
import type { GameCatalogEntry, GameAction, PlayerIdentity, RoomState, SeatRole } from "../../types";

export const CHESS_GAME_META: GameCatalogEntry = {
  key: "chess",
  name: "Standard Chess",
  summary: "Classic real-time room play with clocks, legal move enforcement, and explicit side selection.",
  accent: "Match Room",
  seatOrder: ["host", "guest"],
};

export type ChessConfigInput = {
  timerMs?: number;
  hostColor?: string;
};

const TIMER_PRESETS: TimerPreset[] = [60_000, 180_000, 300_000, 600_000];

export function isTimerPreset(value: number): value is TimerPreset {
  return TIMER_PRESETS.includes(value as TimerPreset);
}

export function isHostColorChoice(value: string): value is HostColorChoice {
  return value === "white" || value === "black";
}

export function createChessGameState(): ChessState {
  return createInitialChessState("white", 300_000);
}

export function configureChessGame(state: ChessState, body: ChessConfigInput): ChessState {
  const timerMs = body.timerMs;
  const hostColor = body.hostColor;

  if (typeof timerMs !== "number" || !isTimerPreset(timerMs)) {
    throw new Error("Choose a supported timer preset.");
  }

  if (typeof hostColor !== "string" || !isHostColorChoice(hostColor)) {
    throw new Error("Choose whether the host plays white or black.");
  }

  return createInitialChessState(hostColor, timerMs);
}

export function startChessGame(state: ChessState, startedAt: string): ChessState {
  return createFreshChessGame(state.hostColor, state.timerMs, startedAt);
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
  if (room.seats.host?.playerId === playerId) return "host";
  if (room.seats.guest?.playerId === playerId) return "guest";
  return "spectator";
}
