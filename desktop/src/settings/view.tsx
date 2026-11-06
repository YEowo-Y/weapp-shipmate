import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Button } from '../components/ui/button';
import { Appearance } from './appearance';
import { AuxiliarySettings } from './auxiliary';
import { Icon } from './icon';
import { searchSettings, settingsSections } from './catalog';
import type { PreferencesStore } from './preferences-store';
import type { ShortcutsStore } from './shortcuts-store';
import type { SettingsOptions, SettingsSection } from './types';

type Props = { store: PreferencesStore; shortcuts: ShortcutsStore; options: SettingsOptions; section: SettingsSection; element: HTMLElement | null; loading: boolean; error: string; onSection(section: SettingsSection, target?: string): void; onClose(): void; onRetry(): void; onCanNavigate(): boolean };

function PanelHost({ element }: { element: HTMLElement }) {
  const host = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const parent = host.current!; parent.append(element);
    return () => { if (element.parentElement === parent) element.remove(); };
  }, [element]);
  return <div className="preferences-panel-host" ref={host} />;
}

export function SettingsView({ store, shortcuts, options, section, element, loading, error, onSection, onClose, onRetry, onCanNavigate }: Props) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [query, setQuery] = useState(''), [resultsOpen, setResultsOpen] = useState(false), [navigation, setNavigation] = useState(false);
  const [saved, setSaved] = useState('');
  useEffect(() => {
    if (!snapshot.error && /保存|同步|恢复/.test(snapshot.status)) {
      setSaved(snapshot.status); const timer = window.setTimeout(() => setSaved(''), 3000); return () => window.clearTimeout(timer);
    }
    setSaved('');
  }, [snapshot.status, snapshot.error]);
  const sections = settingsSections.filter(item => item.id !== 'notifications' || options.systemNotifications);
  const current = sections.find(item => item.id === section)!;
  const results = searchSettings(query, !!options.systemNotifications);
  const choose = (next: SettingsSection, target?: string) => { if (!onCanNavigate()) return; setNavigation(false); setResultsOpen(false); onSection(next, target); };
  return <div className="preferences-layout" data-settings-renderer="react" data-navigation={navigation} data-search={resultsOpen}>
    <aside className="preferences-sidebar">
      <header className="preferences-sidebar-header"><h2 id="preferences-heading">设置</h2></header>
      <label className="preferences-search"><Icon name="search" /><input id="preferences-search" type="search" aria-label="搜索设置" placeholder="搜索设置" value={query} onFocus={() => { if (query.trim() && onCanNavigate()) setResultsOpen(true); }} onChange={event => { setQuery(event.target.value); if (onCanNavigate()) { setResultsOpen(!!event.target.value.trim()); } }} /></label>
      <nav className="preferences-navigation" aria-label="设置分类">
        {[...new Set(sections.map(item => item.group))].map(group => <div className="preferences-nav-group" key={group}><p>{group}</p>{sections.filter(item => item.group === group).map(item => <Button key={item.id} id={`preferences-nav-${item.id}`} aria-current={section === item.id && !resultsOpen ? 'page' : undefined} onClick={() => choose(item.id)}><Icon name={item.icon} />{item.label}</Button>)}</div>)}
      </nav>
      <footer className="preferences-sidebar-footer"><Button id="preferences-dismiss" onClick={onClose}><Icon name="arrow-left" />返回应用</Button></footer>
    </aside>
    <main className="preferences-main">
      <header className="preferences-content-header"><Button id="preferences-categories" onClick={() => { setNavigation(true); setResultsOpen(false); window.setTimeout(() => document.getElementById(`preferences-nav-${section}`)?.focus(), 0); }}><Icon name="arrow-left" />设置分类</Button><Button id="preferences-content-dismiss" aria-label="关闭设置" onClick={onClose}><Icon name="x" /></Button></header>
      <div id="preferences-body" className="context-body">
        {resultsOpen ? <section className="preferences-results" aria-labelledby="preferences-section-title"><h3 id="preferences-section-title" tabIndex={-1}>搜索结果</h3><p role="status">{results.length ? `${results.length} 项设置` : '未找到匹配设置，请尝试“模型”“备份”或“主题”。'}</p>{results.map(item => <Button key={`${item.section}-${item.target}`} className="preferences-search-result" onClick={() => choose(item.section, item.target)}><span><strong>{item.title}</strong><small>{settingsSections.find(s => s.id === item.section)?.label}</small></span><Icon name="chevron-right" /></Button>)}</section> : <>
          {query.trim() && <Button className="preferences-back-results" onClick={() => { if (onCanNavigate()) setResultsOpen(true); }}><Icon name="arrow-left" />返回搜索结果</Button>}
          <h3 id="preferences-section-title" tabIndex={-1}>{current.label}</h3>
          {error && <div className="preferences-error" role="alert"><p>{error}</p><Button onClick={onRetry}>重试</Button></div>}
          {loading && <p className="preferences-loading" role="status">正在读取设置…</p>}
          {section === 'appearance' && <><Appearance snapshot={snapshot} store={store} hidden={false} /><div className="preferences-feedback"><p id="preferences-status" role="status" data-error={snapshot.error}>{snapshot.error ? snapshot.status : saved}</p>{snapshot.error && <Button id="preferences-retry" onClick={store.read}>重新读取</Button>}</div></>}
          {['shortcuts', 'privacy', 'about'].includes(section) && <AuxiliarySettings key={section} section={section} options={options} shortcuts={shortcuts} />}
        </>}
        <div hidden={resultsOpen}>{element && <PanelHost element={element} />}</div>
      </div>
    </main>
  </div>;
}
