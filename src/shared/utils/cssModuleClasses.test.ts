import { bindCssModuleClasses } from './cssModuleClasses';

it('retains DOM hooks and state classes while adding only matching local styles', () => {
  const classes = bindCssModuleClasses({ card: 'card_hash', selected: 'selected_hash' });
  expect(classes('card is-open tw:flex')).toBe('card is-open tw:flex card_hash');
  expect(classes('card selected')).toBe('card selected card_hash selected_hash');
  expect(classes('unknown')).toBe('unknown');
  expect(classes('')).toBe('');
  expect(bindCssModuleClasses({})('card is-open')).toBe('card is-open');
});
