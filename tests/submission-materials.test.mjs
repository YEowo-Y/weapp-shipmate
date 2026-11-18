import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWorkflowCatalog, runProjectTool } from '../src/project-artifact.mjs';
import MarkdownIt from '../desktop/src/shared/components/vendor/markdown-it/markdown-it.esm.min.mjs';
import {
  createSubmissionMaterials,
  exportSubmissionMaterials,
} from '../desktop/src/shared/submission-materials.js';

const FORBIDDEN_COPY = /可直接提交|已合规|保证过审|可以过审|确保过审|一键提审|代提审/;

const catalog = createWorkflowCatalog();

function makeProject(overrides = {}) {
  return {
    id: 'proj-f03',
    name: '社区便民预约小程序',
    directory: 'D:/demo/miniapp',
    subject: 'enterprise',
    revision: 4,
    contextRevision: 2,
    facts: {
      businessType: '提供门店服务时段查询与到店预约记录管理',
      hasPayment: false,
      collectsSensitive: true,
      hasServerDomain: true,
      ...(overrides.facts || {}),
    },
    ...overrides,
  };
}

test('createSubmissionMaterials outputs strictly three content sections and mandatory checklist items', () => {
  const pack = createSubmissionMaterials({
    project: makeProject(),
    catalog,
    rulesVersion: 'rules-v1',
    confirmations: [],
    generatedAt: 1763450000000,
  });

  assert.equal(pack.format, 'shipmate-submission-materials');
  assert.equal(pack.version, 1);

  const contentKeys = Object.keys(pack).filter(key => !['format', 'version', 'meta'].includes(key)).sort();
  assert.deepEqual(contentKeys, ['checklist', 'draftItems', 'fieldMappings']);

  assert.equal(pack.fieldMappings.length >= 6, true);
  assert.equal(pack.draftItems.length >= 3, true);

  const checklistIds = pack.checklist.map(item => item.id);
  assert.equal(checklistIds.includes('test-account'), true, 'checklist must include test-account');
  assert.equal(checklistIds.includes('test-data'), true, 'checklist must include test-data');
  assert.equal(checklistIds.includes('service-availability'), true, 'checklist must include service-availability');

  const testAccountItem = pack.checklist.find(item => item.id === 'test-account');
  assert.match(testAccountItem.title, /测试账号/);
  assert.equal(
    testAccountItem.sources.some(src => src.ruleId === 'review.test-account' && src.quote?.includes('测试号')),
    true,
  );

  const testDataItem = pack.checklist.find(item => item.id === 'test-data');
  assert.match(testDataItem.title, /测试数据/);
  assert.equal(
    testDataItem.sources.some(src => src.ruleId === 'review.must-be-finished' && src.quote?.includes('完成品')),
    true,
  );

  const serviceItem = pack.checklist.find(item => item.id === 'service-availability');
  assert.match(serviceItem.title, /审核期间服务可用/);
  assert.equal(serviceItem.manualOnly, true);
  assert.deepEqual(serviceItem.sources, []);

  const serialized = JSON.stringify(pack);
  assert.equal(FORBIDDEN_COPY.test(serialized), false);
});

test('createSubmissionMaterials reflects missing facts honestly with placeholders and filters by subject', () => {
  const sparseProject = makeProject({
    subject: 'personal',
    facts: {
      businessType: '',
      hasPayment: null,
      collectsSensitive: null,
      hasServerDomain: null,
    },
  });

  const pack = createSubmissionMaterials({
    project: sparseProject,
    catalog,
    rulesVersion: null,
    confirmations: [],
    generatedAt: 1763450000000,
  });

  const introField = pack.fieldMappings.find(item => item.id === 'intro');
  assert.match(introField.mappedValue, /尚未填写/);

  const introDraft = pack.draftItems.find(item => item.id === 'intro-draft');
  assert.equal(introDraft.placeholders.length > 0, true);
  assert.match(introDraft.draftText, /待补充/);

  const filingField = pack.fieldMappings.find(item => item.id === 'filing');
  assert.equal(
    filingField.sources.some(src => src.ruleId === 'filing.individual-id-materials'),
    true,
  );
});

