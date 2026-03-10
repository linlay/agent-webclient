import type { TimelineNode } from '../context/types';

export type SlashCommandId =
  | 'new'
  | 'redo'
  | 'debug'
  | 'voice'
  | 'settings'
  | 'plan'
  | 'stop';

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
  speechSupported: boolean;
  isFrontendActive: boolean;
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
    label: '语音输入',
    description: '开始或停止语音听写',
    keywords: ['voice', 'speech', 'mic'],
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
  if (commandId === 'voice') {
    return !availability.speechSupported || availability.isFrontendActive;
  }
  if (commandId === 'stop') {
    return !availability.streaming;
  }
  return false;
}

export function getLatestQueryText(nodes: TimelineNode[]): string {
  for (let i = nodes.length - 1; i >= 0; i -= 1) {
    const node = nodes[i];
    if (node.kind === 'message' && node.role === 'user') {
      return String(node.text || '').trim();
    }
  }
  return '';
}
