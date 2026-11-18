// Provider SDKs fall back to an environment variable when no explicit baseURL
// is passed to the client factory. A developer machine that routes model
// traffic through a proxy (ANTHROPIC_BASE_URL is set by Claude Code, for
// example) therefore redirects these fixtures, and the request never reaches
// the synthetic endpoint the test serves — the tool step silently executes
// zero times. CI starts from a clean environment, so it never shows the drift.
//
// Pin the fixtures to the same baseline CI has. Only endpoint variables are
// listed: API keys are always passed explicitly by the callers under test, so
// an inherited key cannot change the outcome.
const ENDPOINT_ENVIRONMENT_VARIABLES = ['ANTHROPIC_BASE_URL', 'OPENAI_BASE_URL'];

export function pinProviderEndpoints() {
  const saved = new Map();
  for (const name of ENDPOINT_ENVIRONMENT_VARIABLES) {
    if (!Object.hasOwn(process.env, name)) continue;
    saved.set(name, process.env[name]);
    delete process.env[name];
  }
  return () => {
    for (const [name, value] of saved) process.env[name] = value;
  };
}
