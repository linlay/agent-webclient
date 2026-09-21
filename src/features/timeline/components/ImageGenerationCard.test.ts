/** @jest-environment jsdom */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ImageGenerationCard } from './ImageGenerationCard';
import { TimelineInteractionProvider } from './TimelineInteractionContext';
import type { TimelineNode } from '../lib/timelineState';

jest.mock('@/app/state/provider', () => ({ useOptionalAppContext: () => null }));
jest.mock('./ToolPill', () => ({ ToolPill: () => null }));
const mockOpen = jest.fn();
const mockResource = jest.fn((url: string, chatId: string, options: unknown) => ({ url, loading: false, error: null }));
jest.mock('@/features/surfaces/openTarget', () => ({ useOpenTarget: () => mockOpen }));
jest.mock('@/shared/ui/useAuthenticatedResourceUrl', () => ({ useAuthenticatedResourceUrl: (url: string, chatId: string, options: unknown) => mockResource(url, chatId, options) }));
jest.mock('@/shared/ui/useAppMessage', () => ({ useAppMessage: () => ({ error: jest.fn() }) }));
jest.mock('@/shared/data/desktop/desktopContextMenu', () => ({ useDesktopContextMenuTarget: () => null }));

let container: HTMLDivElement;
let root: Root;
const nodes: TimelineNode[] = ['a', 'b', 'c'].map(id => ({ id, toolId: id, kind: 'tool', toolName: 'image_generate', runId: 'run', ts: 1, argsText: '{"n":2}' }));
function render(calls: TimelineNode[], active = true, chatId = 'owner') {
  act(() => root.render(React.createElement(TimelineInteractionProvider, { value: { conversationActive: active, surfaceContext: { chatId } } }, React.createElement(ImageGenerationCard, { nodes: calls }))));
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  mockOpen.mockClear(); mockResource.mockClear();
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

it('updates only the completed concurrent call and retains DOM identity and ordering', () => {
  render(nodes);
  const tiles = Array.from(container.querySelectorAll('[data-image-index]'));
  expect(tiles).toHaveLength(6);
  const done = { ...nodes[1], result: { text: JSON.stringify({ ok: true, images: [{ index: 0, url: 'b0.png' }, { index: 1, url: 'b1.png' }] }), isCode: true } };
  render([nodes[0], done, nodes[2]]);
  expect(Array.from(container.querySelectorAll('[data-image-index]'))).toEqual(tiles);
  expect(container.querySelectorAll('[aria-busy="true"]')).toHaveLength(4);
  expect(container.querySelectorAll('img')).toHaveLength(2);
  expect(mockResource).toHaveBeenCalledWith('b0.png', 'owner', expect.anything());
  const img = container.querySelector('img')!;
  act(() => img.dispatchEvent(new Event('load')));
  act(() => (img.parentElement as HTMLButtonElement).click());
  expect(mockOpen).toHaveBeenCalledWith(expect.objectContaining({ kind: 'resource', chatId: 'owner', file: 'b0.png' }));
  render([nodes[0], done, nodes[2]], false);
  expect(container.querySelectorAll('[aria-busy="true"]')).toHaveLength(0);
  expect(container.querySelectorAll('img')).toHaveLength(2);
});

it('retries only image loading and remounts media when owner chat changes', () => {
  const done = { ...nodes[0], argsText: '{"n":1}', result: { text: '{"ok":true,"images":[{"url":"a.png"}]}', isCode: true } };
  render([done]);
  const img = container.querySelector('img')!;
  act(() => img.dispatchEvent(new Event('error')));
  const retry = Array.from(container.querySelectorAll('button')).find(button => !button.disabled)!;
  expect(retry).toBeDefined();
  act(() => retry.click());
  expect(mockResource).toHaveBeenLastCalledWith('a.png', 'owner', expect.objectContaining({ refreshKey: 1 }));
  expect(mockOpen).not.toHaveBeenCalled();
  render([done], true, 'other');
  expect(mockResource).toHaveBeenLastCalledWith('a.png', 'other', expect.objectContaining({ refreshKey: 0 }));
});

it('shows arrows only toward hidden images and updates them on scrolling and resizing', () => {
  render(nodes);
  const grid = container.querySelector<HTMLDivElement>('div[role="region"]')!;
  let left = 0;
  let width = 800;
  Object.defineProperties(grid, {
    clientWidth: { get: () => width },
    scrollWidth: { get: () => 1200 },
    scrollLeft: { get: () => left },
  });
  grid.scrollBy = jest.fn();
  const arrows = () => Array.from(container.querySelectorAll<HTMLButtonElement>('button[aria-controls]'));
  act(() => window.dispatchEvent(new Event('resize')));
  expect(arrows()).toHaveLength(1);
  const nextLabel = arrows()[0].getAttribute('aria-label');
  act(() => arrows()[0].click());
  expect(grid.scrollBy).toHaveBeenCalledWith(expect.objectContaining({ left: 814 }));
  left = 200;
  act(() => grid.dispatchEvent(new Event('scroll')));
  expect(arrows()).toHaveLength(2);
  left = 400;
  act(() => grid.dispatchEvent(new Event('scroll')));
  expect(arrows()).toHaveLength(1);
  expect(arrows()[0].getAttribute('aria-label')).not.toBe(nextLabel);
  left = 0; width = 1200;
  act(() => window.dispatchEvent(new Event('resize')));
  expect(arrows()).toHaveLength(0);
});
