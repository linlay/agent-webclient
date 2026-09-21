import { buildImageGenerationDisplay, isImageGenerationTool } from './imageGenerationDisplay';
import { buildRunRenderEntries } from './timelineDisplay';
import type { TimelineNode } from './timelineState';
const call = (id: string, n = 2, extra: Partial<TimelineNode> = {}): TimelineNode => ({ id, toolId: id, kind: 'tool', toolName: 'image_generate', runId: 'r1', ts: 1, argsText: JSON.stringify({ prompt: 'draw', n }), ...extra });
const result = (images: unknown[]) => ({ text: JSON.stringify({ ok: true, images }), isCode: true });

describe('image generation display', () => {
  it('keeps six independent slots across three concurrent calls, regardless of completion order', () => {
    const nodes = [call('a'), call('b', 2, { result: result([{ index: 1, url: 'b-2.png' }, { index: 0, url: 'b-1.png' }]) }), call('c')];
    const views = nodes.map(node => buildImageGenerationDisplay(node, { active: true }));
    expect(views.map(view => view.count)).toEqual([2, 2, 2]);
    expect(views.map(view => view.status)).toEqual(['generation', 'success', 'generation']);
    expect(views[1].images.find(image => image.index === 0)?.url).toBe('b-1.png');
    const entries = buildRunRenderEntries(nodes);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: 'tool-group', nodes });
    expect(buildRunRenderEntries([nodes[0]])[0].key).toBe(entries[0].key);
  });
  it('does not group across text, tools, runs, or tasks', () => {
    const text: TimelineNode = { id: 'text', kind: 'content', ts: 2 };
    expect(buildRunRenderEntries([call('a'), text, call('b')])).toHaveLength(3);
    expect(buildRunRenderEntries([call('a'), call('bash', 1, { toolName: 'bash' }), call('b')])).toHaveLength(3);
    expect(buildRunRenderEntries([call('a'), call('b', 1, { runId: 'r2' })])).toHaveLength(2);
    expect(buildRunRenderEntries([call('a'), call('b', 1, { taskId: 'task' })])).toHaveLength(2);
  });
  it('uses exact tool identity and waits for complete args', () => {
    expect(isImageGenerationTool(call('a'))).toBe(true);
    expect(isImageGenerationTool(call('a', 1, { toolName: 'vision_recognize', toolLabel: '图像生成' }))).toBe(false);
    expect(buildImageGenerationDisplay(call('a', 1, { argsText: '{"n":4' }), { active: true })).toMatchObject({ count: 1, status: 'preparing' });
    for (const n of [0, 5, -1, 1.5]) expect(buildImageGenerationDisplay(call('a', n), { active: true }).count).toBe(1);
  });
  it('supports four images, editing, masks and dimensions', () => {
    const node = call('a', 4, { argsText: JSON.stringify({ n: 4, images: [{}], size: '1536x1024' }) });
    expect(buildImageGenerationDisplay(node, { active: true })).toMatchObject({ count: 4, status: 'edit', ratio: 1.5 });
    expect(buildImageGenerationDisplay({ ...node, argsText: '{"images":[{}],"mask":{}}' }, { active: true }).status).toBe('inpainting');
  });
  it('restores history without animation and never uses internal paths as URLs', () => {
    const node = call('a', 1, { result: result([{ path: '/secret/image.png' }]) });
    expect(buildImageGenerationDisplay(node, { active: false })).toMatchObject({ status: 'missing', busy: false, images: [{ url: '' }] });
    expect(buildImageGenerationDisplay(call('b', 1, { result: result([{ url: 'image.png' }]) }), { active: false }).status).toBe('success');
  });
  it('stops on failure, cancellation and missing history; disconnect is not failure', () => {
    const node = call('a');
    expect(buildImageGenerationDisplay(node, { active: true, recovering: true }).status).toBe('recovering');
    expect(buildImageGenerationDisplay(node, { active: true, terminal: 'run.cancel' }).status).toBe('canceled');
    expect(buildImageGenerationDisplay(node, { active: true, terminal: 'run.complete' }).status).toBe('missing');
    expect(buildImageGenerationDisplay(node, { active: false }).busy).toBe(false);
    expect(buildImageGenerationDisplay({ ...node, result: { text: '{"ok":false}', isCode: true } }, { active: true }).status).toBe('failed');
  });
});
