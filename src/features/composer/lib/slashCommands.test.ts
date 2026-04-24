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

describe('slashCommands', () => {
  it('only opens for a standalone slash token', () => {
    expect(shouldShowSlashCommandPalette('/')).toBe(true);
    expect(shouldShowSlashCommandPalette('/re')).toBe(true);
    expect(shouldShowSlashCommandPalette('/redo now')).toBe(false);
    expect(shouldShowSlashCommandPalette('hello /redo')).toBe(false);
  });

  it('filters the command list by slash query', () => {
    expect(getFilteredSlashCommands('/').length).toBeGreaterThanOrEqual(13);
    expect(getFilteredSlashCommands('/vo').map((item) => item.id)).toEqual(['voice']);
    expect(getFilteredSlashCommands('/his').map((item) => item.id)).toEqual(['history']);
    expect(getFilteredSlashCommands('/rem').map((item) => item.id)).toEqual(['remember']);
    expect(getFilteredSlashCommands('/learn').map((item) => item.id)).toEqual(['learn']);
  });

  it('uses 对话 wording for the new command', () => {
    expect(SLASH_COMMANDS.find((item) => item.id === 'new')).toMatchObject({
      labelKey: 'slash.command.new.label',
      descriptionKey: 'slash.command.new.description',
    });
    expect(getFilteredSlashCommands('/new')[0]).toMatchObject({
      label: 'New conversation',
      description: 'Clear the current conversation context while keeping the current worker selection',
    });
    expect(getFilteredSlashCommands('/voice')[0]).toMatchObject({
      description: 'Switch between text input and turn-based voice chat',
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
    expect(isSlashCommandDisabled('voice', availability)).toBe(true);
    expect(isSlashCommandDisabled('stop', availability)).toBe(false);
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
