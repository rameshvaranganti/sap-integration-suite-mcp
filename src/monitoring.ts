import { categorize, investigationAreas } from './diagnostics.js';
import { IntegrationError } from './errors.js';
import type { SAPIntegrationSuiteClient } from './sap/client.js';
import type { SearchInput } from './sap/adapter.js';

export class MonitoringService {
  constructor(
    readonly client: SAPIntegrationSuiteClient,
    private readonly now: () => number = Date.now,
  ) {}
  search(input: SearchInput) {
    return this.client.searchMessages(input);
  }
  failed(input: SearchInput & { package?: string }) {
    if (input.package)
      throw new IntegrationError(
        'UNSUPPORTED_FILTER',
        'Package filtering is not supported by the MessageProcessingLogs adapter',
      );
    return this.search({ ...input, status: 'FAILED' });
  }
  recent(minutes: number, integrationFlow: string | undefined, limit: number) {
    const end = this.now();
    return this.failed({
      startTime: new Date(end - minutes * 60000).toISOString(),
      endTime: new Date(end).toISOString(),
      integrationFlow,
      limit,
    });
  }
  async health(input: { startTime?: string; endTime?: string }) {
    const endTime = input.endTime ?? new Date(this.now()).toISOString();
    const startTime =
      input.startTime ?? new Date(Date.parse(endTime) - 86400000).toISOString();
    const result = await this.search({ startTime, endTime, limit: 500 });
    const counts = { completed: 0, failed: 0, processing: 0, other: 0 };
    const failures = new Map<string, number>();
    for (const m of result.messages) {
      if (m.status === 'COMPLETED') counts.completed++;
      else if (m.status === 'FAILED') {
        counts.failed++;
        const flow = m.integrationFlow ?? 'UNKNOWN';
        failures.set(flow, (failures.get(flow) ?? 0) + 1);
      } else if (m.status === 'PROCESSING') counts.processing++;
      else counts.other++;
    }
    const total = result.messages.length;
    return {
      startTime,
      endTime,
      totalMessages: total,
      ...counts,
      successPercentage: total ? (counts.completed / total) * 100 : 0,
      failurePercentage: total ? (counts.failed / total) * 100 : 0,
      integrationsWithMostFailures: [...failures]
        .map(([integrationFlow, failed]) => ({ integrationFlow, failed }))
        .sort(
          (a, b) =>
            b.failed - a.failed ||
            a.integrationFlow.localeCompare(b.integrationFlow),
        ),
      commonErrorCategories: [],
      errorCategoriesAvailable: false,
      truncated: result.truncated,
      scope: result.truncated ? 'bounded_sample' : 'complete_window',
      maxMessages: 500,
    };
  }
  async analyze(messageId: string) {
    const message = await this.client.getMessageDetails(messageId);
    const diagnostics = await this.client.getErrorDetails(messageId);
    const category = categorize(
      'errorText' in diagnostics ? diagnostics.errorText : '',
    );
    const runtimeStatus = message.integrationFlow
      ? await this.client.getIflowStatus(message.integrationFlow)
      : { supported: false, reason: 'Integration flow identifier unavailable' };
    return {
      message,
      integrationFlow: message.integrationFlow,
      timestamps: { startTime: message.startTime, endTime: message.endTime },
      runtimeStatus,
      errorCategory: category,
      sanitizedErrorText:
        'errorText' in diagnostics ? diagnostics.errorText : undefined,
      correlationIdentifier: message.correlationId,
      diagnosticMetadata: diagnostics,
      endpointAdapterMetadata: {
        supported: false,
        reason: 'No endpoint or adapter metadata retrieved by the v1 adapter',
      },
      suggestedInvestigationAreas: investigationAreas[category.category],
      interpretation:
        'Deterministic indicators and investigation areas; not a root-cause determination',
    };
  }
}
