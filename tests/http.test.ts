import { describe, it, expect } from 'vitest';
import { createHttpApplication } from '../src/transports/http.js';
import { MonitoringService } from '../src/monitoring.js';
import { config, fixture } from './helpers.js';
import { httpRequest as fetch, readMcpResponse } from './transport-helpers.js';

describe('HTTP transport access boundaries', () => {
  async function application() {
    const { client, fetcher } = fixture();
    const app = createHttpApplication(
      {
        ...config,
        MCP_HTTP_TOKEN: 'synthetic-test-token',
        MCP_ALLOWED_HOSTS: 'localhost:3000',
        MCP_ALLOWED_ORIGINS: 'https://trusted.example.test',
      },
      new MonitoringService(client),
    );
    await new Promise<void>((resolve) =>
      app.server.listen(0, '127.0.0.1', resolve),
    );
    const address = app.server.address();
    if (!address || typeof address === 'string')
      throw new Error('No listening address');
    return { ...app, fetcher, url: `http://127.0.0.1:${address.port}` };
  }
  it('requires authentication and rejects foreign hosts and origins', async () => {
    const app = await application();
    try {
      const headers = {
        Host: 'localhost:3000',
        Authorization: 'Bearer synthetic-test-token',
      };
      expect(
        (
          await fetch(app.url + '/health', {
            headers: { Host: 'localhost:3000' },
          })
        ).status,
      ).toBe(401);
      expect(
        (
          await fetch(app.url + '/health', {
            headers: { ...headers, Host: 'attacker.test' },
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await fetch(app.url + '/health', {
            headers: { ...headers, Origin: 'https://attacker.test' },
          })
        ).status,
      ).toBe(403);
      const response = await fetch(app.url + '/health', { headers });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        status: 'ok',
        name: 'sap-integration-suite-mcp',
        version: '0.1.0',
      });
      expect(app.fetcher).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
  it('serves actual MCP tool discovery', async () => {
    const app = await application();
    try {
      const response = await fetch(app.url + '/mcp', {
        method: 'POST',
        headers: {
          Host: 'localhost:3000',
          Authorization: 'Bearer synthetic-test-token',
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          'MCP-Protocol-Version': '2025-03-26',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
          params: {},
        }),
      });
      expect(response.status).toBe(200);
      const body = (await readMcpResponse(response)) as {
        result: { tools: unknown[] };
      };
      expect(body.result.tools).toHaveLength(8);
    } finally {
      await app.close();
    }
  });
});
