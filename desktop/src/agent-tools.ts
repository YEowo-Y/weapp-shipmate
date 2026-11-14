import { createActionButton } from '../design-previews/components/ui-kit.js';
import { createIcon } from '../design-previews/components/icons.js';
import { createAgentPermissions } from '../design-previews/agent-permissions.js';
import './agent-tools.css';

type Session = { id: string; projectId?: string | null };

/** Consent is scoped to the currently displayed session and kept only in memory. */
export function mountAgentTools(composer: HTMLElement, isBusy: () => boolean) {
  const state = createAgentPermissions();
  const element = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '') => {
    const node = document.createElement(tag); node.textContent = text; return node;
  };
  const button = element('button'); button.type = 'button'; button.id = 'desktop-agent-tools';
  button.className = 'agent-tools-button'; button.append(createIcon(document, 'shield-alert'), element('span', '项目工具'));
  button.setAttribute('aria-haspopup', 'dialog'); button.setAttribute('aria-expanded', 'false');
  composer.classList.add('has-agent-tools');
  composer.querySelector('.agent-composer__actions')!.append(button);
  const dialog = element('dialog'); dialog.id = 'desktop-agent-dialog'; dialog.className = 'context-dialog agent-tools-dialog';
  button.setAttribute('aria-controls', dialog.id); dialog.setAttribute('aria-labelledby', 'desktop-agent-title');
  const header = element('header'); header.className = 'context-header';
  const title = element('h2', '当前会话的项目工具'); title.id = 'desktop-agent-title';
  const dismiss = createActionButton(document, '', { appearance: 'plain' }); dismiss.id = 'desktop-agent-dismiss';
  dismiss.classList.add('ui-action-icon'); dismiss.setAttribute('aria-label', '关闭项目工具'); dismiss.append(createIcon(document, 'x'));
  header.append(title, dismiss);
  const body = element('div'); body.className = 'context-body';
  const note = element('p', '模型可以按需运行项目预检、生成上线清单或解释拒因。只读取当前项目，不修改文件；完整报告保存在本机。');
  const scope = element('p'); scope.id = 'desktop-agent-scope'; scope.setAttribute('role', 'status');
  function checkbox(id: string, heading: string, description: string) {
    const row = element('label'); row.className = 'agent-tools-choice';
    const input = element('input'); input.type = 'checkbox'; input.id = id;
    const text = element('span'); text.append(element('strong', heading), element('span', description)); row.append(input, text);
    return { row, input };
  }
  const read = checkbox('desktop-agent-read', '允许读取当前项目', '允许模型调用只读工具。关闭时继续普通文本对话。');
  const share = checkbox('desktop-agent-share', '允许发送筛选后的结果摘要', '模型可接收问题摘要与规则来源；不发送项目目录、原始代码或完整报告。不勾选时，模型仅知道报告已保存在本机。');
  share.input.setAttribute('aria-describedby', 'desktop-agent-scope');
  const limits = element('p', '每次最多 3 个模型步骤、2 次工具调用。可随时停止；切换会话、项目、服务商或重启后，需要重新开启。');
  const done = createActionButton(document, '完成'); done.id = 'desktop-agent-done';
  body.append(note, scope, read.row, share.row, limits, done); dialog.append(header, body); document.body.append(dialog);
  let disposed = false;
  function render() {
    if (disposed) return;
    state.setProvider(composer.dataset.modelProvider || null);
    const value = state.snapshot(), busy = isBusy();
    button.disabled = busy;
    if (button.dataset.enabled !== String(value.allowRead)) button.dataset.enabled = String(value.allowRead);
    button.title = value.allowRead ? (value.shareResults ? '已允许读取项目并发送结果摘要' : '已允许读取项目，结果留在本机') : '设置当前会话的只读项目工具';
    read.input.checked = value.allowRead; share.input.checked = value.shareResults;
    read.input.disabled = busy || !value.eligible; share.input.disabled = busy || !value.eligible || !value.allowRead;
    scope.textContent = !value.projectId ? '请先将会话关联到当前项目。' : !value.eligible ? '请连接并选择 OpenAI、Anthropic 或 Google 模型以使用只读项目工具。' : value.allowRead ? (value.shareResults ? '已开启 · 筛选后的摘要会发送给模型。' : '已开启 · 工具结果仅保存在本机。') : '默认关闭。开启后仅适用于当前项目与会话；所选模型需支持工具调用。';
  }
  function update() {
    if (isBusy()) { render(); return; }
    state.update({ allowRead: read.input.checked, shareResults: share.input.checked }); render();
  }
  const show = () => { if (disposed || isBusy() || dialog.open) return; render(); dialog.showModal(); button.setAttribute('aria-expanded', 'true'); };
  const close = () => { button.setAttribute('aria-expanded', 'false'); if (!disposed) button.focus(); };
  button.addEventListener('click', show); read.input.addEventListener('change', update); share.input.addEventListener('change', update);
  // Match the shared dialog's boundary wrap. Native modal behavior owns all
  // interior navigation and Escape; WebView2 must not tab into browser chrome.
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab' || event.defaultPrevented || event.isComposing || event.ctrlKey || event.altKey || event.metaKey) return;
    const target = event.shiftKey && document.activeElement === dismiss ? done
      : !event.shiftKey && document.activeElement === done ? dismiss : null;
    if (target) { event.preventDefault(); target.focus(); }
  });
  dismiss.addEventListener('click', () => dialog.close()); done.addEventListener('click', () => dialog.close()); dialog.addEventListener('close', close);
  const observer = new MutationObserver(render);
  observer.observe(composer, { attributes: true, attributeFilter: ['data-model-provider', 'data-chat-state'] });
  render();
  return {
    snapshot() { render(); return { ...state.snapshot(), busy: isBusy() }; },
    revoke() { if (isBusy()) throw new Error('当前对话正在执行。'); state.update({ allowRead: false, shareResults: false }); render(); },
    select(session: Session) { state.select(session); if (dialog.open) dialog.close(); render(); },
    prepare<T extends { providerId: string; agent?: unknown }>(request: T) { render(); return state.prepare(request); },
    destroy() { disposed = true; observer.disconnect(); state.clear(); dialog.remove(); button.remove(); composer.classList.remove('has-agent-tools'); },
  };
}
