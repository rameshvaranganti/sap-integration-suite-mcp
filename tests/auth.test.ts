import { describe, it, expect, vi } from 'vitest';
import { OAuthClientCredentials } from '../src/auth.js';
import { Sanitizer } from '../src/security.js';
import { config, fixture, json, tokenResponse } from './helpers.js';

describe('OAuth client credentials', () => {
  it('authenticates using an encoded Basic credential and reuses tokens', async () => {
    const { fetcher, auth } = fixture();
    fetcher.mockResolvedValueOnce(tokenResponse());
    expect(await auth.getToken()).toBe('test-token');
    expect(await auth.getToken()).toBe('test-token');
    expect(fetcher).toHaveBeenCalledTimes(1);
    const init = fetcher.mock.calls[0]![1]!;
    expect(init.method).toBe('POST');
    expect(init.body).toBe('grant_type=client_credentials');
    expect(new Headers(init.headers).get('authorization')).toMatch(/^Basic /);
    expect(init.redirect).toBe('error');
  });
  it('coalesces concurrent authentication requests', async () => {
    const { fetcher, auth } = fixture();
    fetcher.mockResolvedValueOnce(tokenResponse());
    expect(await Promise.all([auth.getToken(), auth.getToken()])).toEqual([
      'test-token',
      'test-token',
    ]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('refreshes shortly before expiry and after invalidation', async () => {
    let now = 0;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => tokenResponse());
    const auth = new OAuthClientCredentials(
      config,
      new Sanitizer(),
      fetcher,
      () => now,
    );
    await auth.getToken();
    now = 89999;
    await auth.getToken();
    expect(fetcher).toHaveBeenCalledTimes(1);
    now = 90000;
    await auth.getToken();
    expect(fetcher).toHaveBeenCalledTimes(2);
    auth.invalidate('test-token');
    await auth.getToken();
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it('normalizes failed authentication without leaking response bodies', async () => {
    const { fetcher, auth } = fixture();
    fetcher.mockResolvedValueOnce(json({ error: 'test-secret' }, 401));
    await expect(auth.getToken()).rejects.toMatchObject({
      code: 'AUTHENTICATION',
      message: 'SAP OAuth authentication failed',
    });
  });
  it('rejects malformed token responses', async () => {
    const { fetcher, auth } = fixture();
    fetcher.mockResolvedValueOnce(json({ access_token: 'bad\r\ntoken' }));
    await expect(auth.getToken()).rejects.toMatchObject({
      code: 'AUTHENTICATION',
    });
  });
});
