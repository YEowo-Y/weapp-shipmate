import { useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { Button } from '../components/ui/button';
import { Appearance } from './appearance';
import { Icon } from './icon';
import type { PreferencesStore } from './preferences-store';

export type SettingsSection = 'appearance' | 'notifications' | 'connections';
export type SettingsRoute = 'models' | 'data' | 'maintenance' | 'projects' | 'sources';
type Props = { store: PreferencesStore; section: SettingsSection; notifications?: HTMLElement; onSection(section: SettingsSection): void; onClose(): void; onRoute(route: SettingsRoute): void };

/** This host is the only bridge to the existing native-notification controller. */
function NotificationHost({ element, hidden }: { element: HTMLElement; hidden: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    element.id = 'preferences-notifications'; element.tabIndex = -1;
    host.current?.append(element);
    return () => { element.remove(); };
  }, [element]);
  useLayoutEffect(() => { element.hidden = hidden; }, [element, hidden]);
  return <div className="preferences-notification-host" ref={host} hidden={hidden} />;
}

const routeGroups: { title: string; items: { id: SettingsRoute; label: string; hint: string; icon: string }[] }[] = [
  { title: '连接与数据', items: [
    { id: 'models', label: '模型连接', hint: '此设备 · 服务商、授权与凭据保存', icon: 'bot' },
    { id: 'data', label: '数据与会话', hint: '此工作区 · 下载会话备份与追加导入', icon: 'folder' },
  ] },
  { title: '项目与依据', items: [
    { id: 'maintenance', label: '项目维护', hint: '当前项目 · 文件监听、检查记录与提醒', icon: 'activity' },
    { id: 'sources', label: '规则来源', hint: '此设备 · 来源状态、归档依据与主动联网检查', icon: 'book-open' },
    { id: 'projects', label: '项目与成果', hint: '本机项目 · 文件夹、主体与项目备份', icon: 'folder' },
  ] },
];

export function SettingsView({ store, section, notifications, onSection, onClose, onRoute }: Props) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const sections: { id: SettingsSection; label: string; icon: string }[] = [
    { id: 'appearance', label: '外观与阅读', icon: 'sliders-horizontal' },
    ...(notifications ? [{ id: 'notifications' as const, label: '系统通知', icon: 'bell' }] : []),
    { id: 'connections', label: '连接与数据', icon: 'plug' },
  ];
  return <>
    <p id="preferences-description" className="preferences-sr-only">管理此设备的外观、通知与连接。</p>
    <div className="preferences-layout" data-settings-renderer="react">
      <aside className="preferences-sidebar">
        <header className="preferences-sidebar-header"><Button id="preferences-dismiss" aria-label="返回应用" onClick={onClose}><Icon name="arrow-left" />返回应用</Button><h2 id="preferences-heading">设置</h2></header>
        <nav className="preferences-navigation" aria-label="设置分区">
          {sections.map(item => <Button key={item.id} id={`preferences-nav-${item.id}`} aria-controls={`preferences-${item.id}`} aria-current={section === item.id ? 'page' : undefined} onClick={() => onSection(item.id)}><Icon name={item.icon} />{item.label}</Button>)}
        </nav>
      </aside>
      <div className="preferences-main">
        <div id="preferences-body" className="context-body">
          <Appearance snapshot={snapshot} store={store} hidden={section !== 'appearance'} />
          {notifications && <NotificationHost element={notifications} hidden={section !== 'notifications'} />}
          <section id="preferences-connections" className="preferences-links" aria-labelledby="preferences-links-heading" hidden={section !== 'connections'}>
            <h3 id="preferences-links-heading" tabIndex={-1}>连接与数据</h3><p>管理模型服务、会话数据与项目。选择一项打开对应设置。</p>
            {routeGroups.map(group => <div key={group.title} className="preferences-link-group"><h4>{group.title}</h4>{group.items.map(route => <Button key={route.id} id={`preferences-${route.id}`} className="preferences-link" aria-label={`打开${route.label}`} onClick={() => onRoute(route.id)}><Icon name={route.icon} /><span className="preferences-link-copy"><strong>{route.label}</strong><small>{route.hint}</small></span><Icon name="chevron-right" /></Button>)}</div>)}
          </section>
        </div>
        <footer className="preferences-footer"><div className="preferences-feedback" hidden={section !== 'appearance' && !snapshot.error}><p id="preferences-status" role="status" aria-atomic="true" data-error={snapshot.error}>{snapshot.status}</p><Button id="preferences-retry" hidden={!snapshot.error} onClick={store.read}>重新读取</Button></div><Button id="preferences-done" onClick={onClose}>完成</Button></footer>
      </div>
    </div>
  </>;
}
