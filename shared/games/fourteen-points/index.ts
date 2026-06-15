import type { GameCatalogEntry, GameAction, PlayerIdentity, RoomState, SeatRole } from "../../types";
import type {
  CardRank,
  CardSuit,
  FourteenPointsLastMove,
  FourteenPointsState,
  PlayingCard,
} from "./logic/types";

export const FOURTEEN_POINTS_GAME_META: GameCatalogEntry = {
  key: "fourteen-points",
  name: "14 Points",
  summary: "Capture open cards by totaling 14, then win on suit-weighted scoring.",
  accent: "Card Table",
  seatOrder: ["host", "guest"],
};

const SUIT_SCORES: Record<CardSuit, number> = {
  hearts: 4,
  spades: 3,
  diamonds: 2,
  clubs: 1,
  joker: 0,
};

const STANDARD_RANKS: Array<{ rank: Exclude<CardRank, "joker">; value: number }> = [
  { rank: "A", value: 1 },
  { rank: "2", value: 2 },
  { rank: "3", value: 3 },
  { rank: "4", value: 4 },
  { rank: "5", value: 5 },
  { rank: "6", value: 6 },
  { rank: "7", value: 7 },
  { rank: "8", value: 8 },
  { rank: "9", value: 9 },
  { rank: "10", value: 10 },
  { rank: "J", value: 11 },
  { rank: "Q", value: 12 },
  { rank: "K", value: 13 },
];

const STANDARD_SUITS: CardSuit[] = ["hearts", "spades", "diamonds", "clubs"];

export function createFourteenPointsGameState(): FourteenPointsState {
  return {
    key: "fourteen-points",
    status: "waiting",
    activeSeat: "host",
    turnPhase: "action",
    discardSource: null,
    deck: [],
    openCards: [],
    hostHand: [],
    guestHand: [],
    hostCaptured: [],
    guestCaptured: [],
    hostScore: 0,
    guestScore: 0,
    winner: null,
    lastAction: null,
    lastMove: null,
    moveCounter: 0,
  };
}

export function startFourteenPointsGame(_: FourteenPointsState): FourteenPointsState {
  const deck = shuffleCards(createDeck());
  const { drawn: hostHand, rest: afterHost } = drawCards(deck, 4);
  const { drawn: guestHand, rest: afterGuest } = drawCards(afterHost, 4);
  const { drawn: openCards, rest: remainingDeck } = drawCards(afterGuest, 4);

  return {
    key: "fourteen-points",
    status: "active",
    activeSeat: "host",
    turnPhase: "action",
    discardSource: null,
    deck: remainingDeck,
    openCards,
    hostHand,
    guestHand,
    hostCaptured: [],
    guestCaptured: [],
    hostScore: 0,
    guestScore: 0,
    winner: null,
    lastAction: "Game started. Host acts first.",
    lastMove: null,
    moveCounter: 0,
  };
}

export function applyFourteenPointsAction(
  state: FourteenPointsState,
  room: RoomState,
  player: PlayerIdentity,
  action: GameAction,
): FourteenPointsState {
  const seat = resolveSeatRole(room, player.playerId);
  if (seat !== "host" && seat !== "guest") {
    throw new Error("Spectators cannot act in the game.");
  }

  if (state.status !== "active") {
    throw new Error("The game is not active.");
  }

  if (state.activeSeat !== seat) {
    throw new Error("It is not your turn.");
  }

  switch (action.type) {
    case "capture_cards":
      return finalizeTurn(applyCapture(state, seat, action.payload.handCardId, action.payload.openCardIds));
    case "draw_card":
      return finalizeTurn(applyDraw(state, seat));
    case "discard_to_open":
      return finalizeTurn(applyDiscardToOpen(state, seat, action.payload.discardCardId));
    default:
      throw new Error("Unsupported 14 points action.");
  }
}

export function normalizeFourteenPointsState(state: FourteenPointsState): FourteenPointsState {
  return {
    ...state,
    key: "fourteen-points",
    deck: state.deck ?? [],
    openCards: state.openCards ?? [],
    hostHand: state.hostHand ?? [],
    guestHand: state.guestHand ?? [],
    hostCaptured: state.hostCaptured ?? [],
    guestCaptured: state.guestCaptured ?? [],
    hostScore: state.hostScore ?? scoreCards(state.hostCaptured ?? []),
    guestScore: state.guestScore ?? scoreCards(state.guestCaptured ?? []),
    winner: state.winner ?? null,
    lastAction: state.lastAction ?? null,
    lastMove: state.lastMove ?? null,
    moveCounter: state.moveCounter ?? 0,
    activeSeat: state.activeSeat ?? "host",
    turnPhase: state.turnPhase ?? "action",
    discardSource: state.discardSource ?? null,
  };
}

