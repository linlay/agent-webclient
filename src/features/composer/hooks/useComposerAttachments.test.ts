/** @jest-environment jsdom */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useComposerAttachments } from './useComposerAttachments';
import { uploadFile } from '@/shared/data';
import { appReducer } from '@/app/state/reducer';
import { createInitialState } from '@/app/state/state';

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

it('restores the New Chat upload identity with references after history uploads, clearing and remounting', async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  upload.mockReset();
  upload.mockImplementation(async ({ chatId, filename }: any) => ({ data: {
    chatId: chatId || 'blank-upload-chat',
    upload: { id: filename, type: 'file', name: filename, url: filename, mimeType: 'text/plain' },
  } }));
  let state = createInitialState();
  let actions!: ReturnType<typeof useComposerAttachments>;
  let dispatch!: React.Dispatch<any>;
  const Harness = () => {
    const [current, send] = React.useReducer(appReducer, state);
    state = current;
    dispatch = send;
    actions = useComposerAttachments({ dispatch, state: current, mainChatRunning: false, isFrontendActive: false, isVoiceMode: false });
    React.useEffect(() => { send({ type: 'SET_COMPOSER_REFERENCES', references: actions.sendReferences }); }, [actions.sendReferences]);
    return null;
  };
  const container = document.createElement('div');
  let root = createRoot(container);
  const addFile = async (name: string) => {
    await act(async () => { actions.handleFileSelection({ target: { files: [new File(['test'], name)], value: '' } } as any); });
  };
  try {
    act(() => root.render(React.createElement(Harness)));
    act(() => dispatch({ type: 'SET_COMPOSER_DRAFT', draft: 'Please read the attachment' }));
    await addFile('blank.txt');
    expect(actions.attachmentChatId).toBe('blank-upload-chat');
    const blankReferences = actions.sendReferences;
    act(() => dispatch({ type: 'SET_CHAT_ID', chatId: 'history-chat' }));
    expect(actions.sendReferences).toEqual([]);
    expect(actions.attachmentChatId).toBe('');
    await addFile('history.txt');
    expect(upload).toHaveBeenLastCalledWith(expect.objectContaining({ chatId: 'history-chat' }));
    act(() => actions.clearComposerAttachments());
    expect(state.composerUploadChatId).toBe('blank-upload-chat');
    act(() => {
      dispatch({ type: 'SET_CHAT_ID', chatId: '' });
      dispatch({ type: 'RESET_ACTIVE_CONVERSATION' });
    });
    expect(state.composerDraft).toBe('Please read the attachment');
    expect(actions.sendReferences).toEqual(blankReferences);
    expect(actions.attachmentChatId).toBe('blank-upload-chat');
    act(() => root.unmount());
    root = createRoot(container);
    act(() => root.render(React.createElement(Harness)));
    expect(actions.sendReferences).toEqual(blankReferences);
    expect(actions.attachmentChatId).toBe('blank-upload-chat');
    await addFile('next.txt');
    expect(upload).toHaveBeenLastCalledWith(expect.objectContaining({ chatId: 'blank-upload-chat' }));
    act(() => actions.clearComposerAttachments());
    expect(state.composerUploadChatId).toBe('');
    expect(actions.sendReferences).toEqual([]);
  } finally { act(() => root.unmount()); }
});

it.each([false, true])('restores image and skill submissions without duplication (new edits: %s)', async (edited) => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  upload.mockReset();
  upload.mockImplementation(async ({ filename }: any) => ({ data: {
    chatId: 'upload-chat',
    upload: { id: filename, type: 'file', name: filename, url: 'resource://' + filename, mimeType: 'image/png' },
  } }));
  let state = createInitialState();
  let actions!: ReturnType<typeof useComposerAttachments>;
  let dispatch!: React.Dispatch<any>;
  const Harness = () => {
    const [current, send] = React.useReducer(appReducer, state);
    state = current;
    dispatch = send;
    actions = useComposerAttachments({ dispatch: send, state: current, mainChatRunning: false, isFrontendActive: false, isVoiceMode: false });
    React.useEffect(() => { send({ type: 'SET_COMPOSER_REFERENCES', references: actions.sendReferences }); }, [actions.sendReferences]);
    return null;
  };
  const pasteImage = async (name: string) => {
    await act(async () => {
      actions.handleFilePaste({ clipboardData: { files: [new File(['png'], name, { type: 'image/png' })] }, preventDefault: jest.fn() } as any);
    });
  };
  const root = createRoot(document.createElement('div'));
  try {
    act(() => root.render(React.createElement(Harness)));
    await pasteImage('picture.png');
    act(() => actions.setContextReferences('skill', [{ type: 'skill', id: 'design-a', name: 'Design A' }]));
    const submitted = actions.sendReferences;
    act(() => {
      actions.clearComposerAttachments();
      dispatch({ type: 'BEGIN_COMPOSER_SUBMISSION', draft: {
        requestId: 'r', chatId: '', agentKey: 'kimi', message: 'make a poster',
        uploadChatId: 'upload-chat', schemaVersion: 2, references: submitted,
      } });
    });
    if (edited) await pasteImage('next.png');
    act(() => dispatch({ type: 'SETTLE_COMPOSER_SUBMISSION', requestId: 'r', accepted: false }));
    expect(state.failedSubmissions).toHaveLength(edited ? 1 : 0);
    if (edited) act(() => dispatch({ type: 'RESTORE_FAILED_SUBMISSION', requestId: 'r' }));
    expect(state.composerDraft).toBe('make a poster');
    expect(actions.attachmentChatId).toBe('upload-chat');
    expect(actions.sendReferences).toHaveLength(edited ? 3 : 2);
    expect(actions.sendReferences).toEqual(expect.arrayContaining(submitted));
    act(() => actions.setContextReferences('skill', [{ type: 'skill', id: 'design-b', name: 'Design B' }]));
    expect(actions.sendReferences).toEqual(expect.arrayContaining([submitted[0], { type: 'skill', id: 'design-b', name: 'Design B' }]));
    expect(actions.sendReferences).toHaveLength(edited ? 3 : 2);
    act(() => actions.setContextReferences('skill', []));
    expect(actions.sendReferences).toHaveLength(edited ? 2 : 1);
    if (edited) act(() => actions.handleRemoveAttachment(actions.attachments.find(item => item.name.startsWith('next_'))!.id));
    expect(actions.sendReferences).toEqual([submitted[0]]);
  } finally { act(() => root.unmount()); }
});
