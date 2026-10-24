import { createActionButton } from '../design-previews/components/ui-kit.js';
import { createIcon } from '../design-previews/components/icons.js';
import './context.css';
import './preferences.css';

type Preferences = { version: 1; theme: 'system' | 'light' | 'dark'; messageSize: 14 | 16 | 18; motion: 'system' | 'reduce' };
type SettingsSection = 'appearance' | 'notifications' | 'connections';
type Options = { onModels(anchor: HTMLElement | null): void; onData(anchor: HTMLElement | null): void; onMaintenance(anchor: HTMLElement | null): void; onProjects(anchor: HTMLElement | null): void; onSources(anchor: HTMLElement | null): void; systemNotifications?: { element: HTMLElement; open(): Promise<void>; close(): void; destroy(): void } };
const KEY = 'shipmate-desktop-preferences';
const DEFAULTS: Preferences = { version: 1, theme: 'system', messageSize: 16, motion: 'system' };

function valid(value: unknown): value is Preferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return Object.keys(item).length === 4 && item.version === 1 && ['system', 'light', 'dark'].includes(item.theme as string)
    && [14, 16, 18].includes(item.messageSize as number) && ['system', 'reduce'].includes(item.motion as string);
}
function decode(raw: string | null): Preferences {
  if (raw === null) return { ...DEFAULTS };
  if (raw.length > 1024) throw new Error('invalid');
  const value: unknown = JSON.parse(raw);
  if (!valid(value)) throw new Error('invalid');
  return value;
}

