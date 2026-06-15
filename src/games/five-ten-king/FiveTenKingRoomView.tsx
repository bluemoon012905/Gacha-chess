import { useMemo, useState } from "react";

import type {
  FiveTenKingCard,
  FiveTenKingConfig,
  FiveTenKingSeat,
  FiveTenKingState,
} from "../../../shared/five-ten-king";
import type { SeatRole } from "../../../shared/types";

type Props = {
  game: FiveTenKingState;
  joinRole: SeatRole;
  pending: boolean;
  onPlayCards: (cardIds: string[]) => Promise<void>;
  onPass: () => Promise<void>;
  onIntersect: (cardIds: string[]) => Promise<void>;
};

const CARD_SPRITE_PATH = "/assets/cards/svg-cards/svg-cards.svg";
const SEAT_ORDER: FiveTenKingSeat[] = ["north", "east", "south", "west"];

function isSeat(value: SeatRole): value is FiveTenKingSeat {
  return value === "north" || value === "east" || value === "south" || value === "west";
}

function seatLabel(seat: FiveTenKingSeat): string {
  return seat[0].toUpperCase() + seat.slice(1);
}

function getVisibleHand(game: FiveTenKingState, joinRole: SeatRole): FiveTenKingCard[] {
  return isSeat(joinRole) ? game.hands[joinRole] : [];
}

function cardAriaLabel(card: FiveTenKingCard): string {
  if (card.suit === "joker") {
    return `${card.shortLabel} joker`;
  }

  return `${card.rank} of ${card.suit}`;
}

