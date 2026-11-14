/* global document, window, URLSearchParams */
import { iconMarkup } from './components/icons.js';
import { settingsReturnDestination, destinationLabel, sessionManagementHref } from './navigation.js';

const ICONS = { key: 'bot', data: 'folder', appear: 'sliders-horizontal', cap: 'list-checks', sec: 'shield-check', scan: 'folder', rules: 'file-text', about: 'package' };
const LABELS = { key: '模型与密钥', data: '数据与会话', appear: '外观', cap: '工程体检', sec: '隐私与安全', scan: '项目与扫描', rules: '规则库', about: '关于' };
const PREVIEW = new Set(['cap', 'scan', 'rules', 'sec']);
const GROUPS = [['连接与数据', ['key', 'data']], ['通用', ['appear', 'about']], ['设计预览 · 未接入', ['cap', 'sec', 'scan', 'rules']]];
const normalize = text => text.normalize('NFKC').toLocaleLowerCase('zh-CN');

export function mountSettingsNavigation(root, host) {
  const destination = settingsReturnDestination(host.location.search || '');
  const preview = new URLSearchParams(host.location.search || '').get('preview') === 'settings';
  const available = id => Object.hasOwn(LABELS, id) && (preview || !PREVIEW.has(id));
  const settingsUrl = `settings.html?from=${encodeURIComponent(destination)}`;
  const notice = root.querySelector('[data-settings-preview-notice]');
  if (notice) notice.hidden = !preview;
  const exit = root.querySelector('[data-settings-preview-exit]');
  if (exit) exit.href = `${settingsUrl}#key`;
  root.querySelectorAll('[data-session-management]').forEach(link => {
    link.href = sessionManagementHref(host.location.search || '', link.dataset.sessionManagement);
  });
  root.querySelectorAll('[data-settings-return]').forEach(link => {
    link.href = destination;
    link.textContent = `返回${destinationLabel(destination)}`;
    link.setAttribute('aria-label', link.textContent);
    link.insertAdjacentHTML('afterbegin', iconMarkup('arrow-left'));
  });
  const nav = root.getElementById('nav');
  if (!nav) return;
  nav.innerHTML = `<div class="set-search">${iconMarkup('search')}<input type="search" aria-label="搜索设置" placeholder="搜索设置…" /></div>` +
    GROUPS.map(([group, ids]) => [group, ids.filter(available)]).filter(([, ids]) => ids.length)
      .map(([group, ids]) => `<div class="set-nav__group">${group}</div>` + ids.map(id => `<button type="button" aria-current="false" data-p="${id}">${iconMarkup(ICONS[id])}${LABELS[id]}${PREVIEW.has(id) ? '<small class="set-nav__preview">未接入</small>' : ''}</button>`).join('')).join('');
  const search = nav.querySelector('input');
  const buttons = [...nav.querySelectorAll('button[data-p]')];
  const panels = [...root.querySelectorAll('.set-panel')];
  const content = root.querySelector('.set-content');
  const empty = root.querySelector('[data-settings-empty]');
  const unavailable = root.querySelector('[data-settings-unavailable]');
  const unavailableTitle = root.querySelector('[data-settings-unavailable-title]');
  const previewLink = root.querySelector('[data-settings-preview-link]');
  const status = root.createElement('p');
  status.className = 'sr-only';
  status.setAttribute('role', 'status');
  nav.append(status);
  const fromHash = () => {
    const id = host.location.hash.replace(/^#/, '');
    return Object.hasOwn(LABELS, id) ? id : 'key';
  };
  let selected = fromHash();

  function render() {
    const query = normalize(search.value).trim();
    const blocked = !query && !available(selected);
    const matches = panels.filter(panel => available(panel.dataset.p) && normalize(`${LABELS[panel.dataset.p]} ${panel.textContent}`).includes(query));
    const ids = new Set(matches.map(panel => panel.dataset.p));
    const active = blocked ? undefined : ids.has(selected) ? selected : matches[0]?.dataset.p;
    const hiddenFocus = panels.some(panel => panel.dataset.p !== active && panel.contains?.(root.activeElement))
      || (matches.length > 0 && empty?.contains?.(root.activeElement))
      || (!blocked && unavailable?.contains?.(root.activeElement));
    if (unavailable) unavailable.hidden = !blocked;
    if (unavailableTitle) unavailableTitle.textContent = `${LABELS[selected]}尚未接入`;
    if (previewLink) previewLink.href = `${settingsUrl}&preview=settings#${selected}`;
    buttons.forEach(button => {
      button.hidden = !ids.has(button.dataset.p);
      button.classList.toggle('on', button.dataset.p === active);
      button.setAttribute('aria-current', button.dataset.p === active ? 'page' : 'false');
    });
    panels.forEach(panel => {
      panel.hidden = panel.dataset.p !== active;
      panel.classList.toggle('on', !panel.hidden);
    });
    nav.querySelectorAll('.set-nav__group').forEach(group => { group.hidden = Boolean(query); });
    status.textContent = matches.length ? '' : '没有匹配的设置，请尝试其他关键词或清空搜索。';
    if (empty) empty.hidden = blocked || matches.length > 0;
    content.scrollTop = 0;
    if (hiddenFocus) (buttons.find(button => button.dataset.p === active && !button.hidden) || search).focus({ preventScroll: true });
  }

  nav.addEventListener('click', event => {
    const button = event.target.closest('button[data-p]');
    if (!button || !nav.contains(button) || button.hidden || !available(button.dataset.p)) return;
    selected = button.dataset.p;
    search.value = '';
    host.location.hash = selected;
    render();
  });
  host.addEventListener('hashchange', () => {
    selected = fromHash();
    search.value = '';
    render();
  });
  search.addEventListener('input', render);
  search.addEventListener('search', render);
  empty?.querySelector('[data-settings-clear]')?.addEventListener('click', () => {
    search.value = '';
    search.focus({ preventScroll: true });
    render();
  });
  root.querySelectorAll('input[name="theme"]').forEach(control => {
    control.addEventListener('change', () => {
      if (control.checked) host.shipmatePreview.setTheme(control.value);
    });
  });
  render();
}

if (typeof document !== 'undefined') mountSettingsNavigation(document, window);
