import { z } from 'zod';
import { IntegrationError } from '../errors.js';
import type { Sanitizer } from '../security.js';

// Official API reference: https://api.sap.com/api/MessageProcessingLogs/overview
// Centralized OData v2 paths; tenant differences belong here, never in tool inputs.
// TODO: Verify tenant status vocabulary and projection/filter support against
// https://help.sap.com/docs/cloud-integration/sap-cloud-integration/query-options
export const paths = {
  messages: 'MessageProcessingLogs',
  message: (id: string) => `MessageProcessingLogs('${encodeURIComponent(id)}')`,
  error: (id: string) =>
    `MessageProcessingLogs('${encodeURIComponent(id)}')/ErrorInformation/$value`,
  runtime: (id: string) =>
    `IntegrationRuntimeArtifacts('${encodeURIComponent(id)}')`,
};
export const identifier = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[A-Za-z0-9_.:@-]+$/);
export const statuses = z.enum([
  'COMPLETED',
  'FAILED',
  'PROCESSING',
  'RETRY',
  'ESCALATED',
  'CANCELLED',
  'DISCARDED',
  'ABANDONED',
]);
export const timeRange = {
  startTime: z.iso.datetime({ offset: true }).optional(),
  endTime: z.iso.datetime({ offset: true }).optional(),
};
export const searchSchema = z
  .strictObject({
    ...timeRange,
    status: statuses.optional(),
    integrationFlow: identifier.optional(),
    correlationId: identifier.optional(),
    messageId: identifier.optional(),
    limit: z.number().int().min(1).max(500).default(100),
  })
  .refine(
    (v) =>
      !v.startTime ||
      !v.endTime ||
      Date.parse(v.startTime) <= Date.parse(v.endTime),
    'startTime must precede endTime',
  );
export type SearchInput = z.infer<typeof searchSchema>;
export interface Message {
  messageId: string;
  integrationFlow?: string;
  status?: string;
  startTime?: string;
  endTime?: string;
  durationMs?: number;
  correlationId?: string;
}
const record = z.record(z.string(), z.unknown());
export function object(value: unknown): Record<string, unknown> {
  const result = record.safeParse(value);
  if (!result.success)
    throw new IntegrationError(
      'INVALID_RESPONSE',
      'SAP returned an unexpected object',
    );
  return result.data;
}
export function entity(value: unknown): Record<string, unknown> {
  const root = object(value);
  return root.d === undefined ? root : object(root.d);
}
export function page(value: unknown): { rows: unknown[]; next?: string } {
  const data = entity(value);
  const rows = data.results ?? data.value;
  if (!Array.isArray(rows))
    throw new IntegrationError(
      'INVALID_RESPONSE',
      'SAP returned an unexpected collection',
    );
  const next = data.__next ?? data['@odata.nextLink'];
  if (next !== undefined && typeof next !== 'string')
    throw new IntegrationError(
      'INVALID_RESPONSE',
      'SAP returned an invalid pagination link',
    );
  return { rows, next };
}
function date(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const odata = /^\/Date\((-?\d+)(?:[+-]\d{4})?\)\/$/.exec(value);
  const stamp = odata ? Number(odata[1]) : Date.parse(value);
  return Number.isFinite(stamp) && Math.abs(stamp) <= 8.64e15
    ? new Date(stamp).toISOString()
    : undefined;
}
export function normalizeMessage(
  value: unknown,
  sanitizer: Sanitizer,
): Message {
  const data = object(value);
  if (
    typeof data.MessageGuid !== 'string' ||
    !identifier.safeParse(data.MessageGuid).success
  )
    throw new IntegrationError(
      'INVALID_RESPONSE',
      'SAP message identifier is missing or invalid',
    );
  const startTime = date(data.LogStart),
    endTime = date(data.LogEnd);
  const text = (v: unknown) =>
    typeof v === 'string' ? sanitizer.text(v).slice(0, 256) : undefined;
  return {
    messageId: data.MessageGuid,
    integrationFlow: text(data.IntegrationFlowName),
    status: text(data.Status),
    startTime,
    endTime,
    durationMs:
      startTime && endTime
        ? Math.max(0, Date.parse(endTime) - Date.parse(startTime))
        : undefined,
    correlationId: text(data.CorrelationId),
  };
}
export function query(input: SearchInput): URLSearchParams {
  const filters: string[] = [];
  for (const [field, value] of [
    ['Status', input.status],
    ['IntegrationFlowName', input.integrationFlow],
    ['CorrelationId', input.correlationId],
    ['MessageGuid', input.messageId],
  ])
    if (value) filters.push(`${field} eq '${value}'`);
  if (input.startTime)
    filters.push(
      `LogStart ge datetime'${new Date(input.startTime).toISOString().replace('Z', '')}'`,
    );
  if (input.endTime)
    filters.push(
      `LogStart le datetime'${new Date(input.endTime).toISOString().replace('Z', '')}'`,
    );
  const params = new URLSearchParams({
    $format: 'json',
    $top: String(input.limit),
    $orderby: 'LogStart desc',
    $select:
      'MessageGuid,IntegrationFlowName,Status,LogStart,LogEnd,CorrelationId',
  });
  if (filters.length) params.set('$filter', filters.join(' and '));
  return params;
}
