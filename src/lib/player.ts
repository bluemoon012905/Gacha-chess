import { createPlayerIdentity } from "../../shared/player";
import type { PlayerIdentity } from "../../shared/types";

const STORAGE_KEY = "gacha-chess-player";

export function getOrCreatePlayerIdentity(): PlayerIdentity {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<PlayerIdentity>;
      if (parsed.playerId && parsed.displayName) {
        return {
          playerId: parsed.playerId,
          displayName: parsed.displayName,
        };
      }
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }

  const nextIdentity = createPlayerIdentity();
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextIdentity));
  return nextIdentity;
}
