import { createActionButton } from './components/ui-kit.js';
import { createIcon } from './components/icons.js';
import { normalizeSessionSnapshot } from './session-store.js';
import { parseSessionBackup, mergeSessionBackup } from './session-transfer.js';

// Both presentations use the owner's existing store and import transaction.
export function openSessionDataDialog(options) {
  const surface = createSessionDataSurface(options, false);
  surface.open();
  return surface;
}

export function createSessionDataPanel(options) {
  return createSessionDataSurface(options, true);
}

function createSessionDataSurface({ document: doc, trigger, capture, prepare, commit,
  onBusyChange = () => {}, isDisposed = () => false, isReloadRequired = () => false, onClose = () => {} }, embedded) {
  const win = doc.defaultView;
  const element = (tag, className = '', text) => {
    const node = doc.createElement(tag); node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const action = (label, name, options = {}) => {
    const control = createActionButton(doc, label, options); control.dataset.action = name; return control;
  };
  const node = element(embedded ? 'section' : 'dialog', embedded ? 'session-workspace-data-panel' : 'session-workspace-dialog');
  node.dataset.kind = 'data'; node.setAttribute('aria-label', '数据与会话备份'); node.hidden = true;
  const header = element('div', 'session-workspace-dialog__header');
  const dismiss = action('', 'close', { appearance: 'plain', className: 'ui-action-icon' });
  dismiss.setAttribute('aria-label', '关闭'); dismiss.append(createIcon(doc, 'x'), element('span', 'sr-only', '关闭'));
  header.append(element('h2', '', '数据与会话备份'), dismiss);
  const body = element('div', 'session-workspace-dialog__body');
  const scope = element('p', 'session-workspace__data-description', '备份当前工作区的会话、消息、草稿与阅读位置，包括已归档会话。模型密钥、连接授权、应用设置和项目记忆不包含在内；项目记忆请通过项目备份导出。');
  const exportSection = element('section', 'session-workspace__data-section');
  const backup = action('下载会话备份', 'backup', { appearance: 'outlined' });
  exportSection.append(element('h3', '', '导出备份'), element('p', '', '文件可能包含对话中的私人信息，请妥善保管。'), backup);
  const importSection = element('section', 'session-workspace__data-section');
  const file = element('input'); file.type = 'file'; file.accept = '.json,application/json'; file.dataset.action = 'backup-file'; file.setAttribute('aria-label', '选择 Shipmate 会话备份');
  const preview = element('p', 'session-workspace__import-preview'); preview.hidden = true; preview.setAttribute('role', 'status');
  importSection.append(element('h3', '', '追加导入'), element('p', '', '仅支持 Shipmate JSON 会话备份，最大 20 MiB。追加为独立副本，不覆盖现有会话；不会重放工具或历史审批。'), file, preview);
  const feedback = element('p', 'session-workspace__status'); feedback.setAttribute('role', 'status'); feedback.setAttribute('aria-live', 'polite'); feedback.dataset.action = 'data-feedback';
  body.append(scope, exportSection, importSection, feedback);
  const actions = element('div', 'session-workspace-dialog__actions');
  const cancel = action('完成', 'cancel'), confirm = action('追加导入', 'import-confirm', { appearance: 'accent' }); confirm.disabled = true;
  if (embedded) { actions.append(confirm); importSection.append(actions); node.append(body); }
  else { actions.append(cancel, confirm); node.append(header, body, actions); }
  let parsed = null, busy = false, active = false, destroyed = false, needsReload = false, readSequence = 0;
  const alive = () => active && !destroyed && !isDisposed();
  const reloadMessage = embedded
    ? '会话已保存到本地，但界面未能更新。请返回应用并重新载入，不要重复导入；重新载入后可下载最新备份。'
    : '会话已保存到本地，但界面未能更新。请关闭此弹窗并重新载入页面，不要重复导入；重新载入后可下载最新备份。';
  function resetPreview() {
    readSequence++; parsed = null; file.value = ''; preview.hidden = true; confirm.disabled = true;
  }
  function renderBusy() {
    node.setAttribute('aria-busy', String(busy));
    file.disabled = backup.disabled = busy || needsReload;
    cancel.disabled = dismiss.disabled = busy;
    confirm.disabled = busy || needsReload || !parsed;
    confirm.textContent = busy ? '正在保存…' : '追加导入';
  }
  function setBusy(value) { busy = value; renderBusy(); onBusyChange(value); }
  function close() {
    if (busy) return false;
    if (!active) return true;
    if (embedded) { active = false; resetPreview(); node.hidden = true; }
    else node.close();
    return true;
  }
  function destroy() {
    if (destroyed) return;
    destroyed = true; active = false; resetPreview(); node.remove();
  }
  if (!embedded) {
    dismiss.addEventListener('click', close); cancel.addEventListener('click', close);
    node.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
    node.addEventListener('close', () => { destroy(); onClose(node); if (!isDisposed()) trigger?.focus(); });
  }
  backup.addEventListener('click', () => {
    if (busy || needsReload || !alive()) return;
    try {
      const snapshot = normalizeSessionSnapshot(capture(), { mode: 'export' });
      const url = win.URL.createObjectURL(new win.Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' }));
      const link = element('a'); link.href = url; link.download = `shipmate-history-${new Date().toISOString().slice(0, 10)}.json`; link.click();
      win.setTimeout(() => win.URL.revokeObjectURL(url), 1000); feedback.textContent = '已发起会话备份下载。';
    } catch { feedback.textContent = '无法下载备份。当前会话仍保留，可重试或先复制重要内容。'; }
  });
  file.addEventListener('change', async () => {
    if (busy || needsReload || !alive()) return;
    const sequence = ++readSequence, selected = file.files?.[0];
    parsed = null; preview.hidden = true; confirm.disabled = true; feedback.textContent = '';
    if (!selected) return;
    try {
      if (selected.size > 20 * 1024 * 1024) throw new Error('备份文件超过 20 MiB。');
      const candidate = parseSessionBackup(await selected.text());
      if (!alive() || sequence !== readSequence) return;
      const merged = mergeSessionBackup(capture(), candidate);
      parsed = candidate; preview.textContent = `${selected.name} · ${merged.importedCount} 个会话 · ${merged.messageCount} 条消息。将追加为独立副本，当前会话和草稿保持不变。`;
      preview.hidden = false; confirm.disabled = false;
    } catch (error) {
      if (!alive() || sequence !== readSequence) return;
      feedback.textContent = error?.code === 'limit' ? '备份或合并后的会话超过容量限制，未修改原记录。'
        : '无法读取此备份。请检查文件格式、版本或 20 MiB 大小限制；原记录未修改。';
    }
  });
  confirm.addEventListener('click', async () => {
    if (busy || needsReload || !parsed || !alive()) return;
    setBusy(true); feedback.textContent = '正在保存当前会话并校验备份…';
    try {
      await prepare();
      if (!alive()) return;
      const merged = mergeSessionBackup(capture(), parsed);
      await commit(merged.snapshot);
      if (!alive()) return;
      resetPreview();
      feedback.textContent = `已追加导入并保存 ${merged.importedCount} 个会话。可在历史会话中查看，当前草稿保持不变。`;
    } catch (error) {
      if (alive() && error?.code === 'apply-failed') {
        needsReload = true; resetPreview(); feedback.textContent = reloadMessage;
      } else if (alive() && error?.code === 'projects-unavailable') {
        feedback.textContent = embedded ? '项目列表尚未加载，未导入备份。请到项目配置中重试加载后，再追加导入。'
          : '项目列表尚未加载，未导入备份。请关闭弹窗，在项目区重试加载后，再追加导入。';
      } else if (alive()) feedback.textContent = ['conflict', 'changed', 'busy'].includes(error?.code)
        ? '会话已被其他操作更新，未导入备份。请处理保存冲突后重新选择文件。'
        : '导入未完成，原会话仍保留。请处理保存错误后重试；也可先下载当前备份。';
    } finally {
      if (isDisposed()) busy = false;
      else {
        setBusy(false);
        const focusTarget = parsed ? confirm : embedded ? backup : cancel, focusSequence = readSequence;
        await focusTarget.updateComplete;
        if (alive() && readSequence === focusSequence) focusTarget.focus();
      }
    }
  });
  function open() {
    if (active || destroyed || isDisposed()) return;
    resetPreview(); active = true; node.hidden = false;
    needsReload ||= isReloadRequired();
    feedback.textContent = needsReload ? reloadMessage : ''; renderBusy();
    if (embedded) return;
    doc.body.append(node); node.showModal();
    const initialFocus = doc.activeElement;
    void Promise.resolve(cancel.updateComplete).then(() => {
      if (alive() && node.open && doc.activeElement === initialFocus) cancel.focus();
    });
  }
  return { node, element: node, open, close, canClose: () => !busy, destroy };
}
