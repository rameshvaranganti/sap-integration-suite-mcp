# VS Code setup

See [VS Code MCP server configuration](https://code.visualstudio.com/docs/copilot/customization/mcp-servers) for supported versions and current client behavior.

Create `.vscode/mcp.json` with a remote HTTP server:

```json
{
  "inputs": [
    {
      "type": "promptString",
      "id": "sapMcpToken",
      "description": "MCP access token",
      "password": true
    }
  ],
  "servers": {
    "sapIntegrationSuite": {
      "type": "http",
      "url": "https://your-host.example.com/mcp",
      "headers": { "Authorization": "Bearer ${input:sapMcpToken}" }
    }
  }
}
```

The token is the server's `MCP_HTTP_TOKEN`, not a SAP client secret. Keep real credentials out of workspace files. Start the configured server and inspect its tools in the MCP UI supported by your VS Code release.

For local use, configure a `stdio` server with `command: "node"`, `args: ["/absolute/path/dist/index.js", "--stdio"]` and supply SAP environment variables through your secure launch environment. Standard stdio hosts such as Claude Code or Cursor can use the same process command; their configuration formats differ.