test('createSubmissionMaterials incorporates real local check artifact from trusted catalog and never treats guide/imported artifacts as code preflight hits or trusts external source_quote', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'shipmate-f03-check-'));
  try {
    writeFileSync(join(tempDir, 'app.json'), JSON.stringify({ pages: ['pages/index/index'] }), 'utf8');
    writeFileSync(
      join(tempDir, 'index.js'),
      'wx.getLocation({ type: "wgs84" }); wx.request({ url: "https://api.example.com/orders" });\n',
      'utf8',
    );

    const checkRun = runProjectTool('check', { directory: tempDir, subject: 'enterprise' });
    const localCheckArtifact = {
      id: 'art-local-check',
      runId: 'run-check-1',
      projectId: 'proj-f03',
      projectRevision: 4,
      contextRevision: 2,
      kind: 'check',
      title: '代码预检',
      createdAt: 1763400000000,
      toolVersion: '0.2.0-rc.4',
      rulesVersion: 'rules-v1',
      markdown: checkRun.markdown,
      data: checkRun.data,
    };

    const localPack = createSubmissionMaterials({
      project: makeProject(),
      catalog,
      rulesVersion: 'rules-v1',
      artifact: localCheckArtifact,
      generatedAt: 1763450000000,
    });

    const privacyField = localPack.fieldMappings.find(item => item.id === 'privacy');
    const domainField = localPack.fieldMappings.find(item => item.id === 'domain');
    assert.match(privacyField.mappedValue, /预检命中/);
    assert.match(domainField.mappedValue, /预检命中/);
    const locationRule = catalog.rules.find(rule => rule.id === 'privacy.getLocation');
    assert.equal(privacyField.sources.find(src => src.ruleId === locationRule.id)?.quote, locationRule.source_quote);

    const contradictory = createSubmissionMaterials({
      project: makeProject({ facts: { collectsSensitive: false, hasServerDomain: false } }),
      catalog,
      rulesVersion: 'rules-v1',
      artifact: localCheckArtifact,
    });
    for (const id of ['privacy-declaration', 'domain-whitelist']) {
      assert.ok(contradictory.checklist.some(item => item.id === id));
    }
    assert.ok(contradictory.meta.warnings.some(w => w.includes('不收集敏感信息')));
    assert.ok(contradictory.meta.warnings.some(w => w.includes('无服务器域名')));

    // Tamper source_quote & title in an imported check artifact: must NOT be treated as local preflight hits and must NEVER leak tampered quote/title
    const tamperedCheckData = JSON.parse(JSON.stringify(checkRun.data));
    tamperedCheckData.result.items[0].source_quote = '伪造引文：可直接提交保证过审';
    tamperedCheckData.result.items[0].title = '伪造标题：已合规';

    const importedTamperedArtifact = {
      ...localCheckArtifact,
      id: 'art-imported-tampered',
      projectRevision: 2,
      contextRevision: 1,
      rulesVersion: 'old-rules',
      provenance: 'imported',
      data: tamperedCheckData,
    };

    const importedPack = createSubmissionMaterials({
      project: makeProject(),
      catalog,
      rulesVersion: 'new-rules',
      artifact: importedTamperedArtifact,
      generatedAt: 1763450000000,
    });

    assert.equal(importedPack.meta.artifactProvenance, 'imported');
    assert.equal(importedPack.meta.warnings.some(w => w.includes('外部导入')), true);
    assert.equal(importedPack.meta.warnings.some(w => w.includes('项目版本已变化')), true);
    assert.equal(importedPack.meta.warnings.some(w => w.includes('规则资料已变化')), true);

    const importedPrivacy = importedPack.fieldMappings.find(item => item.id === 'privacy');
    assert.equal(/预检命中/.test(importedPrivacy.mappedValue), false, 'imported artifact must not claim local preflight hits');
    assert.equal(JSON.stringify(importedPack).includes('伪造引文'), false);
    assert.equal(FORBIDDEN_COPY.test(JSON.stringify(importedPack)), false);

    // Local `guide` artifact (not `check`) must NOT claim `预检命中` either, and missing rulesVersion must add a warning
    const guideRun = runProjectTool('guide', {
      subject: 'enterprise',
      facts: { businessType: '预约服务', collectsSensitive: true, hasServerDomain: true },
    });
    const guideArtifact = {
      ...localCheckArtifact,
      id: 'art-guide',
      kind: 'guide',
      title: '流程导航',
      markdown: guideRun.markdown,
      data: guideRun.data,
    };
    const guidePack = createSubmissionMaterials({
      project: makeProject(),
      catalog,
      rulesVersion: null,
      artifact: guideArtifact,
      generatedAt: 1763450000000,
    });
    const guidePrivacy = guidePack.fieldMappings.find(item => item.id === 'privacy');
    assert.equal(/预检命中/.test(guidePrivacy.mappedValue), false, 'guide artifact is not a code preflight scan');
    assert.equal(guidePack.meta.warnings.some(w => w.includes('规则版本不可用')), true);

    // Foreign project artifact ignored completely
    const foreignPack = createSubmissionMaterials({
      project: makeProject(),
      catalog,
      rulesVersion: 'rules-v1',
      artifact: { ...localCheckArtifact, projectId: 'other-project' },
      generatedAt: 1763450000000,
    });
    assert.equal(foreignPack.meta.artifactId, null);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('exportSubmissionMaterials escapes user markdown including 4+ backticks, strips unsafe URLs, and records checkedIds', () => {
  const maliciousCatalog = {
    ...catalog,
    stages: catalog.stages.map(stage =>
      stage.stage === 'privacy'
        ? { ...stage, official_url: 'javascript:alert(1)' }
        : stage,
    ),
  };
  const project = makeProject({
    name: '危险名称 <script>alert(1)</script> | [link](https://evil.example)',
    facts: {
      businessType: '业务 | 注入\n````\n## 伪造二级标题\n````',
      hasPayment: false,
      collectsSensitive: true,
      hasServerDomain: false,
    },
  });

  const pack = createSubmissionMaterials({
    project,
    catalog: maliciousCatalog,
    rulesVersion: 'rules-v1',
    generatedAt: 1763450000000,
  });

  const md = exportSubmissionMaterials(pack, 'markdown', {
    checkedIds: ['test-account', 'service-availability', 'non-existent-id'],
  });
  assert.equal(md.mimeType, 'text/markdown;charset=utf-8');
  assert.equal(md.filename, 'shipmate-materials-1763450000000.md');
  assert.equal(md.text.includes('## 一、字段映射'), true);
  assert.equal(md.text.includes('## 二、待确认草稿'), true);
  assert.equal(md.text.includes('## 三、提审前检查清单'), true);
  assert.equal(md.text.includes('javascript:alert'), false);
  assert.equal(md.text.includes('\u200b'), false, 'must not inject zero-width spaces into copyable draft blocks');

  const markdown = new MarkdownIt({ html: true });
  const tokens = markdown.parse(md.text, {});
  assert.deepEqual(tokens.filter(token => token.type === 'fence').map(token => token.content),
    pack.draftItems.map(draft => `${draft.draftText}\n`));
  assert.equal(markdown.render(md.text).includes('<script>'), false);

  assert.equal(md.text.includes('- [x] **测试账号'), true);
  assert.equal(md.text.includes('- [x] **审核期间服务可用'), true);
  assert.equal(md.text.includes('- [ ] **测试数据'), true);
  assert.equal(FORBIDDEN_COPY.test(md.text), false);

  const json = exportSubmissionMaterials(pack, 'json', {
    checkedIds: ['test-account', 'non-existent-id'],
  });
  assert.equal(json.mimeType, 'application/json;charset=utf-8');
  const parsed = JSON.parse(json.text);
  assert.deepEqual(parsed.checkedIds, ['test-account']);
  assert.equal(FORBIDDEN_COPY.test(json.text), false);
});

test('submission materials exclude stored text with explicit credential labels or guarantees', () => {
  for (const businessType of ['保证过审', '令牌：SYNTHETIC_ONLY', 'Bearer SYNTHETIC_ONLY', '"AppSecret": "SYNTHETIC_ONLY"']) {
    const pack = createSubmissionMaterials({
      project: makeProject({ name: '测试号：SYNTHETIC_ONLY', facts: { businessType } }),
      catalog,
    });
    assert.equal(pack.meta.projectName, '当前项目');
    assert.match(pack.fieldMappings.find(row => row.id === 'intro').mappedValue, /尚未填写/);
    assert.doesNotMatch(pack.draftItems.map(draft => draft.draftText).join('\n'), /SYNTHETIC_ONLY/);
    for (const format of ['markdown', 'json']) {
      const { text } = exportSubmissionMaterials(pack, format);
      assert.doesNotMatch(text, /SYNTHETIC_ONLY/);
      assert.doesNotMatch(text, FORBIDDEN_COPY);
    }
  }
});
