import type { TimelineNode } from '@/app/state/types';
import { isDebugPanelEnabled, isSettingsMenuEnabled, isVoiceEnabled } from '@/shared/config/featureFlags';
import { t } from '@/shared/i18n';

export type SlashCommandId =
  | 'remember'
  | 'learn'
  | 'compact'
  | 'new'
  | 'redo'
  | 'debug'
  | 'voice'
  | 'settings'
  | 'plan'
  | 'automation'
  | 'detail'
  | 'history'
  | 'switch';

export interface SlashCommandDefinition {
  id: SlashCommandId;
  icon: string;
  command: `/${string}`;
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

export interface SlashCommandFilterOptions {
  canUsePlanningMode?: boolean;
}

export const SLASH_COMMANDS: SlashCommandDefinition[] = [
  {
    id: 'new',
    icon: 'edit_square',
    command: '/new',
    labelKey: 'slash.command.new.label',
    descriptionKey: 'slash.command.new.description',
    keywords: ['new', 'chat', 'reset', 'clear'],
  },
  {
    id: 'history',
    icon: 'history',
    command: '/history',
    labelKey: 'slash.command.history.label',
    descriptionKey: 'slash.command.history.description',
    keywords: ['history', 'chat', 'conversation', 'recent'],
  },
  {
    id: 'remember',
    icon: 'psychology',
    command: '/remember',
    labelKey: 'slash.command.remember.label',
    descriptionKey: 'slash.command.remember.description',
    keywords: ['remember', 'memory', 'preference', 'fact'],
  },
  {
    id: 'learn',  
    icon: 'book_2',
    command: '/learn',
    labelKey: 'slash.command.learn.label',
    descriptionKey: 'slash.command.learn.description',
    keywords: ['learn', 'lesson', 'rule', 'practice'],
  },
  {
    id: 'compact',
    icon: 'compress',
    command: '/compact',
    labelKey: 'slash.command.compact.label',
    descriptionKey: 'slash.command.compact.description',
    keywords: ['compact', 'context', 'summary', 'compress'],
  },
  {
    id: 'automation',
    icon: 'schedule',
    command: '/automation',
    labelKey: 'slash.command.automation.label',
    descriptionKey: 'slash.command.automation.description',
    keywords: ['automation', 'task', 'cron'],
  },
  {
    id: 'detail',
    icon: 'conditions',
    command: '/detail',
    labelKey: 'slash.command.detail.label',
    descriptionKey: 'slash.command.detail.description',
    keywords: ['detail', 'profile', 'info', 'agent'],
  },
  {
    id: 'switch',
    icon: 'sync_alt',
    command: '/switch',
    labelKey: 'slash.command.switch.label',
    descriptionKey: 'slash.command.switch.description',
    keywords: ['switch', 'worker', 'agent', 'team'],
  },
  {
    id: 'redo',
    icon: 'redo',
    command: '/redo',
    labelKey: 'slash.command.redo.label',
    descriptionKey: 'slash.command.redo.description',
    keywords: ['redo', 'retry', 'resend', 'again'],
  },
  {
    id: 'debug',
    icon: 'bug_report',
    command: '/debug',
    labelKey: 'slash.command.debug.label',
    descriptionKey: 'slash.command.debug.description',
    keywords: ['debug', 'panel', 'logs', 'events'],
  },
  {
    id: 'voice',  
    icon: 'volume_up',
    command: '/voice',
    labelKey: 'slash.command.voice.label',
    descriptionKey: 'slash.command.voice.description',
    keywords: ['voice', 'speech', 'call', 'mic'],
  },
  {
    id: 'settings',  
    icon: 'settings',
    command: '/settings',
    labelKey: 'slash.command.settings.label',
    descriptionKey: 'slash.command.settings.description',
    keywords: ['settings', 'config', 'preferences'],
  },
  {
    id: 'plan',
    icon: 'checklist',
    command: '/plan',
    labelKey: 'slash.command.plan.label',
    descriptionKey: 'slash.command.plan.description',
    keywords: ['plan'],
  },
];

function resolveSlashCommand(command: SlashCommandDefinition): ResolvedSlashCommandDefinition {
  return {
    ...command,
    label: t(command.labelKey),
    description: t(command.descriptionKey),
  };
}

export function isSlashCommandFeatureEnabled(commandId: SlashCommandId): boolean {
  if (commandId === 'debug') {
    return isDebugPanelEnabled();
  }
  if (commandId === 'settings') {
    return isSettingsMenuEnabled();
  }
  if (commandId === 'voice') {
    return isVoiceEnabled();
  }
  return true;
}

export function shouldShowSlashCommandPalette(input: string): boolean {
  return /^\/\S*$/.test(String(input || ''));
}

export function getFilteredSlashCommands(
  input: string,
  options: SlashCommandFilterOptions = {},
): ResolvedSlashCommandDefinition[] {
  if (!shouldShowSlashCommandPalette(input)) {
    return [];
  }
  const query = String(input || '').slice(1).trim().toLowerCase();
  const commands = SLASH_COMMANDS
    .filter((command) => isSlashCommandFeatureEnabled(command.id))
    .filter((command) => command.id !== 'plan' || options.canUsePlanningMode === true)
    .map(resolveSlashCommand);
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
  if (commandId === 'remember' || commandId === 'learn' || commandId === 'compact') {
    return availability.streaming || !availability.hasActiveChat || availability.commandModalOpen;
  }
  if (commandId === 'voice') {
    return availability.streaming || !availability.canUseVoiceMode || availability.isFrontendActive;
  }
  if (commandId === 'automation' || commandId === 'detail') {
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
              && node.messageVariant !== 'compact'
    ) {
      return String(node.text || '').trim();
    }
  }
  return '';
}
