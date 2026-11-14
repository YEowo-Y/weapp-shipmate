/* global document, window, CustomEvent, URLSearchParams */
import { createDemoPlan } from './conversation.js';
import { mountSessionWorkspace } from './session-workspace.js';
import { installSessionNavigation } from './session-navigation.js';
import { mountComposer } from './components/composer.js';
import { mountReview, updateReview } from './components/review.js';
import { getReviewPresentation } from './components/presentation.js';
import { bindActionMenu } from './components/ui-kit.js';
import { validateGuideInput, validateGuideResult } from './guide-contract.js';

mountComposer(document.getElementById('workspaceComposer'), {
  inputId: 'demo-message', sendId: 'demo-send', label: '向船友提问', placeholder: '与船友协作…',
});
const reviewComponent = mountReview(document.getElementById('workspaceReview'), {
  approveId: 'approve-change', rejectId: 'reject-change', statusId: 'review-result',
  returnPath: 'main-four-region.html',
});

let running = false;
let activeSession = null;
let sessionWorkspace;
let activeTab = 0;
const panel = document.querySelector('.side__body');
const terminal = panel.querySelector('.term');
const reviewHost = document.getElementById('workspaceReview');
const emptyReview = document.getElementById('workspaceReviewEmpty');
const approve = document.getElementById('approve-change');
const reject = document.getElementById('reject-change');
const tabs = [...document.querySelectorAll('.side__tab')];

function latestReview(session = activeSession) {
  return session?.messages?.findLast(message => message.review) || null;
}

function latestGuide(session = activeSession) {
  return session?.messages?.findLast(message => message.role === 'assistant' && message.status === 'complete'
    && validateGuideInput(message.guide).ok && validateGuideResult(message.structuredResult).ok) || null;
}

function refreshReview(session) {
  const changed = activeSession?.id !== session?.id;
  activeSession = session;
  document.getElementById('workspaceTitle').textContent = session?.title || '新会话';
  document.getElementById('workspaceHomeContent').hidden = Boolean(session?.messages?.length);
  const guide = latestGuide(session);
  document.getElementById('workspaceResult').disabled = !guide;
  document.getElementById('workspaceMenuResult').disabled = !guide;
  document.getElementById('workspaceResult-summary').textContent = guide
    ? '上线清单已生成。回到完整结果，查看依据、复制或下载。'
    : '尚无上线清单。生成后可在这里回到结果，复制或下载。';
  if (changed) window.dispatchEvent(new CustomEvent('shipmate:close-review'));

  const message = latestReview();
  reviewHost.hidden = activeTab !== 0 || !message;
  emptyReview.hidden = activeTab !== 0 || Boolean(message);
  terminal.hidden = activeTab !== 1;
  document.querySelector('.review-heading p').textContent = message ? '本地示例 · 1 个文件' : '当前对话没有待审阅改动';
  document.querySelector('.side__hd').textContent = message ? getReviewPresentation(message.review.state).label : '暂无改动';
  if (message) updateReview(reviewComponent.root, message.review.state, { busy: running });
  terminal.textContent = message
    ? `本地演示 · ${getReviewPresentation(message.review.state).summary}没有执行命令或修改文件。`
    : '当前对话没有执行命令或修改文件。';
}

sessionWorkspace = await mountSessionWorkspace({
  host: document.getElementById('workspaceSessions'),
  input: document.getElementById('demo-message'),
  sendButton: document.getElementById('demo-send'),
  scroll: document.getElementById('workspaceScroll'),
  list: document.getElementById('workspaceMessages'),
  status: document.getElementById('workspaceStatus'),
  jumpButton: document.getElementById('workspaceLatest'),
  layout: 'sidebar',
  initialMessages: [],
  workspace: 'my-miniprogram',
  conversationOptions: { initialScroll: 'top' },
  onSessionChange: refreshReview,
  onEvent(event) {
    if (event.type === 'state') {
      running = event.state === 'working' || event.state === 'streaming';
      refreshReview(activeSession);
    }
    if (event.type === 'run-start' && latestReview()?.review.state === 'pending') {
      sessionWorkspace.conversation.updateReviewState('stale', { runId: latestReview().review.runId, reason: '新请求已开始' });
    }
  }
});
const view = sessionWorkspace.conversation;
refreshReview(sessionWorkspace.getCurrentSession());
installSessionNavigation({
  document, window,
  flush: () => sessionWorkspace.flush(),
  stop: () => view.stop(),
  onBlocked: () => window.shipmatePreview?.notify('当前内容尚未保存，请先重试或下载备份。'),
});

tabs.forEach((tab, index) => {
  tab.setAttribute('aria-pressed', String(index === activeTab));
  tab.addEventListener('click', () => {
    activeTab = index;
    tabs.forEach(other => {
      other.setAttribute('aria-pressed', String(other === tab));
      other.classList.toggle('on', other === tab);
    });
    refreshReview(activeSession);
  });
});

window.addEventListener('shipmate:open-review', event => {
  if (!latestReview() || event.detail?.messageId !== latestReview().id) {
    window.shipmatePreview?.notify('这条改动已不是当前方案，请查看最新的改动记录。');
    return;
  }
  tabs[0].click();
  window.dispatchEvent(new CustomEvent('shipmate:review-open-validated'));
});

