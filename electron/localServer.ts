import fs from 'fs';
import http, { type IncomingHttpHeaders, type IncomingMessage, type ServerResponse } from 'http';
import path from 'path';
import { Duplex } from 'stream';

import type { DesktopConfig } from './desktopConfig';

const httpProxy = require('http-proxy') as {
  createProxyServer: (options: Record<string, unknown>) => {
    on: (event: string, handler: (...args: any[]) => void) => void;
    web: (req: IncomingMessage, res: ServerResponse, options: { target: string }) => void;
    ws: (req: IncomingMessage, socket: Duplex, head: Buffer, options: { target: string }) => void;
    close: () => void;
  };
};

const CONTENT_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.otf': 'font/otf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

export interface LocalServerHandle {
  origin: string;
  close: () => Promise<void>;
}

type ProxyKind = 'static' | 'api' | 'voice';

function hasVoicePrefix(pathname: string): boolean {
  return pathname === '/api/voice' || pathname.startsWith('/api/voice/');
}

export function selectProxyTarget(pathname: string, config: DesktopConfig): { kind: ProxyKind; target: string | null } {
  if (hasVoicePrefix(pathname)) {
    return { kind: 'voice', target: config.voiceBaseUrl };
  }
  if (pathname === '/api' || pathname.startsWith('/api/')) {
    return { kind: 'api', target: config.baseUrl };
  }
  return { kind: 'static', target: null };
}

export function applySseResponseHeaders(
  headers: IncomingHttpHeaders,
  response: Pick<ServerResponse, 'setHeader'>,
): void {
  const contentTypeValue = Array.isArray(headers['content-type'])
    ? headers['content-type'][0]
    : headers['content-type'];
  const contentType = String(contentTypeValue || '').toLowerCase();
  if (!contentType.startsWith('text/event-stream')) {
    return;
  }
  response.setHeader('Connection', 'keep-alive');
  response.setHeader('Cache-Control', 'no-cache, no-transform');
  response.setHeader('X-Accel-Buffering', 'no');
}

function toWebSocketTarget(target: string): string {
  const url = new URL(target);
  if (url.protocol === 'http:') {
    url.protocol = 'ws:';
  } else if (url.protocol === 'https:') {
    url.protocol = 'wss:';
  }
  return url.toString();
}

function getContentType(filePath: string): string {
  return CONTENT_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function resolveStaticPath(staticDir: string, pathname: string): string {
  const staticRoot = path.resolve(staticDir);
  const safeRelativePath = decodeURIComponent(pathname).replace(/^\/+/, '');
  const filePath = path.resolve(staticRoot, safeRelativePath || 'index.html');

  if (filePath !== staticRoot && !filePath.startsWith(`${staticRoot}${path.sep}`)) {
    throw new Error('path escapes static root');
  }

  return filePath;
}

async function streamFile(filePath: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const stat = await fs.promises.stat(filePath);
  if (!stat.isFile()) {
    throw new Error('not a file');
  }

  res.statusCode = 200;
  res.setHeader('Content-Length', stat.size);
  res.setHeader('Content-Type', getContentType(filePath));

  if (req.method === 'HEAD') {
    res.end();
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    res.on('close', resolve);
    stream.on('end', resolve);
    stream.pipe(res);
  });
}

async function serveStaticRequest(staticDir: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const requestUrl = new URL(req.url || '/', 'http://127.0.0.1');
  const pathname = requestUrl.pathname || '/';
  const requestedExtension = path.extname(pathname);
  const fallbackFile = path.join(path.resolve(staticDir), 'index.html');

  try {
    await streamFile(resolveStaticPath(staticDir, pathname), req, res);
  } catch {
    if (requestedExtension) {
      res.statusCode = 404;
      res.end('Not found');
      return;
    }
    await streamFile(fallbackFile, req, res);
  }
}

function proxyErrorToResponse(error: Error, res: ServerResponse): void {
  if (res.headersSent) {
    res.end();
    return;
  }
  res.statusCode = 502;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({
    status: 502,
    code: 502,
    msg: `Proxy request failed: ${error.message}`,
    data: null,
  }));
}

export async function startLocalServer(options: {
  config: DesktopConfig;
  staticDir: string;
  host?: string;
  port?: number;
}): Promise<LocalServerHandle> {
  const host = options.host || '127.0.0.1';
  const port = options.port ?? 0;
  const proxy = httpProxy.createProxyServer({
    changeOrigin: true,
    ignorePath: false,
    ws: true,
    xfwd: true,
  });

  proxy.on('proxyRes', (proxyRes: { headers: IncomingHttpHeaders }, _req: IncomingMessage, res: ServerResponse) => {
    applySseResponseHeaders(proxyRes.headers, res);
  });

  proxy.on('error', (error: Error, _req: IncomingMessage, res?: ServerResponse | Duplex) => {
    if (res && 'setHeader' in res) {
      proxyErrorToResponse(error, res);
      return;
    }
    if (res && 'destroy' in res && typeof res.destroy === 'function') {
      res.destroy(error);
    }
  });

  const server = http.createServer((req, res) => {
    const requestUrl = new URL(req.url || '/', 'http://127.0.0.1');
    const selection = selectProxyTarget(requestUrl.pathname, options.config);

    if (selection.kind === 'static') {
      void serveStaticRequest(options.staticDir, req, res).catch((error) => {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end(`Failed to serve static asset: ${(error as Error).message}`);
      });
      return;
    }

    proxy.web(req, res, {
      target: selection.target || options.config.baseUrl,
    });
  });

  server.on('upgrade', (req, socket, head) => {
    const requestUrl = new URL(req.url || '/', 'http://127.0.0.1');
    const selection = selectProxyTarget(requestUrl.pathname, options.config);
    if (selection.kind !== 'voice' || !selection.target) {
      socket.destroy();
      return;
    }

    proxy.ws(req, socket, head, {
      target: toWebSocketTarget(selection.target),
    });
  });

  await new Promise<void>((resolve, reject) => {
    const handleError = (error: Error) => {
      server.off('listening', handleListening);
      reject(error);
    };
    const handleListening = () => {
      server.off('error', handleError);
      resolve();
    };
    server.once('error', handleError);
    server.once('listening', handleListening);
    server.listen(port, host);
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to determine local server address');
  }

  return {
    origin: `http://${host}:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        proxy.close();
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      }),
  };
}
