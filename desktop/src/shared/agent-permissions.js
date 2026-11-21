// @ts-check
import { AGENT_PROVIDERS } from './agent-contract.js';

/** @typedef {Pick<import('./session-workspace.js').Session, 'id' | 'projectId'>} SessionScope */
/** @typedef {import('./chat-transport.js').AgentGrant} AgentGrant */

/** Live UI consent only: never restored from messages, exports or persistence. */
export function createAgentPermissions() {
  /** @type {string | null} */
  let sessionId = null;
  /** @type {string | null} */
  let projectId = null;
  /** @type {string | null} */
  let providerId = null;
  let allowRead = false, shareResults = false;
  const revoke = () => { allowRead = false; shareResults = false; };
  const supportedProvider = () => providerId !== null && AGENT_PROVIDERS.includes(providerId);
  const eligible = () => Boolean(sessionId && projectId && supportedProvider());
  return {
    /** @param {SessionScope | null} [session] */
    select(session) {
      const nextSession = typeof session?.id === 'string' && session.id ? session.id : null;
      const nextProject = typeof session?.projectId === 'string' && session.projectId ? session.projectId : null;
      if (nextSession !== sessionId || nextProject !== projectId) revoke();
      sessionId = nextSession; projectId = nextProject;
    },
    /** @param {string | null} value */
    setProvider(value) { if (value !== providerId) revoke(); providerId = value; },
    /** @param {{ allowRead?: boolean; shareResults?: boolean }} next */
    update(next) {
      if (!eligible()) { revoke(); return; }
      allowRead = next.allowRead === true;
      shareResults = allowRead && next.shareResults === true;
    },
    snapshot: () => ({ sessionId, projectId, eligible: eligible(), allowRead, shareResults }),
    /**
     * @template {{ providerId: string; agent?: unknown }} Request
     * @param {Request} request
     * @returns {Omit<Request, 'agent'> & { agent?: AgentGrant }}
     */
    prepare(request) {
      const { agent: _historicalGrant, ...clean } = request;
      if (!sessionId || !projectId || !supportedProvider() || !allowRead || request.providerId !== providerId) return clean;
      return { ...clean, agent: { projectId, sessionId, allowRead: true, shareResults } };
    },
    clear() { revoke(); sessionId = null; projectId = null; providerId = null; },
  };
}
