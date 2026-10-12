export const MAX_KBASE_REFERENCES = 8;

export function normalizeKbaseIds(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((id): id is string => typeof id === "string").map(id => id.trim()).filter(Boolean))]
    : [];
}
