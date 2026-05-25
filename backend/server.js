const fs = require('fs');
const http = require('http');
const path = require('path');
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const DEFAULT_PORT = '11948';
const DEFAULT_BASE_URL = 'http://127.0.0.1:11949';
const DEV_CORS_ALLOWED_ORIGINS = new Set([
  'http://127.0.0.1:5173',
  'http://localhost:5173',
]);
const DEV_CORS_ALLOW_METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';
const DEV_CORS_ALLOW_HEADERS = 'Content-Type, Authorization, Accept, Cache-Control';
const RUNTIME_CONFIG_ENV_KEYS = [
  'DESKTOP_APP',
  'DEBUG_PANEL_ENABLED',
  'DELTA_LOGS_ENABLED',
  'SETTINGS_MENU_ENABLED',
  'QUICK_ACTIONS_ENABLED',
  'VOICE_ASR_CLIENT_GATE_ENABLED',
  'VOICE_ASR_CLIENT_GATE_RMS_THRESHOLD',
  'VOICE_ASR_CLIENT_GATE_OPEN_HOLD_MS',
  'VOICE_ASR_CLIENT_GATE_CLOSE_HOLD_MS',
  'VOICE_ASR_CLIENT_GATE_PRE_ROLL_MS',
];

function parseRequestPath(urlValue) {
  return new URL(String(urlValue || '/'), 'http://127.0.0.1').pathname;
}

function parseRequestUrl(urlValue) {
  return new URL(String(urlValue || '/'), 'http://127.0.0.1');
}

function parseEnvFileContent(content) {
  const values = {};
  String(content || '')
    .split(/\r?\n/)
    .forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const separatorIndex = trimmed.indexOf('=');
      if (separatorIndex <= 0) return;
      const key = trimmed.slice(0, separatorIndex).trim();
      let value = trimmed.slice(separatorIndex + 1).trim();
      if (
        value.length >= 2 &&
        ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'")))
      ) {
        value = value.slice(1, -1);
      }
      values[key] = value;
    });
  return values;
}

