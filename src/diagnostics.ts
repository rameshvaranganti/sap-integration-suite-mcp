export const categories = [
  'AUTHENTICATION',
  'AUTHORIZATION',
  'HTTP_4XX',
  'HTTP_5XX',
  'TIMEOUT',
  'CONNECTIVITY',
  'SFTP',
  'CERTIFICATE',
  'MAPPING',
  'TRANSFORMATION',
  'PAYLOAD_VALIDATION',
  'RATE_LIMIT',
  'OAUTH',
  'UNKNOWN',
] as const;
export type Category = (typeof categories)[number];
const rules: [Category, RegExp, string][] = [
  [
    'RATE_LIMIT',
    /\b429\b|rate limit|too many requests/i,
    'Rate limiting indicator',
  ],
  [
    'OAUTH',
    /\boauth\b|invalid_grant|invalid_client/i,
    'OAuth protocol indicator',
  ],
  [
    'CERTIFICATE',
    /certificate|PKIX|SSLHandshake|trust anchor/i,
    'Certificate or TLS indicator',
  ],
  [
    'AUTHENTICATION',
    /\b401\b|unauthenticated|authentication failed|invalid credentials/i,
    'Authentication rejection indicator',
  ],
  [
    'AUTHORIZATION',
    /\b403\b|forbidden|not authorized|permission denied/i,
    'Authorization rejection indicator',
  ],
  [
    'TIMEOUT',
    /timed?\s*out|timeout|SocketTimeoutException/i,
    'Timeout indicator',
  ],
  ['SFTP', /\bsftp\b|JSchException/i, 'SFTP indicator'],
  [
    'CONNECTIVITY',
    /connection refused|unknown host|UnknownHostException|connection reset|DNS/i,
    'Network connection indicator',
  ],
  ['MAPPING', /mapping|ValueMapping|MessageMapping/i, 'Mapping indicator'],
  [
    'TRANSFORMATION',
    /\bxslt\b|transform(?:ation)?|Saxon/i,
    'Transformation indicator',
  ],
  [
    'PAYLOAD_VALIDATION',
    /schema validation|invalid payload|SAXParseException|malformed (?:xml|json)/i,
    'Payload validation indicator',
  ],
  [
    'HTTP_5XX',
    /\b(?:HTTP(?: status)?\s*[:=]?\s*|status(?: code)?\s*[:=]?\s*)5\d{2}\b/i,
    'HTTP server error indicator',
  ],
  [
    'HTTP_4XX',
    /\b(?:HTTP(?: status)?\s*[:=]?\s*|status(?: code)?\s*[:=]?\s*)4\d{2}\b/i,
    'HTTP client error indicator',
  ],
];
export function categorize(text = ''): {
  category: Category;
  confidence: 'low' | 'medium' | 'high';
  evidence: string[];
} {
  const matches = rules.filter(([, pattern]) => pattern.test(text));
  if (!matches.length)
    return { category: 'UNKNOWN', confidence: 'low', evidence: [] };
  return {
    category: matches[0]![0],
    confidence: matches.length === 1 ? 'medium' : 'low',
    evidence: matches.map(([, , evidence]) => evidence),
  };
}
export const investigationAreas: Record<Category, string[]> = {
  AUTHENTICATION: [
    'Verify credential validity and authentication configuration',
  ],
  AUTHORIZATION: ['Verify API permissions with the tenant administrator'],
  HTTP_4XX: ['Check receiver request contract and status code'],
  HTTP_5XX: ['Check receiver availability and server logs'],
  TIMEOUT: ['Check receiver latency and timeout configuration'],
  CONNECTIVITY: ['Check DNS, routing and receiver reachability'],
  SFTP: ['Check SFTP connectivity and host key configuration'],
  CERTIFICATE: ['Check certificate validity and trust chain'],
  MAPPING: ['Check mapping inputs and value mappings'],
  TRANSFORMATION: ['Check transformation rules and input structure'],
  PAYLOAD_VALIDATION: ['Check input format against the expected schema'],
  RATE_LIMIT: ['Check receiver quotas and throttling'],
  OAUTH: ['Check OAuth grant configuration and credential validity'],
  UNKNOWN: ['Review tenant monitoring logs and receiver diagnostics'],
};
