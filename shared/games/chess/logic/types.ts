export type PieceColor = "white" | "black";
export type PieceRole = "king" | "queen" | "rook" | "bishop" | "knight" | "pawn";
export type PieceCode =
  | "wk"
  | "wq"
  | "wr"
  | "wb"
  | "wn"
  | "wp"
  | "bk"
  | "bq"
  | "br"
  | "bb"
  | "bn"
  | "bp";
export type BoardState = Array<Array<PieceCode | null>>;

export type TimerPreset = 60_000 | 180_000 | 300_000 | 600_000;
export type MovePrioritySeat = "host" | "guest";
export type GameStatus = "waiting" | "active" | "checkmate" | "stalemate" | "timeout";
export type SpecialMove = "castle_king_side" | "castle_queen_side" | "en_passant" | null;

export type CastlingRights = {
  white: {
    kingSide: boolean;
    queenSide: boolean;
  };
  black: {
    kingSide: boolean;
    queenSide: boolean;
  };
};

export type MoveRecord = {
  from: string;
  to: string;
  piece: PieceCode;
  captured: PieceCode | null;
  promotion: PieceCode | null;
  special: SpecialMove;
  player: PieceColor;
  movedAt: string;
};

export type ChessState = {
  key: "chess";
  status: GameStatus;
  board: BoardState;
  hostColor: PieceColor;
  guestColor: PieceColor;
  activeColor: PieceColor;
  movePrioritySeat: MovePrioritySeat;
  timerMs: TimerPreset;
  whiteRemainingMs: number;
  blackRemainingMs: number;
  turnStartedAt: string | null;
  winner: PieceColor | null;
  checkedColor: PieceColor | null;
  castlingRights: CastlingRights;
  enPassantTarget: string | null;
  lastMove: MoveRecord | null;
  moves: MoveRecord[];
};
