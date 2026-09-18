/** @jest-environment jsdom */
import React, { act } from 'react';
import { serialize, deserialize } from 'node:v8';
import { createRoot, type Root } from 'react-dom/client';
import type { AgentEvent } from '@/shared/contracts/agentEvents';
import { createInitialState } from '@/app/state/state';
import { appReducer } from '@/app/state/reducer';
import { useComposerSend } from '@/features/composer/hooks/useComposerSend';
import { useConversationEventHandler } from '@/features/conversation/hooks/useConversationEventHandler';

const mockSteer = jest.fn();
const mockMessageApi = { warning: jest.fn(), error: jest.fn() };
let mockContext: any;
jest.mock('@/features/transport/hooks/useRealtimeTransport', () => ({
  useRunTransport: () => ({ steer: mockSteer, interrupt: jest.fn() }),
}));
jest.mock('@/shared/data', () => ({
  createRequestId: jest.fn(() => 'request'), compactChat: jest.fn(),
  learnChat: jest.fn(), rememberChat: jest.fn(), setAccessToken: jest.fn(),
}));
jest.mock('@/app/state/AppContext', () => ({
  ...jest.requireActual('@/app/state/AppContext'),
  useAppContext: () => mockContext,
}));
jest.mock('antd', () => ({ App: { useApp: () => ({ message: mockMessageApi }) } }));
jest.mock('@/features/surfaces/openTarget', () => ({ useOpenTarget: () => jest.fn() }));
jest.mock('@/features/btw/components/BtwProvider', () => ({ useBTW: () => ({ openBTW: jest.fn() }) }));
jest.mock('@/shared/i18n', () => ({ useI18n: () => ({ t: (key: string) => key }), t: (key: string) => key }));
jest.mock('@/features/terminal/lib/terminalDockPersistence', () => ({
  restoreTerminalDockOpen: () => false, restoreTerminalDockState: () => ({ open: false, height: null }),
  persistTerminalDockOpen: jest.fn(), persistTerminalDockState: jest.fn(),
}));

const roots: Root[] = [];
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, structuredClone: (value: unknown) => deserialize(serialize(value)) });
beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => {
  act(() => roots.splice(0).forEach(root => root.unmount()));
  jest.restoreAllMocks();
});

function mount(sendOverrides: Record<string, unknown> = {}) {
  const state = createInitialState();
  state.chatId = 'chat-a';
  state.runId = 'run-a';
  state.streaming = true;
  state.chats = [{ chatId: 'chat-a', agentKey: 'agent-a' }, { chatId: 'chat-b', agentKey: 'agent-b' }];
  state.currentChatActiveRun = { chatId: 'chat-a', runId: 'run-a', agentKey: 'agent-a', owner: { kind: 'agent', agentKey: 'agent-a' } };
  state.pendingSteers = { 'chat-a': [{
    steerId: 'steer-a', runId: 'run-a', requestId: 'request-a',
    message: 'message from A', status: 'queued', createdAt: Date.now(),
  }] };
  const stateRef = { current: state };
  const dispatch = jest.fn(action => { stateRef.current = appReducer(stateRef.current, action); });
  mockContext = {
    state, stateRef, dispatch, querySessionsRef: { current: new Map() },
    activeQuerySessionRequestIdRef: { current: '' },
    chatQuerySessionIndexRef: { current: new Map() },
  };
  const setInputValue = jest.fn();
  let send: ReturnType<typeof useComposerSend>;
  let events: ReturnType<typeof useConversationEventHandler>;
  let mainChatRunning = true;
  const Harness = () => {
    send = useComposerSend({
      ...mockContext, state: stateRef.current, mainChatRunning,
      backgroundCommandText: {}, inputValue: '', attachmentChatId: '', accessLevel: 'default',
      clearComposerAttachments: jest.fn(), clearMustUseSkills: jest.fn(), closeMention: jest.fn(),
      controlParams: {}, hasUploadingAttachments: false, isAwaitingActive: false, isVoiceMode: false,
      modelOverride: {}, mustUseSkills: [], mustUseSkillsAgentKey: '',
      selectSlashItem: () => null, onSelectSlashSkill: jest.fn(), showSlashPalette: false,
      sendAttachmentMeta: [], sendReferences: [], setInputValue, setSlashDismissed: jest.fn(),
      speechListening: false, stopSpeechInput: jest.fn(), textareaRef: { current: null },
      updateMentionSuggestions: jest.fn(), executeSlashCommandInput: {}, ...sendOverrides,
    } as any);
    events = useConversationEventHandler();
    return null;
  };
  const root = createRoot(document.createElement('div'));
  roots.push(root);
  const render = (running = mainChatRunning) => {
    mainChatRunning = running;
    act(() => root.render(React.createElement(Harness)));
  };
  render();
  const ack = (overrides: Partial<AgentEvent> = {}) => events.handleEvent({
    type: 'request.steer', chatId: 'chat-a', runId: 'run-a', agentKey: 'agent-a',
    steerId: 'steer-a', requestId: 'request-a', message: 'message from A', timestamp: Date.now(), ...overrides,
  });
  return { stateRef, dispatch, setInputValue, send: () => send.handleSend(), submit: () => send.handleSteer('steer-a'), cancel: () => send.handleCancelSteer('steer-a'), ack, render };
}

