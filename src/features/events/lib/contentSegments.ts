import type { ContentSegment } from '@/shared/contracts/contentSegments';

export type { ContentSegment } from '@/shared/contracts/contentSegments';

const SPECIAL_FENCE_HEADERS = ['```view', '```tts-voice'] as const;

function pushTextSegment(segments: ContentSegment[], text: string): void {
  const normalized = String(text ?? '').trim();
  if (!normalized) return;
  segments.push({ kind: 'text', text: normalized });
}

function matchesPendingSpecialFenceHeader(rawHeader: string): boolean {
  const lower = String(rawHeader || '').trimEnd().toLowerCase();
  if (!lower.startsWith('```') || lower === '```') return false;
  return SPECIAL_FENCE_HEADERS.some((header) => (
    header.startsWith(lower)
    || lower === header
    || lower.startsWith(`${header} `)
    || lower.startsWith(`${header}\t`)
  ));
}

function findPendingSpecialFenceTailStart(raw: string): number {
  let cursor = 0;
  while (cursor < raw.length) {
    const start = raw.indexOf('```', cursor);
    if (start === -1) return -1;

    if (start > 0 && raw[start - 1] !== '\n') {
      cursor = start + 3;
      continue;
    }

    const lineEnd = raw.indexOf('\n', start);
    if (lineEnd !== -1) {
      cursor = start + 3;
      continue;
    }

    return matchesPendingSpecialFenceHeader(raw.slice(start)) ? start : -1;
  }

  return -1;
}

export function stripPendingSpecialFenceTail(text: string): string {
  const raw = String(text ?? '');
  if (!raw) return '';

  const pendingStart = findPendingSpecialFenceTailStart(raw);
  if (pendingStart === -1) return raw;

  return raw.slice(0, pendingStart).replace(/[ \t]*\n?$/, '');
}

export function stripSpecialBlocksFromText(text: string): string {
  const raw = String(text ?? '');
  if (!raw.trim()) return '';
  const merged = parseContentSegments('strip', raw)
    .filter((segment) => segment.kind === 'text')
    .map((segment) => segment.text)
    .join('\n\n');
  return merged.replace(/\n{3,}/g, '\n\n').trim();
}

const VIEW_ID = /^[a-z0-9][a-z0-9._-]*$/;
export const MAX_VIEW_DATA_BYTES = 256 * 1024;

interface FenceOpen { char: string; width: number; info: string }

function fenceOpen(line: string): FenceOpen | null {
  const value = line.replace(/\r$/, '');
  const char = value[0];
  if (char !== '`' && char !== '~') return null;
  let width = 0;
  while (width < value.length && value[width] === char) width += 1;
  return width >= 3 ? { char, width, info: value.slice(width) } : null;
}

function fenceCloses(line: string, open: FenceOpen): boolean {
  const value = line.replace(/[ \t\r]+$/, '');
  return value.length >= open.width && [...value].every((char) => char === open.char);
}

/** Returns the attribute text after an exact ```<word> header, or null. */
function specialInfo(open: FenceOpen, word: string): string | null {
  if (open.char !== '`' || open.width !== 3) return null;
  const head = open.info.slice(0, word.length);
  const rest = open.info.slice(word.length);
  if (head.toLowerCase() !== word || (rest !== '' && rest[0] !== ' ' && rest[0] !== '\t')) return null;
  return rest;
}

function parseViewAttributes(attrs: string): { key: string; query?: string } | undefined {
  const values = new Map<string, string>();
  for (const field of attrs.split(/\s+/).filter(Boolean)) {
    const separator = field.indexOf('=');
    const name = field.slice(0, separator);
    if (separator < 0 || values.has(name) || (name !== 'key' && name !== 'query')) return undefined;
    values.set(name, field.slice(separator + 1));
  }
  const key = values.get('key') || '';
  const [connectorId, viewKey, ...extra] = key.split('/');
  if (extra.length !== 0 || !VIEW_ID.test(connectorId || '') || !VIEW_ID.test(viewKey || '')) return undefined;
  const query = values.get('query');
  if (query !== undefined && !VIEW_ID.test(query)) return undefined;
  return query === undefined ? { key } : { key, query };
}

