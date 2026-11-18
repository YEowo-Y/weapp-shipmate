import { iconMarkup } from './components/icons.js';

// Display-only catalog. IDs and ordering follow flow.yaml; statuses are a fixed
// sample and do not represent a scan, platform approval, or persisted progress.
export const STAGES = [
  { id: 'registration', title: '注册小程序账号', status: 'done',
    lede: '在微信公众平台注册小程序账号，保管好登录邮箱和管理员信息。',
    steps: ['准备注册用邮箱，确认可以接收验证邮件。', '在微信公众平台选择小程序，按页面提示注册。', '激活邮箱、设置密码并登录，记录账号信息。'],
    source: 'https://developers.weixin.qq.com/community/develop/article/doc/0006c437da87b885b7900de966c013', sourceTitle: '小程序注册与认证说明' },
  { id: 'certification', title: '主体身份核验', status: 'done',
    lede: '确认小程序所属的主体，并按后台要求完成身份核验。',
    steps: ['根据实际经营主体选择个人、个体工商户或企业。', '准备页面要求的主体与负责人材料。', '由管理员完成验证，并在后台确认当前认证状态。'],
    source: 'https://developers.weixin.qq.com/community/develop/article/doc/0006c437da87b885b7900de966c013', sourceTitle: '小程序注册与认证说明' },
  { id: 'filing', title: 'ICP 备案', status: 'cur',
    lede: '按官方备案流程准备主体、小程序与负责人信息。办理状态以官方后台为准。',
    steps: ['核对主体认证状态并准备备案材料。', '在官方后台填写并提交备案信息。', '留意负责人收到的核验通知与审核结果。'],
    source: 'https://developers.weixin.qq.com/miniprogram/product/record_guidelines.html', sourceTitle: '小程序备案指引' },
  { id: 'category', title: '选择服务类目', status: 'todo',
    lede: '根据实际服务选择类目，核对主体可选范围与需要的资质。',
    steps: ['整理小程序实际提供的功能和服务。', '查看类目与资质要求，确认适用的主体范围。', '在小程序后台选择类目并按要求提交材料。'],
    action: ['category-advisor.html', '查看类目选择示例'],
    source: 'https://developers.weixin.qq.com/miniprogram/product/material/', sourceTitle: '服务类目与资质要求' },
  { id: 'privacy', title: '用户隐私保护指引', status: 'todo', condition: '按需',
    lede: '涉及用户信息时，核对实际使用的隐私接口、用途说明与授权流程。',
    steps: ['整理位置、相册、手机号等用户信息的使用场景。', '在小程序后台填写与实际业务一致的隐私保护指引。', '核对接口调用前的授权流程，并在真机上验证拒绝授权的体验。'],
    action: ['diff-review.html?from=stage-workspace.html%3Fstage%3Dprivacy', '查看声明修改示例'],
    source: 'https://developers.weixin.qq.com/miniprogram/dev/framework/user-privacy/', sourceTitle: '用户隐私保护指引说明' },
  { id: 'domain', title: '服务器域名白名单', status: 'todo', condition: '按需',
    lede: '使用自有服务时，核对请求、上传、下载与 WebSocket 对应的域名配置。',
    steps: ['整理项目实际使用的全部出站域名，包括动态拼接的地址。', '在开发设置中配置对应的服务器域名。', '保存后在真机验证请求；当前预览不读取后台配置。'],
    action: ['guided-step.html', '查看域名配置步骤'],
    source: 'https://developers.weixin.qq.com/miniprogram/dev/framework/ability/network.html', sourceTitle: '网络通信与服务器域名说明' },
  { id: 'review', title: '提交审核', status: 'todo',
    lede: '上传待审核版本，核对备案、类目与功能准备情况，再由你提交审核。',
    steps: ['确认备案、服务类目以及适用的隐私和域名配置。', '用开发者工具或已配置的 CI 上传版本，检查体验版。', '在后台提交审核；如被拒，保留拒因原文并逐项处理。'],
    action: ['explain.html?from=stage-workspace.html%3Fstage%3Dreview', '查看审核拒因反查'],
    source: 'https://developers.weixin.qq.com/miniprogram/product/reject.html', sourceTitle: '小程序常见拒绝情形' },
  { id: 'release', title: '发布上线', status: 'todo',
    lede: '审核通过后在官方后台发布，随后检查线上版本的关键路径。',
    steps: ['在官方后台确认待发布版本已经审核通过。', '核对版本信息后，由你本人确认发布。', '验证线上关键流程，记录后续需要复查的事项。'],
    action: ['health-dashboard.html?from=stage-workspace.html%3Fstage%3Drelease', '查看上线后检查示例'] }
];

