import type { ChessState } from "./games/chess/logic/types";

export type SeatRole = "host" | "guest" | "spectator";
export type GameKey = "chess";

export type PlayerIdentity = {
  playerId: string;
  displayName: string;
};

export type RoomSeat = {
  playerId: string | null;
  displayName: string | null;
};

export type RoomState = {
  roomId: string;
  gameKey: GameKey;
  createdAt: string;
  host: RoomSeat;
  guest: RoomSeat;
};

export type RoomSnapshot = RoomState & {
  playerCount: number;
  status: "waiting" | "ready";
};

export type ChessMoveAction = {
  type: "move";
  payload: {
    from: string;
    to: string;
  };
};

export type GameAction = ChessMoveAction;

export type AnyGameState = ChessState;

export type RoomPayload = {
  room: RoomSnapshot;
  game: AnyGameState;
};

export type JoinResponse = RoomPayload & {
  role: SeatRole;
  playerName: string;
};

export type GameCatalogEntry = {
  key: GameKey;
  name: string;
  summary: string;
  accent: string;
};

export type CreateRoomRequest = {
  gameKey: GameKey;
};

export type CreateRoomResponse = {
  roomId: string;
  roomUrl: string;
  gameKey: GameKey;
};
