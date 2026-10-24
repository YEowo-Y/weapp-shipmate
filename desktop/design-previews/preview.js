/* global document, window, location, localStorage, matchMedia, MutationObserver */
(() => {
  'use strict';

  const page = location.pathname.split('/').pop() || 'index.html';
  // Product screens use the app canvas; design references keep their preview frame.
  if (!['index.html', 'component-showcase.html'].includes(page)) {
    document.body.classList.add('product-surface');
  }
  const THEME_KEY = 'shipmate-preview-theme';
  const SIZE_KEY = 'shipmate-preview-message-size';
  const FONT_SIZES = ['14', '16', '18'];

  let resolveUI;
  const uiReady = new Promise(resolve => { resolveUI = resolve; });
  window.shipmateUI = { ready: uiReady };
  const uiStyles = document.createElement('link');
  uiStyles.rel = 'stylesheet';
  uiStyles.href = 'ui.css';
  document.head.append(uiStyles);
  const uiScript = document.createElement('script');
  uiScript.type = 'module';
  uiScript.src = 'ui.js';
  uiScript.addEventListener('load', () => resolveUI(window.shipmateUI), { once: true });
  uiScript.addEventListener('error', () => resolveUI(null), { once: true });
  document.head.append(uiScript);
  uiReady.then(async ui => {
    const { mountNavigation } = await import('./navigation.js');
    mountNavigation({ document, location, ui });
  });

  const styles = document.createElement('style');
  styles.textContent = `
    .preview-index-link { font-size: 12px; white-space: nowrap; }
    .preview-status { font: 11px/1.2 var(--font-ui, system-ui, sans-serif); white-space: nowrap; }
    .preview-toast { position: fixed; z-index: 9999; left: 50%; bottom: 24px; max-width: min(440px, calc(100vw - 32px)); transform: translate(-50%, 12px); border: 1px solid var(--border-2, #494236); border-radius: 10px; padding: 10px 14px; color: var(--text, #f4efe5); background: var(--surface, #22201c); box-shadow: 0 14px 36px rgb(0 0 0 / .22); font: 12.5px/1.5 var(--font-ui, system-ui, sans-serif); opacity: 0; pointer-events: none; transition: opacity .16s ease, transform .16s ease; }
    .preview-toast.show { opacity: 1; transform: translate(-50%, 0); }
    .preview-index-link:focus-visible { outline: 2px solid var(--accent, #b86432); outline-offset: 3px; }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { scroll-behavior: auto !important; animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; }
      .preview-toast { transition: none; }
    }
  `;
  document.head.append(styles);

  const chrome = document.querySelector('.chrome');
  if (chrome && page !== 'index.html') {
    if (page !== 'main-four-region.html' && !document.querySelector('[data-settings-return]')) {
      const back = document.createElement('a');
      back.className = 'preview-index-link';
      back.href = 'main-four-region.html';
      back.textContent = '工作台';
      back.setAttribute('aria-label', '返回上线工作台');
      chrome.prepend(back);
    }

    const status = document.createElement('span');
    status.className = 'preview-status';
    status.textContent = page === 'settings.html' ? '本机开发设置' : page === 'main-four-region.html' ? '本机工作台预览' : page === 'chat-full.html' ? '开发预览 · 可选真实聊天' : page === 'explain.html' ? '本地规则查询' : '交互原型 · 示例数据';
    status.setAttribute('aria-label', page === 'settings.html' ? '模型目录可通过本机服务连接；其他预览功能另有说明' : page === 'main-four-region.html' ? '上线清单通过本机服务生成；项目目录预检需使用桌面端；对话默认本地演示，可显式选择已连接模型' : page === 'chat-full.html' ? '默认本地演示；可从添加菜单生成本机上线清单，或显式选择已连接模型发送真实文本' : page === 'explain.html' ? '通过本机服务查询仓库收录规则；未实时核验官方页面' : '当前页面是交互原型，内容为示例数据');
    const firstControl = chrome.querySelector('.ctl');
    chrome.insertBefore(status, firstControl || null);
  }

  const toast = document.createElement('div');
  toast.className = 'preview-toast';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.setAttribute('aria-atomic', 'true');
  document.body.append(toast);
  let toastTimer;
  function notify(message) {
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add('show');
    const readingTime = Math.min(8000, Math.max(4000, message.length * 110));
    toastTimer = setTimeout(() => toast.classList.remove('show'), readingTime);
  }
  window.shipmatePreview = Object.freeze({ notify, setTheme, setFontSize });

  function readPreference(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  }
  function savePreference(key, value, label) {
    let saved = false;
    try { localStorage.setItem(key, value); saved = true; } catch { /* Keep the current page usable when storage is denied. */ }
    const message = saved ? `${label}已保存在本机。` : `${label}仅本页生效，未能保存到本机；可重新选择后重试。`;
    const feedback = document.getElementById('appearance-feedback');
    if (feedback) feedback.textContent = message;
    if (!saved) notify(message);
  }
  const themeButton = document.getElementById('themeBtn');
  const systemTheme = matchMedia('(prefers-color-scheme: dark)');
  const savedTheme = readPreference(THEME_KEY);
  let themePreference = ['light', 'dark', 'system'].includes(savedTheme) ? savedTheme : 'system';
  let appliedTheme;
  function syncTheme() {
    const dark = document.body.getAttribute('data-theme') === 'dark';
    document.querySelectorAll('input[name="theme"]').forEach(control => {
      control.checked = control.value === themePreference;
    });
    if (themeButton) {
      themeButton.type = 'button';
      themeButton.setAttribute('aria-pressed', String(dark));
      themeButton.setAttribute('aria-label', dark ? '切换为浅色主题' : '切换为深色主题');
      themeButton.textContent = dark ? '浅色' : '深色';
    }
  }
  function setTheme(preference, persist = true) {
    if (!['light', 'dark', 'system'].includes(preference)) return;
    themePreference = preference;
    appliedTheme = preference === 'system' ? (systemTheme.matches ? 'dark' : 'light') : preference;
    if (document.body.getAttribute('data-theme') !== appliedTheme) document.body.setAttribute('data-theme', appliedTheme);
    if (persist) savePreference(THEME_KEY, preference, '主题');
    syncTheme();
  }
  setTheme(themePreference, false);
  systemTheme.addEventListener('change', () => {
    if (themePreference === 'system') setTheme('system', false);
  });
  themeButton?.addEventListener('click', () => {
    setTheme(appliedTheme === 'dark' ? 'light' : 'dark');
  });

  function setFontSize(value, persist = true) {
    if (!FONT_SIZES.includes(value)) return;
    document.body.style.setProperty('--message-font-size', `${value}px`);
    document.querySelectorAll('input[name="font-size"]').forEach(control => { control.checked = control.value === value; });
    if (persist) savePreference(SIZE_KEY, value, '对话文字大小');
  }
  const savedSize = readPreference(SIZE_KEY);
  setFontSize(FONT_SIZES.includes(savedSize) ? savedSize : '16', false);
  document.querySelectorAll('input[name="font-size"]').forEach(control => {
    control.addEventListener('change', () => { if (control.checked) setFontSize(control.value); });
  });
  window.addEventListener('storage', event => {
    try { if (event.storageArea !== localStorage) return; } catch { return; }
    if (event.key === THEME_KEY || event.key === null) {
      setTheme(['light', 'dark', 'system'].includes(event.newValue) ? event.newValue : 'system', false);
    }
    if (event.key === SIZE_KEY || event.key === null) {
      setFontSize(FONT_SIZES.includes(event.newValue) ? event.newValue : '16', false);
    }
    if (event.key === THEME_KEY || event.key === SIZE_KEY || event.key === null) {
      const feedback = document.getElementById('appearance-feedback');
      if (feedback) feedback.textContent = '已同步其他页面的外观设置。';
    }
  });

  const annotationButton = document.getElementById('annotBtn');
  if (annotationButton) {
    document.body.classList.remove('annot');
    annotationButton.classList.remove('active');
    annotationButton.type = 'button';
    annotationButton.setAttribute('aria-pressed', 'false');
    annotationButton.setAttribute('aria-label', '显示设计区域标注');
  }

  document.querySelectorAll('button').forEach((button) => {
    if (!button.hasAttribute('type')) button.type = 'button';
    if (!button.getAttribute('aria-label') && button.title && !button.textContent.trim()) {
      button.setAttribute('aria-label', button.title);
    }
  });

  document.addEventListener('keydown', (event) => {
    const commandShortcut = (event.ctrlKey || event.metaKey) && !event.altKey
      && (event.key.toLowerCase() === 'k' || (event.shiftKey && event.key.toLowerCase() === 'p'));
    if (!commandShortcut || event.isComposing) return;
    event.preventDefault();
    uiReady.then(ui => ui?.openCommand(event.target));
  });

  const demoActions = {
    'settings.html': [['.btn-line, .rule-item__act button', '此项设置尚未接入，不会导入文件或写入配置。']],
  };
  (demoActions[page] || []).forEach(([selector, message]) => {
    document.querySelectorAll(selector).forEach((control) => {
      control.dataset.previewMessage = message;
    });
  });

  document.addEventListener('click', (event) => {
    const control = event.target.closest('[data-preview-message]');
    if (control) notify(control.dataset.previewMessage);
  });

  function syncStates() {
    syncTheme();
    if (annotationButton) {
      const active = document.body.classList.contains('annot');
      annotationButton.setAttribute('aria-pressed', String(active));
      annotationButton.setAttribute('aria-label', active ? '隐藏设计区域标注' : '显示设计区域标注');
    }
    document.querySelectorAll('#filters .chip').forEach((control) => {
      control.setAttribute('aria-pressed', String(control.classList.contains('on') || control.classList.contains('chip--accent')));
    });
  }
  syncStates();
  new MutationObserver(syncStates).observe(document.body, {
    attributes: true,
    subtree: true,
    attributeFilter: ['class', 'data-theme']
  });
})();
