const fs = require('fs');
const http = require('http');
const path = require('path');
const express = require('express');
const httpProxy = require('http-proxy');
const { createProxyMiddleware } = require('http-proxy-middleware');

const DEFAULT_PORT = '11948';
const DEFAULT_BASE_URL = 'http://127.0.0.1:11949';
const DEV_CORS_ALLOWED_ORIGINS = new Set([
  'http://127.0.0.1:5173',
  'http://localhost:5173',
]);
const DEV_CORS_ALLOW_METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';
const DEV_CORS_ALLOW_HEADERS = 'Content-Type, Authorization, Accept, Cache-Control';

function parseRequestPath(urlValue) {
  return new URL(String(urlValue || '/'), 'http://127.0.0.1').pathname;
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
  const voiceBaseUrl = new URL(
    String(env.VOICE_BASE_URL || baseUrl.toString()).trim() || baseUrl.toString(),
  );
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

function createApiProxy(target, logger) {
  return createProxyMiddleware({
    target: target.toString(),
    changeOrigin: true,
    ws: true,
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
    onProxyReqWs(proxyReq, req) {
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
  const proxy = httpProxy.createProxyServer({
    target: target.toString(),
    changeOrigin: true,
    ws: true,
    xfwd: true,
  });

  proxy.on('error', (error, req, socket) => {
    logger.error(
      `[backend] websocket proxy ${req?.url || ''} failed: ${error.message}`,
    );

    if (socket && typeof socket.write === 'function' && !socket.destroyed) {
      try {
        socket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
      } catch {
        // Ignore socket write failures while reporting websocket proxy errors.
      }
    }
    socket?.destroy?.();
  });

  return proxy;
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

  if (path.extname(normalizedPath)) {
    return { type: 'notFound' };
  }

  return {
    type: 'file',
    filePath: config.indexFile,
  };
}

function createApp(config, options = {}) {
  const logger = options.logger || console;
  const app = express();
  const devCorsMiddleware = createDevCorsMiddleware();
  const apiProxy = createApiProxy(config.baseUrl, logger);
  const voiceProxy = createProxy(config.voiceBaseUrl, logger);

  app.disable('x-powered-by');
  app.use(devCorsMiddleware);
  app.use('/api/voice', voiceProxy);
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
  const voiceWsProxy = createWebSocketProxy(config.voiceBaseUrl, logger);
  const wsProxy = createWebSocketProxy(config.baseUrl, logger);
  const server = http.createServer(app);

  server.on('upgrade', (req, socket, head) => {
    const requestPath = parseRequestPath(req.url);

    if (requestPath.startsWith('/api/voice')) {
      voiceWsProxy.ws(req, socket, head);
      return;
    }
    if (requestPath.startsWith('/api')) {
      apiWsProxy.ws(req, socket, head);
      return;
    }
    if (requestPath === '/ws') {
      wsProxy.ws(req, socket, head);
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
  isSseQueryRequest,
  loadConfig,
  parseRequestPath,
  resolveFrontendRequest,
  resolveFrontendDist,
  startServer,
};
