// Dependency-free checks for the security utilities when npm is unavailable.
// This supplements, and does not replace, lint/typecheck/Vitest/build.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';

const directory = await mkdtemp(join(tmpdir(), 'sap-mcp-verification-'));
let passed = 0;
function check(operation) {
  operation();
  passed++;
}
try {
  await writeFile(join(directory, 'package.json'), '{"type":"module"}');
  for (const name of [
    'errors',
    'security',
    'http',
    'diagnostics',
    'logger',
    'monitoring',
  ]) {
    const source = await readFile(
      new URL(`../src/${name}.ts`, import.meta.url),
      'utf8',
    );
    await writeFile(
      join(directory, `${name}.js`),
      stripTypeScriptTypes(source, { mode: 'transform' }),
    );
  }
  const load = (name) =>
    import(pathToFileURL(join(directory, `${name}.js`)).href);
  const { Sanitizer, trustedUrl, safeNextUrl } = await load('security');
  const { categorize } = await load('diagnostics');
  const { fetchText } = await load('http');
  const { Logger } = await load('logger');
  const { MonitoringService } = await load('monitoring');
  const sanitizer = new Sanitizer(['synthetic-secret']);
  check(() =>
    assert(
      !sanitizer
        .text('synthetic-secret Bearer abc password=xyz\nforged')
        .includes('synthetic-secret'),
    ),
  );
  check(() => assert(!sanitizer.text('Bearer abc').includes('abc')));
  check(() => assert(!sanitizer.text('password=xyz').includes('xyz')));
  check(() => assert(!sanitizer.text('a\nforged').includes('\n')));
  for (const value of [
    'http://tenant.test',
    'https://u:p@tenant.test',
    'https://tenant.test/?q=1',
    'https://tenant.test/#x',
  ]) {
    check(() => assert.throws(() => trustedUrl(value)));
  }
  const root = new URL('https://tenant.test/api/v1/');
  check(() =>
    assert.throws(() =>
      safeNextUrl(
        'https://other.test/api/v1/MessageProcessingLogs',
        root,
        root,
      ),
    ),
  );
  check(() =>
    assert.throws(() =>
      safeNextUrl('/api/v1/IntegrationRuntimeArtifacts', root, root),
    ),
  );
  check(() =>
    assert.equal(
      safeNextUrl('/api/v1/MessageProcessingLogs?$skip=1', root, root).origin,
      root.origin,
    ),
  );
  for (const [text, category] of [
    ['HTTP 401', 'AUTHENTICATION'],
    ['HTTP 403', 'AUTHORIZATION'],
    ['HTTP 404', 'HTTP_4XX'],
    ['HTTP 503', 'HTTP_5XX'],
    ['SocketTimeoutException', 'TIMEOUT'],
    ['connection refused', 'CONNECTIVITY'],
    ['SFTP failure', 'SFTP'],
    ['PKIX failure', 'CERTIFICATE'],
    ['mapping failed', 'MAPPING'],
    ['XSLT failed', 'TRANSFORMATION'],
    ['invalid payload', 'PAYLOAD_VALIDATION'],
    ['HTTP 429', 'RATE_LIMIT'],
    ['invalid_client', 'OAUTH'],
    ['unknown issue', 'UNKNOWN'],
  ]) {
    check(() => assert.equal(categorize(text).category, category));
  }
  const lines = [];
  new Logger('info', (line) => lines.push(line)).info({
    operation: 'read\nforged',
    correlationId: 'abc\r\n123',
  });
  check(() => assert(!lines[0].includes('\n')));
  await assert.rejects(
    fetchText(async () => new Response('long response'), root, {}, 1000, 2),
    { code: 'RESPONSE_LIMIT' },
  );
  passed++;
  await assert.rejects(
    fetchText(
      (_url, init) =>
        new Promise((_resolve, reject) =>
          init.signal.addEventListener('abort', () =>
            reject(new Error('aborted')),
          ),
        ),
      root,
      {},
      10,
    ),
    { code: 'TIMEOUT' },
  );
  passed++;
  const service = new MonitoringService(
    {
      searchMessages: async () => ({
        messages: [
          { messageId: 'A', status: 'COMPLETED' },
          { messageId: 'B', status: 'FAILED', integrationFlow: 'FLOW' },
          { messageId: 'C', status: 'PROCESSING' },
          { messageId: 'D', status: 'FAILED', integrationFlow: 'FLOW' },
        ],
        truncated: true,
      }),
    },
    () => Date.parse('2026-01-02T00:00:00Z'),
  );
  const health = await service.health({});
  check(() => assert.equal(health.totalMessages, 4));
  check(() => assert.equal(health.failurePercentage, 50));
  check(() => assert.equal(health.successPercentage, 25));
  check(() => assert.equal(health.scope, 'bounded_sample'));
  check(() =>
    assert.deepEqual(health.integrationsWithMostFailures, [
      { integrationFlow: 'FLOW', failed: 2 },
    ]),
  );
  console.log(
    `${passed} dependency-free behavior checks passed. Full toolchain validation is still required.`,
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
