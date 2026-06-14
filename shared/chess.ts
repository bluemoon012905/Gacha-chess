import type {
  BoardState,
  ChessState,
  MoveRecord,
  MovePrioritySeat,
  PieceCode,
  PieceColor,
  PieceRole,
  TimerPreset,
} from "./types";

type Piece = {
  color: PieceColor;
  role: PieceRole;
};

type SquarePoint = {
  row: number;
  col: number;
};

const FILES = "abcdefgh";

const BACK_RANK: PieceCode[] = ["br", "bn", "bb", "bq", "bk", "bb", "bn", "br"];
const WHITE_BACK_RANK: PieceCode[] = ["wr", "wn", "wb", "wq", "wk", "wb", "wn", "wr"];

export function createInitialBoard(): BoardState {
  return [
    [...BACK_RANK],
    Array.from({ length: 8 }, () => "bp" as PieceCode),
    Array.from({ length: 8 }, () => null),
    Array.from({ length: 8 }, () => null),
    Array.from({ length: 8 }, () => null),
    Array.from({ length: 8 }, () => null),
    Array.from({ length: 8 }, () => "wp" as PieceCode),
    [...WHITE_BACK_RANK],
  ];
}

export function createInitialChessState(
  movePrioritySeat: MovePrioritySeat,
  timerMs: TimerPreset,
): ChessState {
  return {
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
    lastMove: null,
    moves: [],
  };
}

export function createFreshGame(
  movePrioritySeat: MovePrioritySeat,
  timerMs: TimerPreset,
  startedAt: string,
): ChessState {
  const state = createInitialChessState(movePrioritySeat, timerMs);
  return {
    ...state,
    status: "active",
    turnStartedAt: startedAt,
    checkedColor: getCheckedColor(state.board),
  };
}

export function cloneBoard(board: BoardState): BoardState {
  return board.map((row) => [...row]);
}

export function parsePiece(code: PieceCode | null): Piece | null {
  if (!code) return null;
  const color = code[0] === "w" ? "white" : "black";
  const roleMap: Record<string, PieceRole> = {
    k: "king",
    q: "queen",
    r: "rook",
    b: "bishop",
    n: "knight",
    p: "pawn",
  };
  return {
    color,
    role: roleMap[code[1]],
  };
}

export function pointToSquare(point: SquarePoint): string {
  return `${FILES[point.col]}${8 - point.row}`;
}

export function squareToPoint(square: string): SquarePoint | null {
  if (!/^[a-h][1-8]$/i.test(square)) {
    return null;
  }

  const file = square[0].toLowerCase();
  const rank = Number(square[1]);
  return {
    row: 8 - rank,
    col: FILES.indexOf(file),
  };
}

export function getPieceAt(board: BoardState, square: string): PieceCode | null {
  const point = squareToPoint(square);
  if (!point) return null;
  return board[point.row]?.[point.col] ?? null;
}

export function getLegalMovesForSquare(
  board: BoardState,
  from: string,
  activeColor: PieceColor,
): string[] {
  const point = squareToPoint(from);
  if (!point) return [];

  const piece = parsePiece(board[point.row][point.col]);
  if (!piece || piece.color !== activeColor) {
    return [];
  }

  const pseudoMoves = getPseudoLegalMoves(board, point, piece);
  return pseudoMoves
    .filter((toPoint) => {
      const nextBoard = performMove(board, point, toPoint).board;
      return !isKingInCheck(nextBoard, activeColor);
    })
    .map(pointToSquare);
}

export function applyMoveToGame(
  game: ChessState,
  from: string,
  to: string,
  movedAt: string,
): {
  next: ChessState;
  move: MoveRecord;
} {
  const fromPoint = squareToPoint(from);
  const toPoint = squareToPoint(to);
  if (!fromPoint || !toPoint) {
    throw new Error("Invalid move coordinates.");
  }

  const piece = getPieceAt(game.board, from);
  if (!piece) {
    throw new Error("No piece on the selected square.");
  }

  const legalMoves = getLegalMovesForSquare(game.board, from, game.activeColor);
  if (!legalMoves.includes(to)) {
    throw new Error("Illegal move.");
  }

  const beforeWhite = getRemainingForColor(game, "white", movedAt);
  const beforeBlack = getRemainingForColor(game, "black", movedAt);
  const executed = performMove(game.board, fromPoint, toPoint);
  const nextActiveColor = game.activeColor === "white" ? "black" : "white";
  const checkedColor = getCheckedColor(executed.board);
  const nextStateBase: ChessState = {
    ...game,
    board: executed.board,
    activeColor: nextActiveColor,
    whiteRemainingMs: beforeWhite,
    blackRemainingMs: beforeBlack,
    turnStartedAt: movedAt,
    checkedColor,
  };

  const move: MoveRecord = {
    from,
    to,
    piece,
    captured: executed.captured,
    promotion: executed.promotion,
    player: game.activeColor,
    movedAt,
  };

  const gameResult = evaluateGameResult(nextStateBase, movedAt);

  return {
    move,
    next: {
      ...nextStateBase,
      status: gameResult.status,
      winner: gameResult.winner,
      turnStartedAt: gameResult.status === "active" ? movedAt : null,
      lastMove: move,
      moves: [...game.moves, move],
    },
  };
}