it('accepted control response retains sending until request.steer projects the timeline node', async () => {
  mockSteer.mockResolvedValue({ status: 200, code: 0, data: { accepted: true } });
  const h = mount();
  await h.submit();
  expect(h.stateRef.current.pendingSteers['chat-a'][0].status).toBe('sending');
  expect(h.stateRef.current.timelineNodes.has('steer_steer-a')).toBe(false);
  h.ack();
  expect(h.stateRef.current.pendingSteers['chat-a']).toBeUndefined();
  expect(h.stateRef.current.timelineNodes.get('steer_steer-a')).toMatchObject({ text: 'message from A', messageVariant: 'steer' });
  expect(h.setInputValue).not.toHaveBeenCalled();
});

it('keeps an unknown transport outcome pending until a stream acknowledgement arrives', async () => {
  mockSteer.mockRejectedValue(new Error('response connection lost'));
  const h = mount();
  await h.submit();
  expect(h.stateRef.current.pendingSteers['chat-a'][0]).toMatchObject({ status: 'sending', submissionError: 'response connection lost' });
  expect(h.stateRef.current.composerDraft).toBe('');
  expect(h.setInputValue).not.toHaveBeenCalled();
  h.ack();
  expect(h.stateRef.current.pendingSteers['chat-a']).toBeUndefined();
});

it('retains malformed control responses as unconfirmed', async () => {
  mockSteer.mockResolvedValue({ data: {} });
  const h = mount();
  await h.submit();
  expect(h.stateRef.current.pendingSteers['chat-a'][0]).toMatchObject({ status: 'sending', submissionError: 'invalid_response' });
  expect(h.stateRef.current.composerDraft).toBe('');
});

it.each(['failure', 'rejection', 'acceptance'])('ignores a late %s after stream acknowledgement', async outcome => {
  let settle: () => void;
  mockSteer.mockImplementation(() => new Promise((resolve, reject) => {
    settle = () => outcome === 'failure' ? reject(new Error('late response failure'))
      : resolve({ data: { accepted: outcome === 'acceptance' } });
  }));
  const h = mount();
  const pending = h.submit();
  h.ack();
  h.dispatch({ type: 'SET_COMPOSER_DRAFT', draft: 'next thought' });
  settle!();
  await pending;
  expect(h.stateRef.current.pendingSteers['chat-a']).toBeUndefined();
  expect(h.stateRef.current.composerDraft).toBe('next thought');
  expect(h.setInputValue).not.toHaveBeenCalled();
  expect(mockMessageApi.warning).not.toHaveBeenCalled();
  expect(mockMessageApi.error).not.toHaveBeenCalled();
});

