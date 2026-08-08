export interface ProjectTabCloseResult {
  paths: string[];
  activePath: string;
}

export function openProjectTab(paths: string[], path: string): string[] {
  if (!path || paths.includes(path)) return paths;
  return [...paths, path];
}

export function closeProjectTab(
  paths: string[],
  activePath: string,
  closingPath: string,
): ProjectTabCloseResult {
  const closingIndex = paths.indexOf(closingPath);
  if (closingIndex < 0) return { paths, activePath };

  const nextPaths = paths.filter((path) => path !== closingPath);
  if (activePath !== closingPath) {
    return { paths: nextPaths, activePath };
  }

  return {
    paths: nextPaths,
    activePath: nextPaths[closingIndex] || nextPaths[closingIndex - 1] || "",
  };
}
