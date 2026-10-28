import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runGuide } from '../src/guide.mjs';

// Runs after the native Agent journey has produced actual SQLite artifacts.
// Only the imported history is synthetic. File input, IndexedDB, report lookup,
// project/run association checks and the report reader use the real application.
export async function checkResultTrust({ run, checked, click, fill, find, inspect, text, command, until, screenshot, projectInvoke, selectProject, openDataSettings, quit, launch, requests, projectId }) {
  await command('POST', '/window/rect', { width: 1200, height: 850 });
  const snapshot = await projectInvoke('project_snapshot');
  const artifact = snapshot.artifacts.find(item => item.projectId === projectId && item.kind === 'check');
  assert.ok(artifact, 'real local report must exist before testing imported references');
  const requestCount = requests.length;
  const errors = [];
  const monitor = () => inspect('window.__trustErrors=[];window.addEventListener("error",e=>window.__trustErrors.push(e.message));window.addEventListener("unhandledrejection",e=>window.__trustErrors.push(String(e.reason?.message||e.reason)));');
  await monitor();
  const reference = {
    schemaVersion: 1, kind: 'check', runId: artifact.runId, artifactId: artifact.id,
    title: '导入历史示例', summary: '这是外部备份携带的摘要，并非此次执行结果。',
    itemCount: 0, items: [], truncated: false, scopeComplete: true,
    projectRevision: artifact.projectRevision, contextRevision: artifact.contextRevision,
  };
  const history = (id, title, project, result) => ({
    id, title, projectId: project, draft: '', archived: false,
    messages: [{ id: `${id}-answer`, role: 'assistant', text: '来自另一设备的历史记录。', status: 'complete', provenance: 'local',
      parts: [{ type: 'tool', tool: { name: 'project_read', kind: 'project', label: '项目预检', state: 'success',
        toolCallId: `${id}-tool`, parameters: { kind: 'check', query: '' }, provenance: 'local' }, result }],
    }],
  });
  const imported = [
    history('trust-missing', '验收：缺失成果', projectId, { ...reference, artifactId: 'missing-native-artifact' }),
    history('trust-mismatch', '验收：关联不匹配', projectId, { ...reference, runId: 'unrelated-native-run' }),
    history('trust-matched', '验收：可核验成果', projectId, reference),
    history('trust-unassigned', '验收：未归属历史', 'project-on-other-device', reference),
  ];
  const guide = { subject: 'personal', sensitive: false, domain: false };
  imported.push({ id: 'trust-guide', title: '验收：外部历史清单', projectId, draft: '', messages: [{
    id: 'trust-guide-answer', role: 'assistant', text: '从外部会话导入的上线清单', status: 'complete', guide,
    tool: { kind: 'guide', name: 'weapp_shipmate_guide', state: 'success', label: '上线清单', parameters: guide },
    structuredResult: runGuide({ subject_type: 'personal', collects_sensitive: false, has_server_domain: false }),
  }] });
  const selectHistory = async (title, card = '[data-component^="project-tool-"]') => {
    await click('.session-workspace [data-action="history"]');
    await fill('[aria-label="搜索会话"]', title);
    const selector = await until(() => inspect(`const n=[...document.querySelectorAll('.session-workspace__results [data-action="session"]')].find(n=>n.textContent.includes(arguments[0]));return n ? '.session-workspace__results [data-action="session"][data-session-id="'+n.dataset.sessionId+'"]' : null;`, [title]), `history row ${title}`);
    await click(selector);
    await until(async () => (await text('#session-title')).trim() === title, `history selected ${title}`);
    await until(() => inspect('return Boolean(document.querySelector(arguments[0]))', [card]), 'imported tool rendered');
    if (await inspect('const n=document.querySelector(arguments[0]);return n.tagName==="DETAILS"&&!n.open', [card])) await click(`${card} > summary`);
    assert.ok(/导入|外部/.test(await text(card)), 'imported card identifies its external source');
    assert.doesNotMatch(await text(card), /完整报告保存在本机|以上为工具事实摘要/);
    return card;
  };
  await checked('Imported tool backups cannot assert local provenance and preserve the active draft', async () => {
    await fill('#desktopInput', '可信结果验收：原会话草稿');
    const title = await text('#session-title');
    const backupPath = resolve(run, 'external-tool-history.json');
    await writeFile(backupPath, JSON.stringify({ version: 1, currentSessionId: imported[0].id, sessionSequence: imported.length, sessions: imported }));
    await openDataSettings();
    await command('POST', `/element/${await find('[data-kind="data"] [data-action="backup-file"]')}/value`, { text: backupPath });
    await until(() => inspect('return !document.querySelector("[data-action=import-confirm]").disabled'), 'external history validated');
    await click('[data-kind="data"] [data-action="import-confirm"]');
    await until(async () => (await text('[data-action="data-feedback"]')).includes(`已追加导入并保存 ${imported.length} 个会话`), 'import persisted');
    assert.equal(await inspect('return document.querySelector("#desktopInput").value'), '可信结果验收：原会话草稿');
    assert.equal(await text('#session-title'), title);
    await click('#preferences-content-dismiss');
    await until(() => inspect('return !document.querySelector("#desktop-preferences").open'), 'return to conversation after import');
    await selectHistory('验收：缺失成果');
    await screenshot('trust-imported-history');
  });
  await checked('Missing and mismatched imported report references show recovery feedback without opening a report', async () => {
    const feedbackVisible = () => inspect('const n=document.querySelector("#desktopConversationStatus"),j=document.querySelector("#desktopJump"),r=n.getBoundingClientRect();return getComputedStyle(n).clipPath==="none" && r.height>10 && (j.hidden || j.getBoundingClientRect().bottom<=r.top-4) && document.documentElement.scrollWidth<=innerWidth+1;');
    for (const title of ['验收：缺失成果', '验收：关联不匹配']) {
      await selectHistory(title);
      await click('[data-action="open-artifact"]');
      await until(async () => /无法|未找到|不匹配|不属于|缺少/.test(await text('#desktopConversationStatus')), `${title} recovery feedback`);
      assert.equal(await inspect('return document.querySelector("#desktop-tools").open'), false);
      await until(feedbackVisible, 'recovery feedback visible without jump control overlap');
    }
    await screenshot('trust-reference-recovery');
    await command('POST', '/window/rect', { width: 390, height: 844 });
    await until(feedbackVisible, 'narrow recovery feedback visible without overlap');
    await screenshot('trust-recovery-narrow');
    await command('POST', '/window/rect', { width: 1200, height: 850 });
  });
  await checked('A matching imported reference opens the actual native report while the imported summary remains labelled', async () => {
    await selectHistory('验收：可核验成果');
    await click('[data-action="open-artifact"]');
    await until(() => inspect('return document.querySelector("#desktop-tools").open'), 'verified actual local report opens');
    assert.ok((await text('#report')).length > 50);
    assert.doesNotMatch(await text('#report'), /这是外部备份携带的摘要/);
    await screenshot('trust-verified-local-report');
    await click('#desktop-tools-close');
    assert.match(await text('[data-component^="project-tool-"]'), /导入/);
  });
  await checked('Imported provenance survives native restart without replaying tools or restoring permissions', async () => {
    errors.push(...await inspect('return window.__trustErrors || []'));
    await quit(); await launch(); await monitor();
    const card = await selectHistory('验收：可核验成果');
    assert.equal(requests.length, requestCount);
    assert.equal((await projectInvoke('project_snapshot')).artifacts.length, snapshot.artifacts.length);
    assert.notEqual(await inspect('return document.querySelector("#desktop-agent-tools").dataset.enabled'), 'true');
    await command('POST', '/window/rect', { width: 390, height: 844 });
    const geometry = await inspect(`const n=document.querySelector(arguments[0]),b=n.querySelector('.tool-details__body'),a=n.querySelector('[data-action="open-artifact"]');return {overflow:document.documentElement.scrollWidth-innerWidth,bodyOverflow:b.scrollWidth-b.clientWidth,name:a?.getAttribute('aria-label')||a?.textContent};`, [card]);
    assert.ok(geometry.overflow <= 1 && geometry.bodyOverflow <= 1);
    assert.match(geometry.name, /查找|核验/);
    await screenshot('trust-imported-narrow');
    await command('POST', '/window/rect', { width: 1200, height: 850 });
  });
  await checked('Unassigned imported history explains how to recover report access and does not silently return', async () => {
    await selectProject(null);
    await selectHistory('验收：未归属历史');
    await click('[data-action="open-artifact"]');
    await until(async () => /项目|归属/.test(await text('#desktopConversationStatus')), 'unassigned recovery guidance');
    assert.equal(await inspect('return document.querySelector("#desktop-tools").open'), false);
    assert.equal(requests.length, requestCount);
    errors.push(...await inspect('return window.__trustErrors || []'));
    assert.deepEqual(errors, []);
    await screenshot('trust-unassigned-recovery');
    await writeFile(resolve(run, 'result-trust-evidence.json'), JSON.stringify({ syntheticImport: true, actualNativeStorage: true, externalRequestsAdded: requests.length - requestCount, originalArtifactId: artifact.id, errors }, null, 2));
  });
  await checked('Imported guide cards and copied checklists retain their external source warning', async () => {
    await selectProject(projectId);
    const card = await selectHistory('验收：外部历史清单', '[data-component="guide-result"]');
    assert.doesNotMatch(await text(card), /根据本机已收录规则整理|本机规则上线清单/);
    await click('[data-action="copy-guide"]');
    await until(async () => /已复制/.test(await text('#desktopConversationStatus')), 'imported guide copied');
    // WebView2 does not grant programmatic clipboard reads. Paste the explicit
    // fixture copy through real keyboard input; never replace the clipboard API.
    const draft = await inspect('return document.querySelector("#desktopInput").value');
    await fill('#desktopInput', ''); await click('#desktopInput');
    await command('POST', '/actions', { actions: [{ type: 'key', id: 'trust-clipboard', actions: [
      { type: 'keyDown', value: '\uE009' }, { type: 'keyDown', value: 'v' },
      { type: 'keyUp', value: 'v' }, { type: 'keyUp', value: '\uE009' },
    ] }] });
    const clipboard = await until(() => inspect('const text=document.querySelector("#desktopInput").value;return /导入|外部/.test(text) ? text : null;'), 'real copied guide pasted into draft');
    assert.ok(/未.*核验/.test(clipboard), 'copied guide retains external-source verification warning');
    await fill('#desktopInput', draft);
    await screenshot('trust-imported-guide');
    assert.equal(requests.length, requestCount);
    errors.push(...await inspect('return window.__trustErrors || []'));
    assert.deepEqual(errors, []);
  });
}
