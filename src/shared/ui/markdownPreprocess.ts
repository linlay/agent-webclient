function isFenceLine(line: string): boolean {
  return /^\s*(```+|~~~+)/.test(line);
}

function hasMarkdownTablePipe(line: string): boolean {
  return /(^|[^\\])\|/.test(line);
}

function isMarkdownTableSeparator(line: string): boolean {
  if (!hasMarkdownTablePipe(line)) return false;
  const cells = line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());

  return (
    cells.length > 0 &&
    cells.every((cell) => /^:?-{3,}:?$/.test(cell))
  );
}

function isMarkdownTableRow(line: string): boolean {
  return hasMarkdownTablePipe(line) && !isMarkdownTableSeparator(line);
}

export function removeEmptyMarkdownTables(content: string): string {
  const lines = content.split(/\r?\n/);
  const output: string[] = [];
  let inFence = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (isFenceLine(line)) {
      inFence = !inFence;
      output.push(line);
      continue;
    }

    const nextLine = lines[index + 1] || "";
    const tableHasBody = isMarkdownTableRow(lines[index + 2] || "");
    if (
      !inFence &&
      isMarkdownTableRow(line) &&
      isMarkdownTableSeparator(nextLine) &&
      !tableHasBody
    ) {
      index += 1;
      continue;
    }

    output.push(line);
  }

  return output.join("\n");
}
