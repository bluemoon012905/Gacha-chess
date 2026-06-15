import { createFreshChessGame, createInitialCastlingRights, createInitialChessState } from "../logic/state";
import type {
  BoardState,
  CastlingRights,
  ChessState,
  HostColorChoice,
  MoveRecord,
  PieceCode,
  PieceColor,
  PieceRole,
  SpecialMove,
  TimerPreset,
} from "../logic/types";

type Piece = {
  color: PieceColor;
  role: PieceRole;
};

type SquarePoint = {
  row: number;
  col: number;
};

type MoveContext = {
  castlingRights: CastlingRights;
  enPassantTarget: string | null;
};

type ExecutedMove = {
  board: BoardState;
  captured: PieceCode | null;
  promotion: PieceCode | null;
  special: SpecialMove;
  castlingRights: CastlingRights;
  enPassantTarget: string | null;
};

const FILES = "abcdefgh";

export { createFreshChessGame, createInitialCastlingRights, createInitialChessState };
export type { HostColorChoice, TimerPreset };

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
  context?: Partial<MoveContext>,
): string[] {
  const point = squareToPoint(from);
  if (!point) return [];

  const piece = parsePiece(board[point.row][point.col]);
  if (!piece || piece.color !== activeColor) {
    return [];
  }

  const moveContext = toMoveContext(context);
  const pseudoMoves = getPseudoLegalMoves(board, point, piece, moveContext);

  return pseudoMoves
    .filter((toPoint) => {
      const executed = executeMove(
        {
          board,
          castlingRights: moveContext.castlingRights,
          enPassantTarget: moveContext.enPassantTarget,
        },
        point,
        toPoint,
        piece,
      );

      if (piece.role === "king" && Math.abs(toPoint.col - point.col) === 2) {
        const step = toPoint.col > point.col ? 1 : -1;
        const intermediatePoint = { row: point.row, col: point.col + step };
        const intermediateBoard = executeMove(
          {
            board,
            castlingRights: moveContext.castlingRights,
            enPassantTarget: moveContext.enPassantTarget,
          },
          point,
          intermediatePoint,
          piece,
        ).board;
        return (
          !isKingInCheck(board, activeColor) &&
          !isKingInCheck(intermediateBoard, activeColor) &&
          !isKingInCheck(executed.board, activeColor)
        );
      }

      return !isKingInCheck(executed.board, activeColor);
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

  const legalMoves = getLegalMovesForSquare(game.board, from, game.activeColor, {
    castlingRights: game.castlingRights,
    enPassantTarget: game.enPassantTarget,
  });
  if (!legalMoves.includes(to)) {
    throw new Error("Illegal move.");
  }

  const beforeWhite = getRemainingForColor(game, "white", movedAt);
  const beforeBlack = getRemainingForColor(game, "black", movedAt);
  const pieceMeta = parsePiece(piece);
  if (!pieceMeta) {
    throw new Error("Invalid piece state.");
  }

  const executed = executeMove(game, fromPoint, toPoint, pieceMeta);
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
    castlingRights: executed.castlingRights,
    enPassantTarget: executed.enPassantTarget,
  };

  const move: MoveRecord = {
    from,
    to,
    piece,
    captured: executed.captured,
    promotion: executed.promotion,
    special: executed.special,
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
  if (game.status !== "active" || game.activeColor !== color || !game.turnStartedAt) {
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

  const hasLegalResponse = boardHasLegalMoves(withClock, withClock.activeColor);
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

function boardHasLegalMoves(game: ChessState, color: PieceColor): boolean {
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const code = game.board[row][col];
      const piece = parsePiece(code);
      if (!piece || piece.color !== color) continue;
      const from = pointToSquare({ row, col });
      if (
        getLegalMovesForSquare(game.board, from, color, {
          castlingRights: game.castlingRights,
          enPassantTarget: game.enPassantTarget,
        }).length > 0
      ) {
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

  return isSquareAttacked(board, kingSquare, color === "white" ? "black" : "white");
}

function isSquareAttacked(
  board: BoardState,
  target: SquarePoint,
  byColor: PieceColor,
): boolean {
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const code = board[row][col];
      const piece = parsePiece(code);
      if (!piece || piece.color !== byColor) continue;
      const attacks = getAttackSquares(board, { row, col }, piece);
      if (attacks.some((point) => point.row === target.row && point.col === target.col)) {
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

function getPseudoLegalMoves(
  board: BoardState,
  from: SquarePoint,
  piece: Piece,
  context: MoveContext,
): SquarePoint[] {
  switch (piece.role) {
    case "pawn":
      return getPawnMoves(board, from, piece.color, context.enPassantTarget);
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
      return getKingMoves(board, from, piece.color, context.castlingRights);
    default:
      return [];
  }
}

function getAttackSquares(board: BoardState, from: SquarePoint, piece: Piece): SquarePoint[] {
  switch (piece.role) {
    case "pawn":
      return getPawnAttackSquares(from, piece.color);
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
      return getKingAdjacencyMoves(from);
    default:
      return [];
  }
}

function getPawnMoves(
  board: BoardState,
  from: SquarePoint,
  color: PieceColor,
  enPassantTarget: string | null,
): SquarePoint[] {
  const direction = color === "white" ? -1 : 1;
  const startRow = color === "white" ? 6 : 1;
  const moves: SquarePoint[] = [];

  const oneStep = { row: from.row + direction, col: from.col };
  if (isInBounds(oneStep) && !board[oneStep.row][oneStep.col]) {
    moves.push(oneStep);

    const twoStep = { row: from.row + direction * 2, col: from.col };
    if (
      from.row === startRow &&
      isInBounds(twoStep) &&
      !board[twoStep.row][twoStep.col]
    ) {
      moves.push(twoStep);
    }
  }

  for (const capture of getPawnAttackSquares(from, color)) {
    if (!isInBounds(capture)) continue;
    const target = parsePiece(board[capture.row][capture.col]);
    if (target && target.color !== color) {
      moves.push(capture);
      continue;
    }

    if (enPassantTarget && pointToSquare(capture) === enPassantTarget) {
      const adjacent = { row: from.row, col: capture.col };
      const adjacentPiece = parsePiece(board[adjacent.row][adjacent.col]);
      if (adjacentPiece?.role === "pawn" && adjacentPiece.color !== color) {
        moves.push(capture);
      }
    }
  }

  return moves;
}

function getPawnAttackSquares(from: SquarePoint, color: PieceColor): SquarePoint[] {
  const direction = color === "white" ? -1 : 1;
  return [
    { row: from.row + direction, col: from.col - 1 },
    { row: from.row + direction, col: from.col + 1 },
  ];
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
    .filter(isInBounds)
    .filter((point) => {
      const occupant = parsePiece(board[point.row][point.col]);
      return !occupant || occupant.color !== color;
    });
}

function getSlidingMoves(
  board: BoardState,
  from: SquarePoint,
  color: PieceColor,
  deltas: Array<[number, number]>,
): SquarePoint[] {
  const moves: SquarePoint[] = [];
  for (const [rowDelta, colDelta] of deltas) {
    let row = from.row + rowDelta;
    let col = from.col + colDelta;
    while (isInBounds({ row, col })) {
      const occupant = parsePiece(board[row][col]);
      if (!occupant) {
        moves.push({ row, col });
      } else {
        if (occupant.color !== color) {
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

function getKingMoves(
  board: BoardState,
  from: SquarePoint,
  color: PieceColor,
  castlingRights: CastlingRights,
): SquarePoint[] {
  const moves = getKingAdjacencyMoves(from).filter((point) => {
    if (!isInBounds(point)) return false;
    const occupant = parsePiece(board[point.row][point.col]);
    return !occupant || occupant.color !== color;
  });

  const rights = color === "white" ? castlingRights.white : castlingRights.black;
  const homeRow = color === "white" ? 7 : 0;
  if (from.row !== homeRow || from.col !== 4) {
    return moves;
  }

  if (
    rights.kingSide &&
    !board[homeRow][5] &&
    !board[homeRow][6] &&
    board[homeRow][7] === (color === "white" ? "wr" : "br")
  ) {
    moves.push({ row: homeRow, col: 6 });
  }

  if (
    rights.queenSide &&
    !board[homeRow][1] &&
    !board[homeRow][2] &&
    !board[homeRow][3] &&
    board[homeRow][0] === (color === "white" ? "wr" : "br")
  ) {
    moves.push({ row: homeRow, col: 2 });
  }

  return moves;
}

function getKingAdjacencyMoves(from: SquarePoint): SquarePoint[] {
  const moves: SquarePoint[] = [];
  for (let rowDelta = -1; rowDelta <= 1; rowDelta += 1) {
    for (let colDelta = -1; colDelta <= 1; colDelta += 1) {
      if (rowDelta === 0 && colDelta === 0) continue;
      moves.push({ row: from.row + rowDelta, col: from.col + colDelta });
    }
  }
  return moves;
}

function executeMove(
  gameLike: Pick<ChessState, "board" | "castlingRights" | "enPassantTarget">,
  from: SquarePoint,
  to: SquarePoint,
  piece: Piece,
): ExecutedMove {
  const board = cloneBoard(gameLike.board);
  const movingCode = board[from.row][from.col];
  if (!movingCode) {
    throw new Error("Invalid move source.");
  }

  let captured = board[to.row][to.col];
  let promotion: PieceCode | null = null;
  let special: SpecialMove = null;
  let enPassantTarget: string | null = null;
  const castlingRights = structuredClone(gameLike.castlingRights);

  board[from.row][from.col] = null;

  if (piece.role === "pawn" && to.col !== from.col && !captured) {
    const captureRow = piece.color === "white" ? to.row + 1 : to.row - 1;
    captured = board[captureRow][to.col];
    board[captureRow][to.col] = null;
    special = "en_passant";
  }

  if (piece.role === "king" && Math.abs(to.col - from.col) === 2) {
    const rookFromCol = to.col > from.col ? 7 : 0;
    const rookToCol = to.col > from.col ? 5 : 3;
    board[to.row][rookToCol] = board[to.row][rookFromCol];
    board[to.row][rookFromCol] = null;
    special = to.col > from.col ? "castle_king_side" : "castle_queen_side";
  }

  let placedCode = movingCode;
  if (piece.role === "pawn" && (to.row === 0 || to.row === 7)) {
    placedCode = piece.color === "white" ? "wq" : "bq";
    promotion = placedCode;
  }
  board[to.row][to.col] = placedCode;

  if (piece.role === "pawn" && Math.abs(to.row - from.row) === 2) {
    enPassantTarget = pointToSquare({ row: (from.row + to.row) / 2, col: from.col });
  }

  updateCastlingRights(castlingRights, movingCode, from, captured, to);

  return {
    board,
    captured,
    promotion,
    special,
    castlingRights,
    enPassantTarget,
  };
}

function updateCastlingRights(
  castlingRights: CastlingRights,
  movingCode: PieceCode,
  from: SquarePoint,
  captured: PieceCode | null,
  to: SquarePoint,
): void {
  if (movingCode === "wk") {
    castlingRights.white.kingSide = false;
    castlingRights.white.queenSide = false;
  } else if (movingCode === "bk") {
    castlingRights.black.kingSide = false;
    castlingRights.black.queenSide = false;
  } else if (movingCode === "wr") {
    if (from.row === 7 && from.col === 0) castlingRights.white.queenSide = false;
    if (from.row === 7 && from.col === 7) castlingRights.white.kingSide = false;
  } else if (movingCode === "br") {
    if (from.row === 0 && from.col === 0) castlingRights.black.queenSide = false;
    if (from.row === 0 && from.col === 7) castlingRights.black.kingSide = false;
  }

  if (captured === "wr") {
    if (to.row === 7 && to.col === 0) castlingRights.white.queenSide = false;
    if (to.row === 7 && to.col === 7) castlingRights.white.kingSide = false;
  } else if (captured === "br") {
    if (to.row === 0 && to.col === 0) castlingRights.black.queenSide = false;
    if (to.row === 0 && to.col === 7) castlingRights.black.kingSide = false;
  }
}

function toMoveContext(context?: Partial<MoveContext>): MoveContext {
  return {
    castlingRights: context?.castlingRights ?? createInitialCastlingRights(),
    enPassantTarget: context?.enPassantTarget ?? null,
  };
}

function isInBounds(point: SquarePoint): boolean {
  return point.row >= 0 && point.row < 8 && point.col >= 0 && point.col < 8;
}
