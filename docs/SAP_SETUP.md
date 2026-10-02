# SAP tenant setup

Use your own SAP Integration Suite / Cloud Integration tenant and a dedicated technical client authorized only for monitoring reads. Ask the tenant administrator to configure API access and issue OAuth 2.0 client-credentials credentials using the supported mechanism for your environment. Do not use a personal administrator account.

Exact role collections, scopes, service-instance configuration and token endpoints differ between environments. Verify them against current [SAP Integration Suite documentation](https://help.sap.com/docs/integration-suite) and the [Message Processing Logs API](https://api.sap.com/api/MessageProcessingLogs/overview). This project intentionally does not prescribe unverified security-role names.

Set `SAP_BASE_URL` to the HTTPS management tenant origin or its `/api/v1` service root, not the integration runtime sender endpoint. Set `SAP_TOKEN_URL` to the exact token endpoint supplied for your OAuth client. Supply `SAP_CLIENT_ID` and `SAP_CLIENT_SECRET` through a secret manager or protected process environment. The provider uses `client_secret_basic`, with a form-encoded `grant_type=client_credentials`. Verify that your authorization server supports this method and returns a Bearer token with `expires_in`.

The adapter reads these API resources:

| Purpose         | GET path relative to `/api/v1/`                                  |
| --------------- | ---------------------------------------------------------------- |
| Message search  | `MessageProcessingLogs`                                          |
| Message details | `MessageProcessingLogs('<MessageGuid>')`                         |
| Diagnostic text | `MessageProcessingLogs('<MessageGuid>')/ErrorInformation/$value` |
| Runtime status  | `IntegrationRuntimeArtifacts('<Id>')`                            |

Confirm paths, supported filters, field names and access rights against your tenant's API metadata. Official references: [query options](https://help.sap.com/docs/cloud-integration/sap-cloud-integration/query-options), [message processing logs](https://help.sap.com/docs/cloud-integration/sap-cloud-integration/message-processing-logs), and [runtime artifact examples](https://help.sap.com/docs/integration-suite/sap-integration-suite/runtime-artifacts-and-error-information-example-requests).

The adapter expects OData v2 JSON `d.results`, `d.__next` and `d` entity envelopes, `MessageGuid`, `IntegrationFlowName`, `Status`, `LogStart`, `LogEnd`, and `CorrelationId`. Dates may be OData `/Date(milliseconds)/` or ISO strings. Filters use UTC datetime literals without a zone suffix, per SAP query documentation. Time windows filter **LogStart**, so they measure messages starting in the window. Collection retrieval does not fetch error text per message.

TODO: Verify status vocabulary, `IntegrationFlowName` projection/filter availability, error navigation availability and runtime artifact ID correspondence against current Message Processing Logs documentation and tenant metadata before production use. SAP documentation examples vary between `ERROR` and `FAILED`; this adapter initially uses `FAILED` for failure tools. Adjust the centralized adapter and tests if the tenant uses a different vocabulary. No package filter or endpoint/adapter metadata is fabricated. An unavailable runtime/error navigation returns `supported: false`; authorization failures remain errors.

Test with a non-production tenant first, synthetic failures and least-privilege credentials. Verify TLS/network reachability, token acquisition, search, detail, diagnostic and runtime status independently. Never paste raw token responses or production payloads into issue reports.