function viewDataError(body: string, params: boolean): 'view_data_invalid' | undefined {
  if (new TextEncoder().encode(body).length > MAX_VIEW_DATA_BYTES || (body[0] !== '{' && (params || body[0] !== '['))) return 'view_data_invalid';
  try {
    JSON.parse(body);
    return undefined;
  } catch {
    return 'view_data_invalid';
  }
}

/**
 * Splits assistant Markdown into text, VIEW and tts-voice segments.
 *
 * VIEW grammar mirrors agent-platform internal/view.ParseMarkdownBlocks and is
 * checked against the shared golden cases: fences start at column 0, a VIEW
 * fence is exactly ```view followed by key=<connectorId>/<viewKey> and an
 * optional query=<name>, its body is one JSON object or array (the query's
 * params object with query), and fences nested in other code blocks stay
 * code. `index` counts closed VIEW fences, so it matches the platform binding.
 */
export function parseContentSegments(contentId: string, text: string): ContentSegment[] {
  const raw = stripPendingSpecialFenceTail(String(text ?? ''));
  if (!raw.trim()) return [];

  const lowerRaw = raw.toLowerCase();
  if (!lowerRaw.includes('```view') && !lowerRaw.includes('```tts-voice')) {
    return [{ kind: 'text', text: raw.trim() }];
  }

  const lines = raw.split('\n');
  const offsets: number[] = [];
  let position = 0;
  for (const line of lines) {
    offsets.push(position);
    position += line.length + 1;
  }
  const lineEnd = (index: number) => Math.min(raw.length, offsets[index] + lines[index].length + 1);

  const segments: ContentSegment[] = [];
  let textStart = 0;
  let viewIndex = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const open = fenceOpen(lines[i]);
    if (!open) continue;
    let end = -1;
    for (let j = i + 1; j < lines.length; j += 1) {
      if (fenceCloses(lines[j], open)) { end = j; break; }
    }
    const start = offsets[i];
    const bodyStart = lineEnd(i);
    const viewAttrs = specialInfo(open, 'view');
    const isVoice = viewAttrs === null && specialInfo(open, 'tts-voice') !== null;
    if (viewAttrs === null && !isVoice) {
      if (end < 0) break;
      i = end;
      continue;
    }
    pushTextSegment(segments, raw.slice(textStart, start));
    const closed = end >= 0;
    const bodyEnd = closed ? offsets[end] : raw.length;
    const blockEnd = closed ? lineEnd(end) : raw.length;
    if (isVoice) {
      segments.push({
        kind: 'ttsVoice',
        signature: `${contentId || 'content'}::tts-voice::${start}`,
        text: raw.slice(bodyStart, bodyEnd),
        closed,
        startOffset: start,
      });
    } else {
      const attributes = parseViewAttributes(viewAttrs as string);
      const body = raw.slice(bodyStart, bodyEnd).trim();
      segments.push({
        kind: 'view',
        index: viewIndex,
        signature: `${contentId || 'content'}::view::${viewIndex}`,
        key: attributes?.key,
        ...(attributes?.query ? { query: attributes.query } : {}),
        payloadRaw: body,
        text: raw.slice(start, blockEnd),
        closed,
        error: attributes ? viewDataError(body, Boolean(attributes.query)) : 'invalid_view',
      });
      if (closed) viewIndex += 1;
    }
    textStart = blockEnd;
    if (!closed) break;
    i = end;
  }
  pushTextSegment(segments, raw.slice(textStart));

  if (segments.length === 0) {
    segments.push({ kind: 'text', text: raw.trim() });
  }
  return segments;
}
