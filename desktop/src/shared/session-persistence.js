// @ts-check
// One transaction at a time; the store owns cloning and compare-and-swap checks.
/** @typedef {{ state: 'saved' | 'saving' | 'error'; code?: string; revision: number; dirty: boolean }} SaveStatus */

/**
 * @template Snapshot
 * @param {{
 *   store: { save: (snapshot: Snapshot, revision: number) => Promise<{ revision: number }> };
 *   revision?: number;
 *   getSnapshot: () => Snapshot;
 *   onStatus?: (state: SaveStatus) => void;
 * }} options
 */
export function createSessionPersistence({ store, revision = 0, getSnapshot, onStatus = () => {} }) {
  let generation = 0;
  let committed = 0;
  /** @type {SaveStatus['state']} */
  let state = 'saved';
  /** @type {string | undefined} */
  let code;
  /** @type {Promise<SaveStatus> | null} */
  let active = null;
  let disposed = false;
  let transferring = false;
  let snapshotPending = false;

  const hasUnsavedChanges = () => generation !== committed || snapshotPending;
  const getState = () => ({ state, ...(code ? { code } : {}), revision, dirty: hasUnsavedChanges() });
  function publish() {
    if (disposed) return;
    // A presentation callback must not turn a committed transaction into a failure.
    try { onStatus(getState()); } catch { /* The save lifecycle remains independent of its observer. */ }
  }

  async function drain() {
    while (!disposed && generation !== committed && state !== 'error') {
      const writing = generation;
      let phase = 'snapshot-failed';
      try {
        const snapshot = getSnapshot();
        phase = 'save-failed';
        const result = await store.save(snapshot, revision);
        revision = result.revision;
        if (disposed) break;
        committed = writing;
        state = hasUnsavedChanges() ? 'saving' : 'saved';
        publish();
      } catch (error) {
        if (!disposed) {
          state = 'error';
          const caughtCode = /** @type {{ code?: unknown } | null | undefined} */ (error)?.code;
          code = typeof caughtCode === 'string' && caughtCode ? caughtCode : phase;
        }
        break;
      }
    }
    active = null;
    if (state === 'error') publish();
    return getState();
  }

  function flush() {
    if (active) return active;
    if (disposed || !hasUnsavedChanges() || state === 'error') return Promise.resolve(getState());
    active = Promise.resolve().then(drain);
    return active;
  }

  function schedule() {
    if (disposed) return;
    generation++;
    if (state !== 'error') state = 'saving';
    publish();
    void flush();
  }

  function retry() {
    if (disposed || (code && ['conflict', 'version-change', 'apply-failed'].includes(code))) return flush();
    if (state === 'error') {
      code = undefined;
      state = hasUnsavedChanges() ? 'saving' : 'saved';
      publish();
    }
    return flush();
  }

  // The caller locks edits until this resolves. Lifecycle schedules are queued behind
  // the transaction, so they capture the newly applied state instead of the old one.
  /**
   * @template {Snapshot} Candidate
   * @param {Candidate} snapshot
   * @param {(snapshot: Candidate) => void} apply
   */
  async function commitSnapshot(snapshot, apply) {
    /** @param {string} value */
    const failure = value => Object.assign(new Error('会话未能提交，请检查保存状态后重试。'), { code: value });
    if (transferring) throw failure('busy');
    if (typeof apply !== 'function') throw failure('invalid');
    transferring = true;
    const candidateGeneration = generation;
    try {
      await flush();
      if (disposed) throw failure('disposed');
      if (state === 'error') throw failure(code || 'save-failed');
      if (hasUnsavedChanges() || generation !== candidateGeneration) throw failure('changed');
      /** @type {unknown} */
      let problem;
      snapshotPending = true; state = 'saving'; code = undefined;
      active = Promise.resolve().then(async () => {
        let phase = 'save-failed';
        try {
          const result = await store.save(snapshot, revision);
          revision = result.revision;
          if (disposed) throw failure('disposed');
          phase = 'apply-failed';
          apply(snapshot);
          state = generation !== committed ? 'saving' : 'saved';
        } catch (error) {
          // Once saved, presentation errors must never enable a retry of stale UI data.
          if (phase === 'apply-failed') {
            code = phase;
            problem = Object.assign(failure(phase), { cause: error });
          } else {
            const caughtCode = /** @type {{ code?: unknown } | null | undefined} */ (error)?.code;
            const storeCode = typeof caughtCode === 'string' && caughtCode ? caughtCode : undefined;
            code = storeCode ?? phase;
            problem = storeCode ? error : failure(phase);
          }
          state = 'error';
        } finally {
          snapshotPending = false; active = null; publish();
        }
        return getState();
      });
      publish();
      const result = await active;
      if (problem) throw problem;
      return result;
    } finally {
      transferring = false;
      if (!disposed && state !== 'error' && generation !== committed) void flush();
    }
  }

  function dispose() {
    disposed = true;
    if (hasUnsavedChanges()) { state = 'error'; code = 'disposed'; }
  }

  return { schedule, flush, retry, commitSnapshot, getState, hasUnsavedChanges, dispose };
}
