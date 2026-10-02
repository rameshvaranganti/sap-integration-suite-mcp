import { z } from 'zod';
import { trustedUrl } from './security.js';
import { IntegrationError } from './errors.js';

const schema = z.object({
  SAP_BASE_URL: z.string().min(1),
  SAP_TOKEN_URL: z.string().min(1),
  SAP_CLIENT_ID: z.string().min(1),
  SAP_CLIENT_SECRET: z.string().min(1),
  SAP_AUTH_MODE: z.literal('oauth2').default('oauth2'),
  SAP_REQUEST_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(100)
    .max(120000)
    .default(30000),
  MCP_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  MCP_HOST: z.string().default('127.0.0.1'),
  MCP_HTTP_TOKEN: z.string().default(''),
  MCP_ALLOWED_HOSTS: z.string().default('localhost:3000,127.0.0.1:3000'),
  MCP_ALLOWED_ORIGINS: z.string().default(''),
  LOG_LEVEL: z
    .enum(['debug', 'info', 'warn', 'error', 'silent'])
    .default('info'),
});
export type Config = z.infer<typeof schema>;
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = schema.safeParse(env);
  if (!result.success)
    throw new IntegrationError(
      'CONFIGURATION',
      `Invalid environment fields: ${result.error.issues.map((i) => i.path.join('.')).join(', ')}`,
    );
  trustedUrl(result.data.SAP_BASE_URL);
  trustedUrl(result.data.SAP_TOKEN_URL);
  if (
    !['127.0.0.1', 'localhost', '::1'].includes(result.data.MCP_HOST) &&
    result.data.MCP_HTTP_TOKEN.length < 32
  )
    throw new IntegrationError(
      'CONFIGURATION',
      'Non-loopback HTTP binds require MCP_HTTP_TOKEN with at least 32 characters',
    );
  return result.data;
}
