import { IntegrationError } from './errors.js';
export type Fetch = typeof globalThis.fetch;
export async function fetchText(
  fetcher: Fetch,
  url: URL,
  init: RequestInit,
  timeoutMs: number,
  maxBytes = 2_000_000,
): Promise<{ response: Response; text: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, {
      ...init,
      redirect: 'error',
      signal: controller.signal,
    });
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      for (;;) {
        const item = await reader.read();
        if (item.done) break;
        size += item.value.byteLength;
        if (size > maxBytes) {
          await reader.cancel();
          throw new IntegrationError(
            'RESPONSE_LIMIT',
            'SAP response exceeded the safe size limit',
          );
        }
        chunks.push(item.value);
      }
    }
    return { response, text: Buffer.concat(chunks).toString('utf8') };
  } catch (error) {
    if (error instanceof IntegrationError) throw error;
    throw new IntegrationError(
      controller.signal.aborted ? 'TIMEOUT' : 'CONNECTIVITY',
      controller.signal.aborted
        ? 'SAP request timed out'
        : 'SAP request failed',
    );
  } finally {
    clearTimeout(timer);
  }
}
export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new IntegrationError('INVALID_RESPONSE', 'SAP returned invalid JSON');
  }
}
