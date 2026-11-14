# Model connection sources — 2026-10-17

Actual official documentation/source review, not a screenshot parity claim. No new browser inspection, real account sign-in, paid inference or REA run occurred in this turn. Existing observed product imagery is recorded in `product-density-sources.md`.

## Product and protocol decisions

- [Cherry Studio Model Service Configuration](https://www.cherryai.com/docs/en/pre-basic/providers/): provider list → details → credentials → sync models; model checking is a separate step. Applied to the catalog UI; this implementation intentionally does not label directory access as successful inference. No Cherry source code was copied.
- [OpenRouter OAuth PKCE](https://openrouter.ai/docs/guides/overview/auth/oauth): local callbacks, S256, successful callback state, POST `/api/v1/auth/keys` exchange. Applied server-side, with session binding, one-use transaction, expiry and cancellation. The result is an API key, not an OIDC user profile or refresh token. User denial does not return state; an unpredictable callback path plus its originating session binds that case without accepting a code.
- [OpenRouter current key endpoint](https://openrouter.ai/docs/api/api-reference/api-keys/get-current-api-key): authenticate the credential before requesting its public model catalog. A public catalog alone cannot prove the key works.
- [OpenAI model list](https://developers.openai.com/api/reference/resources/models/methods/list): authenticated model directory; not a guarantee that any particular model supports this app's future inference contract.
- [Anthropic model list](https://platform.claude.com/docs/en/api/models/list): version header and cursor pagination. API key authentication used; no consumer Claude subscription login is implied.
- [Gemini models](https://ai.google.dev/api/models) and [API key guide](https://ai.google.dev/gemini-api/docs/api-key): model pagination and `x-goog-api-key`; no key in query strings.
- [Ollama tags](https://docs.ollama.com/api/tags): fixed local `/api/tags` directory. This version does not accept arbitrary network hosts or proxy URLs.

## ChatGPT login investigation

[OpenAI's official tutorial](https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt) describes an OSS local OAuth integration and keeping auth in a trusted process. This is a real documented capability; it must not be confused with borrowing another application's credentials.

The official DevKit was inspected at `0a36fefeb913055c8c7a1a29b63d82b96b2e841a`:

- [Package manifest](https://github.com/openai/sign-in-with-chatgpt-devkit/blob/0a36fefeb913055c8c7a1a29b63d82b96b2e841a/packages/local/package.json): private workspace, v0.1.0, Node >=22; registry `@siwc/local` returned 404 and repository tags/releases were empty at review.
- [License](https://github.com/openai/sign-in-with-chatgpt-devkit/blob/0a36fefeb913055c8c7a1a29b63d82b96b2e841a/LICENSE): Noncommercial v1.0, not the MIT terms of this repository. No DevKit code was incorporated.
- [Required encryption interface](https://github.com/openai/sign-in-with-chatgpt-devkit/blob/0a36fefeb913055c8c7a1a29b63d82b96b2e841a/packages/local/src/types.ts#L43-L67) and [security documentation](https://github.com/openai/sign-in-with-chatgpt-devkit/blob/0a36fefeb913055c8c7a1a29b63d82b96b2e841a/docs/security.md): OS-backed encryption required, no plaintext fallback. Current preview has no such adapter.

Decision: do not install an unpublished SDK or substitute fake encryption. OpenAI currently exposes API-key connection only. ChatGPT login remains unimplemented pending secure native integration and license/dependency review. No new dependency was added.

## Icon provenance

OpenRouter now uses the existing MIT Lobe Icons source at the same pinned commit as the other provider marks, rather than a generic globe. `components/brands/manifest.json` records source URL, bytes and SHA-256; existing asset tests validate passive SVG geometry and the retained license. No remotely supplied SVG markup is rendered.
