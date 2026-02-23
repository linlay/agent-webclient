import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createQueryStream, getAgents, setAccessToken } from './apiClient.js';

function mockApiResponse(data = {}) {
  return new Response(JSON.stringify({ code: 0, msg: 'success', data }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json'
    }
  });
}

describe('apiClient auth header', () => {
  beforeEach(() => {
    setAccessToken('');
    globalThis.fetch = vi.fn();
  });

  it('adds bearer header for getAgents when token is set', async () => {
    globalThis.fetch.mockResolvedValue(mockApiResponse([]));
    setAccessToken('token_abc');

    await getAgents();

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('/api/ap/agents');
    expect(options.headers.Authorization).toBe('Bearer token_abc');
  });

  it('omits bearer header when token is cleared', async () => {
    globalThis.fetch.mockResolvedValue(mockApiResponse([]));
    setAccessToken('token_abc');
    setAccessToken('');

    await getAgents();

    const [, options] = globalThis.fetch.mock.calls[0];
    expect(options.headers.Authorization).toBeUndefined();
  });

  it('adds bearer header for createQueryStream', async () => {
    globalThis.fetch.mockResolvedValue(new Response('{}', { status: 200 }));
    setAccessToken('query_token');

    await createQueryStream({
      message: 'hello',
      chatId: 'chat-1'
    });

    const [url, options] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('/api/ap/query');
    expect(options.headers.Authorization).toBe('Bearer query_token');
  });

  it('trims token before adding bearer header', async () => {
    globalThis.fetch.mockResolvedValue(mockApiResponse([]));
    setAccessToken('  trimmed_token  ');

    await getAgents();

    const [, options] = globalThis.fetch.mock.calls[0];
    expect(options.headers.Authorization).toBe('Bearer trimmed_token');
  });
});
