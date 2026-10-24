import { GUIDE_SUBJECTS, validateGuideInput } from './guide-contract.js';
/* global window, document, location, navigator, CustomEvent, requestAnimationFrame */
import { createIcon, iconMarkup } from './components/icons.js';
import { createActionButton } from './components/ui-kit.js';
import { createProviderIcon } from './components/provider-icons.js';
import { getReviewPresentation } from './components/presentation.js';
import { updateReview } from './components/review.js';
import { attachFloatingSurface } from './components/floating-surface.js';
import { settingsHref, getCommandGroups } from './navigation.js';
import { loadChatConnections, SUPPORTED_CHAT_PROVIDERS } from './chat-transport.js';

(() => {
  'use strict';

  const priorReady = window.shipmateUI?.ready || Promise.resolve();
  let reviewState = { state: 'pending' };
  let latestApproval = null;
  let activeMenu = null;
  let menuOpenFocus = null;
  let surfaceSequence = 0;

  function closeMenu({ restoreFocus = false } = {}) {
    activeMenu?.close(restoreFocus);
  }

  function openMenu({ trigger, label, items, variant = '', anchor = trigger, initialFocus = menuOpenFocus || 'selected' }) {
    if (!trigger || trigger.disabled) return null;
    if (activeMenu?.trigger === trigger) { closeMenu({ restoreFocus: true }); return null; }
    closeMenu();
    document.dispatchEvent(new CustomEvent('shipmate:surface-opening'));
    const menu = document.createElement('div');
    menu.id = `shipmate-menu-${++surfaceSequence}`;
    menu.className = `shipmate-menu${variant ? ` shipmate-menu--${variant}` : ''}`;
    menu.setAttribute('popover', 'auto');
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', label);
    const heading = document.createElement('div');
    heading.className = 'shipmate-menu__heading';
    heading.textContent = label;
    heading.setAttribute('role', 'presentation');
    menu.append(heading);
    let group = label;
    const buttons = items.map(item => {
      if (item.group && item.group !== group) {
        group = item.group;
        const section = heading.cloneNode(false);
        section.textContent = group;
        menu.append(section);
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'shipmate-menu__item';
      button.tabIndex = -1;
      button.disabled = Boolean(item.disabled);
      button.setAttribute('role', typeof item.checked === 'boolean' ? 'menuitemradio' : 'menuitem');
      if (typeof item.checked === 'boolean') button.setAttribute('aria-checked', String(item.checked));
      const copy = document.createElement('span');
      copy.className = 'shipmate-menu__copy';
      const title = document.createElement('span');
      title.className = 'shipmate-menu__label';
      title.textContent = item.label;
      copy.append(title);
      if (item.description) {
        const description = document.createElement('small');
        description.textContent = item.description;
        copy.append(description);
      }
      const check = document.createElement('span');
      check.className = 'shipmate-menu__check';
      check.setAttribute('aria-hidden', 'true');
      if (item.checked) check.append(createIcon(document, 'check'));
      if (item.icon) {
        button.append(createIcon(document, item.icon, 'shipmate-menu__icon'));
      }
      button.append(copy);
      if (typeof item.checked === 'boolean') button.append(check);
      button.addEventListener('click', () => { closeMenu({ restoreFocus: true }); item.onSelect?.(); });
      menu.append(button);
      return button;
    });
    trigger.setAttribute('aria-haspopup', 'menu');
    trigger.setAttribute('aria-controls', menu.id);
    trigger.setAttribute('aria-expanded', 'true');
    const modal = trigger.closest('dialog[open]');
    (modal || document.body).append(menu);
    let cleaned = false;
    let stopPositioning;
    const entry = { trigger, menu, close(restoreFocus) {
      if (menu.matches(':popover-open')) menu.hidePopover();
      cleanup();
      if (restoreFocus && isUsableFocusTarget(trigger)) trigger.focus({ preventScroll: true });
    } };
    function cleanup() {
      if (cleaned) return;
      cleaned = true;
      stopPositioning?.();
      trigger.setAttribute('aria-expanded', 'false');
      trigger.removeAttribute('aria-controls');
      if (activeMenu === entry) activeMenu = null;
      menu.remove();
    }
    menu.addEventListener('toggle', event => { if (event.newState === 'closed') cleanup(); });
    let search = '', lastKeyTime = 0;
    menu.addEventListener('keydown', event => {
      if (event.isComposing || event.keyCode === 229) return;
      const enabled = buttons.filter(button => !button.disabled);
      const index = enabled.indexOf(document.activeElement);
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation(); closeMenu({ restoreFocus: true });
      } else if (event.key === 'Tab') {
        // Return to the invoker before the browser advances through the normal tab order.
        closeMenu({ restoreFocus: true });
      } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        search = '';
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? enabled.length - 1
          : (index + (event.key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length;
        enabled[next]?.focus();
      } else if (event.key.length === 1 && event.key !== ' ' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const now = Date.now(), key = event.key.toLocaleLowerCase();
        search = now - lastKeyTime > 700 || search === key ? key : search + key;
        lastKeyTime = now;
        const start = Math.max(0, index + (search.length === 1 ? 1 : 0));
        const ordered = [...enabled.slice(start), ...enabled.slice(0, start)];
        const match = ordered.find(button => button.querySelector('.shipmate-menu__label').textContent.toLocaleLowerCase().startsWith(search));
        if (match) { event.preventDefault(); match.focus(); }
      }
    });
    activeMenu = entry;
    let revealInitialFocus = true;
    try {
      menu.showPopover({ source: trigger });
      stopPositioning = attachFloatingSurface(anchor, menu, {
        placement: variant ? 'top-end' : 'bottom-end', matchWidth: variant === 'composer',
        onPositioned: () => {
          if (cleaned || !revealInitialFocus) return;
          revealInitialFocus = false;
          // Wait for the viewport height cap before revealing last/selected rows.
          // The fixed, clamped surface is already in view; only its contents scroll.
          if (menu.contains(document.activeElement)) document.activeElement.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
        },
        onError: () => {
          if (cleaned) return;
          entry.close(true);
          notify('菜单暂时无法打开，请重试。');
        },
      });
    } catch {
      entry.close(true);
      notify('菜单暂时无法打开，请重试。');
      return null;
    }
    if (cleaned) { stopPositioning?.(); return null; }
    const enabled = buttons.filter(button => !button.disabled);
    const selected = enabled.find(button => button.getAttribute('aria-checked') === 'true');
    (initialFocus === 'last' ? enabled.at(-1) : initialFocus === 'first' ? enabled[0] : selected || enabled[0])?.focus({ preventScroll: true });
    return menu;
  }

  function makeDialog({ title, subtitle = '', className = '', trigger = document.activeElement }) {
    closeMenu();
    document.dispatchEvent(new CustomEvent('shipmate:surface-opening'));
    const dialog = document.createElement('dialog');
    const id = `shipmate-dialog-${++surfaceSequence}`;
    dialog.className = `shipmate-dialog ${className}`.trim();
    dialog.setAttribute('aria-labelledby', `${id}-title`);
    dialog.setAttribute('aria-modal', 'true');
    dialog.innerHTML = `<div class="shipmate-dialog__head"><div><h2 class="shipmate-dialog__title" id="${id}-title"></h2><p class="shipmate-dialog__sub" id="${id}-description"></p></div></div><div class="shipmate-dialog__body"></div>`;
    const dismiss = createActionButton(document, '', { className: 'shipmate-dialog__close ui-action-icon', appearance: 'plain' });
    dismiss.setAttribute('aria-label', '关闭');
    dismiss.title = '关闭';
    dismiss.append(createIcon(document, 'x'));
    dialog.querySelector('.shipmate-dialog__head').append(dismiss);
    dialog.querySelector('.shipmate-dialog__title').textContent = title;
    const sub = dialog.querySelector('.shipmate-dialog__sub');
    sub.textContent = subtitle;
    if (!subtitle) sub.hidden = true;
    else dialog.setAttribute('aria-describedby', sub.id);
    document.body.append(dialog);
    dialog.querySelector('.shipmate-dialog__close').addEventListener('click', () => dialog.close('close'));
    const outside = event => {
      const rect = dialog.getBoundingClientRect();
      return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
    };
    let startedOutside = false;
    dialog.addEventListener('pointerdown', event => { startedOutside = event.target === dialog && outside(event); });
    dialog.addEventListener('click', event => {
      if (event.target === dialog && startedOutside && outside(event)) dialog.close('dismiss');
    });
    dialog.addEventListener('keydown', event => {
      // Native modal semantics handle interior navigation, Escape and inertness.
      // Only wrap boundaries; a popover owns its own Tab dismissal sequence.
      if (event.key !== 'Tab' || event.defaultPrevented || event.isComposing || event.keyCode === 229
        || event.ctrlKey || event.altKey || event.metaKey || !dialog.open || event.target.closest?.('[popover]')) return;
      const controls = [...dialog.querySelectorAll('button, wa-button, input, select, textarea, a, summary, [tabindex]')]
        .filter(node => (node.tabIndex >= 0 || node.matches('wa-button')) && isUsableFocusTarget(node) && !node.matches(':disabled')
          && !node.closest('[inert]') && window.getComputedStyle(node).visibility !== 'hidden')
        .sort((a, b) => (a.tabIndex > 0 ? a.tabIndex : Infinity) - (b.tabIndex > 0 ? b.tabIndex : Infinity));
      const first = controls[0], last = controls.at(-1), active = document.activeElement;
      const target = event.shiftKey && active === first ? last : !event.shiftKey && active === last ? first : null;
      if (target) { event.preventDefault(); target.focus(); }
    });
    dialog.addEventListener('close', () => {
      if (activeMenu && dialog.contains(activeMenu.trigger)) closeMenu();
      dialog.remove();
      const remainingModal = [...document.querySelectorAll('dialog[open]')].at(-1);
      const candidates = [trigger, remainingModal?.querySelector('button:not([disabled]), wa-button:not([disabled])'), document.querySelector('.agent-composer__input')];
      const target = candidates.find(node => isUsableFocusTarget(node) && (!remainingModal || remainingModal.contains(node)));
      target?.focus({ preventScroll: true });
    }, { once: true });
    return dialog;
  }

  function showDialog(dialog, focusTarget) {
    dialog.showModal();
    const focus = () => {
      if (dialog.open && dialog.contains(focusTarget) && isUsableFocusTarget(focusTarget)) {
        focusTarget.focus({ preventScroll: true });
      }
    };
    // Form-associated custom elements render their focusable control asynchronously.
    if (focusTarget?.updateComplete) void focusTarget.updateComplete.then(focus);
    else focus();
    return dialog;
  }

  function notify(message) {
    if (window.shipmatePreview?.notify) window.shipmatePreview.notify(message);
    else window.dispatchEvent(new CustomEvent('shipmate:notice', { detail: { message } }));
  }

  function openCommand(trigger) {
    const existing = document.querySelector('dialog.shipmate-command[open]');
    if (existing) {
      (existing.querySelector('input[type="search"]') || existing.querySelector('button:not([disabled])'))?.focus();
      return existing;
    }
    if (document.querySelector('dialog[open]')) return null;
    const commandGroups = getCommandGroups(location.pathname, location.search);
    const dialog = makeDialog({ title: '快速前往', subtitle: '打开页面或阶段 · 当前为本地交互示例', className: 'shipmate-command', trigger });
    const body = dialog.querySelector('.shipmate-dialog__body');
    const commandId = `${dialog.getAttribute('aria-labelledby')}-command`;
    body.innerHTML = `<label class="shipmate-command__search">${iconMarkup('search')}<span class="sr-only">搜索命令</span><input type="search" autocomplete="off" placeholder="输入命令或界面名称…" aria-controls="${commandId}-results" aria-describedby="${commandId}-status"></label><div class="shipmate-command__results" id="${commandId}-results"></div><p class="sr-only" id="${commandId}-status" role="status" aria-live="polite" aria-atomic="true"></p>`;
    const input = body.querySelector('input'), results = body.querySelector('.shipmate-command__results'), status = body.querySelector('[role="status"]');
    let rows = [], index = 0;
    function select(next, moveFocus = false) {
      if (!rows.length) return;
      index = (next + rows.length) % rows.length;
      const buttons = [...results.querySelectorAll('.shipmate-command__row')];
      buttons.forEach((button, i) => button.classList.toggle('is-active', i === index));
      buttons[index]?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
      if (moveFocus) buttons[index]?.focus({ preventScroll: true });
      status.textContent = `当前选择：${rows[index][0]}，第 ${index + 1} 项，共 ${rows.length} 项`;
    }
    function render() {
      const term = input.value.trim().toLocaleLowerCase('zh-CN');
      const groups = commandGroups.map(([name, items]) => [name, items.filter(item => `${name} ${item.join(' ')}`.toLocaleLowerCase('zh-CN').includes(term))]).filter(([, items]) => items.length);
      rows = groups.flatMap(([, items]) => items); index = Math.min(index, Math.max(0, rows.length - 1)); let cursor = 0;
      results.innerHTML = groups.map(([name, items]) => `<p class="shipmate-command__group">${name}</p>${items.map(item => { const i = cursor++; return `<a class="shipmate-command__row${i === index ? ' is-active' : ''}" href="${item[1]}" data-index="${i}"><span>${item[0]}</span><small>${item[2]}</small></a>`; }).join('')}`).join('') || '<p class="shipmate-command__empty">没有匹配项，换个关键词试试。</p>';
      status.textContent = rows.length ? `${rows.length} 个结果，当前选择：${rows[index][0]}` : '没有匹配项';
    }
    function activate(i) { const row = rows[i]; if (row) location.href = row[1]; }
    input.addEventListener('input', () => { index = 0; render(); });
    results.addEventListener('focusin', event => { const button = event.target.closest('[data-index]'); if (button) select(+button.dataset.index); });
    results.addEventListener('mouseover', event => {
      const button = event.target.closest('[data-index]');
      if (button) select(+button.dataset.index, results.contains(document.activeElement));
    });
    dialog.addEventListener('keydown', event => {
      if (event.isComposing || event.keyCode === 229 || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
      const focused = event.target.closest?.('[data-index]');
      if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && (event.target === input || focused)) { event.preventDefault(); const base = focused ? +focused.dataset.index : index; select(base + (event.key === 'ArrowDown' ? 1 : -1), Boolean(focused)); }
      else if (event.key === 'Enter' && event.target === input) { event.preventDefault(); activate(index); }
    });
    const foot = document.createElement('div');
    foot.className = 'shipmate-command__hint';
    foot.innerHTML = '<span><kbd>↑</kbd><kbd>↓</kbd> 选择</span><span><kbd>Enter</kbd> 打开</span><span><kbd>Esc</kbd> 关闭</span>';
    dialog.append(foot);
    render(); showDialog(dialog, input);
    return dialog;
  }

  let modelPicker = null;
  function modelBusy(composer) { return Boolean(composer?.querySelector('.send[data-mode="stop"]')); }
  function chooseChatModel(composer, selection) {
    if (composer?.dataset.liveChat !== 'true' || modelBusy(composer)) { notify('请先停止当前回复，再切换模型。'); return false; }
    composer.dispatchEvent(new CustomEvent('shipmate:model-select', { bubbles: true, detail: { selection } }));
    return true;
  }
  function openConnectedModels(trigger) {
    const composer = trigger.closest('.agent-composer');
    if (composer?.dataset.liveChat !== 'true' || modelBusy(composer)) { notify('请先停止当前回复，再选择模型。'); return null; }
    if (modelPicker?.open) return modelPicker;
    const dialog = makeDialog({ title: '选择已连接模型', subtitle: '仅发送输入与当前真实文本历史，不含项目文件或演示消息。调用可能计费。', className: 'shipmate-model-dialog', trigger });
    modelPicker = dialog;
    const body = dialog.querySelector('.shipmate-dialog__body');
    const input = document.createElement('input'); input.type = 'search'; input.className = 'shipmate-model-search'; input.placeholder = '搜索模型或服务商'; input.setAttribute('aria-label', '搜索已连接模型');
    const status = document.createElement('p'); status.className = 'shipmate-model-status'; status.setAttribute('role', 'status');
    const results = document.createElement('div'); results.className = 'shipmate-model-results'; results.setAttribute('role', 'group'); results.setAttribute('aria-label', '可选择的聊天模型');
    const retry = createActionButton(document, '重新加载目录', { className: 'shipmate-dialog__button' });
    const clear = createActionButton(document, '清除搜索', { className: 'shipmate-dialog__button', appearance: 'plain' }); clear.hidden = true;
    const manage = document.createElement('a'); manage.className = 'shipmate-model-manage'; manage.textContent = '管理模型连接'; manage.href = settingsHref(location.pathname, 'key', location.search);
    const actions = document.createElement('div'); actions.className = 'shipmate-model-actions'; actions.append(clear, retry, manage);
    const help = document.createElement('details'); help.className = 'shipmate-model-help';
    const summary = document.createElement('summary'); summary.textContent = '支持范围与使用说明';
    const note = document.createElement('p'); note.textContent = `支持 ${Object.values(SUPPORTED_CHAT_PROVIDERS).join('、')} 文本聊天。目录读取成功不等于推理已验证，请选择支持文本输入和输出的模型。`;
    help.append(summary, note); body.append(input, status, results, actions, help);
    let request = null; let generation = 0; let closed = false; let models = []; let connections = []; let controls = []; let ready = false;
    function render() {
      const query = input.value.trim().toLocaleLowerCase();
      const focused = document.activeElement;
      const visible = models.filter(model => `${model.label} ${model.model}`.toLocaleLowerCase().includes(query));
      const hideClear = !query || visible.length > 0;
      const hideRetry = ready && Boolean(query) && models.length > 0;
      // Move focus before its control is removed or hidden; leave other targets alone.
      if (!closed && (controls.includes(focused) || (focused === clear && hideClear) || (focused === retry && hideRetry))) input.focus();
      results.replaceChildren(); controls = [];
      clear.hidden = hideClear;
      retry.hidden = hideRetry;
      manage.className = `shipmate-model-manage${ready && !models.length ? ' shipmate-model-manage--primary' : ''}`;
      if (ready) {
        const partial = connections.some(connection => connection.status === 'connected' && connection.truncated);
        const failed = connections.some(connection => connection.status === 'error');
        status.dataset.state = visible.length ? 'ready' : 'empty';
        if (models.length) {
          status.textContent = visible.length ? `${visible.length} 个${query ? '匹配' : '可用'}模型` : '当前已加载目录中没有匹配项，请修改或清除搜索。';
          if (partial) status.textContent += ' · 当前为部分目录';
          if (failed) status.textContent += ' · 部分服务连接异常，可在设置中处理。';
        } else if (failed) status.textContent = '连接异常，暂无可选模型。请在设置中检查或重新连接服务。';
        else if (connections.some(connection => connection.status === 'connecting')) status.textContent = '服务正在连接。完成后重新加载目录，或在设置中查看进度。';
        else if (connections.some(connection => connection.status === 'connected')) status.textContent = '服务已连接，但目录为空。请在设置中刷新目录或检查账户的模型权限。';
        else status.textContent = '没有可用于聊天的模型。尚未连接支持的服务，请先管理模型连接。';
      }
      const groups = new Map();
      for (const model of visible) {
        if (!groups.has(model.providerId)) {
          const group = document.createElement('section'); group.className = 'shipmate-model-group'; group.setAttribute('role', 'group'); group.setAttribute('aria-label', SUPPORTED_CHAT_PROVIDERS[model.providerId]);
          const heading = document.createElement('h3'); heading.className = 'shipmate-model-group__title';
          const name = document.createElement('span'); name.textContent = SUPPORTED_CHAT_PROVIDERS[model.providerId];
          heading.append(createProviderIcon(document, model.providerId), name); group.append(heading);
          groups.set(model.providerId, group); results.append(group);
        }
        const button = document.createElement('button'); button.type = 'button'; button.className = 'shipmate-command__row shipmate-model-option'; button.dataset.modelId = model.model;
        const selected = composer.dataset.modelProvider === model.providerId && composer.dataset.modelId === model.model;
        button.setAttribute('aria-pressed', String(selected)); button.setAttribute('aria-label', model.name === model.model ? model.label : `${model.label} · ${model.model}`);
        button.title = model.name === model.model ? model.model : `${model.name}\n${model.model}`;
        const copy = document.createElement('span'); copy.className = 'shipmate-model-option__copy';
        const title = document.createElement('strong'); title.textContent = model.name; copy.append(title);
        if (model.name !== model.model) { const id = document.createElement('small'); id.textContent = model.model; copy.append(id); }
        button.append(copy);
        if (selected) button.append(createIcon(document, 'check', 'shipmate-model-option__check'));
        button.addEventListener('click', () => { if (chooseChatModel(composer, model)) dialog.close('selected'); });
        button.addEventListener('keydown', event => {
          if (event.isComposing || event.keyCode === 229 || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
          if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
          event.preventDefault(); const index = controls.indexOf(button); controls[(index + (event.key === 'ArrowDown' ? 1 : controls.length - 1)) % controls.length]?.focus();
        });
        controls.push(button); groups.get(model.providerId).append(button);
      }
    }
    async function load() {
      request?.abort(); request = new AbortController(); const current = ++generation; ready = false; models = []; connections = []; render();
      if (!closed && document.activeElement === retry) input.focus();
      status.textContent = '正在加载已连接的模型目录…'; status.dataset.state = 'loading'; retry.disabled = true;
      try {
        const snapshot = await loadChatConnections({ signal: request.signal });
        if (closed || current !== generation) return;
        connections = snapshot.connections.filter(connection => Object.hasOwn(SUPPORTED_CHAT_PROVIDERS, connection.providerId));
        for (const connection of connections) {
          if (connection.status !== 'connected') continue;
          for (const model of connection.models) models.push({ providerId: connection.providerId, model: model.id, name: model.name || model.id, label: `${SUPPORTED_CHAT_PROVIDERS[connection.providerId]} · ${model.name || model.id}` });
        }
        ready = true; render();
      } catch {
        if (closed || current !== generation) return;
        status.textContent = '无法加载模型目录。请检查本地连接服务后重试；当前模型未改变。';
        status.dataset.state = 'error';
      } finally { if (!closed && current === generation) retry.disabled = false; }
    }
    input.addEventListener('input', render); input.addEventListener('search', render);
    clear.addEventListener('click', () => { input.value = ''; render(); input.focus(); });
    input.addEventListener('keydown', event => {
      if (event.isComposing || event.keyCode === 229 || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); (event.key === 'ArrowDown' ? controls[0] : controls.at(-1))?.focus(); }
    });
    retry.addEventListener('click', () => void load());
    const onPageHide = () => { if (dialog.open) dialog.close('pagehide'); };
    dialog.addEventListener('close', () => { closed = true; generation++; request?.abort(); if (modelPicker === dialog) modelPicker = null; window.removeEventListener('pagehide', onPageHide); }, { once: true });
    window.addEventListener('pagehide', onPageHide);
    showDialog(dialog, input); void load(); return dialog;
  }
  function openModel(trigger, onSelect) {
    const composer = trigger.closest?.('.agent-composer');
    const live = composer?.dataset.liveChat === 'true';
    const busy = live && modelBusy(composer);
    const activeModel = live && composer.dataset.modelId;
    const items = [{ label: '本地演示', description: '固定示例 · 无需 API Key', checked: !activeModel, disabled: busy,
      onSelect: () => live ? chooseChatModel(composer, null) : onSelect?.({ value: 'local-demo', label: '本地演示' }) }];
    if (activeModel) items.push({ label: composer.dataset.modelLabel || activeModel, description: '当前聊天模型', checked: true, disabled: true });
    if (live) items.push({ label: '选择已连接模型', description: busy ? '请先停止当前回复' : '从已连接的服务商中选择文本模型', disabled: busy, onSelect: () => openConnectedModels(trigger) });
    else items.push({ group: '模型服务', label: '组件演示', description: '此输入框未接入真实聊天控制器', disabled: true });
    items.push({ label: '管理模型服务', description: '提供方、API Key 与模型配置', icon: 'sliders-horizontal', onSelect: () => { location.href = settingsHref(location.pathname, 'key', location.search); } });
    return openMenu({ trigger, label: '选择模型', variant: 'composer-model', items });
  }

  let guideDialog = null;
  function openGuide(trigger, { composer = trigger.closest('.agent-composer') } = {}) {
    if (composer?.dataset.liveChat !== 'true') return null;
    if (modelBusy(composer)) { notify('请等待当前回复完成，或先停止生成。'); return null; }
    if (guideDialog?.open) return guideDialog;
    const dialog = makeDialog({ title: '生成上线清单', subtitle: '使用本机已收录规则，不扫描项目、不调用模型，也不进行实时核验。', trigger });
    guideDialog = dialog;
    dialog.addEventListener('close', () => { if (guideDialog === dialog) guideDialog = null; });
    const form = document.createElement('form'); form.className = 'shipmate-guide-form';
    const fields = {};
    for (const [name, title, options] of [
      ['subject', '小程序主体', Object.entries(GUIDE_SUBJECTS)],
      ['sensitive', '是否处理敏感信息', [['true', '是'], ['false', '否']]],
      ['domain', '是否使用服务器域名', [['true', '是'], ['false', '否']]],
    ]) {
      const label = document.createElement('label'); label.textContent = title;
      const select = document.createElement('select'); select.name = name; select.required = true;
      const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = '请选择'; placeholder.disabled = true; placeholder.selected = true; select.append(placeholder);
      for (const [value, text] of options) { const option = document.createElement('option'); option.value = value; option.textContent = text; select.append(option); }
      fields[name] = select; label.append(select); form.append(label);
    }
    const status = document.createElement('p'); status.className = 'shipmate-note'; status.setAttribute('role', 'status');
    const actions = document.createElement('div'); actions.className = 'shipmate-guide-actions';
    const cancel = createActionButton(document, '取消', { className: 'shipmate-dialog__button' }); cancel.addEventListener('click', () => dialog.close());
    const submit = createActionButton(document, '生成清单', { type: 'submit', appearance: 'accent', className: 'shipmate-dialog__button' });
    actions.append(cancel, submit); form.append(status, actions);
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (!dialog.open) return;
      if (modelBusy(composer)) { status.textContent = '当前正在生成，请先停止或等待完成。'; return; }
      if (!Object.values(fields).every(field => field.value)) { status.textContent = '请明确选择全部三项。'; Object.values(fields).find(field => !field.value)?.focus(); return; }
      const input = { subject: fields.subject.value, sensitive: fields.sensitive.value === 'true', domain: fields.domain.value === 'true' };
      const validation = validateGuideInput(input);
      if (!validation.ok) { status.textContent = validation.error; return; }
      const detail = { input, accepted: false };
      composer.dispatchEvent(new CustomEvent('shipmate:guide-request', { bubbles: true, detail }));
      if (detail.accepted) dialog.close(); else status.textContent = '本次请求未启动，请确认当前会话可用后重试。';
    });
    dialog.querySelector('.shipmate-dialog__body').append(form);
    return showDialog(dialog, fields.subject);
  }

  function openAddMenu(trigger) {
    const composer = trigger.closest('.agent-composer');
    const items = [{ label: '文件预览', description: '查看示例文件', icon: 'file-text', onSelect: () => openFiles([], trigger) }];
    if (composer?.dataset.liveChat === 'true') items.push({ label: '生成上线清单', description: '本机规则 · 不调用模型', icon: 'list-checks', onSelect: () => openGuide(trigger) });
    if (composer?.dataset.referenceEnabled === 'true') items.push({
      label: '引用文件', description: '添加示例项目上下文', icon: 'at-sign',
      onSelect: () => composer.dispatchEvent(new CustomEvent('shipmate:reference-request', { bubbles: true })),
    });
    items.push(
      { label: '快速前往', description: '查找命令与页面', icon: 'command', onSelect: () => openCommand(trigger) },
      { group: '工作区', label: '项目预检', description: '查看预检页面', icon: 'shield-check', onSelect: () => { location.href = 'audit.html'; } },
      { group: '工作区', label: '偏好与连接', description: '打开设置', icon: 'sliders-horizontal', onSelect: () => { location.href = settingsHref(location.pathname, '', location.search); } },
    );
    return openMenu({ trigger, anchor: composer || trigger, variant: 'composer', label: '添加', items });
  }

  function openFiles(files = [], trigger) {
    const safeFiles = files.length ? files : [{ name: 'app.json', content: '{\n  "示例": "仅用于界面评审"\n}' }];
    const dialog = makeDialog({ title: '完整文件', subtitle: '只读预览', className: 'shipmate-file-dialog', trigger });
    dialog.querySelector('.shipmate-dialog__body').innerHTML = `<div class="shipmate-files"><p class="shipmate-note">此处只展示本地静态示例，不读取、写入或修改真实项目文件。</p>${safeFiles.map(() => `<section class="shipmate-file"><div class="shipmate-file__name"></div><pre tabindex="0" role="region"></pre></section>`).join('')}</div>`;
    [...dialog.querySelectorAll('.shipmate-file')].forEach((section, i) => { section.querySelector('.shipmate-file__name').textContent = safeFiles[i].name; const content = section.querySelector('pre'); content.textContent = safeFiles[i].content; content.setAttribute('aria-label', `${safeFiles[i].name}，只读内容，可滚动`); });
    return showDialog(dialog, dialog.querySelector('pre'));
  }

  function confirmAction({ title = '确认操作', message, confirmLabel = '确认', cancelLabel = '取消', tone = 'default', trigger = document.activeElement }) {
    return new Promise(resolve => {
      const dialog = makeDialog({ title, subtitle: message, className: 'shipmate-confirm', trigger }); let choice = null;
      dialog.querySelector('.shipmate-dialog__body').append(dialog.querySelector('.shipmate-dialog__sub'));
      const foot = document.createElement('div');
      foot.className = 'shipmate-dialog__foot';
      const cancel = createActionButton(document, cancelLabel, { className: 'shipmate-dialog__button' }); cancel.dataset.choice = 'cancel';
      const confirm = createActionButton(document, confirmLabel, { className: 'shipmate-dialog__button', appearance: 'accent', variant: tone === 'danger' ? 'danger' : 'neutral' }); confirm.dataset.choice = 'confirm';
      foot.append(cancel, confirm); dialog.append(foot);
      dialog.addEventListener('click', event => { const selected = event.target.closest('[data-choice]')?.dataset.choice; if (!selected) return; choice = selected; dialog.close(selected); });
      dialog.addEventListener('close', () => resolve(choice === 'confirm'), { once: true });
      showDialog(dialog, cancel);
    });
  }

  async function share(trigger) {
    const link = location.href.split('#')[0]; let copied;
    try { await navigator.clipboard.writeText(link); copied = true; } catch { const area = document.createElement('textarea'); area.value = link; area.style.position = 'fixed'; area.style.opacity = '0'; document.body.append(area); area.select(); try { copied = document.execCommand('copy'); } catch { copied = false; } finally { area.remove(); } }
    notify(copied ? '已复制当前本地预览链接。' : '无法自动复制，请从地址栏复制当前本地预览链接。');
    trigger?.focus?.(); return copied;
  }

  function openMore(trigger) {
    return openMenu({ trigger, label: '对话操作', items: [
      { label: '复制预览链接', onSelect: () => share(trigger) },
      { label: '演示故障状态', description: '仅本地演示，不发送请求', onSelect() {
        window.dispatchEvent(new CustomEvent('shipmate:simulate-error', { detail: { source: 'more-menu', code: 'DEMO_REQUEST_FAILED', message: '演示：请求失败，可重试。', recoverable: true } }));
      } },
    ] });
  }

  function setReviewState(state, detail = {}) {
    getReviewPresentation(state);
    reviewState = { ...detail, state };
    syncArtifact(document.querySelector('.artifact'), state);
    if (detail.sessionId) latestApproval = { ...detail };
    window.dispatchEvent(new CustomEvent('shipmate:review-state', { detail: reviewState }));
    return reviewState;
  }

  function updateReviewSummary() {
    const files = [...document.querySelectorAll('.dfile[data-review-state]')];
    if (!files.length) return;
    const counts = files.reduce((all, file) => { all[file.dataset.reviewState] = (all[file.dataset.reviewState] || 0) + 1; return all; }, {});
    const labels = [['pending','待审阅'],['accepted','已批准'],['rejected','已拒绝'],['stale','需重新生成']].filter(([key]) => counts[key]).map(([key,label]) => `${counts[key]} ${label}`);
    const summary = document.getElementById('reviewSummary'); if (summary) summary.textContent = labels.join(' · ');
    const approveAll = document.getElementById('approveAllBtn'); if (approveAll) approveAll.disabled = !counts.pending;
  }

  function syncArtifact(artifact, state) {
    if (!artifact) return;
    artifact.dataset.reviewState = state;
    const subtitle = artifact.querySelector('.artifact__sub');
    const presentation = getReviewPresentation(state);
    if (subtitle) subtitle.textContent = presentation.summary;
    updateReview(artifact.querySelector('[data-component="review"]'), state);
    const rollback = artifact.querySelector('.artifact__ckpt .roll');
    if (rollback) {
      rollback.disabled = !presentation.canRollback;
      rollback.setAttribute('aria-disabled', String(!presentation.canRollback));
    }
  }

  function isUsableFocusTarget(node) {
    return Boolean(node?.isConnected && !node.disabled && node.getAttribute('aria-disabled') !== 'true' && !node.closest('[hidden], [aria-hidden="true"]') && node.getClientRects().length);
  }

  function deferFocus(candidates) {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const target = candidates.find(isUsableFocusTarget);
      target?.focus({ preventScroll: true });
    }));
  }

  function focusAfterReview(trigger, decision) {
    const file = trigger?.closest('.dfile');
    const artifact = trigger?.closest('.artifact');
    const candidates = decision === 'rejected' && file
      ? [file.querySelector('.regenerate'), document.querySelector(`.fitem[data-file="${file.dataset.pane}"]`)]
      : file
        ? [document.querySelector(`.fitem[data-file="${file.dataset.pane}"]`)]
        : [
          decision === 'accepted' ? artifact?.querySelector('.roll') : artifact?.querySelector('[data-review-action="regenerate"]'),
          artifact?.querySelector('.artifact__close'),
          artifact?.querySelector('a[href]'),
          artifact?.closest('dialog')?.querySelector('.mobile-review-sheet__close')
        ];
    deferFocus(candidates);
  }

  function reflectReview(trigger, decision) {
    const artifact = trigger?.closest('.artifact');
    if (artifact) {
      if ((artifact.dataset.reviewState || 'pending') !== 'pending') { notify('当前示例改动已不是待审状态。'); return false; }
      syncArtifact(artifact, decision);
      focusAfterReview(trigger, decision);
      return true;
    }
    const targets = trigger?.matches('#approveAllBtn')
      ? [...document.querySelectorAll('.dfile[data-review-state="pending"]')]
      : [trigger?.closest('.dfile')].filter(target => target?.dataset.reviewState === 'pending');
    if (!targets.length) { notify('没有待审文件；已拒绝或失效的文件需要先重新生成。'); return false; }
    targets.forEach(target => {
      target.dataset.reviewState = decision;
      target.querySelectorAll('.dpane__fa .approve, .dpane__fa .reject').forEach(button => { button.disabled = true; });
      const regenerate = target.querySelector('.regenerate'); if (regenerate) regenerate.hidden = decision !== 'rejected';
      target.querySelector('.ckptbar .roll')?.toggleAttribute('disabled', decision !== 'accepted');
      const stateLabel = target.querySelector('[data-file-state]');
      if (stateLabel) { stateLabel.dataset.state = decision; stateLabel.textContent = decision === 'accepted' ? '已批准 · 仅原型' : '已拒绝'; }
      const fileKey = target.dataset.pane;
      const item = document.querySelector(`.fitem[data-file="${fileKey}"]`);
      if (item) { item.dataset.reviewState = decision; item.querySelector('.fitem__dot')?.setAttribute('aria-label', decision === 'accepted' ? '已批准，仅原型状态' : '已拒绝'); }
    });
    updateReviewSummary();
    if (trigger?.matches('#approveAllBtn')) {
      const currentFile = document.querySelector('.fitem.on, .fitem[aria-current="true"], .fitem');
      deferFocus([currentFile]);
    } else {
      focusAfterReview(trigger, decision);
    }
    return true;
  }

  function setFilePending(target) {
    if (!target) return;
    target.dataset.reviewState = 'pending';
    target.querySelectorAll('.dpane__fa .approve, .dpane__fa .reject').forEach(button => { button.disabled = false; });
    target.querySelector('.ckptbar .roll')?.setAttribute('disabled', '');
    const regenerate = target.querySelector('.regenerate'); if (regenerate) regenerate.hidden = true;
    const stateLabel = target.querySelector('[data-file-state]'); if (stateLabel) { stateLabel.dataset.state = 'pending'; stateLabel.textContent = '待审阅'; }
    const item = document.querySelector(`.fitem[data-file="${target.dataset.pane}"]`);
    if (item) { item.dataset.reviewState = 'pending'; item.querySelector('.fitem__dot')?.setAttribute('aria-label', '待审阅'); }
    updateReviewSummary();
  }

  function markFileStale(fileKey, detail = {}) {
    const target = document.querySelector(`.dfile[data-pane="${fileKey}"]`);
    if (!target || target.dataset.reviewState === 'rejected') { notify('已拒绝的文件不会被静默恢复，请先重新生成改动。'); return false; }
    target.dataset.reviewState = 'stale';
    target.querySelectorAll('.dpane__fa .approve, .dpane__fa .reject').forEach(button => { button.disabled = true; });
    target.querySelector('.ckptbar .roll')?.setAttribute('disabled', '');
    const regenerate = target.querySelector('.regenerate'); if (regenerate) regenerate.hidden = false;
    const stateLabel = target.querySelector('[data-file-state]'); if (stateLabel) { stateLabel.dataset.state = 'stale'; stateLabel.textContent = '源文件已变化 · 需重新生成'; }
    const item = document.querySelector(`.fitem[data-file="${fileKey}"]`); if (item) { item.dataset.reviewState = 'stale'; item.querySelector('.fitem__dot')?.setAttribute('aria-label', '源文件已变化，需要重新生成'); }
    updateReviewSummary();
    markReviewStale({ fileKey, ...detail });
    notify('该文件的源内容已变化，旧差异已失效；请重新生成后再审阅。');
    return true;
  }

  function regenerateFile(fileKey) {
    const target = document.querySelector(`.dfile[data-pane="${fileKey}"]`);
    if (!target || !['stale','rejected'].includes(target.dataset.reviewState)) return false;
    setFilePending(target);
    setReviewState('pending', { fileKey, regenerated: true });
    notify('已重新生成静态示例差异，恢复为待审阅。');
    deferFocus([target.querySelector('.approve'), document.querySelector(`.fitem[data-file="${fileKey}"]`)]);
    return true;
  }

  async function resolveApproval(request = latestApproval || {}, decision, trigger) {
    const accepted = decision === 'accepted';
    if (!['accepted', 'rejected'].includes(decision)) return false;
    if (accepted && !await confirmAction({ title: '批准这组示例改动？', message: '仅更新本地原型状态，不会写入任何真实文件。', confirmLabel: '批准示例', trigger })) return false;
    if (!reflectReview(trigger, decision)) return false;
    setReviewState(decision, request);
    window.dispatchEvent(new CustomEvent('shipmate:approval-resolved', { detail: { sessionId: request.sessionId, runId: request.runId, decision } }));
    notify(accepted ? '示例改动已在本地原型中标记为批准；未写入文件。' : '示例改动已在本地原型中标记为拒绝。');
    return true;
  }

  function markReviewStale(detail = {}) {
    const artifact = document.querySelector('.artifact');
    if (artifact) syncArtifact(artifact, 'stale');
    setReviewState('stale', detail);
    if (latestApproval) window.dispatchEvent(new CustomEvent('shipmate:approval-resolved', { detail: { sessionId: latestApproval.sessionId, runId: latestApproval.runId, decision: 'stale' } }));
  }

  window.addEventListener('shipmate:approval-requested', event => { latestApproval = event.detail || {}; syncArtifact(document.querySelector('.artifact'), 'pending'); setReviewState('pending', latestApproval); });

  document.addEventListener('click', event => {
    // Web Awesome owns its trigger and menu lifecycle, including keyboard focus.
    if (event.target.closest('wa-dropdown')) return;
    const project = event.target.closest('button.proj');
    if (project) {
      openMenu({ trigger: project, label: '当前项目', items: [
        { label: '附近小店 · 示例项目', description: '当前使用固定数据，没有读取本地目录', checked: true, onSelect: () => {} },
        { label: '重新选择体验目标', icon: 'arrow-right', onSelect: () => { location.href = 'first-run.html'; } },
        { label: '打开本地项目', description: '请在桌面预检程序中选择文件夹', disabled: true },
      ] });
      return;
    }
    const command = event.target.closest('.cmdk');
    if (command && !command.closest('[aria-hidden="true"]')) { event.preventDefault(); openCommand(command); return; }
    const labelButton = event.target.closest('button'); const label = labelButton?.getAttribute('aria-label') || '';
    if (labelButton?.classList.contains('agent-composer__add')) { openAddMenu(labelButton); return; }
    if (labelButton?.classList.contains('modelpick')) { openModel(labelButton); return; }
    if ((labelButton?.classList.contains('ihbtn') && label.includes('分享')) || labelButton?.dataset.uiAction === 'share') { share(labelButton); return; }
    if ((labelButton?.classList.contains('ihbtn') && label.includes('更多')) || labelButton?.dataset.uiAction === 'more') { openMore(labelButton); return; }
    if (labelButton?.classList.contains('abtn') && labelButton.textContent.includes('完整文件')) { openFiles([], labelButton); return; }
    if (labelButton?.matches('.abtn.approve[data-review-action="regenerate"]')) { event.preventDefault(); event.stopImmediatePropagation(); window.dispatchEvent(new CustomEvent('shipmate:regenerate-review')); return; }
    if (labelButton?.matches('.abtn.approve, .dfile .approve, #approveAllBtn')) { event.preventDefault(); event.stopImmediatePropagation(); resolveApproval(latestApproval || {}, 'accepted', labelButton); return; }
    if (labelButton?.matches('.abtn.reject, .dfile .reject')) { event.preventDefault(); event.stopImmediatePropagation(); resolveApproval(latestApproval || {}, 'rejected', labelButton); return; }
    const rollback = event.target.closest('.artifact .artifact__ckpt .roll, .ckptbar .roll');
    if (rollback) {
      event.preventDefault(); event.stopImmediatePropagation();
      const target = rollback.closest('.dfile');
      const artifact = rollback.closest('.artifact');
      const state = target?.dataset.reviewState || artifact?.dataset.reviewState;
      if (state !== 'accepted') return;
      if (target) setFilePending(target); else syncArtifact(artifact, 'pending');
      setReviewState('pending', { fileKey: target?.dataset.pane, rolledBack: true });
      window.dispatchEvent(new CustomEvent('shipmate:checkpoint-rollback', { detail: { fileKey: target?.dataset.pane, localDemo: true } }));
      notify('已恢复为待审状态；未修改真实文件。');
      deferFocus([target?.querySelector('.approve'), artifact?.querySelector('.approve')]);
    }
  }, true);

  function onMenuInvokerKeydown(event) {
    if (event.target.closest?.('wa-dropdown')) return;
    const isShortcut = event.ctrlKey && event.shiftKey && !event.altKey && event.key.toLowerCase() === 'm';
    const invoker = event.target.closest?.('[aria-haspopup="menu"], .modelpick, .agent-composer__add, button.proj, [data-ui-action="more"], .ihbtn[aria-label*="更多"]');
    const isArrow = invoker && ['ArrowDown', 'ArrowUp'].includes(event.key);
    if ((!isShortcut && !isArrow) || event.isComposing || event.keyCode === 229 || event.defaultPrevented) return;
    const modal = [...document.querySelectorAll('dialog[open]')].at(-1);
    const target = isShortcut ? (modal || document).querySelector('.modelpick') : invoker;
    if (!target || target.disabled || (modal && !modal.contains(target))) return;
    event.preventDefault();
    menuOpenFocus = isArrow ? (event.key === 'ArrowUp' ? 'last' : 'first') : null;
    try { target.click(); } finally { menuOpenFocus = null; }
  }
  document.addEventListener('keydown', onMenuInvokerKeydown);
  document.querySelectorAll('button.proj, [data-ui-action="more"], .ihbtn[aria-label*="更多"]').forEach(trigger => {
    if (trigger.closest('wa-dropdown')) return;
    trigger.setAttribute('aria-haspopup', 'menu');
    trigger.setAttribute('aria-expanded', 'false');
  });
  syncArtifact(document.querySelector('.artifact'), 'pending');
  updateReviewSummary();

  let api;
  const ready = priorReady.then(value => value || api);
  api = Object.freeze({ ready, makeDialog, showDialog, openMenu, closeMenu, openCommand, openModel, openGuide, openFiles, openMore, share, confirm: confirmAction, setReviewState, getReviewState: () => ({ ...reviewState }), resolveApproval, markReviewStale, markFileStale, regenerateFile });
  window.shipmateUI = api;
})();
