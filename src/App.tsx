import { FormEvent, useEffect, useMemo, useState } from "react";

type RoomSnapshot = {
  roomId: string;
  createdAt: string;
  hostPlayerId: string | null;
  guestPlayerId: string | null;
  hostJoined: boolean;
  guestJoined: boolean;
  playerCount: number;
  status: "waiting" | "ready";
};

type JoinResponse = {
  room: RoomSnapshot;
  role: "host" | "guest" | "spectator";
};

type RoomSocketMessage =
  | {
      type: "room_state";
      room: RoomSnapshot;
    }
  | {
      type: "pong";
    }
  | {
      type: "error";
      message: string;
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

export default function App() {
  const roomId = useMemo(() => getRoomIdFromPath(window.location.pathname), []);
  const playerId = useMemo(() => getOrCreatePlayerId(), []);
  const [roomState, setRoomState] = useState<RoomSnapshot | null>(null);
  const [joinRole, setJoinRole] = useState<JoinResponse["role"] | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!roomState) return;

    if (roomState.hostPlayerId === playerId) {
      setJoinRole("host");
      return;
    }

    if (roomState.guestPlayerId === playerId) {
      setJoinRole("guest");
      return;
    }

    setJoinRole(null);
  }, [playerId, roomState]);

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

        const payload = (await response.json()) as { room: RoomSnapshot };
        if (active) {
          setRoomState(payload.room);
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
        throw new Error("Could not join this room.");
      }

      const payload = (await response.json()) as JoinResponse;
      setRoomState(payload.room);
      setJoinRole(payload.role);
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

  if (roomId) {
    return (
      <main className="app-shell">
        <section className="hero-panel room-panel">
          <span className="eyebrow">Room</span>
          <h1>{roomId}</h1>
          <p className="lede">
            This is the first multiplayer scaffold. The room state is stored in
            a Cloudflare Durable Object and exposed through a Worker API.
          </p>

          <div className="stats-grid">
            <article className="stat-card">
              <span>Status</span>
              <strong>{roomState?.status ?? "loading"}</strong>
            </article>
            <article className="stat-card">
              <span>Players</span>
              <strong>{roomState?.playerCount ?? 0} / 2</strong>
            </article>
            <article className="stat-card">
              <span>Host</span>
              <strong>{roomState?.hostJoined ? "seated" : "open"}</strong>
            </article>
            <article className="stat-card">
              <span>Guest</span>
              <strong>{roomState?.guestJoined ? "seated" : "open"}</strong>
            </article>
          </div>

          <div className="room-actions">
            <button disabled={pending} onClick={() => void claimSeat()}>
              {pending ? "Joining..." : "Join this room"}
            </button>
            <button
              className="secondary"
              onClick={() => void navigator.clipboard.writeText(window.location.href)}
            >
              Copy invite link
            </button>
          </div>

          {roomState ? (
            <p className="meta-line">
              Created {formatTimestamp(roomState.createdAt)}
            </p>
          ) : null}

          {joinRole ? <p className="status-line">{`Role: ${joinRole}`}</p> : null}
          {message ? <p className="status-line">{message}</p> : null}
          {error ? <p className="error-line">{error}</p> : null}
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <span className="eyebrow">Cloudflare Prototype</span>
        <h1>Start a room. Share the link. Bring an opponent.</h1>
        <p className="lede">
          This scaffold sets up the browser client, Worker API, and Durable
          Object room model that the PvP pivot needs.
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
            <h2>Client</h2>
            <p>React SPA served as static assets through Cloudflare.</p>
          </article>
          <article className="feature-card">
            <h2>Worker</h2>
            <p>HTTP API for room creation, state lookup, and join actions.</p>
          </article>
          <article className="feature-card">
            <h2>Durable Object</h2>
            <p>Authoritative per-room state that can later own live match flow.</p>
          </article>
        </div>

        {message ? <p className="status-line">{message}</p> : null}
        {error ? <p className="error-line">{error}</p> : null}
      </section>
    </main>
  );
}
