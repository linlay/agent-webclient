/** @jest-environment jsdom */
import React, { act } from 'react';
import { serialize, deserialize } from 'node:v8';
import { createRoot, type Root } from 'react-dom/client';
import type { AgentEvent } from '@/shared/contracts/agentEvents';
import { createInitialState } from '@/app/state/state';
import { appReducer } from '@/app/state/reducer';
import { useMessageActions } from '@/features/composer/hooks/useMessageActions';
import { useComposerSend } from '@/features/composer/hooks/useComposerSend';
import { useConversationEventHandler } from '@/features/conversation/hooks/useConversationEventHandler';

const mockSteer = jest.fn();
const mockStartQuery = jest.fn();
const mockRuns = { steer: mockSteer, interrupt: jest.fn(), startQuery: mockStartQuery };
const mockMessageApi = { warning: jest.fn(), error: jest.fn() };
let mockContext: any;
jest.mock('@/features/transport/hooks/useRealtimeTransport', () => ({
  useRunTransport: () => mockRuns,
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
jest.mock('@/features/surfaces/hooks/useOpenTarget', () => ({ useOpenTarget: () => jest.fn() }));
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

function mount(sendOverrides: Record<string, unknown> = {}, connectQuery = false) {
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
    if (connectQuery) useMessageActions({ onAgentEvent: events.handleEvent });
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
  // Fixture setup bypasses application actions; production events still use the real reducer.
  const setState = (updates: Partial<typeof state>) => { stateRef.current = { ...stateRef.current, ...updates }; };
  return { stateRef, dispatch, setState, setInputValue, send: () => send.handleSend(), submitQueued: () => send.handleSubmitQueuedSteer(), submit: () => send.handleSteer('steer-a'), cancel: () => send.handleCancelSteer('steer-a'), ack, render, event: (event: AgentEvent) => events.handleEvent(event) };
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
  h.setState({ currentChatActiveRun: null, streaming: false });
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
  h.setState({
    currentChatActiveRun: null, streaming: false,
    chatTransition: { seq: 1, targetChatId: 'chat-a', phase: 'ready', displayMode: 'background', error: '' },
  });
  h.render(false);
  expect(sendEvent).toHaveBeenCalledTimes(1);
  expect((sendEvent.mock.calls[0][0] as CustomEvent).detail).toEqual({ chatId: 'chat-a', message: 'message from A' });
  expect(h.stateRef.current.pendingSteers['chat-a']).toBeUndefined();
});

it.each(['loading', 'applying', 'restoring', 'error'])('does not auto-send while the chat transition is %s', phase => {
  const h = mount();
  const sendEvent = jest.spyOn(window, 'dispatchEvent');
  h.setState({
    currentChatActiveRun: null, streaming: false,
    chatTransition: { seq: 1, targetChatId: 'chat-a', phase, displayMode: 'background', error: '' },
  });
  h.render(false);
  expect(sendEvent).not.toHaveBeenCalled();
  expect(h.stateRef.current.pendingSteers['chat-a']).toHaveLength(1);
});

it('does not auto-send if the observed run changed during the running-to-idle transition', () => {
  const h = mount();
  const sendEvent = jest.spyOn(window, 'dispatchEvent');
  h.setState({ runId: 'another-run', currentChatActiveRun: null, streaming: false });
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
  h.setState({ currentChatActiveRun: null, streaming: false,
    chatTransition: { seq: 1, targetChatId: 'chat-a', phase: 'ready', displayMode: 'background', error: '' } });
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
  next.setState({ currentChatActiveRun: null, streaming: false,
    chatTransition: { seq: 1, targetChatId: 'chat-a', phase: 'ready', displayMode: 'background', error: '' } });
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
 h.setState({currentChatActiveRun:null,streaming:false,
 chatTransition:{seq:1,targetChatId:'chat-a',phase:'ready',displayMode:'background',error:''}});
 h.render(false);
 expect(h.stateRef.current.pendingSteers['chat-a']).toBeUndefined();
 expect(h.stateRef.current.restoredSteerReferencesByChatId['chat-a']).toEqual(refs);
 expect(sendEvent.mock.calls.some(([event]) => event.type==='agent:send-message')).toBe(false);
 expect(mockMessageApi.warning).toHaveBeenCalledWith('composer.steer.addText');
});
it('does not convert file-only input to a query if the active run has ended before send', () => {
 const h=mount({sendReferences:[{type:'file',name:'notes.md',url:'notes.md'}]});
 h.stateRef.current.pendingSteers={};
 h.setState({currentChatActiveRun:null,streaming:false,runId:''});
 const sendEvent=jest.spyOn(window,'dispatchEvent');
 h.send();
 expect(sendEvent.mock.calls.some(([event]) => event.type==='agent:send-message')).toBe(false);
});

it('restores file-only entries even behind a text steer when the run ends', () => {
 const h=mount();
 const refs=[{type:'file',name:'notes.md',url:'notes.md'}];
 h.stateRef.current.pendingSteers['chat-a'].push({steerId:'files',runId:'run-a',requestId:'files',message:'',references:refs,status:'queued',createdAt:1});
 const sendEvent=jest.spyOn(window,'dispatchEvent');
 h.setState({currentChatActiveRun:null,streaming:false,
 chatTransition:{seq:1,targetChatId:'chat-a',phase:'ready',displayMode:'background',error:''}});
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
  h.setState({ currentChatActiveRun: null, streaming: false,
    chatTransition: { seq: 1, targetChatId: 'chat-a', phase: 'ready', displayMode: 'background', error: '' } });
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
  h.setState({ currentChatActiveRun: null, streaming: false });
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
  h.setState({ currentChatActiveRun: null, streaming: false, runId: '' });
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
  h.setState({ currentChatActiveRun: null, streaming: false });
  h.render(false);
  const sendEvent = jest.spyOn(window, 'dispatchEvent');
  h.send(); h.send();
  expect(sendEvent.mock.calls.filter(([event]) => event.type === 'agent:send-message')).toHaveLength(1);
  h.render(true);
  h.render(false);
  h.send();
  expect(sendEvent.mock.calls.filter(([event]) => event.type === 'agent:send-message')).toHaveLength(2);
});


it('submits the first queued steer of the active run when the draft is empty', async () => {
  mockSteer.mockResolvedValue({ data: { accepted: true } });
  const h = mount();
  const first = h.stateRef.current.pendingSteers['chat-a'][0];
  h.stateRef.current.pendingSteers['chat-a'] = [
    { ...first, steerId: 'old-run', runId: 'old-run' },
    { ...first, steerId: 'sending', status: 'sending' },
    first,
    { ...first, steerId: 'next-queued' },
  ];
  await act(async () => h.submitQueued());
  expect(mockSteer).toHaveBeenCalledTimes(1);
  expect(mockSteer).toHaveBeenCalledWith(expect.objectContaining({ steerId: 'steer-a', message: 'message from A' }));
  expect(h.stateRef.current.pendingSteers['chat-a'][3].status).toBe('queued');
  expect(h.stateRef.current.composerDraft).toBe('');
  expect(h.setInputValue).not.toHaveBeenCalled();
});

it('does not submit queued steer after the run ends or when the queue is empty', () => {
  const h = mount();
  h.stateRef.current.pendingSteers = {};
  h.submitQueued();
  expect(mockSteer).not.toHaveBeenCalled();
  h.stateRef.current.pendingSteers = { 'chat-a': [{ steerId: 'late', runId: 'run-a', requestId: 'late', message: 'late', status: 'queued', createdAt: 1 }] };
  h.stateRef.current.streaming = false;
  h.stateRef.current.currentChatActiveRun = null;
  h.submitQueued();
  expect(mockSteer).not.toHaveBeenCalled();
});

it('Cmd+Enter sends the draft directly and preserves existing waiting items', async () => {
 mockSteer.mockResolvedValue({ data: { accepted: true } });
 const h = mount({inputValue: 'direct instruction'});
 await act(async () => { h.submitQueued(); h.submitQueued(); });
 expect(mockSteer).toHaveBeenCalledTimes(1);
 expect(mockSteer).toHaveBeenCalledWith(expect.objectContaining({message: 'direct instruction', runId: 'run-a'}));
 expect(h.stateRef.current.pendingSteers['chat-a'][0]).toMatchObject({steerId: 'steer-a', status: 'queued'});
 expect(h.stateRef.current.pendingSteers['chat-a'][1].status).toBe('sending');
 expect(h.setInputValue).toHaveBeenCalledWith('');
});
it('Cmd+Enter sends attachment-only input without a waiting item', async () => {
 mockSteer.mockResolvedValue({ data: { accepted: true } });
 const references = [{type: 'selection', text: 'quote'}];
 const h = mount({sendReferences: references});
 h.stateRef.current.pendingSteers = {};
 await act(async () => h.submitQueued());
 expect(mockSteer).toHaveBeenCalledWith(expect.objectContaining({message: '', references}));
});
it.each([{hasUploadingAttachments:true}, {hasFailedAttachments:true}])('does not submit draft with unavailable attachments: %j', async flags => {
 const h = mount({inputValue:'draft', ...flags});
 await act(async () => h.submitQueued());
 expect(mockSteer).not.toHaveBeenCalled();
});
it('Enter only stages the draft before Cmd+Enter submits it', async () => {
 mockSteer.mockResolvedValue({ data: { accepted: true } });
 const overrides = {inputValue:'two steps'};
 const h = mount(overrides);
 h.stateRef.current.pendingSteers = {};
 h.send();
 expect(mockSteer).not.toHaveBeenCalled();
 overrides.inputValue = '';
 h.render();
 await act(async () => h.submitQueued());
 expect(mockSteer).toHaveBeenCalledWith(expect.objectContaining({message:'two steps'}));
});

it('dispatches an empty follow-up query while keeping empty steer blocked', () => {
 const h = mount();
 h.stateRef.current.pendingSteers = {};
 h.stateRef.current.chats[0].lastRunId = 'previous-run';
 h.stateRef.current.chats[0].canContinue = true;
 h.send();
 expect(mockSteer).not.toHaveBeenCalled();
 expect(h.stateRef.current.pendingSteers).toEqual({});
 h.stateRef.current.streaming = false;
 h.stateRef.current.currentChatActiveRun = null;
 h.render(false);
 const listener = jest.fn();
 window.addEventListener('agent:send-message', listener);
 try {
  h.send();
  expect(listener).toHaveBeenCalledTimes(1);
  expect((listener.mock.calls[0][0] as CustomEvent).detail.message).toBe('');
 } finally { window.removeEventListener('agent:send-message', listener); }
});

it('does not dispatch an empty query after a normally completed run', () => {
 const h = mount();
 h.stateRef.current.pendingSteers = {};
 h.stateRef.current.chats[0].lastRunId = 'done';
 h.stateRef.current.chats[0].canContinue = false;
 h.stateRef.current.streaming = false;
 h.stateRef.current.currentChatActiveRun = null;
 h.render(false);
 const listener = jest.fn();
 window.addEventListener('agent:send-message', listener);
 try { h.send(); expect(listener).not.toHaveBeenCalled(); }
 finally { window.removeEventListener('agent:send-message', listener); }
});

const readyTransition = {
  seq: 1, targetChatId: 'chat-a', phase: 'ready', displayMode: 'background', error: '',
};

it.each(['loading', 'applying', 'restoring'])('resumes a queued query once after %s becomes ready', phase => {
  const h = mount();
  const spy = jest.spyOn(window, 'dispatchEvent');
  h.setState({
    currentChatActiveRun: null, streaming: false, chatTransition: { ...readyTransition, phase },
  });
  h.render(false);
  expect(h.stateRef.current.pendingSteers['chat-a']).toHaveLength(1);
  expect(spy).not.toHaveBeenCalled();
  h.setState({ chatTransition: readyTransition });
  h.render(false);
  h.render(false);
  expect(spy.mock.calls.filter(([event]) => event.type === 'agent:send-message')).toHaveLength(1);
  expect(h.stateRef.current.pendingSteers['chat-a']).toBeUndefined();
});

it.each(['chat-switch', 'new-run'])('invalidates delayed continuation after %s', change => {
  const h = mount();
  const spy = jest.spyOn(window, 'dispatchEvent');
  h.setState({
    currentChatActiveRun: null, streaming: false,
    chatTransition: { ...readyTransition, phase: 'restoring' },
  });
  h.render(false);
  h.setState(change === 'chat-switch'
    ? { chatId: 'chat-b', chatTransition: null }
    : { runId: 'run-b', chatTransition: readyTransition });
  h.render(false);
  // Returning to the old identity must not resurrect its consumed edge.
  h.setState({ chatId: 'chat-a', runId: 'run-a', chatTransition: readyTransition });
  h.render(false);
  expect(spy).not.toHaveBeenCalled();
  expect(h.stateRef.current.pendingSteers['chat-a']).toHaveLength(1);
});

it('waits for the surface gate before removing the queued message', () => {
  const h = mount();
  const spy = jest.spyOn(window, 'dispatchEvent');
  h.setState({
    currentChatActiveRun: null, streaming: false, chatSurfaceBlocked: true,
  });
  h.render(false);
  expect(h.stateRef.current.pendingSteers['chat-a']).toHaveLength(1);
  expect(spy).not.toHaveBeenCalled();
  h.setState({ chatSurfaceBlocked: false });
  h.render(false);
  expect(spy.mock.calls.filter(([event]) => event.type === 'agent:send-message')).toHaveLength(1);
});

it('starts one real query per completed run while draining multiple queued messages', async () => {
  const completions: Array<() => void> = [];
  mockStartQuery.mockImplementation(input => {
    const runId = 'follow-up-' + mockStartQuery.mock.calls.length;
    return {
      identity: Promise.resolve({ chatId: 'chat-a', runId, owner: { kind: 'agent', agentKey: 'agent-a' } }),
      completion: new Promise(resolve => completions.push(() => {
        input.onEvent({ type: 'run.complete', chatId: 'chat-a', runId, timestamp: Date.now() });
        resolve({ reason: 'done', lastSeq: 1 });
      })),
      detach: jest.fn(),
    };
  });
  const h = mount({}, true);
  h.dispatch({ type: 'ENQUEUE_PENDING_STEER', chatId: 'chat-a', steer: {
    steerId: 'second', runId: 'run-a', requestId: 'second', message: 'second message', status: 'queued', createdAt: 2,
  } });
  h.setState({ chatTransition: { ...readyTransition, phase: 'restoring' } });
  h.event({ type: 'run.complete', chatId: 'chat-a', runId: 'run-a', timestamp: Date.now() });
  h.render(false);
  expect(mockStartQuery).not.toHaveBeenCalled();
  h.setState({ chatTransition: readyTransition });
  await act(async () => { h.render(false); });
  expect(mockStartQuery).toHaveBeenCalledTimes(1);
  expect(mockStartQuery).toHaveBeenLastCalledWith(expect.objectContaining({ message: 'message from A', chatId: 'chat-a' }));
  h.render(true);
  expect(h.stateRef.current.pendingSteers['chat-a']).toHaveLength(1);
  await act(async () => { completions[0](); });
  await act(async () => { h.render(false); });
  expect(mockStartQuery).toHaveBeenCalledTimes(2);
  expect(mockStartQuery).toHaveBeenLastCalledWith(expect.objectContaining({ message: 'second message', chatId: 'chat-a' }));
  expect(h.stateRef.current.pendingSteers['chat-a']).toBeUndefined();
  await act(async () => { completions[1](); });
});
