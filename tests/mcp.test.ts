import { describe, it, expect } from 'vitest';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { createServer } from '../src/mcp.js';
import { MonitoringService } from '../src/monitoring.js';
import { fixture } from './helpers.js';
import { readMcpResponse } from './transport-helpers.js';
const headers = {
  'Content-Type': 'application/json',
  Accept: 'application/json, text/event-stream',
  'MCP-Protocol-Version': '2025-03-26',
};
describe('MCP protocol registration and validation', () => {
  it('lists exactly the eight read-only tools', async () => {
    const { client } = fixture();
    const handler = createMcpHandler(
      () => createServer(new MonitoringService(client)),
      { responseMode: 'json' },
    );
    try {
      const response = await handler.fetch(
        new Request('http://localhost/mcp', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/list',
            params: {},
          }),
        }),
      );
      const body = (await readMcpResponse(response)) as {
        result: {
          tools: { name: string; annotations: { readOnlyHint: boolean } }[];
        };
      };
      expect(body.result.tools.map((t) => t.name).sort()).toEqual(
        [
          'analyze_failure',
          'get_error_details',
          'get_failed_messages',
          'get_iflow_status',
          'get_message_details',
          'get_recent_failures',
          'search_messages',
          'summarize_integration_health',
        ].sort(),
      );
      expect(body.result.tools.every((t) => t.annotations.readOnlyHint)).toBe(
        true,
      );
    } finally {
      await handler.close();
    }
  });
  it('rejects a caller limit above the maximum before any SAP request', async () => {
    const { client, fetcher } = fixture();
    const handler = createMcpHandler(
      () => createServer(new MonitoringService(client)),
      { responseMode: 'json' },
    );
    try {
      const response = await handler.fetch(
        new Request('http://localhost/mcp', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: { name: 'search_messages', arguments: { limit: 501 } },
          }),
        }),
      );
      const body = (await readMcpResponse(response)) as {
        error?: unknown;
        result?: { isError?: boolean };
      };
      expect(Boolean(body.error) || body.result?.isError).toBe(true);
      expect(fetcher).not.toHaveBeenCalled();
    } finally {
      await handler.close();
    }
  });
});