it('confirms a background chat without projecting its timeline or switching chats', async () => {
  mockSteer.mockResolvedValue({ data: { accepted: true } });
  const h = mount();
  await h.submit();
  h.dispatch({ type: 'SET_CHAT_ID', chatId: 'chat-b' });
  h.ack();
  expect(h.stateRef.current.pendingSteers['chat-a']).toBeUndefined();
  expect(h.stateRef.current.chatId).toBe('chat-b');
  expect(h.stateRef.current.timelineNodes.has('steer_steer-a')).toBe(false);
});

it('restores an explicit rejection to the original chat, preserving both chats’ drafts', async () => {
  let rejectSteer: () => void;
  mockSteer.mockImplementation(() => new Promise(resolve => {
    rejectSteer = () => resolve({ data: { accepted: false, status: 'unmatched' } });
  }));
  const h = mount();
  const pending = h.submit();
  h.dispatch({ type: 'SET_COMPOSER_DRAFT', draft: 'new draft in A' });
  h.dispatch({ type: 'SET_CHAT_ID', chatId: 'chat-b' });
  h.dispatch({ type: 'SET_COMPOSER_DRAFT', draft: 'draft in B' });
  rejectSteer!();
  await pending;
  expect(h.stateRef.current.pendingSteers['chat-a']).toBeUndefined();
  expect(h.stateRef.current.composerDraft).toBe('draft in B');
  expect(h.stateRef.current.composerDraftByChatId['chat-a']).toBe('new draft in A\n\nmessage from A');
  expect(h.setInputValue).not.toHaveBeenCalled();
  expect(mockMessageApi.warning).not.toHaveBeenCalled();
  h.dispatch({ type: 'SET_CHAT_ID', chatId: 'chat-a' });
  expect(h.stateRef.current.composerDraft).toBe('new draft in A\n\nmessage from A');
});

it('restores a visible rejection alongside the current draft', async () => {
  mockSteer.mockResolvedValue({ data: { accepted: false } });
  const h = mount();
  h.dispatch({ type: 'SET_COMPOSER_DRAFT', draft: 'next thought' });
  await h.submit();
  expect(h.stateRef.current.pendingSteers['chat-a']).toBeUndefined();
  expect(h.stateRef.current.composerDraft).toBe('next thought\n\nmessage from A');
  expect(mockMessageApi.warning).toHaveBeenCalledTimes(1);
});

it.each([
  { chatId: 'chat-other' }, { runId: 'run-other' }, { steerId: 'other', requestId: 'request-a' },
  { steerId: '' }, { message: '' },
])('does not confirm an unrelated or malformed event: %j', async event => {
  mockSteer.mockResolvedValue({ data: { accepted: true } });
  const h = mount();
  await h.submit();
  h.ack(event);
  expect(h.stateRef.current.pendingSteers['chat-a'][0].status).toBe('sending');
});

it('projects repeated stream acknowledgements only once', async () => {
  mockSteer.mockResolvedValue({ data: { accepted: true } });
  const h = mount();
  await h.submit();
  h.ack();
  h.ack();
  expect(h.stateRef.current.timelineOrder.filter(id => id === 'steer_steer-a')).toHaveLength(1);
});

it('submits a queued entry only once even before React rerenders', async () => {
  mockSteer.mockResolvedValue({ data: { accepted: true } });
  const h = mount();
  await Promise.all([h.submit(), h.submit()]);
  expect(mockSteer).toHaveBeenCalledTimes(1);
});

it('cancels a queued entry without overwriting newly typed text', () => {
  const h = mount();
  h.dispatch({ type: 'SET_COMPOSER_DRAFT', draft: 'next thought' });
  h.cancel();
  expect(h.stateRef.current.composerDraft).toBe('next thought\n\nmessage from A');
  expect(h.stateRef.current.pendingSteers['chat-a']).toBeUndefined();
});

it('does not cancel a sending entry while its run is active', async () => {
  mockSteer.mockResolvedValue({ data: { accepted: true } });
  const h = mount();
  await h.submit();
  h.cancel();
  expect(h.stateRef.current.pendingSteers['chat-a'][0].status).toBe('sending');
});

