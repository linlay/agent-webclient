const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const WebSocket = require('ws');

const {
  createDevCorsMiddleware,
  createServer,
  loadConfig,
  resolveFrontendRequest,
} = require('./server');

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agent-webclient-backend-'));
}

function writeFrontendFile(rootDir, relativePath, content) {
  const targetPath = path.join(rootDir, 'frontend', 'dist', relativePath);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, content, 'utf8');
}

function createMockResponse() {
  const headers = {};

  return {
    body: '',
    ended: false,
    headers,
    statusCode: 200,
    append(name, value) {
      const key = String(name).toLowerCase();
      if (!headers[key]) {
        headers[key] = value;
        return;
      }
      headers[key] = `${headers[key]}, ${value}`;
    },
    end(body = '') {
      this.body = body;
      this.ended = true;
      return this;
    },
    setHeader(name, value) {
      headers[String(name).toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
  };
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve(server.address().port);
    });
  });
}

function closeServer(server) {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

function waitForWebSocketOpen(ws) {
  return new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
}

function waitForWebSocketMessage(ws) {
  return new Promise((resolve, reject) => {
    ws.once('message', (data) => resolve(String(data)));
    ws.once('error', reject);
  });
}

function httpGetBody(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => resolve({ statusCode: res.statusCode, body }));
    });
    req.once('error', reject);
  });
}

