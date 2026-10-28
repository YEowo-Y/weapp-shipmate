import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Called only by the dedicated presentation acceptance mode, after its labelled
// project has been created in the isolated native identifier and WebView profile.
export async function checkSettingsWorkspaceFlows({ run, checked, click, fill, press, inspect, text, command, until, screenshot, projectInvoke, chooseOption, refresh, quit, launch, projectId, requests }) {
  const evidence = [];
  const snapshot = () => projectInvoke('project_snapshot');
  const open = async () => {
    await click('#desktop-preferences-open');
    await until(() => inspect('return document.querySelector("#desktop-preferences").open && document.querySelector("#desktop-preferences").dataset.section === "appearance"'), 'settings workspace opened');
  };
  const section = async id => {
    if (!await inspect('return document.querySelector(arguments[0]).checkVisibility()', [`#preferences-nav-${id}`])) await click('#preferences-categories');
    await click(`#preferences-nav-${id}`);
    await until(() => inspect('const root=document.querySelector("#desktop-preferences");return root.dataset.section===arguments[0]&&!root.querySelector(".preferences-loading,.settings-loading")&&!root.querySelector(".preferences-error")', [id]), `settings ${id} loaded`);
  };
  const close = async () => {
    await click('#preferences-content-dismiss');
    await until(() => inspect('return !document.querySelector("#desktop-preferences").open'), 'settings closed');
  };
  const embedded = async selector => {
    await until(() => inspect('const root=document.querySelector("#desktop-preferences"),panel=root.querySelector(arguments[0]);return root.open&&!root.querySelector(".preferences-loading,.settings-loading")&&panel?.checkVisibility()', [selector]), `embedded ${selector}`);
    assert.deepEqual(await inspect('return [...document.querySelectorAll("dialog:modal")].map(node=>node.id)'), ['desktop-preferences'], 'the settings workspace owns the single modal');
  };
  const persistedShortcut = async () => {
    await open(); await section('shortcuts');
    assert.equal(await inspect('return document.querySelector("#settings-send-key").value'), 'mod-enter');
    assert.equal(await inspect('return JSON.parse(localStorage.getItem("shipmate-desktop-shortcuts")).sendKey'), 'mod-enter');
    await close();
  };

  await checked('Narrow settings search keeps the real input visible and focused through every typed character', async () => {
    await command('POST', '/window/rect', { width: 320, height: 844 });
    await open(); await click('#preferences-categories');
    await until(() => inspect('return document.querySelector("#preferences-search").checkVisibility()'), 'narrow settings search visible in categories');
    await fill('#preferences-search', ''); await click('#preferences-search');
    const input = await command('POST', '/element', { using: 'css selector', value: '#preferences-search' });
    const elementId = input['element-6066-11e4-a52e-4f735466cecf'], prefixes = [];
    let typed = '';
    for (const character of '发送消息') {
      await command('POST', `/element/${elementId}/value`, { text: character });
      typed += character;
      await until(() => inspect('const input=document.querySelector("#preferences-search");return input.value===arguments[0]&&input.checkVisibility()&&document.activeElement===input', [typed]), `narrow search retains focus after "${typed}"`);
      prefixes.push(typed);
    }
    assert.equal(await inspect('return document.querySelectorAll(".preferences-search-result").length'), 1);
    await screenshot('settings-search-narrow-results');
    await click('.preferences-search-result');
    await until(() => inspect('return document.querySelector("#desktop-preferences").dataset.section==="shortcuts"&&document.querySelector(".preferences-main").checkVisibility()&&document.querySelector("#settings-send-key").checkVisibility()&&document.activeElement.id==="settings-send-key"'), 'narrow search opens the visible shortcut detail and focuses its control');
    await screenshot('settings-search-narrow-detail');
    evidence.push({ narrowSearchWidth: 320, typedPrefixes: prefixes, inputVisibleAndFocusedAfterEveryCharacter: true, detailVisible: true, focusedControl: 'settings-send-key' });
    await close();
    await command('POST', '/window/rect', { width: 1200, height: 900 });
  });
  await checked('Settings search locates the real control and recovers from no results', async () => {
    await open(); await fill('#preferences-search', '不存在的验收设置');
    await until(() => inspect('return document.querySelector("#preferences-section-title").textContent === "搜索结果"'), 'settings search results');
    assert.equal(await inspect('return document.querySelectorAll(".preferences-search-result").length'), 0);
    assert.match(await text('.preferences-results'), /未找到匹配设置/);
    await fill('#preferences-search', '发送消息');
    await until(() => inspect('return document.querySelectorAll(".preferences-search-result").length === 1'), 'one matching send shortcut');
    await click('.preferences-search-result');
    await until(() => inspect('return document.querySelector("#desktop-preferences").dataset.section === "shortcuts" && document.activeElement.id === "settings-send-key"'), 'search focuses actual send-key control');
    await chooseOption('#settings-send-key', 'mod-enter');
    await until(() => inspect('return JSON.parse(localStorage.getItem("shipmate-desktop-shortcuts")).sendKey === "mod-enter"'), 'shortcut persisted by product handler');
    await screenshot('settings-search-shortcut');
    evidence.push({ search: '发送消息', focusedControl: 'settings-send-key', sendKey: 'mod-enter' }); await close();
  });

  await checked('Configured send shortcut changes the real composer and survives native refresh and restart', async () => {
    const draft = '快捷键验收草稿，不发送到任何模型';
    await fill('#desktopInput', draft); await press('\uE007');
    await until(() => inspect('return document.querySelector("#desktopInput").value.endsWith("\\n")'), 'Enter inserts newline in Ctrl+Enter mode');
    assert.equal(await inspect('return document.querySelector("#desktop-preferences").open'), false);
    await command('POST', '/actions', { actions: [{ type: 'key', id: 'keyboard', actions: [
      { type: 'keyDown', value: '\uE009' }, { type: 'keyDown', value: '\uE007' },
      { type: 'keyUp', value: '\uE007' }, { type: 'keyUp', value: '\uE009' },
    ] }] });
    await until(() => inspect('return document.querySelector("#desktop-preferences").open && document.querySelector("#desktop-preferences").dataset.section === "models"'), 'Ctrl+Enter follows the real missing-model send path');
    assert.equal(await inspect('return document.querySelector("#desktopInput").value.trim()'), draft);
    await embedded('.desktop-model-panel'); await close(); await fill('#desktopInput', '');
    await refresh(); await persistedShortcut();
    await quit(); await launch(); await persistedShortcut();
    evidence.push({ shortcut: 'mod-enter', enterInsertsNewline: true, modifiedEnterOpensMissingModelSettings: true, survivesWebViewRefresh: true, survivesNativeRestart: true });
  });

  await checked('Privacy and About show real session permissions and runtime versions without external navigation', async () => {
    await open(); await section('privacy');
    await until(() => inspect('return document.querySelector("#settings-revoke")'), 'session privacy data');
    assert.match(await text('#settings-permissions'), /未允许/);
    assert.equal(await inspect('return document.querySelector("#settings-revoke").disabled'), true, 'there are no fixture permissions to revoke');
    assert.match(await text('#settings-storage'), /此设备|本机/);
    await screenshot('settings-privacy');
    await section('about');
    await until(() => inspect('return document.querySelectorAll("#settings-versions dd").length === 3'), 'actual version information');
    const versions = await inspect('return [...document.querySelectorAll("#settings-versions > div")].map(row=>({name:row.querySelector("dt").textContent,value:row.querySelector("dd").textContent}))');
    assert.deepEqual(versions.map(row => row.name), ['桌面应用', '检查核心', '项目规则']);
    assert.match(versions[0].value, /^\d+\.\d+\.\d+/); assert.match(versions[1].value, /^\d+\.\d+\.\d+/);
    assert.equal(versions[2].value, (await snapshot()).rulesVersion, 'rule version is the actual native snapshot value');
    assert.match(await text('#settings-licenses'), /MIT/); await screenshot('settings-about');
    evidence.push({ versions, noExternalNavigation: true }); await close();
  });

  await checked('Embedded project configuration saves through native storage and blocks unsaved category changes', async () => {
    const before = await snapshot(), original = before.projects.find(project => project.id === projectId);
    assert.ok(original, 'only the dedicated fixture project is edited');
    await open(); await section('projects'); await embedded('.project-settings-panel');
    await until(() => inspect('return !document.querySelector("#project-settings-select").disabled && !document.querySelector("#maintenance-watch").disabled'), 'project and maintenance controls hydrated');
    assert.equal(await inspect('return document.querySelector("#desktop-projects").open'), false);
    assert.equal(await inspect('return document.querySelector("#project-settings-select").value'), projectId);
    assert.equal(await inspect('return document.querySelector("#project-directory").value'), original.directory);
    await fill('#project-name', '尚未保存的设置验收草稿'); await click('#preferences-nav-data');
    assert.equal(await inspect('return document.querySelector("#desktop-preferences").dataset.section'), 'projects');
    assert.equal(await inspect('return document.querySelector("#project-name").value'), '尚未保存的设置验收草稿');
    assert.match(await text('.preferences-error'), /保存|放弃/);
    assert.equal((await snapshot()).projects.find(project => project.id === projectId).name, original.name);
    await click('#project-discard');
    const renamed = '设置工作区原生保存验收'; await fill('#project-name', renamed); await click('#project-save');
    await until(async () => (await snapshot()).projects.find(project => project.id === projectId).name === renamed, 'project rename persisted through native form');
    await until(() => inspect('return !document.querySelector("#project-save").disabled'), 'project save settled');
    await fill('#project-name', original.name); await click('#project-save');
    await until(async () => (await snapshot()).projects.find(project => project.id === projectId).name === original.name, 'fixture name restored through native form');
    await until(() => inspect('return !document.querySelector("#project-save").disabled'), 'restored project save settled');
    await click('#maintenance-watch'); await click('#preferences-nav-about');
    assert.equal(await inspect('return document.querySelector("#desktop-preferences").dataset.section'), 'projects');
    await click('#maintenance-discard');
    assert.equal(await inspect('return document.querySelector("#maintenance-watch").checked'), false, 'draft discard does not start a watcher');
    assert.equal((await projectInvoke('project_maintenance_snapshot', { projectId })).watchEnabled, false);
    await screenshot('settings-projects');
    evidence.push({ projectId, nativeRenameSaved: true, nameRestored: true, directory: original.directory, unsavedProjectNavigationBlocked: true, unsavedMaintenanceNavigationBlocked: true });
    await close();
  });

  await checked('Session and project backups share the Data page without opening whole-manager dialogs', async () => {
    await open(); await section('data'); await embedded('.session-workspace-data-panel'); await embedded('.project-backup-settings-panel');
    assert.equal(await inspect('return document.querySelector("#settings-session-data").contains(document.querySelector(".session-workspace-data-panel")) && document.querySelector("#settings-project-backup").contains(document.querySelector("#project-backup"))'), true);
    assert.equal(await inspect('return document.querySelector("#desktop-projects").open'), false);
    assert.equal(await inspect('return [...document.querySelectorAll("dialog[data-kind=data]")].some(dialog=>dialog.open)'), false);
    assert.equal(await inspect('return document.querySelector(".session-workspace-data-panel [data-action=backup]").checkVisibility() && document.querySelector(".session-workspace-data-panel input[type=file]").checkVisibility()'), true);
    await until(() => inspect('return /项目.*\\//.test(document.querySelector("#project-storage-status").textContent)'), 'actual project capacity available');
    await screenshot('settings-data');
    await click('#settings-archives');
    await until(() => inspect('return document.querySelector("dialog[data-kind=history]")?.open'), 'archive history opens from Data settings');
    assert.equal(await inspect('return document.querySelector("dialog[data-kind=history] [data-action=filter-archived]").getAttribute("aria-pressed")'), 'true');
    assert.equal(await inspect('return document.querySelector("dialog[data-kind=history] [data-action=filter-active]").getAttribute("aria-pressed")'), 'false');
    await screenshot('settings-archived-history');
    await click('dialog[data-kind=history] [data-action=close]');
    await until(() => inspect('return !document.querySelector("dialog[data-kind=history]")?.open && document.querySelector("#desktop-preferences").open && document.activeElement.id==="settings-archives"'), 'archive history returns focus to Data settings');
    assert.equal(await inspect('return document.querySelector("#desktop-preferences").dataset.section'), 'data');
    await embedded('.session-workspace-data-panel');
    await section('models'); await embedded('.desktop-model-panel');
    assert.equal(await inspect('return document.querySelector("#desktop-model-dialog").open'), false);
    await screenshot('settings-models');
    await click('.desktop-model-panel [data-provider-id="openai"]');
    await until(() => inspect('const key=document.querySelector("#desktop-provider-key");return document.querySelector(".desktop-model-panel [data-provider-id=openai]").getAttribute("aria-pressed")==="true"&&key.checkVisibility()&&!key.disabled'), 'unconnected OpenAI exposes its real credential input');
    await fill('#preferences-search', '服务商与凭据');
    await until(() => inspect('return document.querySelectorAll(".preferences-search-result").length===1'), 'one matching provider credentials setting');
    await click('.preferences-search-result');
    await until(() => inspect('const root=document.querySelector("#desktop-preferences"),target=document.querySelector("#desktop-provider-key");return root.dataset.section==="models"&&!root.querySelector(".preferences-loading")&&target.checkVisibility()&&!target.disabled&&document.activeElement===target&&target.classList.contains("settings-search-highlight")'), 'model search focuses and highlights the visible unconnected credential input');
    assert.equal(await inspect('return document.querySelector("#desktop-model-dialog").open'), false);
    await screenshot('settings-model-search-focus'); await close();
    evidence.push({ sessionBackupEmbedded: true, projectBackupEmbedded: true, modelsEmbedded: true, singleModal: true, archiveFilter: 'archived', archiveReturnFocus: 'settings-archives', modelSearchFocus: 'desktop-provider-key', modelSearchHighlight: true });
  });

  assert.deepEqual(requests, [], 'settings acceptance makes no model requests');
  await writeFile(resolve(run, 'settings-workspace-evidence.json'), JSON.stringify({ fixture: 'Dedicated native presentation identifier, isolated WebView profile and labelled project; real IPC and UI only. No user data, model request, OS permission change or invoke mock.', evidence }, null, 2));
}
