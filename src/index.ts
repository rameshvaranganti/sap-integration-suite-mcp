#!/usr/bin/env node
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { loadConfig } from './config.js';
import { OAuthClientCredentials } from './auth.js';
import { Sanitizer } from './security.js';
import { SAPIntegrationSuiteClient } from './sap/client.js';
import { MonitoringService } from './monitoring.js';
import { createServer } from './mcp.js';
import { createHttpApplication } from './transports/http.js';
import { Logger } from './logger.js';

try {
  const config = loadConfig();
  const sanitizer = new Sanitizer([
    config.SAP_CLIENT_SECRET,
    config.SAP_CLIENT_ID,
    config.MCP_HTTP_TOKEN,
  ]);
  const auth = new OAuthClientCredentials(config, sanitizer);
  const service = new MonitoringService(
    new SAPIntegrationSuiteClient(config, auth, sanitizer),
  );
  if (process.argv.includes('--http')) {
    const application = createHttpApplication(config, service);
    application.server.listen(config.MCP_PORT, config.MCP_HOST);
    for (const signal of ['SIGINT', 'SIGTERM'] as const)
      process.once(signal, () => {
        void application.close().then(() => process.exit(0));
      });
  } else {
    await serveStdio(() => createServer(service, new Logger(config.LOG_LEVEL)));
  }
} catch {
  process.stderr.write(
    JSON.stringify({
      level: 'error',
      operation: 'startup.failed',
      message: 'Server startup failed. Verify environment configuration.',
    }) + '\n',
  );
  process.exitCode = 1;
}
