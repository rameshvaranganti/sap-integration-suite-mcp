import type { Config } from './config.js';
type Event = {
  tool?: string;
  operation: string;
  status?: number;
  durationMs?: number;
  correlationId?: string;
};
export class Logger {
  constructor(
    private readonly level: Config['LOG_LEVEL'] = 'info',
    private readonly write: (line: string) => void = (line) =>
      process.stderr.write(line + '\n'),
  ) {}
  info(event: Event) {
    if (!['info', 'debug'].includes(this.level)) return;
    // Deliberately allowlist fields. Request/response bodies and headers never reach the sink.
    this.write(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'info',
        operation: event.operation.replace(/[\r\n]/g, '').slice(0, 80),
        ...(event.tool
          ? { tool: event.tool.replace(/[\r\n]/g, '').slice(0, 80) }
          : {}),
        status: event.status,
        durationMs: event.durationMs,
        correlationId: event.correlationId
          ?.replace(/[^a-zA-Z0-9-]/g, '')
          .slice(0, 80),
      }),
    );
  }
}
