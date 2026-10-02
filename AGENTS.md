# Development instructions

- Preserve read-only behavior unless specifically requested otherwise. Version 1 monitoring operations must only use GET; OAuth token acquisition may use POST.
- Never commit credentials, real tenant fixtures, business payloads or production logs.
- Use current MCP APIs; do not add external LLM inference to the server.
- Favor official MCP, OpenAI and SAP documentation.
- Always use the OpenAI developer documentation MCP server when working with OpenAI, Codex, ChatGPT or MCP integrations where current documentation is relevant.
- Maintain backwards-compatible tool schemas where reasonable.
- Tests are required for new behavior. Mock SAP; never require a real tenant in CI.
- Update README for user-visible changes.
- Do not fabricate SAP endpoints. Centralize endpoint changes in src/sap/adapter.ts and document unsupported capabilities.
- Security takes priority over convenience. Keep URL, pagination, token and logging boundaries covered by tests.
- Run format, lint, typecheck, test and build before reporting success.
