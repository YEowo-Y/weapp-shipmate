// @ts-check
import { readFileSync } from 'node:fs';
import { request as httpsRequest } from 'node:https';
import { Resolver } from 'node:dns/promises';
import { isIP } from 'node:net';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isPublicAddress } from './custom-endpoint.mjs';
import { officialSourceUrl } from '../../src/source-catalog.mjs';
import { extractMainText, sha256 } from '../../src/source-text.mjs';
import { classifyQuote, collapseWhitespace } from '../../src/source-quotes.mjs';

const HASH = /^[a-f0-9]{64}$/;
const SOURCE_ID = /^source-[a-f0-9]{16}$/;
const keys = (value, expected) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join(',') === [...expected].sort().join(',');

// A per-request DNS resolver can actually cancel outstanding queries; a timed
// Promise.race around OS getaddrinfo would leave work alive after the deadline.
/**
 * @param {string} host
 * @param {Record<string, any>} [options]
 */
export async function resolveOfficialAddresses(host, { signal, resolver = new Resolver({ timeout: 10000, tries: 1 }) } = {}) {
  const cancel = () => resolver.cancel();
  if (signal?.aborted) throw new Error('canceled');
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    const answers = await Promise.allSettled([resolver.resolve4(host), resolver.resolve6(host)]);
    if (signal?.aborted) throw new Error('canceled');
    const failed = answers.find((answer) => answer.status === 'rejected' && !['ENODATA', 'ENOTFOUND'].includes(answer.reason?.code));
    if (failed) throw new Error('dns');
    return answers.flatMap((answer, index) => answer.status === 'fulfilled' ? answer.value.map((address) => ({ address, family: index === 0 ? 4 : 6 })) : []);
  } finally { signal?.removeEventListener('abort', cancel); resolver.cancel(); }
}
export function validateSourceCatalog(catalog) {
  if (!keys(catalog, ['schemaVersion', 'catalogVersion', 'staleDays', 'sources']) || catalog.schemaVersion !== 1 || catalog.staleDays !== 180 || !HASH.test(catalog.catalogVersion) || !Array.isArray(catalog.sources) || catalog.sources.length > 128) throw new Error('catalog');
  const ids = new Set();
  for (const source of catalog.sources) {
    if (!keys(source, ['id', 'url', 'title', 'references', 'baseline']) || !SOURCE_ID.test(source.id) || ids.has(source.id) || typeof source.title !== 'string' || source.title.length > 1000 || !Array.isArray(source.references) || source.references.length > 1024) throw new Error('catalog');
    officialSourceUrl(source.url);
    if (source.id !== `source-${sha256(source.url).slice(0, 16)}`) throw new Error('catalog');
    ids.add(source.id);
    for (const ref of source.references) {
      if (!keys(ref, ['id', 'title', 'lastVerified', 'draft']) || typeof ref.id !== 'string' || ref.id.length > 256 || typeof ref.title !== 'string' || ref.title.length > 1000 || (ref.lastVerified !== null && (typeof ref.lastVerified !== 'string' || ref.lastVerified.length > 64)) || typeof ref.draft !== 'boolean') throw new Error('catalog');
    }
    const b = source.baseline;
    if (b !== null && (!keys(b, ['hash', 'fetchedAt', 'method']) || !HASH.test(b.hash) || typeof b.fetchedAt !== 'string' || b.fetchedAt.length > 64 || !['fetch', 'manual'].includes(b.method))) throw new Error('catalog');
  }
  // Version also binds source-package bytes absent from the portable runtime.
  // The trusted build manifest verifies this catalog; do not derive it from the
  // displayed metadata alone and accidentally accept changed rule assertions.
  return catalog;
}

/**
 * @param {any} catalog
 * @param {string} sourceId
 * @param {Record<string, any>} [options]
 */
