import { FormEvent, useEffect, useMemo, useState } from "react";

import { ChessRoomView } from "./games/chess/ChessRoomView";
import { FourteenPointsRoomView } from "./games/fourteen-points/FourteenPointsRoomView";
import { getOrCreatePlayerIdentity } from "./lib/player";
import { getRoomIdFromPath } from "./lib/routes";
import { GAME_CATALOG, getGameCatalogEntry } from "../shared/games";
import type { ChessState, HostColorChoice, TimerPreset } from "../shared/chess";
import type { FourteenPointsState } from "../shared/fourteen-points";
import type {
  AnyGameState,
  CreateRoomResponse,
  GameAction,
  GameKey,
  JoinResponse,
  LobbyAction,
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

function getRoomHostName(room: RoomSnapshot | null): string {
  if (!room?.roomHostPlayerId) return "Unassigned";
  return room.members.find((member) => member.playerId === room.roomHostPlayerId)?.displayName ?? "Unassigned";
}

function isRoomMember(room: RoomSnapshot | null, playerId: string): boolean {
  return room?.members.some((member) => member.playerId === playerId) ?? false;
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
      <section className="hero-panel lobby-page">
        <div className="page-marker">
          <span className="eyebrow">Front Desk</span>
          <span className="page-count">Page 1</span>
        </div>

        <div className="hero-copy">
          <p className="kicker">Gacha Chess Club</p>
          <h1>Pick a table and start playing.</h1>
          <p className="lede">
            Clean tables, sharp cards, and room codes that are easy to pass around.
          </p>
        </div>

        <section className="panel-card page-note">
          <p>
            Choose a game first. Then either open a fresh room or step into one with a code.
          </p>
        </section>

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
            <div className="section-heading">
              <span className="panel-index">01</span>
              <div>
                <h2>Start a room</h2>
                <p>{getGameCatalogEntry(gameKey).name} will open with your current settings.</p>
              </div>
            </div>
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
            <div className="section-heading">
              <span className="panel-index">02</span>
              <div>
                <h2>Find a room</h2>
                <p>Drop in with a room code.</p>
              </div>
            </div>
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
  isRoomHost,
  isMember,
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
  onLobbyAction,
  onMove,
  onCapture,
  onDrawAndDiscard,
}: {
  roomId: string;
  roomState: RoomSnapshot | null;
  gameState: AnyGameState | null;
  joinRole: SeatRole;
  isRoomHost: boolean;
  isMember: boolean;
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
  onLobbyAction: (action: LobbyAction) => Promise<void>;
  onMove: (from: string, to: string) => Promise<void>;
  onCapture: (handCardId: string, openCardIds: string[]) => Promise<void>;
  onDrawAndDiscard: (discardCardId: string) => Promise<void>;
}) {
  const gameMeta = roomState ? getGameCatalogEntry(roomState.gameKey) : null;
  const chessState = gameState?.key === "chess" ? (gameState as ChessState) : null;
  const fourteenPointsState =
    gameState?.key === "fourteen-points" ? (gameState as FourteenPointsState) : null;
  const hasGameStarted = chessState
    ? chessState.status !== "waiting"
    : fourteenPointsState
      ? fourteenPointsState.status !== "waiting"
      : false;

  return (
    <main className="app-shell room-shell">
      <section className={`hero-panel room-layout ${hasGameStarted ? "play-layout" : ""}`}>
        {!hasGameStarted ? (
          <div className="room-copy room-sidebar">
            <div className="page-marker">
              <span className="eyebrow">{gameMeta?.accent ?? "Room"}</span>
              <a className="text-link" href="/">
                Back to lobby
              </a>
            </div>
            <h1>{roomId}</h1>
            <p className="lede">{gameMeta?.summary ?? "Loading room details."}</p>

            <section className="panel-card page-note">
              <p>
                Share this code, seat two players, then start when the table is ready.
              </p>
            </section>

            <div className="stats-grid">
              <article className="stat-card">
                <span>Room state</span>
                <strong>{roomState?.status ?? "loading"}</strong>
              </article>
              <article className="stat-card">
                <span>Members</span>
                <strong>{roomState?.playerCount ?? 0}</strong>
              </article>
              <article className="stat-card">
                <span>You</span>
                <strong>{playerName}</strong>
              </article>
              <article className="stat-card">
                <span>Desk host</span>
                <strong>{getRoomHostName(roomState)}</strong>
              </article>
            </div>

            <div className="seat-grid">
              <article className="seat-card">
                <span>Created</span>
                <strong>{roomState ? formatTimestamp(roomState.createdAt) : "..."}</strong>
              </article>
              <article className="seat-card">
                <span>Your seat</span>
                <strong>{isRoomHost ? `${joinRole} · room host` : joinRole}</strong>
              </article>
              <article className="seat-card">
                <span>Seats filled</span>
                <strong>
                  {roomState ? `${roomState.seatedPlayerCount}/2 seated` : "..."}
                </strong>
              </article>
            </div>

            <div className="seat-grid">
              <article className="seat-card">
                <span>Seat A</span>
                <strong>
                  {roomState?.host.displayName ?? "Open seat"}
                  {chessState ? ` · ${chessState.hostColor}` : ""}
                </strong>
              </article>
              <article className="seat-card">
                <span>Seat B</span>
                <strong>
                  {roomState?.guest.displayName ?? "Open seat"}
                  {chessState ? ` · ${chessState.guestColor}` : ""}
                </strong>
              </article>
            </div>

            <div className="panel-card">
              <div className="section-heading">
                <span className="panel-index">Roster</span>
                <div>
                  <h2>Room Members</h2>
                  <p>Assign seats and keep the table organized.</p>
                </div>
              </div>
              {roomState?.members.length ? (
                <div className="member-list">
                  {roomState.members.map((member) => (
                    <div className="member-card" key={member.playerId}>
                      <strong>{member.displayName}</strong>
                      <span>
                        {member.playerId === roomState.roomHostPlayerId
                          ? "Room host"
                          : member.playerId === roomState.host.playerId
                            ? "Seat A"
                            : member.playerId === roomState.guest.playerId
                              ? "Seat B"
                              : "Watcher"}
                      </span>
                      {isRoomHost ? (
                        <div className="member-actions">
                          <button
                            className="secondary"
                            disabled={pending}
                            onClick={() =>
                              void onLobbyAction({
                                type: "assign_seat",
                                payload: { memberId: member.playerId, seat: "host" },
                              })
                            }
                            type="button"
                          >
                            Make Seat A
                          </button>
                          <button
                            className="secondary"
                            disabled={pending}
                            onClick={() =>
                              void onLobbyAction({
                                type: "assign_seat",
                                payload: { memberId: member.playerId, seat: "guest" },
                              })
                            }
                            type="button"
                          >
                            Make Seat B
                          </button>
                          <button
                            className="secondary"
                            disabled={pending || member.playerId === roomState.roomHostPlayerId}
                            onClick={() =>
                              void onLobbyAction({
                                type: "transfer_room_host",
                                payload: { memberId: member.playerId },
                              })
                            }
                            type="button"
                          >
                            Transfer Host
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p>No one has joined yet.</p>
              )}
              {isRoomHost ? (
                <div className="setup-actions">
                  <button
                    className="secondary"
                    disabled={pending || !roomState?.host.playerId}
                    onClick={() => void onLobbyAction({ type: "clear_seat", payload: { seat: "host" } })}
                    type="button"
                  >
                    Clear Seat A
                  </button>
                  <button
                    className="secondary"
                    disabled={pending || !roomState?.guest.playerId}
                    onClick={() => void onLobbyAction({ type: "clear_seat", payload: { seat: "guest" } })}
                    type="button"
                  >
                    Clear Seat B
                  </button>
                </div>
              ) : null}
            </div>

            <div className="room-actions">
              <button disabled={pending} onClick={() => void onClaimSeat()} type="button">
                {pending ? "Working..." : isMember ? "Refresh membership" : "Join this room"}
              </button>
              <button className="secondary" onClick={() => void onCopyInvite()} type="button">
                Copy invite link
              </button>
            </div>

            {chessState ? (
              <div className="setup-panel">
                <div className="section-heading">
                  <span className="panel-index">Setup</span>
                  <div>
                    <h2>Match settings</h2>
                    <p>Only the room host can edit these before the game starts.</p>
                  </div>
                </div>
                <div className="setup-row">
                  <label>
                    Timer
                    <select
                      disabled={!isRoomHost || chessState.status !== "waiting" || pending}
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
                      disabled={!isRoomHost || chessState.status !== "waiting" || pending}
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
                    disabled={!isRoomHost || pending || chessState.status !== "waiting"}
                    onClick={() => void onSaveConfiguration()}
                    type="button"
                  >
                    Save settings
                  </button>
                  <button
                    disabled={
                      !isRoomHost ||
                      pending ||
                      roomState?.status !== "ready" ||
                      chessState.status !== "waiting"
                    }
                    onClick={() => void onStartGame()}
                    type="button"
                  >
                    Start match
                  </button>
                </div>
              </div>
            ) : (
              <div className="setup-panel">
                <p className="status-line">
                  Spectators can watch, but two seated players are required to begin.
                </p>
                <div className="setup-actions">
                  <button
                    disabled={!isRoomHost || pending || roomState?.status !== "ready"}
                    onClick={() => void onStartGame()}
                    type="button"
                  >
                    Start match
                  </button>
                </div>
              </div>
            )}

            {message ? <p className="status-line">{message}</p> : null}
            {error ? <p className="error-line">{error}</p> : null}
          </div>
        ) : null}

        <div className="room-stage">
          {hasGameStarted ? (
            <div className="play-header">
              <div className="page-marker">
                <span className="eyebrow">{gameMeta?.accent ?? "Game"}</span>
                <div className="play-header-actions">
                  <button className="secondary" onClick={() => void onCopyInvite()} type="button">
                    Copy invite link
                  </button>
                  <a className="text-link" href="/">
                    Back to lobby
                  </a>
                </div>
              </div>
              {message ? <p className="status-line">{message}</p> : null}
              {error ? <p className="error-line">{error}</p> : null}
            </div>
          ) : null}

          {chessState ? (
            <ChessRoomView
              game={chessState}
              joinRole={joinRole}
              onAction={onMove}
              pending={pending}
            />
          ) : fourteenPointsState ? (
            <FourteenPointsRoomView
              game={fourteenPointsState}
              joinRole={joinRole}
              onCapture={onCapture}
              onDrawAndDiscard={onDrawAndDiscard}
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
  const [gameState, setGameState] = useState<AnyGameState | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createTimer, setCreateTimer] = useState<TimerPreset>(300_000);
  const [createHostColor, setCreateHostColor] = useState<HostColorChoice>("white");
  const [configTimer, setConfigTimer] = useState<TimerPreset>(300_000);
  const [configHostColor, setConfigHostColor] = useState<HostColorChoice>("white");
  const joinRole = getSeatRole(roomState, player.playerId);
  const isMember = isRoomMember(roomState, player.playerId);
  const isRoomHost = roomState?.roomHostPlayerId === player.playerId;

  useEffect(() => {
    if (!gameState || gameState.key !== "chess") return;
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
        setGameState(payload.game as AnyGameState);
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
            setGameState(payload.game as AnyGameState);
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
      setGameState(payload.game as AnyGameState);
      setMessage(
        payload.role === "spectator"
          ? `You joined the room as ${payload.playerName}. The player seats are already taken.`
          : `You joined the room as ${payload.playerName} and claimed the ${payload.role} seat.`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not join room.");
    } finally {
      setPending(false);
    }
  }

  async function updateLobby(action: LobbyAction) {
    if (!roomId) return;

    setPending(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/rooms/${roomId}/lobby`, {
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
        throw new Error(payload.error ?? "Could not update lobby.");
      }

      setRoomState(payload.room);
      setGameState(payload.game as AnyGameState);
      setMessage("Lobby updated.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update lobby.");
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
      setGameState(payload.game as AnyGameState);
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
      setGameState(payload.game as AnyGameState);
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
      setGameState(payload.game as AnyGameState);
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

  async function captureFourteenPoints(handCardId: string, openCardIds: string[]) {
    await sendAction({
      type: "capture_cards",
      payload: { handCardId, openCardIds },
    });
  }

  async function drawAndDiscardFourteenPoints(discardCardId: string) {
    await sendAction({
      type: "draw_and_discard",
      payload: { discardCardId },
    });
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
      isMember={isMember}
      isRoomHost={isRoomHost}
      joinRole={joinRole}
      message={message}
      onCapture={captureFourteenPoints}
      onClaimSeat={claimSeat}
      onCopyInvite={copyInvite}
      onDrawAndDiscard={drawAndDiscardFourteenPoints}
      onLobbyAction={updateLobby}
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
