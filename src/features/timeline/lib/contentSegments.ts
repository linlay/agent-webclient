import { safeJsonParse } from '@/features/tools/lib/actionRuntime';
import { parseViewportBlocks } from '@/features/tools/lib/viewportParser';

const SPECIAL_FENCE_HEADERS = ['```viewport', '```tts-voice'] as const;

export interface ContentSegment {
  kind: 'text' | 'viewport' | 'ttsVoice';
  text?: string;
  signature?: string;
  key?: string;
  payloadRaw?: string;
  payload?: unknown;
  closed?: boolean;
  startOffset?: number;
}

function pushTextSegment(segments: ContentSegment[], text: string): void {
  const normalized = String(text ?? '').trim();
  if (!normalized) return;
  segments.push({ kind: 'text', text: normalized });
}

function matchesFenceHeader(rawHeader: string, token: string): boolean {
  const lower = String(rawHeader || '').trim().toLowerCase();
  if (lower === `\`\`\`${token}`) return true;
  return lower.startsWith(`\`\`\`${token} `) || lower.startsWith(`\`\`\`${token}\t`);
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

function findNextSpecialFence(raw: string, fromIndex: number): { kind: 'viewport' | 'ttsVoice'; start: number; contentStart: number } | null {
  let cursor = Math.max(0, fromIndex || 0);
  while (cursor < raw.length) {
    const start = raw.indexOf('```', cursor);
    if (start === -1) return null;

    const lineEnd = raw.indexOf('\n', start);
    const headerEnd = lineEnd === -1 ? raw.length : lineEnd + 1;
    const headerLine = raw.slice(start, lineEnd === -1 ? raw.length : lineEnd);

    if (matchesFenceHeader(headerLine, 'viewport')) {
      return { kind: 'viewport', start, contentStart: headerEnd };
    }
    if (matchesFenceHeader(headerLine, 'tts-voice')) {
      return { kind: 'ttsVoice', start, contentStart: headerEnd };
    }

    cursor = start + 3;
  }

  return null;
}

function findClosingFence(raw: string, contentStart: number): { start: number; end: number } | null {
  const closingRegex = /(^|\n)```[ \t]*(?=\n|$)/g;
  closingRegex.lastIndex = Math.max(0, contentStart || 0);
  const match = closingRegex.exec(raw);
  if (!match) return null;

  const start = match.index + (match[1] ? match[1].length : 0);
  const lineEnd = raw.indexOf('\n', start);
  const end = lineEnd === -1 ? raw.length : lineEnd + 1;
  return { start, end };
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

export function stripViewportBlocksFromText(text: string): string {
  return stripSpecialBlocksFromText(text);
}

export function viewportSignature(contentId: string, block: { key?: string; payloadRaw?: string }): string {
  return `${contentId || 'content'}::${block?.key || ''}::${block?.payloadRaw || ''}`;
}

export function parseContentSegments(contentId: string, text: string): ContentSegment[] {
  const raw = stripPendingSpecialFenceTail(String(text ?? ''));
  if (!raw.trim()) return [];

  const lowerRaw = raw.toLowerCase();
  if (!lowerRaw.includes('```viewport') && !lowerRaw.includes('```tts-voice')) {
    return [{ kind: 'text', text: raw.trim() }];
  }

  const segments: ContentSegment[] = [];
  let cursor = 0;

  while (cursor < raw.length) {
    const fence = findNextSpecialFence(raw, cursor);
    if (!fence) {
      pushTextSegment(segments, raw.slice(cursor));
      break;
    }

    pushTextSegment(segments, raw.slice(cursor, fence.start));
    const closingFence = findClosingFence(raw, fence.contentStart);

    if (fence.kind === 'viewport') {
      if (!closingFence) {
        pushTextSegment(segments, raw.slice(fence.start));
        break;
      }

      const rawBlock = raw.slice(fence.start, closingFence.end);
      const parsed = parseViewportBlocks(rawBlock).find((block) => block.type === 'html');
      if (parsed) {
        segments.push({
          kind: 'viewport',
          signature: viewportSignature(contentId, parsed),
          key: parsed.key,
          payloadRaw: parsed.payloadRaw || '{}',
          payload: parsed.payload ?? safeJsonParse(parsed.payloadRaw, {}),
        });
      } else {
        pushTextSegment(segments, rawBlock);
      }

      cursor = closingFence.end;
      continue;
    }

    const textEnd = closingFence ? closingFence.start : raw.length;
    const blockText = raw.slice(fence.contentStart, textEnd);
    segments.push({
      kind: 'ttsVoice',
      signature: `${contentId || 'content'}::tts-voice::${fence.start}`,
      text: blockText,
      closed: Boolean(closingFence),
      startOffset: fence.start,
    });

    cursor = closingFence ? closingFence.end : raw.length;
  }

  if (segments.length === 0) {
    segments.push({ kind: 'text', text: raw.trim() });
  }
  return segments;
}
