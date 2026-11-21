// @ts-check
import { createIcon } from './icons.js';

/**
 * Shared input surface. Conversation owns draft, keyboard, send and stop events.
 * @param {HTMLElement} host
 * @param {{
 *   inputId: string;
 *   sendId: string;
 *   label: string;
 *   placeholder: string;
 *   contextNode?: HTMLElement | null;
 *   leadingActions?: HTMLButtonElement[];
 *   completionNodes?: Node[];
 *   combobox?: boolean;
 *   hint?: string;
 * }} options
 */
export function mountComposer(host, {
  inputId, sendId, label, placeholder, contextNode = null,
  leadingActions = [], completionNodes = [], combobox = false,
  hint = 'Enter 发送 · Shift + Enter 换行',
}) {
  const doc = host.ownerDocument;
  /**
   * @template {keyof HTMLElementTagNameMap} Tag
   * @param {Tag} tag
   * @param {string} className
   * @param {string} [text]
   */
  const element = (tag, className, text) => {
    const node = doc.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const root = element('div', 'composer agent-composer');
  root.dataset.component = 'composer';
  if (combobox) root.dataset.referenceEnabled = 'true';
  root.append(...completionNodes);
  if (contextNode) {
    const context = element('div', 'agent-composer__context');
    context.append(contextNode);
    root.append(context);
  }

  const inputLabel = element('label', 'sr-only', label);
  inputLabel.htmlFor = inputId;
  const editBar = element('div', 'agent-composer__edit');
  editBar.hidden = true;
  const cancelEdit = element('button', 'agent-composer__cancel-edit', '取消');
  cancelEdit.type = 'button';
  cancelEdit.setAttribute('aria-label', '取消编辑');
  cancelEdit.title = '取消编辑 · Esc';
  editBar.append(createIcon(doc, 'pencil'), element('span', '', '正在编辑消息'), cancelEdit);
  const input = element('textarea', 'box agent-composer__input');
  input.id = inputId;
  input.rows = 1;
  input.placeholder = placeholder;
  if (combobox) {
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-haspopup', 'listbox');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-controls', 'mentionPop slashPop');
  }
  root.append(inputLabel, editBar, input);

  const toolbar = element('div', 'agent-composer__toolbar');
  const actions = element('div', 'agent-composer__actions');
  const addButton = leadingActions[0] || element('button', 'cbtn');
  addButton.classList.add('agent-composer__add');
  addButton.type = 'button';
  addButton.setAttribute('aria-label', '添加内容');
  addButton.setAttribute('aria-haspopup', 'menu');
  addButton.setAttribute('aria-expanded', 'false');
  addButton.title = '添加内容';
  addButton.replaceChildren(createIcon(doc, 'plus', 'agent-composer__add-icon'));
  const permission = element('span', 'agent-composer__permission');
  permission.append(
    createIcon(doc, 'shield-alert', 'agent-composer__shield'),
    element('span', '', '只读演示'),
  );
  actions.append(addButton, permission);
  const model = element('button', 'modelpick agent-composer__model');
  model.type = 'button';
  model.setAttribute('aria-label', '选择模型，当前：本地演示');
  model.title = '选择模型 · Ctrl + Shift + M';
  model.setAttribute('aria-haspopup', 'menu');
  model.setAttribute('aria-expanded', 'false');
  model.append(
    element('span', 'agent-composer__provider', '本地演示'),
    createIcon(doc, 'chevron-down', 'agent-composer__chevron'),
  );

  const sendButton = element('button', 'send agent-composer__send');
  sendButton.type = 'button';
  sendButton.id = sendId;
  sendButton.dataset.mode = 'send';
  sendButton.disabled = true;
  sendButton.setAttribute('aria-label', '发送消息');
  sendButton.title = '发送消息';
  sendButton.append(
    createIcon(doc, 'arrow-up', 'agent-composer__send-icon'),
    createIcon(doc, 'square', 'agent-composer__stop-icon'),
  );
  toolbar.append(actions, model, sendButton);
  root.append(toolbar);
  if (hint) {
    const description = element('p', 'agent-composer__hint', hint);
    description.id = `${inputId}-hint`;
    input.setAttribute('aria-describedby', description.id);
    root.append(description);
  }
  host.replaceChildren(root);
  return { root, input, sendButton, toolbar };
}
