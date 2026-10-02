export class IntegrationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status?: number,
    public readonly correlationId?: string,
  ) {
    super(message);
    this.name = 'IntegrationError';
  }
  toJSON() {
    return {
      code: this.code,
      message: this.message,
      status: this.status,
      correlationId: this.correlationId,
    };
  }
}
