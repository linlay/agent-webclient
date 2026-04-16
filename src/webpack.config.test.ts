describe('webpack devServer proxy', () => {
  const originalEnv = process.env;

  function loadApiProxyRule() {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'development',
      BASE_URL: 'http://backend.example.com',
      VOICE_BASE_URL: 'http://voice.example.com',
    };

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const configFactory = require('../webpack.config.js');
    const config = configFactory({}, { mode: 'development' });
    const proxyRules = Array.isArray(config.devServer?.proxy) ? config.devServer.proxy : [];
    const apiRule = proxyRules.find((rule: { context?: string[] }) =>
      Array.isArray(rule.context) && rule.context.includes('/api'));

    expect(apiRule).toBeTruthy();
    expect(typeof apiRule.onProxyReq).toBe('function');
    expect(typeof apiRule.onProxyRes).toBe('function');
    return { apiRule, config };
  }

  afterEach(() => {
    process.env = originalEnv;
    jest.resetModules();
  });

  it('enables websocket proxying for voice endpoint', () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'development',
      BASE_URL: 'http://backend.example.com',
      VOICE_BASE_URL: 'http://voice.example.com',
    };

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const configFactory = require('../webpack.config.js');
    const config = configFactory({}, { mode: 'development' });
    const proxyRules = Array.isArray(config.devServer?.proxy) ? config.devServer.proxy : [];
    const voiceRule = proxyRules.find((rule: { context?: string[] }) =>
      Array.isArray(rule.context) && rule.context.includes('/api/voice/ws'));
    const voiceApiRule = proxyRules.find((rule: { context?: string[] }) =>
      Array.isArray(rule.context) && rule.context.includes('/api/voice'));

    expect(voiceRule).toBeTruthy();
    expect(voiceRule.ws).toBe(true);
    expect(voiceApiRule).toBeTruthy();
    expect(voiceApiRule.ws).toBe(false);
  });

  it('enables websocket proxying for query websocket endpoint', () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'development',
      BASE_URL: 'http://backend.example.com',
      VOICE_BASE_URL: 'http://voice.example.com',
    };

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const configFactory = require('../webpack.config.js');
    const config = configFactory({}, { mode: 'development' });
    const proxyRules = Array.isArray(config.devServer?.proxy) ? config.devServer.proxy : [];
    const queryWsRule = proxyRules.find((rule: { context?: string[] }) =>
      Array.isArray(rule.context) && rule.context.includes('/ws'));

    expect(queryWsRule).toBeTruthy();
    expect(queryWsRule.target).toBe('http://backend.example.com');
    expect(queryWsRule.ws).toBe(true);
  });

  it('moves webpack hmr websocket off /ws', () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'development',
      BASE_URL: 'http://backend.example.com',
      VOICE_BASE_URL: 'http://voice.example.com',
    };

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const configFactory = require('../webpack.config.js');
    const config = configFactory({}, { mode: 'development' });

    expect(config.devServer?.client?.webSocketURL?.pathname).toBe('/__webpack_hmr');
    expect(config.devServer?.webSocketServer?.options?.path).toBe('/__webpack_hmr');
  });

  it('does not rewrite query errors into SSE success responses', () => {
    const { apiRule } = loadApiProxyRule();
    const req = {
      headers: { accept: 'text/event-stream' },
      url: '/api/query',
    };
    const res = {
      setHeader: jest.fn(),
      writeHead: jest.fn(),
    };
    const proxyRes = {
      statusCode: 400,
      headers: {
        'content-type': 'application/json',
      },
    };

    apiRule.onProxyRes(proxyRes, req, res);

    expect(res.writeHead).not.toHaveBeenCalled();
    expect(res.setHeader).not.toHaveBeenCalledWith('Content-Type', 'text/event-stream');
    expect(res.setHeader).not.toHaveBeenCalledWith('Connection', 'keep-alive');
    expect(res.setHeader).not.toHaveBeenCalledWith('Cache-Control', 'no-cache, no-transform');
    expect(res.setHeader).not.toHaveBeenCalledWith('X-Accel-Buffering', 'no');
  });

  it('keeps SSE buffering headers for successful event streams without rewriting status', () => {
    const { apiRule } = loadApiProxyRule();
    const req = {
      headers: { accept: 'text/event-stream' },
      url: '/api/query',
    };
    const res = {
      setHeader: jest.fn(),
      writeHead: jest.fn(),
    };
    const proxyRes = {
      statusCode: 200,
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
      },
    };

    apiRule.onProxyRes(proxyRes, req, res);

    expect(res.writeHead).not.toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache, no-transform');
    expect(res.setHeader).toHaveBeenCalledWith('X-Accel-Buffering', 'no');
  });

  it('disables dev-server compression so SSE is not gzipped locally', () => {
    const { config } = loadApiProxyRule();

    expect(config.devServer?.compress).toBe(false);
  });

  it('removes accept-encoding when proxying query SSE requests', () => {
    const { apiRule } = loadApiProxyRule();
    const proxyReq = {
      removeHeader: jest.fn(),
      setHeader: jest.fn(),
    };
    const req = {
      url: '/api/query',
    };

    apiRule.onProxyReq(proxyReq, req);

    expect(proxyReq.removeHeader).toHaveBeenCalledWith('accept-encoding');
    expect(proxyReq.setHeader).toHaveBeenCalledWith('Accept-Encoding', '');
  });

  it('leaves non-SSE api requests unchanged', () => {
    const { apiRule } = loadApiProxyRule();
    const proxyReq = {
      removeHeader: jest.fn(),
      setHeader: jest.fn(),
    };
    const req = {
      url: '/api/chats',
    };

    apiRule.onProxyReq(proxyReq, req);

    expect(proxyReq.removeHeader).not.toHaveBeenCalled();
    expect(proxyReq.setHeader).not.toHaveBeenCalled();
  });
});
