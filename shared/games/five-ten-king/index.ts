import type { GameAction, GameCatalogEntry, PlayerIdentity, RoomState, SeatRole } from "../../types";
import type {
  FiveTenKingCard,
  FiveTenKingCombo,
  FiveTenKingConfig,
  FiveTenKingPlay,
  FiveTenKingSeat,
  FiveTenKingSettlement,
  FiveTenKingState,
  FiveTenKingSuit,
  FiveTenKingTeam,
} from "./logic/types";

export const FIVE_TEN_KING_GAME_META: GameCatalogEntry = {
  key: "five-ten-king",
  name: "5-10-K",
  summary: "Four-player partnership climbing game with 510K specials, bombs, and optional intersect play.",
  accent: "Partnership Table",
  seatOrder: ["north", "east", "south", "west"],
};

type FiveTenKingConfigInput = Partial<FiveTenKingConfig>;

const SEAT_ORDER: FiveTenKingSeat[] = ["north", "east", "south", "west"];
const TEAM_BY_SEAT: Record<FiveTenKingSeat, FiveTenKingTeam> = {
  north: "north-south",
  east: "east-west",
  south: "north-south",
  west: "east-west",
};

const RANK_ORDER = ["3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2"] as const;
const SUIT_ORDER: Record<Exclude<FiveTenKingSuit, "joker">, number> = {
  hearts: 4,
  spades: 3,
  diamonds: 2,
  clubs: 1,
};

export function createFiveTenKingGameState(): FiveTenKingState {
  const config = normalizeConfig({});
  return {
    key: "five-ten-king",
    status: "waiting",
    config,
    activeSeat: "north",
    leadSeat: "north",
    hands: {
      north: [],
      east: [],
      south: [],
      west: [],
    },
    finishedSeats: [],
    currentPlay: null,
    trickPile: [],
    passesInRow: 0,
    capturedPoints: {
      "north-south": 0,
      "east-west": 0,
    },
    winner: null,
    settlement: null,
    lastAction: null,
  };
}

export function configureFiveTenKingGame(
  state: FiveTenKingState,
  body: FiveTenKingConfigInput,
): FiveTenKingState {
  return {
    ...createFiveTenKingGameState(),
    config: normalizeConfig(body, state.config),
  };
}

export function startFiveTenKingGame(state: FiveTenKingState): FiveTenKingState {
  const config = normalizeConfig(state.config);
  const deck = shuffleCards(createDeck(config.deckCount));
  const cardsPerPlayer = Math.min(config.cardsPerPlayer, Math.floor(deck.length / SEAT_ORDER.length));
  const hands: Record<FiveTenKingSeat, FiveTenKingCard[]> = {
    north: [],
    east: [],
    south: [],
    west: [],
  };

  let index = 0;
  for (const seat of SEAT_ORDER) {
    hands[seat] = sortCards(deck.slice(index, index + cardsPerPlayer));
    index += cardsPerPlayer;
  }

  const leadSeat = findAceOfHeartsSeat(hands);
  return {
    key: "five-ten-king",
    status: "active",
    config,
    activeSeat: leadSeat,
    leadSeat,
    hands,
    finishedSeats: [],
    currentPlay: null,
    trickPile: [],
    passesInRow: 0,
    capturedPoints: {
      "north-south": 0,
      "east-west": 0,
    },
    winner: null,
    settlement: null,
    lastAction: `${capitalizeSeat(leadSeat)} leads first with the Ace of Hearts.`,
  };
}

export function applyFiveTenKingAction(
  state: FiveTenKingState,
  room: RoomState,
  player: PlayerIdentity,
  action: GameAction,
): FiveTenKingState {
  const seat = resolveSeatRole(room, player.playerId);
  if (!isFiveTenKingSeat(seat)) {
    throw new Error("Spectators cannot act in the game.");
  }

  if (state.status !== "active") {
    throw new Error("The game is not active.");
  }

  switch (action.type) {
    case "play_cards":
      if (state.activeSeat !== seat) {
        throw new Error("It is not your turn.");
      }
      return finalizeAfterPlay(playCards(state, seat, action.payload.cardIds, false));
    case "intersect_play":
      return finalizeAfterPlay(playCards(state, seat, action.payload.cardIds, true));
    case "pass_turn":
      if (state.activeSeat !== seat) {
        throw new Error("It is not your turn.");
      }
      return passTurn(state, seat);
    default:
      throw new Error("Unsupported 5-10-k action.");
  }
}

