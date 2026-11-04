import { useEffect, useState, useSyncExternalStore } from 'react';
import { Button } from '../components/ui/button';
import type { SettingsOptions, SettingsSection, PrivacyState, VersionInfo } from './types';
import type { ShortcutsStore, SendKey } from './shortcuts-store';

export function AuxiliarySettings({ section, options, shortcuts }: { section: SettingsSection; options: SettingsOptions; shortcuts: ShortcutsStore }) {
  const keys = useSyncExternalStore(shortcuts.subscribe, shortcuts.getSnapshot);
  const [privacy, setPrivacy] = useState<PrivacyState | null>(null), [versions, setVersions] = useState<VersionInfo | null>(null);
  const [error, setError] = useState(''), [revision, setRevision] = useState(0), [busy, setBusy] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  useEffect(() => section === 'privacy' ? options.subscribePrivacy?.(() => setRevision(value => value + 1)) : undefined, [section, options]);
  useEffect(() => {
    let alive = true; setError('');
    const read = section === 'privacy' ? Promise.resolve().then(options.getPrivacy).then(value => { if (alive) setPrivacy(value); })
      : section === 'about' ? Promise.resolve().then(options.getVersions).then(value => { if (alive) setVersions(value); }) : Promise.resolve();
    void read.catch(() => { if (alive) setError('读取失败，请重试。'); });
    return () => { alive = false; };
  }, [options, section, revision]);
  async function revoke() {
    setBusy(true); setError('');
    try { await options.revokePermissions(); setPrivacy(await options.getPrivacy()); }
    catch { setError('暂时无法撤销权限，请等待当前对话完成后重试。'); }
    finally { setBusy(false); }
  }
  async function copyVersions() {
    if (!versions || busy) return;
    setBusy(true); setCopyStatus('');
    try {
      await (options.copyText ?? (text => navigator.clipboard.writeText(text)))(`上线船友\n桌面应用 ${versions.desktop}\n检查核心 ${versions.core}\n项目规则 ${versions.rules || '尚未加载'}`);
      setCopyStatus('版本信息已复制');
    } catch { setCopyStatus('复制失败，请重试。'); }
    finally { setBusy(false); }
  }
  return <section className="preferences-auxiliary">
    {error && <div role="alert" className="preferences-error"><p>{error}</p><Button onClick={() => setRevision(value => value + 1)}>重新读取</Button></div>}
    {section === 'shortcuts' && <>
      <h4>消息</h4><div className="preferences-group"><label className="settings-row" htmlFor="settings-send-key"><span><strong>发送消息</strong><small>Shift + Enter 始终换行。</small></span><select id="settings-send-key" value={keys.sendKey} disabled={!!keys.error} onChange={event => shortcuts.save(event.target.value as SendKey)}><option value="enter">Enter</option><option value="mod-enter">Ctrl / ⌘ + Enter</option></select></label></div>
      <p role={keys.error ? 'alert' : 'status'}>{keys.error || keys.status}</p>{keys.error && <Button onClick={shortcuts.read}>重新读取</Button>}
      <h4>键盘操作</h4><dl id="settings-keyboard-list" className="preferences-group settings-keyboard-list"><div><dt>新建会话</dt><dd><kbd>Ctrl / ⌘</kbd> + <kbd>N</kbd></dd></div><div><dt>搜索会话</dt><dd><kbd>Ctrl / ⌘</kbd> + <kbd>K</kbd></dd></div><div><dt>打开设置</dt><dd><kbd>Ctrl / ⌘</kbd> + <kbd>,</kbd></dd></div><div><dt>换行</dt><dd><kbd>Shift</kbd> + <kbd>Enter</kbd></dd></div><div><dt>关闭面板 / 取消消息编辑</dt><dd><kbd>Esc</kbd></dd></div><div><dt>移动到下一控件</dt><dd><kbd>Tab</kbd></dd></div><div><dt>移动到上一控件</dt><dd><kbd>Shift</kbd> + <kbd>Tab</kbd></dd></div></dl>
      <Button variant="outline" onClick={shortcuts.reset}>恢复默认发送方式</Button>
    </>}
    {section === 'privacy' && <>
      <h4>当前会话</h4><div id="settings-permissions" className="preferences-group">
        {privacy ? <><div className="settings-row"><span>关联项目</span><strong>{privacy.projectName || '未关联项目'}</strong></div><div className="settings-row"><span>读取项目</span><strong>{privacy.allowRead ? '已允许' : '未允许'}</strong></div><div className="settings-row"><span>向模型发送结果摘要</span><strong>{privacy.shareResults ? '已允许' : '未允许'}</strong></div><div className="settings-row"><span><strong>撤销临时权限</strong><small>权限仅用于当前会话，切换项目或模型后需重新授权。</small></span><Button id="settings-revoke" variant="outline" disabled={busy || privacy.busy || (!privacy.allowRead && !privacy.shareResults)} onClick={() => { void revoke(); }}>撤销权限</Button></div></> : !error && <p className="settings-loading" role="status">正在读取权限…</p>}
      </div><h4>数据存放</h4><div id="settings-storage" className="preferences-group"><div className="settings-row"><span><strong>会话与项目资料</strong><small>保存在此设备。可在“数据与会话”中导出备份或追加导入。</small></span></div><div className="settings-row"><span><strong>模型服务</strong><small>发送消息时，对话内容及你选择的上下文会提交给所连接的服务商。凭据由桌面端的模型连接管理。</small></span></div></div>
    </>}
    {section === 'about' && <>
      <Button id="settings-copy-versions" variant="outline" disabled={!versions || busy} onClick={() => { void copyVersions(); }}>复制版本信息</Button><p role="status">{copyStatus}</p>
      <h4>上线船友</h4><dl id="settings-versions" className="preferences-group settings-keyboard-list">{versions ? <><div><dt>桌面应用</dt><dd>{versions.desktop}</dd></div><div><dt>检查核心</dt><dd>{versions.core}</dd></div><div><dt>项目规则</dt><dd>{versions.rules || '尚未加载项目规则'}</dd></div></> : !error && <p className="settings-loading" role="status">正在读取版本…</p>}</dl>
      <div className="preferences-group"><div className="settings-row"><span><strong>规则来源</strong><small>查看已安装依据，或主动检查来源更新。</small></span><Button id="settings-sources" variant="outline" onClick={event => options.onSources(event.currentTarget)}>查看来源</Button></div><div id="settings-licenses" className="settings-row"><span><strong>开源许可</strong><small>项目使用 MIT 许可证。</small></span><Button variant="outline" onClick={() => { void Promise.resolve().then(options.onRepository).catch(() => setError('无法打开项目源码，请重试。')); }}>项目源码 ↗</Button></div></div>
    </>}
  </section>;
}