it('retains sending entries at run end and allows explicit recovery afterwards', async () => {
  mockSteer.mockRejectedValue(new Error('response lost'));
  const h = mount();
  await h.submit();
  const sendEvent = jest.spyOn(window, 'dispatchEvent');
  h.dispatch({ type: 'BATCH_UPDATE', updates: { currentChatActiveRun: null, streaming: false } });
  h.render(false);
  expect(h.stateRef.current.pendingSteers['chat-a'][0].status).toBe('sending');
  expect(sendEvent).not.toHaveBeenCalled();
  h.cancel();
  expect(h.stateRef.current.pendingSteers['chat-a']).toBeUndefined();
  expect(h.stateRef.current.composerDraft).toBe('message from A');
});

it('does not mistake switching from a running chat to an idle chat for run completion', () => {
  const h = mount();
  h.dispatch({ type: 'ENQUEUE_PENDING_STEER', chatId: 'chat-b', steer: {
    steerId: 'steer-b', runId: 'run-b', requestId: 'req-b', message: 'B queued', createdAt: 1, status: 'queued',
  } });
  const sendEvent = jest.spyOn(window, 'dispatchEvent');
  h.dispatch({ type: 'SET_CHAT_ID', chatId: 'chat-b' });
  h.render(false);
  expect(sendEvent).not.toHaveBeenCalled();
  expect(h.stateRef.current.pendingSteers['chat-b']).toHaveLength(1);
  expect(h.stateRef.current.pendingSteers['chat-a']).toHaveLength(1);
});

it('sends one queued message to its original chat on actual run completion', () => {
  const h = mount();
  const sendEvent = jest.spyOn(window, 'dispatchEvent');
  h.dispatch({ type: 'BATCH_UPDATE', updates: {
    currentChatActiveRun: null, streaming: false,
    chatTransition: { seq: 1, targetChatId: 'chat-a', phase: 'ready', displayMode: 'background', error: '' },
  } });
  h.render(false);
  expect(sendEvent).toHaveBeenCalledTimes(1);
  expect((sendEvent.mock.calls[0][0] as CustomEvent).detail).toEqual({ chatId: 'chat-a', message: 'message from A' });
  expect(h.stateRef.current.pendingSteers['chat-a']).toBeUndefined();
});

it.each(['loading', 'applying', 'restoring', 'error'])('does not auto-send while the chat transition is %s', phase => {
  const h = mount();
  const sendEvent = jest.spyOn(window, 'dispatchEvent');
  h.dispatch({ type: 'BATCH_UPDATE', updates: {
    currentChatActiveRun: null, streaming: false,
    chatTransition: { seq: 1, targetChatId: 'chat-a', phase, displayMode: 'background', error: '' },
  } });
  h.render(false);
  expect(sendEvent).not.toHaveBeenCalled();
  expect(h.stateRef.current.pendingSteers['chat-a']).toHaveLength(1);
});

it('does not auto-send if the observed run changed during the running-to-idle transition', () => {
  const h = mount();
  const sendEvent = jest.spyOn(window, 'dispatchEvent');
  h.dispatch({ type: 'BATCH_UPDATE', updates: { runId: 'another-run', currentChatActiveRun: null, streaming: false } });
  h.render(false);
  expect(sendEvent).not.toHaveBeenCalled();
  expect(h.stateRef.current.pendingSteers['chat-a']).toHaveLength(1);
});

const imageReferences = [{ id: 'image-a', type: 'file', name: 'image.png', mimeType: 'image/png', url: 'image.png' }];

it('sends image references and restores them on an explicit rejection', async () => {
  mockSteer.mockResolvedValue({ data: { accepted: false, status: 'invalid_reference', detail: 'not supported' } });
  const h = mount();
  h.stateRef.current.pendingSteers['chat-a'][0].references = imageReferences;
  await h.submit();
  expect(mockSteer).toHaveBeenCalledWith(expect.objectContaining({ references: imageReferences }));
  expect(h.stateRef.current.restoredSteerReferencesByChatId['chat-a']).toEqual(imageReferences);
  expect(h.stateRef.current.composerDraft).toBe('message from A');
});

