// @ts-check
// Download already-serialized local data. No network request or filesystem path.
// Object URLs live beyond click dispatch; the timeout is cleanup, not a promise
// that the browser has finished saving. Session/page teardown also releases them.
/** @typedef {{ filename: string; mimeType: string; text: string }} DownloadArtifact */
/** @typedef {DownloadArtifact & { url: string; timer: number | undefined }} PendingDownload */

/**
 * @param {{
 *   documentRef?: Document;
 *   urlAPI?: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'>;
 *   BlobType?: typeof Blob;
 *   setTimer?: Window['setTimeout'];
 *   clearTimer?: Window['clearTimeout'];
 *   retireMs?: number;
 * }} [options]
 */
export function createArtifactDownloader({ documentRef,
  urlAPI = documentRef?.defaultView?.URL, BlobType = documentRef?.defaultView?.Blob,
  setTimer = setTimeout, clearTimer = clearTimeout, retireMs = 30000,
} = {}) {
  /** @type {Set<PendingDownload>} */
  const pending = new Set();
  const windowRef = documentRef?.defaultView;
  let listening = false;
  function unlisten() {
    if (listening && !pending.size) {
      windowRef?.removeEventListener?.('pagehide', dispose);
      listening = false;
    }
  }
  /** @param {PendingDownload} entry */
  function release(entry) {
    if (!pending.delete(entry)) return;
    clearTimer(entry.timer);
    try { urlAPI?.revokeObjectURL(entry.url); } catch { /* Cleanup cannot break navigation. */ }
    unlisten();
  }
  function dispose() {
    for (const entry of pending) release(entry);
    unlisten();
  }
  /** @param {DownloadArtifact | null | undefined} artifact */
  function download(artifact) {
    if (typeof artifact?.filename !== 'string') return false;
    const type = artifact.filename.endsWith('.md') ? 'text/markdown;charset=utf-8'
      : artifact.filename.endsWith('.json') ? 'application/json;charset=utf-8' : null;
    if (!type || artifact.mimeType !== type || !/^[a-z0-9][a-z0-9._-]{0,95}$/.test(artifact.filename)
      || typeof artifact.text !== 'string' || !artifact.text.length || artifact.text.length > 1048576
      || !documentRef?.body || typeof urlAPI?.createObjectURL !== 'function' || typeof urlAPI?.revokeObjectURL !== 'function' || typeof BlobType !== 'function') return false;
    let entry = [...pending].find(item => item.text === artifact.text && item.filename === artifact.filename && item.mimeType === artifact.mimeType);
    if (!entry && pending.size >= 8) return false;
    let link;
    try {
      if (!entry) {
        const blob = new BlobType([artifact.text], { type: artifact.mimeType });
        entry = { ...artifact, url: urlAPI.createObjectURL(blob), timer: undefined };
        pending.add(entry);
        if (!listening && windowRef?.addEventListener) {
          windowRef.addEventListener('pagehide', dispose);
          listening = true;
        }
      }
      link = documentRef.createElement('a');
      link.href = entry.url;
      link.download = entry.filename;
      link.hidden = true;
      documentRef.body.append(link);
      link.click();
      clearTimer(entry.timer);
      const downloaded = entry;
      entry.timer = setTimer(() => release(downloaded), retireMs);
      return true;
    } catch {
      if (entry) release(entry);
      return false;
    } finally { link?.remove(); }
  }
  return { download, dispose };
}
