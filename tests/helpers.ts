import { vi } from 'vitest';
import { loadConfig } from '../src/config.js';
import { Sanitizer } from '../src/security.js';
import { OAuthClientCredentials } from '../src/auth.js';
import { SAPIntegrationSuiteClient } from '../src/sap/client.js';
export const config = loadConfig({
  SAP_BASE_URL: 'https://tenant.example.test',
  SAP_TOKEN_URL: 'https://auth.example.test/oauth/token',
  SAP_CLIENT_ID: 'test-client',
  SAP_CLIENT_SECRET: 'test-secret',
  LOG_LEVEL: 'silent',
});
export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
export const tokenResponse = () =>
  json({ access_token: 'test-token', token_type: 'Bearer', expires_in: 100 });
export const message = (
  id = 'ABC123',
  status = 'FAILED',
  flow = 'SALESFORCE_TO_S4',
) => ({
  MessageGuid: id,
  Status: status,
  IntegrationFlowName: flow,
  LogStart: '/Date(1767225600000)/',
  LogEnd: '/Date(1767225601500)/',
  CorrelationId: 'correlation-1',
});
export function fixture() {
  const fetcher = vi.fn<typeof fetch>();
  const sanitizer = new Sanitizer([config.SAP_CLIENT_SECRET]);
  const auth = new OAuthClientCredentials(config, sanitizer, fetcher);
  const delay = vi.fn(async () => {});
  const client = new SAPIntegrationSuiteClient(
    config,
    auth,
    sanitizer,
    fetcher,
    undefined,
    delay,
  );
  return { fetcher, sanitizer, auth, client, delay };
}