export function getRemainingForColor(
  game: ChessState,
  color: PieceColor,
  nowIso: string,
): number {
  const base = color === "white" ? game.whiteRemainingMs : game.blackRemainingMs;
  if (
    game.status !== "active" ||
    game.activeColor !== color ||
    !game.turnStartedAt
  ) {
    return base;
  }

  const elapsed = Math.max(0, Date.parse(nowIso) - Date.parse(game.turnStartedAt));
  return Math.max(0, base - elapsed);
}

export function applyTimeoutIfNeeded(game: ChessState, nowIso: string): ChessState {
  if (game.status !== "active") {
    return game;
  }

  const remaining = getRemainingForColor(game, game.activeColor, nowIso);
  if (remaining > 0) {
    return game;
  }

  return {
    ...game,
    whiteRemainingMs: getRemainingForColor(game, "white", nowIso),
    blackRemainingMs: getRemainingForColor(game, "black", nowIso),
    status: "timeout",
    winner: game.activeColor === "white" ? "black" : "white",
    turnStartedAt: null,
  };
}

function evaluateGameResult(
  game: ChessState,
  nowIso: string,
): { status: ChessState["status"]; winner: PieceColor | null } {
  const withClock = applyTimeoutIfNeeded(game, nowIso);
  if (withClock.status === "timeout") {
    return {
      status: "timeout",
      winner: withClock.winner,
    };
  }

  const hasLegalResponse = boardHasLegalMoves(withClock.board, withClock.activeColor);
  if (hasLegalResponse) {
    return {
      status: "active",
      winner: null,
    };
  }

  const inCheck = isKingInCheck(withClock.board, withClock.activeColor);
  return {
    status: inCheck ? "checkmate" : "stalemate",
    winner: inCheck ? (withClock.activeColor === "white" ? "black" : "white") : null,
  };
}

function boardHasLegalMoves(board: BoardState, color: PieceColor): boolean {
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const code = board[row][col];
      const piece = parsePiece(code);
      if (!piece || piece.color !== color) continue;
      const from = pointToSquare({ row, col });
      if (getLegalMovesForSquare(board, from, color).length > 0) {
        return true;
      }
    }
  }
  return false;
}

function getCheckedColor(board: BoardState): PieceColor | null {
  if (isKingInCheck(board, "white")) return "white";
  if (isKingInCheck(board, "black")) return "black";
  return null;
}

function isKingInCheck(board: BoardState, color: PieceColor): boolean {
  const kingSquare = findKing(board, color);
  if (!kingSquare) {
    return true;
  }

  const opponent = color === "white" ? "black" : "white";
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const code = board[row][col];
      const piece = parsePiece(code);
      if (!piece || piece.color !== opponent) continue;
      const moves = getPseudoLegalMoves(board, { row, col }, piece);
      if (moves.some((move) => move.row === kingSquare.row && move.col === kingSquare.col)) {
        return true;
      }
    }
  }

  return false;
}

function findKing(board: BoardState, color: PieceColor): SquarePoint | null {
  const target = color === "white" ? "wk" : "bk";
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      if (board[row][col] === target) {
        return { row, col };
      }
    }
  }
  return null;
}

