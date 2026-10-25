import { AGENT_PROVIDERS } from './agent-contract.js';

/** Live UI consent only: never restored from messages, exports or persistence. */
export function createAgentPermissions() {
  let sessionId = null, projectId = null, providerId = null;
  let allowRead = false, shareResults = false;
  const revoke = () => { allowRead = false; shareResults = false; };
  const eligible = () => Boolean(sessionId && projectId && AGENT_PROVIDERS.includes(providerId));
  return {
    select(session) {
      const nextSession = typeof session?.id === 'string' && session.id ? session.id : null;
      const nextProject = typeof session?.projectId === 'string' && session.projectId ? session.projectId : null;
      if (nextSession !== sessionId || nextProject !== projectId) revoke();
      sessionId = nextSession; projectId = nextProject;
    },
    setProvider(value) { if (value !== providerId) revoke(); providerId = value; },
    update(next) {
      if (!eligible()) { revoke(); return; }
      allowRead = next.allowRead === true;
      shareResults = allowRead && next.shareResults === true;
    },
    snapshot: () => ({ sessionId, projectId, eligible: eligible(), allowRead, shareResults }),
    prepare(request) {
      const { agent: _historicalGrant, ...clean } = request;
      if (!eligible() || !allowRead || request.providerId !== providerId) return clean;
      return { ...clean, agent: { projectId, sessionId, allowRead: true, shareResults } };
    },
    clear() { revoke(); sessionId = null; projectId = null; providerId = null; },
  };
}
