type Invoke = <T>(name: string, args: Record<string, unknown>) => Promise<T>;
type Query = { ruleId: string; url: string; quote: string };
type RecordEntry = {
  latest: { match: 'exact' | 'whitespace-normalized' | 'missing' | 'unverified'; source: { checkedAt: number; reason: string; state: string } };
  lastVerifiedAt: number | null;
};
type Snapshot = { catalogVersion: string; rows: { availability: 'ready' | 'manual' | 'unsupported' | 'invalid-record'; record: RecordEntry | null }[] };
export type QuoteState = 'unchecked' | 'matched' | 'missing' | 'unverified' | 'manual';
export type QuoteRow = { query: Query; status: HTMLElement; detail: HTMLElement; button: HTMLButtonElement; state?: QuoteState };

const date = (time: number) => new Date(time).toLocaleString('zh-CN', { hour12: false });
const reasons: Record<string, string> = {
  network: '网络连接失败', timeout: '请求超时', redirect: '官方页面返回重定向',
  access: '无法访问官方正文', body: '未取得可核对的正文', not_found: '官方页面已不可用',
};

export function mountReportQuoteChecks(invoke: Invoke, rulesVersion: string, rows: QuoteRow[], onChange: (completed?: QuoteRow) => void) {
  let disposed = false, runId: string | null = null, catalogVersion = '';
  const ready = new Set<QuoteRow>(), history = new Map<QuoteRow, RecordEntry>();
  const queries = rows.filter(row => {
    const { url, quote } = row.query;
    if (url && quote.trim()) return true;
    row.state = 'manual';
    row.status.textContent = url ? '无法核验 · 报告未提供引文' : '无法核验 · 报告未提供官方链接';
    return false;
  });
  function buttons(running?: QuoteRow) {
    for (const row of ready) {
      row.button.disabled = runId !== null && row !== running;
      row.button.setAttribute('aria-disabled', String(runId !== null));
    }
  }
  function show(row: QuoteRow, record: RecordEntry, saved: boolean) {
    const { source, match } = record.latest;
    row.state = match === 'exact' || match === 'whitespace-normalized' ? 'matched' : match;
    const labels = { exact: '引文逐字匹配', 'whitespace-normalized': '忽略空白后匹配', missing: '官方正文未找到此引文', unverified: '无法核验' };
    row.status.textContent = (saved ? '上次记录 · ' : '本次核验 · ') + labels[match];
    const details = [`核验时间 ${date(source.checkedAt)}`];
    if (match === 'unverified') details.push(reasons[source.reason] || '没有取得有效正文');
    if (match === 'missing') details.push('请打开官方依据，核对原文和上下文');
    if (source.state === 'changed') details.push('页面正文与归档有差异');
    if ((match === 'missing' || match === 'unverified') && record.lastVerifiedAt) details.push(`上次匹配时间 ${date(record.lastVerifiedAt)}`);
    row.detail.textContent = details.join(' · ');
    row.button.textContent = '重新在线核验';
    history.set(row, record);
  }
  async function check(row: QuoteRow) {
    if (disposed || runId || !ready.has(row)) return;
    runId = crypto.randomUUID(); buttons(row);
    row.status.textContent = '正在核对官方正文…'; row.detail.textContent = '';
    const attempt = Date.now();
    try {
      const record = await invoke<RecordEntry>('source_quote_check', { query: row.query, rulesVersion, catalogVersion, runId });
      if (!disposed) show(row, record, false);
    } catch {
      if (!disposed) {
        const last = history.get(row)?.lastVerifiedAt;
        row.state = 'unverified';
        row.status.textContent = '本次未能完成核验';
        row.detail.textContent = `尝试时间 ${date(attempt)} · 请稍后重试或重新打开报告` + (last ? ` · 上次匹配时间 ${date(last)}` : '');
      }
    } finally { runId = null; if (!disposed) { buttons(); onChange(row); } }
  }
  async function load() {
    if (!queries.length) { onChange(); return; }
    try {
      const snapshot = await invoke<Snapshot>('source_quote_snapshot', { queries: queries.map(r => r.query), rulesVersion });
      if (disposed) return;
      if (queries.length !== snapshot.rows.length) throw Error('incomplete snapshot');
      catalogVersion = snapshot.catalogVersion;
      for (const [i, row] of queries.entries()) {
        const { availability, record } = snapshot.rows[i];
        if (availability === 'invalid-record') {
          row.state = 'unverified';
          row.status.textContent = '无法核验 · 本条核验记录损坏';
          row.detail.textContent = '请打开官方依据核对原文。';
          continue;
        }
        if (availability !== 'ready') {
          row.state = 'manual';
          row.status.textContent = availability === 'manual' ? '需人工核对 · 此来源仅有人工归档' : '无法核验 · 未找到对应的内置官方来源或有效引文';
          continue;
        }
        ready.add(row); row.button.hidden = false;
        row.button.addEventListener('click', () => void check(row));
        if (record) show(row, record, true);
        else { row.state = 'unchecked'; row.status.textContent = '尚未在线核验'; }
      }
    } catch {
      if (!disposed) for (const row of queries) {
        row.state = 'unverified'; row.status.textContent = '无法读取核验记录 · 请重新打开报告';
      }
    }
    if (!disposed) onChange();
  }
  void load();
  return () => {
    disposed = true;
    if (runId) void invoke('run_cancel', { runId }).catch(() => {});
  };
}
