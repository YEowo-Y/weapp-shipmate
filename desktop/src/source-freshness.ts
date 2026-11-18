import { createActionButton } from './shared/components/ui-kit.js';
import { createIcon } from './shared/components/icons.js';
import './context.css';
import './source-freshness.css';

type Result = { schemaVersion: 1; catalogVersion: string; sourceId: string; checkedAt: number; state: 'unchanged' | 'changed' | 'reachable' | 'unavailable' | 'unknown' | 'manual'; reason: string; httpStatus: number | null; contentHash: string | null };
type Source = { id: string; url: string; title: string; references: { id: string; title: string; lastVerified: string | null; draft: boolean }[]; baseline: { hash: string; fetchedAt: string | number; method: 'fetch' | 'manual' } | null };
type Check = { sourceId: string; latest: Result; lastEvidence: Result | null };
type Snapshot = { catalog: { schemaVersion: 1; catalogVersion: string; staleDays: number; sources: Source[] }; checks: Check[] };
type Options = { invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>; onOpenSource?(url: string): void | Promise<unknown> };
const labels = { unchanged: '正文与归档一致', changed: '正文与归档不同', reachable: '可访问 · 尚无归档可比较', unavailable: '本次无法读取', unknown: '尚不能判断', manual: '需人工核验' };
const reasons: Record<string, string> = { same: '正文摘要一致', different: '正文摘要不同，请人工核对变化', no_baseline: '尚无正文归档', not_found: '来源未找到', network: '网络请求失败', timeout: '请求超时', redirect: '重定向未获允许', access: '访问受限', body: '未取得可比较正文', manual: '此来源需人工核验' };
const date = (value: string | number | null) => {
  if (value == null) return '尚无记录';
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.getTime() > Date.now()) return '日期异常，需人工核验';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return parsed.toISOString().slice(0, 10) === value ? value : '日期异常，需人工核验';
  return parsed.toLocaleString('zh-CN', { hour12: false });
};

