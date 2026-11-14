/* global document, window */
import { mountComposer } from './composer.js';
import { mountReview, updateReview } from './review.js';
import { createToolCard, createResultCard } from './message.js';
import { createDemoResult } from '../demo-result.js';
import { mountConversation, createDemoPlan } from '../conversation.js';

const byId = id => document.getElementById(id);
const composer = mountComposer(byId('showcaseComposer'), {
  inputId: 'showcaseInput', sendId: 'showcaseSend', label: '本地演示消息',
  placeholder: '与船友协作…',
});
const review = mountReview(byId('reviewExample'));
let reviewState = 'pending';
let busy = false;
function setReview(state) {
  reviewState = state;
  byId('reviewState').value = state;
  updateReview(review.root, state, { busy });
}
const view = mountConversation({
  input: composer.input, sendButton: composer.sendButton,
  scroll: byId('showcaseScroll'), list: byId('showcaseMessages'),
  status: byId('showcaseStatus'), jumpButton: byId('showcaseLatest'),
  initialMessages: [
    { id: 'example-user', role: 'user', text: '帮我看看隐私声明需要补充什么。' },
    { id: 'example-assistant', role: 'assistant', status: 'complete', text: [
      '可以。这里展示同一条回复中的正文、表格和代码；所有内容都是**本地示例**。',
      '### 先核对这两项',
      '| 示例项目 | 下一步 |\n| --- | --- |\n| 隐私声明 | 核对接口用途与声明是否一致 |\n| 改动建议 | 查看差异后决定批准或拒绝 |',
      '下面是演示工具的输入数据，可以单独复制；不是项目配置修改。',
      '```json\n{\n  "source": "fixed-example",\n  "readOnly": true\n}\n```',
      '> 发送一条消息可体验流式生成与停止，也可以切换到失败或超时场景检查重试。',
    ].join('\n\n') },
  ],
  planFactory: input => createDemoPlan(input, { scenario: byId('runScenario').value }),
  onEvent(event) {
    if (event.type === 'state') {
      busy = event.state === 'working' || event.state === 'streaming';
      byId('runScenario').disabled = busy;
      byId('reviewState').disabled = busy;
      updateReview(review.root, reviewState, { busy });
    }
    if (event.type === 'run-start') {
      setReview('stale');
      view.updateReviewState('stale');
    }
    if (event.type === 'complete' && event.result?.review) setReview('pending');
  },
});
view.setDraft('检查隐私声明示例');

byId('reviewState').addEventListener('change', event => {
  setReview(event.target.value);
  view.updateReviewState(reviewState);
});
review.approve.addEventListener('click', async () => {
  if (busy) return;
  if (reviewState === 'rejected' || reviewState === 'stale') {
    view.submit({ input: '重新生成隐私声明示例', plan: createDemoPlan('重新生成隐私声明示例') });
    return;
  }
  const ui = await window.shipmateUI.ready;
  if (!ui || reviewState !== 'pending') return;
  const accepted = await ui.confirm({
    title: '批准这份示例改动？', message: '仅记录本页的审批状态，不会写入 app.json 或执行外部操作。',
    confirmLabel: '批准示例', trigger: review.approve,
  });
  if (accepted && !busy && reviewState === 'pending') {
    setReview('accepted');
    view.updateReviewState('accepted');
    review.undo.focus();
  }
});
review.reject.addEventListener('click', () => {
  if (busy || reviewState !== 'pending') return;
  setReview('rejected');
  view.updateReviewState('rejected');
  review.approve.focus();
});
review.undo.addEventListener('click', () => {
  if (busy || reviewState !== 'accepted') return;
  setReview('pending');
  view.updateReviewState('pending');
  review.approve.focus();
});
window.addEventListener('shipmate:open-review', () => {
  review.root.scrollIntoView({ block: 'nearest' });
  if (!review.approve.disabled) review.approve.focus({ preventScroll: true });
});

const summaries = {
  running: ['正在处理固定示例输入；这里展示执行中的组件状态。'],
  success: ['固定示例执行成功：1 项提醒、1 项说明。'],
  fail: ['模拟工具失败；未生成结果，未执行任何文件操作。'],
  canceled: ['用户停止了示例执行；已保留此前输出。'],
};
function showTool(state) {
  const host = byId('toolExample');
  const previous = host.querySelector('[data-component="tool"]');
  const card = createToolCard(document, {
    name: 'demo_preflight', label: '本地规则预检', state,
    parameters: { subject: 'personal', source: 'fixed-example', readOnly: true }, summary: summaries[state],
  }, {
    result: state === 'success' ? createDemoResult() : undefined,
    error: state === 'fail' ? { code: 'demo_tool_failure', message: '演示工具返回失败；没有文件被读取或修改。' } : undefined,
  });
  if (previous) card.open = previous.open;
  host.replaceChildren(card);
  byId('toolStates').querySelectorAll('button').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.state === state));
  });
}
byId('toolStates').addEventListener('click', event => {
  const button = event.target.closest('button[data-state]');
  if (button) showTool(button.dataset.state);
});
showTool('running');
byId('resultExample').append(createResultCard(document, createDemoResult()));