export function chooseFourteenPointsAiAction(
  state: FourteenPointsState,
  seat: "host" | "guest",
): Extract<GameAction, { type: "capture_cards" | "draw_card" | "discard_to_open" }> {
  const hand = seat === "host" ? state.hostHand : state.guestHand;

  if (state.turnPhase === "discard" || state.deck.length === 0) {
    const discard = chooseDiscardCard(hand);
    if (!discard) {
      throw new Error("AI could not find a card to discard.");
    }

    return {
      type: "discard_to_open",
      payload: {
        discardCardId: discard.id,
      },
    };
  }

  const capture = findBestCapture(hand, state.openCards);
  if (capture) {
    return {
      type: "capture_cards",
      payload: capture,
    };
  }

  return { type: "draw_card" };
}

export function scoreCards(cards: PlayingCard[]): number {
  return cards.reduce((total, card) => total + card.score, 0);
}

function buildLastMove(
  id: number,
  actor: "host" | "guest",
  type: "capture" | "discard",
  handCard: PlayingCard,
  openCards: PlayingCard[],
): FourteenPointsLastMove {
  return {
    id,
    actor,
    type,
    handCard,
    openCards,
    total: type === "capture" ? handCard.value + openCards.reduce((sum, card) => sum + card.value, 0) : null,
  };
}

function applyCapture(
  state: FourteenPointsState,
  seat: "host" | "guest",
  handCardId: string,
  openCardIds: string[],
): FourteenPointsState {
  if (state.turnPhase !== "action") {
    throw new Error("Discard a card before ending your turn.");
  }

  if (openCardIds.length === 0) {
    throw new Error("Choose at least one open card to capture.");
  }

  const hand = seat === "host" ? state.hostHand : state.guestHand;
  const capturedPile = seat === "host" ? state.hostCaptured : state.guestCaptured;
  const handCard = hand.find((card) => card.id === handCardId);
  if (!handCard) {
    throw new Error("That hand card is not available.");
  }

  const uniqueOpenIds = new Set(openCardIds);
  if (uniqueOpenIds.size !== openCardIds.length) {
    throw new Error("Open cards must not repeat.");
  }

  const openSelection = state.openCards.filter((card) => uniqueOpenIds.has(card.id));
  if (openSelection.length !== openCardIds.length) {
    throw new Error("One or more chosen open cards are not available.");
  }

  const total = handCard.value + openSelection.reduce((sum, card) => sum + card.value, 0);
  if (total !== 14) {
    throw new Error("Chosen cards must total exactly 14.");
  }

  const nextHand = hand.filter((card) => card.id !== handCardId);
  const nextOpen = state.openCards.filter((card) => !uniqueOpenIds.has(card.id));
  const nextCaptured = [...capturedPile, handCard, ...openSelection];
  const qualifiesForCaptureDraw = state.openCards.length === 4;

  let nextState: FourteenPointsState =
    seat === "host"
      ? { ...state, hostHand: nextHand, openCards: nextOpen, hostCaptured: nextCaptured }
      : { ...state, guestHand: nextHand, openCards: nextOpen, guestCaptured: nextCaptured };

  nextState = updateScores(nextState);

  if (qualifiesForCaptureDraw && nextState.deck.length > 0) {
    const { drawn, rest } = drawCards(nextState.deck, 2);
    if (drawn.length > 0) {
      return seat === "host"
        ? {
            ...nextState,
            deck: rest,
            hostHand: [...nextState.hostHand, ...drawn],
            turnPhase: "discard",
            discardSource: "capture",
            lastMove: buildLastMove(nextState.moveCounter + 1, seat, "capture", handCard, openSelection),
            moveCounter: nextState.moveCounter + 1,
            lastAction: `${seat} captured ${openSelection.length + 1} cards for 14 and drew ${drawn.length} card${drawn.length === 1 ? "" : "s"}. Choose 1 to place into the open.`,
          }
        : {
            ...nextState,
            deck: rest,
            guestHand: [...nextState.guestHand, ...drawn],
            turnPhase: "discard",
            discardSource: "capture",
            lastMove: buildLastMove(nextState.moveCounter + 1, seat, "capture", handCard, openSelection),
            moveCounter: nextState.moveCounter + 1,
            lastAction: `${seat} captured ${openSelection.length + 1} cards for 14 and drew ${drawn.length} card${drawn.length === 1 ? "" : "s"}. Choose 1 to place into the open.`,
          };
    }
  }

  nextState = refillHand(nextState, seat);
  nextState = refillOpen(nextState);
  nextState = updateScores(nextState);

  return {
    ...nextState,
    activeSeat: otherSeat(seat),
    turnPhase: "action",
    discardSource: null,
    lastMove: buildLastMove(nextState.moveCounter + 1, seat, "capture", handCard, openSelection),
    moveCounter: nextState.moveCounter + 1,
    lastAction: `${seat} captured ${openSelection.length + 1} cards for 14.`,
  };
}

