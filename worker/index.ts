import { DurableObject } from "cloudflare:workers";

import {
  applyMoveToGame,
  applyTimeoutIfNeeded,
  createFreshGame,
  createInitialCastlingRights,
  createInitialChessState,
  getLegalMovesForSquare,
} from "../shared/chess";
import type {
  ChessState,
  MovePrioritySeat,
  RoomPayload,
  RoomSnapshot,
  RoomState,
  SeatRole,
  TimerPreset,
} from "../shared/types";

type Env = {
  ROOMS: DurableObjectNamespace;
};

type StoredRoom = {
  room: RoomState;
  game: ChessState;
};

type JoinResult = {
  room: RoomSnapshot;
  game: ChessState;
  role: SeatRole;
};

function json(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data, null, 2), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init?.headers ?? {}),
    },
  });
}

function notFound(message = "Not found"): Response {
  return json({ error: message }, { status: 404 });
}

function roomSnapshotFromState(state: RoomState): RoomSnapshot {
  const hostJoined = state.hostPlayerId !== null;
  const guestJoined = state.guestPlayerId !== null;
  const playerCount = Number(hostJoined) + Number(guestJoined);

  return {
    ...state,
    hostJoined,
    guestJoined,
    playerCount,
    status: playerCount >= 2 ? "ready" : "waiting",
  };
}

function generateRoomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

function isTimerPreset(value: number): value is TimerPreset {
  return [60_000, 180_000, 300_000, 600_000].includes(value);
}

function isMovePrioritySeat(value: string): value is MovePrioritySeat {
  return value === "host" || value === "guest";
}

