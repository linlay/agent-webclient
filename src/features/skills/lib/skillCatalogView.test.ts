import { orderSkillCatalogItems } from './skillCatalogView';

test('one list sorts both types by name after a shared package and standalone pin order', () => {
  const items = [
    {kind:'standalone' as const,id:'z',label:'Zulu'},
    {kind:'package' as const,id:'pkg',label:'Bravo'},
    {kind:'standalone' as const,id:'a',label:'Alpha'},
    {kind:'package' as const,id:'a-pack',label:'Able'},
  ];
  expect(orderSkillCatalogItems(items, [], 'en-US').map(x=>x.id)).toEqual(['a-pack','a','pkg','z']);
  expect(orderSkillCatalogItems(items, ['z','a'], 'en-US').map(x=>x.id)).toEqual(['z','a','a-pack','pkg']);
  expect(orderSkillCatalogItems(items, ['pkg','z','a-pack'], 'en-US').map(x=>x.id)).toEqual(['pkg','z','a-pack','a']);
  expect(orderSkillCatalogItems(items, ['z','a-pack','pkg'], 'en-US').map(x=>x.id)).toEqual(['z','a-pack','pkg','a']);
  expect(items.map(x=>x.id)).toEqual(['z','pkg','a','a-pack']);
});

test('pinning a package member does not promote its package or same-name standalone', () => {
  const items = [
    {kind:'standalone' as const,id:'word',label:'Word'},
    {kind:'package' as const,id:'office',label:'Office'},
    {kind:'standalone' as const,id:'alpha',label:'Alpha'},
  ];
  expect(orderSkillCatalogItems(items, ['office/word'], 'en-US').map(x=>x.id)).toEqual(['alpha','office','word']);
  expect(orderSkillCatalogItems(items, ['office/word',' OFFICE '], 'en-US').map(x=>x.id)).toEqual(['office','alpha','word']);
  expect(orderSkillCatalogItems(items, [' WORD '], 'en-US').map(x=>x.id)).toEqual(['word','alpha','office']);
});
