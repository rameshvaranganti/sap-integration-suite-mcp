import { describe, it, expect } from 'vitest';
import { MonitoringService } from '../src/monitoring.js';
import { fixture, json, message, tokenResponse } from './helpers.js';
describe('monitoring calculations', () => {
  it('calculates deterministic health statistics and sorts failure counts', async () => {
    const { client, fetcher } = fixture();
    fetcher.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(
      json({
        d: {
          results: [
            message('A', 'COMPLETED'),
            message('B', 'FAILED', 'Z'),
            message('C', 'FAILED', 'Z'),
            message('D', 'PROCESSING'),
          ],
        },
      }),
    );
    const result = await new MonitoringService(client, () =>
      Date.parse('2026-01-02T00:00:00Z'),
    ).health({});
    expect(result).toMatchObject({
      totalMessages: 4,
      completed: 1,
      failed: 2,
      processing: 1,
      successPercentage: 25,
      failurePercentage: 50,
      scope: 'complete_window',
      startTime: '2026-01-01T00:00:00.000Z',
    });
    expect(result.integrationsWithMostFailures).toEqual([
      { integrationFlow: 'Z', failed: 2 },
    ]);
  });
  it('returns finite percentages for no messages', async () => {
    const { client, fetcher } = fixture();
    fetcher
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(json({ d: { results: [] } }));
    expect(await new MonitoringService(client).health({})).toMatchObject({
      totalMessages: 0,
      successPercentage: 0,
      failurePercentage: 0,
    });
  });
  it('marks capped statistics as a sample', async () => {
    const { client, fetcher } = fixture();
    fetcher.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(
      json({
        d: {
          results: Array.from({ length: 500 }, (_, i) => message(String(i))),
          __next: 'MessageProcessingLogs?$skip=500',
        },
      }),
    );
    expect(await new MonitoringService(client).health({})).toMatchObject({
      truncated: true,
      scope: 'bounded_sample',
    });
  });
  it('rejects unsupported package filtering', () => {
    const { client } = fixture();
    expect(() =>
      new MonitoringService(client).failed({ limit: 5, package: 'PACKAGE' }),
    ).toThrow(/not supported/);
  });
  it('computes a recent UTC window', async () => {
    const { client, fetcher } = fixture();
    fetcher
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(json({ d: { results: [] } }));
    await new MonitoringService(client, () =>
      Date.parse('2026-01-02T00:00:00Z'),
    ).recent(60, 'FLOW', 10);
    expect(
      (fetcher.mock.calls[1]![0] as URL).searchParams.get('$filter'),
    ).toContain('2026-01-01T23:00:00.000');
  });
});