export class GameRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/init" && request.method === "POST") {
      const payload = await this.initializeRoom(url.searchParams.get("roomId"));
      return json(payload);
    }

    if (url.pathname === "/state" && request.method === "GET") {
      try {
        const payload = await this.requirePayload();
        return json(payload);
      } catch {
        return notFound("Room has not been initialized.");
      }
    }

    if (url.pathname === "/join" && request.method === "POST") {
      try {
        const playerId = request.headers.get("x-player-id");
        if (!playerId) {
          return json({ error: "Missing player identity." }, { status: 400 });
        }

        const result = await this.joinRoom(playerId);
        return json(result);
      } catch {
        return notFound("Room has not been initialized.");
      }
    }

    if (url.pathname === "/configure" && request.method === "POST") {
      try {
        const playerId = request.headers.get("x-player-id");
        if (!playerId) {
          return json({ error: "Missing player identity." }, { status: 400 });
        }

        const body = (await request.json()) as {
          timerMs?: number;
          movePrioritySeat?: string;
        };
        const payload = await this.configureGame(playerId, body);
        return json(payload);
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "Could not update settings.";
        return json({ error: message }, { status: 400 });
      }
    }

    if (url.pathname === "/start" && request.method === "POST") {
      try {
        const playerId = request.headers.get("x-player-id");
        if (!playerId) {
          return json({ error: "Missing player identity." }, { status: 400 });
        }

        const payload = await this.startGame(playerId);
        return json(payload);
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "Could not start game.";
        return json({ error: message }, { status: 400 });
      }
    }

    if (url.pathname === "/move" && request.method === "POST") {
      try {
        const playerId = request.headers.get("x-player-id");
        if (!playerId) {
          return json({ error: "Missing player identity." }, { status: 400 });
        }

        const body = (await request.json()) as {
          from?: string;
          to?: string;
        };
        const payload = await this.makeMove(playerId, body.from, body.to);
        return json(payload);
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "Move failed.";
        return json({ error: message }, { status: 400 });
      }
    }

    if (url.pathname === "/socket" && request.method === "GET") {
      return this.handleWebSocketUpgrade();
    }

    return notFound("Room endpoint not found.");
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string") {
      return;
    }

    if (message === "ping") {
      ws.send(JSON.stringify({ type: "pong" }));
      return;
    }

    if (message === "sync") {
      const payload = await this.requirePayload();
      ws.send(JSON.stringify({ type: "room_state", ...payload }));
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    ws.close(code, reason);
  }

  private async initializeRoom(roomIdParam: string | null): Promise<RoomPayload> {
    const existing = await this.ctx.storage.get<StoredRoom>("state");
    if (existing) {
      const persisted = this.normalizeStoredRoom(existing);
      await this.ctx.storage.put("state", persisted);
      return this.toPayload(persisted);
    }

    const room: RoomState = {
      roomId: roomIdParam ?? "unknown",
      createdAt: new Date().toISOString(),
      hostPlayerId: null,
      guestPlayerId: null,
    };

    const stored: StoredRoom = {
      room,
      game: createInitialChessState("host", 300_000),
    };

    await this.ctx.storage.put("state", stored);
    const payload = this.toPayload(stored);
    this.broadcastRoomState(payload);
    return payload;
  }

  private async requireStoredRoom(): Promise<StoredRoom> {
    const stored = await this.ctx.storage.get<StoredRoom>("state");
    if (!stored) {
      throw new Error("Room has not been initialized.");
    }

    const normalized = this.normalizeStoredRoom(stored);
    if (normalized !== stored) {
      await this.ctx.storage.put("state", normalized);
    }
    return normalized;
  }

  private async requirePayload(): Promise<RoomPayload> {
    const stored = await this.requireStoredRoom();
    const refreshed = this.withFreshClock(stored);
    if (refreshed !== stored) {
      await this.ctx.storage.put("state", refreshed);
    }
    return this.toPayload(refreshed);
  }

  private async joinRoom(playerId: string): Promise<JoinResult> {
    const stored = await this.requireStoredRoom();
    const role = this.resolveSeatRole(stored.room, playerId);

    let nextRole = role;
    if (role === "spectator") {
      if (!stored.room.hostPlayerId) {
        stored.room.hostPlayerId = playerId;
        nextRole = "host";
      } else if (!stored.room.guestPlayerId) {
        stored.room.guestPlayerId = playerId;
        nextRole = "guest";
      }
    }

    await this.ctx.storage.put("state", stored);
    const payload = this.toPayload(stored);
    this.broadcastRoomState(payload);

    return {
      ...payload,
      role: nextRole,
    };
  }

  private async configureGame(
    playerId: string,
    body: { timerMs?: number; movePrioritySeat?: string },
  ): Promise<RoomPayload> {
    const stored = await this.requireStoredRoom();
    if (this.resolveSeatRole(stored.room, playerId) !== "host") {
      throw new Error("Only the host can update game settings.");
    }

    if (stored.game.status === "active") {
      throw new Error("Game settings are locked after the game starts.");
    }

    const timerMs = body.timerMs;
    const movePrioritySeat = body.movePrioritySeat;

    if (typeof timerMs !== "number" || !isTimerPreset(timerMs)) {
      throw new Error("Choose a supported timer preset.");
    }

    if (typeof movePrioritySeat !== "string" || !isMovePrioritySeat(movePrioritySeat)) {
      throw new Error("Choose which seat moves first.");
    }

    stored.game = createInitialChessState(movePrioritySeat, timerMs);
    await this.ctx.storage.put("state", stored);
    const payload = this.toPayload(stored);
    this.broadcastRoomState(payload);
    return payload;
  }

  private async startGame(playerId: string): Promise<RoomPayload> {
    const stored = await this.requireStoredRoom();
    if (this.resolveSeatRole(stored.room, playerId) !== "host") {
      throw new Error("Only the host can start the match.");
    }

    if (!stored.room.hostPlayerId || !stored.room.guestPlayerId) {
      throw new Error("Both seats must be filled before starting.");
    }

    stored.game = createFreshGame(
      stored.game.movePrioritySeat,
      stored.game.timerMs,
      new Date().toISOString(),
    );

    await this.ctx.storage.put("state", stored);
    const payload = this.toPayload(stored);
    this.broadcastRoomState(payload);
    return payload;
  }

  private async makeMove(
    playerId: string,
    from: string | undefined,
    to: string | undefined,
  ): Promise<RoomPayload> {
    const stored = await this.requireStoredRoom();
    const seatRole = this.resolveSeatRole(stored.room, playerId);
    const gameWithClock = this.withFreshClock(stored);
    const playerColor =
      seatRole === "host"
        ? gameWithClock.game.hostColor
        : seatRole === "guest"
          ? gameWithClock.game.guestColor
          : null;

    if (!playerColor) {
      throw new Error("Spectators cannot move pieces.");
    }

    if (gameWithClock.game.status !== "active") {
      throw new Error("The game is not active.");
    }

    if (gameWithClock.game.activeColor !== playerColor) {
      throw new Error("It is not your turn.");
    }

    if (!from || !to) {
      throw new Error("Select a source and destination square.");
    }

    const result = applyMoveToGame(gameWithClock.game, from, to, new Date().toISOString());
    const nextStored: StoredRoom = {
      room: gameWithClock.room,
      game: result.next,
    };

    await this.ctx.storage.put("state", nextStored);
    const payload = this.toPayload(nextStored);
    this.broadcastRoomState(payload);
    return payload;
  }

  private handleWebSocketUpgrade(): Response {
    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);

    this.ctx.acceptWebSocket(server);
    void this.sendCurrentState(server);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  private async sendCurrentState(ws: WebSocket): Promise<void> {
    try {
      const payload = await this.requirePayload();
      ws.send(JSON.stringify({ type: "room_state", ...payload }));
    } catch {
      ws.send(JSON.stringify({ type: "error", message: "Room has not been initialized." }));
    }
  }

  private broadcastRoomState(payload: RoomPayload): void {
    const serialized = JSON.stringify({ type: "room_state", ...payload });
    for (const socket of this.ctx.getWebSockets()) {
      socket.send(serialized);
    }
  }

  private withFreshClock(stored: StoredRoom): StoredRoom {
    const nextGame = applyTimeoutIfNeeded(stored.game, new Date().toISOString());
    if (nextGame === stored.game) {
      return stored;
    }

    return {
      room: stored.room,
      game: nextGame,
    };
  }

  private normalizeStoredRoom(stored: StoredRoom): StoredRoom {
    if ("game" in stored && stored.game) {
      return {
        room: stored.room,
        game: {
          ...stored.game,
          castlingRights: stored.game.castlingRights ?? createInitialCastlingRights(),
          enPassantTarget: stored.game.enPassantTarget ?? null,
          lastMove: stored.game.lastMove
            ? {
                ...stored.game.lastMove,
                special: stored.game.lastMove.special ?? null,
              }
            : null,
          moves: stored.game.moves.map((move) => ({
            ...move,
            special: move.special ?? null,
          })),
        },
      };
    }

    return {
      room: stored.room,
      game: createInitialChessState("host", 300_000),
    };
  }

  private toPayload(stored: StoredRoom): RoomPayload {
    return {
      room: roomSnapshotFromState(stored.room),
      game: stored.game,
    };
  }

  private resolveSeatRole(room: RoomState, playerId: string): SeatRole {
    if (room.hostPlayerId === playerId) return "host";
    if (room.guestPlayerId === playerId) return "guest";
    return "spectator";
  }
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return json({
        ok: true,
        service: "gacha-chess",
        time: new Date().toISOString(),
      });
    }

    if (url.pathname === "/api/rooms" && request.method === "POST") {
      const roomId = generateRoomId();
      const durableId = env.ROOMS.idFromName(roomId);
      const stub = env.ROOMS.get(durableId);
      const initUrl = new URL("https://room.internal/init");
      initUrl.searchParams.set("roomId", roomId);

      const response = await stub.fetch(initUrl, { method: "POST" });
      if (!response.ok) {
        return json({ error: "Failed to initialize room." }, { status: 500 });
      }

      return json({
        roomId,
        roomUrl: `${url.origin}/room/${roomId}`,
      });
    }

    const roomRouteMatch = url.pathname.match(/^\/api\/rooms\/([a-z0-9-]+)$/i);
    if (roomRouteMatch && request.method === "GET") {
      const roomId = roomRouteMatch[1];
      const durableId = env.ROOMS.idFromName(roomId);
      const stub = env.ROOMS.get(durableId);
      const response = await stub.fetch("https://room.internal/state");

      if (!response.ok) {
        return json({ error: "Room not found." }, { status: 404 });
      }

      return response;
    }

    const joinRouteMatch = url.pathname.match(/^\/api\/rooms\/([a-z0-9-]+)\/join$/i);
    if (joinRouteMatch && request.method === "POST") {
      const roomId = joinRouteMatch[1];
      const durableId = env.ROOMS.idFromName(roomId);
      const stub = env.ROOMS.get(durableId);
      return stub.fetch("https://room.internal/join", {
        method: "POST",
        headers: request.headers,
      });
    }

    const configureMatch = url.pathname.match(/^\/api\/rooms\/([a-z0-9-]+)\/configure$/i);
    if (configureMatch && request.method === "POST") {
      const roomId = configureMatch[1];
      const durableId = env.ROOMS.idFromName(roomId);
      const stub = env.ROOMS.get(durableId);
      return stub.fetch("https://room.internal/configure", {
        method: "POST",
        headers: request.headers,
        body: request.body,
      });
    }

    const startMatch = url.pathname.match(/^\/api\/rooms\/([a-z0-9-]+)\/start$/i);
    if (startMatch && request.method === "POST") {
      const roomId = startMatch[1];
      const durableId = env.ROOMS.idFromName(roomId);
      const stub = env.ROOMS.get(durableId);
      return stub.fetch("https://room.internal/start", {
        method: "POST",
        headers: request.headers,
      });
    }

    const moveMatch = url.pathname.match(/^\/api\/rooms\/([a-z0-9-]+)\/move$/i);
    if (moveMatch && request.method === "POST") {
      const roomId = moveMatch[1];
      const durableId = env.ROOMS.idFromName(roomId);
      const stub = env.ROOMS.get(durableId);
      return stub.fetch("https://room.internal/move", {
        method: "POST",
        headers: request.headers,
        body: request.body,
      });
    }

    const legalMovesMatch = url.pathname.match(/^\/api\/rooms\/([a-z0-9-]+)\/legal-moves\/([a-h][1-8])$/i);
    if (legalMovesMatch && request.method === "GET") {
      const roomId = legalMovesMatch[1];
      const square = legalMovesMatch[2].toLowerCase();
      const durableId = env.ROOMS.idFromName(roomId);
      const stub = env.ROOMS.get(durableId);
      const response = await stub.fetch("https://room.internal/state");
      if (!response.ok) {
        return json({ error: "Room not found." }, { status: 404 });
      }

      const payload = (await response.json()) as RoomPayload;
      return json({
        moves: getLegalMovesForSquare(payload.game.board, square, payload.game.activeColor, {
          castlingRights: payload.game.castlingRights,
          enPassantTarget: payload.game.enPassantTarget,
        }),
      });
    }

    const socketRouteMatch = url.pathname.match(/^\/api\/rooms\/([a-z0-9-]+)\/socket$/i);
    if (socketRouteMatch && request.method === "GET") {
      const roomId = socketRouteMatch[1];
      const durableId = env.ROOMS.idFromName(roomId);
      const stub = env.ROOMS.get(durableId);

      return stub.fetch("https://room.internal/socket", {
        headers: request.headers,
      });
    }

    return notFound();
  },
} satisfies ExportedHandler<Env>;
