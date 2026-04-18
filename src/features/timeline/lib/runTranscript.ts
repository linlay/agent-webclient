import type { TimelineNode } from '@/app/state/types';
import { resolveToolLabel } from '@/features/timeline/lib/toolDisplay';

function pushSection(lines: string[], title: string, body: string): void {
  const text = String(body || '').trim();
  if (!text) return;
  if (lines.length > 0) {
    lines.push('');
  }
  lines.push(title);
  lines.push(text);
}

export function serializeRunTranscript(
  queryNode: TimelineNode | null | undefined,
  runNodes: TimelineNode[],
): string {
  const lines: string[] = [];
  const thinkingTexts = runNodes
    .filter((node) => node.kind === 'thinking')
    .map((node) => String(node.text || '').trim())
    .filter(Boolean);
  const toolNodes = runNodes.filter((node) => node.kind === 'tool');
  const answerTexts = runNodes
    .filter((node) => node.kind === 'content')
    .map((node) => String(node.text || '').trim())
    .filter(Boolean);

  pushSection(lines, 'Query', String(queryNode?.text || ''));
  pushSection(lines, 'Thinking', thinkingTexts.join('\n\n'));

  if (toolNodes.length > 0) {
    const toolLines = toolNodes.flatMap((node, index) => {
      const block: string[] = [`${index + 1}. ${resolveToolLabel(node)}`];
      if (node.description) block.push(`description: ${node.description}`);
      if (node.argsText) block.push(`arguments:\n${node.argsText}`);
      if (node.result?.text) block.push(`result:\n${node.result.text}`);
      return block;
    });
    pushSection(lines, 'Tools', toolLines.join('\n\n'));
  }

  pushSection(lines, 'Answer', answerTexts.join('\n\n'));
  return lines.join('\n');
}