function PlayingCardFace({
  card,
  selected,
  onClick,
  disabled,
}: {
  card: FiveTenKingCard;
  selected: boolean;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      aria-label={cardAriaLabel(card)}
      className={`card-face ${selected ? "selected" : ""}`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <svg aria-hidden="true" viewBox="0 0 169.075 244.64">
        <use href={`${CARD_SPRITE_PATH}#${card.assetId}`} />
      </svg>
      <span>{card.shortLabel}</span>
    </button>
  );
}

function PlayingCardBack({ index }: { index: number }) {
  return (
    <div className="card-back" key={`card-back-${index}`}>
      <svg aria-hidden="true" viewBox="0 0 169.075 244.64">
        <use href={`${CARD_SPRITE_PATH}#back`} />
      </svg>
    </div>
  );
}

function statusLabel(game: FiveTenKingState): string {
  if (game.status === "complete") {
    if (game.winner === "tie") return "round complete, tie";
    return `round complete, ${game.winner} wins`;
  }

  return `${seatLabel(game.activeSeat)} to act`;
}

function configLabel(config: FiveTenKingConfig): string {
  return `${config.deckCount} deck${config.deckCount === 1 ? "" : "s"} · ${config.cardsPerPlayer} cards each · target ${config.pointsToWin}`;
}

export function FiveTenKingRoomView({
  game,
  joinRole,
  pending,
  onPlayCards,
  onPass,
  onIntersect,
}: Props) {
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const visibleHand = useMemo(() => getVisibleHand(game, joinRole), [game, joinRole]);
  const canAct = isSeat(joinRole) && game.activeSeat === joinRole && game.status === "active";
  const canIntersect =
    isSeat(joinRole) &&
    game.status === "active" &&
    game.config.intersectEnabled &&
    game.currentPlay?.combo.kind === "single" &&
    game.currentPlay.seat !== joinRole;

  function toggleCard(cardId: string) {
    setSelectedCardIds((current) =>
      current.includes(cardId) ? current.filter((value) => value !== cardId) : [...current, cardId],
    );
  }

  async function submitPlay() {
    if (selectedCardIds.length === 0) return;
    await onPlayCards(selectedCardIds);
    setSelectedCardIds([]);
  }

  async function submitIntersect() {
    if (selectedCardIds.length === 0) return;
    await onIntersect(selectedCardIds);
    setSelectedCardIds([]);
  }

  return (
    <section className="card-room-shell">
      <div className="board-meta">
        <div className={`clock-card ${game.activeSeat === "north" || game.activeSeat === "south" ? "active" : ""}`}>
          <span>North / South</span>
          <strong>{game.capturedPoints["north-south"]}</strong>
        </div>
        <div className={`clock-card ${game.activeSeat === "east" || game.activeSeat === "west" ? "active" : ""}`}>
          <span>East / West</span>
          <strong>{game.capturedPoints["east-west"]}</strong>
        </div>
        <div className="stat-card">
          <span>Status</span>
          <strong>{statusLabel(game)}</strong>
        </div>
        <div className="stat-card">
          <span>Rules</span>
          <strong>{configLabel(game.config)}</strong>
        </div>
      </div>

      <div className="card-table">
        {SEAT_ORDER.map((seat) => {
          const count = game.hands[seat].length;
          const isYou = joinRole === seat;
          return (
            <section className="panel-card" key={seat}>
              <h2>{seatLabel(seat)} Hand</h2>
              <p>
                {count} cards
                {game.finishedSeats.includes(seat) ? " · out" : ""}
                {game.currentPlay?.seat === seat ? " · current play" : ""}
              </p>
              <div className="card-row">
                {isYou
                  ? visibleHand.map((card) => (
                      <PlayingCardFace
                        card={card}
                        disabled={pending || (!canAct && !canIntersect)}
                        key={card.id}
                        onClick={() => toggleCard(card.id)}
                        selected={selectedCardIds.includes(card.id)}
                      />
                    ))
                  : Array.from({ length: count }, (_, index) => (
                      <PlayingCardBack index={index} key={`${seat}-back-${index}`} />
                    ))}
              </div>
            </section>
          );
        })}

        <section className="panel-card">
          <h2>Current Trick</h2>
          <p>
            {game.currentPlay
              ? `${seatLabel(game.currentPlay.seat)} played ${game.currentPlay.combo.kind}.`
              : "No active play. Lead any valid combination."}
          </p>
          <div className="card-row">
            {game.trickPile.map((card) => (
              <PlayingCardFace card={card} disabled key={card.id} selected={false} />
            ))}
          </div>
        </section>
      </div>

      <section className="setup-panel">
        <div className="card-summary-grid">
          <article className="stat-card">
            <span>Selected cards</span>
            <strong>{selectedCardIds.length}</strong>
          </article>
          <article className="stat-card">
            <span>Intersect</span>
            <strong>{game.config.intersectEnabled ? "enabled" : "off"}</strong>
          </article>
          <article className="stat-card">
            <span>Double joker vs quad</span>
            <strong>{game.config.doubleJokerOverQuad ? "joker higher" : "quad higher"}</strong>
          </article>
          {game.settlement ? (
            <article className="stat-card">
              <span>Margin</span>
              <strong>{game.settlement.margin}</strong>
            </article>
          ) : null}
        </div>
        {game.settlement ? (
          <p className="status-line">
            Settlement: NS {game.settlement.northSouthScore} ({game.settlement.northSouthCaptured} captured,{" "}
            {game.settlement.northSouthDeadPoints} dead) | EW {game.settlement.eastWestScore} (
            {game.settlement.eastWestCaptured} captured, {game.settlement.eastWestDeadPoints} dead)
          </p>
        ) : null}
        <p className="status-line">{game.lastAction ?? "Waiting for play."}</p>
        <div className="setup-actions">
          <button
            disabled={pending || !canAct || selectedCardIds.length === 0}
            onClick={() => void submitPlay()}
            type="button"
          >
            Play selected
          </button>
          <button
            className="secondary"
            disabled={pending || !canAct || !game.currentPlay}
            onClick={() => void onPass()}
            type="button"
          >
            Pass
          </button>
          <button
            className="secondary"
            disabled={pending || !canIntersect || selectedCardIds.length === 0}
            onClick={() => void submitIntersect()}
            type="button"
          >
            Intersect
          </button>
        </div>
      </section>
    </section>
  );
}
