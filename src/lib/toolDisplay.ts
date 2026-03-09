export interface ToolDisplaySource {
  toolLabel?: string | null;
  toolName?: string | null;
  toolId?: string | null;
  toolKey?: string | null;
}

export function resolveToolLabel(source: ToolDisplaySource, fallback = 'tool'): string {
  const candidates = [
    source.toolLabel,
    source.toolName,
    source.toolId,
    source.toolKey,
  ];

  for (const candidate of candidates) {
    const text = String(candidate || '').trim();
    if (text) return text;
  }

  return fallback;
}