it('cancellation restores images once to their original chat', () => {
  const h = mount();
  h.stateRef.current.pendingSteers['chat-a'][0].references = imageReferences;
  h.cancel(); h.cancel();
  expect(h.stateRef.current.restoredSteerReferencesByChatId['chat-a']).toEqual(imageReferences);
  h.dispatch({ type: 'SET_CHAT_ID', chatId: 'chat-b' });
  expect(h.stateRef.current.restoredSteerReferencesByChatId['chat-a']).toEqual(imageReferences);
  expect(h.stateRef.current.restoredSteerReferencesByChatId['chat-b']).toBeUndefined();
});

it('carries queued images into a query when the run completes', () => {
  const h = mount();
  h.stateRef.current.pendingSteers['chat-a'][0].references = imageReferences;
  const sendEvent = jest.spyOn(window, 'dispatchEvent');
  h.dispatch({ type: 'BATCH_UPDATE', updates: { currentChatActiveRun: null, streaming: false,
    chatTransition: { seq: 1, targetChatId: 'chat-a', phase: 'ready', displayMode: 'background', error: '' } } });
  h.render(false);
  expect((sendEvent.mock.calls[0][0] as CustomEvent).detail).toEqual(expect.objectContaining({
    chatId: 'chat-a', references: imageReferences, attachments: [expect.objectContaining({ name: 'image.png', url: 'image.png' })],
  }));
});

const selectionReferences = [{ id: 'selection-a', type: 'selection', name: 'Selected text',
  mimeType: 'text/plain', text: 'selected text', meta: { sourceKind: 'message' } }];

it('restores rejected selections and preserves them when the queued steer becomes a query', async () => {
  mockSteer.mockResolvedValue({ data: { accepted: false, status: 'invalid_reference' } });
  const h = mount();
  h.stateRef.current.pendingSteers['chat-a'][0].references = selectionReferences;
  await h.submit();
  expect(mockSteer).toHaveBeenCalledWith(expect.objectContaining({ references: selectionReferences }));
  expect(h.stateRef.current.restoredSteerReferencesByChatId['chat-a']).toEqual(selectionReferences);
  const next = mount();
  next.stateRef.current.pendingSteers['chat-a'][0].references = selectionReferences;
  const sendEvent = jest.spyOn(window, 'dispatchEvent');
  next.dispatch({ type: 'BATCH_UPDATE', updates: { currentChatActiveRun: null, streaming: false,
    chatTransition: { seq: 1, targetChatId: 'chat-a', phase: 'ready', displayMode: 'background', error: '' } } });
  next.render(false);
  expect((sendEvent.mock.calls[0][0] as CustomEvent).detail).toMatchObject({
    references: selectionReferences, attachments: [expect.objectContaining({ type: 'selection', meta: selectionReferences[0].meta })],
  });
});

it('restores canceled selections once and projects accepted selections in the timeline', async () => {
  const canceled = mount();
  canceled.stateRef.current.pendingSteers['chat-a'][0].references = selectionReferences;
  canceled.cancel(); canceled.cancel();
  expect(canceled.stateRef.current.restoredSteerReferencesByChatId['chat-a']).toEqual(selectionReferences);
  mockSteer.mockResolvedValue({ data: { accepted: true } });
  const h = mount();
  h.stateRef.current.pendingSteers['chat-a'][0].references = selectionReferences;
  await h.submit();
  h.ack({ references: selectionReferences });
  expect(h.stateRef.current.timelineNodes.get('steer_steer-a')).toMatchObject({
    attachments: [expect.objectContaining({ type: 'selection', meta: selectionReferences[0].meta })],
  });
});

