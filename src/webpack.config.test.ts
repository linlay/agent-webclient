describe('webpack devServer proxy', () => {
  const originalEnv = process.env;

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
      Array.isArray(rule.context) && rule.context.includes('/api/ws/voice'));

    expect(voiceRule).toBeTruthy();
    expect(voiceRule.ws).toBe(true);
  });
});
