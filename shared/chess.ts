import type {
  BoardState,
  CastlingRights,
  ChessState,
  MoveRecord,
  MovePrioritySeat,
  PieceCode,
  PieceColor,
  PieceRole,
  SpecialMove,
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
  return [-1, 1]
    .map((fileOffset) => ({ row: from.row + direction, col: from.col + fileOffset }))
    .filter(isInBounds);
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

function getKingMoves(
  board: BoardState,
  from: SquarePoint,
  color: PieceColor,
  castlingRights: CastlingRights,
): SquarePoint[] {
  const moves = getKingAdjacencyMoves(from).filter((point) => canLandOn(board, point, color));
  const rights = color === "white" ? castlingRights.white : castlingRights.black;
  const homeRow = color === "white" ? 7 : 0;

  if (from.row !== homeRow || from.col !== 4) {
    return moves;
  }

  if (rights.kingSide && canCastle(board, color, "kingSide")) {
    moves.push({ row: homeRow, col: 6 });
  }

  if (rights.queenSide && canCastle(board, color, "queenSide")) {
    moves.push({ row: homeRow, col: 2 });
  }

  return moves;
}

function getKingAdjacencyMoves(from: SquarePoint): SquarePoint[] {
  const moves: SquarePoint[] = [];
  for (let rowDelta = -1; rowDelta <= 1; rowDelta += 1) {
    for (let colDelta = -1; colDelta <= 1; colDelta += 1) {
      if (rowDelta === 0 && colDelta === 0) continue;
      const point = { row: from.row + rowDelta, col: from.col + colDelta };
      if (isInBounds(point)) {
        moves.push(point);
      }
    }
  }
  return moves;
}

function canCastle(
  board: BoardState,
  color: PieceColor,
  side: "kingSide" | "queenSide",
): boolean {
  const row = color === "white" ? 7 : 0;
  const rookCol = side === "kingSide" ? 7 : 0;
  const rookCode = color === "white" ? "wr" : "br";
  const kingCode = color === "white" ? "wk" : "bk";

  if (board[row][4] !== kingCode || board[row][rookCol] !== rookCode) {
    return false;
  }

  const emptyCols = side === "kingSide" ? [5, 6] : [1, 2, 3];
  if (emptyCols.some((col) => board[row][col] !== null)) {
    return false;
  }

  return true;
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

function executeMove(
  game: Pick<ChessState, "board" | "castlingRights" | "enPassantTarget">,
  from: SquarePoint,
  to: SquarePoint,
  piece: Piece,
): ExecutedMove {
  const nextBoard = cloneBoard(game.board);
  const sourcePiece = nextBoard[from.row][from.col];
  if (!sourcePiece) {
    throw new Error("No piece on the source square.");
  }

  const nextCastlingRights = cloneCastlingRights(game.castlingRights);
  const targetPiece = nextBoard[to.row][to.col];
  let captured = targetPiece;
  let special: SpecialMove = null;
  let enPassantTarget: string | null = null;

  nextBoard[from.row][from.col] = null;

  if (
    piece.role === "pawn" &&
    from.col !== to.col &&
    targetPiece === null &&
    game.enPassantTarget === pointToSquare(to)
  ) {
    const capturedPawnPoint = { row: from.row, col: to.col };
    captured = nextBoard[capturedPawnPoint.row][capturedPawnPoint.col];
    nextBoard[capturedPawnPoint.row][capturedPawnPoint.col] = null;
    special = "en_passant";
  }

  let movedPiece = sourcePiece;
  let promotion: PieceCode | null = null;

  if (piece.role === "king" && Math.abs(to.col - from.col) === 2) {
    special = to.col > from.col ? "castle_king_side" : "castle_queen_side";
    const rookFromCol = special === "castle_king_side" ? 7 : 0;
    const rookToCol = special === "castle_king_side" ? 5 : 3;
    const rookPiece = nextBoard[from.row][rookFromCol];
    nextBoard[from.row][rookFromCol] = null;
    nextBoard[from.row][rookToCol] = rookPiece;
  }

  if (sourcePiece === "wp" && to.row === 0) {
    movedPiece = "wq";
    promotion = "wq";
  } else if (sourcePiece === "bp" && to.row === 7) {
    movedPiece = "bq";
    promotion = "bq";
  }

  nextBoard[to.row][to.col] = movedPiece;

  if (piece.role === "pawn" && Math.abs(to.row - from.row) === 2) {
    enPassantTarget = pointToSquare({
      row: (from.row + to.row) / 2,
      col: from.col,
    });
  }

  updateCastlingRightsForMove(nextCastlingRights, sourcePiece, from);
  if (captured) {
    updateCastlingRightsForCapture(nextCastlingRights, captured, to);
  }

  return {
    board: nextBoard,
    captured,
    promotion,
    special,
    castlingRights: nextCastlingRights,
    enPassantTarget,
  };
}

function updateCastlingRightsForMove(
  rights: CastlingRights,
  piece: PieceCode,
  from: SquarePoint,
): void {
  if (piece === "wk") {
    rights.white.kingSide = false;
    rights.white.queenSide = false;
    return;
  }

  if (piece === "bk") {
    rights.black.kingSide = false;
    rights.black.queenSide = false;
    return;
  }

  if (piece === "wr" && from.row === 7 && from.col === 0) {
    rights.white.queenSide = false;
  } else if (piece === "wr" && from.row === 7 && from.col === 7) {
    rights.white.kingSide = false;
  } else if (piece === "br" && from.row === 0 && from.col === 0) {
    rights.black.queenSide = false;
  } else if (piece === "br" && from.row === 0 && from.col === 7) {
    rights.black.kingSide = false;
  }
}

function updateCastlingRightsForCapture(
  rights: CastlingRights,
  captured: PieceCode,
  at: SquarePoint,
): void {
  if (captured === "wr" && at.row === 7 && at.col === 0) {
    rights.white.queenSide = false;
  } else if (captured === "wr" && at.row === 7 && at.col === 7) {
    rights.white.kingSide = false;
  } else if (captured === "br" && at.row === 0 && at.col === 0) {
    rights.black.queenSide = false;
  } else if (captured === "br" && at.row === 0 && at.col === 7) {
    rights.black.kingSide = false;
  }
}

function cloneCastlingRights(rights: CastlingRights): CastlingRights {
  return {
    white: { ...rights.white },
    black: { ...rights.black },
  };
}

function toMoveContext(context?: Partial<MoveContext>): MoveContext {
  return {
    castlingRights: context?.castlingRights ?? createInitialCastlingRights(),
    enPassantTarget: context?.enPassantTarget ?? null,
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
