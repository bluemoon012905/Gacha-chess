import { useEffect, useMemo, useState } from "react";

import { getLegalMovesForSquare } from "../../../shared/chess";
import type { BoardState, ChessState, PieceCode } from "../../../shared/chess";
import type { SeatRole } from "../../../shared/types";

type Props = {
  game: ChessState;
  joinRole: SeatRole;
  pending: boolean;
  onAction: (from: string, to: string) => Promise<void>;
};

const PIECE_GLYPHS: Record<PieceCode, string> = {
  wk: "♔",
  wq: "♕",
  wr: "♖",
  wb: "♗",
  wn: "♘",
  wp: "♙",
  bk: "♚",
  bq: "♛",
  br: "♜",
  bb: "♝",
  bn: "♞",
  bp: "♟",
};

function squareLabel(row: number, col: number): string {
  return `${"abcdefgh"[col]}${8 - row}`;
}

function getPieceCode(board: BoardState, square: string): PieceCode | null {
  const file = "abcdefgh".indexOf(square[0]);
  const rank = Number(square[1]);
  if (file < 0 || rank < 1 || rank > 8) return null;
  return board[8 - rank]?.[file] ?? null;
}

function getPlayerColor(game: ChessState, role: SeatRole): "white" | "black" | null {
  if (role === "host") return game.hostColor;
  if (role === "guest") return game.guestColor;
  return null;
}

function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function useDerivedClock(game: ChessState): { white: number; black: number } {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (game.status !== "active" || !game.turnStartedAt) {
      return;
    }

    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 250);

    return () => window.clearInterval(timer);
  }, [game]);

  if (game.status !== "active" || !game.turnStartedAt) {
    return {
      white: game.whiteRemainingMs,
      black: game.blackRemainingMs,
    };
  }

  const elapsed = Math.max(0, now - Date.parse(game.turnStartedAt));
  return {
    white:
      game.activeColor === "white"
        ? Math.max(0, game.whiteRemainingMs - elapsed)
        : game.whiteRemainingMs,
    black:
      game.activeColor === "black"
        ? Math.max(0, game.blackRemainingMs - elapsed)
        : game.blackRemainingMs,
  };
}

function gameStatusLabel(game: ChessState): string {
  switch (game.status) {
    case "waiting":
      return "pregame";
    case "active":
      return game.checkedColor
        ? `${game.activeColor} to move, ${game.checkedColor} in check`
        : `${game.activeColor} to move`;
    case "checkmate":
      return `checkmate, ${game.winner} wins`;
    case "stalemate":
      return "stalemate";
    case "timeout":
      return `timeout, ${game.winner} wins`;
    default:
      return game.status;
  }
}

export function ChessRoomView({ game, joinRole, pending, onAction }: Props) {
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const playerColor = getPlayerColor(game, joinRole);
  const clocks = useDerivedClock(game);
  const legalTargets = useMemo(() => {
    if (!selectedSquare) return [];
    return getLegalMovesForSquare(game.board, selectedSquare, game.activeColor, {
      castlingRights: game.castlingRights,
      enPassantTarget: game.enPassantTarget,
    });
  }, [game, selectedSquare]);

  async function handleSquareClick(square: string) {
    if (game.status !== "active") return;

    const piece = getPieceCode(game.board, square);
    const isOwnPiece =
      piece &&
      playerColor &&
      ((piece.startsWith("w") && playerColor === "white") ||
        (piece.startsWith("b") && playerColor === "black"));

    if (selectedSquare && legalTargets.includes(square)) {
      await onAction(selectedSquare, square);
      setSelectedSquare(null);
      return;
    }

    if (isOwnPiece && game.activeColor === playerColor) {
      setSelectedSquare(square);
      return;
    }

    setSelectedSquare(null);
  }

  return (
    <section className="board-shell">
      <div className="board-meta">
        <div className={`clock-card ${game.activeColor === "white" ? "active" : ""}`}>
          <span>White</span>
          <strong>{formatClock(clocks.white)}</strong>
        </div>
        <div className={`clock-card ${game.activeColor === "black" ? "active" : ""}`}>
          <span>Black</span>
          <strong>{formatClock(clocks.black)}</strong>
        </div>
        <div className="stat-card">
          <span>Status</span>
          <strong>{gameStatusLabel(game)}</strong>
        </div>
      </div>

      <div className="board-panel">
        <div className="board-grid" aria-label="Chess board">
          {game.board.map((row, rowIndex) =>
            row.map((piece, colIndex) => {
              const square = squareLabel(rowIndex, colIndex);
              const isLight = (rowIndex + colIndex) % 2 === 0;
              const isSelected = selectedSquare === square;
              const isTarget = legalTargets.includes(square);

              return (
                <button
                  key={square}
                  className={[
                    "board-square",
                    isLight ? "light" : "dark",
                    isSelected ? "selected" : "",
                    isTarget ? "target" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  disabled={pending}
                  onClick={() => void handleSquareClick(square)}
                  type="button"
                >
                  <span className="square-label">{square}</span>
                  <span className="piece-glyph">{piece ? PIECE_GLYPHS[piece] : ""}</span>
                </button>
              );
            }),
          )}
        </div>

        <div className="move-list">
          <h2>Moves</h2>
          {game.moves.length === 0 ? (
            <p>No moves yet.</p>
          ) : (
            <ol>
              {game.moves.map((move, index) => (
                <li key={`${move.from}-${move.to}-${index}`}>
                  {index + 1}. {move.player} {move.from}-{move.to}
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </section>
  );
}
