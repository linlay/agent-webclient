import { resolveTimelineToolIcon } from './timelineToolIcon';

describe('resolveTimelineToolIcon', () => {
  it('keeps unknown, connector and excluded tools on the original wrench', () => {
    for (const name of [undefined, '', 'connector.file_read', 'memory_read', 'kbase_search', 'platform_control', 'constructor']) {
      expect(resolveTimelineToolIcon([name])).toBe('fallback');
    }
    expect(resolveTimelineToolIcon([])).toBe('fallback');
  });

  it('retains an icon for homogeneous groups and falls back for mixed actions', () => {
    expect(resolveTimelineToolIcon(['bash', 'bash_sandbox', '_sandbox_bash_'])).toBe('bash');
    expect(resolveTimelineToolIcon(['file_read', 'file_read'])).toBe('read');
    expect(resolveTimelineToolIcon(['file_read', 'file_write'])).toBe('fallback');
    expect(resolveTimelineToolIcon(['image_generate', undefined])).toBe('fallback');
  });

  it('uses builtin identity and tolerates casing and surrounding whitespace', () => {
    expect(resolveTimelineToolIcon([' WAIT '])).toBe('wait');
    expect(resolveTimelineToolIcon(['image_generate'])).toBe('image');
    expect(resolveTimelineToolIcon(['ask_user_question'])).toBe('question');
    expect(resolveTimelineToolIcon(['agent_delegate'])).toBe('agent');
    expect(resolveTimelineToolIcon(['run_status'])).toBe('run');
  });
});
