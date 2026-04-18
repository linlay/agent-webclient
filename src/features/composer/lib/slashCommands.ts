import type { TimelineNode } from '@/app/state/types';

export type SlashCommandId =
  | 'remember'
  | 'learn'
  | 'new'
  | 'redo'
  | 'debug'
  | 'voice'
  | 'settings'
  | 'plan'
  | 'stop'
  | 'schedule'
  | 'detail'
  | 'history'
  | 'switch';

export interface SlashCommandDefinition {
  id: SlashCommandId;
  command: `/${SlashCommandId}`;
  label: string;
  description: string;
  keywords: string[];
}

export interface SlashCommandAvailability {
  streaming: boolean;
  hasLatestQuery: boolean;
  isFrontendActive: boolean;
  canUseVoiceMode: boolean;
  hasActiveChat: boolean;
  hasCurrentWorker: boolean;
  workerHistoryCount: number;
  workerCount: number;
  commandModalOpen: boolean;
}

export const SLASH_COMMANDS: SlashCommandDefinition[] = [
  {
    id: 'new',
    command: '/new',
    label: '新对话',
    description: '清空当前对话上下文，保留当前 worker 选择',
    keywords: ['new', 'chat', 'reset', 'clear'],
  },
  {
    id: 'history',
    command: '/history',
    label: '历史对话',
    description: '查看当前员工或小组的历史会话',
    keywords: ['history', 'chat', 'conversation', 'recent'],
  },
  {
    id: 'remember',
    command: '/remember',
    label: '记录记忆',
    description: '记录长期偏好、事实或约束，并提交给后端记忆接口',
    keywords: ['remember', 'memory', 'preference', 'fact'],
  },
  {
    id: 'learn',
    command: '/learn',
    label: '沉淀学习',
    description: '提炼当前会话经验、规则与做法，并提交给后端学习接口',
    keywords: ['learn', 'lesson', 'rule', 'practice'],
  },
  {
    id: 'schedule',
    command: '/schedule',
    label: '计划任务',
    description: '为当前员工或小组预填计划任务草稿',
    keywords: ['schedule', 'task', 'plan', 'cron'],
  },
  {
    id: 'detail',
    command: '/detail',
    label: '当前详情',
    description: '查看当前员工或小组的模型、技能、工具等信息',
    keywords: ['detail', 'profile', 'info', 'agent'],
  },
  {
    id: 'switch',
    command: '/switch',
    label: '切换员工',
    description: '搜索并切换当前员工或小组',
    keywords: ['switch', 'worker', 'agent', 'team'],
  },
  {
    id: 'redo',
    command: '/redo',
    label: '重发最近 query',
    description: '重新发送当前对话里最近一条 query',
    keywords: ['redo', 'retry', 'resend', 'again'],
  },
  {
    id: 'debug',
    command: '/debug',
    label: '调试面板',
    description: '切换右侧调试面板或抽屉',
    keywords: ['debug', 'panel', 'logs', 'events'],
  },
  {
    id: 'voice',
    command: '/voice',
    label: '语聊模式',
    description: '在文字输入与一问一答语聊模式之间切换',
    keywords: ['voice', 'speech', 'call', 'mic'],
  },
  {
    id: 'settings',
    command: '/settings',
    label: '设置',
    description: '打开设置窗口',
    keywords: ['settings', 'config', 'preferences'],
  },
  {
    id: 'plan',
    command: '/plan',
    label: '计划模式',
    description: '切换 planning mode',
    keywords: ['plan', 'planning'],
  },
  {
    id: 'stop',
    command: '/stop',
    label: '停止运行',
    description: '中断当前 streaming run',
    keywords: ['stop', 'interrupt', 'abort', 'cancel'],
  },
];

export function shouldShowSlashCommandPalette(input: string): boolean {
  return /^\/\S*$/.test(String(input || ''));
}

export function getFilteredSlashCommands(input: string): SlashCommandDefinition[] {
  if (!shouldShowSlashCommandPalette(input)) {
    return [];
  }
  const query = String(input || '').slice(1).trim().toLowerCase();
  if (!query) return SLASH_COMMANDS;

  return SLASH_COMMANDS.filter((command) => {
    const haystack = [
      command.command,
      command.label,
      command.description,
      ...command.keywords,
    ].join(' ').toLowerCase();
    return haystack.includes(query);
  });
}

export function isSlashCommandDisabled(
  commandId: SlashCommandId,
  availability: SlashCommandAvailability,
): boolean {
  if (commandId === 'redo') {
    return availability.streaming || !availability.hasLatestQuery;
  }
  if (commandId === 'remember' || commandId === 'learn') {
    return availability.streaming || !availability.hasActiveChat || availability.commandModalOpen;
  }
  if (commandId === 'voice') {
    return availability.streaming || !availability.canUseVoiceMode || availability.isFrontendActive;
  }
  if (commandId === 'stop') {
    return !availability.streaming;
  }
  if (commandId === 'schedule' || commandId === 'detail') {
    return !availability.hasCurrentWorker || availability.commandModalOpen;
  }
  if (commandId === 'history') {
    return !availability.hasCurrentWorker || availability.commandModalOpen;
  }
  if (commandId === 'switch') {
    return availability.workerCount === 0 || availability.commandModalOpen;
  }
  return false;
}

export function getLatestQueryText(nodes: TimelineNode[]): string {
  for (let i = nodes.length - 1; i >= 0; i -= 1) {
    const node = nodes[i];
    if (
      node.kind === 'message'
      && node.role === 'user'
      && node.messageVariant !== 'steer'
      && node.messageVariant !== 'remember'
      && node.messageVariant !== 'learn'
    ) {
      return String(node.text || '').trim();
    }
  }
  return '';
}
