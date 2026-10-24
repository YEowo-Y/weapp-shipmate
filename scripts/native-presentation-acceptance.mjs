import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { deriveWorkflow } from '../src/workflow.mjs';

// Actual native storage and UI, with labelled temporary project files only.
// Appearance stress overrides stay in this isolated document and are restored.
export async function checkPresentationFlows({ run, checked, click, fill, press, inspect, text, command, until, screenshot, projectInvoke, projectDialog, closeProjects, selectProject, chooseOption, quit, launch, refresh, requests }) {
  const projectId = 'presentation-project';
  const directory = resolve(run, '功能呈现真实项目夹具');
  const name = '社区活动预约与信息服务小程序 · 长项目名称排版验收';
  const files = { 'app.json': '{"pages":["pages/index/index"]}', 'project.config.json': '{"appid":"touristappid","miniprogramRoot":"./"}', 'app.js': '// Labelled presentation acceptance project; not a user project.\n' };
  await mkdir(directory);
  for (const [file, content] of Object.entries(files)) await writeFile(resolve(directory, file), content);
  const snapshot = () => projectInvoke('project_snapshot');
  const workflow = () => projectInvoke('project_workflow', { projectId });
  const interactions = [], visuals = [];
  const activate = async selector => {
    await inspect('document.querySelector(arguments[0]).scrollIntoView({block:"center",inline:"nearest",behavior:"instant"})', [selector]);
    let shape;
    await until(async () => {
      shape = await inspect(`const node=document.querySelector(arguments[0]),r=node.getBoundingClientRect(),hit=document.elementFromPoint((r.left+r.right)/2,(r.top+r.bottom)/2);
        return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,visible:node.checkVisibility()&&!node.disabled&&r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight&&(hit===node||node.contains(hit))};`, [selector]);
      return shape.visible;
    }, `visible enabled click target ${selector}`, 5000);
    interactions.push({ selector, ...shape });
    await writeFile(resolve(run, 'presentation-interactions.json'), JSON.stringify(interactions, null, 2));
    await click(selector);
  };
  const close = async selector => { await press('\uE00C'); await until(() => inspect('return !document.querySelector(arguments[0])?.open', [selector]), `${selector} closed`); };
  const closeTools = async () => { if (await inspect('return document.querySelector("#desktop-tools").open')) await click('#desktop-tools-close'); };
  const home = async () => {
    await closeTools();
    if (!await inspect('return document.querySelector("#session-empty").checkVisibility()')) {
      await click('#desktop-more'); await click('#desktop-actions wa-dropdown-item[value="home"]');
    }
    await until(() => inspect('return document.querySelector("#session-empty").checkVisibility()'), 'home visible');
    await inspect('document.querySelector("#desktopScroll").scrollTop=0');
  };
  const openPreferences = async () => { await activate('#desktop-preferences-open'); await until(() => inspect('return document.querySelector("#desktop-preferences").open'), 'preferences open'); };
  const section = async selected => {
    assert.equal(await inspect('return document.querySelector("#desktop-preferences").dataset.section'), selected);
    for (const id of ['appearance', 'notifications', 'connections']) {
      assert.equal(await inspect('return document.querySelector(arguments[0]).checkVisibility()', [`#preferences-${id}`]), id === selected, `${id} visibility follows the selected settings section`);
      assert.equal(await inspect('return document.querySelector(arguments[0]).getAttribute("aria-current")', [`#preferences-nav-${id}`]), id === selected ? 'page' : null);
    }
  };
  const openWorkflow = async () => {
    await home(); await activate('#home-workflow');
    await until(() => inspect('const n=document.querySelector("#desktop-workflow");return n.open&&n.getAttribute("aria-busy")!=="true"'), 'workflow ready');
  };
  const factsOpen = async () => { if (!await inspect('return document.querySelector(".workflow-facts").open')) await activate('.workflow-facts > summary'); };
  const settledWorkflow = () => until(() => inspect('return document.querySelector("#desktop-workflow").getAttribute("aria-busy")!=="true"'), 'workflow operation settled');
  const checkProjection = async () => {
    const actual = await workflow(), model = deriveWorkflow(actual);
    const rows = await inspect('return [...document.querySelectorAll("#workflow-stages > details")].map(n=>({id:n.dataset.stage,state:n.querySelector(".workflow-stage-state").textContent,number:n.querySelector(".workflow-stage-number")?.textContent}))');
    const labels = { confirmed: '人工已确认', not_applicable: '人工不适用', pending: '待确认', unknown: '事实待补充', stale: '待重检' };
    assert.equal(rows.length, model.stages.length);
    for (const [index, stage] of model.stages.entries()) {
      assert.equal(rows[index].id, stage.id); assert.equal(rows[index].state, labels[stage.status]);
      assert.equal(Number(rows[index].number), index + 1, 'numbered stages preserve the actual catalog order');
    }
    const confirmed = model.stages.filter(stage => stage.status === 'confirmed').length;
    const notApplicable = model.stages.filter(stage => stage.status === 'not_applicable').length;
    assert.equal(await text('#workflow-overview'), `${model.stages.length} 个阶段 · 人工确认 ${confirmed} · 不适用 ${notApplicable} · 待处理 ${model.stages.length - confirmed - notApplicable}`, 'overview counts actual projected manual states, not a fabricated completion rate');
    if (model.nextAction) assert.ok((await text('#workflow-next')).includes(model.nextAction.title));
    assert.match(await text('#workflow-description'), /人工确认.*不代表.*官方/);
    return { actual, model };
  };
  const geometry = async (label, selector) => {
    const value = await inspect(`const root=document.querySelector(arguments[0]),modal=root.tagName==='DIALOG';
      const rect=node=>{const r=node.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
      const visible=node=>node.checkVisibility();
      const blocks=[...root.querySelectorAll('h1,h2,h3,h4,p,li,legend,summary,label,small')].filter(visible);
      const clipped=blocks.filter(n=>{const c=getComputedStyle(n);return (/^(hidden|clip)$/.test(c.overflowX)&&n.scrollWidth>n.clientWidth+1)||(/^(hidden|clip)$/.test(c.overflowY)&&n.scrollHeight>n.clientHeight+1);}).map(n=>({tag:n.tagName,id:n.id,text:n.textContent.slice(0,100)}));
      const scrollContainers=[root,...root.querySelectorAll('.context-body,.session-workspace-dialog__body,.workflow-stage,.preferences-section,.preferences-field')].filter(visible);
      return {viewport:{width:innerWidth,height:innerHeight},root:rect(root),modal,theme:document.body.dataset.theme,
        pageOverflow:document.documentElement.scrollWidth-innerWidth,rootOverflow:root.scrollWidth-root.clientWidth,
        contentOverflow:scrollContainers.map(n=>({id:n.id,className:n.className,value:n.scrollWidth-n.clientWidth})),clipped,
        scrollBodies:[...root.querySelectorAll('.context-body,.session-workspace-dialog__body')].filter(visible).map(n=>({id:n.id,...rect(n)})),
        actionBoxes:root.id==='desktop-workflow'?[...root.querySelectorAll('wa-button')].filter(visible).map(n=>({id:n.id,...rect(n)})):[],
        wideElements:[...root.querySelectorAll('*')].filter(visible).filter(n=>{const r=n.getBoundingClientRect(),p=root.getBoundingClientRect();return r.left<p.left-1||r.right>p.right+1;}).map(n=>({tag:n.tagName,id:n.id,className:typeof n.className==='string'?n.className:'',...rect(n)})),
        headings:[...root.querySelectorAll('h1,h2,h3,h4')].filter(visible).map(n=>({text:n.textContent,fontSize:getComputedStyle(n).fontSize})),
        close:modal?rect(root.querySelector('header wa-button,header button')):null};`, [selector]);
    visuals.push({ label, ...value }); await writeFile(resolve(run, 'presentation-visuals.json'), JSON.stringify(visuals, null, 2));
    await screenshot(`presentation-${label}`);
    assert.ok(value.pageOverflow <= 1, `${label}: page horizontally overflows ${value.pageOverflow}px`);
    assert.ok(value.rootOverflow <= 1, `${label}: surface horizontally overflows ${value.rootOverflow}px`);
    for (const container of value.contentOverflow) assert.ok(container.value <= 1, `${label}: content horizontally overflows ${JSON.stringify(container)}`);
    assert.deepEqual(value.clipped, [], `${label}: readable text must not be clipped`);
    for (const action of value.actionBoxes) assert.ok(action.height >= (value.viewport.width <= 640 ? 44 : 34), `${label}: workflow action retains a usable target ${JSON.stringify(action)}`);
    assert.ok(value.root.left >= -1 && value.root.right <= value.viewport.width + 1, `${label}: surface must fit horizontally`);
    if (value.modal) {
      assert.ok(value.root.top >= -1 && value.root.bottom <= value.viewport.height + 1, `${label}: modal fits viewport`);
      assert.ok(value.close.top >= 0 && value.close.bottom <= value.viewport.height && value.close.left >= 0 && value.close.right <= value.viewport.width, `${label}: modal close action stays reachable`);
      for (const body of value.scrollBodies) assert.ok(body.height >= 80 && body.top >= 0 && body.bottom <= value.viewport.height, `${label}: scrollable reading area remains visible ${JSON.stringify(body)}`);
    }
  };
  const appearance = async theme => {
    await openPreferences(); await activate(`label:has(#desktop-theme-${theme})`);
    await activate('label:has(#desktop-message-size-18)'); await activate('label:has(#desktop-motion-reduce)');
    assert.match(await text('#preferences-status'), /保存/);
    await activate('#preferences-done');
    assert.equal(await inspect('return document.body.dataset.theme'), theme);
  };
  const clearStress = () => inspect('document.querySelector("#presentation-spacing-override")?.remove(); for(const [node,style] of window.__presentationTextStyles||[]){if(style===null)node.removeAttribute("style");else node.setAttribute("style",style);}delete window.__presentationTextStyles;');
  const stress = async selector => {
    await clearStress();
    await inspect(`const root=document.querySelector(arguments[0]),nodes=[root,...root.querySelectorAll('*')].filter(n=>n.namespaceURI==='http://www.w3.org/1999/xhtml');
      const sizes=nodes.map(n=>parseFloat(getComputedStyle(n).fontSize));window.__presentationTextStyles=nodes.map(n=>[n,n.getAttribute('style')]);
      nodes.forEach((n,i)=>n.style.setProperty('font-size',sizes[i]*2+'px','important'));
      const style=document.createElement('style');style.id='presentation-spacing-override';style.textContent=arguments[0]+','+arguments[0]+' *{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}'+arguments[0]+' p{margin-block-end:2em!important}';document.head.append(style);`, [selector]);
  };

  await checked('Home presents a truthful empty workspace and preparation entries do not run tools', async () => {
    await command('POST', '/window/rect', { width: 1200, height: 900 }); await home();
    const before = await snapshot(); assert.equal(before.projects.length, 0); assert.equal(before.runs.length, 0); assert.equal(before.artifacts.length, 0);
    assert.equal(await inspect('return document.querySelector("#home-report").disabled'), true);
    assert.match(await text('#home-project-summary'), /选择|创建|添加|保存/);
    await activate('#start-check'); await until(() => inspect('return document.querySelector("#desktop-tools").open'), 'check configuration opens');
    await until(() => inspect('return document.activeElement.id==="pick-btn"'), 'empty project focuses folder selection'); await closeTools();
    await activate('#start-guide'); await until(() => inspect('return document.querySelector("#desktop-tools").open'), 'guide configuration opens');
    await until(() => inspect('return document.activeElement.id==="subject"'), 'guide preparation focuses subject'); await closeTools();
    await openWorkflow(); assert.match(await text('#workflow-status'), /先.*项目|选择.*项目/); await close('#desktop-workflow');
    assert.equal((await snapshot()).runs.length, 0); await geometry('empty-home', '#session-empty');
  });
  await checked('A single persistent settings entry opens one readable section and remains reachable on narrow screens', async () => {
    assert.equal(await inspect('return document.querySelectorAll("#desktop-preferences-open").length'), 1);
    assert.equal(await inspect('return document.querySelectorAll("#desktop-model-settings,#desktop-data-settings,#home-models,#home-preferences").length'), 0);
    assert.equal(await text('#desktop-preferences-open'), '设置');
    assert.equal(await inspect('return document.querySelector("#desktop-preferences-open").closest("#desktop-navigation")'), null);
    await command('POST', '/window/rect', { width: 320, height: 844 });
    if (await inspect('return document.querySelector("#desktop-navigation").open')) await activate('#desktop-navigation > summary');
    assert.equal(await inspect('const r=document.querySelector("#desktop-preferences-open").getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight'), true);
    await openPreferences(); await section('appearance');
    assert.equal(await text('#preferences-heading'), '设置');
    for (const selected of ['notifications', 'connections', 'appearance']) {
      await activate(`#preferences-nav-${selected}`); await section(selected);
      await geometry(`settings-section-${selected}-320`, '#desktop-preferences');
    }
    await close('#desktop-preferences'); assert.equal(await inspect('return document.activeElement.id'), 'desktop-preferences-open');
    await openPreferences(); await section('appearance'); await close('#desktop-preferences');
    await command('POST', '/window/rect', { width: 1200, height: 900 });
  });
  await checked('Missing model and quick picker management lead to settings without losing the draft or connecting automatically', async () => {
    const draft = '设置入口验收草稿，不发送到任何模型';
    await fill('#desktopInput', draft); await activate('#desktopSend');
    await until(() => inspect('return document.querySelector("#desktop-preferences").open'), 'missing model opens settings');
    await section('connections');
    assert.equal(await inspect('return document.querySelector("#desktop-model-dialog").open'), false);
    assert.equal(await inspect('return document.querySelector("#desktopInput").value'), draft);
    await close('#desktop-preferences');
    await activate('#desktopComposer .agent-composer__model');
    await until(() => inspect('return document.querySelector("#desktop-model-picker").matches(":popover-open")'), 'model picker visible');
    await activate('.desktop-picker-manage');
    await until(() => inspect('return document.querySelector("#desktop-preferences").open'), 'picker management opens settings');
    await section('connections');
    assert.equal(await inspect('return document.querySelector("#desktop-model-picker").matches(":popover-open")'), false);
    assert.equal(await inspect('return document.querySelector("#desktop-model-dialog").open'), false);
    assert.equal(await inspect('return document.querySelector("#desktopInput").value'), draft);
    await activate('#preferences-models');
    await until(() => inspect('return document.querySelector("#desktop-model-dialog").open && !document.querySelector("#desktop-preferences").open'), 'explicit model settings handoff');
    await close('#desktop-model-dialog'); assert.equal(await inspect('return document.activeElement.matches("#desktopComposer .agent-composer__model")'), true, 'picker-origin settings return focus to the original model picker');
    await fill('#desktopInput', ''); assert.deepEqual(requests, []);
  });
  await checked('Home project context comes from real saved storage and routes to the existing manager', async () => {
    await projectInvoke('project_save', { project: { id: projectId, name, directory, subject: 'personal' } });
    await projectDialog(); await click('#project-retry');
    await until(() => inspect('return document.querySelector("#desktop-project-select").options.length===2&&!document.querySelector("#project-retry").disabled'), 'project fixture registered');
    await closeProjects(); await selectProject(projectId); await home();
    assert.equal(await text('#home-project-name'), name); assert.match(await text('#home-project-summary'), /个人/);
    await activate('#home-project-manage'); await until(() => inspect('return document.querySelector("#desktop-projects").open'), 'home project manager'); await closeProjects();
    await activate('#start-check'); await until(() => inspect('return document.activeElement.id==="check-btn"'), 'saved project focuses explicit run action'); await closeTools();
    assert.equal((await snapshot()).runs.length, 0); await geometry('project-home', '#session-empty');
  });
  await checked('Home secondary entries reach real features without executing work or contacting models', async () => {
    for (const [entry, dialog] of [['#start-explain', '#desktop-explain'], ['#home-health', '#desktop-health'], ['#home-memory', '#desktop-memory'], ['#home-sources', '#desktop-source-freshness']]) {
      await home(); await activate(entry); await until(() => inspect('return document.querySelector(arguments[0])?.open', [dialog]), `${entry} opens ${dialog}`);
      await close(dialog); assert.equal(await inspect('return document.activeElement.checkVisibility()'), true, `${entry} returns to visible focus`);
    }
    assert.equal((await snapshot()).runs.length, 0); assert.deepEqual(requests, []);
  });
  await checked('Workflow overview, numbered stages and next action reflect the real catalog', async () => {
    await openWorkflow(); const { model } = await checkProjection(); assert.equal(model.stages.length, 8);
    assert.equal(await inspect('return document.querySelector("#workflow-hasPayment").value'), 'unknown');
    assert.equal(await inspect('return document.querySelector("#workflow-confirm-privacy").disabled'), true);
    await activate('#workflow-next-open');
    assert.equal(await inspect('return document.activeElement.id'), `workflow-stage-${model.nextAction.stageId}`);
    assert.equal(await inspect('return document.querySelector(arguments[0]).open', [`details[data-stage="${model.nextAction.stageId}"]`]), true);
    await screenshot('presentation-workflow-next');
  });
  await checked('Unsaved workflow facts and notes survive refresh and reopening without being saved implicitly', async () => {
    await activate('#workflow-facts-open'); assert.equal(await inspect('return document.activeElement.id'), 'workflow-businessType');
    await fill('#workflow-businessType', '未保存的社区服务草稿');
    const { model } = await checkProjection(), stageId = model.nextAction.stageId;
    const row = `details[data-stage="${stageId}"]`;
    if (!await inspect('return document.querySelector(arguments[0]).open', [row])) await activate(`${row} > summary`);
    await fill(`#workflow-note-${stageId}`, '本次尚未提交的核对备注');
    await activate('#workflow-retry'); await settledWorkflow();
    assert.equal(await inspect('return document.querySelector("#workflow-businessType").value'), '未保存的社区服务草稿');
    assert.equal(await inspect('return document.querySelector(arguments[0]).value', [`#workflow-note-${stageId}`]), '本次尚未提交的核对备注');
    await close('#desktop-workflow'); await openWorkflow();
    assert.equal(await inspect('return document.querySelector("#workflow-businessType").value'), '未保存的社区服务草稿');
    assert.equal(await inspect('return document.querySelector(arguments[0]).value', [`#workflow-note-${stageId}`]), '本次尚未提交的核对备注');
    const stored = await workflow(); assert.equal(stored.project.facts.businessType, ''); assert.equal(stored.confirmations.length, 0);
  });
  await checked('Concurrent saved facts cannot be silently overwritten by stale local facts or stage notes', async () => {
    const before = await workflow(), stageId = deriveWorkflow(before).nextAction.stageId;
    const remoteFacts = { businessType: '另一处已保存的社区服务事实', hasPayment: true, collectsSensitive: false, hasServerDomain: false };
    // Write through real native IPC outside this form, like another trusted editor.
    // No invoke replacement or database fixture patching is used.
    await projectInvoke('project_facts_save', { projectId, expectedRevision: before.project.revision, facts: remoteFacts });
    const remote = await workflow(); assert.ok(remote.project.revision > before.project.revision);
    await activate('#workflow-retry'); await settledWorkflow();
    assert.equal(await inspect('return document.querySelector("#workflow-businessType").value'), '未保存的社区服务草稿', 'refresh keeps the local draft for recovery');
    assert.equal(await inspect('return document.querySelector(arguments[0]).value', [`#workflow-note-${stageId}`]), '本次尚未提交的核对备注');
    assert.equal(await inspect('return document.querySelector("#workflow-save-facts").disabled'), true, 'stale facts cannot be submitted on the refreshed revision');
    assert.equal(await inspect('return document.querySelector(arguments[0]).disabled', [`#workflow-confirm-${stageId}`]), true, 'stale note cannot be confirmed against new facts');
    assert.equal(await inspect('return document.querySelector("#workflow-facts-conflict").checkVisibility()'), true);
    assert.ok((await text('#workflow-facts-conflict')).includes(remoteFacts.businessType), 'recovery exposes the latest saved context');
    assert.match(await text(`#workflow-note-hint-${stageId}`), /变化|变更|更新|过期|改变/);
    await factsOpen(); await geometry('workflow-concurrent-draft', '#desktop-workflow');
    // The disabled control is clicked through WebDriver, not synthetic DOM submission.
    // It must remain inert even though the form's loaded revision is newer.
    await click('#workflow-save-facts');
    const unchanged = await workflow(); assert.deepEqual(unchanged.project.facts, remoteFacts); assert.equal(unchanged.project.revision, remote.project.revision); assert.deepEqual(unchanged.confirmations, before.confirmations);
    await activate('#workflow-facts-discard');
    assert.equal(await inspect('return document.querySelector("#workflow-businessType").value'), remoteFacts.businessType);
    assert.equal(await inspect('return document.querySelector("#workflow-hasPayment").value'), 'true');
    assert.equal(await inspect('return document.querySelector("#workflow-facts-conflict").checkVisibility()'), false);
    const row = `details[data-stage="${stageId}"]`;
    if (!await inspect('return document.querySelector(arguments[0]).open', [row])) await activate(`${row} > summary`);
    await activate(`#workflow-note-discard-${stageId}`);
    assert.equal(await inspect('return document.querySelector(arguments[0]).value', [`#workflow-note-${stageId}`]), '');
    const afterDiscard = await workflow(); assert.deepEqual(afterDiscard.project.facts, remoteFacts); assert.equal(afterDiscard.project.revision, remote.project.revision); assert.deepEqual(afterDiscard.confirmations, before.confirmations);
    await writeFile(resolve(run, 'presentation-concurrent-draft.json'), JSON.stringify({ fixture: 'Actual project_facts_save IPC outside the open form; no mock or direct database mutation.', projectId, beforeRevision: before.project.revision, remoteRevision: remote.project.revision, afterDiscardRevision: afterDiscard.project.revision, factsRetainedAfterDisabledClick: unchanged.project.facts, confirmationsUnchanged: true, explicitLocalDiscardOnly: true }, null, 2));
  });
  await checked('Explicit facts save distinguishes false and unknown; manual stage confirmation is persisted', async () => {
    await factsOpen(); await fill('#workflow-businessType', '社区活动预约和信息展示，不涉及在线支付。');
    await chooseOption('#workflow-hasPayment', 'false'); await chooseOption('#workflow-collectsSensitive', 'unknown'); await chooseOption('#workflow-hasServerDomain', 'true');
    await activate('#workflow-save-facts'); await settledWorkflow();
    const { actual, model } = await checkProjection(); assert.equal(actual.project.facts.hasPayment, false); assert.equal(actual.project.facts.collectsSensitive, null); assert.equal(actual.project.facts.hasServerDomain, true);
    const stageId = model.nextAction.stageId, row = `details[data-stage="${stageId}"]`;
    if (!await inspect('return document.querySelector(arguments[0]).open', [row])) await activate(`${row} > summary`);
    if (await inspect('return document.querySelector(arguments[0])?.checkVisibility() ?? false', [`#workflow-note-discard-${stageId}`])) await activate(`#workflow-note-discard-${stageId}`);
    await fill(`#workflow-note-${stageId}`, '验收人员人工核对记录，不代表官方审批。'); await activate(`#workflow-confirm-${stageId}`); await settledWorkflow();
    const saved = await workflow(); assert.ok(saved.confirmations.some(item => item.stageId === stageId && item.state === 'confirmed'));
    await checkProjection(); await screenshot('presentation-workflow-confirmed'); await close('#desktop-workflow');
  });
  await checked('Preferences use labelled native selection groups and immediately persist appearance', async () => {
    await openPreferences();
    assert.equal(await inspect('return [...document.querySelectorAll("#desktop-preferences input[type=radio]")].every(n=>n.closest("fieldset")?.querySelector("legend")?.textContent && n.labels.length>0)'), true);
    await activate('label:has(#desktop-theme-dark)'); await activate('label:has(#desktop-message-size-18)'); await activate('label:has(#desktop-motion-reduce)');
    assert.equal(await inspect('return document.body.dataset.theme'), 'dark'); assert.equal(await inspect('return document.body.dataset.motion'), 'reduce');
    assert.equal(await inspect('return getComputedStyle(document.querySelector(".preferences-sample")).fontSize'), '18px');
    assert.match(await text('#preferences-status'), /保存/);
    assert.equal(await inspect('return document.querySelector("#system-notifications-enabled").checked'), false, 'viewing settings never enables system notifications');
    for (const [nav, target] of [['#preferences-nav-notifications', 'preferences-notifications'], ['#preferences-nav-connections', 'preferences-links-heading'], ['#preferences-nav-appearance', 'preferences-appearance-title']]) {
      await activate(nav); await section(nav.replace('#preferences-nav-', '')); assert.equal(await inspect('return document.activeElement.id'), target, 'section navigation focuses its readable destination');
    }
    await activate('#preferences-done'); assert.equal(await inspect('return document.activeElement.id'), 'desktop-preferences-open');
    await openPreferences(); assert.equal(await inspect('return document.querySelector("#preferences-body").scrollTop'), 0, 'reopening settings starts at its overview'); await close('#desktop-preferences');
  });
  await checked('Manual progress and actual appearance survive WebView refresh and process restart', async () => {
    const before = await workflow(); await refresh(); await home();
    assert.equal(await inspect('return document.body.dataset.theme'), 'dark');
    await quit(); await launch(); await home();
    const after = await workflow(); assert.deepEqual(after.project.facts, before.project.facts); assert.deepEqual(after.confirmations, before.confirmations);
    assert.equal(await text('#home-project-name'), name);
    await openWorkflow(); await checkProjection(); await close('#desktop-workflow');
    await openPreferences();
    assert.equal(await inspect('return document.querySelector("#desktop-theme-dark").checked && document.querySelector("#desktop-message-size-18").checked && document.querySelector("#desktop-motion-reduce").checked'), true);
    await close('#desktop-preferences'); assert.equal((await snapshot()).runs.length, 0);
  });
  await checked('Settings destinations replace the modal and return keyboard focus to the persistent settings entry', async () => {
    for (const [entry, dialog] of [['#preferences-models', '#desktop-model-dialog'], ['#preferences-data', 'dialog[data-kind="data"]'], ['#preferences-maintenance', '#desktop-health'], ['#preferences-sources', '#desktop-source-freshness'], ['#preferences-projects', '#desktop-projects']]) {
      await openPreferences(); await activate('#preferences-nav-connections'); await activate(entry);
      await until(() => inspect('return !document.querySelector("#desktop-preferences").open && document.querySelector(arguments[0])?.open', [dialog]), `${entry} modal handoff`);
      await close(dialog); assert.equal(await inspect('return document.activeElement.id'), 'desktop-preferences-open'); assert.equal(await inspect('return document.activeElement.checkVisibility()'), true, `${entry} returns visible keyboard focus`);
      assert.equal(await inspect('return document.querySelectorAll("dialog:modal").length'), 0);
    }
    assert.deepEqual(requests, []);
  });
  await checked('Malformed appearance storage has explicit recovery without deleting project progress', async () => {
    const before = await workflow();
    await inspect('localStorage.setItem("shipmate-desktop-preferences","{invalid acceptance fixture")'); await refresh(); await openPreferences();
    assert.match(await text('#preferences-status'), /损坏|不受支持/); assert.equal(await inspect('return document.querySelector("#preferences-retry").checkVisibility()'), true);
    await geometry('preferences-error-recovery', '#desktop-preferences');
    await activate('#preferences-reset'); assert.match(await text('#preferences-status'), /恢复.*默认/);
    assert.equal(await inspect('return document.querySelector("#desktop-theme-system").checked && document.querySelector("#desktop-message-size-16").checked && document.querySelector("#desktop-motion-system").checked'), true);
    await close('#desktop-preferences'); const after = await workflow(); assert.deepEqual(after.project.facts, before.project.facts); assert.deepEqual(after.confirmations, before.confirmations);
  });
  for (const theme of ['light', 'dark']) {
    await checked(`Home, workflow and settings reflow at 320/390/1000/1440px in ${theme} theme`, async () => {
      await command('POST', '/window/rect', { width: 1200, height: 1000 }); await appearance(theme);
      for (const width of [320, 390, 1000, 1440]) {
        await command('POST', '/window/rect', { width, height: 1000 }); await home(); await geometry(`${theme}-${width}-home`, '#session-empty');
        await openWorkflow(); await geometry(`${theme}-${width}-workflow`, '#desktop-workflow'); await activate('#workflow-next-open'); await close('#desktop-workflow');
        await openPreferences();
        for (const selected of ['appearance', 'notifications', 'connections']) {
          await activate(`#preferences-nav-${selected}`); await section(selected);
          await geometry(`${theme}-${width}-preferences-${selected}`, '#desktop-preferences');
        }
        await inspect('document.querySelector("#preferences-dismiss").focus()'); await press('\uE004');
        assert.equal(await inspect('return document.querySelector("#desktop-preferences").contains(document.activeElement)'), true, 'keyboard remains inside the modal');
        await close('#desktop-preferences'); assert.equal(await inspect('return document.activeElement.checkVisibility()'), true);
      }
    });
  }
  await checked('Reading surfaces tolerate 200% text and user spacing without clipped content', async () => {
    for (const width of [320, 1000]) {
      await command('POST', '/window/rect', { width, height: 1000 }); await home();
      try { await stress('#session-empty'); await geometry(`stress-${width}-home`, '#session-empty'); } finally { await clearStress(); }
      await openWorkflow();
      try { await stress('#desktop-workflow'); await geometry(`stress-${width}-workflow`, '#desktop-workflow'); await activate('#workflow-next-open'); } finally { await clearStress(); }
      await close('#desktop-workflow'); await openPreferences();
      try { await stress('#desktop-preferences'); await geometry(`stress-${width}-preferences`, '#desktop-preferences'); } finally { await clearStress(); }
      await close('#desktop-preferences');
    }
  });
  await checked('Presentation navigation never changes source files, creates reports or submits model requests', async () => {
    const final = await snapshot(); assert.equal(final.runs.length, 0); assert.equal(final.artifacts.length, 0); assert.deepEqual(requests, []);
    assert.deepEqual((await readdir(directory)).sort(), Object.keys(files).sort());
    for (const [file, content] of Object.entries(files)) assert.equal(await readFile(resolve(directory, file), 'utf8'), content);
    const actual = await workflow();
    await writeFile(resolve(run, 'presentation-evidence.json'), JSON.stringify({ projectId, fileNames: Object.keys(files), projectFacts: actual.project.facts, confirmations: actual.confirmations, runCount: final.runs.length, artifactCount: final.artifacts.length, modelRequestCount: requests.length, fixture: 'Real native storage and manual UI actions; temporary labelled files; no invoke mocks, tool execution, OS browser or installed-release validation.' }, null, 2));
  });
}
