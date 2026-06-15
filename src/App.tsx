import { FormEvent, useEffect, useMemo, useState } from "react";

import { ChessRoomView } from "./games/chess/ChessRoomView";
import { getOrCreatePlayerIdentity } from "./lib/player";
import { getRoomIdFromPath } from "./lib/routes";
import { GAME_CATALOG, getGameCatalogEntry } from "../shared/games";
import type { ChessState, HostColorChoice, TimerPreset } from "../shared/chess";
import type {
  CreateRoomResponse,
  GameAction,
  GameKey,
  JoinResponse,
  RoomPayload,
  RoomSnapshot,
  SeatRole,
} from "../shared/types";

type RoomSocketMessage =
  | ({ type: "room_state" } & RoomPayload)
  | { type: "pong" }
  | { type: "error"; message: string };

const TIMER_OPTIONS: Array<{ value: TimerPreset; label: string }> = [
  { value: 60_000, label: "1 minute" },
  { value: 180_000, label: "3 minutes" },
  { value: 300_000, label: "5 minutes" },
  { value: 600_000, label: "10 minutes" },
];

const COLOR_OPTIONS: Array<{ value: HostColorChoice; label: string }> = [
  { value: "white", label: "Play white" },
  { value: "black", label: "Play black" },
];

function getSeatRole(room: RoomSnapshot | null, playerId: string): SeatRole {
  if (!room) return "spectator";
  if (room.host.playerId === playerId) return "host";
  if (room.guest.playerId === playerId) return "guest";
  return "spectator";
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function HomePage({
  gameKey,
  joinCode,
  pending,
  message,
  error,
  createTimer,
  createHostColor,
  onGameSelect,
  onJoinCodeChange,
  onCreateTimerChange,
  onCreateHostColorChange,
  onCreateRoom,
  onJoinRoom,
}: {
  gameKey: GameKey;
  joinCode: string;
  pending: boolean;
  message: string | null;
  error: string | null;
  createTimer: TimerPreset;
  createHostColor: HostColorChoice;
  onGameSelect: (value: GameKey) => void;
  onJoinCodeChange: (value: string) => void;
  onCreateTimerChange: (value: TimerPreset) => void;
  onCreateHostColorChange: (value: HostColorChoice) => void;
  onCreateRoom: () => Promise<void>;
  onJoinRoom: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div className="hero-copy">
          <span className="eyebrow">Arcade Lobby</span>
          <h1>Choose a game, then open or find a room.</h1>
          <p className="lede">
            Room creation, seat claims, realtime updates, and player identity are now shared
            infrastructure. Each game plugs into that layer through its own logic and behavior
            module.
          </p>
        </div>

        <div className="game-grid">
          {GAME_CATALOG.map((game) => (
            <button
              key={game.key}
              className={`game-card ${game.key === gameKey ? "selected" : ""}`}
              onClick={() => onGameSelect(game.key)}
              type="button"
            >
              <span>{game.accent}</span>
              <strong>{game.name}</strong>
              <p>{game.summary}</p>
            </button>
          ))}
        </div>

        <div className="lobby-grid">
          <section className="panel-card">
            <h2>Start a room</h2>
            <p>Launch a new room for {getGameCatalogEntry(gameKey).name}.</p>
            {gameKey === "chess" ? (
              <div className="join-form">
                <label>
                  Your color
                  <select
                    disabled={pending}
                    onChange={(event) =>
                      onCreateHostColorChange(event.target.value as HostColorChoice)
                    }
                    value={createHostColor}
                  >
                    {COLOR_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Time control
                  <select
                    disabled={pending}
                    onChange={(event) => onCreateTimerChange(Number(event.target.value) as TimerPreset)}
                    value={createTimer}
                  >
                    {TIMER_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}
            <button disabled={pending} onClick={() => void onCreateRoom()} type="button">
              {pending ? "Starting..." : "Create room"}
            </button>
          </section>

          <section className="panel-card">
            <h2>Find a room</h2>
            <form className="join-form" onSubmit={onJoinRoom}>
              <label htmlFor="join-code">Room code</label>
              <div className="join-input-row">
                <input
                  id="join-code"
                  onChange={(event) => onJoinCodeChange(event.target.value)}
                  placeholder="Paste a room code"
                  value={joinCode}
                />
                <button disabled={pending} type="submit">
                  Join
                </button>
              </div>
            </form>
          </section>
        </div>

        {message ? <p className="status-line">{message}</p> : null}
        {error ? <p className="error-line">{error}</p> : null}
      </section>
    </main>
  );
}

function RoomPage({
  roomId,
  roomState,
  gameState,
  joinRole,
  playerName,
  pending,
  message,
  error,
  configTimer,
  configHostColor,
  onClaimSeat,
  onSaveConfiguration,
  onTimerChange,
  onHostColorChange,
  onStartGame,
  onCopyInvite,
  onMove,
}: {
  roomId: string;
  roomState: RoomSnapshot | null;
  gameState: ChessState | null;
  joinRole: SeatRole;
  playerName: string;
  pending: boolean;
  message: string | null;
  error: string | null;
  configTimer: TimerPreset;
  configHostColor: HostColorChoice;
  onClaimSeat: () => Promise<void>;
  onSaveConfiguration: () => Promise<void>;
  onTimerChange: (value: TimerPreset) => void;
  onHostColorChange: (value: HostColorChoice) => void;
  onStartGame: () => Promise<void>;
  onCopyInvite: () => Promise<void>;
  onMove: (from: string, to: string) => Promise<void>;
}) {
  const gameMeta = roomState ? getGameCatalogEntry(roomState.gameKey) : null;

  return (
    <main className="app-shell room-shell">
      <section className="hero-panel room-layout">
        <div className="room-copy">
          <span className="eyebrow">{gameMeta?.accent ?? "Room"}</span>
          <h1>{roomId}</h1>
          <p className="lede">
            {gameMeta?.summary ?? "Loading room metadata."}
          </p>

          <div className="stats-grid">
            <article className="stat-card">
              <span>Room</span>
              <strong>{roomState?.status ?? "loading"}</strong>
            </article>
            <article className="stat-card">
              <span>You</span>
              <strong>{playerName}</strong>
            </article>
            <article className="stat-card">
              <span>Seat</span>
              <strong>{joinRole}</strong>
            </article>
            <article className="stat-card">
              <span>Created</span>
              <strong>{roomState ? formatTimestamp(roomState.createdAt) : "..."}</strong>
            </article>
          </div>

          <div className="seat-grid">
            <article className="seat-card">
              <span>Host</span>
              <strong>
                {roomState?.host.displayName ?? "Open seat"}
                {gameState ? ` · ${gameState.hostColor}` : ""}
              </strong>
            </article>
            <article className="seat-card">
              <span>Guest</span>
              <strong>
                {roomState?.guest.displayName ?? "Open seat"}
                {gameState ? ` · ${gameState.guestColor}` : ""}
              </strong>
            </article>
          </div>

          <div className="room-actions">
            <button disabled={pending} onClick={() => void onClaimSeat()} type="button">
              {pending ? "Working..." : "Join this room"}
            </button>
            <button className="secondary" onClick={() => void onCopyInvite()} type="button">
              Copy invite link
            </button>
          </div>

          {gameState ? (
            <div className="setup-panel">
              <div className="setup-row">
                <label>
                  Timer
                  <select
                    disabled={joinRole !== "host" || gameState.status === "active" || pending}
                    onChange={(event) => onTimerChange(Number(event.target.value) as TimerPreset)}
                    value={configTimer}
                  >
                    {TIMER_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Host color
                  <select
                    disabled={joinRole !== "host" || gameState.status === "active" || pending}
                    onChange={(event) => onHostColorChange(event.target.value as HostColorChoice)}
                    value={configHostColor}
                  >
                    {COLOR_OPTIONS.map((option) => (
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
                  disabled={joinRole !== "host" || pending}
                  onClick={() => void onSaveConfiguration()}
                  type="button"
                >
                  Save settings
                </button>
                <button
                  disabled={joinRole !== "host" || pending || roomState?.status !== "ready"}
                  onClick={() => void onStartGame()}
                  type="button"
                >
                  Start match
                </button>
              </div>
            </div>
          ) : null}

          {message ? <p className="status-line">{message}</p> : null}
          {error ? <p className="error-line">{error}</p> : null}
        </div>

        <div className="room-stage">
          {gameState ? (
            <ChessRoomView
              game={gameState}
              joinRole={joinRole}
              onAction={onMove}
              pending={pending}
            />
          ) : (
            <section className="panel-card">
              <h2>Loading room</h2>
              <p>Waiting for room state from the Worker.</p>
            </section>
          )}
        </div>
      </section>
    </main>
  );
}

export default function App() {
  const roomId = useMemo(() => getRoomIdFromPath(window.location.pathname), []);
  const player = useMemo(() => getOrCreatePlayerIdentity(), []);
  const [selectedGame, setSelectedGame] = useState<GameKey>("chess");
  const [joinCode, setJoinCode] = useState("");
  const [roomState, setRoomState] = useState<RoomSnapshot | null>(null);
  const [gameState, setGameState] = useState<ChessState | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createTimer, setCreateTimer] = useState<TimerPreset>(300_000);
  const [createHostColor, setCreateHostColor] = useState<HostColorChoice>("white");
  const [configTimer, setConfigTimer] = useState<TimerPreset>(300_000);
  const [configHostColor, setConfigHostColor] = useState<HostColorChoice>("white");
  const joinRole = getSeatRole(roomState, player.playerId);

  useEffect(() => {
    if (!gameState) return;
    setConfigTimer(gameState.timerMs);
    setConfigHostColor(gameState.hostColor);
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
        if (!active) return;
        setRoomState(payload.room);
        setGameState(payload.game as ChessState);
        setSelectedGame(payload.room.gameKey);
        setError(null);
      } catch (caught) {
        if (!active) return;
        setError(caught instanceof Error ? caught.message : "Failed to load room.");
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
            setGameState(payload.game as ChessState);
            setSelectedGame(payload.room.gameKey);
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
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          gameKey: selectedGame,
          config:
            selectedGame === "chess"
              ? {
                  timerMs: createTimer,
                  hostColor: createHostColor,
                }
              : undefined,
        }),
      });

      const payload = (await response.json()) as CreateRoomResponse & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not create a room.");
      }

      window.location.assign(payload.roomUrl);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create room.");
    } finally {
      setPending(false);
    }
  }

  function joinRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    const normalizedCode = joinCode.trim().toLowerCase();
    if (!normalizedCode) {
      setError("Enter a room code first.");
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
          "x-player-id": player.playerId,
          "x-player-name": player.displayName,
        },
      });

      const payload = (await response.json()) as JoinResponse & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not join this room.");
      }

      setRoomState(payload.room);
      setGameState(payload.game as ChessState);
      setMessage(
        payload.role === "spectator"
          ? "Room is already full. You joined as a spectator."
          : `You joined as ${payload.playerName}.`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not join room.");
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
          "x-player-id": player.playerId,
          "x-player-name": player.displayName,
        },
        body: JSON.stringify({
          timerMs: configTimer,
          hostColor: configHostColor,
        }),
      });

      const payload = (await response.json()) as RoomPayload & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not save room settings.");
      }

      setRoomState(payload.room);
      setGameState(payload.game as ChessState);
      setMessage("Room settings updated.");
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
          "x-player-id": player.playerId,
          "x-player-name": player.displayName,
        },
      });

      const payload = (await response.json()) as RoomPayload & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not start the game.");
      }

      setRoomState(payload.room);
      setGameState(payload.game as ChessState);
      setMessage("Match started.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start match.");
    } finally {
      setPending(false);
    }
  }

  async function sendAction(action: GameAction) {
    if (!roomId) return;

    setPending(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/rooms/${roomId}/action`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-player-id": player.playerId,
          "x-player-name": player.displayName,
        },
        body: JSON.stringify(action),
      });

      const payload = (await response.json()) as RoomPayload & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Action failed.");
      }

      setRoomState(payload.room);
      setGameState(payload.game as ChessState);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Action failed.");
    } finally {
      setPending(false);
    }
  }

  async function copyInvite() {
    await navigator.clipboard.writeText(window.location.href);
    setMessage("Invite link copied.");
  }

  if (!roomId) {
    return (
      <HomePage
        error={error}
        gameKey={selectedGame}
        joinCode={joinCode}
        message={message}
        createHostColor={createHostColor}
        createTimer={createTimer}
        onCreateRoom={createRoom}
        onCreateHostColorChange={setCreateHostColor}
        onCreateTimerChange={setCreateTimer}
        onGameSelect={setSelectedGame}
        onJoinCodeChange={setJoinCode}
        onJoinRoom={joinRoom}
        pending={pending}
      />
    );
  }

  return (
    <RoomPage
      configHostColor={configHostColor}
      configTimer={configTimer}
      error={error}
      gameState={gameState}
      joinRole={joinRole}
      message={message}
      onClaimSeat={claimSeat}
      onCopyInvite={copyInvite}
      onMove={(from, to) => sendAction({ type: "move", payload: { from, to } })}
      onHostColorChange={setConfigHostColor}
      onSaveConfiguration={saveConfiguration}
      onStartGame={startGame}
      onTimerChange={setConfigTimer}
      pending={pending}
      playerName={player.displayName}
      roomId={roomId}
      roomState={roomState}
    />
  );
}
