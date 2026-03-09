import { resolveToolLabel } from './toolDisplay';

describe('resolveToolLabel', () => {
  it('prefers toolLabel over other tool identifiers', () => {
    expect(resolveToolLabel({
      toolLabel: '确认对话框',
      toolName: 'confirm_dialog',
      toolId: 'tool-123',
      toolKey: 'confirm_dialog',
    })).toBe('确认对话框');
  });

  it('falls back through toolName, toolId, toolKey, then default text', () => {
    expect(resolveToolLabel({
      toolName: 'confirm_dialog',
      toolId: 'tool-123',
      toolKey: 'confirm_dialog',
    })).toBe('confirm_dialog');

    expect(resolveToolLabel({
      toolId: 'tool-123',
      toolKey: 'confirm_dialog',
    })).toBe('tool-123');

    expect(resolveToolLabel({
      toolKey: 'confirm_dialog',
    })).toBe('confirm_dialog');

    expect(resolveToolLabel({})).toBe('tool');
  });
});