function reviewIdentity() {
  const message = latestReview();
  return message ? { sessionId: activeSession.id, messageId: message.id, runId: message.review.runId, state: message.review.state } : null;
}
function isCurrentReview(identity) {
  const current = reviewIdentity();
  return Boolean(identity && current && !running && identity.sessionId === current.sessionId
    && identity.messageId === current.messageId && identity.runId === current.runId && identity.state === current.state);
}

window.addEventListener('shipmate:review-state', event => {
  const detail = event.detail;
  const identity = reviewIdentity();
  if (!identity || running || detail?.sessionId !== identity.sessionId || detail?.messageId !== identity.messageId || detail?.runId !== identity.runId) return;
  const allowed = { pending: ['accepted', 'rejected'], accepted: ['pending'] };
  if (!allowed[identity.state]?.includes(detail.state)) return;
  view.updateReviewState(detail.state, { runId: identity.runId });
  refreshReview(sessionWorkspace.getCurrentSession());
});

approve.addEventListener('click', async () => {
  const identity = reviewIdentity();
  if (!identity || running) return;
  const ui = await window.shipmateUI.ready;
  if (!isCurrentReview(identity)) return;
  if (identity.state === 'stale' || identity.state === 'rejected') {
    const input = '重新生成隐私声明改动示例';
    view.submit({ input, plan: createDemoPlan(input) });
    return;
  }
  if (identity.state !== 'pending') return;
  const accepted = await ui.confirm({
    title: '批准 app.json 的示例改动？',
    message: '本次建议补充位置接口声明。当前是本地交互演示，不会写入文件或替你提交官方后台。',
    confirmLabel: '批准示例', trigger: approve
  });
  if (accepted && isCurrentReview(identity)) {
    ui.setReviewState('accepted', identity);
    reviewComponent.undo.focus();
  }
});
reject.addEventListener('click', async () => {
  const identity = reviewIdentity();
  if (identity?.state !== 'pending' || running) return;
  const ui = await window.shipmateUI.ready;
  if (isCurrentReview(identity)) {
    ui.setReviewState('rejected', identity);
    approve.focus();
  }
});
reviewComponent.undo.addEventListener('click', async () => {
  const identity = reviewIdentity();
  if (identity?.state !== 'accepted' || running) return;
  const ui = await window.shipmateUI.ready;
  if (isCurrentReview(identity)) {
    ui.setReviewState('pending', { ...identity, localDemo: true });
    approve.focus();
  }
});

window.addEventListener('shipmate:simulate-error', () => {
  const state = view.controller.getSnapshot().state;
  if (state === 'working' || state === 'streaming') {
    window.shipmatePreview?.notify('请先停止当前回复，再演示故障。');
    return;
  }
  const input = '演示一次失败与重试';
  const result = view.submit({ input, plan: createDemoPlan(input, { scenario: 'tool-failure' }) });
  if (result.ok) window.shipmatePreview?.notify('已开始故障与重试演示。');
});

const home = document.getElementById('workspaceHomeContent');
document.getElementById('workspaceHome').addEventListener('click', () => {
  home.hidden = !home.hidden;
  if (!home.hidden) { home.scrollIntoView({ block: 'start' }); document.getElementById('workspacePreflight').focus(); }
});
async function openGuide(trigger) {
  const ui = await window.shipmateUI.ready;
  ui.openGuide(trigger, { composer: document.querySelector('#workspaceComposer .agent-composer') });
}
document.getElementById('workspaceGuide').addEventListener('click', event => openGuide(event.currentTarget));
document.getElementById('workspacePreflight').addEventListener('click', async event => {
  const trigger = event.currentTarget;
  const ui = await window.shipmateUI.ready;
  const dialog = ui.makeDialog({ title: '在桌面端运行项目预检', subtitle: '浏览器工作台不能直接读取本机项目文件夹。', trigger });
  const text = document.createElement('p');
  text.className = 'shipmate-note';
  text.textContent = '打开上线船友桌面应用，选择“项目预检”，再选择项目文件夹和主体类型，运行代码预检。检查报告可由你决定是否加入当前会话。你也可以先在这里生成上线清单，无需连接模型。';
  dialog.querySelector('.shipmate-dialog__body').append(text);
  ui.showDialog(dialog);
});

function openCurrentResult() {
  const message = latestGuide();
  if (!message) return;
  const article = [...document.getElementById('workspaceMessages').children].find(node => node.dataset.messageId === message.id);
  if (!article) return;
  home.hidden = true;
  article.setAttribute('tabindex', '-1');
  article.focus({ preventScroll: true });
  article.scrollIntoView({ block: 'start' });
}
document.getElementById('workspaceResult').addEventListener('click', openCurrentResult);
bindActionMenu(document.getElementById('workspaceActions'), value => {
  if (value === 'history') sessionWorkspace.openHistory(document.getElementById('workspaceMore'));
  if (value === 'data') sessionWorkspace.openData(document.getElementById('workspaceMore'));
  if (value === 'archived') sessionWorkspace.openHistory(document.getElementById('workspaceMore'), 'archived');
  if (value === 'guide') void openGuide(document.getElementById('workspaceMore'));
  if (value === 'result') openCurrentResult();
});
const sessionPanel = new URLSearchParams(window.location.search).get('panel');
if (sessionPanel === 'data') sessionWorkspace.openData(document.getElementById('workspaceMore'));
if (sessionPanel === 'archived') sessionWorkspace.openHistory(document.getElementById('workspaceMore'), 'archived');
