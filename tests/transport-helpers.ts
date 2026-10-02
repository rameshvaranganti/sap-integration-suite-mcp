import { request } from 'node:http';

// Use node:http so tests can send an explicit Host header on Node 24.
export function httpRequest(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        method: init.method,
        headers: Object.fromEntries(new Headers(init.headers)),
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('error', reject);
        res.on('end', () =>
          resolve(
            new Response(Buffer.concat(chunks), {
              status: res.statusCode,
              headers: { 'Content-Type': res.headers['content-type'] ?? '' },
            }),
          ),
        );
      },
    );
    req.on('error', reject);
    req.end(init.body);
  });
}

// Legacy MCP requests may receive an SSE response even in JSON response mode.
export async function readMcpResponse(response: Response): Promise<unknown> {
  if (!response.headers.get('content-type')?.includes('text/event-stream'))
    return response.json();
  const text = await response.text();
  const data = text.split(/\r?\n/).find((line) => line.startsWith('data:'));
  if (!data) throw new Error('Missing MCP response data');
  return JSON.parse(data.slice(5));
}
