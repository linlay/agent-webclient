const path = require('node:path');
const timestamp = Date.UTC(2026, 10, 16);
const chat = (chatId, agentKey, chatName) => ({ chatId, agentKey, chatName, updatedAt: timestamp, isRead: false, hasActiveRun: false, hasPendingAwaiting: false });
const chats = [chat('mobile-chat', 'demo', '手机端完整导航与会话'), chat('project-chat', 'project', '检查项目布局'), chat('bot-chat', 'bot', '机器人主聊天')];
const interactionConfig = {
  showPlanningMode: true, showEditingMode: true, showTerminal: true,
  model: true, accessLevel: true, connectors: true, defaultDetail: 'detailed',
  attachment: { localFiles: true, chatRecords: true, skills: true, kbases: true },
};
const modelOptions = {
  models: [
    { key: 'demo-model', name: '示例模型', provider: 'demo', serviceTiers: ['STANDARD', 'FAST'] },
    { key: 'long-model', name: '一个名称较长的模型用于验证手机菜单不会溢出屏幕', provider: 'example-provider' },
  ],
  reasoningEfforts: ['NONE', 'LOW', 'MEDIUM', 'HIGH', 'XHIGH', 'MAX'].map(key => ({ key, label: key })),
  serviceTiers: [{ key: 'STANDARD', label: 'Standard' }, { key: 'FAST', label: 'Fast' }],
};
const agents = [
  { key: 'demo', name: '旅行助手', mode: 'GENERAL', interactionConfig, chats: [chats[0]] },
  { key: 'project', name: '示例项目', mode: 'CODER', workspaceDir: '/demo/project', interactionConfig, chats: [chats[1]] },
  { key: 'bot', name: '任务机器人', mode: 'BOT', primaryChat: chats[2], chats: [] },
].map(agent => ({ ...agent, modelKey: 'demo-model', reasoningEffort: 'HIGH', modelOptions, status: 'ready', stats: { totalCount: agent.chats.length, unreadCount: 1 } }));

module.exports = (env, argv) => {
  const config = require('./webpack.management.cjs')(env, argv);
  config.entry = './src/app/index.tsx';
  config.output.path = path.resolve(__dirname, '../build/mobile');
  config.resolve.alias['@/shared/data/api/routedClient$'] = path.join(__dirname, 'mobile-routed.ts');
  delete config.resolve.alias['@/features/transport/hooks/useRealtimeTransport$'];
  config.devServer.port = Number(process.env.PORT || 11972);
  const setup = config.devServer.setupMiddlewares;
  config.devServer.setupMiddlewares = (middlewares, server) => {
    server.app.get('/runtime-config.js', (_req, res) => res.type('js').send('globalThis.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = { SETTINGS_MENU_ENABLED: true, QUICK_ACTIONS_ENABLED: true, DEBUG_PANEL_ENABLED: true };'));
    server.app.use('/api', (req, res, next) => {
      const pathname = '/api' + req.path;
      let data;
      if (pathname === '/api/agents') data = agents;
      if (pathname === '/api/agent') data = agents.find(agent => agent.key === req.query.agentKey) || agents[0];
      if (pathname === '/api/model-options') data = modelOptions;
      if (pathname === '/api/agents/order') data = { order: agents.map(agent => agent.key) };
      if (pathname === '/api/chats') data = req.query.pinned === 'true' ? [chats[0]] : chats.filter(chat => chat.agentKey === req.query.agentKey || !req.query.agentKey);
      if (pathname === '/api/chats/order') data = { sortMode: 'recent', pinnedOrder: ['mobile-chat'], pinnedChats: [{ ...chats[0], pinned: true }] };
      if (pathname === '/api/chat') {
        const item = chats.find(chat => chat.chatId === req.query.chatId) || chats[0];
        data = { ...item, canContinue: true, events: [
          { seq: 1, type: 'request.query', chatId: item.chatId, agentKey: item.agentKey, requestId: 'req-mobile', message: '请检查移动端的完整功能。', timestamp },
          { seq: 2, type: 'run.start', chatId: item.chatId, agentKey: item.agentKey, runId: 'run-mobile', timestamp: timestamp + 1000 },
          { seq: 3, type: 'content.snapshot', chatId: item.chatId, agentKey: item.agentKey, runId: 'run-mobile', contentId: 'content-mobile', text: '已经保留侧栏、项目、历史、管理与运行交互。\n\n打开导航或内容面板后，返回这里继续输入。', timestamp: timestamp + 2000 },
          { seq: 4, type: 'run.complete', chatId: item.chatId, agentKey: item.agentKey, runId: 'run-mobile', timestamp: timestamp + 3000 },
        ] };
      }
      if (data === undefined) return next();
      res.json({ code: 0, msg: '', data });
    });
    return setup(middlewares, server);
  };
  return config;
};
