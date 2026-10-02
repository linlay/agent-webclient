export interface ToolDisplaySource {
  toolLabel?: string | null;
  toolName?: string | null;
  toolId?: string | null;
  viewportKey?: string | null;
}

export function resolveToolLabel(source: ToolDisplaySource, fallback = 'tool'): string {
  const candidates = [
    source.toolLabel,
    source.toolName,
    source.viewportKey,
    source.toolId,
  ];

  for (const candidate of candidates) {
    const text = String(candidate || '').trim();
    if (text) return text;
  }

  return fallback;
}

export function isBashTool(source: ToolDisplaySource): boolean {
  return ['bash', 'bash_sandbox', '_sandbox_bash_'].includes(source.toolName?.trim().toLowerCase() || '');
}

// Read only a complete top-level string, even while later arguments are streaming.
export function readBashDescription(argsText = ''): string {
  if (!argsText.trimStart().startsWith('{')) return '';
  let depth = 0;
  for (let index = 0; index < argsText.length; index += 1) {
    const char = argsText[index];
    if (char === '"') {
      const token = argsText.slice(index).match(/^"(?:[^"\\\u0000-\u001f]|\\(?:["\\/bfnrt]|u[\da-fA-F]{4}))*"/);
      if (!token) return '';
      const end = index + token[0].length;
      if (depth === 1 && JSON.parse(token[0]) === 'description') {
        const value = argsText.slice(end).match(/^\s*:\s*("(?:[^"\\\u0000-\u001f]|\\(?:["\\/bfnrt]|u[\da-fA-F]{4}))*")/);
        if (value) return (JSON.parse(value[1]) as string).trim();
      }
      index = end - 1;
    } else if (char === '{' || char === '[') {
      depth += 1;
    } else if (char === '}' || char === ']') {
      depth -= 1;
    }
  }
  return '';
}