export async function checkSource(catalog, sourceId, { lookup = resolveOfficialAddresses, request = httpsRequest, timeoutMs = 10000, maxBytes = 2 * 1024 * 1024, now = Date.now, signal, quote } = {}) {
  validateSourceCatalog(catalog);
  if (!SOURCE_ID.test(sourceId)) throw new Error('source');
  const source = catalog.sources.find((item) => item.id === sourceId);
  if (!source) throw new Error('source');
  if (quote !== undefined && (typeof quote !== 'string' || quote.length > 8192 || !collapseWhitespace(quote))) throw new Error('quote');
  const result = (state, reason, httpStatus = null, contentHash = null, body = null) => {
    const source = { schemaVersion: 1, catalogVersion: catalog.catalogVersion, sourceId, checkedAt: now(), state, reason, httpStatus, contentHash };
    if (quote === undefined) return source;
    return { source, quoteHash: sha256(quote), match: body === null ? 'unverified' : classifyQuote(quote, body) };
  };
  if (source.baseline?.method === 'manual') return result('manual', 'manual');
  const url = officialSourceUrl(source.url);
  return await new Promise((finish) => {
    let settled = false, req, response, timer;
    const dnsController = new AbortController();
    const complete = (state, reason, status = null, hash = null, body = null) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
      dnsController.abort();
      response?.destroy(); req?.destroy(); finish(result(state, reason, status, hash, body));
    };
    const abort = () => complete('unknown', 'network');
    timer = setTimeout(() => complete('unknown', 'timeout'), Math.min(Math.max(timeoutMs, 1), 10000));
    if (signal?.aborted) { abort(); return; }
    signal?.addEventListener('abort', abort, { once: true });
    Promise.resolve().then(() => lookup(url.hostname, { all: true, order: 'verbatim', signal: dnsController.signal })).then((addresses) => {
      if (settled) return;
      if (!Array.isArray(addresses) || !addresses.length || addresses.length > 64 || addresses.some((a) => !isPublicAddress(a.address) || isIP(a.address) !== a.family)) { complete('unknown', 'access'); return; }
      const address = addresses[0];
      req = request(url, { method: 'GET', agent: false, family: address.family, autoSelectFamily: false,
        servername: url.hostname, rejectUnauthorized: true, maxHeaderSize: 16384,
        headers: { accept: 'text/html,application/xhtml+xml', 'accept-encoding': 'identity', 'user-agent': 'weapp-shipmate-source-check' },
        lookup: (_host, options, callback) => callback(null, options.all ? [address] : address.address, address.family),
      }, (res) => {
        response = res;
        if (settled) { res.destroy(); return; }
        const status = res.statusCode;
        if (status >= 300 && status < 400) { complete('unknown', 'redirect', status); return; }
        if (status === 404 || status === 410) { complete('unavailable', 'not_found', status); return; }
        if (status < 200 || status >= 300) { complete('unknown', 'access', status); return; }
        if (!/^(?:text\/html|application\/xhtml\+xml)(?:;|$)/i.test(res.headers['content-type'] || '') || !['', 'identity'].includes(res.headers['content-encoding'] || '')) { complete('unknown', 'body', status); return; }
        if (Number(res.headers['content-length']) > maxBytes) { complete('unknown', 'body', status); return; }
        const chunks = []; let size = 0;
        res.on('data', (chunk) => {
          if (settled) return;
          size += chunk.length;
          if (size > Math.min(maxBytes, 2 * 1024 * 1024)) { complete('unknown', 'body', status); return; }
          chunks.push(chunk);
        });
        res.on('aborted', () => complete('unknown', 'network', status));
        res.on('error', () => complete('unknown', 'network', status));
        res.on('end', () => {
          if (settled) return;
          const html = Buffer.concat(chunks).toString('utf8');
          if (/<title[^>]*>[^<]*(?:登录|登陆|sign\s*in|log\s*in|access\s*denied|verification|验证码)/i.test(html) || /<input\b[^>]*type\s*=\s*["']?password\b/i.test(html) || /(?:location\.(?:href|replace)|window\.location)[^\n]{0,120}forceLogin/i.test(html)) { complete('unknown', 'access', status); return; }
          let text;
          try { text = extractMainText(html); } catch { complete('unknown', 'body', status); return; }
          if (!text || text.trim().length < 200) { complete('unknown', 'body', status); return; }
          const hash = sha256(text);
          complete(source.baseline ? (source.baseline.hash === hash ? 'unchanged' : 'changed') : 'reachable', source.baseline ? (source.baseline.hash === hash ? 'same' : 'different') : 'no_baseline', status, hash, text);
        });
      });
      req.on('error', () => complete('unknown', 'network'));
      req.end();
    }).catch(() => complete('unknown', 'network'));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 3 && !(process.argv.length === 5 && process.argv[3] === '--quote')) throw new Error('arguments');
    const bytes = readFileSync(new URL('../../source-catalog.json', import.meta.url));
    if (bytes.length > 256 * 1024) throw new Error('catalog');
    const outcome = await checkSource(JSON.parse(bytes.toString('utf8')), process.argv[2], { quote: process.argv[4] });
    process.stdout.write(`${JSON.stringify(outcome)}\n`);
  } catch { process.exitCode = 1; }
}
