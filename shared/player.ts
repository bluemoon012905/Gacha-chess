import type { PlayerIdentity } from "./types";

const PLAYER_NAME_MAX_LENGTH = 32;

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

const BANNED_NAME_PARTS = [
  "bastard",
  "bitch",
  "cunt",
  "fuck",
  "motherfucker",
  "nigger",
  "shit",
  "slut",
  "whore",
];

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

export function generateDisplayName(): string {
  const suffix = Math.floor(100 + Math.random() * 900);
  return `${pick(ADJECTIVES)} ${pick(NOUNS)} ${suffix}`;
}

function censorWord(word: string): string {
  const normalized = word.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!normalized) return "";
  if (!BANNED_NAME_PARTS.some((part) => normalized.includes(part))) {
    return word;
  }

  return "*".repeat(Math.max(3, Math.min(word.length, 8)));
}

export function sanitizeDisplayName(input: string): string {
  return input
    .replace(/[^a-zA-Z0-9\s'-]/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map(censorWord)
    .filter(Boolean)
    .join(" ")
    .slice(0, PLAYER_NAME_MAX_LENGTH)
    .trim();
}

export function resolveDisplayName(input?: string | null): string {
  const sanitized = sanitizeDisplayName(input ?? "");
  return sanitized || generateDisplayName();
}

export function createPlayerIdentity(playerId?: string, displayName?: string): PlayerIdentity {
  return {
    playerId: playerId ?? crypto.randomUUID(),
    displayName: resolveDisplayName(displayName),
  };
}
