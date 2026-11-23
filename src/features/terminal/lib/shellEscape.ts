export type TerminalShellDialect = "posix" | "powershell" | "cmd";

export interface EscapeShellPathOptions {
  readonly windowsPosixPath?: boolean;
}

function executableBaseName(shellPath: string): string {
  const normalized = String(shellPath || "").trim().replace(/\\/g, "/");
  const lastSlash = normalized.lastIndexOf("/");
  const base = lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized;
  return base.toLowerCase();
}

export function detectShellDialect(shellExecutable?: string): TerminalShellDialect {
  const base = executableBaseName(shellExecutable || "");
  if (base === "pwsh" || base === "pwsh.exe" || base === "powershell" || base === "powershell.exe") {
    return "powershell";
  }
  if (base === "cmd" || base === "cmd.exe") {
    return "cmd";
  }
  return "posix";
}

function isWindowsExecutable(shellExecutable?: string): boolean {
  const trimmed = String(shellExecutable || "").trim();
  return /^[A-Za-z]:[\\/]|^\\\\|\.exe$/i.test(trimmed);
}

function sanitizeDroppedPath(rawPath: string): string {
  return String(rawPath || "").replace(/[\r\n\0]/g, "").trim();
}

export function escapeShellPath(
  rawPath: string,
  dialect: TerminalShellDialect = "posix",
  options: EscapeShellPathOptions = {},
): string {
  let cleaned = sanitizeDroppedPath(rawPath);
  if (!cleaned) return "";

  if (dialect === "posix" && options.windowsPosixPath) {
    cleaned = cleaned.replace(/\\/g, "/");
  }

  if (dialect === "posix") {
    if (/^[A-Za-z0-9_./:-]+$/.test(cleaned)) {
      return cleaned;
    }
    return `'${cleaned.replace(/'/g, "'\\''")}'`;
  }

  if (dialect === "powershell") {
    if (/^[A-Za-z0-9_./:\\-]+$/.test(cleaned)) {
      return cleaned;
    }
    return `'${cleaned.replace(/'/g, "''")}'`;
  }

  // CMD escaping
  if (/^[A-Za-z0-9_./:\\-]+$/.test(cleaned)) {
    return cleaned;
  }
  return `"${cleaned.replace(/"/g, '\\"')}"`;
}

export function formatDroppedPathsForShell(
  paths: readonly string[],
  shellExecutable?: string,
): string {
  const dialect = detectShellDialect(shellExecutable);
  const windowsPosixPath = dialect === "posix" && isWindowsExecutable(shellExecutable);
  return paths
    .map((targetPath) => escapeShellPath(targetPath, dialect, { windowsPosixPath }))
    .filter(Boolean)
    .join(" ");
}
