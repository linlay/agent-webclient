import {
  WORKSPACE_FILE_ALIAS,
  hasFileAlias,
  parseLocalAbsolutePath,
  splitFileLocation,
} from "@/shared/utils/fileAddress";

export interface WorkspaceFileLink {
  href: string;
  /** Workspace-relative for "@workspace/", otherwise the host absolute path. */
  filePath: string;
  line?: number;
}

/**
 * Parses a Workspace file target: "@workspace/<path>[:line]" or a host
 * absolute path or file URL. The path is literal and never decoded. A bare
 * relative path names no file; it is not guessed to be a project file.
 */
export function parseWorkspaceFileHref(
  href: string | undefined,
): WorkspaceFileLink | null {
  const rawHref = String(href || "").trim();
  if (!rawHref) return null;

  if (hasFileAlias(rawHref, WORKSPACE_FILE_ALIAS)) {
    const location = splitFileLocation(rawHref.slice(WORKSPACE_FILE_ALIAS.length));
    const relativePath = location.filePath.replace(/\\/g, "/");
    const segments = relativePath.split("/");
    if (
      !relativePath ||
      relativePath.length > 2_048 ||
      /[\u0000-\u001f\u007f]/u.test(relativePath) ||
      segments.some((segment) => !segment || segment === "." || segment === "..")
    ) {
      return null;
    }
    return {
      href: rawHref,
      filePath: relativePath,
      ...(location.line ? { line: location.line } : {}),
    };
  }

  const localPath = parseLocalAbsolutePath(rawHref);
  if (localPath?.kind !== "local") return null;
  const location = splitFileLocation(localPath.path);
  return {
    href: rawHref,
    filePath: location.filePath,
    ...(location.line ? { line: location.line } : {}),
  };
}
