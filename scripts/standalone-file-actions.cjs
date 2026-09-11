const { execFile } = require('node:child_process');
const { createHash, randomBytes } = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { promisify } = require('node:util');

const FILE_ACTIONS_PATH = '/__webclient_local__/files';
const MAX_FILE_BYTES = 128 * 1024 * 1024;
const defaultAppExtensions = new Set((
  'doc docx odt rtf pdf ppt pptx odp xls xlsx ods csv tsv txt md markdown json xml yaml yml ' +
  'png jpg jpeg gif webp bmp tif tiff svg avif heic ico html htm ' +
  'mp3 wav ogg m4a aac flac mp4 mov webm m4v avi zip tar gz 7z rar'
).split(' '));

function isLoopback(value) {
  return ['localhost', '127.0.0.1', '::1', '[::1]', '::ffff:127.0.0.1'].includes(value);
}

function isLocalRequest(req) {
  if (!isLoopback(req.socket.remoteAddress)) return false;
  try {
    const origin = new URL(`http://${req.headers.host}`);
    if (!isLoopback(origin.hostname) || origin.username || origin.password) return false;
    if (Number(origin.port || 80) !== req.socket.localPort) return false;
    if (req.headers['x-webclient-local'] !== '1') return false;
    if (req.headers['sec-fetch-site'] && req.headers['sec-fetch-site'] !== 'same-origin') return false;
    if (req.headers.origin && req.headers.origin !== origin.origin) return false;
    return true;
  } catch {
    return false;
  }
}

function isSafeFilename(name) {
  return typeof name === 'string' && Buffer.byteLength(name) <= 200 &&
    name.trim() === name && !/[\\/:*?"<>|\u0000-\u001f\u007f]/u.test(name) &&
    !name.startsWith('.') && !name.endsWith('.') &&
    !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(name) && name.length > 0;
}

function systemFileCommand(platform, action, filePath) {
  if (platform === 'darwin') return ['open', action === 'reveal' ? ['-R', filePath] : [filePath]];
  if (platform === 'win32') {
    return action === 'reveal'
      ? ['explorer.exe', [`/select,${filePath}`]]
      : ['rundll32.exe', ['url.dll,FileProtocolHandler', filePath]];
  }
  if (platform === 'linux') return ['xdg-open', [action === 'reveal' ? path.dirname(filePath) : filePath]];
  throw new Error('unsupported_platform');
}

function createStandaloneFileActions({
  platform = process.platform,
  runFile = promisify(execFile),
  tempDirectory = os.tmpdir(),
  maxBytes = MAX_FILE_BYTES,
} = {}) {
  const token = randomBytes(32).toString('hex');
  let cacheRoot;
  const writes = new Map();
  const supported = ['darwin', 'win32', 'linux'].includes(platform);
  const respond = (res, status, body) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(JSON.stringify(body));
  };

  async function saveCopy(name, data) {
    // Content-addressed originals reuse the copy without overwriting local edits.
    const key = createHash('sha256').update(name).update('\0').update(data).digest('hex');
    const activeWrite = writes.get(key);
    if (activeWrite) return activeWrite;
    const write = (async () => {
      cacheRoot ||= fs.mkdtemp(path.join(tempDirectory, 'agent-webclient-files-'));
      const directory = path.join(await cacheRoot, key);
      await fs.mkdir(directory, { recursive: true, mode: 0o700 });
      const filePath = path.join(directory, name);
      try {
        await fs.writeFile(filePath, data, { flag: 'wx', mode: 0o600 });
      } catch (error) {
        if (error.code !== 'EEXIST') {
          await fs.rm(filePath, { force: true }).catch(() => {});
          throw error;
        }
      }
      return filePath;
    })().finally(() => writes.delete(key));
    writes.set(key, write);
    return write;
  }

  return async (req, res, next) => {
    if (req.url !== FILE_ACTIONS_PATH) return next();
    if (!isLocalRequest(req)) {
      respond(res, 403, { ok: false, code: 'local_only' });
      return;
    }
    if (req.method === 'GET') {
      respond(res, 200, { ok: true, available: supported, platform, maxBytes, ...(supported ? { token } : {}) });
      return;
    }
    if (req.method !== 'POST') {
      respond(res, 405, { ok: false, code: 'method_not_allowed' });
      return;
    }
    if (!supported || req.headers['x-webclient-token'] !== token) {
      respond(res, 403, { ok: false, code: 'unavailable' });
      return;
    }
    const action = req.headers['x-file-action'];
    let name;
    try { name = decodeURIComponent(req.headers['x-file-name'] || ''); } catch { name = ''; }
    if (!['reveal', 'open-default'].includes(action) || !isSafeFilename(name) ||
        req.headers['content-type'] !== 'application/octet-stream') {
      respond(res, 400, { ok: false, code: 'invalid_request' });
      return;
    }
    if (action === 'open-default' && !defaultAppExtensions.has(path.extname(name).slice(1).toLowerCase())) {
      respond(res, 415, { ok: false, code: 'unsupported_type' });
      return;
    }
    if (Number(req.headers['content-length']) > maxBytes) {
      respond(res, 413, { ok: false, code: 'too_large' });
      return;
    }
    try {
      const chunks = [];
      let bytes = 0;
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > maxBytes) {
          respond(res, 413, { ok: false, code: 'too_large' });
          return;
        }
        chunks.push(chunk);
      }
      const filePath = await saveCopy(name, Buffer.concat(chunks));
      const [command, args] = systemFileCommand(platform, action, filePath);
      await runFile(command, args, { timeout: 15_000, windowsHide: true });
      respond(res, 200, { ok: true });
    } catch {
      respond(res, 500, { ok: false, code: 'action_failed' });
    }
  };
}

module.exports = { createStandaloneFileActions, FILE_ACTIONS_PATH, systemFileCommand };
