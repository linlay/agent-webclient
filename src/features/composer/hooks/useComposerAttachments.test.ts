/** @jest-environment jsdom */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useComposerAttachments } from './useComposerAttachments';
import { uploadFile } from '@/shared/data';

jest.mock('@/shared/data', () => ({
  createRequestId: () => 'upload-a',
  uploadFile: jest.fn(),
  extractUploadChatId: (data: any) => data.chatId,
  extractUploadReferences: (data: any) => [data.upload],
}));
jest.mock('@/shared/data/desktop/desktopScreenshot', () => ({ canUseDesktopScreenshotBridge: () => false }));
const upload = uploadFile as jest.Mock;
const references = [{ id: 'upload-restored', type: 'file', name: 'restored.png', url: 'restored.png', mimeType: 'image/png' }];

it('allows pasting during a run, retains failed uploads, and isolates restored images by chat', async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  let state: any = { chatId: 'chat-a', chatAgentById: new Map(), workerIndexByKey: {}, workerSelectionKey: '', restoredSteerReferencesByChatId: { 'chat-a': references } };
  const dispatch = jest.fn(action => {
    if (action.type === 'SET_RESTORED_STEER_REFERENCES') state = { ...state, restoredSteerReferencesByChatId: { ...state.restoredSteerReferencesByChatId, [action.chatId]: action.references } };
  });
  let actions!: ReturnType<typeof useComposerAttachments>;
  const Harness = () => { actions = useComposerAttachments({ dispatch, state, mainChatRunning: true, isFrontendActive: false, isVoiceMode: false }); return null; };
  const root = createRoot(document.createElement('div'));
  const render = () => act(() => root.render(React.createElement(Harness)));
  try {
    render();
    expect(actions.sendReferences).toEqual(references);
    state = { ...state, chatId: 'chat-b' }; render();
    expect(actions.sendReferences).toEqual([]);
    state = { ...state, chatId: 'chat-a' }; render();
    expect(actions.sendReferences).toEqual(references);
    upload.mockImplementation(async ({ filename }: any) => ({ data: { chatId: 'chat-a', upload: { id: 'upload-a', type: 'file', name: filename, url: filename, mimeType: 'image/png' } } }));
    const event: any = { clipboardData: { files: [new File(['png'], 'pasted.png', { type: 'image/png' })] }, preventDefault: jest.fn() };
    await act(async () => { actions.handleFilePaste(event); });
    expect(event.preventDefault).toHaveBeenCalled();
    expect(upload).toHaveBeenCalledWith(expect.objectContaining({ chatId: 'chat-a' }));
    expect(actions.sendReferences).toHaveLength(2);
    act(() => actions.handleRemoveAttachment('restored-steer:0')); render();
    expect(state.restoredSteerReferencesByChatId['chat-a']).toEqual([]);
    expect(actions.sendReferences).toHaveLength(1);
    upload.mockRejectedValueOnce(new Error('upload failed'));
    await act(async () => { actions.handleFilePaste({ ...event, clipboardData: { files: [new File(['png'], 'failed.png', { type: 'image/png' })] } }); });
    expect(actions.hasFailedAttachments).toBe(true);
    expect(actions.attachments.some(item => item.status === 'error')).toBe(true);
  } finally { act(() => root.unmount()); }
});
