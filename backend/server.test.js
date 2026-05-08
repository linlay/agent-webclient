const fs = require('fs');
const crypto = require('crypto');
const http = require('http');
const net = require('net');
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

function buildRawWebSocketFrame(text) {
  const payload = Buffer.from(text, 'utf8');
  if (payload.length < 126) {
    return Buffer.concat([Buffer.from([0x81, payload.length]), payload]);
  }
  const header = Buffer.alloc(4);
  header[0] = 0x81;
  header[1] = 126;
  header.writeUInt16BE(payload.length, 2);
  return Buffer.concat([header, payload]);
}

function buildRawMaskedWebSocketFrame(text) {
  const payload = Buffer.from(text, 'utf8');
  const mask = crypto.randomBytes(4);
  const header = payload.length < 126
    ? Buffer.from([0x81, 0x80 | payload.length])
    : Buffer.from([0x81, 0x80 | 126, payload.length >> 8, payload.length & 0xff]);
  const masked = Buffer.alloc(payload.length);
  for (let index = 0; index < payload.length; index += 1) {
    masked[index] = payload[index] ^ mask[index % mask.length];
  }
  return Buffer.concat([header, mask, masked]);
}

function buildSecWebSocketAccept(key) {
  return crypto
    .createHash('sha1')
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest('base64');
}

