import { deriveWorkflow } from '../../../src/workflow.mjs';
import { escapeMarkdown as escape } from './guide-artifact.js';
import { GUIDE_SUBJECTS } from './guide-contract.js';
import { createHandoff, handoffWarnings } from './repair-handoff.js';

/**
 * @typedef {{
 *   ruleId: string | null;
 *   title: string;
 *   officialUrl: string | null;
 *   quote: string | null;
 *   lastVerified: string | null;
 * }} MaterialSourceRef
 *
 * @typedef {{
 *   id: string;
 *   consoleField: string;
 *   consolePath: string;
 *   currentStatus: string;
 *   mappedValue: string;
 *   notes: string;
 *   sources: MaterialSourceRef[];
 * }} SubmissionFieldMapping
 *
 * @typedef {{
 *   id: string;
 *   title: string;
 *   targetLocation: string;
 *   statusNote: string;
 *   draftText: string;
 *   placeholders: string[];
 *   sources: MaterialSourceRef[];
 * }} SubmissionDraftItem
 *
 * @typedef {{
 *   id: string;
 *   category: string;
 *   title: string;
 *   detail: string;
 *   manualOnly: boolean;
 *   sources: MaterialSourceRef[];
 * }} SubmissionChecklistItem
 *
 * @typedef {{
 *   format: 'shipmate-submission-materials';
 *   version: 1;
 *   meta: {
 *     projectId: string;
 *     projectName: string;
 *     subject: string;
 *     subjectLabel: string;
 *     projectRevision: number;
 *     contextRevision: number;
 *     rulesVersion: string | null;
 *     artifactId: string | null;
 *     artifactKind: string | null;
 *     artifactProvenance: 'local' | 'imported' | null;
 *     generatedAt: number;
 *     warnings: string[];
 *   };
 *   fieldMappings: SubmissionFieldMapping[];
 *   draftItems: SubmissionDraftItem[];
 *   checklist: SubmissionChecklistItem[];
 * }} SubmissionMaterialsPack
 */

const STAGE_STATUS_LABELS = /** @type {Record<string, string>} */ ({
  confirmed: '人工已确认',
  not_applicable: '人工不适用',
  pending: '待确认',
  unknown: '事实待补充',
  stale: '待重新核对',
});

/**
 * @param {unknown} rawUrl
 * @returns {string | null}
 */
function sanitizeHttpsUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return null;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null;
    return parsed.href.replace(/[\s<>]/g, ch => encodeURIComponent(ch));
  } catch {
    return null;
  }
}

/**
 * @param {boolean | null | undefined} value
 * @returns {string}
 */
function formatBoolFact(value) {
  return value == null ? '尚未确认' : value ? '是' : '否';
}

