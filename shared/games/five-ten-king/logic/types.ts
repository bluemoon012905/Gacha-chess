import type { SeatRole } from "../../../types";

export type FiveTenKingSeat = Extract<SeatRole, "north" | "east" | "south" | "west">;
export type FiveTenKingTeam = "north-south" | "east-west";
export type FiveTenKingSuit = "hearts" | "spades" | "diamonds" | "clubs" | "joker";
export type FiveTenKingRank =
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
  | "A"
  | "2"
  | "joker";

export type FiveTenKingCard = {
  id: string;
  deckIndex: number;
  suit: FiveTenKingSuit;
  rank: FiveTenKingRank;
  jokerColor?: "red" | "black";
  assetId: string;
  shortLabel: string;
  points: number;
};

export type FiveTenKingConfig = {
  deckCount: number;
  pointsToWin: number;
  cardsPerPlayer: number;
  doubleJokerOverQuad: boolean;
  intersectEnabled: boolean;
};

export type FiveTenKingComboKind =
  | "single"
  | "pair"
  | "straight"
  | "pair-sequence"
  | "triplet-sequence"
  | "triple-cannon"
  | "regular-510k"
  | "pure-510k"
  | "mixed-jokers"
  | "double-little-jokers"
  | "double-big-jokers"
  | "three-jokers"
  | "four-jokers"
  | "cannon"
  | "intersect";

export type FiveTenKingCombo = {
  kind: FiveTenKingComboKind;
  cards: FiveTenKingCard[];
  size: number;
  primaryRankValue: number;
  sequenceLength?: number;
  suitRank?: number;
  cannonSize?: number;
  specialStrength?: number;
};

export type FiveTenKingPlay = {
  seat: FiveTenKingSeat;
  combo: FiveTenKingCombo;
  cards: FiveTenKingCard[];
};

export type FiveTenKingSettlement = {
  northSouthCaptured: number;
  eastWestCaptured: number;
  northSouthDeadPoints: number;
  eastWestDeadPoints: number;
  northSouthScore: number;
  eastWestScore: number;
  margin: number;
};

export type FiveTenKingState = {
  key: "five-ten-king";
  status: "waiting" | "active" | "complete";
  config: FiveTenKingConfig;
  activeSeat: FiveTenKingSeat;
  leadSeat: FiveTenKingSeat;
  hands: Record<FiveTenKingSeat, FiveTenKingCard[]>;
  finishedSeats: FiveTenKingSeat[];
  currentPlay: FiveTenKingPlay | null;
  trickPile: FiveTenKingCard[];
  passesInRow: number;
  capturedPoints: Record<FiveTenKingTeam, number>;
  winner: FiveTenKingTeam | "tie" | null;
  settlement: FiveTenKingSettlement | null;
  lastAction: string | null;
};
