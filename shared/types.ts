import type { ChessState } from "./games/chess/logic/types";
import type { FiveTenKingState } from "./games/five-ten-king/logic/types";
import type { FourteenPointsState } from "./games/fourteen-points/logic/types";

export type PlayableSeatRole = "host" | "guest" | "north" | "east" | "south" | "west";
export type SeatRole = PlayableSeatRole | "spectator";
export type GameKey = "chess" | "fourteen-points" | "five-ten-king";

export type PlayerIdentity = {
  playerId: string;
  displayName: string;
};

export type RoomSeat = {
  playerId: string | null;
  displayName: string | null;
};

export type RoomMember = {
  playerId: string;
  displayName: string;
  joinedAt: string;
};

export type RoomState = {
  roomId: string;
  gameKey: GameKey;
  createdAt: string;
  roomHostPlayerId: string | null;
  seatOrder: PlayableSeatRole[];
  seats: Partial<Record<PlayableSeatRole, RoomSeat>>;
  members: RoomMember[];
};

export type RoomSnapshot = RoomState & {
  playerCount: number;
  seatedPlayerCount: number;
  status: "waiting" | "ready";
};

export type ChessMoveAction = {
  type: "move";
  payload: {
    from: string;
    to: string;
  };
};

export type FourteenPointsCaptureAction = {
  type: "capture_cards";
  payload: {
    handCardId: string;
    openCardIds: string[];
  };
};

export type FourteenPointsDrawAndDiscardAction = {
  type: "draw_card";
};

export type FourteenPointsDiscardToOpenAction = {
  type: "discard_to_open";
  payload: {
    discardCardId: string;
  };
};

export type FiveTenKingPlayCardsAction = {
  type: "play_cards";
  payload: {
    cardIds: string[];
  };
};

export type FiveTenKingPassAction = {
  type: "pass_turn";
};

export type FiveTenKingIntersectAction = {
  type: "intersect_play";
  payload: {
    cardIds: string[];
  };
};

export type LobbyAction =
  | {
      type: "assign_seat";
      payload: {
        memberId: string;
        seat: PlayableSeatRole;
      };
    }
  | {
      type: "clear_seat";
      payload: {
        seat: PlayableSeatRole;
      };
    }
  | {
      type: "transfer_room_host";
      payload: {
        memberId: string;
      };
    }
  | {
      type: "add_fourteen_points_ai";
    }
  | {
      type: "remove_fourteen_points_ai";
    };

export type GameAction =
  | ChessMoveAction
  | FourteenPointsCaptureAction
  | FourteenPointsDrawAndDiscardAction
  | FourteenPointsDiscardToOpenAction
  | FiveTenKingPlayCardsAction
  | FiveTenKingPassAction
  | FiveTenKingIntersectAction;

export type AnyGameState = ChessState | FourteenPointsState | FiveTenKingState;

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
  seatOrder: PlayableSeatRole[];
};

export type CreateRoomRequest = {
  gameKey: GameKey;
  config?: Record<string, unknown>;
};

export type CreateRoomResponse = {
  roomId: string;
  roomUrl: string;
  gameKey: GameKey;
};