/** Mount once after document.body exists; only non-sensitive device appearance is persisted. */
export function mountPreferences(options: Options) {
  const node = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '') => { const element = document.createElement(tag); element.textContent = text; return element; };
  const button = (id: string, text: string, appearance: 'plain' | 'outlined' = 'plain') => { const element = createActionButton(document, text, { appearance }); element.id = id; return element; };
  const dialog = node('dialog'); dialog.id = 'desktop-preferences'; dialog.className = 'context-dialog preferences-dialog';
  dialog.setAttribute('aria-labelledby', 'preferences-heading'); dialog.setAttribute('aria-describedby', 'preferences-description');
  const header = node('header'); header.className = 'context-header';
  const heading = node('h2', '设置'); heading.id = 'preferences-heading';
  const dismiss = button('preferences-dismiss', ''); dismiss.classList.add('ui-action-icon'); dismiss.setAttribute('aria-label', '关闭设置'); dismiss.append(createIcon(document, 'x')); header.append(heading, dismiss);
  const body = node('div'); body.id = 'preferences-body'; body.className = 'context-body';
  const description = node('p', '调整此设备的阅读与通知体验，或前往连接、数据和项目设置。'); description.id = 'preferences-description';
  const navigation = node('nav'); navigation.className = 'preferences-navigation'; navigation.setAttribute('aria-label', '设置分区');
  const sections = new Map<SettingsSection, { panel: HTMLElement; target: HTMLElement; button: HTMLElement }>();
  let selectedSection: SettingsSection = 'appearance';
  function section(id: SettingsSection, label: string, panel: HTMLElement, target = panel) {
    const jump = button(`preferences-nav-${id}`, label); jump.setAttribute('aria-controls', panel.id); target.tabIndex = -1;
    sections.set(id, { panel, target, button: jump }); panel.hidden = true;
    jump.addEventListener('click', () => { if (disposed || !dialog.open) return; showSection(id, true); }); navigation.append(jump);
  }
  const appearance = node('section'); appearance.id = 'preferences-appearance'; appearance.className = 'preferences-appearance'; appearance.setAttribute('aria-labelledby', 'preferences-appearance-title');
  const appearanceHeading = node('h3', '外观与阅读'); appearanceHeading.id = 'preferences-appearance-title'; appearance.append(appearanceHeading);
  appearance.append(node('p', '更改保存到本机后立即生效，不影响会话、项目资料和模型凭据。'));
  section('appearance', '外观与阅读', appearance, appearanceHeading);
  const controls: { node: HTMLInputElement; field: 'theme' | 'messageSize' | 'motion' }[] = [];
  function group(field: 'theme' | 'messageSize' | 'motion', name: string, label: string, hint: string, choices: [string, string][]) {
    const fieldset = node('fieldset'); fieldset.className = 'preferences-field';
    const legend = node('legend', label); const note = node('p', hint); note.id = `${name}-hint`; fieldset.setAttribute('aria-describedby', note.id);
    const choicesNode = node('div'); choicesNode.className = field === 'theme' ? 'preferences-choices preferences-theme-choices' : 'preferences-choices';
    for (const [value, text] of choices) {
      const option = node('label'); const control = node('input'); control.type = 'radio'; control.name = name; control.value = value; control.id = `${name}-${value}`;
      control.addEventListener('change', () => {
        if (disposed || !control.checked) return;
        save({ ...preferences, [field]: field === 'messageSize' ? Number(control.value) : control.value });
      });
      const content = node('span'); content.className = 'preferences-choice';
      if (field === 'theme') {
        const preview = node('span'); preview.className = 'preferences-theme-preview'; preview.dataset.theme = value; preview.setAttribute('aria-hidden', 'true');
        preview.append(node('span'), node('span')); content.append(preview);
      }
      content.append(node('span', text));
      if (field === 'theme') { const check = createIcon(document, 'check'); check.classList.add('preferences-theme-check'); content.append(check); }
      option.append(control, content); choicesNode.append(option); controls.push({ node: control, field });
    }
    fieldset.append(legend, note, choicesNode); appearance.append(fieldset);
  }
  group('theme', 'desktop-theme', '主题', '默认跟随系统；也可固定使用浅色或深色。', [['system', '跟随系统'], ['light', '浅色'], ['dark', '深色']]);
  group('messageSize', 'desktop-message-size', '正文大小', '对话和报告正文即时调整；输入框与代码块保持原字号。', [['14', '小 · 14'], ['16', '标准 · 16'], ['18', '大 · 18']]);
  const sample = node('p', '先查看检查结果，再决定下一步。'); sample.className = 'preferences-sample'; sample.setAttribute('aria-label', '正文大小预览'); appearance.append(sample);
  group('motion', 'desktop-motion', '界面动效', '默认尊重系统设置。减少动效后，执行状态仍以文字清晰展示。', [['system', '跟随系统'], ['reduce', '减少动效']]);
  const status = node('p'); status.id = 'preferences-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-atomic', 'true');
  const recovery = node('div'); recovery.className = 'preferences-recovery';
  const retry = button('preferences-retry', '重新读取'); retry.hidden = true;
  const reset = button('preferences-reset', '恢复外观默认', 'outlined'); reset.setAttribute('aria-describedby', 'preferences-reset-description'); recovery.append(reset);
  const resetNote = node('p', '仅恢复主题、正文大小和动效，不清除会话、项目资料或凭据。'); resetNote.id = 'preferences-reset-description';
  const links = node('section'); links.id = 'preferences-connections'; links.className = 'preferences-links'; links.setAttribute('aria-labelledby', 'preferences-links-heading');
  const linksHeading = node('h3', '连接与数据'); linksHeading.id = 'preferences-links-heading'; links.append(linksHeading);
  links.append(node('p', '打开对应页面继续设置，返回时保留已保存的外观。'));
  if (options.systemNotifications) { options.systemNotifications.element.id = 'preferences-notifications'; section('notifications', '系统通知', options.systemNotifications.element); }
  section('connections', '连接与数据', links, linksHeading);
  const deviceLinks = node('div'); deviceLinks.className = 'preferences-link-group'; deviceLinks.append(node('h4', '连接与数据'));
  const projectLinks = node('div'); projectLinks.className = 'preferences-link-group'; projectLinks.append(node('h4', '项目与依据')); links.append(deviceLinks, projectLinks);
  const routes: [string, string, string, string, (anchor: HTMLElement | null) => void][] = [
    ['models', '模型连接', '此设备 · 服务商、授权与凭据保存', 'bot', options.onModels],
    ['data', '数据与会话', '此工作区 · 下载会话备份与追加导入', 'folder', options.onData],
    ['maintenance', '项目维护', '当前项目 · 文件监听、检查记录与提醒', 'activity', options.onMaintenance],
    ['sources', '规则来源', '此设备 · 来源状态、归档依据与主动联网检查', 'book-open', options.onSources],
    ['projects', '项目与成果', '本机项目 · 文件夹、主体与项目备份', 'folder', options.onProjects],
  ];
  for (const [id, label, hint, icon, callback] of routes) {
    const link = button(`preferences-${id}`, ''); link.classList.add('preferences-link'); link.setAttribute('aria-label', `打开${label}`);
    const start = createIcon(document, icon); start.setAttribute('slot', 'start');
    const content = node('span'); content.append(node('strong', label), node('small', hint));
    const arrow = createIcon(document, 'chevron-right'); arrow.setAttribute('slot', 'end'); link.append(start, content, arrow);
    link.addEventListener('click', () => { if (disposed || !dialog.open || selectedSection !== 'connections') return; const opener = anchor; dialog.close(); callback(opener?.isConnected ? opener : null); }); (id === 'models' || id === 'data' ? deviceLinks : projectLinks).append(link);
  }
  const footer = node('footer'); footer.className = 'preferences-footer'; const done = button('preferences-done', '完成');
  const feedback = node('div'); feedback.className = 'preferences-feedback'; feedback.append(status, retry); footer.append(feedback, done);
  const layout = node('div'); layout.className = 'preferences-layout'; layout.append(navigation, body);
  appearance.append(recovery, resetNote); body.append(appearance); if (options.systemNotifications) body.append(options.systemNotifications.element); body.append(links); dialog.append(header, description, layout, footer); document.body.append(dialog);

  let preferences = { ...DEFAULTS }, blocked = false, disposed = false, epoch = 0, anchor: HTMLElement | null = null;
  const systemTheme = window.matchMedia('(prefers-color-scheme: dark)'), systemMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  function showSection(requested: SettingsSection, focus = false) {
    selectedSection = sections.has(requested) ? requested : 'appearance';
    for (const [id, item] of sections) {
      item.panel.hidden = id !== selectedSection;
      if (id === selectedSection) item.button.setAttribute('aria-current', 'page'); else item.button.removeAttribute('aria-current');
    }
    dialog.dataset.section = selectedSection; body.scrollTop = 0;
    feedback.hidden = selectedSection !== 'appearance' && status.dataset.error !== 'true';
    if (focus) sections.get(selectedSection)?.target.focus({ preventScroll: true });
  }
  function message(text: string, error = false) { status.textContent = text; status.dataset.error = String(error); retry.hidden = !error; feedback.hidden = selectedSection !== 'appearance' && !error; }
  function sync() { for (const control of controls) { control.node.checked = String(preferences[control.field]) === control.node.value; control.node.disabled = blocked; } }
  function apply() {
    document.body.dataset.theme = preferences.theme === 'system' ? (systemTheme.matches ? 'dark' : 'light') : preferences.theme;
    document.body.dataset.motion = preferences.motion === 'reduce' || systemMotion.matches ? 'reduce' : 'system';
    document.body.style.setProperty('--message-font-size', `${preferences.messageSize}px`); sync();
  }
  function read() {
    if (disposed) return;
    let raw: string | null;
    try { raw = window.localStorage.getItem(KEY); }
    catch { blocked = true; sync(); message('未能读取本机外观设置，当前外观保持不变。请重新读取；恢复默认只会写入外观设置。', true); return; }
    try { preferences = decode(raw); blocked = false; apply(); message(raw === null ? '当前使用默认外观：跟随系统、标准正文、系统动效。' : '已读取此设备的外观设置。'); }
    catch { blocked = true; sync(); message('本机外观设置损坏或版本不受支持，当前外观保持不变。可重新读取或明确恢复外观默认；原记录尚未改写。', true); }
  }
  function save(next: unknown, resetting = false) {
    if (disposed) return;
    if ((blocked && !resetting) || !valid(next)) { sync(); return; }
    try { window.localStorage.setItem(KEY, JSON.stringify(next)); }
    catch { sync(); message('未能保存外观设置，已保持原来的实际外观。可重新选择后重试，或重新读取本机记录。', true); return; }
    preferences = { ...next }; blocked = false; apply(); message(resetting ? '已恢复外观默认并保存在此设备。会话、项目与凭据未更改。' : '外观已保存到此设备，并立即生效。');
  }
  function storageChanged(event: StorageEvent) {
    if (disposed || (event.key !== KEY && event.key !== null)) return;
    try { if (event.storageArea !== window.localStorage) return; } catch { return; }
    try { preferences = decode(event.key === null ? null : event.newValue); blocked = false; apply(); message('已同步其他窗口的外观设置。'); }
    catch { blocked = true; sync(); message('其他窗口的外观设置损坏或版本不受支持，当前外观保持不变。请重新读取或恢复外观默认。', true); }
  }
  const systemChanged = () => { if (!disposed) apply(); };
  systemTheme.addEventListener('change', systemChanged); systemMotion.addEventListener('change', systemChanged); window.addEventListener('storage', storageChanged);
  reset.addEventListener('click', () => save({ ...DEFAULTS }, true)); retry.addEventListener('click', read);
  dismiss.addEventListener('click', () => dialog.close()); done.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    options.systemNotifications?.close(); epoch++; anchor?.setAttribute('aria-expanded', 'false');
    if (disposed || !anchor?.isConnected) return;
    const visible = (element: HTMLElement | null | undefined) => element?.isConnected && !element.hidden
      && (!element.getClientRects || element.getClientRects().length > 0);
    // Resizing can fold the navigation while the modal owns focus. Keep it
    // folded and return to its visible disclosure, not its hidden opener.
    const target = visible(anchor) ? anchor : anchor.closest?.('details:not([open])')?.querySelector<HTMLElement>('summary');
    if (visible(target)) target!.focus();
  });
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab' || event.defaultPrevented || event.isComposing || event.ctrlKey || event.altKey || event.metaKey) return;
    const target = event.shiftKey && document.activeElement === dismiss ? done : !event.shiftKey && document.activeElement === done ? dismiss : null;
    if (target) { event.preventDefault(); target.focus(); }
  });
  apply(); read(); showSection('appearance');
  return {
    open(opener: HTMLElement | null = null, selected: SettingsSection = 'appearance') {
      if (disposed || dialog.open) return;
      anchor = opener; const token = ++epoch; sync(); showSection(selected); dialog.showModal(); body.scrollTop = 0; void options.systemNotifications?.open(); anchor?.setAttribute('aria-expanded', 'true');
      const focused = document.activeElement;
      const ready = (dismiss as typeof dismiss & { updateComplete?: Promise<boolean> }).updateComplete;
      void Promise.resolve(ready).then(() => { if (!disposed && token === epoch && dialog.open && document.activeElement === focused) dismiss.focus(); });
    },
    destroy() {
      disposed = true; options.systemNotifications?.destroy(); epoch++; anchor?.setAttribute('aria-expanded', 'false'); systemTheme.removeEventListener('change', systemChanged); systemMotion.removeEventListener('change', systemChanged); window.removeEventListener('storage', storageChanged); dialog.remove();
    },
  };
}