describe('backend/server', () => {
  const tempRoots = [];
  const devCorsMiddleware = createDevCorsMiddleware();

  afterEach(() => {
    while (tempRoots.length > 0) {
      fs.rmSync(tempRoots.pop(), { recursive: true, force: true });
    }
  });

  test('serves static files from frontend/dist', async () => {
    const rootDir = makeTempRoot();
    tempRoots.push(rootDir);
    writeFrontendFile(rootDir, 'index.html', '<html><body>index</body></html>');
    writeFrontendFile(rootDir, 'assets/app.js', 'console.log("hello");');

    const config = loadConfig({ env: { PORT: '0' }, appRoot: rootDir });
    const response = resolveFrontendRequest(config, '/assets/app.js');

    expect(response.type).toBe('file');
    expect(fs.readFileSync(response.filePath, 'utf8')).toBe('console.log("hello");');
  });

  test('falls back to index.html for SPA routes without file extensions', () => {
    const rootDir = makeTempRoot();
    tempRoots.push(rootDir);
    writeFrontendFile(rootDir, 'index.html', '<html><body>spa shell</body></html>');

    const config = loadConfig({ env: { PORT: '0' }, appRoot: rootDir });
    const response = resolveFrontendRequest(config, '/chat/session-1');

    expect(response.type).toBe('file');
    expect(fs.readFileSync(response.filePath, 'utf8')).toContain('spa shell');
  });

  test('returns 404 for missing asset paths with file extensions', () => {
    const rootDir = makeTempRoot();
    tempRoots.push(rootDir);
    writeFrontendFile(rootDir, 'index.html', '<html><body>spa shell</body></html>');

    const config = loadConfig({ env: { PORT: '0' }, appRoot: rootDir });
    const response = resolveFrontendRequest(config, '/missing.js');

    expect(response).toEqual({ type: 'notFound' });
  });

  test('fails before listen when frontend/dist/index.html is missing', () => {
    const rootDir = makeTempRoot();
    tempRoots.push(rootDir);

    expect(() => loadConfig({ env: { PORT: '0' }, appRoot: rootDir })).toThrow(/index\.html/);
  });

  test('loads WS_BASE_URL independently while defaulting to BASE_URL', () => {
    const rootDir = makeTempRoot();
    tempRoots.push(rootDir);
    writeFrontendFile(rootDir, 'index.html', '<html><body>spa shell</body></html>');

    const defaultConfig = loadConfig({
      env: {
        PORT: '0',
        BASE_URL: 'http://base.example.com',
        VOICE_BASE_URL: 'http://voice.example.com',
      },
      appRoot: rootDir,
    });
    expect(defaultConfig.wsBaseUrl.toString()).toBe('http://base.example.com/');

    const explicitConfig = loadConfig({
      env: {
        PORT: '0',
        BASE_URL: 'http://base.example.com',
        WS_BASE_URL: 'http://ws.example.com',
        VOICE_BASE_URL: 'http://voice.example.com',
      },
      appRoot: rootDir,
    });
    expect(explicitConfig.baseUrl.toString()).toBe('http://base.example.com/');
    expect(explicitConfig.wsBaseUrl.toString()).toBe('http://ws.example.com/');
    expect(explicitConfig.voiceBaseUrl.toString()).toBe('http://voice.example.com/');
  });

  test('responds to allowed dev-origin preflight requests with CORS headers', async () => {
    const req = {
      headers: {
        origin: 'http://127.0.0.1:5173',
      },
      method: 'OPTIONS',
    };
    const res = createMockResponse();
    const next = jest.fn();

    devCorsMiddleware(req, res, next);

    expect(res.statusCode).toBe(204);
    expect(res.ended).toBe(true);
    expect(next).not.toHaveBeenCalled();
    expect(res.headers['access-control-allow-origin']).toBe('http://127.0.0.1:5173');
    expect(res.headers['access-control-allow-methods']).toBe(
      'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    );
    expect(res.headers['access-control-allow-headers']).toBe(
      'Content-Type, Authorization, Accept, Cache-Control',
    );
    expect(String(res.headers.vary || '')).toContain('Origin');
  });

  test('adds CORS headers to non-OPTIONS requests from allowed dev origins', () => {
    const req = {
      headers: {
        origin: 'http://localhost:5173',
      },
      method: 'GET',
    };
    const res = createMockResponse();
    const next = jest.fn();

    devCorsMiddleware(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(res.ended).toBe(false);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(res.headers['access-control-allow-methods']).toBe(
      'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    );
  });

  test('does not add CORS headers for non-matching origins', () => {
    const req = {
      headers: {
        origin: 'http://127.0.0.1:3000',
      },
      method: 'GET',
    };
    const res = createMockResponse();
    const next = jest.fn();

    devCorsMiddleware(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(res.ended).toBe(false);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    expect(res.headers['access-control-allow-methods']).toBeUndefined();
    expect(res.headers['access-control-allow-headers']).toBeUndefined();
  });

  test('keeps api and voice http upstreams separate from WS_BASE_URL', async () => {
    const rootDir = makeTempRoot();
    tempRoots.push(rootDir);
    writeFrontendFile(rootDir, 'index.html', '<html><body>spa shell</body></html>');

    const apiServer = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(`api:${req.url}`);
    });
    const voiceServer = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(`voice:${req.url}`);
    });
    const apiPort = await listen(apiServer);
    const voicePort = await listen(voiceServer);
    const config = loadConfig({
      env: {
        PORT: '0',
        BASE_URL: `http://127.0.0.1:${apiPort}`,
        WS_BASE_URL: 'http://127.0.0.1:1',
        VOICE_BASE_URL: `http://127.0.0.1:${voicePort}`,
      },
      appRoot: rootDir,
    });

    const { server } = createServer(config, {
      logger: { error: jest.fn() },
    });
    const proxyPort = await listen(server);

    try {
      await expect(httpGetBody(`http://127.0.0.1:${proxyPort}/api/ping`)).resolves.toEqual({
        statusCode: 200,
        body: 'api:/api/ping',
      });
      await expect(httpGetBody(`http://127.0.0.1:${proxyPort}/api/voice/ping`)).resolves.toEqual({
        statusCode: 200,
        body: 'voice:/api/voice/ping',
      });
    } finally {
      await closeServer(server);
      await closeServer(apiServer);
      await closeServer(voiceServer);
    }
  }, 10_000);

  test('tunnels websocket upgrade bytes to the configured ws base url', async () => {
    const rootDir = makeTempRoot();
    tempRoots.push(rootDir);
    writeFrontendFile(rootDir, 'index.html', '<html><body>spa shell</body></html>');

    let upstreamPath = '';
    let upstreamHost = '';
    const upstreamWss = new WebSocket.Server({ noServer: true });
    const upstreamServer = http.createServer();
    upstreamServer.on('upgrade', (req, socket, head) => {
      upstreamPath = req.url;
      upstreamHost = req.headers.host;
      upstreamWss.handleUpgrade(req, socket, head, (ws) => {
        ws.on('message', (data) => ws.send(`echo:${String(data)}`));
        ws.send('ready');
      });
    });

    const upstreamPort = await listen(upstreamServer);
    const config = loadConfig({
      env: {
        PORT: '0',
        BASE_URL: 'http://127.0.0.1:1',
        WS_BASE_URL: `http://127.0.0.1:${upstreamPort}`,
        VOICE_BASE_URL: 'http://127.0.0.1:1',
      },
      appRoot: rootDir,
    });

    const { server } = createServer(config, {
      logger: { error: jest.fn() },
    });
    const proxyPort = await listen(server);

    const client = new WebSocket(`ws://127.0.0.1:${proxyPort}/ws?token=abc`, {
      perMessageDeflate: false,
    });
    const readyMessage = waitForWebSocketMessage(client);
    await waitForWebSocketOpen(client);
    await expect(readyMessage).resolves.toBe('ready');

    const echoMessage = waitForWebSocketMessage(client);
    client.send('hello');
    await expect(echoMessage).resolves.toBe('echo:hello');

    expect(upstreamPath).toBe('/ws?token=abc');
    expect(upstreamHost).toBe(`127.0.0.1:${upstreamPort}`);

    client.terminate();
    for (const ws of upstreamWss.clients) {
      ws.terminate();
    }
    upstreamWss.close();
    await closeServer(server);
    await closeServer(upstreamServer);
  }, 10_000);
});
