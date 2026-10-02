import { z } from 'zod';
import type { Config } from './config.js';
import { IntegrationError } from './errors.js';
import { fetchText, parseJson, type Fetch } from './http.js';
import { Sanitizer, trustedUrl } from './security.js';

export interface AuthenticationProvider {
  getToken(): Promise<string>;
  invalidate(token: string): void;
}
export class OAuthClientCredentials implements AuthenticationProvider {
  private cached?: { token: string; expiresAt: number };
  private pending?: Promise<string>;
  constructor(
    private readonly config: Config,
    private readonly sanitizer: Sanitizer,
    private readonly fetcher: Fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}
  invalidate(token: string) {
    if (this.cached?.token === token) this.cached = undefined;
  }
  async getToken(): Promise<string> {
    if (this.cached && this.now() < this.cached.expiresAt)
      return this.cached.token;
    if (this.pending) return this.pending;
    this.pending = this.acquire();
    try {
      return await this.pending;
    } finally {
      this.pending = undefined;
    }
  }
  private async acquire(): Promise<string> {
    const started = this.now();
    const { response, text } = await fetchText(
      this.fetcher,
      trustedUrl(this.config.SAP_TOKEN_URL),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization:
            'Basic ' +
            Buffer.from(
              `${encodeURIComponent(this.config.SAP_CLIENT_ID)}:${encodeURIComponent(this.config.SAP_CLIENT_SECRET)}`,
            ).toString('base64'),
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
        }).toString(),
      },
      this.config.SAP_REQUEST_TIMEOUT_MS,
      65536,
    );
    if (!response.ok)
      throw new IntegrationError(
        'AUTHENTICATION',
        'SAP OAuth authentication failed',
        response.status,
      );
    const token = z
      .object({
        access_token: z
          .string()
          .min(1)
          .max(16384)
          .regex(/^[A-Za-z0-9._~+/-]+=*$/),
        token_type: z.string().refine((s) => s.toLowerCase() === 'bearer'),
        expires_in: z.coerce.number().positive().max(86400),
      })
      .safeParse(parseJson(text));
    if (!token.success)
      throw new IntegrationError(
        'AUTHENTICATION',
        'SAP OAuth returned an invalid token response',
      );
    this.sanitizer.addSecret(token.data.access_token);
    const lifetime = token.data.expires_in * 1000;
    this.cached = {
      token: token.data.access_token,
      expiresAt: started + lifetime - Math.min(30000, lifetime * 0.1),
    };
    return token.data.access_token;
  }
}