export function normalizeFiveTenKingState(state: FiveTenKingState): FiveTenKingState {
  return {
    ...state,
    key: "five-ten-king",
    config: normalizeConfig(state.config),
    hands: {
      north: sortCards(state.hands?.north ?? []),
      east: sortCards(state.hands?.east ?? []),
      south: sortCards(state.hands?.south ?? []),
      west: sortCards(state.hands?.west ?? []),
    },
    finishedSeats: state.finishedSeats ?? [],
    currentPlay: state.currentPlay ?? null,
    trickPile: state.trickPile ?? [],
    passesInRow: state.passesInRow ?? 0,
    capturedPoints: {
      "north-south": state.capturedPoints?.["north-south"] ?? 0,
      "east-west": state.capturedPoints?.["east-west"] ?? 0,
    },
    winner: state.winner ?? null,
    settlement: state.settlement ?? null,
    lastAction: state.lastAction ?? null,
  };
}

function normalizeConfig(
  body: FiveTenKingConfigInput,
  base?: FiveTenKingConfig,
): FiveTenKingConfig {
  const deckCount = clampInt(body.deckCount ?? base?.deckCount ?? 2, 1, 4);
  const maxCardsPerPlayer = Math.floor((deckCount * 54) / SEAT_ORDER.length);
  const requestedCardsPerPlayer = body.cardsPerPlayer ?? base?.cardsPerPlayer ?? maxCardsPerPlayer;

  return {
    deckCount,
    pointsToWin: clampInt(body.pointsToWin ?? base?.pointsToWin ?? 200, 10, deckCount * 200),
    cardsPerPlayer: clampInt(requestedCardsPerPlayer, 1, maxCardsPerPlayer),
    doubleJokerOverQuad: Boolean(body.doubleJokerOverQuad ?? base?.doubleJokerOverQuad ?? false),
    intersectEnabled: Boolean(body.intersectEnabled ?? base?.intersectEnabled ?? true),
  };
}

function playCards(
  state: FiveTenKingState,
  seat: FiveTenKingSeat,
  cardIds: string[],
  intersect: boolean,
): FiveTenKingState {
  if (cardIds.length === 0) {
    throw new Error("Choose at least one card to play.");
  }

  const hand = state.hands[seat];
  const selected = selectCards(hand, cardIds);
  const combo = analyzeCombo(selected, state.config);

  if (intersect) {
    validateIntersect(state, seat, combo);
  } else {
    validateStandardPlay(state, combo);
  }

  const nextHands = {
    ...state.hands,
    [seat]: sortCards(hand.filter((card) => !cardIds.includes(card.id))),
  };

  const nextFinishedSeats =
    nextHands[seat].length === 0 && !state.finishedSeats.includes(seat)
      ? [...state.finishedSeats, seat]
      : state.finishedSeats;

  const nextPlay: FiveTenKingPlay = {
    seat,
    combo,
    cards: selected,
  };
  const nextActiveSeat = findNextActiveSeat(nextHands, nextFinishedSeats, seat);

  return {
    ...state,
    hands: nextHands,
    finishedSeats: nextFinishedSeats,
    currentPlay: nextPlay,
    trickPile: [...state.trickPile, ...selected],
    passesInRow: 0,
    leadSeat: seat,
    activeSeat: nextActiveSeat,
    lastAction: intersect
      ? `${capitalizeSeat(seat)} intersected with ${formatCards(selected)}.`
      : `${capitalizeSeat(seat)} played ${describeCombo(combo)}.`,
  };
}