it.each(['image.png','page.html','notes.md'])('queues and confirms a file-only steer: %s', url => {
 const references = [{type:'file',name:url,url}];
 const h=mount({sendReferences:references});
 h.stateRef.current.pendingSteers={};
 h.send();
 const queued=h.stateRef.current.pendingSteers['chat-a'][0];
 expect(queued).toMatchObject({message:'',references,status:'queued'});
 h.ack({steerId:queued.steerId,message:'',references});
 expect(h.stateRef.current.pendingSteers['chat-a']).toBeUndefined();
 expect(h.stateRef.current.timelineNodes.get('steer_'+queued.steerId)).toMatchObject({text:'',attachments:[expect.objectContaining({url})]});
});
it('restores file-only queued steers when the run ends without starting a query', () => {
 const h=mount();
 const refs=[{type:'file',name:'page.html',url:'page.html'}];
 h.stateRef.current.pendingSteers['chat-a'][0].message='';
 h.stateRef.current.pendingSteers['chat-a'][0].references=refs;
 const sendEvent=jest.spyOn(window,'dispatchEvent');
 h.dispatch({type:'BATCH_UPDATE',updates:{currentChatActiveRun:null,streaming:false,
 chatTransition:{seq:1,targetChatId:'chat-a',phase:'ready',displayMode:'background',error:''}}});
 h.render(false);
 expect(h.stateRef.current.pendingSteers['chat-a']).toBeUndefined();
 expect(h.stateRef.current.restoredSteerReferencesByChatId['chat-a']).toEqual(refs);
 expect(sendEvent.mock.calls.some(([event]) => event.type==='agent:send-message')).toBe(false);
 expect(mockMessageApi.warning).toHaveBeenCalledWith('composer.steer.addText');
});
it('does not convert file-only input to a query if the active run has ended before send', () => {
 const h=mount({sendReferences:[{type:'file',name:'notes.md',url:'notes.md'}]});
 h.stateRef.current.pendingSteers={};
 h.dispatch({type:'BATCH_UPDATE',updates:{currentChatActiveRun:null,streaming:false,runId:''}});
 const sendEvent=jest.spyOn(window,'dispatchEvent');
 h.send();
 expect(sendEvent.mock.calls.some(([event]) => event.type==='agent:send-message')).toBe(false);
});

it('restores file-only entries even behind a text steer when the run ends', () => {
 const h=mount();
 const refs=[{type:'file',name:'notes.md',url:'notes.md'}];
 h.stateRef.current.pendingSteers['chat-a'].push({steerId:'files',runId:'run-a',requestId:'files',message:'',references:refs,status:'queued',createdAt:1});
 const sendEvent=jest.spyOn(window,'dispatchEvent');
 h.dispatch({type:'BATCH_UPDATE',updates:{currentChatActiveRun:null,streaming:false,
 chatTransition:{seq:1,targetChatId:'chat-a',phase:'ready',displayMode:'background',error:''}}});
 h.render(false);
 expect(h.stateRef.current.restoredSteerReferencesByChatId['chat-a']).toEqual(refs);
 const messages=sendEvent.mock.calls.filter(([event])=>event.type==='agent:send-message');
 expect(messages).toHaveLength(1);
 expect((messages[0][0] as CustomEvent).detail.message).toBe('message from A');
});

it('queues a selection-only steer and confirms it with its reference intact', () => {
  const h = mount({ sendReferences: selectionReferences });
  h.stateRef.current.pendingSteers = {};
  h.send();
  const queued = h.stateRef.current.pendingSteers['chat-a'][0];
  expect(queued).toMatchObject({ message: '', references: selectionReferences, status: 'queued' });
  h.ack({ steerId: queued.steerId, message: '', references: selectionReferences });
  expect(h.stateRef.current.timelineNodes.get('steer_' + queued.steerId)).toMatchObject({
    text: '', attachments: [expect.objectContaining({ type: 'selection', meta: selectionReferences[0].meta })],
  });
});

