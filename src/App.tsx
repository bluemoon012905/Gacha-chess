import { FormEvent, useEffect, useMemo, useState } from "react";

import { getLegalMovesForSquare } from "../shared/chess";
import type {
  BoardState,
  ChessState,
  MovePrioritySeat,
  PieceCode,
  RoomPayload,
  RoomSnapshot,
  SeatRole,
  TimerPreset,
} from "../shared/types";

type JoinResponse = RoomPayload & {
  role: SeatRole;
};

type RoomSocketMessage =
  | ({
      type: "room_state";
    } & RoomPayload)
  | {
      type: "pong";
    }
  | {
      type: "error";
      message: string;
    };

const TIMER_OPTIONS: Array<{ value: TimerPreset; label: string }> = [
  { value: 60_000, label: "1 minute" },
  { value: 180_000, label: "3 minutes" },
  { value: 300_000, label: "5 minutes" },
  { value: 600_000, label: "10 minutes" },
];

const PRIORITY_OPTIONS: Array<{ value: MovePrioritySeat; label: string }> = [
  { value: "host", label: "Host moves first" },
  { value: "guest", label: "Guest moves first" },
];

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

function getRoomIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/room\/([a-z0-9-]+)$/i);
  return match?.[1] ?? null;
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getOrCreatePlayerId(): string {
  const storageKey = "gacha-chess-player-id";
  const existing = window.localStorage.getItem(storageKey);
  if (existing) {
    return existing;
  }

  const nextValue = crypto.randomUUID();
  window.localStorage.setItem(storageKey, nextValue);
  return nextValue;
}

function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function squareLabel(row: number, col: number): string {
  return `${"abcdefgh"[col]}${8 - row}`;
}

function getSeatRole(room: RoomSnapshot | null, playerId: string): SeatRole {
  if (!room) return "spectator";
  if (room.hostPlayerId === playerId) return "host";
  if (room.guestPlayerId === playerId) return "guest";
  return "spectator";
}

function getPlayerColor(game: ChessState | null, role: SeatRole): "white" | "black" | null {
  if (!game) return null;
  if (role === "host") return game.hostColor;
  if (role === "guest") return game.guestColor;
  return null;
}