export function getStage(id) {
  return STAGES.find(stage => stage.id === id) || STAGES.find(stage => stage.id === 'filing') || STAGES[0];
}

export function stageHref(id) {
  return `stage-workspace.html?stage=${getStage(id).id}`;
}

export function stageStatusLabel(stage) {
  return { done: '示例已完成', cur: '示例当前阶段', todo: '示例待处理' }[stage.status];
}

export function renderStageLinks(selectedId) {
  const selected = getStage(selectedId);
  return STAGES.map(stage => `<li class="stg ${stage.status === 'done' ? 'stg--done' : ''} ${stage.id === selected.id ? 'stg--cur' : ''}">
    <a class="stg__row" href="${stageHref(stage.id)}"${stage.id === selected.id ? ' aria-current="page"' : ''}>
      <span class="stg__dot">${stage.status === 'done' ? iconMarkup('check') : ''}</span>
      <span class="stg__t">${stage.title}<span class="sr-only"> · ${stageStatusLabel(stage)}</span></span>
      ${stage.condition ? `<span class="stg__cond">${stage.condition}</span>` : ''}
    </a></li>`).join('');
}

export function stageNavigationMarkup(id) {
  const index = STAGES.indexOf(getStage(id));
  return `<nav class="work__meta" aria-label="阶段导航" style="margin-top:24px;flex-wrap:wrap">
    ${index > 0 ? `<a class="chip" href="${stageHref(STAGES[index - 1].id)}">上一阶段：${STAGES[index - 1].title}</a>` : ''}
    ${index < STAGES.length - 1 ? `<a class="chip" href="${stageHref(STAGES[index + 1].id)}">下一阶段：${STAGES[index + 1].title}</a>` : ''}
    <a class="chip" href="main-four-region.html">返回上线工作台</a>
  </nav>`;
}

export function stageOverviewMarkup(id) {
  const stage = getStage(id);
  const index = STAGES.indexOf(stage);
  return `<p class="crumb"><a href="main-four-region.html">上线航程</a> / ${stage.title}</p>
    <div class="work__head"><h1>${stage.title}</h1><span class="statepill statepill--cur">示例阶段 ${index + 1} / ${STAGES.length}</span></div>
    <p class="lede">${stage.lede}</p>
    <div class="work__meta"><span>${stageStatusLabel(stage)}</span><span>需你本人在官方后台确认</span></div>
    <div class="sec"><h2 class="sec__h">准备与操作</h2>
      <ol class="tl">${stage.steps.map((step, stepIndex) => `<li><span class="tl__num">${stepIndex + 1}</span><p class="tl__t">${step}</p></li>`).join('')}</ol>
    </div>
    ${stage.action ? `<div class="sec"><a class="chip chip--accent" href="${stage.action[0]}">${stage.action[1]} ${iconMarkup('arrow-right')}</a></div>` : ''}
    ${stage.source ? `<div class="sec"><h2 class="sec__h">官方来源</h2><a class="srccard" href="${stage.source}" target="_blank" rel="noopener"><span class="srccard__ico">${iconMarkup('file-text')}</span><span><span class="srccard__t">${stage.sourceTitle}</span><br><span class="srccard__u">微信开放文档 · 以最新页面为准</span></span></a></div>` : ''}
    <div class="foot-note">${iconMarkup('shield-check')}<span>这里展示阶段内容和操作路径，未读取你的账号、项目或办理状态。官方后台的提交、核验与发布由你本人完成。</span></div>
    ${stageNavigationMarkup(stage.id)}`;
}
