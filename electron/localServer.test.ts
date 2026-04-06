import type { IncomingHttpHeaders, ServerResponse } from 'http';

import { applySseResponseHeaders, selectProxyTarget } from './localServer';

describe('localServer', () => {
  const config = {
    baseUrl: 'http://runner.example.com',
    voiceBaseUrl: 'http://voice.example.com',
  };

  it('routes voice endpoints to the voice upstream first', () => {
    expect(selectProxyTarget('/api/voice/capabilities', config)).toEqual({
      kind: 'voice',
      target: 'http://voice.example.com',
    });
    expect(selectProxyTarget('/api/voice/ws', config)).toEqual({
      kind: 'voice',
      target: 'http://voice.example.com',
    });
  });

  it('routes general api requests to the runner upstream', () => {
    expect(selectProxyTarget('/api/chats', config)).toEqual({
      kind: 'api',
      target: 'http://runner.example.com',
    });
  });

  it('keeps non-api paths on the static server', () => {
    expect(selectProxyTarget('/timeline/123', config)).toEqual({
      kind: 'static',
      target: null,
    });
  });

  it('adds SSE anti-buffering headers only for event streams', () => {
    const headers = new Map<string, string>();
    const response = {
      setHeader: (name: string, value: string) => {
        headers.set(name, value);
      },
    } as Pick<ServerResponse, 'setHeader'>;

    applySseResponseHeaders(
      {
        'content-type': 'text/event-stream; charset=utf-8',
      } as IncomingHttpHeaders,
      response,
    );

    expect(headers.get('Connection')).toBe('keep-alive');
    expect(headers.get('Cache-Control')).toBe('no-cache, no-transform');
    expect(headers.get('X-Accel-Buffering')).toBe('no');
  });

  it('does not touch non-streaming responses', () => {
    const headers = new Map<string, string>();
    const response = {
      setHeader: (name: string, value: string) => {
        headers.set(name, value);
      },
    } as Pick<ServerResponse, 'setHeader'>;

    applySseResponseHeaders(
      {
        'content-type': 'application/json',
      } as IncomingHttpHeaders,
      response,
    );

    expect(headers.size).toBe(0);
  });
});