function readEnvFile(appRoot) {
  const envPath = path.join(appRoot, '.env');
  try {
    return parseEnvFileContent(fs.readFileSync(envPath, 'utf8'));
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

function resolveRuntimeConfig(config, options = {}) {
  const baseEnv = options.env || process.env;
  const fileEnv = readEnvFile(config.appRoot);
  const env = {
    ...baseEnv,
    ...fileEnv,
  };

  const runtimeConfig = RUNTIME_CONFIG_ENV_KEYS.reduce((runtimeConfig, key) => {
    runtimeConfig[key] = String(env[key] == null ? '' : env[key]).trim();
    return runtimeConfig;
  }, {});
  runtimeConfig.VOICE_ENABLED = String(Boolean(config.voiceBaseUrl));
  return runtimeConfig;
}

function isDesktopAppRuntime(config) {
  const desktopAppValue = resolveRuntimeConfig(config).DESKTOP_APP;
  return typeof desktopAppValue === 'string'
    && desktopAppValue.trim().toLowerCase() === 'true';
}

function hasBearerWebSocketProtocol(req) {
  const rawProtocol = String(req?.headers?.['sec-websocket-protocol'] || '');
  return rawProtocol
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .some((item) => item.startsWith('bearer.') || item.startsWith('bearer '));
}

function hasWebSocketAccessToken(req) {
  try {
    const url = parseRequestUrl(req?.url);
    return Boolean(
      url.searchParams.get('token')?.trim()
        || url.searchParams.get('access_token')?.trim()
        || hasBearerWebSocketProtocol(req)
    );
  } catch {
    return hasBearerWebSocketProtocol(req);
  }
}

function rejectUnauthenticatedWebSocketUpgrade(req, socket, logger) {
  logger.warn?.(`[backend] blocked unauthenticated /ws upgrade: ${req?.url || '/ws'}`);
  if (socket && typeof socket.write === 'function' && !socket.destroyed) {
    try {
      socket.end('HTTP/1.1 401 Unauthorized\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: 12\r\n\r\nunauthorized');
      return;
    } catch {
      // Ignore socket write failures before closing the unauthenticated upgrade.
    }
  }
  socket?.destroy?.();
}

function createRuntimeConfigScript(runtimeConfig) {
  return `globalThis.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = ${JSON.stringify(runtimeConfig)};\n`;
}

function isSseQueryRequest(req) {
  const urlValue = typeof req === 'string'
    ? req
    : req?.originalUrl || req?.url || '';
  const requestPath = parseRequestPath(urlValue);
  return requestPath === '/api/query';
}

function resolveFrontendDist(appRoot) {
  const candidates = [
    path.join(appRoot, 'frontend', 'dist'),
    path.join(appRoot, 'dist'),
  ];

  for (const candidate of candidates) {
    const indexFile = path.join(candidate, 'index.html');
    if (fs.existsSync(indexFile)) {
      return {
        frontendDist: candidate,
        indexFile,
      };
    }
  }

  throw new Error(
    `missing frontend dist index.html (checked: ${candidates
      .map((candidate) => path.join(candidate, 'index.html'))
      .join(', ')})`,
  );
}

function loadConfig(options = {}) {
  const env = options.env || process.env;
  const appRoot = options.appRoot || path.resolve(__dirname, '..');
  const port = String(env.PORT || DEFAULT_PORT).trim() || DEFAULT_PORT;
  const baseUrl = new URL(String(env.BASE_URL || DEFAULT_BASE_URL).trim() || DEFAULT_BASE_URL);
  const voiceBaseUrlValue = String(env.VOICE_BASE_URL || '').trim();
  const voiceBaseUrl = voiceBaseUrlValue ? new URL(voiceBaseUrlValue) : null;
  const frontend = resolveFrontendDist(appRoot);

  return {
    appRoot,
    port,
    baseUrl,
    voiceBaseUrl,
    frontendDist: frontend.frontendDist,
    indexFile: frontend.indexFile,
  };
}

function createProxyErrorHandler(logger) {
  return function handleProxyError(error, req, res) {
    logger.error(
      `[backend] reverse proxy ${req.method} ${req.url} failed: ${error.message}`,
    );

    if (res && typeof res.writeHead === 'function' && !res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    }
    if (res && typeof res.end === 'function') {
      res.end('upstream unavailable');
      return;
    }
    req?.socket?.destroy(error);
  };
}

function createWebSocketProxyErrorHandler(logger) {
  return function handleWebSocketProxyError(error, req, socket) {
    logger.error(
      `[backend] websocket proxy ${req?.url || ''} failed: ${error.message || String(error)}`,
    );

    if (socket && typeof socket.write === 'function' && !socket.destroyed) {
      try {
        socket.write('HTTP/1.1 502 Bad Gateway\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: 20\r\n\r\nupstream unavailable');
      } catch {
        // Ignore socket write failures while reporting websocket proxy errors.
      }
    }
    socket?.destroy?.();
  };
}

function createApiProxy(target, logger) {
  return createProxyMiddleware({
    target: target.toString(),
    changeOrigin: true,
    ws: false,
    xfwd: true,
    logLevel: 'silent',
    selfHandleResponse: false,
    onError: createProxyErrorHandler(logger),
    onProxyReq(proxyReq, req) {
      if (!isSseQueryRequest(req)) {
        return;
      }
      proxyReq.removeHeader('accept-encoding');
      proxyReq.setHeader('Accept-Encoding', '');
    },
    onProxyRes(proxyRes, req, res) {
      if (!isSseQueryRequest(req)) {
        return;
      }
      const statusCode = typeof proxyRes.statusCode === 'number' ? proxyRes.statusCode : 200;
      const contentType = String(proxyRes.headers['content-type'] || '').toLowerCase();
      if (statusCode < 200 || statusCode >= 300 || !contentType.startsWith('text/event-stream')) {
        return;
      }
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('X-Accel-Buffering', 'no');
    },
  });
}

function createProxy(target, logger) {
  return createProxyMiddleware({
    target: target.toString(),
    changeOrigin: true,
    ws: false,
    xfwd: true,
    logLevel: 'silent',
    selfHandleResponse: false,
    onError: createProxyErrorHandler(logger),
  });
}

function createWebSocketProxy(target, logger) {
  const proxy = createProxyMiddleware({
    target: target.toString(),
    changeOrigin: true,
    ws: true,
    xfwd: true,
    logLevel: 'silent',
    selfHandleResponse: false,
    onError: createWebSocketProxyErrorHandler(logger),
    onProxyReqWs(proxyReq) {
      proxyReq.removeHeader('sec-websocket-extensions');
    },
  });

  return {
    upgrade(req, socket, head) {
      proxy.upgrade(req, socket, head);
    },
    ws(req, socket, head) {
      proxy.upgrade(req, socket, head);
    },
  };
}

function createDevCorsMiddleware() {
  return function devCorsMiddleware(req, res, next) {
    const origin = typeof req.headers.origin === 'string'
      ? req.headers.origin
      : '';

    if (!DEV_CORS_ALLOWED_ORIGINS.has(origin)) {
      next();
      return;
    }

    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', DEV_CORS_ALLOW_METHODS);
    res.setHeader('Access-Control-Allow-Headers', DEV_CORS_ALLOW_HEADERS);
    res.append('Vary', 'Origin');

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    next();
  };
}

function resolveFrontendRequest(config, requestPath) {
  const normalizedPath = parseRequestPath(requestPath);
  if (normalizedPath === '/') {
    return {
      type: 'file',
      filePath: config.indexFile,
    };
  }

  const distRoot = path.resolve(config.frontendDist);
  const assetPath = path.resolve(config.frontendDist, `.${normalizedPath}`);
  const isInsideDist = assetPath === distRoot || assetPath.startsWith(`${distRoot}${path.sep}`);

  if (isInsideDist && fs.existsSync(assetPath)) {
    const stats = fs.statSync(assetPath);
    if (stats.isFile()) {
      return {
        type: 'file',
        filePath: assetPath,
      };
    }
    if (stats.isDirectory()) {
      const nestedIndex = path.join(assetPath, 'index.html');
      if (fs.existsSync(nestedIndex)) {
        return {
          type: 'file',
          filePath: nestedIndex,
        };
      }
    }
  }

  if (path.extname(normalizedPath) && !isSpaRoutePath(normalizedPath)) {
    return { type: 'notFound' };
  }

  return {
    type: 'file',
    filePath: config.indexFile,
  };
}

function isSpaRoutePath(requestPath) {
  return [
    '/agent/',
    '/agents/',
    '/automations',
    '/copilot',
    '/memory',
  ].some((routePath) =>
    requestPath === routePath || requestPath.startsWith(routePath),
  );
}

function createApp(config, options = {}) {
  const logger = options.logger || console;
  const app = express();
  const devCorsMiddleware = createDevCorsMiddleware();
  const apiProxy = createApiProxy(config.baseUrl, logger);
  const voiceProxy = config.voiceBaseUrl
    ? createProxy(config.voiceBaseUrl, logger)
    : null;

  app.disable('x-powered-by');
  app.use(devCorsMiddleware);
  app.get('/runtime-config.js', (_req, res) => {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(createRuntimeConfigScript(resolveRuntimeConfig(config)));
  });
  if (voiceProxy) {
    app.use('/api/voice', voiceProxy);
  } else {
    app.use('/api/voice', (_req, res) => {
      res.status(404).json({ error: 'voice disabled' });
    });
  }
  app.use('/api', apiProxy);
  app.use(express.static(config.frontendDist, { fallthrough: true }));
  app.use((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.status(404).end();
      return;
    }
    const resolved = resolveFrontendRequest(config, req.path);
    if (resolved.type === 'notFound') {
      res.status(404).end();
      return;
    }
    res.sendFile(resolved.filePath);
  });

  return {
    app,
    proxies: {
      apiProxy,
      voiceProxy,
    },
  };
}

function createServer(config, options = {}) {
  const logger = options.logger || console;
  const { app } = createApp(config, { logger });
  const apiWsProxy = createWebSocketProxy(config.baseUrl, logger);
  const voiceWsProxy = config.voiceBaseUrl
    ? createWebSocketProxy(config.voiceBaseUrl, logger)
    : null;
  const wsProxy = createWebSocketProxy(config.baseUrl, logger);
  const server = http.createServer(app);

  server.on('upgrade', (req, socket, head) => {
    const requestPath = parseRequestPath(req.url);

    if (requestPath.startsWith('/api/voice')) {
      if (voiceWsProxy) {
        voiceWsProxy.upgrade(req, socket, head);
        return;
      }
      socket.destroy();
      return;
    }
    if (requestPath.startsWith('/api')) {
      apiWsProxy.upgrade(req, socket, head);
      return;
    }
    if (requestPath === '/ws') {
      if (isDesktopAppRuntime(config) && !hasWebSocketAccessToken(req)) {
        rejectUnauthenticatedWebSocketUpgrade(req, socket, logger);
        return;
      }
      wsProxy.upgrade(req, socket, head);
      return;
    }

    socket.destroy();
  });

  return { app, server };
}

function startServer(options = {}) {
  return Promise.resolve().then(() => {
    const config = options.config || loadConfig(options);
    const { server } = createServer(config, options);

    return new Promise((resolve, reject) => {
      const handleError = (error) => {
        server.removeListener('listening', handleListening);
        reject(error);
      };
      const handleListening = () => {
        server.removeListener('error', handleError);
        resolve({ server, config });
      };

      server.once('error', handleError);
      server.once('listening', handleListening);
      server.listen(config.port);
    });
  });
}

async function main() {
  const { server, config } = await startServer();
  console.log(`[backend] agent-webclient listening on :${config.port}`);
  return server;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[backend] ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULT_BASE_URL,
  DEFAULT_PORT,
  createApp,
  createDevCorsMiddleware,
  createServer,
  createWebSocketProxy,
  createRuntimeConfigScript,
  hasWebSocketAccessToken,
  isSseQueryRequest,
  loadConfig,
  parseRequestPath,
  parseEnvFileContent,
  resolveFrontendRequest,
  resolveFrontendDist,
  resolveRuntimeConfig,
  startServer,
};
