import type { TimelineNode } from '@/app/state/types';
import type { AgentSkill } from '@/shared/data';
import { isDebugPanelEnabled, isMemoryEnabled, isSettingsMenuEnabled, isVoiceEnabled } from '@/shared/config/featureFlags';
import { t } from '@/shared/i18n';
import type { MaterialIconName } from '@/shared/ui/MaterialIcon';

export type SlashCommandId =
  | 'btw'
  | 'remember'
  | 'learn'
  | 'compact'
  | 'new'
  | 'debug'
  | 'voice'
  | 'settings'
  | 'plan'
  | 'editing'
  | 'automation'
  | 'history'
  | 'usage';

export interface SlashCommandDefinition {
  id: SlashCommandId;
  icon: MaterialIconName;
  command: `/${string}`;
  labelKey: string;
  descriptionKey: string;
  keywords: string[];
}

export interface ResolvedSlashCommandDefinition extends SlashCommandDefinition {
  kind: 'command';
  label: string;
  description: string;
}

export interface ResolvedSlashSkillDefinition extends AgentSkill {
  kind: 'skill';
  command: `/${string}`;
  label: string;
}

export type SlashPaletteItem =
  | ResolvedSlashCommandDefinition
  | ResolvedSlashSkillDefinition;

export interface SlashCommandAvailability {
  streaming: boolean;
  hasLatestQuery: boolean;
  isFrontendActive: boolean;
  canUsePlanningMode: boolean;
  canUseEditingMode?: boolean;
  canUseVoiceMode: boolean;
  hasActiveChat: boolean;
  hasCurrentWorker: boolean;
  workerHistoryCount: number;
  commandOverlayOpen: boolean;
  canShowUsage: boolean;
}

export interface SlashCommandFilterOptions {
  canUsePlanningMode?: boolean;
  canUseEditingMode?: boolean;
}

export const SLASH_COMMANDS: SlashCommandDefinition[] = [
  {
    id: 'btw',
    icon: 'question_answer',
    command: '/btw',
    labelKey: 'slash.command.btw.label',
    descriptionKey: 'slash.command.btw.description',
    keywords: ['btw', 'side', 'aside', 'quick question'],
  },
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
    command: '/call',
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
    id: 'usage',
    icon: 'bar_chart',
    command: '/usage',
    labelKey: 'slash.command.usage.label',
    descriptionKey: 'slash.command.usage.description',
    keywords: ['usage', 'tokens', 'cost', 'token', 'spend'],
  },
  {
    id: 'plan',
    icon: 'checklist',
    command: '/planning',
    labelKey: 'slash.command.plan.label',
    descriptionKey: 'slash.command.plan.description',
    keywords: ['plan'],
  },
  {
    id: 'editing',
    icon: 'edit_square',
    command: '/editing',
    labelKey: 'slash.command.editing.label',
    descriptionKey: 'slash.command.editing.description',
    keywords: ['editing', 'edit', 'kbase', 'knowledge base'],
  },
];

function resolveSlashCommand(command: SlashCommandDefinition): ResolvedSlashCommandDefinition {
  return {
    ...command,
    kind: 'command',
    label: t(command.labelKey),
    description: t(command.descriptionKey),
  };
}

export function getFilteredSlashSkills(
  filterText: string,
  skills: AgentSkill[],
): ResolvedSlashSkillDefinition[] {
  if (!Array.isArray(skills)) {
    return [];
  }
  const query = filterText.trim().toLowerCase();
  return skills.flatMap((skill) => {
    const key = String(skill?.key || '').trim();
    const name = String(skill?.name || '').trim();
    const description = String(skill?.description || '').trim();
    if (!key) {
      return [];
    }
    const resolved: ResolvedSlashSkillDefinition = {
      kind: 'skill',
      key,
      name: name || key,
      label: name || key,
      description,
      agentHasSkill: skill.agentHasSkill === true,
      command: `/${key}`,
    };
    if (!query) {
      return [resolved];
    }
    const haystack = [key, name, description].join(' ').toLowerCase();
    return haystack.includes(query) ? [resolved] : [];
  });
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
  if (commandId === 'remember' || commandId === 'learn') {
    return isMemoryEnabled();
  }
  return true;
}

export function shouldShowSlashCommandPalette(input: string): boolean {
  return /^\/\S*$/.test(String(input || ''));
}

export function getFilteredSlashCommands(
  filterText: string,
  options: SlashCommandFilterOptions = {},
): ResolvedSlashCommandDefinition[] {
  const query = filterText.trim().toLowerCase();
  const commands = SLASH_COMMANDS
    .filter((command) => isSlashCommandFeatureEnabled(command.id))
    .filter((command) => command.id !== 'plan' || options.canUsePlanningMode === true)
    .filter((command) => command.id !== 'editing' || options.canUseEditingMode === true)
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
  if (commandId === 'btw') {
    return !availability.hasActiveChat || availability.commandOverlayOpen;
  }
  if (commandId === 'remember' || commandId === 'learn' || commandId === 'compact') {
    return availability.streaming || !availability.hasActiveChat || availability.commandOverlayOpen;
  }
  if (commandId === 'voice') {
    return availability.streaming || !availability.canUseVoiceMode || availability.isFrontendActive;
  }
  if (commandId === 'plan') {
    return !availability.canUsePlanningMode;
  }
  if (commandId === 'editing') {
    return availability.streaming || availability.canUseEditingMode !== true;
  }
  if (commandId === 'automation') {
    return !availability.hasCurrentWorker || availability.commandOverlayOpen;
  }
  if (commandId === 'history') {
    return !availability.hasCurrentWorker || availability.commandOverlayOpen;
  }
  if (commandId === 'usage') {
    return !availability.canShowUsage;
  }
  return false;
}

export function parseBTWSlashInput(input: string): string | null {
  const match = String(input || "").match(/^\/btw(?:\s+([\s\S]*))?$/i);
  if (!match) return null;
  return String(match[1] || "").trim();
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
