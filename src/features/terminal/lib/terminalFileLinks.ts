export interface ParsedTerminalFileLink {
  readonly path: string;
  readonly line: number;
  readonly col?: number;
  readonly startIndex: number;
  readonly endIndex: number;
  readonly rawText: string;
}

const FILE_PATH_PATTERN =
  "(?:[A-Za-z]:[\\\\/][^\\s:()\"'<>]+|\\.{1,2}[\\\\/][^\\s:()\"'<>]+|\\/[A-Za-z0-9_.\\-\\/\\\\]+|[A-Za-z0-9_.\\-]+(?:[\\\\/][A-Za-z0-9_.\\-]+)*\\.[A-Za-z0-9]+)";

const PYTHON_TRACEBACK_RE = /"([^"\r\n]+)", line (\d+)/gu;
const PAREN_LOCATION_RE = new RegExp(`(${FILE_PATH_PATTERN})\\((\\d+)(?:,(\\d+))?\\)`, "gu");
const COLON_LOCATION_RE = new RegExp(`(${FILE_PATH_PATTERN}):(\\d+)(?::(\\d+))?`, "gu");

function surroundingTokenHasScheme(line: string, start: number, end: number): boolean {
  let tokenStart = start;
  while (tokenStart > 0 && !/\s/.test(line[tokenStart - 1])) {
    tokenStart -= 1;
  }
  let tokenEnd = end;
  while (tokenEnd < line.length && !/\s/.test(line[tokenEnd])) {
    tokenEnd += 1;
  }
  const token = line.slice(tokenStart, tokenEnd);
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(token) || token.includes("://");
}

function overlapsExisting(
  links: readonly ParsedTerminalFileLink[],
  startIndex: number,
  endIndex: number,
): boolean {
  return links.some((item) => startIndex < item.endIndex && endIndex > item.startIndex);
}

function collectLocationMatches(
  lineText: string,
  regex: RegExp,
  results: ParsedTerminalFileLink[],
): void {
  for (const match of lineText.matchAll(regex)) {
    const rawText = match[0];
    const targetPath = match[1]?.trim() || "";
    const lineNum = Number.parseInt(match[2] || "", 10);
    const colNum = match[3] ? Number.parseInt(match[3], 10) : undefined;
    const startIndex = match.index ?? -1;
    if (!targetPath || !Number.isFinite(lineNum) || lineNum < 1 || startIndex < 0) {
      continue;
    }
    const endIndex = startIndex + rawText.length;
    if (
      surroundingTokenHasScheme(lineText, startIndex, endIndex) ||
      overlapsExisting(results, startIndex, endIndex)
    ) {
      continue;
    }
    results.push({
      path: targetPath,
      line: lineNum,
      ...(colNum && Number.isFinite(colNum) && colNum >= 1 ? { col: colNum } : {}),
      startIndex,
      endIndex,
      rawText,
    });
  }
}

export function parseTerminalFileLinks(lineText: string): ParsedTerminalFileLink[] {
  if (!lineText) return [];
  const results: ParsedTerminalFileLink[] = [];

  for (const match of lineText.matchAll(PYTHON_TRACEBACK_RE)) {
    const rawText = match[0];
    const targetPath = match[1]?.trim() || "";
    const lineNum = Number.parseInt(match[2] || "", 10);
    const startIndex = match.index ?? -1;
    if (!targetPath || !Number.isFinite(lineNum) || lineNum < 1 || startIndex < 0) {
      continue;
    }
    const endIndex = startIndex + rawText.length;
    results.push({
      path: targetPath,
      line: lineNum,
      startIndex,
      endIndex,
      rawText,
    });
  }

  collectLocationMatches(lineText, PAREN_LOCATION_RE, results);
  collectLocationMatches(lineText, COLON_LOCATION_RE, results);

  return results.sort((a, b) => a.startIndex - b.startIndex);
}

function normalizeSlashes(value: string): string {
  return String(value || "").trim().replace(/\\/g, "/");
}

function stripTrailingSlash(value: string): string {
  if (value === "/") return value;
  return value.replace(/\/+$/u, "");
}

function isWindowsDrivePath(value: string): boolean {
  return /^[A-Za-z]:\//.test(value);
}

function isAbsolutePathLike(value: string): boolean {
  return value.startsWith("/") || isWindowsDrivePath(value) || value.startsWith("//");
}

function resolvePosixJoin(base: string, rel: string): string {
  const driveMatch = /^([A-Za-z]:)(\/.*)$/.exec(base);
  const drivePrefix = driveMatch ? driveMatch[1] : "";
  const baseBody = driveMatch ? driveMatch[2] : base;
  const parts = baseBody.split("/").filter(Boolean);
  for (const seg of rel.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") {
      if (parts.length > 0) parts.pop();
    } else {
      parts.push(seg);
    }
  }
  return `${drivePrefix}/${parts.join("/")}`;
}

function stripWorkspacePrefix(targetNorm: string, wsNorm: string): string | null {
  if (!wsNorm) return null;
  const windowsMode = isWindowsDrivePath(targetNorm) || isWindowsDrivePath(wsNorm);
  const targetCmp = windowsMode ? targetNorm.toLowerCase() : targetNorm;
  const wsCmp = windowsMode ? wsNorm.toLowerCase() : wsNorm;
  if (targetCmp === wsCmp) return "";
  const prefix = wsCmp === "/" ? "/" : `${wsCmp}/`;
  if (targetCmp.startsWith(prefix)) {
    return targetNorm.slice(prefix.length);
  }
  return null;
}

export function resolveTerminalLinkPath(
  rawPath: string,
  currentCwd?: string,
  workspaceRoot?: string,
): string {
  const rawNorm = normalizeSlashes(rawPath);
  if (!rawNorm) return "";
  const wsNorm = stripTrailingSlash(normalizeSlashes(workspaceRoot || ""));
  const cwdNorm = stripTrailingSlash(normalizeSlashes(currentCwd || ""));

  if (isAbsolutePathLike(rawNorm)) {
    const insideWorkspace = stripWorkspacePrefix(rawNorm, wsNorm);
    return insideWorkspace !== null && insideWorkspace !== "" ? insideWorkspace : rawNorm;
  }

  if (cwdNorm && wsNorm) {
    const cwdInsideWs = stripWorkspacePrefix(cwdNorm, wsNorm);
    if (cwdInsideWs !== null) {
      const joined = resolvePosixJoin(cwdNorm, rawNorm);
      const relativeToWs = stripWorkspacePrefix(joined, wsNorm);
      if (relativeToWs !== null && relativeToWs !== "") {
        return relativeToWs;
      }
    }
  }

  return rawNorm.replace(/^\.\//, "");
}
