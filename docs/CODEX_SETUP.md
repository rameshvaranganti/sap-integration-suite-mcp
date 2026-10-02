# Codex setup

Codex supports local stdio processes and remote Streamable HTTP servers. See [official OpenAI documentation](https://developers.openai.com/codex/mcp).

After building this repository, configure local use with an absolute path:

```sh
codex mcp add sapIntegrationSuite -- node /absolute/path/sap-integration-suite-mcp/dist/index.js --stdio
```

In `~/.codex/config.toml`, forward credentials from the parent process environment rather than putting secrets in command arguments:

```toml
[mcp_servers.sapIntegrationSuite]
command = "node"
args = ["/absolute/path/sap-integration-suite-mcp/dist/index.js", "--stdio"]
env_vars = ["SAP_BASE_URL", "SAP_TOKEN_URL", "SAP_CLIENT_ID", "SAP_CLIENT_SECRET", "SAP_AUTH_MODE"]
tool_timeout_sec = 120
```

For Windows use an escaped absolute path or forward slashes, for example `C:/projects/sap-integration-suite-mcp/dist/index.js`. Set the variables in the environment that launches Codex. The server does not automatically load `.env`.

Remote setup:

```sh
codex mcp add sapIntegrationSuite --url https://your-host.example.com/mcp
```

Configure the separate MCP bearer credential:

```toml
[mcp_servers.sapIntegrationSuite]
url = "https://your-host.example.com/mcp"
bearer_token_env_var = "SAP_MCP_HTTP_TOKEN"
tool_timeout_sec = 120
```

`SAP_MCP_HTTP_TOKEN` in Codex must match `MCP_HTTP_TOKEN` on the server; it is not a SAP OAuth credential. Protect the remote endpoint with TLS and access controls. This server does not implement inbound OAuth discovery or registration, so `codex mcp login` is not the configuration method for its static bearer authentication. Customer gateways may provide additional supported authentication.

Run `codex mcp list` and inspect tools with `/mcp`. Ask: “Show failed SAP Integration Suite messages from the last hour.” Review the chosen client's data-handling rules before accessing sensitive monitoring data.