function validateStandardPlay(state: FiveTenKingState, combo: FiveTenKingCombo): void {
  if (!state.currentPlay) {
    return;
  }

  if (!canBeatCombo(combo, state.currentPlay.combo, state.config)) {
    throw new Error("That play does not beat the current combination.");
  }
}

function validateIntersect(
  state: FiveTenKingState,
  seat: FiveTenKingSeat,
  combo: FiveTenKingCombo,
): void {
  if (!state.config.intersectEnabled) {
    throw new Error("Intersect is disabled for this room.");
  }

  if (!state.currentPlay || state.currentPlay.combo.kind !== "single") {
    throw new Error("Intersect is only available against a single.");
  }

  if (seat === state.currentPlay.seat) {
    throw new Error("You cannot intersect your own play.");
  }

  if (combo.kind !== "intersect") {
    throw new Error("Intersect requires a pair matching the single's rank.");
  }

  if (combo.primaryRankValue !== state.currentPlay.combo.primaryRankValue) {
    throw new Error("Intersect must match the rank of the current single.");
  }
}

function passTurn(state: FiveTenKingState, seat: FiveTenKingSeat): FiveTenKingState {
  if (!state.currentPlay) {
    throw new Error("You cannot pass on an empty trick.");
  }

  const requiredPasses = countOtherActiveSeats(state.hands, state.finishedSeats, state.currentPlay.seat);
  const passesInRow = state.passesInRow + 1;

  if (passesInRow >= requiredPasses) {
    const capturingTeam = TEAM_BY_SEAT[state.currentPlay.seat];
    const trickPoints = scorePointCards(state.trickPile);
    return {
      ...state,
      capturedPoints: {
        ...state.capturedPoints,
        [capturingTeam]: state.capturedPoints[capturingTeam] + trickPoints,
      },
      currentPlay: null,
      trickPile: [],
      passesInRow: 0,
      activeSeat: state.currentPlay.seat,
      leadSeat: state.currentPlay.seat,
      lastAction: `${capitalizeSeat(state.currentPlay.seat)} collected ${trickPoints} points and leads again.`,
    };
  }

  return {
    ...state,
    passesInRow,
    activeSeat: findNextActiveSeat(state.hands, state.finishedSeats, seat),
    lastAction: `${capitalizeSeat(seat)} passed.`,
  };
}

function finalizeAfterPlay(state: FiveTenKingState): FiveTenKingState {
  const northSouthOut = state.finishedSeats.includes("north") && state.finishedSeats.includes("south");
  const eastWestOut = state.finishedSeats.includes("east") && state.finishedSeats.includes("west");
  if (!northSouthOut && !eastWestOut) {
    return state;
  }

  const settlement = settleScores(state);
  const winner = resolveWinnerFromSettlement(settlement, state.config.pointsToWin);

  return {
    ...state,
    status: "complete",
    winner,
    settlement,
    lastAction:
      winner === "tie"
        ? `Round complete in a tie at ${settlement.northSouthScore}-${settlement.eastWestScore}.`
        : `Round complete. ${winner} wins ${settlement.northSouthScore}-${settlement.eastWestScore}.`,
  };
}

function resolveWinnerFromSettlement(
  settlement: FiveTenKingSettlement,
  pointsToWin: number,
): FiveTenKingState["winner"] {
  const northSouthReached = settlement.northSouthScore >= pointsToWin;
  const eastWestReached = settlement.eastWestScore >= pointsToWin;

  if (northSouthReached && !eastWestReached) return "north-south";
  if (eastWestReached && !northSouthReached) return "east-west";
  if (settlement.northSouthScore === settlement.eastWestScore) return "tie";
  return settlement.northSouthScore > settlement.eastWestScore ? "north-south" : "east-west";
}

