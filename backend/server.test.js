const fs = require('fs');
const os = require('os');
const path = require('path');

const { createDevCorsMiddleware, loadConfig, resolveFrontendRequest } = require('./server');

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
});
