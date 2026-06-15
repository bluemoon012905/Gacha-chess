# 14 Points Rules

## Overview

`14 points` is a two-player card collection game played with a single standard 54-card deck:

- 52 standard playing cards
- 2 jokers

The shared room implementation in this repo uses one deck per room and runs the game server-authoritatively.

## Card Values

Standard cards use face value by rank:

- Ace = 1
- 2 through 10 = pip value
- Jack = 11
- Queen = 12
- King = 13

Jokers have a value of `5`.

This means a joker can combine with a `9` to make `14`.

## Card Points

Captured cards are scored by suit:

- Hearts = 4 points
- Spades = 3 points
- Diamonds = 2 points
- Clubs = 1 point

Jokers do not belong to a suit and are worth `0` score points.

## Setup

At game start:

- each player is dealt 4 cards into hand
- 4 cards are dealt face up into the open area
- the remaining cards form the draw deck

For the first implementation, the host takes the first turn.

## Goal

Players try to collect cards by making `14` with:

- exactly 1 card from their hand
- plus 1 or more cards from the open area

When the selected cards total `14`, all of those cards are captured by the acting player and removed from play into that player's collected pile.

## Turn Options

On a turn, a player may do either of the following:

1. Capture:
   Use 1 hand card with 1 or more open cards to total `14`.
2. Draw and discard:
   Draw 1 card from the deck if any remain, then place 1 card from hand into the open area.

The player is allowed to draw and discard even if a legal `14` capture is available.

If the deck is empty, the player cannot draw. In that case, they must place 1 card from hand into the open area if they do not capture.

## Hand And Open Area Size

The hand limit is:

- maximum 4 cards after the turn resolves

The open area limit is:

- minimum target 4 cards while the deck still has cards available
- it may temporarily or permanently contain more than 4 cards

Implementation refill rules:

- after a successful capture, the acting player's hand refills up to 4 from the deck if possible
- after a successful capture, the open area refills up to 4 from the deck if possible
- after draw-and-discard, the acting player's hand ends the turn after discarding; no extra refill happens

This matches the requested behavior where:

- hands normally sit at 4 while the deck can support it
- drawing can briefly create a 5-card hand
- once the deck runs out, hands can fall to 4, 3, 2, or 1 over time

## End Of Game

The game ends when:

- the draw deck is empty
- both players have no cards left in hand

Any cards still left in the open area remain unclaimed.

This is expected in some joker endgames, where a few cards may never be capturable into `14`.

## Winning

When the game ends:

- count score points from each player's captured pile using suit values only
- the player with the higher total wins

If both players have the same total, the game is a tie.

## Implementation Assumptions

These assumptions are explicitly used by the first repo implementation:

- a legal capture uses exactly one hand card
- a legal capture may use multiple open cards
- host acts first
- leftover open cards do not score for either player