function settleScores(state: FiveTenKingState): FiveTenKingSettlement {
  const northSouthDeadPoints = scorePointCards([...state.hands.north, ...state.hands.south]);
  const eastWestDeadPoints = scorePointCards([...state.hands.east, ...state.hands.west]);
  const northSouthScore = state.capturedPoints["north-south"] - northSouthDeadPoints;
  const eastWestScore = state.capturedPoints["east-west"] - eastWestDeadPoints;

  return {
    northSouthCaptured: state.capturedPoints["north-south"],
    eastWestCaptured: state.capturedPoints["east-west"],
    northSouthDeadPoints,
    eastWestDeadPoints,
    northSouthScore,
    eastWestScore,
    margin: Math.floor(Math.abs(northSouthScore - eastWestScore) / 10),
  };
}

function analyzeCombo(cards: FiveTenKingCard[], config: FiveTenKingConfig): FiveTenKingCombo {
  const sorted = sortCards(cards);
  const counts = groupByRank(sorted);
  const uniqueRanks = [...counts.values()].map((group) => group[0]);
  const rankValues = uniqueRanks.map((card) => rankValue(card.rank, card.jokerColor));
  const allSameRank = uniqueRanks.length === 1;
  const jokerCount = sorted.filter((card) => card.suit === "joker").length;

  if (sorted.length === 1) {
    return {
      kind: "single",
      cards: sorted,
      size: 1,
      primaryRankValue: rankValue(sorted[0].rank, sorted[0].jokerColor),
    };
  }

  if (sorted.length === 2 && allSameRank && sorted[0].rank !== "joker") {
    return {
      kind: "pair",
      cards: sorted,
      size: 2,
      primaryRankValue: rankValues[0],
    };
  }

  if (sorted.length === 2 && jokerCount === 2) {
    const sameColor = sorted[0].jokerColor === sorted[1].jokerColor;
    if (sameColor && sorted[0].jokerColor === "red") {
      return specialCombo("double-big-jokers", sorted, getSpecialStrength("double-big-jokers", config));
    }
    if (sameColor && sorted[0].jokerColor === "black") {
      return specialCombo("double-little-jokers", sorted, getSpecialStrength("double-little-jokers", config));
    }
    return specialCombo("mixed-jokers", sorted, getSpecialStrength("mixed-jokers", config));
  }

  if (sorted.length === 2 && allSameRank) {
    return {
      kind: "intersect",
      cards: sorted,
      size: 2,
      primaryRankValue: rankValues[0],
    };
  }

  if (sorted.length === 3 && isRegular510K(sorted)) {
    return specialCombo("regular-510k", sorted, getSpecialStrength("regular-510k", config));
  }

  if (sorted.length === 3 && isPure510K(sorted)) {
    const suit = sorted[0].suit as Exclude<FiveTenKingSuit, "joker">;
    return {
      kind: "pure-510k",
      cards: sorted,
      size: 3,
      primaryRankValue: 0,
      suitRank: SUIT_ORDER[suit],
      specialStrength: getSpecialStrength("pure-510k", config) * 10 + SUIT_ORDER[suit],
    };
  }

  if (sorted.length === 3 && allSameRank && sorted[0].rank !== "joker") {
    return specialCombo("triple-cannon", sorted, getSpecialStrength("triple-cannon", config), {
      primaryRankValue: rankValues[0],
    });
  }

  if (sorted.length === 3 && jokerCount === 3) {
    return specialCombo("three-jokers", sorted, getSpecialStrength("three-jokers", config));
  }

  if (sorted.length === 4 && jokerCount === 4) {
    return specialCombo("four-jokers", sorted, getSpecialStrength("four-jokers", config));
  }

  if (allSameRank && sorted[0].rank !== "joker" && sorted.length >= 4) {
    return specialCombo("cannon", sorted, getSpecialStrength("cannon", config, sorted.length), {
      primaryRankValue: rankValues[0],
      cannonSize: sorted.length,
    });
  }

  if (isStraight(sorted)) {
    return {
      kind: "straight",
      cards: sorted,
      size: sorted.length,
      primaryRankValue: Math.max(...sorted.map((card) => rankValue(card.rank, card.jokerColor))),
      sequenceLength: sorted.length,
    };
  }

  if (isRepeatedSequence(counts, 2)) {
    return {
      kind: "pair-sequence",
      cards: sorted,
      size: sorted.length,
      primaryRankValue: Math.max(...rankValues),
      sequenceLength: sorted.length / 2,
    };
  }

  if (isRepeatedSequence(counts, 3)) {
    return {
      kind: "triplet-sequence",
      cards: sorted,
      size: sorted.length,
      primaryRankValue: Math.max(...rankValues),
      sequenceLength: sorted.length / 3,
    };
  }

  throw new Error("That card set is not a supported 5-10-k combination.");
}

