import { mountComposer } from '../design-previews/components/composer.js';
import { mountSessionWorkspace } from '../design-previews/session-workspace.js';
import { streamChat } from '../design-previews/chat-transport.js';
import { desktopModelFetch } from './model-fetch';
import { mountModelConnections } from './model-connection';
import { mountChatContext } from './context';
import { mountAgentTools } from './agent-tools';
import { invoke } from '@tauri-apps/api/core';
import type { Artifact } from './projects';

export async function mountDesktopSessions(options: { onOpenArtifact?: (artifact: Artifact) => void; onToolResults?: () => Promise<void>; onOpenSettings?: (anchor?: HTMLElement | null) => void } = {}) {
  const node = <T extends HTMLElement>(selector: string) => document.querySelector(selector) as T;
  const status = node('#desktopConversationStatus');
  const contextNode = document.createElement('div');
  const { root, input, sendButton } = mountComposer(node('#desktopComposer'), {
    inputId: 'desktopInput', sendId: 'desktopSend', label: '发送消息',
    contextNode,
    placeholder: '与上线船友协作…', hint: 'Enter 发送 · Shift + Enter 换行',
  });
  const context = mountChatContext(contextNode, root.querySelector('.agent-composer__add') as HTMLButtonElement, () => sendButton.dataset.mode === 'stop');
  const agentTools = mountAgentTools(root, () => sendButton.dataset.mode === 'stop');
  let activeProjectId: string | null = null, selectionRevision = 0, disposed = false, resultsPending = false;
  let models: ReturnType<typeof mountModelConnections> | undefined;
  function openSettings(anchor: HTMLElement) {
    if (disposed || sendButton.dataset.mode === 'stop') return;
    if (options.onOpenSettings) options.onOpenSettings(anchor);
    else models?.open(anchor);
  }
  try {
    const workspace = await mountSessionWorkspace({
      host: node('#sessionHost'), input, sendButton, scroll: node('#desktopScroll'),
      list: node('#desktopMessages'), status, jumpButton: node('#desktopJump'),
      layout: 'sidebar', projectScoped: true, workspace: 'desktop-local', storageLabel: '已保存在此设备',
      conversationOptions: {
        requireModel: true, allowRecords: true,
        async transport(args) {
          const revision = selectionRevision;
          const request = await context.prepare(args);
          if (disposed || revision !== selectionRevision || args.signal?.aborted) throw Object.assign(new Error('发送已停止或会话已切换。'), { name: 'AbortError' });
          return streamChat(agentTools.prepare(request), { fetcher: desktopModelFetch });
        },
        onModelRequired: () => openSettings(input),
        async onOpenArtifact(artifactId: string) {
          const projectId = activeProjectId, revision = selectionRevision;
          if (!projectId || disposed) return;
          try {
            const artifact = await invoke<Artifact>('project_artifact', { artifactId });
            if (disposed || revision !== selectionRevision) return;
            if (artifact.projectId !== projectId || artifact.id !== artifactId) throw Error('报告不属于当前项目。');
            options.onOpenArtifact?.(artifact);
          } catch { if (!disposed && revision === selectionRevision) status.textContent = '无法打开此项目报告，请在项目历史中重试。'; }
        },
      },
      onSessionChange(session) {
        context.select(session);
        activeProjectId = session.projectId ?? null; selectionRevision++;
        agentTools.select(session);
        node('#session-title').textContent = session.title;
        node('#session-empty').hidden = session.messages.length > 0;
      },
      onEvent(event) {
        node('#session-empty').hidden = true;
        if (event.type === 'agent-tool' && event.toolEvent?.type === 'tool-output-available') resultsPending = true;
      },
    });
    const picker = root.querySelector('.agent-composer__model') as HTMLButtonElement;
    models = mountModelConnections({ picker,
      onManage: () => openSettings(picker),
      select: value => workspace.conversation.setModelSelection(value),
      getSelection: () => workspace.conversation.getModelSelection(),
      isBusy: () => sendButton.dataset.mode === 'stop',
    });
    // Refresh only after the conversation has left its active state; refreshing
    // project metadata mid-stream could otherwise interfere with navigation.
    const terminalObserver = new MutationObserver(() => {
      if (disposed || !resultsPending || sendButton.dataset.mode === 'stop') return;
      resultsPending = false;
      void options.onToolResults?.().catch(() => { if (!disposed) status.textContent = '报告已保存在本机；项目历史刷新失败，请重新打开项目管理。'; });
    });
    terminalObserver.observe(sendButton, { attributes: true, attributeFilter: ['data-mode'] });
    const disposeModels = () => { disposed = true; selectionRevision++; terminalObserver.disconnect(); models?.destroy(); context.destroy(); agentTools.destroy(); };
    window.addEventListener('pagehide', disposeModels, { once: true });
    return {
      ...workspace,
      isBusy: () => sendButton.dataset.mode === 'stop',
      openModels(anchor?: HTMLElement | null) { models?.open(anchor); },
      openMemory(anchor?: HTMLElement | null) { context.openMemory(anchor); },
      destroy() { window.removeEventListener('pagehide', disposeModels); disposeModels(); workspace.destroy(); },
      appendReport(report: { text: string; type: string; deduplicate?: boolean }) {
        const label = `桌面工具 · ${report.type}`;
        const messages = workspace.conversation.getMessages();
        if (report.deduplicate && messages.some(message => message.record?.kind === 'report' && message.record.label === label && message.text === report.text)) return { ok: true, duplicate: true };
        if (report.text.length > 2 * 1024 * 1024 || messages.length >= 2000) return { ok: false, reason: 'limit' };
        return workspace.conversation.appendRecord({ text: report.text, label });
      },
    };
  } catch {
    agentTools.destroy();
    context.destroy();
    models?.destroy();
    status.textContent = '本地会话初始化失败，请重新打开页面。项目检查与报告复制仍可使用。';
    sendButton.disabled = true;
    return null;
  }
}