export function mountSourceFreshness(options: Options) {
  const node = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '') => { const el = document.createElement(tag); el.textContent = text; return el; };
  const button = (id: string, text: string) => { const el = createActionButton(document, text); el.id = id; return el; };
  const dialog = node('dialog'); dialog.id = 'desktop-source-freshness'; dialog.className = 'context-dialog source-freshness-dialog'; dialog.setAttribute('aria-labelledby', 'source-freshness-title'); dialog.setAttribute('aria-describedby', 'source-freshness-description');
  const header = node('header'); header.className = 'context-header'; const title = node('h2', '规则来源检查'); title.id = 'source-freshness-title';
  const dismiss = button('source-freshness-dismiss', ''); dismiss.classList.add('ui-action-icon'); dismiss.setAttribute('aria-label', '关闭规则来源检查'); dismiss.append(createIcon(document, 'x')); header.append(title, dismiss);
  const body = node('div'); body.className = 'context-body';
  const description = node('p', '打开与刷新仅读取本机记录。点击某一来源的检查按钮才访问该官方来源，不发送项目文件或项目资料。正文差异不代表政策已更新，仍需人工核验。'); description.id = 'source-freshness-description';
  const version = node('p'); version.id = 'source-freshness-version';
  const filters = node('div'); filters.className = 'source-freshness-filters';
  const search = node('input'); search.id = 'source-freshness-search'; search.type = 'search'; search.value = ''; search.placeholder = '搜索来源、网址或规则'; search.setAttribute('aria-label', '搜索规则来源'); search.setAttribute('aria-controls', 'source-freshness-list');
  const stateFilter = node('select'); stateFilter.id = 'source-freshness-filter'; stateFilter.setAttribute('aria-label', '来源检查状态'); stateFilter.setAttribute('aria-controls', 'source-freshness-list');
  for (const [value, label] of Object.entries({ all: '全部状态', unchecked: '尚未在线检查', ...labels })) { const option = node('option', label); option.value = value; stateFilter.append(option); }
  stateFilter.value = 'all';
  filters.append(search, stateFilter);
  const results = node('div'); results.className = 'source-freshness-results';
  const count = node('span'); count.id = 'source-freshness-count'; count.setAttribute('role', 'status'); count.setAttribute('aria-atomic', 'true');
  const clearFilters = button('source-freshness-clear', '清除筛选'); clearFilters.hidden = true; results.append(count, clearFilters);
  const empty = node('p', '没有匹配的来源。清除筛选可查看全部。'); empty.id = 'source-freshness-empty'; empty.hidden = true;
  const list = node('div'); list.id = 'source-freshness-list';
  const status = node('p'); status.id = 'source-freshness-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-atomic', 'true');
  const footer = node('footer'); footer.className = 'source-freshness-footer';
  const reload = button('source-freshness-reload', '刷新本机记录'), stop = button('source-freshness-stop', '停止检查'), done = button('source-freshness-done', '完成'); footer.append(reload, stop, done);
  body.append(description, filters, results, list, empty, version, status); dialog.append(header, body, footer); document.body.append(dialog);
  let snapshot: Snapshot | null = null, disposed = false, epoch = 0, loading = false, canceling = false;
  let active: { runId: string; sourceId: string; finished: boolean } | null = null, anchor: HTMLElement | null = null;
  let checkRequest: Promise<Check> | null = null;
  const focusTargets = new Map<string, { summary: HTMLElement; check?: HTMLElement; link?: HTMLElement }>();
  const expanded = new Set<string>();
  const valid = (token: number) => !disposed && dialog.open && token === epoch;
  function message(text: string, error = false) { status.textContent = text; status.dataset.error = String(error); }
  function filterRows() {
    const query = search.value.trim().toLocaleLowerCase(); let matches = 0;
    for (const row of Array.from(list.children) as HTMLElement[]) {
      row.hidden = !(row.dataset.searchText!.includes(query) && (stateFilter.value === 'all' || row.dataset.state === stateFilter.value));
      if (!row.hidden) matches++;
    }
    const total = snapshot?.catalog.sources.length ?? 0;
    count.textContent = snapshot ? `${matches} / ${total} 个来源` : '尚未读取来源';
    empty.hidden = !snapshot || matches > 0;
    empty.textContent = total ? '没有匹配的来源。清除筛选可查看全部。' : '当前目录暂无规则来源。';
    clearFilters.hidden = !search.value && stateFilter.value === 'all';
  }
  function render() {
    reload.disabled = loading || Boolean(active) || canceling; stop.disabled = !active || canceling; stop.hidden = !active;
    dialog.setAttribute('aria-busy', String(loading || Boolean(active) || canceling)); status.dataset.running = String(Boolean(active));
    version.textContent = snapshot ? `目录版本 ${snapshot.catalog.catalogVersion.slice(0, 12)} · 维护核验参考周期 ${snapshot.catalog.staleDays} 天` : '来源目录尚未读取';
    const focused = [...focusTargets].find(([, targets]) => document.activeElement === targets.summary || document.activeElement === targets.check || document.activeElement === targets.link);
    const focusedCheck = focused && document.activeElement === focused[1].check;
    const focusedLink = focused && document.activeElement === focused[1].link;
    focusTargets.clear(); list.textContent = '';
    for (const source of snapshot?.catalog.sources ?? []) {
      const saved = snapshot!.checks.find(check => check.sourceId === source.id), manual = source.baseline?.method === 'manual' || saved?.latest.state === 'manual';
      const detail = node('details'); detail.className = 'source-freshness-row'; detail.dataset.sourceId = source.id; detail.open = expanded.has(source.id);
      detail.dataset.state = manual ? 'manual' : saved?.latest.state ?? 'unchecked';
      detail.dataset.searchText = [source.title, source.url, ...source.references.flatMap(reference => [reference.id, reference.title])].join('\n').toLocaleLowerCase();
      detail.addEventListener('toggle', () => { if (detail.open) expanded.add(source.id); else expanded.delete(source.id); });
      const summary = node('summary'); summary.append(node('span', source.title), node('small', active?.sourceId === source.id ? '正在检查正文…' : manual ? labels.manual : saved ? labels[saved.latest.state] : '尚未在线检查'), createIcon(document, 'chevron-down')); detail.append(summary);
      focusTargets.set(source.id, { summary });
      const content = node('div'); content.className = 'source-freshness-detail';
      const link = node('a', source.url); link.href = source.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
      focusTargets.set(source.id, { summary, link });
      if (options.onOpenSource) link.addEventListener('click', event => { event.preventDefault(); void Promise.resolve().then(() => options.onOpenSource!(source.url)).catch(() => { if (!disposed && dialog.open) message('官方来源未能打开，请重试。', true); }); });
      content.append(link, node('p', `正文归档日期：${date(source.baseline?.fetchedAt ?? null)}${manual ? ' · 人工归档' : ''}`));
      const references = node('ul');
      for (const reference of source.references) {
        const old = reference.lastVerified !== null && Date.now() - Date.parse(reference.lastVerified) > snapshot!.catalog.staleDays * 86400000;
        references.append(node('li', `${reference.id} · ${reference.title}${reference.draft ? ' · 草案' : ''} · 维护核验日期：${date(reference.lastVerified)}${old ? ' · 建议人工复核' : ''}`));
      }
      content.append(references, node('p', `${manual ? '上次人工状态记录' : '上次在线尝试'}：${date(saved?.latest.checkedAt ?? null)}${saved ? ` · ${reasons[saved.latest.reason] ?? '结果尚不能判断'}${saved.latest.httpStatus ? `（HTTP ${saved.latest.httpStatus}）` : ''}` : ''}`));
      if (saved?.lastEvidence) content.append(node('p', `保留的有效正文证据：${date(saved.lastEvidence.checkedAt)} · ${labels[saved.lastEvidence.state]}`));
      if (manual) content.append(node('p', '此来源需打开官方页面人工核验；本面板不执行自动正文检查。'));
      else {
        const check = button('', '检查此官方来源'); check.dataset.sourceId = source.id; check.disabled = loading || Boolean(active) || canceling;
        focusTargets.set(source.id, { summary, check, link });
        check.addEventListener('click', () => { void checkSource(source); }); content.append(check);
      }
      detail.append(content); list.append(detail);
    }
    filterRows();
    if (focused) {
      const target = focusTargets.get(focused[0]);
      if ((target?.summary.parentNode as HTMLElement | null)?.hidden) search.focus();
      else (focusedLink ? target?.link : focusedCheck && !loading && !active && !canceling ? target?.check : target?.summary)?.focus();
    }
  }
  async function read() {
    if (disposed || !dialog.open || loading || active || canceling) return;
    const token = epoch; loading = true; message('正在读取本机来源记录…'); render();
    try {
      const value = await options.invoke<Snapshot>('source_freshness_snapshot');
      if (!valid(token)) return;
      if (value.catalog.schemaVersion !== 1 || !Array.isArray(value.catalog.sources) || !Array.isArray(value.checks)) throw new Error('invalid snapshot');
      snapshot = value; message('已读取本机记录；未发起在线请求。');
    } catch { if (valid(token)) message('本机来源记录未能读取，已保留上次内容。请刷新重试。', true); }
    finally { if (valid(token)) { loading = false; render(); } }
  }
  async function checkSource(source: Source) {
    if (disposed || !dialog.open || loading || active || canceling || !snapshot) return;
    const token = epoch, catalogVersion = snapshot.catalog.catalogVersion;
    const run = { runId: crypto.randomUUID(), sourceId: source.id, finished: false }; active = run; message(`正在检查 ${source.title} 的官方正文…`); render();
    try {
      checkRequest = options.invoke<Check>('source_freshness_check', { sourceId: run.sourceId, runId: run.runId });
      const check = await checkRequest, result = check.latest;
      if (!valid(token) || active !== run || canceling) return;
      if (check.sourceId !== source.id || result.sourceId !== source.id || result.catalogVersion !== catalogVersion || result.schemaVersion !== 1) throw new Error('stale result');
      snapshot.checks = [...snapshot.checks.filter(item => item.sourceId !== source.id), check];
      message(`${labels[result.state]}。${reasons[result.reason] ?? '请人工核验'}；记录已保存在本机。`, result.state === 'unavailable' || result.state === 'unknown');
    } catch { if (valid(token) && active === run && !canceling) message('在线检查未能完成，已保留上次有效正文证据。可重试此来源。', true); }
    finally { run.finished = true; if (valid(token) && active === run && !canceling) { active = null; render(); } }
  }
  async function cancel() {
    if (!active || canceling) return;
    const run = active, request = checkRequest, token = epoch; canceling = true; message('正在停止本次来源检查…'); render();
    try {
      await options.invoke('run_cancel', { runId: run.runId });
      await request?.catch(() => {});
      if (!valid(token)) return;
      epoch++; active = null; message('已停止本次来源检查。上次有效正文证据仍保留，可刷新本机记录。');
    } catch { if (valid(token)) { if (run.finished) active = null; message('停止请求未能完成，请重试停止；上次证据仍保留。', true); } }
    finally { if (!disposed && dialog.open && (token === epoch || token + 1 === epoch)) { canceling = false; render(); } }
  }
  function closed() {
    epoch++; loading = false; canceling = false; const run = active; active = null;
    if (run) void options.invoke('run_cancel', { runId: run.runId }).catch(() => {});
    anchor?.setAttribute('aria-expanded', 'false'); if (!disposed && anchor?.isConnected) anchor.focus();
  }
  dismiss.addEventListener('click', () => dialog.close()); done.addEventListener('click', () => dialog.close()); reload.addEventListener('click', () => { void read(); }); stop.addEventListener('click', () => { void cancel(); }); dialog.addEventListener('close', closed);
  search.addEventListener('input', filterRows); stateFilter.addEventListener('change', filterRows);
  clearFilters.addEventListener('click', () => { search.value = ''; stateFilter.value = 'all'; filterRows(); search.focus(); });
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab' || event.defaultPrevented || event.isComposing || event.ctrlKey || event.altKey || event.metaKey) return;
    const target = event.shiftKey && document.activeElement === dismiss ? done : !event.shiftKey && document.activeElement === done ? dismiss : null;
    if (target) { event.preventDefault(); target.focus(); }
  });
  render();
  return {
    open(opener: HTMLElement | null = null) { if (disposed || dialog.open) return; anchor = opener; epoch++; dialog.showModal(); anchor?.setAttribute('aria-expanded', 'true'); dismiss.focus(); void read(); },
    close() { if (dialog.open) dialog.close(); },
    destroy() { if (disposed) return; disposed = true; closed(); dialog.remove(); },
  };
}
