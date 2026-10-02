import { describe, it, expect } from 'vitest';
import { Sanitizer, safeNextUrl, trustedUrl } from '../src/security.js';
import { searchSchema } from '../src/sap/adapter.js';
import { loadConfig } from '../src/config.js';
import { Logger } from '../src/logger.js';
import { categorize } from '../src/diagnostics.js';
describe('security boundaries', () => {
  it('redacts secrets, tokens, URLs, emails and control characters', () => {
    const s = new Sanitizer(['my-secret']);
    const output = s.text(
      'my-secret Bearer token password=abc access_token=xyz https://user:pass@example.test/?token=abc employee@example.test\nforged',
    );
    for (const secret of [
      'my-secret',
      'Bearer token',
      'password=abc',
      'access_token=xyz',
      'user:pass',
      'employee@example.test',
      '\n',
    ])
      expect(output).not.toContain(secret);
  });
  it.each([
    'http://tenant.test',
    'https://user:pass@tenant.test',
    'https://tenant.test/?q=1',
    'https://tenant.test/#x',
  ])('rejects unsafe configured URL %s', (url) =>
    expect(() => trustedUrl(url)).toThrow(),
  );
  it('restricts pagination paths and userinfo', () => {
    const root = new URL('https://tenant.test/api/v1/');
    expect(() =>
      safeNextUrl(
        'https://user:pass@tenant.test/api/v1/MessageProcessingLogs',
        root,
        root,
      ),
    ).toThrow();
    expect(() =>
      safeNextUrl('/api/v1/IntegrationRuntimeArtifacts', root, root),
    ).toThrow();
  });
  it.each([0, 501, 1.5])('rejects unsafe limit %s', (limit) =>
    expect(searchSchema.safeParse({ limit }).success).toBe(false),
  );
  it.each([
    { integrationFlow: "a' or 1 eq 1" },
    { messageId: '../x' },
    { baseUrl: 'https://attacker.test' },
    { startTime: 'yesterday' },
    { startTime: '2026-02-02T00:00:00Z', endTime: '2026-02-01T00:00:00Z' },
  ])('rejects invalid tool input', (input) =>
    expect(searchSchema.safeParse(input).success).toBe(false),
  );
  it('does not leak configuration values on validation failure', () => {
    expect(() => loadConfig({ SAP_CLIENT_SECRET: 'very-secret' })).toThrow(
      /Invalid environment fields/,
    );
  });
  it('allowlists structured log fields and prevents log injection', () => {
    const lines: string[] = [];
    new Logger('info', (line) => lines.push(line)).info({
      operation: 'read\nforged',
      correlationId: 'id\nforged',
    });
    expect(lines[0]).not.toContain('\n');
    expect(JSON.parse(lines[0]!).operation).toBe('readforged');
  });
});
describe('deterministic categories', () => {
  it.each([
    ['HTTP 401', 'AUTHENTICATION'],
    ['HTTP 403', 'AUTHORIZATION'],
    ['HTTP 404', 'HTTP_4XX'],
    ['HTTP 503', 'HTTP_5XX'],
    ['SocketTimeoutException', 'TIMEOUT'],
    ['connection refused', 'CONNECTIVITY'],
    ['SFTP failure', 'SFTP'],
    ['PKIX certificate failure', 'CERTIFICATE'],
    ['message mapping failed', 'MAPPING'],
    ['XSLT failed', 'TRANSFORMATION'],
    ['invalid payload', 'PAYLOAD_VALIDATION'],
    ['HTTP 429', 'RATE_LIMIT'],
    ['invalid_client OAuth', 'OAUTH'],
    ['nothing specific', 'UNKNOWN'],
  ])('%s maps to %s', (text, category) => {
    const result = categorize(text);
    expect(result.category).toBe(category);
    expect(result.confidence).not.toBe('high');
  });
  it('reduces confidence for ambiguous evidence', () =>
    expect(categorize('SFTP connection refused').confidence).toBe('low'));
});
