import { describe, it, expect, vi } from 'vitest';
import { fixture, json, message, tokenResponse } from './helpers.js';
import { fetchText } from '../src/http.js';

describe('SAP monitoring HTTP adapter', () => {
  it('retrieves normalized metadata and safely encodes queries', async () => {
    const { fetcher, client } = fixture();
    fetcher
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(json({ d: { results: [message()] } }));
    const result = await client.searchMessages({
      status: 'FAILED',
      integrationFlow: 'SALESFORCE_TO_S4',
      limit: 10,
    });
    expect(result.messages[0]).toMatchObject({
      messageId: 'ABC123',
      status: 'FAILED',
      durationMs: 1500,
    });
    const url = fetcher.mock.calls[1]![0] as URL;
    expect(url.origin).toBe('https://tenant.example.test');
    expect(url.searchParams.get('$filter')).toContain("Status eq 'FAILED'");
    expect(fetcher.mock.calls[1]![1]!.method).toBe('GET');
  });
  it('follows pagination and enforces the overall limit', async () => {
    const { fetcher, client } = fixture();
    fetcher
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        json({
          d: {
            results: [message('A')],
            __next:
              'https://tenant.example.test/api/v1/MessageProcessingLogs?$skiptoken=next',
          },
        }),
      )
      .mockResolvedValueOnce(
        json({ d: { results: [message('B'), message('C')] } }),
      );
    const result = await client.searchMessages({ limit: 2 });
    expect(result.messages.map((m) => m.messageId)).toEqual(['A', 'B']);
    expect(result.truncated).toBe(true);
  });
  it('rejects foreign pagination before sending a token', async () => {
    const { fetcher, client } = fixture();
    fetcher.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(
      json({
        d: {
          results: [],
          __next: 'https://attacker.test/api/v1/MessageProcessingLogs',
        },
      }),
    );
    await expect(client.searchMessages({ limit: 2 })).rejects.toMatchObject({
      code: 'UNSAFE_URL',
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('refreshes credentials once on 401', async () => {
    const { fetcher, client } = fixture();
    fetcher
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(json({}, 401))
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(json({ d: message() }));
    expect((await client.getMessageDetails('ABC123')).messageId).toBe('ABC123');
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it('retries safe transient failures', async () => {
    const { fetcher, client, delay } = fixture();
    fetcher
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(json({}, 503))
      .mockResolvedValueOnce(json({ d: message() }));
    await client.getMessageDetails('ABC123');
    expect(delay).toHaveBeenCalledTimes(1);
  });
  it('does not expose raw SAP errors', async () => {
    const { fetcher, client } = fixture();
    fetcher
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        json({ error: { message: 'password=secret' } }, 403),
      );
    await expect(client.getMessageDetails('ABC123')).rejects.toMatchObject({
      code: 'AUTHORIZATION',
      message: 'SAP monitoring request failed (HTTP 403)',
    });
  });
  it('recognizes OData errors and malformed responses', async () => {
    const { fetcher, client } = fixture();
    fetcher
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(json({ error: { message: 'secret' } }));
    await expect(client.getMessageDetails('ABC123')).rejects.toMatchObject({
      code: 'SAP_ODATA_ERROR',
    });
  });
  it('reports unavailable runtime APIs explicitly', async () => {
    const { fetcher, client } = fixture();
    fetcher
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(json({}, 404));
    expect(await client.getIflowStatus('FLOW')).toMatchObject({
      supported: false,
    });
  });
  it('sanitizes diagnostic text', async () => {
    const { fetcher, client } = fixture();
    fetcher
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        new Response(
          'OAuth failed: password=secret Bearer test-token test-secret',
        ),
      );
    const result = await client.getErrorDetails('ABC123');
    expect(result).toMatchObject({ supported: true });
    expect(JSON.stringify(result)).not.toContain('test-secret');
    expect(JSON.stringify(result)).not.toContain('test-token');
  });
  it('aborts timed out requests', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(
        (_url, init) =>
          new Promise((_resolve, reject) =>
            init!.signal!.addEventListener('abort', () =>
              reject(new Error('aborted')),
            ),
          ),
      );
    await expect(
      fetchText(fetcher, new URL('https://tenant.example.test'), {}, 10),
    ).rejects.toMatchObject({ code: 'TIMEOUT' });
  });
  it('limits response bytes', async () => {
    await expect(
      fetchText(
        vi.fn<typeof fetch>().mockResolvedValue(new Response('too long')),
        new URL('https://tenant.example.test'),
        {},
        1000,
        2,
      ),
    ).rejects.toMatchObject({ code: 'RESPONSE_LIMIT' });
  });
});
