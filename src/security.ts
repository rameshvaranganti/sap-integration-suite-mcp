import { IntegrationError } from './errors.js';

export class Sanitizer {
  private readonly secrets = new Set<string>();
  constructor(secrets: string[] = []) {
    secrets.forEach((s) => this.addSecret(s));
  }
  addSecret(value: string) {
    if (value) this.secrets.add(value);
  }
  text(value: string): string {
    let text = value;
    for (const secret of this.secrets)
      text = text.split(secret).join('[REDACTED]');
    return (
      text
        .replace(
          /\b(?:Bearer|Basic)\s+[A-Za-z0-9+/=_\-.]+/gi,
          '[REDACTED_AUTH]',
        )
        .replace(
          /(["']?(?:password|passwd|client_secret|access_token|refresh_token|authorization|api[_-]?key)["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;}&]+)/gi,
          '$1[REDACTED]',
        )
        .replace(/https?:\/\/[^\s<>"']+/gi, '[REDACTED_URL]')
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED_EMAIL]')
        // eslint-disable-next-line no-control-regex -- Strip control characters to prevent log/output injection.
        .replace(/[\x00-\x1f\x7f]/g, ' ')
        .slice(0, 4096)
    );
  }
}

export function trustedUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new IntegrationError('CONFIGURATION', 'A configured URL is invalid');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new IntegrationError(
      'CONFIGURATION',
      'Configured SAP URLs must use HTTPS without userinfo, query or fragment',
    );
  return url;
}

export function safeNextUrl(next: string, current: URL, root: URL): URL {
  const url = new URL(next, current);
  if (
    url.origin !== root.origin ||
    url.username ||
    url.password ||
    url.hash ||
    url.pathname !== root.pathname + 'MessageProcessingLogs'
  )
    throw new IntegrationError(
      'UNSAFE_URL',
      'SAP pagination URL is outside the monitoring collection',
    );
  return url;
}
