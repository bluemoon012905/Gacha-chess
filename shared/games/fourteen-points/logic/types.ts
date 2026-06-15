import type { SeatRole } from "../../../types";

export type CardSuit = "hearts" | "spades" | "diamonds" | "clubs" | "joker";
export type CardRank =
  | "A"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "J"
  | "Q"
  | "K"
  | "joker";

export type PlayingCard = {
  id: string;
  suit: CardSuit;
  rank: CardRank;
  value: number;
  score: number;
  assetId: string;
  shortLabel: string;
};

export type FourteenPointsLastMove = {
  id: number;
  actor: Extract<SeatRole, "host" | "guest">;
  type: "capture" | "discard";
  handCard: PlayingCard;
  openCards: PlayingCard[];
  total: number | null;
};

export type FourteenPointsState = {
  key: "fourteen-points";
  status: "waiting" | "active" | "complete";
  activeSeat: Extract<SeatRole, "host" | "guest">;
  turnPhase: "action" | "discard";
  discardSource: "draw" | "capture" | null;
  deck: PlayingCard[];
  openCards: PlayingCard[];
  hostHand: PlayingCard[];
  guestHand: PlayingCard[];
  hostCaptured: PlayingCard[];
  guestCaptured: PlayingCard[];
  hostScore: number;
  guestScore: number;
  winner: Extract<SeatRole, "host" | "guest"> | "tie" | null;
  lastAction: string | null;
  lastMove: FourteenPointsLastMove | null;
  moveCounter: number;
};
