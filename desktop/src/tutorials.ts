import { createActionButton } from '../design-previews/components/ui-kit.js';
import './tutorials.css';

const tutorials = [
  {
    id: 'preflight', title: '运行项目预检',
    steps: [
      '在左侧选择已保存的项目；尚未添加时，先通过项目管理选择项目文件夹并保存。',
      '打开“项目工具”，确认当前目录与主体后，点击“运行项目预检”。',
      '执行结束后点击“阅读报告”，逐项核对发现、处理要求与官方来源。',
    ],
    note: '预检在本机执行，无需连接模型。静态检查不能保证官方审核通过。',
  },
  {
    id: 'workflow', title: '导出准备清单',
    steps: [
      '选择已保存的项目，打开左侧“上线进度”。',
      '核对已保存的业务事实和各阶段要求；需要修改时先保存，再确认当前准备情况。',
      '点击“导出准备清单”，在下载目录查看 Markdown 文件及其中的阶段、材料和来源。',
    ],
    note: '导出使用当前加载的已保存事实，不包含未保存草稿。人工确认不等于官方平台已完成。',
  },
  {
    id: 'handoff', title: '生成修复交接',
    steps: [
      '先完成项目预检并打开需要处理的报告，点击“修复交接”；在阅读视图中也可点击“准备修复交接”。',
      '核对交接内容中的问题、操作类型、报告依据及未核验提示。',
      '点击“复制 Markdown”或“导出 Markdown”，将上下文交给负责修改的人或工具。',
    ],
    note: '修复交接不会自动改代码。修改后需要重新预检，并核对实际结果。',
  },
] as const;

export function mountTutorials(options: { returnFocus?: () => HTMLElement | null } = {}) {
  const node = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '', id = '') => {
    const element = document.createElement(tag);
    element.textContent = text;
    if (id) element.id = id;
    return element;
  };
  const dialog = node('dialog', '', 'desktop-tutorials');
  dialog.className = 'context-dialog tutorials-dialog';
  dialog.setAttribute('aria-labelledby', 'tutorials-title');
  const header = node('header'); header.className = 'context-header';
  const title = node('h2', '操作教程', 'tutorials-title');
  title.tabIndex = -1;
  const dismiss = createActionButton(document, '关闭', { appearance: 'plain' });
  dismiss.id = 'tutorials-close'; dismiss.setAttribute('aria-label', '关闭操作教程');
  header.append(title, dismiss);
  const body = node('div'); body.className = 'tutorials-body';
  const description = node('p', '示例界面与示例项目。视频不自动播放；可随时暂停、拖动进度或直接阅读文字步骤。', 'tutorials-description');
  const nav = node('nav'); nav.className = 'tutorials-nav'; nav.setAttribute('aria-label', '选择操作教程');
  const heading = node('h3', '', 'tutorials-current-title');
  const media = node('div'); media.className = 'tutorials-media';
  const status = node('p', '', 'tutorials-status'); status.setAttribute('role', 'status'); status.hidden = true;
  const stepsHeading = node('h4', '文字步骤');
  const steps = node('ol', '', 'tutorials-steps');
  const note = node('p', '', 'tutorials-note');
  body.append(description, nav, heading, media, status, stepsHeading, steps, note);
  dialog.append(header, body); document.body.append(dialog);
  let selected: (typeof tutorials)[number] = tutorials[0];
  let video: HTMLVideoElement | null = null;
  let trigger: HTMLElement | null = null;
  let disposed = false;
  const buttons = tutorials.map(tutorial => {
    const button = createActionButton(document, tutorial.title, { appearance: 'outlined' });
    button.id = `tutorials-select-${tutorial.id}`;
    button.addEventListener('click', () => { if (dialog.open && !disposed) select(tutorial); });
    nav.append(button);
    return button;
  });
  const visible = (element: HTMLElement | null | undefined): element is HTMLElement => !!element?.isConnected && element.getClientRects().length > 0;
  function select(tutorial: (typeof tutorials)[number]) {
    video?.pause();
    selected = tutorial;
    heading.textContent = tutorial.title;
    steps.replaceChildren(...tutorial.steps.map(step => node('li', step)));
    note.textContent = tutorial.note;
    status.textContent = ''; status.hidden = true;
    buttons.forEach((button, index) => button.setAttribute('aria-pressed', String(tutorials[index].id === tutorial.id)));
    const next = node('video', '无法播放视频时，请阅读下方文字步骤。', 'tutorials-video');
    next.controls = true; next.preload = 'none'; next.playsInline = true;
    next.setAttribute('aria-label', `${tutorial.title}，操作演示视频`);
    next.setAttribute('aria-describedby', 'tutorials-description tutorials-steps tutorials-note');
    next.poster = `/tutorials/${tutorial.id}.jpg`;
    next.src = `/tutorials/${tutorial.id}.mp4`;
    next.addEventListener('error', () => {
      if (disposed || video !== next || !dialog.open) return;
      status.textContent = '视频暂时无法播放。可继续阅读下方完整文字步骤，或重新选择本教程重试。';
      status.hidden = false;
    });
    video = next;
    media.replaceChildren(next);
  }
  function close() {
    video?.pause();
    if (dialog.open) dialog.close();
  }
  dismiss.addEventListener('click', close);
  dialog.addEventListener('cancel', () => video?.pause());
  dialog.addEventListener('close', () => {
    if (dialog.open) return;
    video?.pause();
    trigger?.setAttribute('aria-expanded', 'false');
    if (disposed) return;
    const target = visible(trigger) ? trigger : options.returnFocus?.();
    if (visible(target)) target.focus();
  });
  return {
    open(anchor: HTMLElement | null) {
      if (disposed || dialog.open) return;
      trigger = anchor; select(selected); dialog.showModal(); body.scrollTop = 0;
      trigger?.setAttribute('aria-expanded', 'true'); title.focus();
    },
    close,
    element: dialog,
    destroy() {
      disposed = true; video?.pause(); trigger?.setAttribute('aria-expanded', 'false'); dialog.remove();
    },
  };
}
