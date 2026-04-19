export function normalizeWonders(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
}

export function pickRandomWonders(
  wonders: string[],
  maxCount: number,
  random: () => number = Math.random,
): string[] {
  if (!Array.isArray(wonders) || wonders.length === 0 || maxCount <= 0) {
    return [];
  }

  const pool = [...wonders];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  return pool.slice(0, Math.min(maxCount, pool.length));
}
