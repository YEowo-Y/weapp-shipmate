import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { deriveWorkflow } from '../src/workflow.mjs';
import { checkSettingsWorkspaceFlows } from './native-settings-acceptance.mjs';

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
        return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,visible:node.checkVisibility()&&!node.disabled&&r.left>=-1&&r.right<=innerWidth+1&&r.top>=-1&&r.bottom<=innerHeight+1&&(hit===node||node.contains(hit))};`, [selector]);
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
  const openPreferences = async () => { await activate('#desktop-preferences-open'); await until(() => inspect('return document.querySelector("#desktop-preferences").open && Boolean(document.querySelector("#preferences-body"))'), 'preferences ready'); };
  const sections = {
    appearance: ['外观与阅读', '#preferences-appearance'], notifications: ['通知', '.system-notifications'],
    shortcuts: ['快捷键', '#settings-send-key'], models: ['模型与连接', '.desktop-model-panel'],
    projects: ['项目配置', '.project-settings-panel'], data: ['数据与会话', '.session-workspace-data-panel'],
    privacy: ['隐私与权限', '#settings-permissions'], about: ['关于', '#settings-versions'],
  };
  const section = async selected => {
    await until(() => inspect('const root=document.querySelector("#desktop-preferences"),panel=root.querySelector(arguments[1]);return root.dataset.section===arguments[0]&&!root.querySelector(".preferences-loading,.settings-loading")&&panel?.checkVisibility()', [selected, sections[selected][1]]), `settings section ${selected} ready`);
    assert.equal(await text('#preferences-section-title'), sections[selected][0]);
    for (const id of Object.keys(sections)) {
      assert.equal(await inspect('return document.querySelector(arguments[0]).getAttribute("aria-current")', [`#preferences-nav-${id}`]), id === selected ? 'page' : null);
    }
    assert.equal(await inspect('return document.querySelector("#desktop-model-dialog").open'), false, 'model controls stay inside the settings workspace');
  };
  const navigate = async selected => {
    if (!await inspect('return document.querySelector(arguments[0]).checkVisibility()', [`#preferences-nav-${selected}`])) await activate('#preferences-categories');
    await activate(`#preferences-nav-${selected}`); await section(selected);
  };
  const openWorkflow = async () => {
    await home(); await activate('#desktop-workflow-open');
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
      const blocks=[...root.querySelectorAll('h1,h2,h3,h4,p,li,legend,summary,label,small')].filter(visible).filter(n=>!n.classList.contains('preferences-sr-only'));
      const clipped=blocks.filter(n=>{const c=getComputedStyle(n);return (/^(hidden|clip)$/.test(c.overflowX)&&n.scrollWidth>n.clientWidth+1)||(/^(hidden|clip)$/.test(c.overflowY)&&n.scrollHeight>n.clientHeight+1);}).map(n=>({tag:n.tagName,id:n.id,text:n.textContent.slice(0,100)}));
      const scrollContainers=[root,...root.querySelectorAll('.context-body,.session-workspace-dialog__body,.workflow-stage,.preferences-section,.preferences-field,.preferences-sidebar,.preferences-main,#preferences-body')].filter(visible);
      return {viewport:{width:innerWidth,height:innerHeight},root:rect(root),modal,theme:document.body.dataset.theme,
        pageOverflow:document.documentElement.scrollWidth-innerWidth,rootOverflow:root.scrollWidth-root.clientWidth,
        contentOverflow:scrollContainers.map(n=>({id:n.id,className:n.className,value:n.scrollWidth-n.clientWidth})),clipped,
        scrollBodies:[...root.querySelectorAll('.context-body,.session-workspace-dialog__body')].filter(visible).filter(n=>/auto|scroll/.test(getComputedStyle(n).overflowY)).map(n=>({id:n.id,...rect(n)})),
        actionBoxes:root.id==='desktop-workflow'?[...root.querySelectorAll('wa-button')].filter(visible).map(n=>({id:n.id,...rect(n)})):[],
        wideElements:[...root.querySelectorAll('*')].filter(visible).filter(n=>{const r=n.getBoundingClientRect(),p=root.getBoundingClientRect();return r.left<p.left-1||r.right>p.right+1;}).map(n=>({tag:n.tagName,id:n.id,className:typeof n.className==='string'?n.className:'',...rect(n)})),
        headings:[...root.querySelectorAll('h1,h2,h3,h4')].filter(visible).map(n=>({text:n.textContent,fontSize:getComputedStyle(n).fontSize})),
        close:modal?rect(root.querySelector(root.id==='desktop-preferences'?'#preferences-content-dismiss':'header wa-button,header button')):null};`, [selector]);
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
      assert.ok(value.close.top >= -1 && value.close.bottom <= value.viewport.height + 1 && value.close.left >= -1 && value.close.right <= value.viewport.width + 1, `${label}: modal close action stays reachable`);
      for (const body of value.scrollBodies) assert.ok(body.height >= 80 && body.top >= -1 && body.bottom <= value.viewport.height + 1, `${label}: scrollable reading area remains visible ${JSON.stringify(body)}`);
    }
  };
  const settingsWorkspace = async label => {
    const value = await inspect(`const root=document.querySelector('#desktop-preferences');
      const rect=selector=>{const n=root.querySelector(selector),r=n.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,visible:n.checkVisibility()};};
      const r=root.getBoundingClientRect();
      return {viewport:{width:innerWidth,height:innerHeight},root:{left:r.left,top:r.top,width:r.width,height:r.height},
        sidebar:rect('.preferences-sidebar'),main:rect('.preferences-main'),body:rect('#preferences-body'),
        headingSize:getComputedStyle(root.querySelector('#preferences-section-title')).fontSize,
        title:rect('#preferences-section-title'),search:rect('.preferences-search'),nav:rect('.preferences-navigation'),back:rect('#preferences-dismiss'),
        sidebarOverflow:getComputedStyle(root.querySelector('.preferences-sidebar')).overflowY,
        navOverflow:getComputedStyle(root.querySelector('.preferences-navigation')).overflowY,
        hasFooter:!!root.querySelector('.preferences-footer,#preferences-done'),
        navigation: [...root.querySelectorAll('.preferences-navigation button')].map(n=>({height:n.getBoundingClientRect().height,fontSize:getComputedStyle(n).fontSize}))};`);
    visuals.push({ label: `${label}-workspace`, ...value });
    await writeFile(resolve(run, 'presentation-visuals.json'), JSON.stringify(visuals, null, 2));
    assert.ok(Math.abs(value.root.left) <= 1 && Math.abs(value.root.top) <= 1, `${label}: settings starts at the viewport origin`);
    assert.ok(Math.abs(value.root.width - value.viewport.width) <= 1 && Math.abs(value.root.height - value.viewport.height) <= 1, `${label}: settings occupies the full workspace`);
    assert.ok(value.body.height >= 80 && value.body.top >= -1 && value.body.bottom <= value.viewport.height + 1, `${label}: content has a usable scrolling area`);
    assert.equal(value.hasFooter, false, `${label}: no permanent Done footer`);
    assert.equal(value.headingSize, '28px', `${label}: section title uses the approved desktop scale`);
    if (value.viewport.width >= 1000) {
      assert.ok(value.sidebar.width >= 240 && value.sidebar.width <= 288, `${label}: navigation retains the reference proportions`);
      assert.ok(value.sidebar.right <= value.main.left + 1 && value.main.width > value.sidebar.width, `${label}: main content sits beside the sidebar`);
      assert.ok(value.title.width <= 880 && value.title.width >= 600, `${label}: settings content retains a centered reading width`);
      assert.ok(value.title.left-value.main.left >= 31 && value.main.right-value.title.right >= 31, `${label}: content keeps side gutters`);
      assert.ok(Math.abs((value.title.left-value.main.left)-(value.main.right-value.title.right)) <= 20, `${label}: content is centered allowing for its scrollbar`);
      assert.equal(value.sidebarOverflow, 'hidden', `${label}: sidebar shell does not scroll`);
      assert.equal(value.navOverflow, 'auto', `${label}: categories scroll independently`);
      assert.ok(value.search.bottom <= value.nav.top && value.nav.bottom <= value.back.top, `${label}: search and return action stay outside category scrolling`);
      assert.ok(value.navigation.every(row=>row.height>=36&&row.fontSize==='14px'), `${label}: navigation uses readable 14px labels and 36px targets`);
    } else if (value.viewport.width < 800) {
      assert.equal(value.sidebar.visible, false, `${label}: category navigation yields to the detail page`);
      assert.equal(value.main.visible, true, `${label}: narrow detail is visible`);
    }
  };
  const settingsLayout = async (label, selected) => {
    const value = await inspect(`const rect=n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width};};
      const rows=[...document.querySelectorAll('.preferences-field-row')].filter(n=>n.checkVisibility()).map(n=>({copy:rect(n.firstElementChild),control:rect(n.lastElementChild)}));
      const shells=[...document.querySelectorAll('.preferences-dialog .desktop-model-layout,.preferences-dialog .project-backup-settings-panel,.preferences-dialog .project-backup-settings-panel > .project-backup')].filter(n=>n.checkVisibility()).map(n=>({className:n.className,border:getComputedStyle(n).borderTopWidth,padding:getComputedStyle(n).paddingTop}));
      const fields=['project-name','project-directory','desktop-provider-key'].map(id=>document.getElementById(id)).filter(n=>n?.checkVisibility()).map(n=>{const label=document.querySelector('label[for="'+n.id+'"]');return {id:n.id,input:rect(n),label:label?rect(label):null};});
      return {width:innerWidth,rows,shells,fields};`);
    visuals.push({label:label+'-layout',...value});
    await writeFile(resolve(run, 'presentation-visuals.json'), JSON.stringify(visuals, null, 2));
    if (selected === 'appearance') {
      assert.equal(value.rows.length, 3);
      if (value.width >= 1000) {
        for (const row of value.rows) {
          assert.ok(row.control.left >= row.copy.right + 20, label+': controls sit beside their labels');
          assert.ok(Math.abs((row.control.top+row.control.bottom)-(row.copy.top+row.copy.bottom)) < 3, label+': setting row is vertically aligned');
          assert.ok(Math.abs(row.control.right-value.rows[0].control.right) < 2, label+': controls share a right edge');
        }
      } else if (value.width <= 390) {
        for (const row of value.rows) assert.ok(row.control.top >= row.copy.bottom + 12, label+': narrow controls follow their labels without overlap');
      }
    }
    for (const shell of value.shells) assert.equal(shell.border, '0px', label+': no redundant outer border on '+shell.className);
    if (selected === 'models') {
      assert.ok(value.fields.some(field => field.id === 'desktop-provider-key'), label+': model credential field is inspected');
      const border = await inspect(`const s=getComputedStyle(document.querySelector('.desktop-provider-picker'));return {right:s.borderRightWidth,bottom:s.borderBottomWidth};`);
      assert.equal(parseFloat(border.right) > 0, value.width > 1100, label+': provider divider follows layout direction');
      if (value.width <= 1100) assert.ok(parseFloat(border.bottom) > 0 && parseFloat(border.bottom) <= 1, label+': stacked provider list has one horizontal hairline');
    }
    if (selected === 'projects') {
      assert.equal(value.fields.length, 2, label+': project name and directory fields are inspected');
      assert.equal(await inspect("return parseFloat(getComputedStyle(document.querySelector('#project-form')).borderTopWidth)>0"), true, label+': project form has one grouped card');
    }
    const rowControls = { models: ['desktop-provider-refresh', 'desktop-provider-verify'], notifications: ['system-notifications-reload', 'system-notifications-test', 'system-notifications-project'], projects: ['project-open-data', 'project-open-results', 'maintenance-retry'], appearance: ['preferences-reset'], privacy: ['settings-revoke'] }[selected] || [];
    const groupedRows = await inspect(`const rect=n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};};return arguments[0].map(id=>document.getElementById(id)).filter(n=>n?.checkVisibility()).map(control=>{const row=control.closest('.settings-row');return {id:control.id,copy:rect(row.firstElementChild),control:rect(control),row:rect(row)};});`, [rowControls]);
    if (selected !== 'models') assert.deepEqual(groupedRows.map(row=>row.id), rowControls, label+': required row actions remain visible');
    for (const row of groupedRows) {
      assert.ok(row.control.right <= row.row.right + 1 && row.control.left >= row.row.left - 1, label+': action fits grouped row '+row.id);
      if (value.width >= 1000) assert.ok(row.control.left >= row.copy.right + 12, label+': action follows copy on the same row '+row.id);
      else if (value.width <= 390) assert.ok(row.control.top >= row.copy.bottom + 10, label+': narrow action follows copy '+row.id);
    }
    if (selected === 'models') {
      const fieldsPadded = await inspect("return [...document.querySelectorAll('.desktop-credentials-card .desktop-model-form-field')].filter(n=>n.checkVisibility()).every(n=>parseFloat(getComputedStyle(n).paddingTop)>=16&&parseFloat(getComputedStyle(n).paddingBottom)>=16)");
      assert.equal(fieldsPadded, true, label+': credential fields have readable spacing inside their card');
    }
    if (selected === 'notifications' && value.width === 320) {
      const longErrorFits = await inspect(`const node=document.querySelector('#system-notifications-last-attempt'),original=node.textContent,row=node.closest('.settings-row'),hidden=row.hidden;try { row.hidden=false;node.textContent='发送失败：'+'x'.repeat(240);const box=node.parentElement.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(node);return range.getClientRects().length>0&&[...range.getClientRects()].every(r=>r.left>=box.left-1&&r.right<=box.right+1); } finally { node.textContent=original;row.hidden=hidden; }`);
      assert.equal(longErrorFits, true, label+': long notification errors wrap inside their row');
    }
    if (selected === 'data') {
      const dataRows = await inspect(`const rect=n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};};return ['project-export','project-import','project-storage-refresh','project-archive','settings-archives'].map(id=>{const control=document.getElementById(id),row=control.closest('.settings-row');return {id,copy:rect(row.firstElementChild),control:rect(control),row:rect(row)};});`);
      if (value.width === 320) {
        const longErrorFits = await inspect(`const node=document.querySelector('#project-storage-status'),original=node.textContent;try { node.textContent='容量读取失败：'+ 'C:/'+'x'.repeat(240)+'。可以重新读取。';const copy=node.parentElement,box=copy.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(node);return [...range.getClientRects()].every(r=>r.left>=box.left-1&&r.right<=box.right+1); } finally { node.textContent=original; }`);
        assert.equal(longErrorFits, true, label+': long capacity errors wrap inside the narrow card');
      }
      visuals.push({label:label+'-data-rows',rows:dataRows});
      await writeFile(resolve(run, 'presentation-visuals.json'), JSON.stringify(visuals, null, 2));
      for (const row of dataRows) {
        assert.ok(row.control.right <= row.row.right + 1, label+': data action fits its card '+row.id);
        if (value.width >= 1000) assert.ok(row.control.left >= row.copy.right + 12, label+': data action follows its description on the same row '+row.id);
        else if (value.width <= 390) assert.ok(row.control.top >= row.copy.bottom + 10, label+': narrow data action follows its description '+row.id);
      }
    }
    for (const field of value.fields) {
      assert.ok(field.label, label+': complex input retains its visible label');
      assert.ok(field.input.top >= field.label.bottom - 1, label+': complex form keeps label above input');
    }
  };
  const appearance = async theme => {
    await openPreferences(); await activate(`#desktop-theme-${theme}`);
    await activate('#desktop-message-size-18'); await activate('#desktop-motion-reduce');
    assert.match(await text('#preferences-status'), /保存/);
    await activate('#preferences-content-dismiss');
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
    assert.equal(await inspect('return document.querySelector("#desktop-preferences-open").getAttribute("aria-label")'), '设置');
    assert.equal(await inspect('return document.querySelector("#desktop-preferences-open").closest("#desktop-navigation")'), null);
    await command('POST', '/window/rect', { width: 320, height: 844 });
    if (await inspect('return document.querySelector("#desktop-navigation").open')) await activate('#desktop-navigation > summary');
    assert.equal(await inspect('const r=document.querySelector("#desktop-preferences-open").getBoundingClientRect();return r.left>=-1&&r.right<=innerWidth+1&&r.top>=-1&&r.bottom<=innerHeight+1'), true);
    const rendererRequests = () => inspect(`return performance.getEntriesByType('resource')
      .filter(entry => /\\/assets\\/settings-renderer-[\\w-]+\\.js$/.test(new URL(entry.name).pathname))
      .map(entry => ({url:entry.name, initiator:entry.initiatorType, startTime:entry.startTime}));`);
    const beforeOpen = await rendererRequests();
    assert.deepEqual(beforeOpen, [], 'the home screen does not load the settings renderer');
    await openPreferences(); await section('appearance');
    assert.equal(await text('#preferences-heading'), '设置');
    const firstOpen = await rendererRequests();
    assert.equal(firstOpen.length, 1, 'first opening loads the settings renderer once');
    for (const selected of Object.keys(sections).filter(id => id !== 'appearance').concat('appearance')) {
      await navigate(selected);
      await geometry(`settings-section-${selected}-320`, '#desktop-preferences');
    }
    await close('#desktop-preferences'); assert.equal(await inspect('return document.activeElement.id'), 'desktop-preferences-open');
    await openPreferences(); await section('appearance');
    const reopened = await rendererRequests();
    assert.deepEqual(reopened, firstOpen, 'reopening reuses the first settings renderer request');
    await writeFile(resolve(run, 'settings-renderer-requests.json'), JSON.stringify({beforeOpen, firstOpen, reopened}, null, 2));
    await close('#desktop-preferences');
    await command('POST', '/window/rect', { width: 1200, height: 900 });
  });
  await checked('Missing model and quick picker management lead to settings without losing the draft or connecting automatically', async () => {
    const draft = '设置入口验收草稿，不发送到任何模型';
    await fill('#desktopInput', draft); await activate('#desktopSend');
    await until(() => inspect('return document.querySelector("#desktop-preferences").open'), 'missing model opens settings');
    await section('models');
    assert.equal(await inspect('return document.querySelector("#desktop-model-dialog").open'), false);
    assert.equal(await inspect('return document.querySelector("#desktopInput").value'), draft);
    await close('#desktop-preferences');
    await activate('#desktopComposer .agent-composer__model');
    await until(() => inspect('return document.querySelector("#desktop-model-picker").matches(":popover-open")'), 'model picker visible');
    await activate('.desktop-picker-manage');
    await until(() => inspect('return document.querySelector("#desktop-preferences").open'), 'picker management opens settings');
    await section('models');
    assert.equal(await inspect('return document.querySelector("#desktop-model-picker").matches(":popover-open")'), false);
    assert.equal(await inspect('return document.querySelector("#desktop-model-dialog").open'), false);
    assert.equal(await inspect('return document.querySelector("#desktopInput").value'), draft);
    assert.equal(await inspect('return document.querySelector("#desktop-preferences .desktop-model-panel").checkVisibility()'), true);
    await close('#desktop-preferences'); assert.equal(await inspect('return document.activeElement.matches("#desktopComposer .agent-composer__model")'), true, 'picker-origin settings return focus to the original model picker');
    await fill('#desktopInput', ''); assert.deepEqual(requests, []);
  });
  await checked('Home project context comes from real saved storage and routes to the existing manager', async () => {
    await projectInvoke('project_save', { project: { id: projectId, name, directory, subject: 'personal' } });
    await projectDialog(); await click('#project-retry');
    await until(() => inspect('return document.querySelector("#desktop-project-select").options.length===2&&!document.querySelector("#project-retry").disabled'), 'project fixture registered');
    await closeProjects(); await selectProject(projectId); await home();
    assert.equal(await text('#home-project-name'), name); assert.match(await text('#home-project-summary'), /个人/);
    await activate('#home-project-manage'); await until(() => inspect('return document.querySelector("#desktop-projects").open'), 'home project manager'); await closeProjects();
    assert.equal(await text('#start-check-label'), '开始预检');
    assert.equal((await snapshot()).runs.length, 0); await geometry('project-home', '#session-empty');
  });
  await checked('Project folders contain scoped sessions and the sidebar menu renames without losing drafts', async () => {
    await command('POST', '/window/rect', { width: 1200, height: 850 });
    const folder = '.project-folder-row[aria-current="true"]';
    assert.equal(await inspect('return document.querySelector(arguments[0]).parentElement.contains(document.querySelector(".session-workspace__recent"))', [folder]), true);
    await activate(folder); assert.equal(await inspect('return document.querySelector(".session-workspace__recent").checkVisibility()'), false);
    await press('\uE007'); assert.equal(await inspect('return document.querySelector(".session-workspace__recent").checkVisibility()'), true);
    const draft = '文件夹切换与菜单重命名保留草稿';
    await fill('#desktopInput', draft);
    await activate('#desktop-more'); await screenshot('navigation-actions-menu');
    await click('#desktop-actions wa-dropdown-item[value="rename"]');
    await until(() => inspect('return document.querySelector("dialog[data-kind=rename]")?.open'), 'rename opens after menu closes');
    await fill('[aria-label="会话名称"]', '项目导航验收');
    await click('.session-workspace-dialog[data-kind=rename] [data-action=confirm]');
    await until(() => inspect('return !document.querySelector("dialog[data-kind=rename]") && document.activeElement.id==="desktop-more"'), 'header rename focus returns');
    assert.equal(await text('#session-title'), '项目导航验收');
    await selectProject(null); await selectProject(projectId);
    assert.equal(await inspect('return document.querySelector("#desktopInput").value'), draft);
    assert.equal(await text('#session-title'), '项目导航验收');
    await screenshot('navigation-project-folders');
    await activate('#desktop-more'); await click('#desktop-actions wa-dropdown-item[value="archived"]');
    await until(() => inspect('return document.querySelector("dialog[data-kind=history]")?.open'), 'archive history opens after menu closes');
    assert.equal(await inspect('return document.querySelector("[data-action=filter-archived]").getAttribute("aria-pressed")'), 'true');
    await click('[data-action=filter-active]'); await fill('[aria-label="搜索会话"]', '项目导航验收');
    await click('[data-action=archive-session]');
    await until(() => inspect('return !document.querySelector(".session-workspace__results [data-action=session]") && !document.querySelector("[data-action=filter-archived]").disabled'), 'archive saved before removing the row');
    await click('[data-action=filter-archived]'); await click('[data-action=restore-session]');
    await until(() => inspect('return !document.querySelector(".session-workspace__results [data-action=session]") && !document.querySelector("[data-action=filter-active]").disabled'), 'restored session leaves archives');
    await click('[data-action=filter-active]'); await click('.session-workspace__results [data-action=session]');
    await until(() => inspect('return !document.querySelector("dialog[data-kind=history]")'), 'restored session selected');
    assert.equal(await inspect('return document.querySelector("#desktopInput").value'), draft);
    await activate('#desktop-more'); await click('#desktop-actions wa-dropdown-item[value="history"]');
    await until(() => inspect('return document.querySelector("dialog[data-kind=history]")?.open'), 'header search opens');
    const historySearch = 'dialog[data-kind=history] [aria-label="搜索会话"]';
    const resultTitle = '.session-workspace__results .session-workspace__result-title';
    await fill(historySearch, '导航');
    assert.equal(await text(resultTitle), '项目导航验收');
    assert.deepEqual(await inspect('return [...document.querySelectorAll(arguments[0])].map(mark => mark.textContent)', [`${resultTitle} mark`]), ['导航']);
    await screenshot('history-search-match');
    await click('dialog[data-kind=history] [data-action=clear-search]');
    assert.equal(await inspect('return document.querySelector(arguments[0]).value', [historySearch]), '');
    assert.equal(await inspect('return document.querySelectorAll(".session-workspace__results mark").length'), 0);
    await fill(historySearch, '导航'); await press('\uE007');
    await until(() => inspect('return !document.querySelector("dialog[data-kind=history]")'), 'Enter opens the matching session');
    assert.equal(await text('#session-title'), '项目导航验收');
    assert.equal(await inspect('return document.querySelector("#desktopInput").value'), draft);
    await fill('#desktopInput', '');
  });
  await checked('Conversation row menus rename inactive chats and archive drafts at wide and compact widths', async () => {
    for (const width of [1200, 320]) {
      await command('POST', '/window/rect', { width, height: 850 });
      const navigation = async () => {
        if (width <= 640 && !await inspect('return document.querySelector("#desktop-navigation").open')) await activate('#desktop-navigation > summary');
      };
      await navigation(); await activate('#sessionHost [data-action=new]');
      const id = await inspect('return document.querySelector("[data-action=recent-session][aria-current=true]").dataset.sessionId');
      await fill('#desktopInput', '菜单归档保留草稿 ' + width);
      await navigation(); await activate('#sessionHost [data-action=new]');
      await fill('#desktopInput', '当前编辑草稿 ' + width);
      const row = '[data-action=recent-session][data-session-id="' + id + '"]';
      const menu = row + ' + .session-workspace__recent-actions wa-dropdown';
      await navigation();
      await inspect('document.querySelector(arguments[0]).focus()', [menu + ' [data-action=session-actions]']);
      await activate(menu + ' [data-action=session-actions]');
      const bounds = await inspect('const row=document.querySelector(arguments[0]).getBoundingClientRect(), trigger=document.querySelector(arguments[1]).getBoundingClientRect();return {row:{top:row.top,bottom:row.bottom,right:row.right},trigger:{top:trigger.top,bottom:trigger.bottom,right:trigger.right}}', [row, menu + ' [data-action=session-actions]']);
      assert.ok(bounds.trigger.top >= bounds.row.top - 1 && bounds.trigger.bottom <= bounds.row.bottom + 1 && bounds.trigger.right <= bounds.row.right + 1, 'context trigger stays within its conversation row');
      await screenshot('conversation-row-menu-' + width);
      await activate(menu + ' wa-dropdown-item[value=rename]');
      await until(() => inspect('return document.querySelector("dialog[data-kind=rename]")?.open'), 'row rename dialog opens');
      assert.equal(await inspect('return document.activeElement.getAttribute("aria-label")'), '会话名称');
      await fill('[aria-label="会话名称"]', '会话菜单验收 ' + width);
      await activate('dialog[data-kind=rename] [data-action=confirm]');
      await until(() => inspect('return !document.querySelector("dialog[data-kind=rename]")'), 'rename closes');
      assert.equal(await inspect('return document.querySelector("#desktopInput").value'), '当前编辑草稿 ' + width);
      assert.equal(await inspect('return document.querySelector(arguments[0]).getAttribute("aria-current")', [row]), 'false');
      await activate(menu + ' [data-action=session-actions]');
      await activate(menu + ' wa-dropdown-item[value=archive]');
      await until(() => inspect('return !document.querySelector(arguments[0])', [row]), 'inactive row archived');
      assert.equal(await inspect('return document.querySelector("#desktopInput").value'), '当前编辑草稿 ' + width);
      await activate('#desktop-sidebar-heading [data-action=history]');
      await activate('dialog[data-kind=history] [data-action=filter-archived]');
      await activate('dialog[data-kind=history] [data-action=restore-session][data-session-id="' + id + '"]');
      await activate('dialog[data-kind=history] [data-action=filter-active]');
      await activate('dialog[data-kind=history] [data-action=session][data-session-id="' + id + '"]');
      await until(() => inspect('return !document.querySelector("dialog[data-kind=history]")'), 'restored conversation opens');
      assert.equal(await inspect('return document.querySelector("#desktopInput").value'), '菜单归档保留草稿 ' + width);
      await fill('#desktopInput', '');
    }
    await command('POST', '/window/rect', { width: 1200, height: 850 }); await home();
    await screenshot('main-conversation-home');
  });
  await checked('Left rail and top quick actions stay reachable and return focus at desktop and compact widths', async () => {
    for (const width of [1200, 390, 320]) {
      await command('POST', '/window/rect', { width, height: 850 });
      if (width <= 640 && !await inspect('return document.querySelector("#desktop-navigation").open')) await activate('#desktop-navigation > summary');
      await activate('#desktop-sidebar-heading [data-action=history]');
      await until(() => inspect('return document.querySelector("dialog[data-kind=history]")?.open'), 'top search opens history');
      await close('dialog[data-kind=history]');
      assert.equal(await inspect('return document.activeElement.matches("#desktop-sidebar-heading [data-action=history]")'), true);
      for (const [entry, dialog] of [['#desktop-memory-open', '#desktop-memory'], ['#desktop-sources-open', '#desktop-source-freshness'], ['#desktop-maintenance-open', '#desktop-health']]) {
        await activate(entry); await until(() => inspect('return document.querySelector(arguments[0])?.open', [dialog]), entry + ' opens');
        await close(dialog);
        assert.equal(await inspect('return document.activeElement.id'), entry.slice(1));
      }
      await activate('#desktop-more'); await screenshot('sidebar-rail-menu-' + width);
      await press('\uE00C');
      await until(() => inspect('return !document.querySelector("#desktop-actions").open'), 'rail menu closes');
      await activate('#desktop-home-open');
      if (width <= 640) await activate('#desktop-navigation > summary');
      const folderStyle = await inspect(`const row=document.querySelector('.project-folder-row[aria-current="true"]'), list=document.querySelector('.session-workspace__recent'), c=getComputedStyle(list);
        return {icons:row.querySelectorAll('svg').length,border:c.borderLeftWidth,pageOverflow:document.documentElement.scrollWidth-innerWidth};`);
      assert.equal(folderStyle.icons, 1); assert.equal(folderStyle.border, '0px'); assert.ok(folderStyle.pageOverflow <= 1);
      await screenshot('sidebar-rail-' + width);
    }
    await command('POST', '/window/rect', { width: 1200, height: 850 });
  });
  await checked('Compact home exposes preflight before scrolling and restores focus after rejection lookup', async () => {
    await command('POST', '/window/rect', { width: 320, height: 844 }); await home();
    const visible = await inspect(`const button=document.querySelector('#start-check'), rect=button.getBoundingClientRect();
      return button.contains(document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2));`);
    assert.ok(visible, 'preflight is visible without scrolling at 320px');
    await screenshot('home-compact-quick-start');
    await activate('#start-explain'); await until(() => inspect('return document.querySelector("#desktop-explain").open'), 'rejection lookup opens');
    await close('#desktop-explain'); assert.equal(await inspect('return document.activeElement.id'), 'start-explain');
    await command('POST', '/window/rect', { width: 1200, height: 850 });
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
  await checked('React settings use named Base UI radio groups, keyboard navigation and persisted appearance', async () => {
    await openPreferences();
    assert.equal(await inspect('return document.querySelectorAll("#desktop-preferences [role=radiogroup]").length'), 3);
    assert.equal(await inspect('const radios=[...document.querySelectorAll("#desktop-preferences button[role=radio]")];return radios.length===8&&radios.every(n=>n.getAttribute("aria-label")&&n.closest("fieldset")?.querySelector("legend")?.textContent)'), true);
    await activate('#desktop-theme-system'); await press('\uE014');
    await until(() => inspect('return document.activeElement.id==="desktop-theme-light"&&document.activeElement.getAttribute("aria-checked")==="true"'), 'arrow key selects and focuses the next theme');
    await until(async () => /保存/.test(await text('#preferences-status')), 'theme save feedback appears after keyboard selection');
    await activate('#desktop-theme-dark'); await activate('#desktop-message-size-18'); await activate('#desktop-motion-reduce');
    assert.equal(await inspect('return document.body.dataset.theme'), 'dark'); assert.equal(await inspect('return document.body.dataset.motion'), 'reduce');
    assert.equal(await inspect('return getComputedStyle(document.querySelector(".preferences-sample")).fontSize'), '18px');
    for (const [selector, size] of [['#desktop-preferences', '14px'], ['.preferences-field-copy p', '13px'], ['.preferences-choice', '13px'], ['#preferences-status', '12px']]) {
      assert.equal(await inspect('return getComputedStyle(document.querySelector(arguments[0])).fontSize', [selector]), size, `${selector}: reading size does not enlarge settings UI`);
    }
    for (const selected of ['notifications', 'models', 'appearance']) {
      await navigate(selected); assert.equal(await inspect('return document.activeElement.id'), 'preferences-section-title', 'section navigation focuses its readable destination');
      if (selected === 'notifications') assert.equal(await inspect('return document.querySelector("#system-notifications-enabled").checked'), false, 'viewing settings never enables system notifications');
    }
    await activate('#preferences-content-dismiss'); assert.equal(await inspect('return document.activeElement.id'), 'desktop-preferences-open');
    await openPreferences(); assert.equal(await inspect('return document.querySelector("#preferences-body").scrollTop'), 0, 'reopening settings starts at its overview');
    assert.match(await text('#preferences-dismiss'), /返回应用/);
    await activate('#preferences-dismiss');
    assert.equal(await inspect('return document.querySelector("#desktop-preferences").open'), false);
    assert.equal(await inspect('return document.activeElement.id'), 'desktop-preferences-open', 'return to app restores the original trigger');
    assert.equal(await inspect('return JSON.parse(localStorage.getItem("shipmate-desktop-preferences")).messageSize'), 18, 'returning preserves saved reading preferences');
  });
  await checked('Manual progress and actual appearance survive WebView refresh and process restart', async () => {
    const before = await workflow(); await refresh(); await home();
    assert.equal(await inspect('return document.body.dataset.theme'), 'dark');
    await quit(); await launch(); await home();
    const after = await workflow(); assert.deepEqual(after.project.facts, before.project.facts); assert.deepEqual(after.confirmations, before.confirmations);
    assert.equal(await text('#home-project-name'), name);
    await openWorkflow(); await checkProjection(); await close('#desktop-workflow');
    await openPreferences();
    assert.equal(await inspect('return ["desktop-theme-dark","desktop-message-size-18","desktop-motion-reduce"].every(id=>document.getElementById(id).getAttribute("aria-checked")==="true")'), true);
    await close('#desktop-preferences'); assert.equal((await snapshot()).runs.length, 0);
  });
  await checkSettingsWorkspaceFlows({ run, checked, click, fill, press, inspect, text, command, until, screenshot, projectInvoke, chooseOption, refresh, quit, launch, projectId, requests });
  await checked('Malformed appearance storage has explicit recovery without deleting project progress', async () => {
    const before = await workflow();
    await inspect('localStorage.setItem("shipmate-desktop-preferences","{invalid acceptance fixture")'); await refresh(); await openPreferences();
    assert.match(await text('#preferences-status'), /损坏|不受支持/); assert.equal(await inspect('return document.querySelector("#preferences-retry").checkVisibility()'), true);
    await geometry('preferences-error-recovery', '#desktop-preferences');
    await activate('#preferences-reset'); assert.match(await text('#preferences-status'), /恢复.*默认/);
    assert.equal(await inspect('return ["desktop-theme-system","desktop-message-size-16","desktop-motion-system"].every(id=>document.getElementById(id).getAttribute("aria-checked")==="true")'), true);
    await close('#desktop-preferences'); const after = await workflow(); assert.deepEqual(after.project.facts, before.project.facts); assert.deepEqual(after.confirmations, before.confirmations);
  });
  for (const theme of ['light', 'dark']) {
    await checked(`Home, workflow and settings reflow at 320/390/1000/1440px in ${theme} theme`, async () => {
      await command('POST', '/window/rect', { width: 1200, height: 1000 }); await appearance(theme);
      for (const width of [320, 390, 1000, 1440]) {
        await command('POST', '/window/rect', { width, height: 1000 }); await home(); await geometry(`${theme}-${width}-home`, '#session-empty');
        await openWorkflow(); await geometry(`${theme}-${width}-workflow`, '#desktop-workflow'); await activate('#workflow-next-open'); await close('#desktop-workflow');
        await openPreferences();
        for (const selected of Object.keys(sections)) {
          await navigate(selected);
          await geometry(`${theme}-${width}-preferences-${selected}`, '#desktop-preferences');
          await settingsWorkspace(`${theme}-${width}-preferences-${selected}`);
          await settingsLayout(`${theme}-${width}-preferences-${selected}`, selected);
          if (selected === 'data') {
            const row = await inspect(`const section=document.querySelector('.session-workspace__data-group > section');
              const copy=section.querySelector('p').getBoundingClientRect(),action=section.querySelector('[data-action="backup"]').getBoundingClientRect();
              return {beside:action.left>=copy.right+12,below:action.top>=copy.bottom};`);
            assert.ok(width >= 1000 ? row.beside : row.below, 'backup action follows the available row width');
          }
          if (selected === 'projects') {
            assert.equal(await inspect('return document.querySelector("#project-save").parentElement === document.querySelector("#project-discard").parentElement'), true, 'save and discard belong to the same edit');
          }
          if (selected === 'about') {
            assert.equal(await inspect('return document.querySelector(".settings-rule-version details").open'), false, 'rule metadata starts collapsed');
            await activate('.settings-rule-version summary');
            assert.equal(await inspect('const n=document.querySelector(".settings-rule-version pre");return n.checkVisibility()&&n.textContent.length>0&&n.scrollWidth<=n.clientWidth+1&&getComputedStyle(n).overflowY==="auto";'), true, 'complete rule metadata remains readable within a scrollable disclosure');
            await geometry(`${theme}-${width}-preferences-about-expanded`, '#desktop-preferences');
            await activate('.settings-rule-version summary');
          }
          if (selected === 'appearance') {
            const previews = await inspect(`return [...document.querySelectorAll('.preferences-theme-preview')].map(n=>({width:n.getBoundingClientRect().width,ink:n.lastElementChild.getBoundingClientRect().width}))`);
            assert.ok(previews.every(n => n.width >= 45 && n.ink >= 12), 'theme miniatures retain a readable canvas and message lines in every mode');
          }
        }
        await inspect('document.querySelector("#preferences-content-dismiss").focus()'); await press('\uE004');
        assert.equal(await inspect('return document.querySelector("#desktop-preferences").contains(document.activeElement)'), true, 'keyboard remains inside the modal');
        await close('#desktop-preferences'); assert.equal(await inspect('return document.activeElement.checkVisibility()'), true);
      }
      await command('POST', '/window/rect', { width:1000, height:720 }); await openPreferences();
      await geometry(`${theme}-1000x720-preferences-appearance`, '#desktop-preferences');
      await settingsWorkspace(`${theme}-1000x720-preferences-appearance`);
      await activate('#preferences-reset'); await activate('#preferences-dismiss');
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
  await checked('Run history returns focus to the home entry at wide and compact widths', async () => {
    const back = '#desktop-project-results button[aria-label="返回工作区"]';
    for (const width of [1000, 390]) {
      await command('POST', '/window/rect', { width, height: 850 });
      await home(); await activate('#home-results');
      await until(() => inspect('return document.activeElement === document.querySelector(arguments[0]) && document.activeElement.checkVisibility()', [back]), 'run history return button focused');
      if (width === 1000) await activate(back);
      else await close('#desktop-project-results');
      await until(() => inspect('const home = document.querySelector("#home-results"); return !document.querySelector("#desktop-project-results").open && home.checkVisibility() && document.activeElement === home'), `run history returns keyboard focus to home at ${width}px`);
      if (width === 390) await screenshot('home-results-return-focus-390');
    }
  });
  await checked('Project results are a nonmodal workspace with a usable empty state and stable return navigation', async () => {
    await command('POST', '/window/rect', { width:1000, height:850 }); await home();
    await activate('#desktop-results-open');
    await until(() => inspect('const d=document.querySelector("#desktop-project-results");return d?.open&&d.getAttribute("role")==="region"&&!d.matches(":modal")'), 'results workspace ready');
    assert.equal(await inspect('return document.querySelector("#desktop-project-results").contains(document.querySelector("#project-history"))'), true);
    assert.equal(await inspect('return document.querySelector("#desktop-results-open").getAttribute("aria-current")'), 'page');
    await geometry('results-empty', '#desktop-project-results'); await close('#desktop-project-results');
    await until(() => inspect('return document.activeElement === document.querySelector("#desktop-results-open")'), 'run history returns keyboard focus to the sidebar entry');
    await openPreferences(); await navigate('projects');
    assert.equal(await inspect('return document.querySelector("#project-history").checkVisibility()'), false);
    await activate('#project-open-results');
    await until(() => inspect('return !document.querySelector("#desktop-preferences").open&&document.querySelector("#desktop-project-results").open'), 'settings link reaches results after releasing its panel');
    await command('POST', '/actions', { actions: [{ type: 'key', id: 'keyboard', actions: [{ type: 'keyDown', value: '\uE009' }, { type: 'keyDown', value: 'k' }, { type: 'keyUp', value: 'k' }, { type: 'keyUp', value: '\uE009' }] }] });
    await until(() => inspect('return document.querySelector("dialog[data-kind=history]")?.open && !document.querySelector("#desktop-project-results").open'), 'session search releases the results workspace');
    await activate('dialog[data-kind=history] [data-action=session]');
    await until(() => inspect('return !document.querySelector("dialog[data-kind=history]")?.open && document.querySelector("#desktopComposer").checkVisibility()'), 'selected conversation is visible after leaving results');
  });
  await checked('History and archive data links reuse settings, retain the draft and return keyboard focus', async () => {
    const draft = '历史数据入口验收草稿 · 保留当前输入';
    await command('POST', '/window/rect', { width:1000, height:850 });
    await fill('#desktopInput', draft);
    const openHistory = async () => {
      await command('POST', '/actions', { actions: [{ type: 'key', id: 'keyboard', actions: [{ type: 'keyDown', value: '\uE009' }, { type: 'keyDown', value: 'k' }, { type: 'keyUp', value: 'k' }, { type: 'keyUp', value: '\uE009' }] }] });
      await until(() => inspect('return document.querySelector("dialog[data-kind=history]")?.open'), 'history open for data navigation');
    };
    for (const width of [1000, 390]) {
      await command('POST', '/window/rect', { width, height:850 });
      await openHistory(); await activate('dialog[data-kind=history] [data-action=data]');
      await section('data');
      await until(() => inspect('return !document.querySelector("dialog[data-kind=history]")'), 'history close callback has finished');
      assert.equal(await inspect('return document.querySelectorAll("dialog[open]").length'), 1);
      assert.equal(await inspect('return document.querySelectorAll(".session-workspace-data-panel").length'), 1);
      assert.equal(await inspect('return document.querySelector("dialog[data-kind=data]")?.open ?? false'), false);
      assert.equal(await inspect('return document.querySelector("#desktopInput").value'), draft);
      await geometry(`history-data-${width}`, '#desktop-preferences');
      await screenshot(`history-data-${width}`);
      await activate('#settings-archives');
      await until(() => inspect('return document.querySelector("dialog[data-kind=history]")?.open'), 'archives open over settings');
      assert.equal(await inspect('return document.querySelector("dialog[data-kind=history] [data-action=filter-archived]").getAttribute("aria-pressed")'), 'true');
      await activate('dialog[data-kind=history] [data-action=data]'); await section('data');
      await until(() => inspect('return document.querySelectorAll("dialog[open]").length===1 && !document.querySelector("dialog[data-kind=history]")'), 'archive returns to the existing settings workspace');
      assert.equal(await inspect('return document.querySelector("#desktopInput").value'), draft);
      await close('#desktop-preferences');
      await until(() => inspect('return document.activeElement.id==="desktop-preferences-open" && document.activeElement.checkVisibility()'), 'data settings returns to stable visible opener');
    }
    await fill('#desktopInput', '');
  });

  await checked('Short sidebars keep sessions, save recovery and Settings reachable', async () => {
    await command('POST', '/window/rect', { width: 1000, height: 720 });
    const row = '#sessionHost [data-action=recent-session]';
    const count = await inspect('return document.querySelectorAll(arguments[0]).length', [row]);
    for (let i = 0; i < 14; i++) await activate('#sessionHost [data-action=new]');
    assert.equal(await inspect('return document.querySelectorAll(arguments[0]).length', [row]), count + 14);
    // Fail only a write to the disposable WebView's conversation store.
    await inspect(`window.__sidebarPut = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function(...args) {
        if (this.name === 'workspaces' && args[1] === 'desktop-local') throw new DOMException('Layout fixture', 'QuotaExceededError');
        return window.__sidebarPut.apply(this, args);
      };`);
    const layouts = [];
    try {
      await fill('#desktopInput', '短窗口恢复验收草稿');
      await until(() => inspect('return document.querySelector("#sessionHost [data-action=retry]").checkVisibility()'), 'save recovery visible');
      for (const width of [1000, 600]) {
        await command('POST', '/window/rect', { width, height: 480 });
        if (width === 600 && !await inspect('return document.querySelector("#desktop-navigation").open')) await activate('#desktop-navigation > summary');
        const layout = await inspect(`const last = document.querySelector('.session-workspace__recent > :last-child [data-action=recent-session]');
          const scrollers = [];
          for(let n=last.parentElement; n && n.id!=='desktop-navigation'; n=n.parentElement) {
            if (/^(auto|scroll)$/.test(getComputedStyle(n).overflowY) && n.scrollHeight>n.clientHeight+1) scrollers.push(n.id||n.className);
          }
          const point = n => { const r=n.getBoundingClientRect(); return n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)); };
          const hit = n => { n.focus(); n.scrollIntoView({block:'nearest',behavior:'instant'}); return point(n); };
          const footer=document.querySelector('#desktop-preferences-open'), fixedTop=footer.getBoundingClientRect().top;
          return {width:innerWidth,height:innerHeight,scrollers,last:hit(last),retry:hit(document.querySelector('#sessionHost [data-action=retry]')),
            backup:hit(document.querySelector('#sessionHost [data-action=backup]')),settings:point(footer),footerShift:footer.getBoundingClientRect().top-fixedTop};`);
        layouts.push(layout);
        await screenshot('sidebar-recovery-'+width);
      }
      await writeFile(resolve(run, 'sidebar-recovery.json'), JSON.stringify(layouts, null, 2));
      for (const layout of layouts) {
        assert.equal(layout.scrollers.length, 1, 'one scrolling region for sessions and recovery: '+JSON.stringify(layout));
        assert.ok(layout.last && layout.retry && layout.backup && layout.settings && Math.abs(layout.footerShift)<1, 'controls remain reachable: '+JSON.stringify(layout));
      }
    } finally {
      await inspect('IDBObjectStore.prototype.put=window.__sidebarPut; delete window.__sidebarPut;');
    }
    await activate('#sessionHost [data-action=retry]');
    await until(() => inspect('return document.querySelector("#sessionHost .session-workspace__notice").hidden'), 'retry saves the draft');
    await refresh();
    await until(() => inspect('return document.querySelector("#desktopInput")?.value === "短窗口恢复验收草稿"'), 'recovered draft survives reload');
  });

  await checked('Shipmate branding loads and workspace motion follows device and app preferences', async () => {
    await command('POST', '/window/rect', { width: 1000, height: 850 });
    await home();
    await openPreferences();
    await navigate('about');
    await until(() => inspect('const logo=document.querySelector(".settings-product-name img");return logo?.checkVisibility() && logo.naturalWidth>0 && logo.src===document.querySelector("link[rel=icon]").href'), 'About displays the product icon beside its name');
    await screenshot('presentation-about-product');
    await close('#desktop-preferences');
    const emulate = features => command('POST', '/ms/cdp/execute', {
      cmd: 'Emulation.setEmulatedMedia', params: { features },
    });
    const checkHeader = async expected => {
      await openWorkflow();
      assert.equal(await inspect('return getComputedStyle(document.querySelector("#desktop-workflow > header")).animationName'), expected);
      await close('#desktop-workflow');
    };
    try {
      await emulate([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
      await openPreferences(); await section('appearance'); await activate('#desktop-motion-system'); await close('#desktop-preferences');
      await checkHeader('shipmate-arrive');
      await emulate([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
      await checkHeader('none');
      await emulate([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
      await openPreferences(); await section('appearance'); await activate('#desktop-motion-reduce'); await close('#desktop-preferences');
      await checkHeader('none');
    } finally {
      await emulate([]);
    }
  });

  await checked('Presentation navigation never changes source files, creates reports or submits model requests', async () => {
    const final = await snapshot(); assert.equal(final.runs.length, 0); assert.equal(final.artifacts.length, 0); assert.deepEqual(requests, []);
    assert.deepEqual((await readdir(directory)).sort(), Object.keys(files).sort());
    for (const [file, content] of Object.entries(files)) assert.equal(await readFile(resolve(directory, file), 'utf8'), content);
  });
  await checked('Selected project runs one real preflight directly from Home', async () => {
    await selectProject(projectId); await home(); await activate('#start-check');
    await until(() => inspect('return document.querySelector("#desktop-tools").open && !document.querySelector("#read-report").disabled'), 'one click opens the finished report');
    assert.equal(await inspect('return document.activeElement.id'), 'status');
    assert.equal(await text('#start-check-label'), '重新预检');
    const final = await snapshot();
    assert.equal(final.runs.length, 1); assert.equal(final.artifacts.length, 1);
    assert.equal(final.artifacts[0].projectId, projectId); assert.equal(final.artifacts[0].kind, 'check');
    assert.deepEqual(requests, []);
    await screenshot('home-one-click-preflight');
    await closeTools();
    assert.equal(await inspect('return document.activeElement.id'), 'start-check');
    const actual = await workflow();
    await writeFile(resolve(run, 'presentation-evidence.json'), JSON.stringify({ projectId, fileNames: Object.keys(files), projectFacts: actual.project.facts, confirmations: actual.confirmations, runCount: final.runs.length, artifactCount: final.artifacts.length, modelRequestCount: requests.length, fixture: 'Real native storage and manual UI actions; temporary labelled files; one explicit bundled preflight; no invoke mocks, OS browser or installed-release validation.' }, null, 2));
  });
}
