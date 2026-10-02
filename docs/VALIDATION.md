# Validation status and release checklist

Local validation on 2026-10-02 used Node.js v24.21.0. Dependencies are installed, and the repository contains a resolved, committed `package-lock.json` consistent with `package.json`.

| Check                | Result                                                                                                     |
| -------------------- | ---------------------------------------------------------------------------------------------------------- |
| `npm run format`     | Passed                                                                                                     |
| `npm run lint`       | Passed                                                                                                     |
| `npm run typecheck`  | Passed                                                                                                     |
| `npm test`           | Passed: 56 tests across 6 test files                                                                       |
| `npm run build`      | Passed                                                                                                     |
| Lockfile validation  | Passed: valid JSON, matching package metadata and 273 resolved dependency entries; unchanged from Git HEAD |
| HTTP health endpoint | Confirmed locally by the project maintainer; mocked HTTP tests also pass                                   |

Tests mock SAP responses and require no SAP credentials. These results cover local checks, including MCP tool discovery and HTTP access boundaries. They do not establish real-tenant compatibility, Docker deployment validation or a successful GitHub Actions run. Coverage was not measured in this validation run.

## Reproducing local validation

```sh
npm ci
npm run format
npm run lint
npm run typecheck
npm test
npm run build
```

Optional coverage and dependency-free checks:

```sh
npm run test:coverage
node scripts/verify-offline.mjs
```

## Deployment and release checks

- Verify a non-production SAP tenant following [SAP_SETUP.md](SAP_SETUP.md), including OAuth authentication method, projection fields, failure vocabulary, pagination, diagnostic navigation and runtime artifact identifiers. Keep credentials, tenant fixtures, business payloads and production logs out of the repository.
- Test the Docker image and both transports in the intended deployment environment.
- Confirm GitHub Actions passes for the release commit.
- Enable private vulnerability reporting and add a GitHub Actions status badge using the public repository URL.
