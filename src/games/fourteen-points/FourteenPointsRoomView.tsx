import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";

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
    <section className="card-room-shell compact-card-room">
      <div className="card-table scenic-table">
        <section className="tabletop-stage two-seat-table">
          <div className={`turn-orbit-chip ${game.activeSeat === "host" ? "turn-north" : "turn-south"}`}>
            Turn
          </div>

          <section className="table-seat seat-north">
            <div className={`seat-chip ${game.activeSeat !== joinRole && game.status === "active" ? "active" : ""}`}>
              <strong>Opponent</strong>
              <span>{opponentCount} cards</span>
            </div>
            <div className="table-hand hand-north">
              {Array.from({ length: opponentCount }, (_, index) => (
                <PlayingCardBack index={index} key={`back-${index}`} />
              ))}
            </div>
          </section>

          <section className="table-center panel-card">
            <div className="table-center-head">
              <div>
                <h2>Open Cards</h2>
                <p>
                  {inDiscardPhase
                    ? game.discardSource === "capture"
                      ? "You captured 14 with a full open row. Two replacement cards were drawn into your hand, and now place one card back into the open area."
                      : "You drew a card. Choose one hand card to place into the open area."
                    : "Select open cards that total 14 with one card from your hand."}
                </p>
              </div>
              <button
                aria-label={game.deck.length > 0 ? `Draw from deck, ${game.deck.length} cards remaining` : "Deck empty"}
                className="table-deck-button"
                disabled={!playerCanAct || pending || inDiscardPhase || game.deck.length === 0}
                onClick={() => void onDrawCard()}
                type="button"
              >
                <div className="table-deck-stack">
                  <div className="card-back deck-card deck-card-1">
                    <svg aria-hidden="true" viewBox="0 0 169.075 244.64">
                      <use href={`${CARD_SPRITE_PATH}#back`} />
                    </svg>
                  </div>
                  <div className="card-back deck-card deck-card-2">
                    <svg aria-hidden="true" viewBox="0 0 169.075 244.64">
                      <use href={`${CARD_SPRITE_PATH}#back`} />
                    </svg>
                  </div>
                  <div className="card-back deck-card deck-card-3">
                    <svg aria-hidden="true" viewBox="0 0 169.075 244.64">
                      <use href={`${CARD_SPRITE_PATH}#back`} />
                    </svg>
                  </div>
                  <span>{game.deck.length} in deck</span>
                </div>
              </button>
            </div>
            <div className="card-row trick-spread">
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

          <div className="table-corner-stat corner-left">
            <span>Selected</span>
            <strong>{captureTotal}</strong>
          </div>
          <div className="table-corner-stat corner-right">
            <span>Captured</span>
            <strong>
              {game.hostCaptured.length} / {game.guestCaptured.length}
            </strong>
          </div>
        </section>

        <section className="table-foreground panel-card">
          <div className="table-foreground-head">
            <div className="seat-chip player-seat-chip">
              <strong>You</strong>
              <span>{visibleHand.length} cards in hand</span>
            </div>
            <div>
              <h2>Your Hand</h2>
              <p>
                {inDiscardPhase
                  ? game.discardSource === "capture"
                    ? "Choose one card from your hand to return to the open area."
                    : "Choose one card to discard into the open area."
                  : "Choose one card to capture with, or draw first and then discard one card."}
              </p>
            </div>
          </div>
          <div className="fan-hand" role="list">
            {visibleHand.map((card, index) => (
              <div
                className="fan-card"
                key={card.id}
                role="listitem"
                style={{ "--card-index": index, "--card-count": visibleHand.length } as CSSProperties}
              >
                <PlayingCardFace
                  card={card}
                  disabled={pending || !playerCanAct}
                  onClick={() => setSelectedHandCardId(card.id)}
                  selected={selectedHandCardId === card.id}
                />
              </div>
            ))}
          </div>
          <div className="table-foreground-footer">
            <div className="table-action-row">
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
              ) : game.deck.length === 0 ? (
                <button
                  className="secondary"
                  disabled={!playerCanAct || pending || !selectedHandCardId}
                  onClick={() => void submitDiscardToOpen()}
                  type="button"
                >
                  Discard to open
                </button>
                ) : null}
            </div>
            <p className="table-status-note">
              {game.lastAction ?? statusLabel(game)}
              {!inDiscardPhase && game.deck.length > 0 ? " Click the deck to draw." : ""}
            </p>
          </div>
        </section>
      </div>
    </section>
  );
}
