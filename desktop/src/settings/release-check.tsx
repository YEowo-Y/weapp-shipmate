import { useLayoutEffect, useRef, useState } from 'react';
import { Button } from '../components/ui/button';
import type { ReleaseCheckResult, SettingsOptions } from './types';

type ViewState = ReleaseCheckResult | { status: 'idle' | 'checking' };
type PublicRelease = Extract<ReleaseCheckResult, { status: 'release' }>;
const initial: ViewState = { status: 'idle' };
const statusText = {
  idle: '点击后从 GitHub 查询公开稳定版。',
  checking: '正在检查更新…',
  unavailable: '暂无可查询的公开版本。',
  busy: '上一次检查仍在运行，请稍后重试。',
  failed: '检查更新失败，请重试。',
};
const comparisonText: Record<PublicRelease['comparison'], string> = {
  public_newer: '公开稳定版较新。',
  same: '当前版本与公开稳定版相同。',
  local_newer: '当前版本较新。',
};

export function ReleaseCheck({ checkRelease, onReleasePage }: Pick<SettingsOptions, 'checkRelease' | 'onReleasePage'>) {
  const row = useRef<HTMLDivElement>(null);
  const pending = useRef<symbol | null>(null);
  const [result, setResult] = useState<ViewState>(initial);
  const [openFailed, setOpenFailed] = useState<PublicRelease | null>(null);

  useLayoutEffect(() => {
    const dialog = row.current?.closest('dialog');
    const reset = () => {
      if (dialog?.open) return;
      pending.current = null;
      setResult(initial);
      setOpenFailed(null);
    };
    dialog?.addEventListener('close', reset);
    return () => {
      pending.current = null;
      dialog?.removeEventListener('close', reset);
    };
  }, []);

  function isOpen() {
    return row.current?.closest('dialog')?.open === true;
  }

  async function check() {
    if (pending.current !== null || !isOpen()) return;
    const ticket = Symbol();
    pending.current = ticket;
    setResult({ status: 'checking' });
    setOpenFailed(null);
    let reply: ReleaseCheckResult;
    try { reply = await checkRelease(); }
    catch { reply = { status: 'failed' }; }
    if (pending.current !== ticket) return;
    pending.current = null;
    if (isOpen()) setResult(reply);
  }

  async function openRelease() {
    if (result.status !== 'release' || !isOpen()) return;
    setOpenFailed(null);
    try { await onReleasePage(result.url); }
    catch { if (isOpen()) setOpenFailed(result); }
  }

  return <div className="preferences-group" ref={row}>
    <div className="settings-row">
      <span>
        <strong>最新公开稳定版{result.status === 'release' && <> <span id="settings-release-tag">{result.tag}</span></>}</strong>
        <small id="settings-release-status" role="status">
          {result.status === 'release' ? comparisonText[result.comparison] : statusText[result.status]}
          {openFailed === result && ' 无法打开发布页，请重试。'}
        </small>
      </span>
      <div className="settings-heading-actions">
        <Button id="settings-check-release" variant="outline" aria-disabled={result.status === 'checking'}
          aria-describedby="settings-release-status" onClick={() => { void check(); }}>检查更新</Button>
        {result.status === 'release' && <Button id="settings-release-page" variant="outline"
          aria-label="查看发布页（在系统浏览器中打开）" onClick={() => { void openRelease(); }}>查看发布页 ↗</Button>}
      </div>
    </div>
  </div>;
}
