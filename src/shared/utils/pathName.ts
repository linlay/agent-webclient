/**
 * Last non-empty segment of a filesystem path, without any trailing
 * separators. Returns an empty string when the path has no segment.
 */
export function pathNameFromPath(path: string): string {
  return String(path || "").trim().split(/[\\/]+/).filter(Boolean).pop() || "";
}
