import { safeJsonParse } from './actionRuntime.js';
import { parseViewportBlocks } from './viewportParser.js';

export function stripViewportBlocksFromText(text) {
  const raw = String(text ?? '');
  if (!raw.includes('```viewport')) {
    return raw.trim();
  }

  return raw
    .replace(/```viewport[\s\S]*?```/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function viewportSignature(contentId, block) {
  return `${contentId || 'content'}::${block?.key || ''}::${block?.payloadRaw || ''}`;
}

export function parseContentSegments(contentId, text) {
  const raw = String(text ?? '');
  if (!raw.trim()) {
    return [];
  }

  if (!raw.includes('```viewport')) {
    return [{ kind: 'text', text: raw.trim() }];
  }

  const segments = [];
  const regex = /```viewport[\s\S]*?```/gi;
  let cursor = 0;
  let match;

  while ((match = regex.exec(raw)) !== null) {
    const before = raw.slice(cursor, match.index);
    if (before.trim()) {
      segments.push({ kind: 'text', text: before.trim() });
    }

    const parsed = parseViewportBlocks(match[0]).find((block) => block.type === 'html');
    if (parsed) {
      segments.push({
        kind: 'viewport',
        signature: viewportSignature(contentId, parsed),
        key: parsed.key,
        payloadRaw: parsed.payloadRaw || '{}',
        payload: parsed.payload ?? safeJsonParse(parsed.payloadRaw, {})
      });
    } else if (match[0].trim()) {
      segments.push({ kind: 'text', text: match[0].trim() });
    }

    cursor = regex.lastIndex;
  }

  const tail = raw.slice(cursor);
  if (tail.trim()) {
    segments.push({ kind: 'text', text: tail.trim() });
  }

  if (segments.length === 0) {
    segments.push({ kind: 'text', text: raw.trim() });
  }

  return segments;
}
