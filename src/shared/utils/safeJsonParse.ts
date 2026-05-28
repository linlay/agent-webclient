export function safeJsonParse<T>(
  text: unknown,
  fallback: T,
  isValid?: (value: unknown) => value is T,
): T {
  if (typeof text !== 'string' || text.trim() === '') {
    return fallback;
  }

  try {
    const parsed = JSON.parse(text) as unknown;
    if (isValid) {
      return isValid(parsed) ? parsed : fallback;
    }
    return parsed as T;
  } catch {
    return fallback;
  }
}

export function isObjectJson(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
