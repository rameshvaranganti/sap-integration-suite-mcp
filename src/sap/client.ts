import { randomUUID } from 'node:crypto';
import type { Config } from '../config.js';
import type { AuthenticationProvider } from '../auth.js';
import { IntegrationError } from '../errors.js';
import { fetchText, parseJson, type Fetch } from '../http.js';
import { Logger } from '../logger.js';
import { safeNextUrl, Sanitizer, trustedUrl } from '../security.js';
import {
  entity,
  identifier,
  normalizeMessage,
  page,
  paths,
  query,
  searchSchema,
  type SearchInput,
} from './adapter.js';

export class SAPIntegrationSuiteClient {
  readonly root: URL;
  constructor(
    private readonly config: Config,
    private readonly auth: AuthenticationProvider,
    readonly sanitizer: Sanitizer,
    private readonly fetcher: Fetch = fetch,
    private readonly logger = new Logger(config.LOG_LEVEL),
    private readonly delay: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms)),
  ) {
    const base = trustedUrl(config.SAP_BASE_URL);
    if (
      base.pathname !== '/' &&
      base.pathname !== '/api/v1' &&
      base.pathname !== '/api/v1/'
    )
      throw new IntegrationError(
        'CONFIGURATION',
        'SAP_BASE_URL must be a tenant origin or /api/v1 service root',
      );
    this.root = new URL('/api/v1/', base);
  }
  private url(path: string, params?: URLSearchParams): URL {
    const url = new URL(path, this.root);
    if (params) url.search = params.toString();
    return url;
  }
  private async request(
    url: URL,
    operation: string,
    plain = false,
  ): Promise<unknown> {
    if (
      url.origin !== this.root.origin ||
      !url.pathname.startsWith(this.root.pathname)
    )
      throw new IntegrationError(
        'UNSAFE_URL',
        'Request URL is outside the configured SAP API',
      );
    const correlationId = randomUUID();
    const started = Date.now();
    let refreshed = false;
    for (let attempt = 0; attempt < 4; attempt++) {
      const token = await this.auth.getToken();
      try {
        const { response, text } = await fetchText(
          this.fetcher,
          url,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: plain ? 'text/plain' : 'application/json',
              'X-Correlation-ID': correlationId,
            },
          },
          this.config.SAP_REQUEST_TIMEOUT_MS,
        );
        this.logger.info({
          operation,
          status: response.status,
          durationMs: Date.now() - started,
          correlationId,
        });
        if (response.status === 401 && !refreshed) {
          this.auth.invalidate(token);
          refreshed = true;
          continue;
        }
        if ([429, 502, 503, 504].includes(response.status) && attempt < 3) {
          const seconds = Number(response.headers.get('retry-after'));
          await this.delay(
            Math.min(5000, seconds > 0 ? seconds * 1000 : 200 * 2 ** attempt),
          );
          continue;
        }
        if (!response.ok)
          throw new IntegrationError(
            response.status === 403
              ? 'AUTHORIZATION'
              : response.status === 404
                ? 'NOT_FOUND'
                : 'SAP_HTTP_ERROR',
            `SAP monitoring request failed (HTTP ${response.status})`,
            response.status,
            correlationId,
          );
        if (plain) return this.sanitizer.text(text);
        const data = parseJson(text);
        if (data && typeof data === 'object' && 'error' in data)
          throw new IntegrationError(
            'SAP_ODATA_ERROR',
            'SAP returned an OData error',
            response.status,
            correlationId,
          );
        return data;
      } catch (error) {
        if (
          error instanceof IntegrationError &&
          error.code === 'CONNECTIVITY' &&
          attempt < 3
        ) {
          await this.delay(200 * 2 ** attempt);
          continue;
        }
        if (error instanceof IntegrationError)
          throw new IntegrationError(
            error.code,
            error.message,
            error.status,
            correlationId,
          );
        throw new IntegrationError(
          'SAP_REQUEST',
          'SAP monitoring request failed',
          undefined,
          correlationId,
        );
      }
    }
    throw new IntegrationError(
      'AUTHENTICATION',
      'SAP rejected refreshed credentials',
      401,
      correlationId,
    );
  }
  async searchMessages(raw: SearchInput) {
    const input = searchSchema.parse(raw);
    let url = this.url(paths.messages, query(input));
    const seen = new Set<string>();
    const messages = [];
    let truncated = false;
    for (let count = 0; count < 100; count++) {
      if (seen.has(url.href))
        throw new IntegrationError(
          'PAGINATION',
          'SAP returned a pagination cycle',
        );
      seen.add(url.href);
      const data = page(await this.request(url, 'messages.search'));
      const remaining: number = input.limit - messages.length;
      messages.push(
        ...data.rows
          .slice(0, remaining)
          .map((row) => normalizeMessage(row, this.sanitizer)),
      );
      if (messages.length >= input.limit) {
        truncated = Boolean(data.next) || data.rows.length > remaining;
        break;
      }
      if (!data.next) return { messages, truncated: false };
      url = safeNextUrl(data.next, url, this.root);
      // Preserve caller filters and projection even when the server next-link omits them.
      for (const [key, value] of query(input))
        if (key !== '$top') url.searchParams.set(key, value);
      url.searchParams.set('$top', String(input.limit - messages.length));
      truncated = true;
    }
    return { messages, truncated };
  }
  async getMessageDetails(id: string) {
    identifier.parse(id);
    return normalizeMessage(
      entity(
        await this.request(
          this.url(paths.message(id), new URLSearchParams({ $format: 'json' })),
          'message.details',
        ),
      ),
      this.sanitizer,
    );
  }
  async getErrorDetails(id: string) {
    identifier.parse(id);
    try {
      return {
        supported: true as const,
        errorText: (await this.request(
          this.url(paths.error(id)),
          'message.error',
          true,
        )) as string,
      };
    } catch (error) {
      if (
        error instanceof IntegrationError &&
        [404, 405, 501].includes(error.status ?? 0)
      )
        return {
          supported: false as const,
          reason: 'Error information is unavailable for this message or tenant',
        };
      throw error;
    }
  }
  async getIflowStatus(id: string) {
    identifier.parse(id);
    try {
      const data = entity(
        await this.request(
          this.url(paths.runtime(id), new URLSearchParams({ $format: 'json' })),
          'iflow.status',
        ),
      );
      return {
        supported: true as const,
        integrationFlow: id,
        status:
          typeof data.Status === 'string'
            ? this.sanitizer.text(data.Status)
            : 'UNKNOWN',
      };
    } catch (error) {
      if (
        error instanceof IntegrationError &&
        [404, 405, 501].includes(error.status ?? 0)
      )
        return {
          supported: false as const,
          reason:
            'Runtime artifact status is unavailable for this integration or tenant',
        };
      throw error;
    }
  }
}
