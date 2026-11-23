// @ts-check
import { request as httpsRequest } from 'node:https';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { TextDecoder } from 'node:util';

const RELEASE_API = 'https://api.github.com/repos/YEowo-Y/weapp-shipmate/releases/latest';
const MAX_BODY_BYTES = 256 * 1024;

/** @typedef {{ status: 'release', tag: string } | { status: 'unavailable' } | { status: 'failed' }} ReleaseMetadata */
/** @typedef {AsyncIterable<Uint8Array> & { statusCode?: number, headers: Record<string, string | string[] | undefined>, destroy(): void }} ReleaseResponse */

/** @returns {Promise<ReleaseMetadata>} */
export async function fetchLatestRelease(request = httpsRequest) {
  try {
    const signal = globalThis.AbortSignal.timeout(8_000);
    const response = await new Promise(/** @param {(value: ReleaseResponse) => void} accept */ (accept, reject) => {
      const query = request(RELEASE_API, {
        method: 'GET',
        agent: false,
        headers: {
          Accept: 'application/vnd.github+json',
          'Accept-Encoding': 'identity',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'weapp-shipmate-desktop',
        },
        signal,
      }, accept);
      query.once('error', reject);
      query.end();
    });

    try {
      if (response.statusCode !== 200) return { status: response.statusCode === 404 ? 'unavailable' : 'failed' };
      const encoding = response.headers['content-encoding'];
      if (encoding !== undefined && (typeof encoding !== 'string' || encoding.toLowerCase() !== 'identity')) return { status: 'failed' };
      const chunks = [];
      let size = 0;
      for await (const chunk of response) {
        size += chunk.byteLength;
        if (size > MAX_BODY_BYTES) return { status: 'failed' };
        chunks.push(chunk);
      }
      if (signal.aborted) return { status: 'failed' };
      /** @type {unknown} */
      const data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, size)));
      if (!data || typeof data !== 'object'
        || !('draft' in data) || data.draft !== false
        || !('prerelease' in data) || data.prerelease !== false
        || !('tag_name' in data) || typeof data.tag_name !== 'string'
        || data.tag_name.length === 0 || data.tag_name.length > 64) {
        return { status: 'failed' };
      }
      return { status: 'release', tag: data.tag_name };
    } finally {
      response.destroy();
    }
  } catch {
    return { status: 'failed' };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.stdout.write(JSON.stringify(await fetchLatestRelease()) + '\n');
}
