/* global URLSearchParams */
import { STAGES, stageHref } from './stages.js';
export const PAGES = Object.freeze([
  { href: 'main-four-region.html', label: '上线工作台', group: '项目' },
  { href: 'chat-full.html', label: '会话', group: '项目' },
  { href: 'stage-workspace.html', label: '阶段准备示例', group: '项目' },
  { href: 'audit.html', label: '预检示例报告', group: '核查与处理' },
  { href: 'explain.html', label: '拒因反查', group: '核查与处理' },
  { href: 'diff-review.html', label: '改动审阅示例', group: '核查与处理' },
  { href: 'category-advisor.html', label: '类目选择示例', group: '核查与处理' },
  { href: 'guided-step.html', label: '域名配置步骤示例', group: '核查与处理' },
  { href: 'health-dashboard.html', label: '上线后检查示例', group: '项目资料' },
  { href: 'memory.html', label: '项目记忆示例', group: '项目资料' },
  { href: 'settings.html', label: '偏好与连接', group: '项目资料' },
  { href: 'first-run.html', label: '开始体验', group: '设计参考' },
  { href: 'component-showcase.html', label: '组件状态', group: '设计参考' },
  { href: 'command-palette.html', label: '快捷导航示例', group: '设计参考' },
  { href: 'sync-loop.html', label: '同步方案说明', group: '设计参考' },
  { href: 'index.html', label: '设计总览', group: '设计参考' },
]);

// Keep examples reachable through the catalogue without presenting them as
// everyday product capabilities on the real task and connection surfaces.
const TASK_PAGES = new Set(['main-four-region.html', 'chat-full.html', 'explain.html', 'settings.html']);
function navigationPages(pathname, search = '') {
  const current = pathname.split('/').pop();
  const source = current === 'command-palette.html' ? sourceDestination(pathname, search, []) : current;
  if (!TASK_PAGES.has(source)) return PAGES;
  return [
    ...PAGES.filter(page => TASK_PAGES.has(page.href)),
    { href: 'index.html', label: '设计参考与示例', group: '参考' },
  ];
}

// Return targets are application routes only, never arbitrary URLs or referrers.
function knownDestination(requested, excluded = []) {
  if (typeof requested !== 'string' || excluded.includes(requested.split('?')[0])) return false;
  return PAGES.some(page => page.href === requested)
    || STAGES.some(stage => stageHref(stage.id) === requested)
    || ['new', 'live'].some(status => requested === `first-run.html?status=${status}`);
}

function sourceDestination(pathname, search, excluded) {
  const page = pathname.split('/').pop();
  const params = new URLSearchParams(search);
  let source = page;
  // Settings and the command demo are temporary surfaces, not a new task.
  // Forward only a single allowlisted origin; never grow a nested return chain.
  if (page === 'settings.html' || page === 'command-palette.html') {
    source = params.get('from');
    if (source === 'chat') source = 'chat-full.html';
    if (source === 'workspace') source = 'main-four-region.html';
    return knownDestination(source, ['settings.html', 'command-palette.html', ...excluded]) ? source : 'main-four-region.html';
  }
  if (page === 'stage-workspace.html' && STAGES.some(stage => stage.id === params.get('stage'))) source = stageHref(params.get('stage'));
  if (page === 'first-run.html' && ['new', 'live'].includes(params.get('status'))) source = `${page}?status=${params.get('status')}`;
  return knownDestination(source, excluded) ? source : 'main-four-region.html';
}

export function settingsHref(pathname = '', section = '', search = '') {
  let source = sourceDestination(pathname, search, ['settings.html']);
  if (source === 'main-four-region.html') source = 'workspace';
  if (source === 'chat-full.html') source = 'chat';
  return `settings.html?from=${encodeURIComponent(source)}${['key', 'data'].includes(section) ? `#${section}` : ''}`;
}

export function sessionManagementHref(search = '', panel = 'data') {
  const source = settingsReturnDestination(search);
  const page = source === 'chat-full.html' ? source : 'main-four-region.html';
  return `${page}?panel=${panel === 'archived' ? 'archived' : 'data'}`;
}

export function commandHref(pathname = '', search = '') {
  return `command-palette.html?from=${encodeURIComponent(sourceDestination(pathname, search, ['command-palette.html']))}`;
}

export function returnDestination(search = '', excluded = ['diff-review.html']) {
  const requested = new URLSearchParams(search).get('from');
  return knownDestination(requested, excluded) ? requested : 'main-four-region.html';
}

export function settingsReturnDestination(search = '') {
  const from = new URLSearchParams(search).get('from');
  return from === 'chat' ? 'chat-full.html' : returnDestination(search, ['settings.html']);
}

export function destinationLabel(destination) {
  const stage = STAGES.find(item => stageHref(item.id) === destination);
  return stage?.title || PAGES.find(page => page.href === destination.split('?')[0])?.label || '上线工作台';
}

export function getCommandGroups(pathname = '', search = '') {
  const shortcuts = { 'audit.html': '/check', 'main-four-region.html': '/guide', 'explain.html': '/explain', 'diff-review.html': '/fix', 'settings.html': '设置' };
  const groups = new Map();
  const pages = navigationPages(pathname, search);
  for (const page of pages) {
    if (page.href === 'command-palette.html') continue; // Already using the same command surface.
    if (!groups.has(page.group)) groups.set(page.group, []);
    const href = page.href === 'settings.html' ? settingsHref(pathname, '', search)
      : page.href === 'explain.html' ? `explain.html?from=${encodeURIComponent(sourceDestination(pathname, search, ['explain.html']))}` : page.href;
    groups.get(page.group).push([page.label, href, shortcuts[page.href] || '']);
  }
  return pages === PAGES
    ? [...groups.entries(), ['跳转阶段', STAGES.map(stage => [stage.title, stageHref(stage.id), '阶段准备'])]]
    : [...groups.entries()];
}

export function mountNavigation({ document, location, ui }) {
  const current = location.pathname.split('/').pop();
  const destination = returnDestination(location.search || '', [current]);
  document.querySelectorAll?.('[data-journey-return]').forEach(link => {
    link.href = destination;
    link.textContent = `返回${destinationLabel(destination)}`;
    link.setAttribute('aria-label', link.textContent);
  });
  const chrome = document.querySelector('.chrome');
  if (!chrome || !ui) return;
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'ctl product-navigation';
  trigger.textContent = '工作区';
  trigger.setAttribute('aria-label', '打开工作区导航');
  trigger.setAttribute('aria-haspopup', 'menu');
  trigger.addEventListener('click', () => ui.openMenu({
    trigger, label: '工作区导航', items: navigationPages(location.pathname, location.search).map(page => ({
      label: page.label, group: page.group, checked: current === page.href,
      onSelect: () => {
        if (current === page.href) return;
        location.href = page.href === 'settings.html' ? settingsHref(location.pathname, '', location.search)
          : page.href === 'command-palette.html' ? commandHref(location.pathname, location.search)
          : page.href === 'explain.html' ? `explain.html?from=${encodeURIComponent(sourceDestination(location.pathname, location.search, ['explain.html']))}` : page.href;
      },
    })),
  }));
  chrome.prepend(trigger);
}
