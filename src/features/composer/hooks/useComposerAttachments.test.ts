/** @jest-environment jsdom */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useComposerAttachments } from './useComposerAttachments';
import { uploadFile } from '@/shared/data';

jest.mock('@/shared/data', () => ({
  createRequestId: (() => { let sequence = 0; return () => `upload-${++sequence}`; })(),
  uploadFile: jest.fn(),
  extractUploadChatId: (data: any) => data.chatId,
  extractUploadReferences: (data: any) => [data.upload],
}));
jest.mock('@/shared/data/desktop/desktopScreenshot', () => ({ canUseDesktopScreenshotBridge: () => false }));
const upload = uploadFile as jest.Mock;
const references = [{ id: 'upload-restored', type: 'file', name: 'restored.png', url: 'restored.png', mimeType: 'image/png' }];

it('appends shared ZIP drafts without replacing same-named files, uploading, or changing text; failed sends can retry', async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  upload.mockReset();
  const dispatch = jest.fn();
  const state: any = { chatId: '', pendingNewChatAgentKey: 'cutej', chatAgentById: new Map(), workerIndexByKey: {}, workerSelectionKey: 'agent:cutej' };
  let actions!: ReturnType<typeof useComposerAttachments>;
  const Harness = () => { actions = useComposerAttachments({ dispatch, state, mainChatRunning: false, isFrontendActive: false, isVoiceMode: false }); return null; };
  const root = createRoot(document.createElement('div'));
  try {
    act(() => root.render(React.createElement(Harness)));
    const first = new File(['old ZIP'], 'Chat.zip', { type: 'application/zip' });
    const next = new File(['new ZIP'], 'Chat.zip', { type: 'application/zip' });
    act(() => { expect(actions.stageFiles([first])).toBe(true); });
    act(() => { expect(actions.stageFiles([next])).toBe(true); });
    expect(actions.attachments.map(item => item.name)).toEqual(['Chat.zip', 'Chat (2).zip']);
    expect(actions.attachments.every(item => item.status === 'staged' && item.mimeType === 'application/zip')).toBe(true);
    expect(upload).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'SET_COMPOSER_DRAFT' }));
    upload.mockRejectedValueOnce(new Error('offline'));
    upload.mockImplementation(async ({ filename }: any) => ({ data: { chatId: 'upload-chat', upload: { id: filename, type: 'file', name: filename, url: filename, mimeType: 'application/zip' } } }));
    let succeeded = true;
    await act(async () => { succeeded = await actions.uploadStagedAttachments(); });
    expect(succeeded).toBe(false);
    expect(actions.attachments).toHaveLength(2);
    expect(actions.hasStagedAttachments).toBe(true);
    await act(async () => { succeeded = await actions.uploadStagedAttachments(); });
    expect(succeeded).toBe(true);
    expect(actions.sendReferences).toHaveLength(2);
    expect(actions.attachments.every(item => item.status === 'ready')).toBe(true);
  } finally { act(() => root.unmount()); }
});

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

 it('blocks disabled file ingress and chat references', async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  upload.mockClear();
  let actions!: ReturnType<typeof useComposerAttachments>;
  const config = {model:true, accessLevel:true, connectors:true, attachment:{localFiles:false, chatRecords:false, skills:true, kbases:true}};
  const state: any = {chatId:'chat-a',chatAgentById:new Map(),workerIndexByKey:{},workerSelectionKey:''};
  const Harness = () => { actions = useComposerAttachments({dispatch:jest.fn(),state,mainChatRunning:false,isFrontendActive:false,isVoiceMode:false,interactionConfig:config}); return null; };
  const root = createRoot(document.createElement('div'));
  try {
   act(() => root.render(React.createElement(Harness)));
   const files = [new File(['text'],'test.txt',{type:'text/plain'})];
   await act(async () => {
    actions.handleFilePaste({clipboardData:{files},preventDefault:jest.fn()} as any);
    actions.handleFileDrop({dataTransfer:{files},preventDefault:jest.fn()} as any);
    actions.handleFileSelection({target:{files,value:''}} as any);
   });
   expect(upload).not.toHaveBeenCalled();
   expect(actions.addContextReference({type:'chat',id:'other',name:'other'})).toBe(false);
   expect(actions.sendReferences).toEqual([]);
  } finally { act(() => root.unmount()); }
 });