function useDerivedClock(game: ChessState | null): { white: number; black: number } {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!game || game.status !== "active" || !game.turnStartedAt) {
      return;
    }

    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 250);

    return () => window.clearInterval(timer);
  }, [game]);

  if (!game || game.status !== "active" || !game.turnStartedAt) {
    return {
      white: game?.whiteRemainingMs ?? 0,
      black: game?.blackRemainingMs ?? 0,
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

function gameStatusLabel(game: ChessState | null): string {
  if (!game) return "loading";
  switch (game.status) {
    case "waiting":
      return "pregame";
    case "active":
      return game.checkedColor ? `${game.activeColor} to move, ${game.checkedColor} in check` : `${game.activeColor} to move`;
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

export default function App() {
  const roomId = useMemo(() => getRoomIdFromPath(window.location.pathname), []);
  const playerId = useMemo(() => getOrCreatePlayerId(), []);
  const [roomState, setRoomState] = useState<RoomSnapshot | null>(null);
  const [gameState, setGameState] = useState<ChessState | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [configTimer, setConfigTimer] = useState<TimerPreset>(300_000);
  const [configPriority, setConfigPriority] = useState<MovePrioritySeat>("host");
  const joinRole = getSeatRole(roomState, playerId);
  const playerColor = getPlayerColor(gameState, joinRole);
  const legalTargets = useMemo(() => {
    if (!gameState || !selectedSquare) return [];
    return getLegalMovesForSquare(gameState.board, selectedSquare, gameState.activeColor, {
      castlingRights: gameState.castlingRights,
      enPassantTarget: gameState.enPassantTarget,
    });
  }, [gameState, selectedSquare]);
  const clocks = useDerivedClock(gameState);

  useEffect(() => {
    if (!gameState) return;
    setConfigTimer(gameState.timerMs);
    setConfigPriority(gameState.movePrioritySeat);
  }, [gameState]);

  useEffect(() => {
    if (!roomId) return;

    const controller = new AbortController();
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let active = true;

    async function loadRoom() {
      try {
        const response = await fetch(`/api/rooms/${roomId}`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Room was not found.");
        }

        const payload = (await response.json()) as RoomPayload;
        if (active) {
          setRoomState(payload.room);
          setGameState(payload.game);
        }
      } catch (caught) {
        if (active) {
          const nextError =
            caught instanceof Error ? caught.message : "Failed to load room.";
          setError(nextError);
        }
      }
    }

    function connectSocket() {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(`${protocol}//${window.location.host}/api/rooms/${roomId}/socket`);

      socket.addEventListener("open", () => {
        setError(null);
      });

      socket.addEventListener("message", (event) => {
        try {
          const payload = JSON.parse(event.data) as RoomSocketMessage;
          if (payload.type === "room_state") {
            setRoomState(payload.room);
            setGameState(payload.game);
            setError(null);
          } else if (payload.type === "error") {
            setError(payload.message);
          }
        } catch {
          setError("Received an invalid room update.");
        }
      });

      socket.addEventListener("close", () => {
        if (!active) return;
        reconnectTimer = window.setTimeout(connectSocket, 1500);
      });

      socket.addEventListener("error", () => {
        if (!active) return;
        setError("Realtime connection interrupted. Reconnecting...");
      });
    }

    void loadRoom();
    connectSocket();

    return () => {
      active = false;
      controller.abort();
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
      }
      socket?.close();
    };
  }, [roomId]);

  async function createRoom() {
    setPending(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/rooms", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Could not create a room.");
      }

      const payload = (await response.json()) as {
        roomId: string;
        roomUrl: string;
      };

      window.location.assign(payload.roomUrl);
    } catch (caught) {
      const nextError =
        caught instanceof Error ? caught.message : "Could not create room.";
      setError(nextError);
    } finally {
      setPending(false);
    }
  }

  async function joinRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setMessage(null);

    const normalizedCode = joinCode.trim().toLowerCase();
    if (!normalizedCode) {
      setError("Enter a room code first.");
      setPending(false);
      return;
    }

    window.location.assign(`/room/${normalizedCode}`);
  }

  async function claimSeat() {
    if (!roomId) return;

    setPending(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/rooms/${roomId}/join`, {
        method: "POST",
        headers: {
          "x-player-id": playerId,
        },
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? "Could not join this room.");
      }

      const payload = (await response.json()) as JoinResponse;
      setRoomState(payload.room);
      setGameState(payload.game);
      setMessage(
        payload.role === "spectator"
          ? "Room is already full. You joined as a spectator."
          : `You joined as ${payload.role}.`,
      );
    } catch (caught) {
      const nextError =
        caught instanceof Error ? caught.message : "Could not join room.";
      setError(nextError);
    } finally {
      setPending(false);
    }
  }

  async function saveConfiguration() {
    if (!roomId) return;
    setPending(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/rooms/${roomId}/configure`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-player-id": playerId,
        },
        body: JSON.stringify({
          timerMs: configTimer,
          movePrioritySeat: configPriority,
        }),
      });

      const payload = (await response.json()) as RoomPayload & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not save room settings.");
      }

      setRoomState(payload.room);
      setGameState(payload.game);
      setMessage("Game settings updated.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save settings.");
    } finally {
      setPending(false);
    }
  }

  async function startGame() {
    if (!roomId) return;
    setPending(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/rooms/${roomId}/start`, {
        method: "POST",
        headers: {
          "x-player-id": playerId,
        },
      });

      const payload = (await response.json()) as RoomPayload & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not start the game.");
      }

      setRoomState(payload.room);
      setGameState(payload.game);
      setSelectedSquare(null);
      setMessage("Match started.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start match.");
    } finally {
      setPending(false);
    }
  }

  async function submitMove(from: string, to: string) {
    if (!roomId) return;
    setPending(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/rooms/${roomId}/move`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-player-id": playerId,
        },
        body: JSON.stringify({ from, to }),
      });

      const payload = (await response.json()) as RoomPayload & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Move failed.");
      }

      setRoomState(payload.room);
      setGameState(payload.game);
      setSelectedSquare(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Move failed.");
    } finally {
      setPending(false);
    }
  }

  function handleSquareClick(square: string) {
    if (!gameState) return;
    if (gameState.status !== "active") return;

    const piece = getPieceCode(gameState.board, square);
    const isOwnPiece =
      piece &&
      playerColor &&
      ((piece.startsWith("w") && playerColor === "white") ||
        (piece.startsWith("b") && playerColor === "black"));

    if (selectedSquare && legalTargets.includes(square)) {
      void submitMove(selectedSquare, square);
      return;
    }

    if (isOwnPiece && gameState.activeColor === playerColor) {
      setSelectedSquare(square);
      return;
    }

    setSelectedSquare(null);
  }

  if (roomId) {
    return (
      <main className="app-shell">
        <section className="hero-panel room-panel room-layout">
          <div className="room-copy">
            <span className="eyebrow">Cloudflare Room</span>
            <h1>{roomId}</h1>
            <p className="lede">
              The room now has authoritative board state, host-selected timer presets,
              configurable first-move priority, and legal standard chess moves
              enforced in the Durable Object.
            </p>

            <div className="stats-grid">
              <article className="stat-card">
                <span>Room</span>
                <strong>{roomState?.status ?? "loading"}</strong>
              </article>
              <article className="stat-card">
                <span>Game</span>
                <strong>{gameStatusLabel(gameState)}</strong>
              </article>
              <article className="stat-card">
                <span>You</span>
                <strong>{joinRole}</strong>
              </article>
              <article className="stat-card">
                <span>Color</span>
                <strong>{playerColor ?? "spectator"}</strong>
              </article>
            </div>

            <div className="room-actions">
              <button disabled={pending} onClick={() => void claimSeat()}>
                {pending ? "Working..." : "Join this room"}
              </button>
              <button
                className="secondary"
                onClick={() => void navigator.clipboard.writeText(window.location.href)}
              >
                Copy invite link
              </button>
            </div>

            <div className="setup-panel">
              <div className="setup-row">
                <label>
                  Timer
                  <select
                    value={configTimer}
                    onChange={(event) => setConfigTimer(Number(event.target.value) as TimerPreset)}
                    disabled={joinRole !== "host" || gameState?.status === "active" || pending}
                  >
                    {TIMER_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  First move
                  <select
                    value={configPriority}
                    onChange={(event) =>
                      setConfigPriority(event.target.value as MovePrioritySeat)
                    }
                    disabled={joinRole !== "host" || gameState?.status === "active" || pending}
                  >
                    {PRIORITY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="setup-actions">
                <button
                  className="secondary"
                  disabled={joinRole !== "host" || gameState?.status === "active" || pending}
                  onClick={() => void saveConfiguration()}
                >
                  Save settings
                </button>
                <button
                  disabled={
                    joinRole !== "host" ||
                    !roomState?.hostJoined ||
                    !roomState?.guestJoined ||
                    gameState?.status === "active" ||
                    pending
                  }
                  onClick={() => void startGame()}
                >
                  Start match
                </button>
              </div>
            </div>

            <div className="seat-grid">
              <article className="seat-card">
                <span>Host</span>
                <strong>{roomState?.hostJoined ? "seated" : "open"}</strong>
                <small>{gameState?.hostColor ?? "white"}</small>
              </article>
              <article className="seat-card">
                <span>Guest</span>
                <strong>{roomState?.guestJoined ? "seated" : "open"}</strong>
                <small>{gameState?.guestColor ?? "black"}</small>
              </article>
            </div>

            {gameState?.lastMove ? (
              <p className="meta-line">
                Last move {gameState.lastMove.player}: {gameState.lastMove.from} to{" "}
                {gameState.lastMove.to}
              </p>
            ) : null}
            {roomState ? (
              <p className="meta-line">Created {formatTimestamp(roomState.createdAt)}</p>
            ) : null}
            <p className="meta-line">
              Current rules: standard movement, castling, en passant, and automatic queen
              promotion.
            </p>
            {message ? <p className="status-line">{message}</p> : null}
            {error ? <p className="error-line">{error}</p> : null}
          </div>

          <div className="board-panel">
            <div className="clock-row">
              <div className={`clock-card ${gameState?.activeColor === "black" ? "active" : ""}`}>
                <span>Black</span>
                <strong>{formatClock(clocks.black)}</strong>
              </div>
              <div className={`clock-card ${gameState?.activeColor === "white" ? "active" : ""}`}>
                <span>White</span>
                <strong>{formatClock(clocks.white)}</strong>
              </div>
            </div>

            <BoardView
              board={gameState?.board ?? emptyBoard()}
              selectedSquare={selectedSquare}
              legalTargets={legalTargets}
              onSquareClick={handleSquareClick}
            />

            <div className="move-list">
              <h2>Moves</h2>
              {gameState?.moves.length ? (
                <ol>
                  {gameState.moves.slice(-10).map((move, index) => (
                    <li key={`${move.movedAt}-${index}`}>
                      {move.player} {move.from}-{move.to}
                    </li>
                  ))}
                </ol>
              ) : (
                <p>No moves yet.</p>
              )}
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <span className="eyebrow">Cloudflare Prototype</span>
        <h1>Start a room. Share the link. Play the match live.</h1>
        <p className="lede">
          This room prototype now supports real in-room chess state: both seats can
          join, the host can set a timer and first-move priority, and the Worker
          validates legal moves for the running game.
        </p>

        <div className="cta-row">
          <button disabled={pending} onClick={() => void createRoom()}>
            {pending ? "Creating..." : "Start new room"}
          </button>
        </div>

        <form className="join-form" onSubmit={(event) => void joinRoom(event)}>
          <label htmlFor="room-code">Have a room code?</label>
          <div className="join-input-row">
            <input
              id="room-code"
              name="room-code"
              value={joinCode}
              onChange={(event) => setJoinCode(event.target.value)}
              placeholder="enter room code"
            />
            <button className="secondary" type="submit" disabled={pending}>
              Open room
            </button>
          </div>
        </form>

        <div className="feature-grid">
          <article className="feature-card">
            <h2>Timer control</h2>
            <p>Host-selectable 1, 3, 5, and 10 minute clocks with authoritative turn timing.</p>
          </article>
          <article className="feature-card">
            <h2>Move priority</h2>
            <p>Choose whether the host seat or guest seat gets the first move before the match starts.</p>
          </article>
          <article className="feature-card">
            <h2>Board state</h2>
            <p>Standard move legality runs in the Durable Object and syncs to both browsers over WebSockets.</p>
          </article>
        </div>

        {message ? <p className="status-line">{message}</p> : null}
        {error ? <p className="error-line">{error}</p> : null}
      </section>
    </main>
  );
}

function BoardView({
  board,
  selectedSquare,
  legalTargets,
  onSquareClick,
}: {
  board: BoardState;
  selectedSquare: string | null;
  legalTargets: string[];
  onSquareClick: (square: string) => void;
}) {
  return (
    <div className="board-grid" role="grid" aria-label="Chess board">
      {board.map((row, rowIndex) =>
        row.map((piece, colIndex) => {
          const square = squareLabel(rowIndex, colIndex);
          const isDark = (rowIndex + colIndex) % 2 === 1;
          const isSelected = selectedSquare === square;
          const isTarget = legalTargets.includes(square);
          return (
            <button
              key={square}
              type="button"
              className={[
                "board-square",
                isDark ? "dark" : "light",
                isSelected ? "selected" : "",
                isTarget ? "target" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => onSquareClick(square)}
            >
              <span className="square-piece">{piece ? PIECE_GLYPHS[piece] : ""}</span>
              <span className="square-label">{square}</span>
            </button>
          );
        }),
      )}
    </div>
  );
}

function emptyBoard(): BoardState {
  return Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => null));
}

function getPieceCode(board: BoardState, square: string): PieceCode | null {
  const fileIndex = "abcdefgh".indexOf(square[0]);
  const rank = Number(square[1]);
  const rowIndex = 8 - rank;
  return board[rowIndex]?.[fileIndex] ?? null;
}