function canBeatCombo(
  candidate: FiveTenKingCombo,
  current: FiveTenKingCombo,
  config: FiveTenKingConfig,
): boolean {
  if (current.kind === "intersect") {
    return (candidate.specialStrength ?? -1) >= getSpecialStrength("regular-510k", config);
  }

  if (candidate.kind === current.kind) {
    switch (candidate.kind) {
      case "single":
      case "pair":
      case "triple-cannon":
        return candidate.primaryRankValue > current.primaryRankValue;
      case "straight":
      case "pair-sequence":
      case "triplet-sequence":
        return (
          candidate.sequenceLength === current.sequenceLength &&
          candidate.primaryRankValue > current.primaryRankValue
        );
      case "pure-510k":
        return (candidate.suitRank ?? 0) > (current.suitRank ?? 0);
      case "cannon":
        return compareSpecial(candidate, current);
      default:
        return compareSpecial(candidate, current);
    }
  }

  const candidateSpecial = candidate.specialStrength ?? -1;
  const currentSpecial = current.specialStrength ?? -1;

  if (candidateSpecial >= 0 || currentSpecial >= 0) {
    return candidateSpecial > currentSpecial;
  }

  if (current.kind === "pair-sequence") {
    return isMinimumCounter(candidate, "pair-sequence");
  }

  if (current.kind === "triplet-sequence") {
    return isMinimumCounter(candidate, "triplet-sequence");
  }

  if (current.kind === "single" || current.kind === "pair" || current.kind === "straight") {
    return candidateSpecial >= getSpecialStrength("triple-cannon", config);
  }

  return false;
}

function compareSpecial(candidate: FiveTenKingCombo, current: FiveTenKingCombo): boolean {
  if ((candidate.specialStrength ?? -1) !== (current.specialStrength ?? -1)) {
    return (candidate.specialStrength ?? -1) > (current.specialStrength ?? -1);
  }

  return candidate.primaryRankValue > current.primaryRankValue;
}

function isMinimumCounter(candidate: FiveTenKingCombo, against: "pair-sequence" | "triplet-sequence"): boolean {
  if (candidate.kind !== "cannon" || !candidate.cannonSize) {
    return false;
  }

  return against === "pair-sequence" ? candidate.cannonSize >= 4 : candidate.cannonSize >= 6;
}

function getSpecialStrength(
  kind:
    | FiveTenKingCombo["kind"]
    | "cannon",
  config: FiveTenKingConfig,
  cannonSize?: number,
): number {
  const quadBaseline = config.doubleJokerOverQuad ? 70 : 90;
  switch (kind) {
    case "triple-cannon":
      return 10;
    case "regular-510k":
      return 20;
    case "mixed-jokers":
      return config.doubleJokerOverQuad ? 80 : 30;
    case "pure-510k":
      return 40;
    case "double-little-jokers":
      return config.doubleJokerOverQuad ? 90 : 50;
    case "double-big-jokers":
      return config.doubleJokerOverQuad ? 100 : 60;
    case "cannon":
      switch (cannonSize) {
        case 4:
          return quadBaseline;
        case 5:
          return 110;
        case 6:
          return 130;
        case 7:
          return 150;
        case 8:
          return 170;
        default:
          return 170 + (cannonSize ?? 8);
      }
    case "three-jokers":
      return 120;
    case "four-jokers":
      return 160;
    default:
      return -1;
  }
}

