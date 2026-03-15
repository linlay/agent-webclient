import type { TimelineNode } from '../context/types';
import {
  SLASH_COMMANDS,
  getFilteredSlashCommands,
  getLatestQueryText,
  isSlashCommandDisabled,
  shouldShowSlashCommandPalette,
} from './slashCommands';

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
    expect(getFilteredSlashCommands('/').length).toBeGreaterThanOrEqual(11);
    expect(getFilteredSlashCommands('/vo').map((item) => item.id)).toEqual(['voice']);
    expect(getFilteredSlashCommands('/his').map((item) => item.id)).toEqual(['history']);
  });

  it('uses 对话 wording for the new command', () => {
    expect(SLASH_COMMANDS.find((item) => item.id === 'new')).toMatchObject({
      label: '新对话',
      description: '清空当前对话上下文，保留当前 worker 选择',
    });
    expect(SLASH_COMMANDS.find((item) => item.id === 'voice')).toMatchObject({
      description: '开始或停止浏览器语音听写',
    });
  });

  it('disables commands according to current availability', () => {
    const availability = {
      streaming: true,
      hasLatestQuery: false,
      speechSupported: false,
      isFrontendActive: true,
      hasCurrentWorker: false,
      workerHistoryCount: 0,
      workerCount: 0,
      commandModalOpen: false,
    };

    expect(isSlashCommandDisabled('redo', availability)).toBe(true);
    expect(isSlashCommandDisabled('voice', availability)).toBe(true);
    expect(isSlashCommandDisabled('stop', availability)).toBe(false);
    expect(isSlashCommandDisabled('settings', availability)).toBe(false);
    expect(isSlashCommandDisabled('detail', availability)).toBe(true);
    expect(isSlashCommandDisabled('switch', availability)).toBe(true);
  });

  it('finds the most recent user query from timeline nodes', () => {
    const nodes: TimelineNode[] = [
      createNode({ id: 'user_1', kind: 'message', role: 'user', text: 'first', ts: 100 }),
      createNode({ id: 'content_1', kind: 'content', text: 'answer', ts: 110 }),
      createNode({ id: 'user_2', kind: 'message', role: 'user', text: 'latest', ts: 120 }),
    ];

    expect(getLatestQueryText(nodes)).toBe('latest');
  });
});
