const when = 1789027200000;
const source = { kind: 'file', path: '/demo/config.yml' };
const agent = { key: 'demo', name: '旅行助手', description: '规划行程、整理资料，协助完成日常工作。', mode: 'REACT', status: 'ready', icon: 'smart_toy', source };
const skill = { id: 'demo', name: '行程规划', description: '根据目的地整理路线、天气与出行清单。', status: 'ready', source: { kind: 'skills-center', path: '/demo/skills/travel' }, updatedAt: when };
const content = '# 行程规划\n\n根据用户的目的地，整理一份清晰的出行计划。\n\n## 工作步骤\n\n1. 确认出行日期与目的地\n2. 查询天气和交通\n3. 整理每日行程与注意事项\n';
const openedFile = { path: 'SKILL.md', content, sha256: 'demo-sha', size: 256, encoding: 'utf-8', updatedAt: when };
const yaml = 'key: demo\nicon: default\nbaseUrl: https://api.example.com\ndefaultModel: demo-model\nprotocols:\n  OPENAI:\n    endpointPath: /v1/chat/completions\n    compat:\n      messages:\n        developerRole: true\n      response:\n        usage:\n          promptTokensDetails:\n            cachedTokens: true\n';
const connector = { id: 'demo', name: '出行资料', description: '查询目的地资料与旅行信息。', version: '1.0.0', type: 'cli', auth_mode: 'none', hasCli: true, hasMcp: false, hasBin: false, skills: [], mcp: [] };
const webConnector = { ...connector, id: 'builtin.web-control', name: 'Web control', description: 'Browse websites and interact with connected pages.', type: 'native', hasCli: false, hasNative: true, nativeTools: ['awcp_manual', 'awcp_invoke'], builtin: true };
const taskConnector = { ...webConnector, id: 'builtin.task-control', name: 'Task control', description: 'Manage conversations and scheduled tasks.', nativeTools: ['chat_query', 'chat_manage', 'automation_query', 'automation_manage'] };
const toolCatalog = [
  ['awcp_manual', 'Website manual'], ['awcp_invoke', 'Run website action'], ['chat_query', 'Find conversations'], ['chat_manage', 'Manage conversations'], ['automation_query', 'Find automations'], ['automation_manage', 'Manage automations'], ['datetime', 'Date and time'], ['run_env', 'Run environment'], ['file_read', 'Read file'],
].map(([key, label]) => ({ key, name: key, label, description: 'Available to the agent through its configured capabilities.', kind: 'builtin', sourceCategory: 'platform', sourceType: 'builtin' }));
const toolBindings = toolCatalog.map(tool => ({ name: tool.key, source: tool.key === 'datetime' ? 'preset' : tool.key === 'run_env' ? 'runtime' : tool.key === 'file_read' ? 'agent' : 'connector', active: true, excluded: false, removable: tool.key === 'file_read' }));
const archive = { chatId: 'demo', chatName: '周末山湖旅行计划', agentKey: 'demo', createdAt: when, lastRunAt: when, archivedAt: when, updatedAt: when, hasAttachments: false };
module.exports = function fixture(path, query) {
  if (path.endsWith('/order')) return { order: [] };
  if (path === '/api/admin/agents' || path === '/api/agents') return [agent, { ...agent, key: 'second', name: '文档助手' }];
  if (path === '/api/admin/agents/editor-options') return { modes: [{key:'REACT',label:'REACT'}], models: [{key:'demo-model',label:'Demo model'}], tools: [], skills: [] };
  if (path === '/api/admin/agent') return { ...agent, toolBindings, connectorBindings: { agentKey: query.agentKey, presetConnectorIds: ['builtin.web-control'], declaredConnectorIds: ['builtin.task-control', 'demo'], connectorIds: ['builtin.web-control', 'builtin.task-control', 'demo'], activeConnectorIds: ['builtin.web-control', 'builtin.task-control', 'demo'], reloadPending: false }, definition: { ...agent, modelConfig: { modelKey: 'demo-model' }, toolConfig: { tools: ['file_read'] }, prompt: '帮助用户整理行程，清晰地说明每个步骤。', tools: [], skills: ['demo'] }, privateSkills: [], diagnostics: [] };
  if (path === '/api/admin/skills') return { skills: [skill, { ...skill, id: 'second', name: '资料整理' }], packages: [], pinned: [] };
  if (path === '/api/admin/skills/detail') return { skill, capabilities: { maxTextBytes: 1048576, maxUploadBytes: 33554432, canCreate: true, canUpload: true, canEdit: true }, fileManifest: { defaultOpenPath: 'SKILL.md', counts: { files: 1, directories: 0, textFiles: 1, binaryFiles: 0, totalSize: 256 }, entries: [{ path: 'SKILL.md', name: 'SKILL.md', kind: 'file', parentPath: '', depth: 0, order: 0, size: 256, sha256: 'demo-sha', contentKind: 'text', language: 'markdown', role: 'skillMd', editable: true, downloadable: true }] }, openedFile };
  if (path === '/api/admin/registries') return { items: ['demo', 'backup'].map(key => ({ category: 'providers', file: key + '.yml', key, name: key, status: 'ready', summary: { baseUrl: 'https://api.example.com', defaultModel: 'demo-model' }, source })) };
  if (path === '/api/admin/source') return { target: query, source, content: query.type === 'skill' ? content : yaml, encoding: 'utf-8', sha256: 'demo-sha', updatedAt: when, size: 512 };
  if (path === '/api/admin/tools') return toolCatalog.filter(tool => !webConnector.nativeTools.includes(tool.key) && !taskConnector.nativeTools.includes(tool.key));
  if (path === '/api/admin/agents/connectors') return { agentKey: query.agentKey, presetConnectorIds: ['builtin.web-control'], declaredConnectorIds: ['builtin.task-control', 'demo'], connectorIds: ['builtin.web-control', 'builtin.task-control', 'demo'], activeConnectorIds: ['builtin.web-control', 'builtin.task-control', 'demo'], reloadPending: false };
  if (path === '/api/admin/connectors') return { connectors: [{...webConnector, tools: toolCatalog.filter(tool => webConnector.nativeTools.includes(tool.key))}, {...taskConnector, tools: toolCatalog.filter(tool => taskConnector.nativeTools.includes(tool.key))}, connector, { ...connector, id: 'second', name: '文档工具' }] };
  if (path === '/api/admin/connectors/detail') return { id: query.id, file: query.file, sha256: 'demo-sha', content: JSON.stringify(query.file === 'connector.json' ? connector : { command: 'travel', description: '查询目的地信息', args: ['--format', 'json'], timeout: 30000 }, null, 2) };
  if (path === '/api/archives') return { items: [archive, { ...archive, chatId: 'second', chatName: '行前准备清单' }], total: 2 };
  if (path === '/api/archive') return { ...archive, runs: [{ initialMessage: '帮我安排两天的山湖旅行。', assistantText: '第一天：沿湖散步，欣赏森林和山景。\n第二天：选择一条适合体力的徒步路线，留出返程时间。\n\n携带饮水、防晒用品，并提前确认天气。' }] };
  return {};
};
