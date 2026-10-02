# Security design and deployment

Version 1 supports outbound SAP OAuth 2.0 client credentials with token caching and automatic refresh. The authentication interface supports future providers. Inbound HTTP can use a separate static bearer token. It does not implement an OAuth authorization server. Remote binds require a token of at least 32 characters; issue a high-entropy random token in your own secure environment.

Credentials remain in the customer's runtime environment. The server has no database, telemetry exporter, author-controlled service or external LLM call. SAP monitoring data is returned to the connected MCP client, whose inference provider and data policies are a separate boundary. Assess those policies before enabling production access.

Only GET is implemented for SAP monitoring. POST is used solely for the configured OAuth token endpoint and inbound MCP protocol messages. MCP DELETE is a protocol transport method, never a SAP deletion. No configuration, flow deployment, retry, restart, payload retrieval or deletion tools exist.

Threats include malicious tool inputs, outbound host redirection, credential disclosure, malicious pagination, prompt injection in SAP data, diagnostic text containing personal data, denial of service and unauthorized MCP callers. Controls include strict bounded schemas, server-only HTTPS URLs, redirect rejection, same-origin collection pagination, bounded response size, timeout, bounded retries, allowlisted normalized metadata, diagnostic redaction, Host/Origin validation and constant-time bearer comparison. Logs allowlist operation metadata and write to stderr to preserve stdio protocol integrity.

Redaction is best effort: arbitrary diagnostic prose can contain sensitive business details that regexes cannot recognize. Do not treat sanitized text as anonymous. Authorized callers still receive monitoring metadata and diagnostic evidence. Never enable trace payload retrieval as a workaround. Tokens are registered with the sanitizer and must not be logged. Raw SAP error bodies are suppressed. Sanitizer state persists for process lifetime; restart during credential rotation if needed.

Production recommendations:

- Use least-privilege SAP technical credentials and a secrets manager; rotate both SAP and MCP credentials.
- Put remote HTTP behind an authenticated TLS gateway with rate limits, body limits and concurrency controls. Bind privately and restrict ingress. Do not expose an unauthenticated public endpoint.
- Configure exact `MCP_ALLOWED_HOSTS` authorities and `MCP_ALLOWED_ORIGINS` URLs; no wildcard origins. Requests without Origin are accepted after Host/auth checks for native clients. Configure your proxy to preserve an allowed Host.
- Keep bearer tokens out of URLs, shell histories, issue reports and logs. The built-in shared token grants access to the entire configured tenant; use separate deployments or gateway policy for differing access domains.
- Restrict outbound network access to your SAP tenant and OAuth endpoint. Trusted configuration must itself be protected.
- Run as a non-root user, keep dependencies updated, review the lockfile, scan your container and run CI before release.
- Treat diagnostic strings as data, never instructions. Enforce prompt-injection handling in the MCP host.
- Set client timeouts appropriate to bounded retries; health is process liveness only.

Private reporting: use GitHub **Security → Report a vulnerability** when enabled. Before publishing, maintainers must enable private vulnerability reporting. If unavailable, request a private channel without posting exploit details. Include affected version, synthetic reproduction, impact and mitigation; never include real credentials or customer data. Maintainers should acknowledge, assess, coordinate a fix and publish an advisory after remediation. See [root policy](../SECURITY.md) for supported versions.