it('restores selection-only input when the run ends instead of starting an empty query', () => {
  const h = mount();
  Object.assign(h.stateRef.current.pendingSteers['chat-a'][0], { message: '', references: selectionReferences });
  const sendEvent = jest.spyOn(window, 'dispatchEvent');
  h.dispatch({ type: 'BATCH_UPDATE', updates: { currentChatActiveRun: null, streaming: false,
    chatTransition: { seq: 1, targetChatId: 'chat-a', phase: 'ready', displayMode: 'background', error: '' } } });
  h.render(false);
  expect(h.stateRef.current.pendingSteers['chat-a']).toBeUndefined();
  expect(h.stateRef.current.restoredSteerReferencesByChatId['chat-a']).toEqual(selectionReferences);
  expect(sendEvent.mock.calls.some(([event]) => event.type === 'agent:send-message')).toBe(false);
});

it.each(['cancel', 'reject'] as const)('restores a selection-only steer after %s', async outcome => {
  const h = mount();
  Object.assign(h.stateRef.current.pendingSteers['chat-a'][0], { message: '', references: selectionReferences });
  if (outcome === 'cancel') h.cancel();
  else {
    mockSteer.mockResolvedValue({ data: { accepted: false, status: 'invalid_reference' } });
    await h.submit();
    expect(mockSteer).toHaveBeenCalledWith(expect.objectContaining({ message: '', references: selectionReferences }));
  }
  expect(h.stateRef.current.restoredSteerReferencesByChatId['chat-a']).toEqual(selectionReferences);
  expect(h.stateRef.current.pendingSteers['chat-a']).toBeUndefined();
});

it.each([[imageReferences], [selectionReferences]])('starts a follow-up query with queued references after a confirmed run', references => {
  const h = mount();
  h.stateRef.current.events = [{ type: 'request.query', chatId: 'chat-a', runId: 'run-a' }, { type: 'run.complete', chatId: 'chat-a', runId: 'run-a' }];
  Object.assign(h.stateRef.current.pendingSteers['chat-a'][0], { message: '', references });
  const sendEvent = jest.spyOn(window, 'dispatchEvent');
  h.dispatch({ type: 'BATCH_UPDATE', updates: { currentChatActiveRun: null, streaming: false } });
  h.render(false);
  const messages = sendEvent.mock.calls.filter(([event]) => event.type === 'agent:send-message');
  expect(messages).toHaveLength(1);
  expect((messages[0][0] as CustomEvent).detail).toMatchObject({ message: '', references, chatId: 'chat-a' });
  expect(h.stateRef.current.restoredSteerReferencesByChatId['chat-a']).toBeUndefined();
});

it('allows reference-only send after the active run ends, using persisted history', () => {
  const h = mount({ sendReferences: selectionReferences });
  h.stateRef.current.pendingSteers = {};
  h.stateRef.current.chats[0].lastRunId = 'run-a';
  h.dispatch({ type: 'BATCH_UPDATE', updates: { currentChatActiveRun: null, streaming: false, runId: '' } });
  const sendEvent = jest.spyOn(window, 'dispatchEvent');
  h.send();
  const messages = sendEvent.mock.calls.filter(([event]) => event.type === 'agent:send-message');
  expect(messages).toHaveLength(1);
  expect((messages[0][0] as CustomEvent).detail).toMatchObject({ message: '', references: selectionReferences });
});


it('allows consecutive reference-only queries across run boundaries but blocks a double click', () => {
  const h = mount({ sendReferences: selectionReferences });
  h.stateRef.current.pendingSteers = {};
  h.stateRef.current.chats[0].lastRunId = 'run-a';
  h.dispatch({ type: 'BATCH_UPDATE', updates: { currentChatActiveRun: null, streaming: false } });
  h.render(false);
  const sendEvent = jest.spyOn(window, 'dispatchEvent');
  h.send(); h.send();
  expect(sendEvent.mock.calls.filter(([event]) => event.type === 'agent:send-message')).toHaveLength(1);
  h.render(true);
  h.render(false);
  h.send();
  expect(sendEvent.mock.calls.filter(([event]) => event.type === 'agent:send-message')).toHaveLength(2);
});
