import { createPlayerIdentity, resolveDisplayName, sanitizeDisplayName } from "../../shared/player";
import type { PlayerIdentity } from "../../shared/types";

const COOKIE_KEY = "gacha-chess-player";
const LEGACY_STORAGE_KEY = "gacha-chess-player";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

type PlayerNameUpdate = {
  identity: PlayerIdentity;
  generatedFallback: boolean;
  sanitized: boolean;
};

function readCookie(name: string): string | null {
  const prefix = `${name}=`;
  for (const part of document.cookie.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      return decodeURIComponent(trimmed.slice(prefix.length));
    }
  }
  return null;
}

function writeCookie(identity: PlayerIdentity) {
  document.cookie = [
    `${COOKIE_KEY}=${encodeURIComponent(JSON.stringify(identity))}`,
    "Path=/",
    `Max-Age=${COOKIE_MAX_AGE_SECONDS}`,
    "SameSite=Lax",
  ].join("; ");
}

function parseStoredIdentity(raw: string | null): PlayerIdentity | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<PlayerIdentity>;
    if (!parsed.playerId) return null;
    return createPlayerIdentity(parsed.playerId, parsed.displayName);
  } catch {
    return null;
  }
}

export function getOrCreatePlayerIdentity(): PlayerIdentity {
  const cookieIdentity = parseStoredIdentity(readCookie(COOKIE_KEY));
  if (cookieIdentity) {
    writeCookie(cookieIdentity);
    return cookieIdentity;
  }

  const legacyIdentity = parseStoredIdentity(window.localStorage.getItem(LEGACY_STORAGE_KEY));
  if (legacyIdentity) {
    writeCookie(legacyIdentity);
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    return legacyIdentity;
  }

  window.localStorage.removeItem(LEGACY_STORAGE_KEY);

  const nextIdentity = createPlayerIdentity();
  writeCookie(nextIdentity);
  return nextIdentity;
}

export function updatePlayerDisplayName(
  identity: PlayerIdentity,
  requestedDisplayName: string,
): PlayerNameUpdate {
  const sanitized = sanitizeDisplayName(requestedDisplayName);
  const nextDisplayName = sanitized || resolveDisplayName();
  const nextIdentity = {
    ...identity,
    displayName: nextDisplayName,
  };

  writeCookie(nextIdentity);

  return {
    identity: nextIdentity,
    generatedFallback: !sanitized,
    sanitized: nextDisplayName !== requestedDisplayName.trim(),
  };
}
