const fs = require('fs');
const os = require('os');
const path = require('path');

const { loadConfig, resolveFrontendRequest } = require('./server');

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agent-webclient-backend-'));
}

function writeFrontendFile(rootDir, relativePath, content) {
  const targetPath = path.join(rootDir, 'frontend', 'dist', relativePath);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, content, 'utf8');
}

describe('backend/server', () => {
  const tempRoots = [];

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
});
