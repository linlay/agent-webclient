import { createActionRuntime } from '@/features/tools/lib/actionRuntime';

describe('createActionRuntime', () => {
  it('routes switch_theme through onThemeChange when provided', () => {
    const root = {
      setAttribute: jest.fn(),
    } as unknown as HTMLElement;
    const onThemeChange = jest.fn();
    const runtime = createActionRuntime({
      root,
      canvas: {
        getContext: jest.fn(),
      } as unknown as HTMLCanvasElement,
      onThemeChange,
    });

    const result = runtime.execute('switch_theme', { theme: 'dark' });

    expect(result).toEqual({ theme: 'dark' });
    expect(onThemeChange).toHaveBeenCalledWith('dark');
    expect(root.setAttribute).not.toHaveBeenCalled();
  });

  it('falls back to updating the root data-theme attribute when no callback is provided', () => {
    const root = {
      setAttribute: jest.fn(),
    } as unknown as HTMLElement;
    const runtime = createActionRuntime({
      root,
      canvas: {
        getContext: jest.fn(),
      } as unknown as HTMLCanvasElement,
    });

    runtime.execute('switch_theme', { theme: 'light' });

    expect(root.setAttribute).toHaveBeenCalledWith('data-theme', 'light');
  });
});
