function parseHeaderFields(headerLine: string): Record<string, string> {
  const result: Record<string, string> = {};
  const parts = headerLine.split(',');
  for (const part of parts) {
    const [rawKey, ...rawValueParts] = part.split('=');
    if (!rawKey || rawValueParts.length === 0) {
      continue;
    }
    const key = rawKey.trim().toLowerCase();
    const value = rawValueParts.join('=').trim();
    if (!key || !value) {
      continue;
    }
    result[key] = value;
  }
  return result;
}

export interface ViewportBlock {
  type: string;
  key: string;
  payload: unknown;
  payloadRaw: string;
  rawBlock: string;
}

function parseSingleViewportBlock(rawBlock: string): ViewportBlock | null {
  const trimmed = rawBlock.trim();
  if (!trimmed) {
    return null;
  }

  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    return null;
  }

  const fields = parseHeaderFields(lines[0]);
  const type = (fields.type || '').toLowerCase();
  const key = fields.key || '';

  if (!type || !key) {
    return null;
  }

  const payloadRaw = lines.slice(1).join('\n');
  let payload: unknown = null;

  try {
    payload = JSON.parse(payloadRaw);
  } catch (_error) {
    payload = null;
  }

  return {
    type,
    key,
    payload,
    payloadRaw,
    rawBlock: trimmed,
  };
}

export function parseViewportBlocks(text: string): ViewportBlock[] {
  if (typeof text !== 'string' || !text.includes('```viewport')) {
    return [];
  }

  const blocks: ViewportBlock[] = [];
  const regex = /```viewport\s*([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const parsed = parseSingleViewportBlock(match[1] ?? '');
    if (parsed) {
      blocks.push(parsed);
    }
  }

  return blocks;
}

export function findHtmlViewportBlocks(text: string): ViewportBlock[] {
  return parseViewportBlocks(text).filter((item) => item.type === 'html');
}
