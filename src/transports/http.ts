import {
  createServer as createHttpServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import type { Config } from '../config.js';
import type { MonitoringService } from '../monitoring.js';
import { createServer } from '../mcp.js';
import { Logger } from '../logger.js';

export function httpGuard(
  config: Config,
  req: IncomingMessage,
  res: ServerResponse,
): boolean {
  const reject = (status: number) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({ error: status === 401 ? 'Unauthorized' : 'Forbidden' }),
    );
    return false;
  };
  if (
    !config.MCP_ALLOWED_HOSTS.split(',')
      .map((s) => s.trim())
      .includes(req.headers.host ?? '')
  )
    return reject(403);
  const origin = req.headers.origin;
  if (
    origin &&
    !config.MCP_ALLOWED_ORIGINS.split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .includes(origin)
  )
    return reject(403);
  if (config.MCP_HTTP_TOKEN) {
    const supplied = Buffer.from(req.headers.authorization ?? '');
    const expected = Buffer.from(`Bearer ${config.MCP_HTTP_TOKEN}`);
    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    )
      return reject(401);
  }
  return true;
}
export function createHttpApplication(
  config: Config,
  service: MonitoringService,
) {
  const logger = new Logger(config.LOG_LEVEL);
  const handler = createMcpHandler(() => createServer(service, logger), {
    responseMode: 'json',
  });
  const nodeHandler = toNodeHandler(handler, { maxRequestBodySize: 65536 });
  const server = createHttpServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (!httpGuard(config, req, res)) return;
    if (req.url === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'ok',
          name: 'sap-integration-suite-mcp',
          version: '0.1.0',
        }),
      );
      return;
    }
    if (req.url !== '/mcp') {
      res.writeHead(404);
      res.end();
      return;
    }
    if (!['POST', 'GET', 'DELETE'].includes(req.method ?? '')) {
      res.writeHead(405, { Allow: 'POST, GET, DELETE' });
      res.end();
      return;
    }
    const size = Number(req.headers['content-length']);
    if (size > 65536) {
      res.writeHead(413);
      res.end();
      return;
    }
    void nodeHandler(req, res).catch(() => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  });
  server.requestTimeout = 120000;
  server.headersTimeout = 10000;
  server.maxHeadersCount = 50;
  return {
    server,
    close: async () => {
      await handler.close();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeIdleConnections();
      });
    },
  };
}