function specialCombo(
  kind: FiveTenKingCombo["kind"],
  cards: FiveTenKingCard[],
  strength: number,
  extra?: Partial<FiveTenKingCombo>,
): FiveTenKingCombo {
  return {
    kind,
    cards,
    size: cards.length,
    primaryRankValue: extra?.primaryRankValue ?? 0,
    specialStrength: strength,
    sequenceLength: extra?.sequenceLength,
    suitRank: extra?.suitRank,
    cannonSize: extra?.cannonSize,
  };
}

function isRegular510K(cards: FiveTenKingCard[]): boolean {
  const ranks = cards.map((card) => card.rank).sort();
  const suits = new Set(cards.map((card) => card.suit));
  return ranks.join(",") === ["10", "5", "K"].sort().join(",") && suits.size > 1;
}

function isPure510K(cards: FiveTenKingCard[]): boolean {
  const ranks = cards.map((card) => card.rank).sort();
  const suits = new Set(cards.map((card) => card.suit));
  return ranks.join(",") === ["10", "5", "K"].sort().join(",") && suits.size === 1 && !suits.has("joker");
}

function isStraight(cards: FiveTenKingCard[]): boolean {
  if (cards.length < 3) return false;
  if (cards.some((card) => card.suit === "joker" || card.rank === "2")) return false;
  const values = cards.map((card) => rankValue(card.rank, card.jokerColor)).sort((a, b) => a - b);
  const unique = new Set(values);
  if (unique.size !== values.length) return false;
  for (let index = 1; index < values.length; index += 1) {
    if (values[index] !== values[index - 1] + 1) return false;
  }
  return true;
}

function isRepeatedSequence(counts: Map<string, FiveTenKingCard[]>, repeats: number): boolean {
  const entries = [...counts.entries()];
  if (entries.length < 3) return false;
  if (entries.some(([rank, cards]) => rank === "2" || rank === "joker" || cards.length !== repeats)) {
    return false;
  }

  const values = entries.map(([rank]) => rankValue(rank as FiveTenKingCard["rank"])).sort((a, b) => a - b);
  for (let index = 1; index < values.length; index += 1) {
    if (values[index] !== values[index - 1] + 1) return false;
  }

  return true;
}

function groupByRank(cards: FiveTenKingCard[]): Map<string, FiveTenKingCard[]> {
  const grouped = new Map<string, FiveTenKingCard[]>();
  for (const card of cards) {
    const key = card.suit === "joker" ? `joker-${card.jokerColor}` : card.rank;
    grouped.set(key, [...(grouped.get(key) ?? []), card]);
  }
  return grouped;
}

function selectCards(hand: FiveTenKingCard[], cardIds: string[]): FiveTenKingCard[] {
  const uniqueIds = new Set(cardIds);
  if (uniqueIds.size !== cardIds.length) {
    throw new Error("Cards must not repeat.");
  }

  const selected = hand.filter((card) => uniqueIds.has(card.id));
  if (selected.length !== cardIds.length) {
    throw new Error("One or more selected cards are not in your hand.");
  }

  return selected;
}

function findAceOfHeartsSeat(hands: Record<FiveTenKingSeat, FiveTenKingCard[]>): FiveTenKingSeat {
  return (
    SEAT_ORDER.find((seat) =>
      hands[seat].some((card) => card.rank === "A" && card.suit === "hearts"),
    ) ?? "north"
  );
}

function findNextActiveSeat(
  hands: Record<FiveTenKingSeat, FiveTenKingCard[]>,
  finishedSeats: FiveTenKingSeat[],
  fromSeat: FiveTenKingSeat,
): FiveTenKingSeat {
  const startIndex = SEAT_ORDER.indexOf(fromSeat);
  for (let offset = 1; offset <= SEAT_ORDER.length; offset += 1) {
    const seat = SEAT_ORDER[(startIndex + offset) % SEAT_ORDER.length];
    if (!finishedSeats.includes(seat) && hands[seat].length > 0) {
      return seat;
    }
  }
  return fromSeat;
}

function countOtherActiveSeats(
  hands: Record<FiveTenKingSeat, FiveTenKingCard[]>,
  finishedSeats: FiveTenKingSeat[],
  currentSeat: FiveTenKingSeat,
): number {
  return SEAT_ORDER.filter(
    (seat) => seat !== currentSeat && !finishedSeats.includes(seat) && hands[seat].length > 0,
  ).length;
}

