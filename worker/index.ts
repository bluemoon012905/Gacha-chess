import { DurableObject } from "cloudflare:workers";

import { generateDisplayName } from "../shared/player";
import {
  applyGameAction,
  createGameState,
  GAME_CATALOG,
  isGameKey,
  normalizeGameState,
  refreshGameState,
  startGameState,
  configureGameState,
} from "../shared/games";
import type {
  AnyGameState,
  CreateRoomRequest,
  GameAction,
  GameKey,
  JoinResponse,
  LobbyAction,
  RoomMember,
  PlayerIdentity,
  RoomPayload,
  RoomSeat,
  RoomSnapshot,
  RoomState,
  SeatRole,
} from "../shared/types";

type Env = {
  ROOMS: DurableObjectNamespace;
};

type StoredRoom = {
  room: RoomState;
  game: AnyGameState;
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

function generateRoomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

function roomSnapshotFromState(state: RoomState): RoomSnapshot {
  const hostJoined = state.host.playerId !== null;
  const guestJoined = state.guest.playerId !== null;
  const seatedPlayerCount = Number(hostJoined) + Number(guestJoined);
  const playerCount = state.members.length;

  return {
    ...state,
    playerCount,
    seatedPlayerCount,
    status: seatedPlayerCount >= 2 ? "ready" : "waiting",
  };
}

function ensurePlayerIdentity(headers: Headers): PlayerIdentity {
  const playerId = headers.get("x-player-id");
  if (!playerId) {
    throw new Error("Missing player identity.");
  }

  return {
    playerId,
    displayName: headers.get("x-player-name")?.trim() || generateDisplayName(),
  };
}

function replaceSeat(seat: RoomSeat, identity: PlayerIdentity): RoomSeat {
  return {
    playerId: identity.playerId,
    displayName: identity.displayName || seat.displayName,
  };
}

function upsertMember(
  members: RoomMember[],
  identity: PlayerIdentity,
  joinedAt: string,
): RoomMember[] {
  const existingIndex = members.findIndex((member) => member.playerId === identity.playerId);
  const member: RoomMember = {
    playerId: identity.playerId,
    displayName: identity.displayName,
    joinedAt: existingIndex >= 0 ? members[existingIndex].joinedAt : joinedAt,
  };

  if (existingIndex < 0) {
    return [...members, member];
  }

  return members.map((existing, index) => (index === existingIndex ? member : existing));
}

function gameHasStarted(game: AnyGameState): boolean {
  return "status" in game && game.status !== "waiting";
}

export class GameRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/init" && request.method === "POST") {
      const payload = (await request.json()) as {
        roomId?: string;
        gameKey?: string;
        config?: Record<string, unknown>;
      };
      const roomId = payload.roomId;
      const gameKey = payload.gameKey;
      if (!roomId || !gameKey || !isGameKey(gameKey)) {
        return json({ error: "Invalid room initialization request." }, { status: 400 });
      }
      return json(await this.initializeRoom(roomId, gameKey, payload.config));
    }

    if (url.pathname === "/state" && request.method === "GET") {
      try {
        return json(await this.requirePayload());
      } catch {
        return notFound("Room has not been initialized.");
      }
    }

    if (url.pathname === "/join" && request.method === "POST") {
      try {
        return json(await this.joinRoom(ensurePlayerIdentity(request.headers)));
      } catch (caught) {
        return json(
          { error: caught instanceof Error ? caught.message : "Could not join room." },
          { status: 400 },
        );
      }
    }

    if (url.pathname === "/configure" && request.method === "POST") {
      try {
        const player = ensurePlayerIdentity(request.headers);
        const body = (await request.json()) as Record<string, unknown>;
        return json(await this.configureGame(player, body));
      } catch (caught) {
        return json(
          { error: caught instanceof Error ? caught.message : "Could not update settings." },
          { status: 400 },
        );
      }
    }

    if (url.pathname === "/lobby" && request.method === "POST") {
      try {
        const player = ensurePlayerIdentity(request.headers);
        const action = (await request.json()) as LobbyAction;
        return json(await this.updateLobby(player, action));
      } catch (caught) {
        return json(
          { error: caught instanceof Error ? caught.message : "Could not update lobby." },
          { status: 400 },
        );
      }
    }

    if (url.pathname === "/start" && request.method === "POST") {
      try {
        return json(await this.startGame(ensurePlayerIdentity(request.headers)));
      } catch (caught) {
        return json(
          { error: caught instanceof Error ? caught.message : "Could not start the game." },
          { status: 400 },
        );
      }
    }

    if (url.pathname === "/action" && request.method === "POST") {
      try {
        const player = ensurePlayerIdentity(request.headers);
        const action = (await request.json()) as GameAction;
        return json(await this.handleAction(player, action));
      } catch (caught) {
        return json(
          { error: caught instanceof Error ? caught.message : "Action failed." },
          { status: 400 },
        );
      }
    }

    if (url.pathname === "/socket" && request.method === "GET") {
      return this.handleWebSocketUpgrade();
    }

    return notFound("Room endpoint not found.");
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string") return;

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

  private async initializeRoom(
    roomId: string,
    gameKey: GameKey,
    config?: Record<string, unknown>,
  ): Promise<RoomPayload> {
    const existing = await this.ctx.storage.get<StoredRoom>("state");
    if (existing) {
      const normalized = this.normalizeStoredRoom(existing);
      await this.ctx.storage.put("state", normalized);
      return this.toPayload(normalized);
    }

    const room: RoomState = {
      roomId,
      gameKey,
      createdAt: new Date().toISOString(),
      roomHostPlayerId: null,
      host: { playerId: null, displayName: null },
      guest: { playerId: null, displayName: null },
      members: [],
    };

    const stored: StoredRoom = {
      room,
      game: config ? configureGameState(gameKey, createGameState(gameKey), config) : createGameState(gameKey),
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
    const refreshed = this.withFreshGame(stored);
    if (refreshed !== stored) {
      await this.ctx.storage.put("state", refreshed);
    }
    return this.toPayload(refreshed);
  }

  private async joinRoom(player: PlayerIdentity): Promise<JoinResponse> {
    const stored = await this.requireStoredRoom();
    const role = this.resolveSeatRole(stored.room, player.playerId);
    let nextRole = role;
    stored.room.members = upsertMember(stored.room.members, player, new Date().toISOString());
    if (!stored.room.roomHostPlayerId) {
      stored.room.roomHostPlayerId = player.playerId;
    }

    if (role === "host") {
      stored.room.host = replaceSeat(stored.room.host, player);
    } else if (role === "guest") {
      stored.room.guest = replaceSeat(stored.room.guest, player);
    } else if (!stored.room.host.playerId) {
      stored.room.host = replaceSeat(stored.room.host, player);
      nextRole = "host";
    } else if (!stored.room.guest.playerId) {
      stored.room.guest = replaceSeat(stored.room.guest, player);
      nextRole = "guest";
    }

    await this.ctx.storage.put("state", stored);
    const payload = this.toPayload(stored);
    this.broadcastRoomState(payload);
    return {
      ...payload,
      role: nextRole,
      playerName: player.displayName,
    };
  }

  private async updateLobby(player: PlayerIdentity, action: LobbyAction): Promise<RoomPayload> {
    const stored = await this.requireStoredRoom();
    stored.room.members = upsertMember(stored.room.members, player, new Date().toISOString());

    if (stored.room.roomHostPlayerId !== player.playerId) {
      throw new Error("Only the room host can manage the lobby.");
    }

    if (gameHasStarted(stored.game)) {
      throw new Error("Lobby assignments are locked after the game starts.");
    }

    switch (action.type) {
      case "assign_seat":
        this.assignSeat(stored.room, action.payload.memberId, action.payload.seat);
        break;
      case "clear_seat":
        this.clearSeat(stored.room, action.payload.seat);
        break;
      case "transfer_room_host":
        this.transferRoomHost(stored.room, action.payload.memberId);
        break;
      default:
        throw new Error("Unsupported lobby action.");
    }

    await this.ctx.storage.put("state", stored);
    const payload = this.toPayload(stored);
    this.broadcastRoomState(payload);
    return payload;
  }

  private async configureGame(
    player: PlayerIdentity,
    body: Record<string, unknown>,
  ): Promise<RoomPayload> {
    const stored = await this.requireStoredRoom();
    if (stored.room.roomHostPlayerId !== player.playerId) {
      throw new Error("Only the room host can update room settings.");
    }

    const refreshed = this.withFreshGame(stored);
    if (gameHasStarted(refreshed.game)) {
      throw new Error("Game settings are locked after the game starts.");
    }

    refreshed.game = configureGameState(refreshed.room.gameKey, refreshed.game, body);
    await this.ctx.storage.put("state", refreshed);
    const payload = this.toPayload(refreshed);
    this.broadcastRoomState(payload);
    return payload;
  }

  private async startGame(player: PlayerIdentity): Promise<RoomPayload> {
    const stored = await this.requireStoredRoom();
    if (stored.room.roomHostPlayerId !== player.playerId) {
      throw new Error("Only the room host can start the room.");
    }

    if (!stored.room.host.playerId || !stored.room.guest.playerId) {
      throw new Error("Both seats must be filled before starting.");
    }

    stored.game = startGameState(stored.room.gameKey, stored.game, new Date().toISOString());
    await this.ctx.storage.put("state", stored);
    const payload = this.toPayload(stored);
    this.broadcastRoomState(payload);
    return payload;
  }

  private async handleAction(player: PlayerIdentity, action: GameAction): Promise<RoomPayload> {
    const stored = await this.requireStoredRoom();
    const refreshed = this.withFreshGame(stored);
    refreshed.game = applyGameAction(
      refreshed.room.gameKey,
      refreshed.game,
      refreshed.room,
      player,
      action,
    );

    await this.ctx.storage.put("state", refreshed);
    const payload = this.toPayload(refreshed);
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

  private withFreshGame(stored: StoredRoom): StoredRoom {
    const refreshedGame = refreshGameState(stored.room.gameKey, stored.game, new Date().toISOString());
    if (refreshedGame === stored.game) {
      return stored;
    }

    return {
      room: stored.room,
      game: refreshedGame,
    };
  }

  private normalizeStoredRoom(stored: StoredRoom): StoredRoom {
    return {
      room: {
        ...stored.room,
        roomHostPlayerId: stored.room.roomHostPlayerId ?? stored.room.host?.playerId ?? null,
        host: stored.room.host ?? { playerId: null, displayName: null },
        guest: stored.room.guest ?? { playerId: null, displayName: null },
        members:
          stored.room.members?.length
            ? stored.room.members
            : [
                stored.room.host?.playerId
                  ? {
                      playerId: stored.room.host.playerId,
                      displayName: stored.room.host.displayName ?? "Host",
                      joinedAt: stored.room.createdAt,
                    }
                  : null,
                stored.room.guest?.playerId
                  ? {
                      playerId: stored.room.guest.playerId,
                      displayName: stored.room.guest.displayName ?? "Guest",
                      joinedAt: stored.room.createdAt,
                    }
                  : null,
              ].filter((member): member is RoomMember => member !== null),
      },
      game: normalizeGameState(stored.room.gameKey, stored.game),
    };
  }

  private toPayload(stored: StoredRoom): RoomPayload {
    return {
      room: roomSnapshotFromState(stored.room),
      game: stored.game,
    };
  }

  private resolveSeatRole(room: RoomState, playerId: string): SeatRole {
    if (room.host.playerId === playerId) return "host";
    if (room.guest.playerId === playerId) return "guest";
    return "spectator";
  }

  private assignSeat(room: RoomState, memberId: string, seat: "host" | "guest"): void {
    const member = room.members.find((entry) => entry.playerId === memberId);
    if (!member) {
      throw new Error("Selected member is not in the room.");
    }

    if (seat === "host") {
      if (room.guest.playerId === memberId) {
        room.guest = { playerId: null, displayName: null };
      }
      room.host = { playerId: member.playerId, displayName: member.displayName };
      return;
    }

    if (room.host.playerId === memberId) {
      room.host = { playerId: null, displayName: null };
    }
    room.guest = { playerId: member.playerId, displayName: member.displayName };
  }

  private clearSeat(room: RoomState, seat: "host" | "guest"): void {
    if (seat === "host") {
      room.host = { playerId: null, displayName: null };
      return;
    }

    room.guest = { playerId: null, displayName: null };
  }

  private transferRoomHost(room: RoomState, memberId: string): void {
    const member = room.members.find((entry) => entry.playerId === memberId);
    if (!member) {
      throw new Error("Selected member is not in the room.");
    }

    room.roomHostPlayerId = member.playerId;
  }
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return json({
        ok: true,
        service: "gacha-chess",
        games: GAME_CATALOG.map((game) => game.key),
        time: new Date().toISOString(),
      });
    }

    if (url.pathname === "/api/games" && request.method === "GET") {
      return json({ games: GAME_CATALOG });
    }

    if (url.pathname === "/api/rooms" && request.method === "POST") {
      const body = (await request.json()) as CreateRoomRequest;
      if (!body.gameKey || !isGameKey(body.gameKey)) {
        return json({ error: "Choose a supported game before starting a room." }, { status: 400 });
      }

      const roomId = generateRoomId();
      const durableId = env.ROOMS.idFromName(roomId);
      const stub = env.ROOMS.get(durableId);
      const response = await stub.fetch("https://room.internal/init", {
        method: "POST",
        body: JSON.stringify({
          roomId,
          gameKey: body.gameKey,
          config: body.config,
        }),
      });

      if (!response.ok) {
        return json({ error: "Failed to initialize room." }, { status: 500 });
      }

      return json({
        roomId,
        roomUrl: `${url.origin}/room/${roomId}`,
        gameKey: body.gameKey,
      });
    }

    const roomRouteMatch = url.pathname.match(/^\/api\/rooms\/([a-z0-9-]+)$/i);
    if (roomRouteMatch && request.method === "GET") {
      const durableId = env.ROOMS.idFromName(roomRouteMatch[1]);
      const stub = env.ROOMS.get(durableId);
      const response = await stub.fetch("https://room.internal/state");
      if (!response.ok) {
        return json({ error: "Room not found." }, { status: 404 });
      }
      return response;
    }

    const forwardableRoute = url.pathname.match(/^\/api\/rooms\/([a-z0-9-]+)\/(join|configure|start|action|lobby)$/i);
    if (forwardableRoute && ["POST"].includes(request.method)) {
      const roomId = forwardableRoute[1];
      const route = forwardableRoute[2];
      const durableId = env.ROOMS.idFromName(roomId);
      const stub = env.ROOMS.get(durableId);
      return stub.fetch(`https://room.internal/${route}`, {
        method: request.method,
        headers: request.headers,
        body: request.body,
      });
    }

    const socketRouteMatch = url.pathname.match(/^\/api\/rooms\/([a-z0-9-]+)\/socket$/i);
    if (socketRouteMatch && request.method === "GET") {
      const durableId = env.ROOMS.idFromName(socketRouteMatch[1]);
      const stub = env.ROOMS.get(durableId);
      return stub.fetch("https://room.internal/socket", {
        headers: request.headers,
      });
    }

    return notFound();
  },
} satisfies ExportedHandler<Env>;