function getPseudoLegalMoves(board: BoardState, from: SquarePoint, piece: Piece): SquarePoint[] {
  switch (piece.role) {
    case "pawn":
      return getPawnMoves(board, from, piece.color);
    case "knight":
      return getKnightMoves(board, from, piece.color);
    case "bishop":
      return getSlidingMoves(board, from, piece.color, [
        [-1, -1],
        [-1, 1],
        [1, -1],
        [1, 1],
      ]);
    case "rook":
      return getSlidingMoves(board, from, piece.color, [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ]);
    case "queen":
      return getSlidingMoves(board, from, piece.color, [
        [-1, -1],
        [-1, 1],
        [1, -1],
        [1, 1],
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ]);
    case "king":
      return getKingMoves(board, from, piece.color);
    default:
      return [];
  }
}

function getPawnMoves(board: BoardState, from: SquarePoint, color: PieceColor): SquarePoint[] {
  const direction = color === "white" ? -1 : 1;
  const startRow = color === "white" ? 6 : 1;
  const moves: SquarePoint[] = [];

  const oneStep = { row: from.row + direction, col: from.col };
  if (isInBounds(oneStep) && !board[oneStep.row][oneStep.col]) {
    moves.push(oneStep);

    const twoStep = { row: from.row + direction * 2, col: from.col };
    if (from.row === startRow && !board[twoStep.row][twoStep.col]) {
      moves.push(twoStep);
    }
  }

  for (const fileOffset of [-1, 1]) {
    const capture = { row: from.row + direction, col: from.col + fileOffset };
    if (!isInBounds(capture)) continue;
    const target = parsePiece(board[capture.row][capture.col]);
    if (target && target.color !== color) {
      moves.push(capture);
    }
  }

  return moves;
}

function getKnightMoves(board: BoardState, from: SquarePoint, color: PieceColor): SquarePoint[] {
  const deltas = [
    [-2, -1],
    [-2, 1],
    [-1, -2],
    [-1, 2],
    [1, -2],
    [1, 2],
    [2, -1],
    [2, 1],
  ];

  return deltas
    .map(([rowDelta, colDelta]) => ({ row: from.row + rowDelta, col: from.col + colDelta }))
    .filter((point) => canLandOn(board, point, color));
}

function getKingMoves(board: BoardState, from: SquarePoint, color: PieceColor): SquarePoint[] {
  const moves: SquarePoint[] = [];
  for (let rowDelta = -1; rowDelta <= 1; rowDelta += 1) {
    for (let colDelta = -1; colDelta <= 1; colDelta += 1) {
      if (rowDelta === 0 && colDelta === 0) continue;
      const point = { row: from.row + rowDelta, col: from.col + colDelta };
      if (canLandOn(board, point, color)) {
        moves.push(point);
      }
    }
  }
  return moves;
}

function getSlidingMoves(
  board: BoardState,
  from: SquarePoint,
  color: PieceColor,
  directions: Array<[number, number]>,
): SquarePoint[] {
  const moves: SquarePoint[] = [];

  for (const [rowDelta, colDelta] of directions) {
    let row = from.row + rowDelta;
    let col = from.col + colDelta;

    while (isInBounds({ row, col })) {
      const target = parsePiece(board[row][col]);
      if (!target) {
        moves.push({ row, col });
      } else {
        if (target.color !== color) {
          moves.push({ row, col });
        }
        break;
      }
      row += rowDelta;
      col += colDelta;
    }
  }

  return moves;
}

function performMove(
  board: BoardState,
  from: SquarePoint,
  to: SquarePoint,
): {
  board: BoardState;
  captured: PieceCode | null;
  promotion: PieceCode | null;
} {
  const nextBoard = cloneBoard(board);
  const piece = nextBoard[from.row][from.col];
  if (!piece) {
    throw new Error("No piece on the source square.");
  }

  const captured = nextBoard[to.row][to.col];
  nextBoard[from.row][from.col] = null;

  let nextPiece = piece;
  let promotion: PieceCode | null = null;
  if (piece === "wp" && to.row === 0) {
    nextPiece = "wq";
    promotion = "wq";
  } else if (piece === "bp" && to.row === 7) {
    nextPiece = "bq";
    promotion = "bq";
  }

  nextBoard[to.row][to.col] = nextPiece;

  return {
    board: nextBoard,
    captured,
    promotion,
  };
}

function canLandOn(board: BoardState, point: SquarePoint, color: PieceColor): boolean {
  if (!isInBounds(point)) return false;
  const target = parsePiece(board[point.row][point.col]);
  return !target || target.color !== color;
}

function isInBounds(point: SquarePoint): boolean {
  return point.row >= 0 && point.row < 8 && point.col >= 0 && point.col < 8;
}
