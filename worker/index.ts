import { DurableObject } from "cloudflare:workers";

type Env = {
  ROOMS: DurableObjectNamespace;
};

type RoomState = {
  roomId: string;
  createdAt: string;
  hostPlayerId: string | null;
  guestPlayerId: string | null;
};

type RoomSnapshot = RoomState & {
  hostJoined: boolean;
  guestJoined: boolean;
  playerCount: number;
  status: "waiting" | "ready";
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

export class GameRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/init" && request.method === "POST") {
      const room = await this.initializeRoom(url.searchParams.get("roomId"));
      return json({ room });
    }

    if (url.pathname === "/state" && request.method === "GET") {
      try {
        const room = await this.requireRoom();
        return json({ room });
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
      const room = await this.requireRoom();
      ws.send(JSON.stringify({ type: "room_state", room }));
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    ws.close(code, reason);
  }

  private async initializeRoom(roomIdParam: string | null): Promise<RoomSnapshot> {
    const existing = await this.ctx.storage.get<RoomState>("room");
    if (existing) {
      return roomSnapshotFromState(existing);
    }

    const room: RoomState = {
      roomId: roomIdParam ?? "unknown",
      createdAt: new Date().toISOString(),
      hostPlayerId: null,
      guestPlayerId: null,
    };

    await this.ctx.storage.put("room", room);
    const snapshot = roomSnapshotFromState(room);
    this.broadcastRoomState(snapshot);
    return snapshot;
  }

  private async requireRoom(): Promise<RoomSnapshot> {
    const room = await this.ctx.storage.get<RoomState>("room");
    if (!room) {
      throw new Error("Room has not been initialized.");
    }

    return roomSnapshotFromState(room);
  }

  private async joinRoom(playerId: string): Promise<{
    room: RoomSnapshot;
    role: "host" | "guest" | "spectator";
  }> {
    const room = await this.ctx.storage.get<RoomState>("room");
    if (!room) {
      throw new Error("Room has not been initialized.");
    }

    let role: "host" | "guest" | "spectator" = "spectator";

    if (room.hostPlayerId === playerId) {
      role = "host";
    } else if (room.guestPlayerId === playerId) {
      role = "guest";
    } else if (!room.hostPlayerId) {
      room.hostPlayerId = playerId;
      role = "host";
    } else if (!room.guestPlayerId) {
      room.guestPlayerId = playerId;
      role = "guest";
    }

    await this.ctx.storage.put("room", room);
    const snapshot = roomSnapshotFromState(room);
    this.broadcastRoomState(snapshot);

    return {
      room: snapshot,
      role,
    };
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
      const room = await this.requireRoom();
      ws.send(JSON.stringify({ type: "room_state", room }));
    } catch {
      ws.send(JSON.stringify({ type: "error", message: "Room has not been initialized." }));
    }
  }

  private broadcastRoomState(room: RoomSnapshot): void {
    const payload = JSON.stringify({ type: "room_state", room });
    for (const socket of this.ctx.getWebSockets()) {
      socket.send(payload);
    }
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
      const playerId = request.headers.get("x-player-id");
      if (!playerId) {
        return json({ error: "Missing player identity." }, { status: 400 });
      }
      const durableId = env.ROOMS.idFromName(roomId);
      const stub = env.ROOMS.get(durableId);
      const response = await stub.fetch("https://room.internal/join", {
        method: "POST",
        headers: {
          "x-player-id": playerId,
        },
      });

      if (!response.ok) {
        return json({ error: "Failed to join room." }, { status: 500 });
      }

      return response;
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
