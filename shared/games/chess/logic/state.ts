import type { BoardState, CastlingRights, ChessState, MovePrioritySeat, PieceCode, TimerPreset } from "./types";

const BLACK_BACK_RANK: PieceCode[] = ["br", "bn", "bb", "bq", "bk", "bb", "bn", "br"];
const WHITE_BACK_RANK: PieceCode[] = ["wr", "wn", "wb", "wq", "wk", "wb", "wn", "wr"];

export function createInitialBoard(): BoardState {
  return [
    [...BLACK_BACK_RANK],
    Array.from({ length: 8 }, () => "bp" as PieceCode),
    Array.from({ length: 8 }, () => null),
    Array.from({ length: 8 }, () => null),
    Array.from({ length: 8 }, () => null),
    Array.from({ length: 8 }, () => null),
    Array.from({ length: 8 }, () => "wp" as PieceCode),
    [...WHITE_BACK_RANK],
  ];
}

export function createInitialCastlingRights(): CastlingRights {
  return {
    white: { kingSide: true, queenSide: true },
    black: { kingSide: true, queenSide: true },
  };
}

export function createInitialChessState(
  movePrioritySeat: MovePrioritySeat,
  timerMs: TimerPreset,
): ChessState {
  return {
    key: "chess",
    status: "waiting",
    board: createInitialBoard(),
    hostColor: "white",
    guestColor: "black",
    activeColor: movePrioritySeat === "host" ? "white" : "black",
    movePrioritySeat,
    timerMs,
    whiteRemainingMs: timerMs,
    blackRemainingMs: timerMs,
    turnStartedAt: null,
    winner: null,
    checkedColor: null,
    castlingRights: createInitialCastlingRights(),
    enPassantTarget: null,
    lastMove: null,
    moves: [],
  };
}

export function createFreshChessGame(
  movePrioritySeat: MovePrioritySeat,
  timerMs: TimerPreset,
  startedAt: string,
): ChessState {
  const state = createInitialChessState(movePrioritySeat, timerMs);
  return {
    ...state,
    status: "active",
    turnStartedAt: startedAt,
  };
}
