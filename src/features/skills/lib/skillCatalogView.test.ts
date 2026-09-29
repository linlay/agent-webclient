import { orderSkillCatalogItems } from './skillCatalogView';

test('one list sorts both types by name after a shared package and standalone pin order', () => {
  const items = [
    {kind:'standalone' as const,key:'z',label:'Zulu'},
    {kind:'package' as const,key:'pkg',label:'Bravo'},
    {kind:'standalone' as const,key:'a',label:'Alpha'},
    {kind:'package' as const,key:'a-pack',label:'Able'},
  ];
  expect(orderSkillCatalogItems(items, [], 'en-US').map(x=>x.key)).toEqual(['a-pack','a','pkg','z']);
  expect(orderSkillCatalogItems(items, ['z','a'], 'en-US').map(x=>x.key)).toEqual(['z','a','a-pack','pkg']);
  expect(orderSkillCatalogItems(items, ['pkg','z','a-pack'], 'en-US').map(x=>x.key)).toEqual(['pkg','z','a-pack','a']);
  expect(orderSkillCatalogItems(items, ['z','a-pack','pkg'], 'en-US').map(x=>x.key)).toEqual(['z','a-pack','pkg','a']);
  expect(items.map(x=>x.key)).toEqual(['z','pkg','a','a-pack']);
});

test('pinning a package member does not promote its package or same-name standalone', () => {
  const items = [
    {kind:'standalone' as const,key:'word',label:'Word'},
    {kind:'package' as const,key:'office',label:'Office'},
    {kind:'standalone' as const,key:'alpha',label:'Alpha'},
  ];
  expect(orderSkillCatalogItems(items, ['office/word'], 'en-US').map(x=>x.key)).toEqual(['alpha','office','word']);
  expect(orderSkillCatalogItems(items, ['office/word',' OFFICE '], 'en-US').map(x=>x.key)).toEqual(['office','alpha','word']);
  expect(orderSkillCatalogItems(items, [' WORD '], 'en-US').map(x=>x.key)).toEqual(['word','alpha','office']);
});
