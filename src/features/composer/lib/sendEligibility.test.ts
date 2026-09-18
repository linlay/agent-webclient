import { hasQueryHistory, hasSendableContent } from './sendEligibility';
it.each(['photo.png', 'page.html', 'notes.md'])('allows %s alone for steer or follow-up query', url => {
 const refs = [{type:'file', url}];
 expect(hasSendableContent(' ',refs)).toBe(false);
 expect(hasSendableContent('',refs,true)).toBe(true);
 expect(hasSendableContent('read this',refs)).toBe(true);
});
it('rejects empty or unresolved steer content', () => {
 for (const refs of [[],[{}],[{type:'file',url:' '}],[{type:'site',url:'https://example.com'}]]) {
  expect(hasSendableContent(' ',refs,true)).toBe(false);
 }
});

it('allows nonempty selected text alone for steer or follow-up query', () => {
  const refs = [{ type: 'selection', text: 'selected passage' }];
  expect(hasSendableContent('', refs, true)).toBe(true);
  expect(hasSendableContent('', refs)).toBe(false);
  for (const meta of [undefined, {}, { text: 'old quote' }, { text: '' }, { text: '  ' }, { text: 123 }]) {
    expect(hasSendableContent('', [{ type: 'selection', meta }], true)).toBe(false);
  }
});

it('requires confirmed main-chat history, not an allocated chat or optimistic run', () => {
  const state = { chatId: 'a', chats: [{ chatId: 'a' }], events: [] as any[] };
  expect(hasQueryHistory(state)).toBe(false);
  for (const event of [
    { type: 'run.start', chatId: 'a' },
    { type: 'request.query', chatId: 'b' },
    { type: 'request.query', chatId: 'a', lane: 'btw' },
    { type: 'request.query', chatId: 'a', lane: 'explain' },
    { type: 'request.query', chatId: 'a', hidden: true },
  ]) {
    expect(hasQueryHistory({ ...state, events: [event] })).toBe(false);
  }
  const confirmed = { ...state, events: [{ type: 'request.query', chatId: 'a' }] };
  expect(hasQueryHistory(confirmed)).toBe(true);
  expect(hasQueryHistory(confirmed, 'b')).toBe(false);
  expect(hasQueryHistory({ ...state, chats: [{ chatId: 'a', lastRunId: 'accepted-run' }] })).toBe(true);
  expect(hasQueryHistory({ ...state, chatId: '', chats: [] })).toBe(false);
});
