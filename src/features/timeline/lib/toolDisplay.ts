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
