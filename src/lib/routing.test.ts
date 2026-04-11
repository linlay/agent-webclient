import { APP_UI_BASE, isAppMode } from './routing';

describe('routing', () => {
  it('detects app mode for the appagent base path', () => {
    expect(isAppMode(APP_UI_BASE)).toBe(true);
    expect(isAppMode(`${APP_UI_BASE}/chat`)).toBe(true);
  });

  it('keeps regular web paths out of app mode', () => {
    expect(isAppMode('/')).toBe(false);
    expect(isAppMode('/agent')).toBe(false);
    expect(isAppMode('/appagent-web')).toBe(false);
  });
});
