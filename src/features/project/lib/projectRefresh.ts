export interface ProjectInvalidation {
  directories: string[];
  selectedChanged: boolean;
}

function parentPath(path: string): string {
  const parts = path.split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
}

export function resolveProjectInvalidation(
  paths: string[],
  loadedDirectories: string[],
  selectedPath: string,
): ProjectInvalidation {
  const loaded = [...loadedDirectories].sort((a, b) => b.length - a.length);
  const directories = new Set<string>();
  let selectedChanged = false;
  paths.forEach((rawPath) => {
    const normalized = String(rawPath || "").trim().replace(/\\/g, "/");
    if (!normalized) return;
    if (selectedPath && (normalized === selectedPath || normalized.endsWith(`/${selectedPath}`))) {
      selectedChanged = true;
    }
    const rawParent = parentPath(normalized);
    const relativeParent = !normalized.startsWith("/") && !/^[A-Za-z]:\//.test(normalized)
      ? rawParent
      : loaded.find((directoryPath) =>
        Boolean(directoryPath) && (rawParent === directoryPath || rawParent.endsWith(`/${directoryPath}`)),
      ) || "";
    directories.add(relativeParent);
  });
  if (directories.size === 0) directories.add("");
  return { directories: Array.from(directories), selectedChanged };
}

export function projectRefreshVisible(visibilityState: DocumentVisibilityState): boolean {
  return visibilityState === "visible";
}
