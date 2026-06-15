import { useEffect, useMemo, useState } from "react";

import type { FourteenPointsState, PlayingCard } from "../../../shared/fourteen-points";
import type { SeatRole } from "../../../shared/types";

type Props = {
  game: FourteenPointsState;
  joinRole: SeatRole;
  pending: boolean;
  onCapture: (handCardId: string, openCardIds: string[]) => Promise<void>;
  onDrawCard: () => Promise<void>;
  onDiscardToOpen: (discardCardId: string) => Promise<void>;
};

const CARD_SPRITE_PATH = "/assets/cards/svg-cards/svg-cards.svg";

function getVisibleHand(game: FourteenPointsState, joinRole: SeatRole): PlayingCard[] {
  if (joinRole === "host") return game.hostHand;
  if (joinRole === "guest") return game.guestHand;
  return [];
}

function getOpponentCount(game: FourteenPointsState, joinRole: SeatRole): number {
  if (joinRole === "host") return game.guestHand.length;
  if (joinRole === "guest") return game.hostHand.length;
  return 0;
}

function canAct(game: FourteenPointsState, joinRole: SeatRole): boolean {
  return (
    game.status === "active" &&
    ((joinRole === "host" && game.activeSeat === "host") ||
      (joinRole === "guest" && game.activeSeat === "guest"))
  );
}

function cardAriaLabel(card: PlayingCard): string {
  if (card.suit === "joker") {
    return `${card.shortLabel} joker`;
  }

  return `${card.rank} of ${card.suit}`;
}

function statusLabel(game: FourteenPointsState): string {
  if (game.status === "complete") {
    if (game.winner === "tie") return "game complete, tie";
    return `game complete, ${game.winner} wins`;
  }

  if (game.turnPhase === "discard") {
    return game.discardSource === "capture" ? `${game.activeSeat} to discard after capture` : `${game.activeSeat} to discard`;
  }

  return `${game.activeSeat} to act`;
}

