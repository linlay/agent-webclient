const WINDOWS_DRIVE_ROOT = /^[A-Za-z]:$/;

/**
 * Resolve the parent directory of a path that may be POSIX or Windows native.
 *
 * The desktop "open folder" action receives paths from two different sources:
 * protocol file-change events carry the OS-native absolute path written by the
 * backend tools (`/Users/me/ws/src/a.ts`, `C:\ws\src\a.ts`), while
 * `/api/project/diff` returns a POSIX workspace-relative path (`src/a.ts`).
 * Splitting on "/" alone silently yields "" for every Windows path, which hides
 * the open-folder affordance on Windows only.
 *
 * The original separator is preserved so the result can be handed to the host
 * shell unchanged, and Windows drive roots keep their separator:
 * `C:\a.ts` -> `C:\` (never `C:`, which is a drive-relative reference).
 * A path with no directory part (`a.ts`, `/a.ts`, `\a.ts`) resolves to "".
 */
export function parentDirectory(filePath: string): string {
  if (!filePath) return "";
  let separatorIndex = -1;
  for (let cursor = filePath.length - 1; cursor >= 0; cursor -= 1) {
    const char = filePath[cursor];
    if (char === "/" || char === "\\") {
      separatorIndex = cursor;
      break;
    }
  }
  if (separatorIndex <= 0) return "";
  const parent = filePath.slice(0, separatorIndex);
  return WINDOWS_DRIVE_ROOT.test(parent)
    ? `${parent}${filePath[separatorIndex]}`
    : parent;
}
