import { lookup as dnsLookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';
import { isIP, BlockList } from 'node:net';
import { Readable } from 'node:stream';
import { ConnectionError } from './model-providers.mjs';

const blocked = new BlockList();
for (const [address, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 3]]) blocked.addSubnet(address, prefix, 'ipv4');
// Only global unicast IPv6 is eligible; exclude special-purpose ranges inside it.
const globalV6 = new BlockList(); globalV6.addSubnet('2000::', 3, 'ipv6');
for (const [address, prefix] of [['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20]]) blocked.addSubnet(address, prefix, 'ipv6');
const reject = () => { throw new ConnectionError('invalid_endpoint', '地址不受支持。请使用公网 HTTPS，或明确允许本机 HTTP 地址。'); };
const hostnameOf = url => url.hostname.replace(/^\[|\]$/g, '');
async function resolveAddresses(lookup, host, signal) {
  let onAbort;
  try {
    return await Promise.race([
      lookup(host, { all: true, order: 'verbatim' }),
      new Promise((_, rejectPromise) => {
        onAbort = () => rejectPromise(new ConnectionError('canceled', '连接已取消。', 409));
        if (signal?.aborted) onAbort(); else signal?.addEventListener('abort', onAbort, { once: true });
      }),
    ]);
  } finally { signal?.removeEventListener('abort', onAbort); }
}
export function isPublicAddress(address) {
  const family = isIP(address);
  return family === 4 ? !blocked.check(address, 'ipv4') : family === 6 && globalV6.check(address, 'ipv6') && !blocked.check(address, 'ipv6');
}

export function validateCustomEndpoint(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['baseUrl', 'allowLocalHttp'].includes(key)) || typeof input.baseUrl !== 'string' || input.baseUrl.length > 2048 || typeof input.allowLocalHttp !== 'boolean') reject();
  const raw = input.baseUrl;
  if (raw !== raw.trim() || /[\s\\?#%]/u.test(raw) || !/^https?:\/\//u.test(raw)) reject();
  let url; try { url = new URL(raw); } catch { reject(); }
  const host = hostnameOf(url);
  if (url.username || url.password || !host || url.port === '0' || url.hostname.endsWith('.') || !/^\/(?:[A-Za-z0-9_-]+\/?)*$/u.test(url.pathname)) reject();
  // Reject dot segments before URL normalization can silently erase them.
  if (raw.split('/').some(segment => segment === '.' || segment === '..')) reject();
  const local = ['127.0.0.1', '::1', 'localhost'].includes(host);
  if (url.protocol === 'http:') {
    const authority = raw.slice(7).split('/')[0].toLowerCase();
    if (!input.allowLocalHttp || !local || !/^(?:127\.0\.0\.1|\[::1\]|localhost)(?::\d+)?$/u.test(authority)) reject();
  } else if (local || (isIP(host) && !isPublicAddress(host)) || (!isIP(host) && (!host.includes('.') || /\.(?:local|localhost|internal|test|invalid)$/iu.test(host)))) reject();
  return { baseUrl: url.href.replace(/\/+$/u, ''), allowLocalHttp: url.protocol === 'http:' };
}

// Node's request lookup hook pins the vetted address while preserving hostname,
// SNI and default certificate verification. No global agent, proxy or redirects.
// https://nodejs.org/api/https.html#httpsrequesturl-options-callback
export function createCustomEndpointFetch(input, { lookup = dnsLookup, requestImpl } = {}) {
  const endpoint = validateCustomEndpoint(input);
  return async (target, init = {}) => {
    if (![`${endpoint.baseUrl}/models`, `${endpoint.baseUrl}/chat/completions`].includes(String(target))) reject();
    const url = new URL(target), host = hostnameOf(url), signal = init.signal;
    if (signal?.aborted) throw new ConnectionError('canceled', '连接已取消。', 409);
    const addresses = endpoint.allowLocalHttp
      ? [{ address: host === 'localhost' ? '127.0.0.1' : host, family: host === '::1' ? 6 : 4 }]
      : isIP(host) ? [{ address: host, family: isIP(host) }] : await resolveAddresses(lookup, host, signal);
    if (signal?.aborted) throw new ConnectionError('canceled', '连接已取消。', 409);
    if (!addresses.length || addresses.length > 64 || addresses.some(item => !isIP(item.address) || item.family !== isIP(item.address) || (!endpoint.allowLocalHttp && !isPublicAddress(item.address)))) reject();
    const selected = addresses[0];
    return new Promise((resolve, rejectPromise) => {
      const request = requestImpl ?? (url.protocol === 'https:' ? httpsRequest : httpRequest);
      const req = request(url, {
        method: init.method ?? 'GET', headers: init.headers, signal, agent: false,
        rejectUnauthorized: true, maxHeaderSize: 16384,
        lookup: (_host, options, callback) => options.all ? callback(null, [selected]) : callback(null, selected.address, selected.family),
      }, response => {
        let body;
        try {
          const status = response.statusCode;
          if (!Number.isInteger(status) || status < 200 || status > 599) throw new Error('invalid status');
          if (status >= 300 && status < 400) {
            response.destroy(); rejectPromise(new ConnectionError('redirect_rejected', '自定义服务不允许重定向，请检查服务地址。', 502)); return;
          }
          const headers = new Headers();
          for (const [name, value] of Object.entries(response.headers)) if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
          body = [204, 205].includes(status) ? null : Readable.toWeb(response);
          const result = new Response(body, { status, headers });
          if (!body) response.destroy();
          resolve(result);
        } catch {
          if (body) void body.cancel().catch(() => {});
          response.destroy();
          rejectPromise(new ConnectionError('invalid_response', '自定义服务返回的数据格式不受支持，请检查服务后重试。', 502));
        }
      });
      req.on('error', () => rejectPromise(new ConnectionError(signal?.aborted ? 'canceled' : 'network_error', signal?.aborted ? '连接已取消。' : '无法连接自定义服务，请检查网络和证书。', signal?.aborted ? 409 : 502)));
      req.end(init.body);
    });
  };
}
