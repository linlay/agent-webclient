import { resolveToolLabel } from '@/features/timeline/lib/toolDisplay';

describe('resolveToolLabel', () => {
  it('prefers toolLabel over other tool identifiers', () => {
    expect(resolveToolLabel({
      toolLabel: '确认对话框',
      toolName: 'confirm_dialog',
      toolId: 'tool-123',
      viewportKey: 'confirm_dialog',
    })).toBe('确认对话框');
  });

  it('falls back through toolName, viewportKey, toolId, then default text', () => {
    expect(resolveToolLabel({
      toolName: 'email.search',
      toolId: 'call_f1494c0a4c4646cc81a41585',
      viewportKey: 'confirm_dialog',
    })).toBe('email.search');

    expect(resolveToolLabel({
      toolId: 'tool-123',
      viewportKey: 'confirm_dialog',
    })).toBe('confirm_dialog');

    expect(resolveToolLabel({
      toolId: 'tool-123',
    })).toBe('tool-123');

    expect(resolveToolLabel({
      viewportKey: 'confirm_dialog',
    })).toBe('confirm_dialog');

    expect(resolveToolLabel({})).toBe('tool');
  });
});
