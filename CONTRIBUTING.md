# Contributing

Contributions are welcome under Apache-2.0. Start with an issue for substantial changes. Use synthetic fixtures and official API references. Do not include tenant credentials, customer names or production logs.

Use Node.js 24 LTS and run:

```sh
npm ci
npm run format
npm run lint
npm run typecheck
npm test
npm run build
```

Keep modules small, schemas strict and tool names compatible. Add mocked tests for new behavior and update README for visible changes. Version 1 is read-only: no deploy, retry, restart, deletion or configuration mutation. Review security boundaries before adding dependencies or SAP endpoints.

Follow [the code of conduct](CODE_OF_CONDUCT.md). Security reports follow [SECURITY.md](SECURITY.md).