function applyDraw(
  state: FourteenPointsState,
  seat: "host" | "guest",
): FourteenPointsState {
  if (state.turnPhase !== "action") {
    throw new Error("You already drew this turn. Discard a card to continue.");
  }

  if (state.deck.length === 0) {
    throw new Error("The deck is empty. Choose a card to place into the open area.");
  }

  const drawnCard = state.deck[0];
  const deck = state.deck.slice(1);

  return seat === "host"
    ? {
        ...state,
        deck,
        hostHand: [...state.hostHand, drawnCard],
        turnPhase: "discard",
        discardSource: "draw",
        lastAction: `${seat} drew ${drawnCard.shortLabel}. Choose a card to place into the open.`,
      }
    : {
        ...state,
        deck,
        guestHand: [...state.guestHand, drawnCard],
        turnPhase: "discard",
        discardSource: "draw",
        lastAction: `${seat} drew ${drawnCard.shortLabel}. Choose a card to place into the open.`,
      };
}

function applyDiscardToOpen(
  state: FourteenPointsState,
  seat: "host" | "guest",
  discardCardId: string,
): FourteenPointsState {
  if (state.turnPhase !== "discard" && state.deck.length > 0) {
    throw new Error("Draw a card before discarding.");
  }

  let hand = seat === "host" ? [...state.hostHand] : [...state.guestHand];
  const discardCard = hand.find((card) => card.id === discardCardId);
  if (!discardCard) {
    throw new Error("Choose a valid card to place into the open area.");
  }

  hand = hand.filter((card) => card.id !== discardCardId);
  const openCards = [...state.openCards, discardCard];

  const nextState: FourteenPointsState =
    seat === "host"
      ? {
          ...state,
          hostHand: hand,
          openCards,
          activeSeat: otherSeat(seat),
          turnPhase: "action",
          discardSource: null,
        }
      : {
          ...state,
          guestHand: hand,
          openCards,
          activeSeat: otherSeat(seat),
          turnPhase: "action",
          discardSource: null,
        };

  return {
    ...updateScores(nextState),
    lastMove: buildLastMove(state.moveCounter + 1, seat, "discard", discardCard, []),
    moveCounter: state.moveCounter + 1,
    lastAction:
      state.discardSource === "capture"
        ? `${seat} placed ${discardCard.shortLabel} into the open after the capture draw.`
        : state.turnPhase === "discard"
          ? `${seat} placed ${discardCard.shortLabel} into the open after drawing.`
        : `${seat} placed ${discardCard.shortLabel} into the open.`,
  };
}

function refillHand(state: FourteenPointsState, seat: "host" | "guest"): FourteenPointsState {
  const currentHand = seat === "host" ? state.hostHand : state.guestHand;
  const needed = Math.max(0, 4 - currentHand.length);
  if (needed === 0 || state.deck.length === 0) {
    return state;
  }

  const { drawn, rest } = drawCards(state.deck, needed);
  return seat === "host"
    ? { ...state, deck: rest, hostHand: [...state.hostHand, ...drawn] }
    : { ...state, deck: rest, guestHand: [...state.guestHand, ...drawn] };
}

function refillOpen(state: FourteenPointsState): FourteenPointsState {
  const needed = Math.max(0, 4 - state.openCards.length);
  if (needed === 0 || state.deck.length === 0) {
    return state;
  }

  const { drawn, rest } = drawCards(state.deck, needed);
  return {
    ...state,
    deck: rest,
    openCards: [...state.openCards, ...drawn],
  };
}

function finalizeTurn(state: FourteenPointsState): FourteenPointsState {
  if (state.deck.length === 0 && state.hostHand.length === 0 && state.guestHand.length === 0) {
    if (state.hostScore === state.guestScore) {
      return { ...state, status: "complete", winner: "tie" };
    }

    return {
      ...state,
      status: "complete",
      winner: state.hostScore > state.guestScore ? "host" : "guest",
    };
  }

  return state;
}

