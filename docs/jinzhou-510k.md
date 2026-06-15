# Jinzhou 510K

## Overview

Jinzhou 510K is a four-player partnership climbing game from Western Liaoning, China.

Core structure:

- 4 players
- 2 teams of 2
- 2 standard decks including jokers
- 108 total cards

The game revolves around winning tricks, capturing scoring cards, and finishing with both teammates out of cards before the other team.

## Scoring Cards

Only the following cards are point cards:

- `5` = 5 points
- `10` = 10 points
- `K` = 10 points

Across two decks, the total available point value is 200.

## Turn Structure

- The player with the Ace of Hearts leads the first trick.
- On a turn, a player must either beat the current play or pass.
- If three consecutive players pass, the player who made the last valid play wins the trick and collects the point cards in that trick.
- That same player leads the next trick.

## End Of Round

The round does not end when a single player empties their hand.

A team only finishes successfully when both teammates have played all of their cards.

If players still hold cards at the end:

- point cards left in their hand count as negative points for their team
- this is described in the source notes as deducting "dead points"

The source material also states:

- catching one losing player deducts 30 points
- catching two losing players deducts 50 points

This penalty logic should be treated as part of the round settlement model if the game is implemented.

## Result Calculation

After captured points and end-of-round deductions are applied:

- compare the two team totals
- subtract one side from the other
- divide the point difference by 10 to determine the round margin

## Card Order

Low to high:

- `3 4 5 6 7 8 9 10 J Q K A 2`
- Little Joker
- Big Joker

## Standard Combinations

### Singles

- one card

### Pairs

- two cards of the same rank

### Straights

- 3 or more consecutive singles
- maximum length appears to be 12 cards
- `2` cannot be included

Examples:

- `345`
- `5678`
- `10JQKA`

### Sequences Of Pairs

- 3 or more consecutive pairs
- `2` cannot be included

Examples:

- `33 44 55 66`
- `1010 JJ QQ`

### Sequences Of Triplets

- 3 or more consecutive triplets
- `2` cannot be included

Examples:

- `333 444 555`
- `JJJ QQQ KKK`

## Special Combinations

### Triple Cannon

- 3 of a kind

### Five-Ten-King

A combination containing `5`, `10`, and `K`.

Variants:

- Regular 510K: mixed suits
- Pure 510K: all same suit

Pure 510K suit ranking:

- Spades
- Hearts
- Clubs
- Diamonds

### Jokers

The source notes distinguish:

- one Big Joker + one Little Joker
- two Big Jokers
- two Little Jokers
- three Jokers
- four Jokers

### Higher Cannons

Higher same-rank bombs are described as:

- Quad Cannon: 4 of a kind
- Quintuple Cannon: 5 of a kind
- Sextuple Cannon: 6 of a kind
- Septuple Cannon: 7 of a kind
- Octuple Cannon: 8 of a kind

Octuple Cannon is the highest listed bomb type.

## Combination Hierarchy Notes

The uploaded source describes the following relationships:

- bombs outrank singles, pairs, and straights
- a larger sequence of pairs beats a smaller sequence of pairs
- otherwise, the smallest counter to a sequence of pairs is a Quad Cannon
- a larger sequence of triplets beats a smaller sequence of triplets
- otherwise, the smallest counter to a sequence of triplets is a Sextuple Cannon

Special-hand ordering from strongest to weakest in the source material:

1. Octuple Cannon
2. Four Jokers
3. Septuple Cannon
4. Sextuple Cannon
5. Three Jokers
6. Quintuple Cannon
7. Quad Cannon
8. Two Big Jokers
9. Two Little Jokers
10. Pure 510K
11. Big Joker + Little Joker
12. Regular 510K
13. Triple Cannon

This ordering should be treated as source-derived and validated before implementation.

## Implementation Notes

The uploaded file appears to be a translated and partially promotional rules summary rather than a clean primary rulebook. Some details are clear enough to preserve now, but several areas still need confirmation before coding:

- whether all listed special combinations are legal in every local ruleset
- exact resolution of trick points on the table
- exact meaning of "capturing one loser" and "capturing two losers"
- whether pair/triplet sequences must match exact length to contest each other
- whether joker pairing rules vary by table

## Recommended Status

This game should be treated as:

- documented enough for backlog planning
- not yet documented enough for full implementation

Before coding, the next step should be producing a repo-native implementation spec with:

- exact trick resolution rules
- exact valid-response rules
- scoring examples
- end-of-round worked examples
