import { hasSendableContent } from './sendEligibility';
it.each(['photo.png', 'page.html', 'notes.md'])('allows %s alone only for steer', url => {
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

it('allows nonempty selected text alone only for steer', () => {
  const refs = [{ type: 'selection', meta: { text: 'selected passage' } }];
  expect(hasSendableContent('', refs, true)).toBe(true);
  expect(hasSendableContent('', refs)).toBe(false);
  for (const meta of [undefined, {}, { text: '' }, { text: '  ' }, { text: 123 }]) {
    expect(hasSendableContent('', [{ type: 'selection', meta }], true)).toBe(false);
  }
});