/** @param {unknown} value */
function shareableProjectText(value) {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  const credential = /(?:AppSecret|private[ _-]?key|api[ _-]?key|Token|Cookie|password|authorization|上传密钥|密码|令牌|测试账号|测试号)["'”’]?\s*[：:=]|\bBearer\s+\S/iu;
  const guarantee = /可直接提交|已合规|保证过审|可以过审|确保过审|一键提审|代提审/u;
  return credential.test(text) || guarantee.test(text) ? '' : text;
}

/**
 * @param {Map<string, any>} ruleMap
 * @param {string} subject
 * @param {string[]} ruleIds
 * @returns {MaterialSourceRef[]}
 */
function pickRuleSources(ruleMap, subject, ruleIds) {
  /** @type {MaterialSourceRef[]} */
  const refs = [];
  for (const id of ruleIds) {
    const rule = ruleMap.get(id);
    if (!rule || rule.draft) continue;
    if (Array.isArray(rule.subject_type) && !rule.subject_type.includes(subject)) continue;
    refs.push({
      ruleId: String(rule.id),
      title: String(rule.title || rule.id),
      officialUrl: sanitizeHttpsUrl(rule.official_url),
      quote: typeof rule.source_quote === 'string' && rule.source_quote.trim() ? rule.source_quote : null,
      lastVerified: typeof rule.last_verified === 'string' && rule.last_verified.trim() ? rule.last_verified : null,
    });
  }
  return refs;
}

/**
 * @param {any[]} stages
 * @param {string} stageId
 * @returns {MaterialSourceRef[]}
 */
function pickStageSource(stages, stageId) {
  const stage = stages.find(entry => entry?.stage === stageId);
  if (!stage) return [];
  const officialUrl = sanitizeHttpsUrl(stage.official_url);
  const quote = typeof stage.source_quote === 'string' && stage.source_quote.trim() ? stage.source_quote : null;
  const lastVerified = typeof stage.last_verified === 'string' && stage.last_verified.trim() ? stage.last_verified : null;
  if (!officialUrl && !quote && !lastVerified) return [];
  return [
    {
      ruleId: null,
      title: String(stage.title || stageId),
      officialUrl,
      quote,
      lastVerified,
    },
  ];
}

/**
 * Derive a deterministic submission materials pack from saved project facts, workflow catalog,
 * and optional matching artifact. Strictly outputs fieldMappings, draftItems, and checklist;
 * never collects credentials or claims compliance/approval guarantees.
 *
 * @param {{
 *   project: any;
 *   catalog: any;
 *   rulesVersion?: string | null;
 *   confirmations?: any[];
 *   artifact?: any | null;
 *   generatedAt?: number;
 * }} input
 * @returns {SubmissionMaterialsPack}
 */
export function createSubmissionMaterials(input) {
  const project = input?.project;
  const catalog = input?.catalog;
  if (
    !project ||
    typeof project !== 'object' ||
    typeof project.id !== 'string' ||
    !project.id.trim() ||
    typeof project.name !== 'string' ||
    !project.name.trim() ||
    !Object.hasOwn(GUIDE_SUBJECTS, project.subject)
  ) {
    throw new Error('生成提审材料包需要有效的已保存项目。');
  }
  if (!catalog || !Array.isArray(catalog.stages) || !Array.isArray(catalog.rules)) {
    throw new Error('生成提审材料包需要有效的规则目录。');
  }

  const rulesVersion = typeof input.rulesVersion === 'string' && input.rulesVersion.trim() ? input.rulesVersion : null;
  const confirmations = Array.isArray(input.confirmations) ? input.confirmations : [];
  const generatedAt =
    typeof input.generatedAt === 'number' && Number.isSafeInteger(input.generatedAt) && input.generatedAt > 0
      ? input.generatedAt
      : Date.now();
  const subject = /** @type {keyof typeof GUIDE_SUBJECTS} */ (project.subject);
  const subjectLabel = GUIDE_SUBJECTS[subject];
  const facts = project.facts && typeof project.facts === 'object' ? project.facts : {};
  const businessType = shareableProjectText(facts.businessType);
  const projectName = shareableProjectText(project.name) || '当前项目';

  const model = deriveWorkflow({
    project: { ...project, facts: { ...facts, businessType } },
    catalog,
    rulesVersion: rulesVersion ?? '',
    confirmations: /** @type {never} */ (confirmations),
  });

  const ruleMap = new Map(catalog.rules.map((/** @type {any} */ r) => [r.id, r]));
  const stageMap = new Map(model.stages.map((/** @type {any} */ s) => [s.id, s]));

  /** @type {string[]} */
  const warnings = [];
  const hitIds = new Set();
  /** @type {string | null} */
  let artifactId = null;
  /** @type {string | null} */
  let artifactKind = null;
  /** @type {'local' | 'imported' | null} */
  let artifactProvenance = null;

  const candidateArtifact = input.artifact;
  if (candidateArtifact && typeof candidateArtifact === 'object' && candidateArtifact.projectId === project.id) {
    if (candidateArtifact.provenance === 'imported') {
      artifactId = candidateArtifact.id;
      artifactKind = candidateArtifact.kind;
      artifactProvenance = 'imported';
      warnings.push(...handoffWarnings({ source: candidateArtifact }, project, rulesVersion));
    } else try {
      const handoff = createHandoff(candidateArtifact);
      artifactId = handoff.source.artifactId;
      artifactKind = handoff.source.kind;
      artifactProvenance = 'local';
      warnings.push(...handoffWarnings(handoff, project, rulesVersion));
      if (handoff.source.kind === 'check') for (const { rule } of handoff.items) hitIds.add(rule.ruleId);
    } catch {
      warnings.push('最近一份报告格式无法解析，本次仅依据已保存项目事实与规则目录整理。');
    }
  }

  const artifactRules = catalog.rules.filter((/** @type {any} */ rule) =>
    hitIds.has(rule.id) && !rule.draft && rule.subject_type.includes(subject),
  );
  const privacyHits = artifactRules.filter(r => r.stage === 'privacy');
  const domainHits = artifactRules.filter(r => r.stage === 'domain');
  if (privacyHits.length && facts.collectsSensitive === false) {
    warnings.push('项目事实标记为不收集敏感信息，但预检有隐私核对线索，请对照当前代码重新确认。');
  }
  if (domainHits.length && facts.hasServerDomain === false) {
    warnings.push('项目事实标记为无服务器域名，但预检有域名核对线索，请对照当前代码重新确认。');
  }
  const categoryStage = stageMap.get('category');
  const filingStage = stageMap.get('filing');
  const privacyStage = stageMap.get('privacy');
  const domainStage = stageMap.get('domain');

  const categoryTitles = model.categoryCandidates.map((/** @type {any} */ c) => String(c.title));

  /** @type {SubmissionFieldMapping[]} */
  const fieldMappings = [
    {
      id: 'intro',
      consoleField: '功能介绍（简介）',
      consolePath: '微信公众平台 → 设置 → 基本设置 → 功能介绍',
      currentStatus: businessType ? '已填业务描述（待人工核对）' : '尚未填写业务描述',
      mappedValue: businessType || '尚未填写实际业务描述（请先在「上线 → 项目事实」补充）',
      notes: '简介中提炼的每个功能点均须在小程序内已实现且可正常使用；切勿写入未上线的规划功能。',
      sources: pickRuleSources(ruleMap, subject, ['review.function-matches-intro']),
    },
    {
      id: 'category',
      consoleField: '服务类目',
      consolePath: '微信公众平台 → 设置 → 基本设置 → 服务类目',
      currentStatus: STAGE_STATUS_LABELS[categoryStage?.status] || '待确认',
      mappedValue: categoryTitles.length
        ? `${subjectLabel} · 候选线索：${categoryTitles.join('、')}`
        : `${subjectLabel} · 尚未匹配到具体类目线索，请按实际提供的服务对照官方类目表选择`,
      notes: '所选类目须与实际提供的核心服务一致，且每个提交类目对应的页面须能从首页直达或经 2 次点击到达。',
      sources: pickRuleSources(ruleMap, subject, [
        'review.category-matches-service',
        'review.category-reachable-on-home',
      ]),
    },
    {
      id: 'filing',
      consoleField: '小程序 ICP 备案',
      consolePath: '微信公众平台 → 设置 → 基本设置 → 小程序备案',
      currentStatus: STAGE_STATUS_LABELS[filingStage?.status] || '待确认',
      mappedValue: `主体类型：${subjectLabel} · 当前阶段状态：${STAGE_STATUS_LABELS[filingStage?.status] || '待确认'}`,
      notes:
        subject === 'personal'
          ? '上线前须在后台完成备案五个环节；个人备案需核对有效身份证件清晰度及有效期大于 1 个月。'
          : '上线前须在后台完成备案五个环节；主体或负责人信息变更时须及时变更备案。',
      sources: pickRuleSources(ruleMap, subject, [
        'filing.required-before-release',
        'filing.individual-id-materials',
        'filing.keep-updated',
      ]),
    },
    {
      id: 'privacy',
      consoleField: '用户隐私保护指引',
      consolePath: '微信公众平台 → 设置 → 服务内容声明 → 用户隐私保护指引',
      currentStatus:
        facts.collectsSensitive == null
          ? '事实待补充'
          : STAGE_STATUS_LABELS[privacyStage?.status] || '待确认',
      mappedValue: `收集敏感信息：${formatBoolFact(facts.collectsSensitive)}${
        privacyHits.length ? ` · 预检命中 ${privacyHits.length} 项隐私核对线索（${privacyHits.map(r => r.title).slice(0, 3).join('、')}）` : ''
      }`,
      notes: '须按代码实际调用的隐私接口在后台逐项声明处理目的与方式，并确保先告知同意再调用。',
      sources: [
        ...pickStageSource(catalog.stages, 'privacy'),
        ...pickRuleSources(ruleMap, subject, privacyHits.map((/** @type {any} */ r) => r.id)),
      ],
    },
    {
      id: 'domain',
      consoleField: '服务器域名与业务域名',
      consolePath: '微信公众平台 → 开发 → 开发管理 → 开发设置 → 服务器域名',
      currentStatus:
        facts.hasServerDomain == null
          ? '事实待补充'
          : STAGE_STATUS_LABELS[domainStage?.status] || '待确认',
      mappedValue: `使用服务器域名：${formatBoolFact(facts.hasServerDomain)}${
        domainHits.length ? ` · 预检命中 ${domainHits.length} 项域名核对线索` : ''
      }`,
      notes: '所有网络通信域名均须完成 ICP 备案并提前写入对应白名单；个人主体不支持 web-view 业务域名。',
      sources: pickRuleSources(ruleMap, subject, [
        'domain.request-whitelist',
        'domain.must-icp-filed',
        'domain.web-view-personal',
      ]),
    },
    {
      id: 'version-desc',
      consoleField: '版本描述与审核说明',
      consolePath: '微信公众平台 → 管理 → 版本管理 → 提交审核',
      currentStatus: '每次提审时由开发者本人填写',
      mappedValue: `项目：${projectName} · 涉及支付：${formatBoolFact(facts.hasPayment)}`,
      notes: '说明本次版本核心功能与首页进入路径；提交版本须为可正常打开和运行的完成品，非测试版。',
      sources: pickRuleSources(ruleMap, subject, [
        'review.must-be-finished',
        'review.category-reachable-on-home',
      ]),
    },
    {
      id: 'test-account-field',
      consoleField: '测试账号与体验说明栏',
      consolePath: '微信公众平台 → 管理 → 版本管理 → 提交审核 → 测试账号',
      currentStatus: '仅在微信后台按需填写（本机零采集）',
      mappedValue: '如含登录、会员或受限页面，请由开发者本人在微信公众平台提审表单填写测试账号；本工具不采集、不保存任何账号或密码。',
      notes: '提供的测试账号须能完整体验所有提审功能且预置有效测试数据。',
      sources: pickRuleSources(ruleMap, subject, ['review.test-account']),
    },
  ];

  /** @type {string[]} */
  const introPlaceholders = [];
  if (!businessType) {
    introPlaceholders.push('待补充：实际提供的核心服务内容（仅写当前版本已实现且可正常操作的功能点）');
  }
  introPlaceholders.push('待人工核对：确认草稿中的每个功能词在小程序内均有真实可用入口');

  const introDraftText = businessType
    ? `【待人工核对草稿】${projectName}：面向用户提供「${businessType}」相关功能。[请删去任何当前版本尚未实现的功能表述，确保简介提炼出的功能点在小程序内均可正常使用]`
    : `【待补充草稿】${projectName}：[待补充：请用 1–2 句话描述当前版本已实现的核心功能，例如具体查询、预约或工具能力；切勿写入未上线功能]`;

  const reviewPlaceholders = [
    '待补充：每个已选服务类目从首页直达或 2 次点击内到达的具体路径（如：首页 → 顶部入口 → 对应页面）',
    '待补充：若存在登录或权限门槛，请本人在公众平台提审页专用栏填写测试号（切勿将真实密码写入本草稿或代码库）',
  ];
  const reviewDraftText = [
    `【待人工核对草稿 · 版本描述与提审备注】`,
    `1. 本次提审功能概述：${businessType || '[待补充本次版本已实现的核心业务功能]'}`,
    `2. 首页类目可达路径：[待补充：例如「首页 → 主功能卡（1 次点击）→ 详情操作页（2 次点击）」，须覆盖所选服务类目]`,
    `3. 主体与支付情况：${subjectLabel}；涉及支付：${formatBoolFact(facts.hasPayment)}`,
    `4. 账号与受限流程说明：[如无登录门槛请写「无需登录即可体验完整功能」；如含账号体系，请在公众平台提审表单「测试账号」栏直接填写可体验全部功能的测试号，不在本工具记录账号密码]`,
  ].join('\n');

  /** @type {string[]} */
  const privacyPlaceholders = [];
  if (facts.collectsSensitive == null) {
    privacyPlaceholders.push('待补充：请先在「项目事实」中确认是否收集敏感信息，并运行本机代码预检');
  }
  if (facts.collectsSensitive !== false) {
    privacyPlaceholders.push('待人工核对：在公众平台《用户隐私保护指引》逐项核对收集的信息类型、用途及用户撤回方式');
  }
  const privacyDraftText = [
    `【待人工核对草稿 · 隐私保护指引核对清单】`,
    `- 已保存事实「收集敏感信息」：${formatBoolFact(facts.collectsSensitive)}`,
    privacyHits.length
      ? `- 最近预检识别到的隐私核对项：\n${privacyHits.map((/** @type {any} */ r) => `  · ${r.title}（${r.id}）`).join('\n')}`
      : `- 最近预检隐私线索：[尚未加载代码预检命中项，建议先运行本机代码预检核对 wx.* 隐私接口调用]`,
    `- 后台核对动作：[登录微信公众平台「设置 → 服务内容声明 → 用户隐私保护指引」，逐项比对实际调用接口与弹窗授权时机，以官方后台表单为准]`,
  ].join('\n');

  /** @type {SubmissionDraftItem[]} */
  const draftItems = [
    {
      id: 'intro-draft',
      title: '功能简介草稿（待人工核对）',
      targetLocation: '设置 → 基本设置 → 功能介绍',
      statusNote: '草稿仅供参考，须逐字对照已实现功能修改后再填入微信后台',
      draftText: introDraftText,
      placeholders: introPlaceholders,
      sources: pickRuleSources(ruleMap, subject, ['review.function-matches-intro']),
    },
    {
      id: 'review-note-draft',
      title: '版本描述与审核路径草稿（待人工核对）',
      targetLocation: '管理 → 版本管理 → 提交审核 → 版本描述 / 备注',
      statusNote: '含待填路径占位符；测试账号密码须直接在公众平台后台填写，切勿写入本工具',
      draftText: reviewDraftText,
      placeholders: reviewPlaceholders,
      sources: pickRuleSources(ruleMap, subject, [
        'review.category-reachable-on-home',
        'review.category-matches-service',
        'review.test-account',
      ]),
    },
    {
      id: 'privacy-check-draft',
      title: '隐私保护指引核对草稿（待人工核对）',
      targetLocation: '设置 → 服务内容声明 → 用户隐私保护指引',
      statusNote: '须结合最新代码实际调用接口在微信后台逐项核实声明',
      draftText: privacyDraftText,
      placeholders: privacyPlaceholders,
      sources: pickStageSource(catalog.stages, 'privacy'),
    },
  ];

  /** @type {SubmissionChecklistItem[]} */
  const checklist = [
    {
      id: 'test-account',
      category: '审核体验保障',
      title: '测试账号：已准备可体验全部功能的测试号（仅在微信后台填写）',
      detail: '若小程序含登录、账号体系、角色权限或付费受限页面，提审时须在微信公众平台提供可体验全部功能的测试账号；不在本工具或源码中保存真实密码。',
      manualOnly: true,
      sources: pickRuleSources(ruleMap, subject, ['review.test-account']),
    },
    {
      id: 'test-data',
      category: '审核体验保障',
      title: '测试数据：核心流程与测试号内已预置真实可用的业务数据',
      detail: '确保提审版本及测试账号下有完整可浏览、可交互的正式或演示数据，移除「测试商品」、空白占位页、死链与无效空按钮。',
      manualOnly: true,
      sources: pickRuleSources(ruleMap, subject, ['review.must-be-finished']),
    },
    {
      id: 'service-availability',
      category: '审核体验保障',
      title: '审核期间服务可用：后端接口、云环境与证书在审核期间保持在线',
      detail: '确认从提交审核到审核结束期间，所有后端 API、云函数/数据库、HTTPS 证书及第三方服务均持续稳定可访问，不安排停机维护或地域/IP 拦截。',
      manualOnly: true,
      sources: [],
    },
    {
      id: 'intro-consistency',
      category: '内容与类目一致性',
      title: '功能与简介一致：简介中提炼的每个功能点均已实现且可用',
      detail: '逐字对照后台「功能介绍」与实际页面，确认没有未开发完成或无法点击进入的功能描述。',
      manualOnly: true,
      sources: pickRuleSources(ruleMap, subject, ['review.function-matches-intro']),
    },
    {
      id: 'category-home-reachability',
      category: '内容与类目一致性',
      title: '类目匹配且首页可达：所选服务类目与服务相符，首页 2 次点击内可达',
      detail: '确认所有已提交服务类目的核心页面都能从小程序首页直达或至多经过 2 次点击到达，且内容与所选类目相符。',
      manualOnly: true,
      sources: pickRuleSources(ruleMap, subject, [
        'review.category-reachable-on-home',
        'review.category-matches-service',
      ]),
    },
    {
      id: 'no-inducement-or-ad-shell',
      category: '运营红线自查',
      title: '无诱导与纯营销页：不含诱导分享/关注/下载，非空白广告壳',
      detail: '排查弹窗、按钮与文案，移除「分享后解锁」「关注公众号继续」等强制诱导逻辑以及纯招商/空白广告位。',
      manualOnly: true,
      sources: pickRuleSources(ruleMap, subject, ['review.no-inducement', 'review.not-mainly-ads']),
    },
    {
      id: 'filing-ready',
      category: '后台前置条件',
      title: '小程序 ICP 备案状态已在公众平台确认通过',
      detail: '登录微信公众平台核对小程序备案状态与主体信息一致，未完成备案前无法正式上线。',
      manualOnly: true,
      sources: pickRuleSources(ruleMap, subject, ['filing.required-before-release']),
    },
  ];

  if (privacyHits.length || facts.collectsSensitive !== false) {
    checklist.push({
      id: 'privacy-declaration',
      category: '后台前置条件',
      title: '用户隐私保护指引已与代码实际调用接口逐项对齐',
      detail: '核对后台《用户隐私保护指引》已声明所有实际调用的隐私接口，并在调用前完成用户知情同意交互。',
      manualOnly: true,
      sources: pickStageSource(catalog.stages, 'privacy'),
    });
  }

  if (domainHits.length || facts.hasServerDomain !== false) {
    checklist.push({
      id: 'domain-whitelist',
      category: '后台前置条件',
      title: '服务器域名已完成 ICP 备案并写入后台通讯域名白名单',
      detail: '核对 request / uploadFile / downloadFile / socket 涉及的全部正式域名均已备案并配置到微信公众平台开发设置。',
      manualOnly: true,
      sources: pickRuleSources(ruleMap, subject, ['domain.request-whitelist', 'domain.must-icp-filed']),
    });
  }

  checklist.push({
    id: 'manual-release-boundary',
    category: '发布确认边界',
    title: '知悉提审与审核通过后的正式发布均须由开发者本人在微信后台手动执行',
    detail: '本工具不会代为提审或发布；代码审核通过后，仍需开发者本人登录公众平台手动点击发布。',
    manualOnly: true,
    sources: pickRuleSources(ruleMap, subject, ['release.manual-publish']),
  });

  return {
    format: 'shipmate-submission-materials',
    version: 1,
    meta: {
      projectId: String(project.id),
      projectName,
      subject,
      subjectLabel,
      projectRevision: Number.isSafeInteger(project.revision) ? project.revision : 0,
      contextRevision: Number.isSafeInteger(project.contextRevision) ? project.contextRevision : 0,
      rulesVersion,
      artifactId,
      artifactKind,
      artifactProvenance,
      generatedAt,
      warnings,
    },
    fieldMappings,
    draftItems,
    checklist,
  };
}

/**
 * @param {MaterialSourceRef[]} sources
 * @returns {string[]}
 */
function formatMarkdownSources(sources) {
  /** @type {string[]} */
  const lines = [];
  for (const src of sources) {
    const label = src.ruleId ? `${escape(src.title)}（${escape(src.ruleId)}）` : escape(src.title);
    const linkPart = src.officialUrl ? ` · 官方来源：<${src.officialUrl}>` : '';
    const datePart = ` · 核验日期：${escape(src.lastVerified || '未记录')}（未实时核验）`;
    lines.push(`  - 规则依据：${label}${linkPart}${datePart}`);
    if (src.quote) {
      lines.push(`    - 官方原文摘录：${escape(src.quote)}`);
    }
  }
  return lines;
}

/**
 * @param {string} value
 * @returns {string[]}
 */
function formatDraftBlock(value) {
  const text = value.replace(/\r\n?/g, '\n').replace(/(?!\n)[\p{Cc}\p{Cf}]/gu, ' ');
  const longestRun = (text.match(/`{3,}/g) ?? []).reduce((max, run) => Math.max(max, run.length), 2);
  const fence = '`'.repeat(longestRun + 1);
  return [`${fence}text`, text, fence];
}

/**
 * Export a validated SubmissionMaterialsPack as Markdown or JSON.
 *
 * @param {SubmissionMaterialsPack} pack
 * @param {'markdown' | 'json'} [format]
 * @param {{ checkedIds?: Iterable<string> }} [options]
 * @returns {{ text: string; filename: string; mimeType: string }}
 */
export function exportSubmissionMaterials(pack, format = 'markdown', options = {}) {
  if (
    !pack ||
    pack.format !== 'shipmate-submission-materials' ||
    pack.version !== 1 ||
    !Array.isArray(pack.fieldMappings) ||
    !Array.isArray(pack.draftItems) ||
    !Array.isArray(pack.checklist)
  ) {
    throw new Error('提审材料包数据不完整，请重新加载后再导出。');
  }
  if (format !== 'markdown' && format !== 'json') {
    throw new Error('不支持的导出格式。');
  }

  const validIds = new Set(pack.checklist.map(item => item.id));
  const rawChecked = options?.checkedIds ? [...options.checkedIds] : [];
  const checkedSet = new Set(rawChecked.filter(id => typeof id === 'string' && validIds.has(id)));

  const ts = pack.meta.generatedAt;
  if (format === 'json') {
    return {
      text: JSON.stringify({ ...pack, checkedIds: [...checkedSet] }, null, 2),
      filename: `shipmate-materials-${ts}.json`,
      mimeType: 'application/json;charset=utf-8',
    };
  }

  /** @type {string[]} */
  const lines = [
    '# 小程序提审材料包（待人工核对）',
    '',
    '> 本材料包仅依据本机已保存的项目事实、规则目录与最近预检快照整理字段映射、待确认草稿和自查清单，不构成审核结果承诺；本工具不采集或保存测试账号密码，提审与发布须由开发者本人在微信公众平台完成。',
    '',
    `- 项目：${escape(pack.meta.projectName)}（主体：${escape(pack.meta.subjectLabel)}）`,
    `- 生成时间：${new Date(ts).toISOString()} · 项目版本 ${pack.meta.projectRevision} · 事实版本 ${pack.meta.contextRevision}`,
    `- 自查清单进度：已勾选 ${checkedSet.size} / ${pack.checklist.length} 项（仅作本机备忘）`,
    '',
  ];

  if (pack.meta.warnings.length > 0) {
    lines.push('> 注意事项：');
    for (const warning of pack.meta.warnings) {
      lines.push(`> - ${escape(warning)}`);
    }
    lines.push('');
  }

  lines.push(
    '## 一、字段映射',
    '',
    '| 微信后台字段 | 后台位置 | 当前状态 | 项目映射内容 | 核对要点 |',
    '| --- | --- | --- | --- | --- |',
  );
  for (const row of pack.fieldMappings) {
    lines.push(
      `| ${escape(row.consoleField)} | ${escape(row.consolePath)} | ${escape(row.currentStatus)} | ${escape(row.mappedValue)} | ${escape(row.notes)} |`,
    );
  }
  lines.push('');
  for (const row of pack.fieldMappings) {
    if (row.sources.length > 0) {
      lines.push(`- **${escape(row.consoleField)}** 依据：`, ...formatMarkdownSources(row.sources));
    }
  }
  lines.push('');

  lines.push('## 二、待确认草稿', '');
  for (const draft of pack.draftItems) {
    lines.push(
      `### ${escape(draft.title)}`,
      '',
      `- 填写位置：${escape(draft.targetLocation)}`,
      `- 状态说明：${escape(draft.statusNote)}`,
      '',
      ...formatDraftBlock(draft.draftText),
      '',
    );
    if (draft.placeholders.length > 0) {
      lines.push('- 待补充与人工核对项：');
      for (const ph of draft.placeholders) {
        lines.push(`  - ${escape(ph)}`);
      }
      lines.push('');
    }
    if (draft.sources.length > 0) {
      lines.push(...formatMarkdownSources(draft.sources), '');
    }
  }

  lines.push(
    '## 三、提审前检查清单',
    '',
    '勾选仅代表开发者本机自查记录，不代表官方审核状态。',
    '',
  );
  for (const item of pack.checklist) {
    const mark = checkedSet.has(item.id) ? 'x' : ' ';
    lines.push(`- [${mark}] **${escape(item.title)}**（${escape(item.category)}）：${escape(item.detail)}`);
    if (item.sources.length > 0) {
      lines.push(...formatMarkdownSources(item.sources));
    }
  }
  lines.push('');

  return {
    text: lines.join('\n'),
    filename: `shipmate-materials-${ts}.md`,
    mimeType: 'text/markdown;charset=utf-8',
  };
}
