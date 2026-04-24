import type { TimelineNode } from '@/app/state/types';
import { t } from '@/shared/i18n';

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
  labelKey: string;
  descriptionKey: string;
  keywords: string[];
}

export interface ResolvedSlashCommandDefinition extends SlashCommandDefinition {
  label: string;
  description: string;
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
    labelKey: 'slash.command.new.label',
    descriptionKey: 'slash.command.new.description',
    keywords: ['new', 'chat', 'reset', 'clear'],
  },
  {
    id: 'history',
    command: '/history',
    labelKey: 'slash.command.history.label',
    descriptionKey: 'slash.command.history.description',
    keywords: ['history', 'chat', 'conversation', 'recent'],
  },
  {
    id: 'remember',
    command: '/remember',
    labelKey: 'slash.command.remember.label',
    descriptionKey: 'slash.command.remember.description',
    keywords: ['remember', 'memory', 'preference', 'fact'],
  },
  {
    id: 'learn',
    command: '/learn',
    labelKey: 'slash.command.learn.label',
    descriptionKey: 'slash.command.learn.description',
    keywords: ['learn', 'lesson', 'rule', 'practice'],
  },
  {
    id: 'schedule',
    command: '/schedule',
    labelKey: 'slash.command.schedule.label',
    descriptionKey: 'slash.command.schedule.description',
    keywords: ['schedule', 'task', 'plan', 'cron'],
  },
  {
    id: 'detail',
    command: '/detail',
    labelKey: 'slash.command.detail.label',
    descriptionKey: 'slash.command.detail.description',
    keywords: ['detail', 'profile', 'info', 'agent'],
  },
  {
    id: 'switch',
    command: '/switch',
    labelKey: 'slash.command.switch.label',
    descriptionKey: 'slash.command.switch.description',
    keywords: ['switch', 'worker', 'agent', 'team'],
  },
  {
    id: 'redo',
    command: '/redo',
    labelKey: 'slash.command.redo.label',
    descriptionKey: 'slash.command.redo.description',
    keywords: ['redo', 'retry', 'resend', 'again'],
  },
  {
    id: 'debug',
    command: '/debug',
    labelKey: 'slash.command.debug.label',
    descriptionKey: 'slash.command.debug.description',
    keywords: ['debug', 'panel', 'logs', 'events'],
  },
  {
    id: 'voice',
    command: '/voice',
    labelKey: 'slash.command.voice.label',
    descriptionKey: 'slash.command.voice.description',
    keywords: ['voice', 'speech', 'call', 'mic'],
  },
  {
    id: 'settings',
    command: '/settings',
    labelKey: 'slash.command.settings.label',
    descriptionKey: 'slash.command.settings.description',
    keywords: ['settings', 'config', 'preferences'],
  },
  {
    id: 'plan',
    command: '/plan',
    labelKey: 'slash.command.plan.label',
    descriptionKey: 'slash.command.plan.description',
    keywords: ['plan', 'planning'],
  },
  {
    id: 'stop',
    command: '/stop',
    labelKey: 'slash.command.stop.label',
    descriptionKey: 'slash.command.stop.description',
    keywords: ['stop', 'interrupt', 'abort', 'cancel'],
  },
];

function resolveSlashCommand(command: SlashCommandDefinition): ResolvedSlashCommandDefinition {
  return {
    ...command,
    label: t(command.labelKey),
    description: t(command.descriptionKey),
  };
}

export function shouldShowSlashCommandPalette(input: string): boolean {
  return /^\/\S*$/.test(String(input || ''));
}

export function getFilteredSlashCommands(input: string): ResolvedSlashCommandDefinition[] {
  if (!shouldShowSlashCommandPalette(input)) {
    return [];
  }
  const query = String(input || '').slice(1).trim().toLowerCase();
  const commands = SLASH_COMMANDS.map(resolveSlashCommand);
  if (!query) return commands;

  return commands.filter((command) => {
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
