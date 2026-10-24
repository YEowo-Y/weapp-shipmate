# Model connections — implementation plan (2026-10-17)

## Scope and stack

Keep native ES modules, existing settings primitives and Node >=20. Add a local-only connection broker to the development preview server; no cloud service, new framework or dependency. This does not replace the planned Tauri Rust/keychain broker. No automatic model generation or paid inference is included.

Implement official OpenRouter OAuth PKCE S256 and API-key discovery for OpenAI, Anthropic, Google and OpenRouter, plus the fixed local Ollama endpoint. Provider endpoints are server-owned; arbitrary proxies remain non-executable drafts until their network boundary is designed. Credentials live only in a browser-session-owned server memory record, never localStorage, logs, files, URLs or API responses. Restarting the server loses connections. ChatGPT SDK support is being checked separately against official source and secure-storage requirements.

## Contract before implementation

Base `/api/model-connections`:

- GET base: `{csrfToken, storage:'memory', connections, oauth}`. Connections contain only `{providerId,status,authMethod,models:[{id,name}],checkedAt,error}`; status is disconnected/connecting/connected/error. `connected` means a provider authenticated catalog request, not successful inference. OAuth has providerId/status/expiresAt/message, never verifier/code/key/state.
- POST `/:id/connect` `{apiKey?}`: validate credentials, call fixed provider API, normalize bounded model data; no inference.
- POST `/:id/refresh` `{}`: refresh saved catalog; failures remain actionable and do not falsely succeed.
- POST `/:id/disconnect` `{}`: cancel in-flight work and clear local credentials. Explain remote keys are not revoked.
- POST `/openrouter/oauth/start` `{}`: `{authorizationUrl,expiresAt}`; one pending flow per session. POST `/openrouter/oauth/cancel` `{}` invalidates pending authorization.
- GET `/oauth/callback/:transaction` with provider code/state: verify session, state, age and single-use ownership before exchange; redirect to settings with no credential parameters. OAuth state expires after 10 minutes. Errors are sanitized.
- Every mutation requires same-origin Origin + `X-Shipmate-CSRF`; HTTP-only SameSite=Lax session cookie enables a top-level OAuth callback. All APIs use no-store, bounded JSON bodies, host checks and no permissive CORS. Fixed upstream destinations, redirect rejection, request timeout and response size bounds apply.

## User path and simplification

Provider navigation → clear authentication choice → pending/cancel or API-key dialog → real status → searchable model catalog → refresh/disconnect. Keep local demo separately labelled. Preserve existing appearance/settings/navigation behavior. Reuse icons, native dialog, button and field styles. No fake subscription login, guessed models, or key retention in frontend drafts. Narrow width and mobile stacking reuse current settings shell.

## Verification / quality profile

Risk: high (local authentication and credentials). Commands discovered from package manifests: `npm test`, `npm run lint`, `npm --prefix desktop run build`; preview lint explicit because root excludes design previews. Existing regression baseline: 438 passing tests from preceding settings work. Add red-to-green unit and HTTP integration tests with injected mock providers (never real credentials): CSRF/Host/Origin, malformed/oversized input, error redaction, PKCE, wrong-state/owner/expired/replayed callbacks, cancellation and stale responses, disconnect, catalog parsing, frontend failure/retry/focus. Independent security review after integration.

Browser UI testing remains blocked by the user's current disabled browser setting and instruction to finish code/automated checks. No screenshots or visual parity claims. Real account consent, production Tauri keychain and packaged desktop integration need separate verification. No release/CI-ready claim. Recovery: stop local server to erase credentials; revert only this task's scoped changes if needed, preserve the existing dirty working tree.
