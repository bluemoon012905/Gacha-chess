export function getRoomIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/room\/([a-z0-9-]+)$/i);
  return match?.[1] ?? null;
}
