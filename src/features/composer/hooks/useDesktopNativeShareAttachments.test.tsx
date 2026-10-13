/** @jest-environment jsdom */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { TextEncoder, TextDecoder } from 'node:util';
Object.assign(globalThis, { TextEncoder, TextDecoder });
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { useDesktopNativeShare } from './useDesktopNativeShare';
import { useComposerAttachments } from './useComposerAttachments';
import { readDesktopNativeShareFiles } from '@/shared/data/desktop/desktopNativeShare';
jest.mock('@/shared/data/desktop/desktopHostBridge', () => ({ hasDesktopHostBridge: () => true }));
jest.mock('@/shared/data/desktop/desktopNativeShare', () => ({ ...jest.requireActual('@/shared/data/desktop/desktopNativeShare'), readDesktopNativeShareFiles: jest.fn(), completeDesktopNativeShare: jest.fn() }));
jest.mock('@/shared/data/desktop/desktopScreenshot', () => ({ canUseDesktopScreenshotBridge: () => false }));
jest.mock('@/shared/data', () => ({ createRequestId: (() => { let n = 0; return () => `upload-${++n}`; })(), uploadFile: jest.fn() }));
const entry = '/agent/cutej?newChat=1791788400000&shareBatch=36f00671-a11c-4417-bdfa-502d2a14de3b';
it('restores the shared ZIP after visiting a history chat and reopening the same pending batch', async () => {
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
 (readDesktopNativeShareFiles as jest.Mock).mockResolvedValue([new File(['PK'], 'chat.zip', { type: 'application/zip' })]);
 let attachments!: ReturnType<typeof useComposerAttachments>;
 let share!: ReturnType<typeof useDesktopNativeShare>;
 let nav!: ReturnType<typeof useNavigate>;
 const Harness = () => {
  const location = useLocation(); nav = useNavigate();
  const state: any = { chatId: new URLSearchParams(location.search).get('chatId') || '', pendingNewChatAgentKey: 'cutej', chatAgentById: new Map(), workerIndexByKey: {}, workerSelectionKey: 'agent:cutej' };
  attachments = useComposerAttachments({ dispatch: jest.fn(), state, mainChatRunning: false, isFrontendActive: false, isVoiceMode: false });
  share = useDesktopNativeShare({ enabled: true, chatId: state.chatId, pendingAgentKey: state.pendingNewChatAgentKey, attachmentResetVersion: attachments.attachmentResetVersion, stageFiles: attachments.stageFiles });
  return null;
 };
 const root = createRoot(document.createElement('div'));
 try {
  await act(async () => root.render(<MemoryRouter initialEntries={[entry]}><Harness /></MemoryRouter>));
  expect(attachments.attachments.map(a => a.name)).toEqual(['chat.zip']);
  await act(async () => nav('/agent/cutej?chatId=history'));
  expect(attachments.attachments).toEqual([]);
  await act(async () => nav(entry));
  expect(attachments.attachments.map(a => a.name)).toEqual(['chat.zip']);
  expect((readDesktopNativeShareFiles as jest.Mock).mock.calls.length).toBeGreaterThan(1);
  expect((readDesktopNativeShareFiles as jest.Mock).mock.calls.some(([, signal]) => signal.aborted)).toBe(true);
  const readsBeforeClear = (readDesktopNativeShareFiles as jest.Mock).mock.calls.length;
  const capturedComplete = share.complete;
  await act(async () => attachments.clearComposerAttachments());
  expect(attachments.attachments.map(a => a.name)).toEqual(['chat.zip']);
  expect((readDesktopNativeShareFiles as jest.Mock).mock.calls.length).toBeGreaterThan(readsBeforeClear);
  await expect(capturedComplete()).resolves.toBe(false);
 } finally { act(() => root.unmount()); }
});
