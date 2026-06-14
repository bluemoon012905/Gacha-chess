import type { PlayerIdentity } from "./types";

const ADJECTIVES = [
  "Amber",
  "Brisk",
  "Copper",
  "Daring",
  "Ember",
  "Fabled",
  "Golden",
  "Harbor",
  "Ivory",
  "Jade",
  "Kindred",
  "Lunar",
];

const NOUNS = [
  "Bishop",
  "Comet",
  "Drifter",
  "Falcon",
  "Fox",
  "Knight",
  "Lantern",
  "Nomad",
  "Otter",
  "Raven",
  "Sparrow",
  "Voyager",
];

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

export function generateDisplayName(): string {
  const suffix = Math.floor(100 + Math.random() * 900);
  return `${pick(ADJECTIVES)} ${pick(NOUNS)} ${suffix}`;
}

export function createPlayerIdentity(playerId?: string): PlayerIdentity {
  return {
    playerId: playerId ?? crypto.randomUUID(),
    displayName: generateDisplayName(),
  };
}
