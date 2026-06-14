type Env = {
  ROOMS: DurableObjectNamespace;
};

type RoomState = {
  roomId: string;
  createdAt: string;
  hostJoined: boolean;
  guestJoined: boolean;
};

type RoomSnapshot = RoomState & {
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
  const playerCount = Number(state.hostJoined) + Number(state.guestJoined);

  return {
    ...state,
    playerCount,
    status: playerCount >= 2 ? "ready" : "waiting",
  };
}

function generateRoomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

export class GameRoom {
  private readonly state: DurableObjectState;
  private readonly env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
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
        const result = await this.joinRoom();
        return json(result);
      } catch {
        return notFound("Room has not been initialized.");
      }
    }

    return notFound("Room endpoint not found.");
  }

  private async initializeRoom(roomIdParam: string | null): Promise<RoomSnapshot> {
    const existing = await this.state.storage.get<RoomState>("room");
    if (existing) {
      return roomSnapshotFromState(existing);
    }

    const room: RoomState = {
      roomId: roomIdParam ?? "unknown",
      createdAt: new Date().toISOString(),
      hostJoined: false,
      guestJoined: false,
    };

    await this.state.storage.put("room", room);
    return roomSnapshotFromState(room);
  }

  private async requireRoom(): Promise<RoomSnapshot> {
    const room = await this.state.storage.get<RoomState>("room");
    if (!room) {
      throw new Error("Room has not been initialized.");
    }

    return roomSnapshotFromState(room);
  }

  private async joinRoom(): Promise<{
    room: RoomSnapshot;
    role: "host" | "guest" | "spectator";
  }> {
    const room = await this.state.storage.get<RoomState>("room");
    if (!room) {
      throw new Error("Room has not been initialized.");
    }

    let role: "host" | "guest" | "spectator" = "spectator";

    if (!room.hostJoined) {
      room.hostJoined = true;
      role = "host";
    } else if (!room.guestJoined) {
      room.guestJoined = true;
      role = "guest";
    }

    await this.state.storage.put("room", room);

    return {
      room: roomSnapshotFromState(room),
      role,
    };
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
      const response = await stub.fetch("https://room.internal/join", {
        method: "POST",
      });

      if (!response.ok) {
        return json({ error: "Failed to join room." }, { status: 500 });
      }

      return response;
    }

    return notFound();
  },
} satisfies ExportedHandler<Env>;