function updateScores(state: FourteenPointsState): FourteenPointsState {
  return {
    ...state,
    hostScore: scoreCards(state.hostCaptured),
    guestScore: scoreCards(state.guestCaptured),
  };
}

function otherSeat(seat: "host" | "guest"): "host" | "guest" {
  return seat === "host" ? "guest" : "host";
}

function resolveSeatRole(room: RoomState, playerId: string): SeatRole {
  if (room.seats.host?.playerId === playerId) return "host";
  if (room.seats.guest?.playerId === playerId) return "guest";
  return "spectator";
}

function drawCards(deck: PlayingCard[], count: number): { drawn: PlayingCard[]; rest: PlayingCard[] } {
  return {
    drawn: deck.slice(0, count),
    rest: deck.slice(count),
  };
}

function createDeck(): PlayingCard[] {
  const deck: PlayingCard[] = [];
  let index = 0;

  for (const suit of STANDARD_SUITS) {
    for (const { rank, value } of STANDARD_RANKS) {
      deck.push({
        id: `${suit}-${rank}-${index}`,
        suit,
        rank,
        value,
        score: SUIT_SCORES[suit],
        assetId: toAssetId(suit, rank),
        shortLabel: `${rank}${suit[0].toUpperCase()}`,
      });
      index += 1;
    }
  }

  deck.push({
    id: `joker-red-${index}`,
    suit: "joker",
    rank: "joker",
    value: 5,
    score: 0,
    assetId: "joker_red",
    shortLabel: "JR",
  });
  index += 1;
  deck.push({
    id: `joker-black-${index}`,
    suit: "joker",
    rank: "joker",
    value: 5,
    score: 0,
    assetId: "joker_black",
    shortLabel: "JB",
  });

  return deck;
}

function toAssetId(suit: CardSuit, rank: Exclude<CardRank, "joker">): string {
  const suitKey =
    suit === "hearts" ? "heart" : suit === "spades" ? "spade" : suit === "diamonds" ? "diamond" : "club";
  const rankKey =
    rank === "A"
      ? "1"
      : rank === "J"
        ? "jack"
        : rank === "Q"
          ? "queen"
          : rank === "K"
            ? "king"
            : rank;

  return `${suitKey}_${rankKey}`;
}

function shuffleCards(cards: PlayingCard[]): PlayingCard[] {
  const next = [...cards];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

function randomInt(maxExclusive: number): number {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] % maxExclusive;
}

function chooseDiscardCard(hand: PlayingCard[]): PlayingCard | null {
  if (hand.length === 0) {
    return null;
  }

  return [...hand].sort(compareCardsAscending)[0] ?? null;
}

function findBestCapture(
  hand: PlayingCard[],
  openCards: PlayingCard[],
): { handCardId: string; openCardIds: string[] } | null {
  let best:
    | {
        handCardId: string;
        openCardIds: string[];
        handValue: number;
        openScore: number;
        openValue: number;
      }
    | null = null;

  const subsetCount = 1 << openCards.length;
  for (const handCard of hand) {
    for (let mask = 1; mask < subsetCount; mask += 1) {
      const selection: PlayingCard[] = [];
      let total = handCard.value;
      for (let index = 0; index < openCards.length; index += 1) {
        if ((mask & (1 << index)) === 0) continue;
        const openCard = openCards[index];
        selection.push(openCard);
        total += openCard.value;
      }

      if (total !== 14) continue;

      const candidate = {
        handCardId: handCard.id,
        openCardIds: selection.map((card) => card.id),
        handValue: handCard.value,
        openScore: selection.reduce((sum, card) => sum + card.score, 0),
        openValue: selection.reduce((sum, card) => sum + card.value, 0),
      };

      if (
        !best ||
        candidate.handValue > best.handValue ||
        (candidate.handValue === best.handValue && candidate.openScore > best.openScore) ||
        (candidate.handValue === best.handValue &&
          candidate.openScore === best.openScore &&
          candidate.openValue > best.openValue) ||
        (candidate.handValue === best.handValue &&
          candidate.openScore === best.openScore &&
          candidate.openValue === best.openValue &&
          candidate.openCardIds.length < best.openCardIds.length)
      ) {
        best = candidate;
      }
    }
  }

  return best
    ? {
        handCardId: best.handCardId,
        openCardIds: best.openCardIds,
      }
    : null;
}

function compareCardsAscending(left: PlayingCard, right: PlayingCard): number {
  if (left.value !== right.value) {
    return left.value - right.value;
  }

  if (left.score !== right.score) {
    return left.score - right.score;
  }

  return left.id.localeCompare(right.id);
}