function createDeck(deckCount: number): FiveTenKingCard[] {
  const deck: FiveTenKingCard[] = [];
  let id = 0;

  for (let deckIndex = 0; deckIndex < deckCount; deckIndex += 1) {
    for (const suit of ["hearts", "spades", "diamonds", "clubs"] as const) {
      for (const rank of RANK_ORDER) {
        deck.push({
          id: `d${deckIndex}-${suit}-${rank}-${id}`,
          deckIndex,
          suit,
          rank,
          assetId: toAssetId(suit, rank),
          shortLabel: `${rank}${suit[0].toUpperCase()}`,
          points: rank === "5" ? 5 : rank === "10" || rank === "K" ? 10 : 0,
        });
        id += 1;
      }
    }

    deck.push({
      id: `d${deckIndex}-joker-red-${id}`,
      deckIndex,
      suit: "joker",
      rank: "joker",
      jokerColor: "red",
      assetId: "joker_red",
      shortLabel: "JR",
      points: 0,
    });
    id += 1;
    deck.push({
      id: `d${deckIndex}-joker-black-${id}`,
      deckIndex,
      suit: "joker",
      rank: "joker",
      jokerColor: "black",
      assetId: "joker_black",
      shortLabel: "JB",
      points: 0,
    });
    id += 1;
  }

  return deck;
}

function toAssetId(suit: Exclude<FiveTenKingSuit, "joker">, rank: FiveTenKingCard["rank"]): string {
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

function sortCards(cards: FiveTenKingCard[]): FiveTenKingCard[] {
  return [...cards].sort((left, right) => {
    const rankDiff = rankValue(left.rank, left.jokerColor) - rankValue(right.rank, right.jokerColor);
    if (rankDiff !== 0) return rankDiff;
    const leftSuit = left.suit === "joker" ? 5 : SUIT_ORDER[left.suit];
    const rightSuit = right.suit === "joker" ? 5 : SUIT_ORDER[right.suit];
    return leftSuit - rightSuit;
  });
}

function rankValue(rank: FiveTenKingCard["rank"], jokerColor?: FiveTenKingCard["jokerColor"]): number {
  if (rank === "joker") {
    return jokerColor === "red" ? 16 : 15;
  }

  return RANK_ORDER.indexOf(rank as (typeof RANK_ORDER)[number]) + 3;
}

function scorePointCards(cards: FiveTenKingCard[]): number {
  return cards.reduce((total, card) => total + card.points, 0);
}

function formatCards(cards: FiveTenKingCard[]): string {
  return cards.map((card) => card.shortLabel).join(" ");
}

function describeCombo(combo: FiveTenKingCombo): string {
  switch (combo.kind) {
    case "single":
    case "pair":
    case "straight":
    case "pair-sequence":
    case "triplet-sequence":
      return formatCards(combo.cards);
    case "regular-510k":
    case "pure-510k":
      return `${combo.kind} (${formatCards(combo.cards)})`;
    case "intersect":
      return `intersect ${formatCards(combo.cards)}`;
    default:
      return `${combo.kind} (${formatCards(combo.cards)})`;
  }
}

function resolveSeatRole(room: RoomState, playerId: string): SeatRole {
  for (const seat of room.seatOrder) {
    if (room.seats[seat]?.playerId === playerId) {
      return seat;
    }
  }
  return "spectator";
}

function isFiveTenKingSeat(seat: SeatRole): seat is FiveTenKingSeat {
  return seat === "north" || seat === "east" || seat === "south" || seat === "west";
}

function capitalizeSeat(seat: FiveTenKingSeat): string {
  return seat[0].toUpperCase() + seat.slice(1);
}

function shuffleCards(cards: FiveTenKingCard[]): FiveTenKingCard[] {
  const next = [...cards];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function randomInt(maxExclusive: number): number {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] % maxExclusive;
}
