import {
  buildAgentListFallbackRequestOptions,
  buildAgentListRequestOptions,
  resolveAgentListScope,
  shouldFallbackMixedWorkerList,
  shouldStartInitialWorkerRefresh,
} from '@/features/workers/hooks/useWorkerData';

describe('resolveAgentListScope', () => {
  it('uses the copilot agent scope on the Copilot route', () => {
    expect(resolveAgentListScope('/copilot')).toBe('copilot');
    expect(resolveAgentListScope('/copilot/demo')).toBe('copilot');
  });

  it('uses the nav agent scope on normal routes', () => {
    expect(resolveAgentListScope('/')).toBe('nav');
    expect(resolveAgentListScope('/agents')).toBe('nav');
    expect(resolveAgentListScope('/agent/demo')).toBe('nav');
  });
});

describe('buildAgentListRequestOptions', () => {
  it('builds Copilot scoped requests without includeChats for initial refresh', () => {
    expect(buildAgentListRequestOptions('/copilot', 5)).toEqual({
      includeChats: undefined,
    scope: 'copilot'
    });
    expect(buildAgentListRequestOptions('/copilot/demo', 5)).toEqual({
      includeChats: undefined,
    scope: 'copilot'
    });
  });

  it('keeps includeChats on normal initial refreshes', () => {
    expect(buildAgentListRequestOptions('/', 5)).toEqual({
      includeChats: 5,
    scope: 'nav'
    });
  });

  it('builds nav scoped requests for normal navigation refreshes', () => {
    expect(buildAgentListRequestOptions('/')).toEqual({
      includeChats: undefined,
    scope: 'nav'
    });
  });
});

describe('buildAgentListFallbackRequestOptions', () => {
  it('falls back from empty Copilot scoped lists to nav-scoped agents', () => {
    expect(buildAgentListFallbackRequestOptions({ scope: 'copilot' })).toEqual({
      includeChats: undefined,
    scope: 'nav'
    });
  });

  it('does not fallback normal nav requests', () => {
    expect(buildAgentListFallbackRequestOptions({ includeChats: 5, scope: 'nav' })).toBeNull();
  });

  it('accepts TEAM Agents as a nonempty catalog response', () => {
    const options = { scope: 'copilot' } as const;
    expect(shouldFallbackMixedWorkerList([
      { mode: "TEAM", key: 'team-ops', name: 'Ops' },
    ], options)).toBe(false);
    expect(shouldFallbackMixedWorkerList([
      { mode: "TEAM", key: 'team-ops', name: 'Ops' },
      { kind: 'agent', key: 'copilot', name: 'Copilot' },
    ], options)).toBe(false);
  });
});

describe('shouldStartInitialWorkerRefresh', () => {
  it('allows route surfaces to defer the initial worker list request', () => {
    expect(shouldStartInitialWorkerRefresh({
      enabled: false,
      hasStarted: false,
      appMode: false,
    hasAccessToken: true
    })).toBe(false);
  });

  it('starts immediately for standalone pages once the first refresh has not started', () => {
    expect(shouldStartInitialWorkerRefresh({
      hasStarted: false,
      appMode: false,
    hasAccessToken: false
    })).toBe(true);
    expect(shouldStartInitialWorkerRefresh({
      hasStarted: false,
      appMode: false,
    hasAccessToken: true
    })).toBe(true);
  });

  it('does not auto refresh again after the initial refresh has started', () => {
    expect(shouldStartInitialWorkerRefresh({
      hasStarted: true,
      appMode: false,
    hasAccessToken: true
    })).toBe(false);
  });

  it('waits for app-mode token hydration before the first fetch', () => {
    expect(shouldStartInitialWorkerRefresh({
      hasStarted: false,
      appMode: true,
    hasAccessToken: false
    })).toBe(false);

    expect(shouldStartInitialWorkerRefresh({
      hasStarted: false,
      appMode: true,
    hasAccessToken: true
    })).toBe(true);
  });

  it('keeps the first-fetch rule independent from websocket readiness', () => {
    expect(shouldStartInitialWorkerRefresh({
      hasStarted: false,
      appMode: false,
    hasAccessToken: true
    })).toBe(true);
  });
});
