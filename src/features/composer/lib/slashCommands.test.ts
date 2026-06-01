import type { TimelineNode } from '@/app/state/types';
import {
  SLASH_COMMANDS,
  getFilteredSlashCommands,
  getLatestQueryText,
  isSlashCommandDisabled,
  shouldShowSlashCommandPalette,
} from '@/features/composer/lib/slashCommands';

function createNode(partial: Partial<TimelineNode> & Pick<TimelineNode, 'id' | 'kind' | 'ts'>): TimelineNode {
  return partial as TimelineNode;
}

const globalWithFeatureFlags = globalThis as typeof globalThis & {
  __AGENT_WEBCLIENT_RUNTIME_CONFIG__?: Record<string, unknown>;
};

describe('slashCommands', () => {
  beforeEach(() => {
    globalWithFeatureFlags.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = {
      VOICE_ENABLED: 'true',
    };
  });

  it('only opens for a standalone slash token', () => {
    expect(shouldShowSlashCommandPalette('/')).toBe(true);
    expect(shouldShowSlashCommandPalette('/re')).toBe(true);
    expect(shouldShowSlashCommandPalette('/redo now')).toBe(false);
    expect(shouldShowSlashCommandPalette('hello /redo')).toBe(false);
  });

  it('filters the command list by slash query', () => {
    expect(getFilteredSlashCommands('/').length).toBeGreaterThanOrEqual(10);
    expect(getFilteredSlashCommands('/vo').map((item) => item.id)).toEqual(['voice']);
    expect(getFilteredSlashCommands('/his').map((item) => item.id)).toEqual(['history']);
    expect(getFilteredSlashCommands('/agents')).toEqual([]);
    expect(getFilteredSlashCommands('/rem').map((item) => item.id)).toEqual(['remember']);
    expect(getFilteredSlashCommands('/remote')).toEqual([]);
    expect(getFilteredSlashCommands('/learn').map((item) => item.id)).toEqual(['learn']);
    expect(getFilteredSlashCommands('/compact').map((item) => item.id)).toEqual(['compact']);
  });

  it('shows planning as /planning only when planning mode is available', () => {
    expect(getFilteredSlashCommands('/planning')).toEqual([]);
    expect(getFilteredSlashCommands('/plan', { canUsePlanningMode: false })).toEqual([]);

    expect(getFilteredSlashCommands('/planning', { canUsePlanningMode: true })).toMatchObject([
      { id: 'plan', command: '/planning' },
    ]);
    expect(getFilteredSlashCommands('/plan', { canUsePlanningMode: true })).toMatchObject([
      { id: 'plan', command: '/planning' },
    ]);
    expect(getFilteredSlashCommands('/', { canUsePlanningMode: true }).find((item) => item.id === 'plan')).toMatchObject({
      command: '/planning',
    });
  });

  it('filters debug and settings commands by feature flags', () => {
    expect(getFilteredSlashCommands('/debug')).toEqual([]);
    expect(getFilteredSlashCommands('/settings')).toEqual([]);

    globalWithFeatureFlags.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = {
      DEBUG_PANEL_ENABLED: 'true',
      VOICE_ENABLED: 'true',
    };
    expect(getFilteredSlashCommands('/debug').map((item) => item.id)).toEqual(['debug']);
    expect(getFilteredSlashCommands('/settings')).toEqual([]);

    globalWithFeatureFlags.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = {
      DEBUG_PANEL_ENABLED: 'true',
      SETTINGS_MENU_ENABLED: 'true',
      VOICE_ENABLED: 'true',
    };
    expect(getFilteredSlashCommands('/settings').map((item) => item.id)).toEqual(['settings']);
  });

  it('filters the voice command by the voice runtime flag', () => {
    globalWithFeatureFlags.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = {
      VOICE_ENABLED: 'false',
    };
    expect(getFilteredSlashCommands('/voice')).toEqual([]);
  });

  it('uses 对话 wording for the new command', () => {
    expect(SLASH_COMMANDS.find((item) => item.id === 'new')).toMatchObject({
      labelKey: 'slash.command.new.label',
      descriptionKey: 'slash.command.new.description',
    });
    expect(getFilteredSlashCommands('/new')[0]).toMatchObject({
      label: '新会话',
      description: '清空当前会话上下文，保留当前 worker 选择',
    });
    expect(getFilteredSlashCommands('/voice')[0]).toMatchObject({
      description: '在文字输入与一问一答语聊模式之间切换',
    });
  });

  it('disables commands according to current availability', () => {
    const availability = {
      streaming: true,
      hasLatestQuery: false,
      isFrontendActive: true,
      canUseVoiceMode: false,
      hasActiveChat: false,
      hasCurrentWorker: false,
      workerHistoryCount: 0,
      workerCount: 0,
      commandModalOpen: false,
    };

    expect(isSlashCommandDisabled('redo', availability)).toBe(true);
    expect(isSlashCommandDisabled('remember', availability)).toBe(true);
    expect(isSlashCommandDisabled('learn', availability)).toBe(true);
    expect(isSlashCommandDisabled('compact', availability)).toBe(true);
    expect(isSlashCommandDisabled('voice', availability)).toBe(true);
    expect(isSlashCommandDisabled('settings', availability)).toBe(false);
    expect(isSlashCommandDisabled('detail', availability)).toBe(true);
    expect(isSlashCommandDisabled('switch', availability)).toBe(true);
  });

  it('finds the most recent user query from timeline nodes', () => {
    const nodes: TimelineNode[] = [
      createNode({ id: 'user_1', kind: 'message', role: 'user', text: 'first', ts: 100 }),
      createNode({ id: 'remember_1', kind: 'message', role: 'user', messageVariant: 'remember', text: '记住这个偏好', ts: 110 }),
      createNode({ id: 'content_1', kind: 'content', text: 'answer', ts: 110 }),
      createNode({ id: 'user_2', kind: 'message', role: 'user', text: 'latest', ts: 120 }),
    ];

    expect(getLatestQueryText(nodes)).toBe('latest');
  });
});
