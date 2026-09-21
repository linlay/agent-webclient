import type { TimelineNode } from './timelineState';

export interface GeneratedImage {
  index: number;
  artifactId?: string;
  url: string;
  name: string;
  mimeType?: string;
  sizeBytes?: number;
}
export interface ImageGenerationRuntime {
  active: boolean;
  recovering?: boolean;
  terminal?: 'run.complete' | 'run.error' | 'run.cancel';
}
export type ImageGenerationStatus = 'preparing' | 'generation' | 'edit' | 'inpainting' | 'recovering' | 'success' | 'failed' | 'canceled' | 'missing';

function record(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'string') {
    try { return record(JSON.parse(value)); } catch { return null; }
  }
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

export function isImageGenerationTool(node: TimelineNode): boolean {
  return node.kind === 'tool' && node.toolName?.trim() === 'image_generate';
}

/** Only the image_generate result contract is interpreted; internal paths are never resources. */
export function buildImageGenerationDisplay(node: TimelineNode, runtime: ImageGenerationRuntime) {
  const args = record(node.argsText);
  const result = record(node.result?.text);
  const count = typeof args?.n === 'number' && Number.isInteger(args.n) && args.n >= 1 && args.n <= 4 ? args.n : 1;
  const operation = result?.operation === 'inpainting' || args?.mask ? 'inpainting'
    : result?.operation === 'edit' || (Array.isArray(args?.images) && args.images.length > 0) ? 'edit' : 'generation';
  const images: GeneratedImage[] = [];
  const usedIndexes = new Set<number>();
  for (const [position, value] of (Array.isArray(result?.images) ? result.images.slice(0, 4) : []).entries()) {
    const item = record(value);
    // Keep invalid items as empty slots, never substitute path for url.
    const index = typeof item?.index === 'number' && Number.isInteger(item.index) && item.index >= 0 && item.index < 4 ? item.index : position;
    if (usedIndexes.has(index)) continue;
    usedIndexes.add(index);
    const url = typeof item?.url === 'string' ? item.url.trim() : '';
    images.push({ index, url,
      artifactId: typeof item?.artifactId === 'string' ? item.artifactId.trim() || undefined : undefined,
      name: typeof item?.name === 'string' ? item.name : url.split('/').pop() || `image-${index + 1}`,
      mimeType: typeof item?.mimeType === 'string' ? item.mimeType : undefined,
      sizeBytes: typeof item?.sizeBytes === 'number' ? item.sizeBytes : undefined });
  }
  let status: ImageGenerationStatus;
  if (node.status === 'canceled') status = 'canceled';
  else if (node.status === 'failed' || node.status === 'error' || result?.ok === false) status = 'failed';
  else if (node.result) status = images.some(image => image.url) ? 'success' : 'missing';
  else if (runtime.terminal === 'run.cancel') status = 'canceled';
  else if (runtime.terminal || !runtime.active) status = 'missing';
  else if (runtime.recovering) status = 'recovering';
  else status = args ? operation : 'preparing';
  return { status, count: Math.max(count, ...images.map(image => image.index + 1)), images,
    busy: ['preparing', 'generation', 'edit', 'inpainting'].includes(status) };
}