function openRawUpgrade(url) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const key = crypto.randomBytes(16).toString('base64');
    const req = [
      `GET ${parsed.pathname}${parsed.search} HTTP/1.1`,
      `Host: ${parsed.host}`,
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Key: ${key}`,
      'Sec-WebSocket-Version: 13',
      'Sec-WebSocket-Extensions: permessage-deflate; client_max_window_bits',
      '',
      '',
    ].join('\r\n');
    const socket = net.connect(Number(parsed.port), parsed.hostname, () => {
      socket.write(req);
    });
    const chunks = [];
    socket.on('data', (chunk) => {
      chunks.push(chunk);
    });
    socket.once('error', reject);
    setTimeout(() => {
      socket.destroy();
      resolve(Buffer.concat(chunks));
    }, 300);
  });
}

function openRawUpgradeUntilHeaders(url) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const key = crypto.randomBytes(16).toString('base64');
    const req = [
      `GET ${parsed.pathname}${parsed.search} HTTP/1.1`,
      `Host: ${parsed.host}`,
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Key: ${key}`,
      'Sec-WebSocket-Version: 13',
      '',
      '',
    ].join('\r\n');
    const socket = net.connect(Number(parsed.port), parsed.hostname, () => {
      socket.write(req);
    });
    const chunks = [];
    socket.on('data', (chunk) => {
      chunks.push(chunk);
      const raw = Buffer.concat(chunks);
      if (raw.includes(Buffer.from('\r\n\r\n'))) {
        socket.destroy();
        resolve(raw);
      }
    });
    socket.once('error', reject);
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

  test('forwards upstream websocket authorization failures to the client', async () => {
    const rootDir = makeTempRoot();
    tempRoots.push(rootDir);
    writeFrontendFile(rootDir, 'index.html', '<html><body>spa shell</body></html>');

    let upstreamPath = '';
    const upstreamServer = http.createServer();
    upstreamServer.on('upgrade', (req, socket) => {
      upstreamPath = req.url;
      socket.write([
        'HTTP/1.1 401 Unauthorized',
        'Content-Type: text/plain; charset=utf-8',
        'Content-Length: 12',
        '',
        'unauthorized',
      ].join('\r\n'));
      socket.end();
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

    try {
      const rawResponse = await openRawUpgrade(`ws://127.0.0.1:${proxyPort}/ws?token=bad`);
      const text = rawResponse.toString('latin1');
      expect(text).toContain('HTTP/1.1 401 Unauthorized');
      expect(text).toContain('unauthorized');
      expect(text).not.toContain('502 Bad Gateway');
      expect(upstreamPath).toBe('/ws?token=bad');
    } finally {
      await closeServer(server);
      await closeServer(upstreamServer);
    }
  }, 10_000);

  test('does not forward websocket compression extensions to the upstream tunnel', async () => {
    const rootDir = makeTempRoot();
    tempRoots.push(rootDir);
    writeFrontendFile(rootDir, 'index.html', '<html><body>spa shell</body></html>');

    let upstreamExtensions = '';
    const upstreamServer = http.createServer();
    upstreamServer.on('upgrade', (req, socket) => {
      upstreamExtensions = String(req.headers['sec-websocket-extensions'] || '');
      socket.write('HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\n\r\n');
      socket.end();
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

    try {
      const rawResponse = await openRawUpgrade(`ws://127.0.0.1:${proxyPort}/ws?token=abc`);
      expect(rawResponse.toString('latin1')).toContain('HTTP/1.1 401 Unauthorized');
      expect(upstreamExtensions).toBe('');
    } finally {
      await closeServer(server);
      await closeServer(upstreamServer);
    }
  }, 10_000);

  test('does not duplicate a websocket 101 response when the upstream sends the first frame with the handshake', async () => {
    const rootDir = makeTempRoot();
    tempRoots.push(rootDir);
    writeFrontendFile(rootDir, 'index.html', '<html><body>spa shell</body></html>');

    let upstreamUpgradeCount = 0;
    const upstreamServer = net.createServer((socket) => {
      let rawRequest = '';
      socket.on('data', (chunk) => {
        rawRequest += chunk.toString('latin1');
        if (!rawRequest.includes('\r\n\r\n')) {
          return;
        }
        upstreamUpgradeCount += 1;
        const keyMatch = rawRequest.match(/^Sec-WebSocket-Key:\s*(.+)$/im);
        const accept = buildSecWebSocketAccept((keyMatch?.[1] || '').trim());
        socket.write(Buffer.concat([
          Buffer.from([
            'HTTP/1.1 101 Switching Protocols',
            'Upgrade: websocket',
            'Connection: Upgrade',
            `Sec-WebSocket-Accept: ${accept}`,
            '',
            '',
          ].join('\r\n'), 'latin1'),
          buildRawWebSocketFrame('ready'),
        ]));
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

    try {
      const rawResponse = await openRawUpgrade(`ws://127.0.0.1:${proxyPort}/ws?token=abc`);
      const text = rawResponse.toString('latin1');
      expect((text.match(/HTTP\/1\.1 101 Switching Protocols/g) || [])).toHaveLength(1);
      expect((text.match(/ready/g) || [])).toHaveLength(1);
      expect(upstreamUpgradeCount).toBe(1);
    } finally {
      await closeServer(server);
      await closeServer(upstreamServer);
    }
  }, 10_000);

  test('keeps /api http proxy from also handling /ws upgrades after api traffic', async () => {
    const rootDir = makeTempRoot();
    tempRoots.push(rootDir);
    writeFrontendFile(rootDir, 'index.html', '<html><body>spa shell</body></html>');

    const apiServer = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(`api:${req.url}`);
    });
    const upstreamServer = net.createServer((socket) => {
      let rawRequest = '';
      socket.on('data', (chunk) => {
        rawRequest += chunk.toString('latin1');
        if (!rawRequest.includes('\r\n\r\n')) {
          return;
        }
        const keyMatch = rawRequest.match(/^Sec-WebSocket-Key:\s*(.+)$/im);
        const accept = buildSecWebSocketAccept((keyMatch?.[1] || '').trim());
        socket.write(Buffer.concat([
          Buffer.from([
            'HTTP/1.1 101 Switching Protocols',
            'Upgrade: websocket',
            'Connection: Upgrade',
            `Sec-WebSocket-Accept: ${accept}`,
            '',
            '',
          ].join('\r\n'), 'latin1'),
          buildRawWebSocketFrame('ready'),
        ]));
      });
      socket.on('error', () => {
        // The raw client closes after reading enough bytes for the assertion.
      });
    });

    const apiPort = await listen(apiServer);
    const upstreamPort = await listen(upstreamServer);
    const config = loadConfig({
      env: {
        PORT: '0',
        BASE_URL: `http://127.0.0.1:${apiPort}`,
        WS_BASE_URL: `http://127.0.0.1:${upstreamPort}`,
        VOICE_BASE_URL: 'http://127.0.0.1:1',
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

      const rawResponse = await openRawUpgrade(`ws://127.0.0.1:${proxyPort}/ws?token=abc`);
      const text = rawResponse.toString('latin1');
      expect((text.match(/HTTP\/1\.1 101 Switching Protocols/g) || [])).toHaveLength(1);
      expect((text.match(/ready/g) || [])).toHaveLength(1);
    } finally {
      await closeServer(server);
      await closeServer(apiServer);
      await closeServer(upstreamServer);
    }
  }, 10_000);

  test('keeps the upgraded tunnel as raw websocket frames after the client sends data', async () => {
    const rootDir = makeTempRoot();
    tempRoots.push(rootDir);
    writeFrontendFile(rootDir, 'index.html', '<html><body>spa shell</body></html>');

    const upstreamSockets = new Set();
    const upstreamServer = net.createServer((socket) => {
      upstreamSockets.add(socket);
      socket.on('close', () => {
        upstreamSockets.delete(socket);
      });
      let rawRequest = '';
      let upgraded = false;
      socket.on('data', (chunk) => {
        if (!upgraded) {
          rawRequest += chunk.toString('latin1');
          if (!rawRequest.includes('\r\n\r\n')) {
            return;
          }
          upgraded = true;
          const keyMatch = rawRequest.match(/^Sec-WebSocket-Key:\s*(.+)$/im);
          const accept = buildSecWebSocketAccept((keyMatch?.[1] || '').trim());
          socket.write(Buffer.concat([
            Buffer.from([
              'HTTP/1.1 101 Switching Protocols',
              'Upgrade: websocket',
              'Connection: Upgrade',
              `Sec-WebSocket-Accept: ${accept}`,
              '',
              '',
            ].join('\r\n'), 'latin1'),
            buildRawWebSocketFrame('connected'),
          ]));
          return;
        }

        socket.write(buildRawWebSocketFrame('after-query'));
      });
      socket.on('error', () => {
        // Test clients may close the upgraded tunnel as soon as assertions pass.
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

    try {
      const frames = await new Promise((resolve, reject) => {
        const key = crypto.randomBytes(16).toString('base64');
        const socket = net.connect(proxyPort, '127.0.0.1', () => {
          socket.write([
            'GET /ws?token=abc HTTP/1.1',
            `Host: 127.0.0.1:${proxyPort}`,
            'Upgrade: websocket',
            'Connection: Upgrade',
            `Sec-WebSocket-Key: ${key}`,
            'Sec-WebSocket-Version: 13',
            '',
            '',
          ].join('\r\n'));
        });
        const timeout = setTimeout(() => {
          socket.destroy();
          reject(new Error('timed out waiting for upgraded frames'));
        }, 2_000);
        const parsedFrames = [];
        let buffer = Buffer.alloc(0);
        let sawHeaders = false;

        const readFrame = () => {
          if (buffer.length < 2) {
            return null;
          }
          const b0 = buffer[0];
          let offset = 2;
          let length = buffer[1] & 0x7f;
          if (length === 126) {
            if (buffer.length < 4) {
              return null;
            }
            length = buffer.readUInt16BE(2);
            offset = 4;
          }
          if (buffer.length < offset + length) {
            return null;
          }
          const payload = buffer.slice(offset, offset + length).toString('utf8');
          buffer = buffer.slice(offset + length);
          return { b0, payload };
        };

        socket.on('data', (chunk) => {
          buffer = Buffer.concat([buffer, chunk]);
          if (!sawHeaders) {
            const headerEnd = buffer.indexOf('\r\n\r\n');
            if (headerEnd < 0) {
              return;
            }
            const headerText = buffer.slice(0, headerEnd).toString('latin1');
            expect(headerText.match(/HTTP\/1\.1 101 Switching Protocols/g)).toHaveLength(1);
            buffer = buffer.slice(headerEnd + 4);
            sawHeaders = true;
          }

          let frame = readFrame();
          while (frame) {
            parsedFrames.push(frame);
            if (parsedFrames.length === 1) {
              socket.write(buildRawMaskedWebSocketFrame(JSON.stringify({ frame: 'request', type: '/api/query' })));
            }
            if (parsedFrames.length === 2) {
              clearTimeout(timeout);
              socket.destroy();
              resolve(parsedFrames);
              return;
            }
            frame = readFrame();
          }
        });
        socket.once('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
      expect(frames).toEqual([
        { b0: 0x81, payload: 'connected' },
        { b0: 0x81, payload: 'after-query' },
      ]);
    } finally {
      for (const upstreamSocket of upstreamSockets) {
        upstreamSocket.destroy();
      }
      await closeServer(server);
      await closeServer(upstreamServer);
    }
  }, 10_000);

  test('keeps serving after a websocket client disconnects immediately after 101', async () => {
    const rootDir = makeTempRoot();
    tempRoots.push(rootDir);
    writeFrontendFile(rootDir, 'index.html', '<html><body>spa shell</body></html>');

    const upstreamServer = net.createServer((socket) => {
      let rawRequest = '';
      socket.on('data', (chunk) => {
        rawRequest += chunk.toString('latin1');
        if (!rawRequest.includes('\r\n\r\n')) {
          return;
        }
        const keyMatch = rawRequest.match(/^Sec-WebSocket-Key:\s*(.+)$/im);
        const accept = buildSecWebSocketAccept((keyMatch?.[1] || '').trim());
        socket.write([
          'HTTP/1.1 101 Switching Protocols',
          'Upgrade: websocket',
          'Connection: Upgrade',
          `Sec-WebSocket-Accept: ${accept}`,
          '',
          '',
        ].join('\r\n'));
      });
      socket.on('error', () => {
        // The client side intentionally resets the socket in this regression test.
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

    try {
      const rawResponse = await openRawUpgradeUntilHeaders(`ws://127.0.0.1:${proxyPort}/ws?token=abc`);
      expect(rawResponse.toString('latin1')).toContain('HTTP/1.1 101 Switching Protocols');
      await new Promise((resolve) => setTimeout(resolve, 100));
      const response = await httpGetBody(`http://127.0.0.1:${proxyPort}/`);
      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('spa shell');
    } finally {
      await closeServer(server);
      await closeServer(upstreamServer);
    }
  }, 10_000);
});
