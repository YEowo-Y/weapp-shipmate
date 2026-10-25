// Fixed, local-only repair evidence. Reuses the preflight scanner; never emits source text.
import { readdirSync, readFileSync, lstatSync } from 'node:fs';
import { join, resolve, basename, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';
import { scanProject, isScanPathEligible, _extractFacts } from './scanner.mjs';

const APIS = new Set(['getLocation', 'getFuzzyLocation', 'onLocationChange', 'startLocationUpdate', 'startLocationUpdateBackground', 'chooseLocation', 'choosePoi', 'chooseAddress']);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

export function repairEvidence(directory) {
  const root = resolve(directory);
  const scan = scanProject(root);
  if (!scan.scope.complete || scan.configErrors.length) throw new Error('扫描范围不完整，请先处理读取错误、链接或配置问题。');
  const files = [], evidence = [], apis = new Set();
  let bytes = 0, entries = 0;
  function walk(parts = []) {
    for (const entry of readdirSync(join(root, ...parts), { withFileTypes: true })) {
      if (++entries > 20000) throw new Error('目录过大，暂不支持受限修复。');
      const next = [...parts, entry.name], file = next.join('/');
      if (entry.isSymbolicLink()) throw new Error('包含链接，暂不支持受限修复。');
      if (entry.isDirectory()) { if (isScanPathEligible(next, 'directory')) walk(next); continue; }
      if (!isScanPathEligible(next)) continue;
      if (!entry.isFile()) throw new Error('仅支持普通文件。');
      const base = basename(file), extension = extname(file);
      if ((base === 'app.json' && file !== 'app.json') || base === 'manifest.json' || /^app\.config\./.test(base) || base === 'app.mpx' || ['.vue', '.uvue', '.nvue', '.mpx', '.wpy', '.jsx', '.tsx'].includes(extension)) throw new Error('首版仅支持单根原生小程序；框架项目或多根配置请手动修改。');
      const path = join(root, ...next), stat = lstatSync(path);
      if (stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 1024 * 1024) throw new Error('文件包含链接或超过修复扫描上限。');
      const content = readFileSync(path);
      bytes += content.length;
      if (bytes > 4 * 1024 * 1024 || files.length >= 512) throw new Error('首版仅支持 512 个文件、4 MiB 以内的小型原生项目。');
      const text = new TextDecoder('utf-8', { fatal: true }).decode(content);
      if (/@tarojs\/|\b(?:uni|Taro|wepy)\./.test(text)) throw new Error('发现框架代码，暂不支持受限修复。');
      if (base === 'project.config.json') {
        const config = JSON.parse(text);
        if (config.miniprogramRoot && !['.', './', ''].includes(config.miniprogramRoot)) throw new Error('请选择实际小程序根目录；不自动修复重定向根目录。');
      }
      const facts = { apis: new Set(), domains: new Set(), configKeys: new Set(), secretHints: new Set(), insecureHosts: new Set(), dynamicRequest: false };
      _extractFacts(path, text, file, facts);
      const found = [...facts.apis].filter(api => api.startsWith('wx.') && APIS.has(api.slice(3))).map(api => api.slice(3)).sort();
      if (found.length) { evidence.push({ file, apis: found }); found.forEach(api => apis.add(api)); }
      files.push({ file, sha256: sha(content) });
    }
  }
  walk();
  if (!files.some(entry => entry.file === 'app.json') || !files.some(entry => entry.file === 'app.js')) throw new Error('需要原生项目根目录中的 app.json 和 app.js。');
  if (!apis.size) throw new Error('没有发现支持自动补声明的原生位置 API 静态引用。');
  files.sort((a, b) => a.file.localeCompare(b.file, 'en'));
  evidence.sort((a, b) => a.file.localeCompare(b.file, 'en'));
  return { schemaVersion: 1, files, missingApis: [...apis].sort(), evidence, fingerprint: sha(JSON.stringify(files)) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 3) throw new Error('需要一个本机项目目录。');
    process.stdout.write(JSON.stringify(repairEvidence(process.argv[2])));
  } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