function PlayingCardFace({
  card,
  selected,
  onClick,
  disabled,
}: {
  card: PlayingCard;
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

export function FourteenPointsRoomView({
  game,
  joinRole,
  pending,
  onCapture,
  onDrawCard,
  onDiscardToOpen,
}: Props) {
  const [selectedHandCardId, setSelectedHandCardId] = useState<string | null>(null);
  const [selectedOpenCardIds, setSelectedOpenCardIds] = useState<string[]>([]);
  const visibleHand = useMemo(() => getVisibleHand(game, joinRole), [game, joinRole]);
  const opponentCount = getOpponentCount(game, joinRole);
  const playerCanAct = canAct(game, joinRole);
  const inDiscardPhase = game.turnPhase === "discard";
  const selectedHandCard = visibleHand.find((card) => card.id === selectedHandCardId) ?? null;
  const captureTotal =
    (selectedHandCard?.value ?? 0) +
    selectedOpenCardIds.reduce((sum, cardId) => {
      const openCard = game.openCards.find((card) => card.id === cardId);
      return sum + (openCard?.value ?? 0);
    }, 0);

  useEffect(() => {
    setSelectedHandCardId((current) =>
      current && visibleHand.some((card) => card.id === current) ? current : null,
    );
  }, [visibleHand]);

  useEffect(() => {
    setSelectedOpenCardIds((current) =>
      current.filter((cardId) => game.openCards.some((card) => card.id === cardId)),
    );
  }, [game.openCards]);

  useEffect(() => {
    if (inDiscardPhase) {
      setSelectedOpenCardIds([]);
    }
  }, [inDiscardPhase]);

  function toggleOpenCard(cardId: string) {
    if (inDiscardPhase) return;
    setSelectedOpenCardIds((current) =>
      current.includes(cardId) ? current.filter((value) => value !== cardId) : [...current, cardId],
    );
  }

  async function submitCapture() {
    if (!selectedHandCardId || selectedOpenCardIds.length === 0) return;
    await onCapture(selectedHandCardId, selectedOpenCardIds);
    setSelectedHandCardId(null);
    setSelectedOpenCardIds([]);
  }

  async function submitDiscardToOpen() {
    if (!selectedHandCardId) return;
    await onDiscardToOpen(selectedHandCardId);
    setSelectedHandCardId(null);
    setSelectedOpenCardIds([]);
  }

  return (
    <section className="card-room-shell">
      <div className="board-meta">
        <div className={`clock-card ${game.activeSeat === "host" ? "active" : ""}`}>
          <span>Host score</span>
          <strong>{game.hostScore}</strong>
        </div>
        <div className={`clock-card ${game.activeSeat === "guest" ? "active" : ""}`}>
          <span>Guest score</span>
          <strong>{game.guestScore}</strong>
        </div>
        <div className="stat-card">
          <span>Status</span>
          <strong>{statusLabel(game)}</strong>
        </div>
        <div className="stat-card">
          <span>Deck</span>
          <strong>{game.deck.length} cards</strong>
        </div>
      </div>

      <div className="card-table">
        <section className="panel-card">
          <h2>Opponent Hand</h2>
          <p>{opponentCount} cards</p>
          <div className="card-row">
            {Array.from({ length: opponentCount }, (_, index) => (
              <PlayingCardBack index={index} key={`back-${index}`} />
            ))}
          </div>
        </section>

        <section className="panel-card">
          <h2>Open Cards</h2>
          <p>
            {inDiscardPhase
              ? game.discardSource === "capture"
                ? "You captured 14 with a full open row. Two replacement cards were drawn into your hand, and now you must place one card into the open area."
                : "You drew a card. Now choose one hand card to place into the open area."
              : "Select open cards to total 14 with one card from your hand."}
          </p>
          <div className="card-row">
            {game.openCards.map((card) => (
              <PlayingCardFace
                card={card}
                disabled={pending || !playerCanAct || inDiscardPhase}
                key={card.id}
                onClick={() => toggleOpenCard(card.id)}
                selected={selectedOpenCardIds.includes(card.id)}
              />
            ))}
          </div>
        </section>

        <section className="panel-card">
          <h2>Your Hand</h2>
          <p>
            {inDiscardPhase
              ? game.discardSource === "capture"
                ? "Choose one card from your hand to return to the open area."
                : "Choose one card to discard into the open area."
              : "Choose one card to capture with, or draw first and then discard one card."}
          </p>
          <div className="card-row">
            {visibleHand.map((card) => (
              <PlayingCardFace
                card={card}
                disabled={pending || !playerCanAct}
                key={card.id}
                onClick={() => setSelectedHandCardId(card.id)}
                selected={selectedHandCardId === card.id}
              />
            ))}
          </div>
        </section>
      </div>

      <section className="setup-panel">
        <div className="card-summary-grid">
          <article className="stat-card">
            <span>Selected total</span>
            <strong>{captureTotal}</strong>
          </article>
          <article className="stat-card">
            <span>Captured cards</span>
            <strong>
              {game.hostCaptured.length} / {game.guestCaptured.length}
            </strong>
          </article>
        </div>
        <p className="status-line">{game.lastAction ?? "Waiting for play."}</p>
        <div className="setup-actions">
          <button
            disabled={
              !playerCanAct ||
              pending ||
              inDiscardPhase ||
              !selectedHandCardId ||
              selectedOpenCardIds.length === 0
            }
            onClick={() => void submitCapture()}
            type="button"
          >
            Capture 14
          </button>
          {inDiscardPhase ? (
            <button
              className="secondary"
              disabled={!playerCanAct || pending || !selectedHandCardId}
              onClick={() => void submitDiscardToOpen()}
              type="button"
            >
              Discard to open
            </button>
          ) : game.deck.length > 0 ? (
            <button
              className="secondary"
              disabled={!playerCanAct || pending}
              onClick={() => void onDrawCard()}
              type="button"
            >
              Draw
            </button>
          ) : (
            <button
              className="secondary"
              disabled={!playerCanAct || pending || !selectedHandCardId}
              onClick={() => void submitDiscardToOpen()}
              type="button"
            >
              Discard to open
            </button>
          )}
        </div>
      </section>
    </section>
  );
}
