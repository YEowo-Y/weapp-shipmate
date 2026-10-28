// Synthetic provider protocols; the native app still executes its real CLI and
// permission checks. Never import this fixture from the production runtime.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { agentProviderFixtures } from '../tests/fixtures/provider-agent-streams.mjs';

export function createProviderAgentFixture(requests) {
  let provider, sequence = [], serial = 0;
  return {
    next(id, steps = []) { assert.ok(agentProviderFixtures[id]); provider = id; sequence = [...steps]; },
    async handle(req, res) {
      if (!provider) return false;
      const fixture = agentProviderFixtures[provider], url = new URL(req.url, 'http://127.0.0.1');
      const catalog = provider === 'anthropic' ? '/v1/models' : '/v1beta/models';
      const endpoint = new URL(fixture.endpoint).pathname;
      if (![catalog, endpoint].includes(url.pathname)) return false;
      assert.equal(req.headers[provider === 'anthropic' ? 'x-api-key' : 'x-goog-api-key'] ?? url.searchParams.get('key'), `native-${provider}-fake-key`);
      if (url.pathname === catalog) {
        assert.equal(req.method, 'GET');
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(fixture.catalog)); return true;
      }
      assert.equal(req.method, 'POST');
      let raw = ''; for await (const chunk of req) raw += chunk;
      const body = JSON.parse(raw), record = { ...body, protocol: provider, completed: false, aborted: false };
      requests.push(record);
      const step = sequence.shift(); assert.ok(step, 'Unplanned native provider inference');
      if (step.error) { record.failed = true; res.writeHead(503); res.end('Synthetic provider failure'); return true; }
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.on('close', () => { if (!record.completed) record.aborted = true; });
      const events = fixture.stream({ input: step.kind ? { kind: step.kind, query: '' } : undefined, text: step.text, callId: `native-${provider}-${++serial}` });
      for (const event of step.hold ? events.slice(0, provider === 'anthropic' ? 3 : 1) : events) res.write(`data: ${JSON.stringify(event)}\n\n`);
      if (step.hold) {
        await new Promise(resolve => {
          const timer = setTimeout(() => { res.destroy(); resolve(); }, 30_000);
          res.once('close', () => { clearTimeout(timer); resolve(); });
        });
      } else { record.completed = true; res.end(); }
      return true;
    },
  };
}

export async function checkProviderAgentFlows(options) {
  const { checked, click, fill, inspect, text, find, command, until, screenshot, projectInvoke, projectDialog, closeProjects, selectProject, openModelSettings, send, finished, requests, run, setFixture } = options;
  const fixture = createProviderAgentFixture(requests), projectId = 'native-provider-agent', directory = resolve(run, '多模型工具项目');
  const snapshot = () => projectInvoke('project_snapshot');
  async function permissions(read) {
    await click('#desktop-agent-tools');
    for (const [selector, value] of [['#desktop-agent-read', read], ['#desktop-agent-share', false]]) {
      if (await inspect('return document.querySelector(arguments[0]).checked', [selector]) !== value) await click(selector);
    }
    await click('#desktop-agent-done');
  }
  async function connect(provider) {
    fixture.next(provider);
    await openModelSettings();
    await until(() => inspect('return !document.querySelector(arguments[0]).disabled', [`[data-provider-id="${provider}"]`]), 'provider ready');
    await click(`[data-provider-id="${provider}"]`);
    if (await inspect('return !document.querySelector("#desktop-connection-editor").open')) await click('#desktop-connection-editor-toggle');
    await until(() => inspect('return !document.querySelector("#desktop-provider-key").disabled'), 'credential ready');
    await fill('#desktop-provider-key', `native-${provider}-fake-key`); await click('#desktop-provider-connect');
    const selector = `#desktop-preferences .desktop-model-panel [data-model-id="${agentProviderFixtures[provider].model}"]`;
    await until(() => find(selector), 'provider catalog'); await click(selector);
    await until(() => inspect('return document.querySelector(arguments[0]).getAttribute("aria-pressed")==="true"', [selector]), 'model selected');
  }
  async function scenario(provider, prompt, steps) {
    const before = requests.length; fixture.next(provider, steps); await send(prompt);
    await until(() => requests.length > before, 'provider request'); await finished(); return requests.slice(before);
  }
  setFixture(fixture.handle);
  try {
    await command('POST', '/window/rect', { width: 1200, height: 850 });
    await mkdir(directory, { recursive: true });
    await writeFile(resolve(directory, 'app.json'), JSON.stringify({ pages: [] }));
    await writeFile(resolve(directory, 'project.config.json'), JSON.stringify({ appid: 'touristappid', projectname: 'Native provider fixture', miniprogramRoot: './' }));
    await projectInvoke('project_save', { project: { id: projectId, name: '多模型工具验收', directory, subject: 'personal' } });
    await projectDialog(); await click('#project-retry');
    await until(() => inspect('return [...document.querySelector("#desktop-project-select").options].some(o=>o.value===arguments[0]) && !document.querySelector("#project-retry").disabled', [projectId]), 'project loaded');
    await closeProjects(); await selectProject(projectId);
    for (const provider of ['anthropic', 'google']) {
      await checked(`${provider}: explicit connection and provider switch revoke native read/share grants`, async () => {
        await connect(provider);
        await click('#preferences-content-dismiss'); await until(() => inspect('return !document.querySelector("#desktop-preferences").open'), 'return to conversation after model selection');
        await click('#desktop-agent-tools');
        assert.equal(await inspect('return document.querySelector("#desktop-agent-read").checked || document.querySelector("#desktop-agent-share").checked'), false);
        assert.equal(await inspect('return document.querySelector("#desktop-agent-share").disabled'), true);
        await screenshot(`${provider}-permission-off`); await click('#desktop-agent-done'); await permissions(true);
      });
      await checked(`${provider}: actual local check saves artifact while upstream receives only withheld result`, async () => {
        const before = (await snapshot()).artifacts.length;
        const calls = await scenario(provider, `${provider}检查项目，不分享结果`, [{ kind: 'check' }, { text: `${provider}_LOCAL_SAVED` }]);
        assert.equal(calls.length, 2);
        const outputs = provider === 'anthropic'
          ? calls[1].messages.flatMap(message => Array.isArray(message.content) ? message.content.filter(part => part.type === 'tool_result') : [])
          : calls[1].contents.flatMap(content => content.parts.filter(part => part.functionResponse));
        assert.equal(outputs.length, 1); assert.match(JSON.stringify(outputs), /未授权读取内容/);
        assert.doesNotMatch(JSON.stringify(outputs), /artifactId|summary|ruleId/);
        const state = await snapshot(); assert.equal(state.artifacts.length, before + 1);
        assert.ok(state.artifacts.some(item => item.projectId === projectId && item.kind === 'check'));
        assert.equal(await inspect('return [...document.querySelectorAll("[data-component^=project-tool-]")].at(-1).dataset.toolState'), 'success');
        assert.doesNotMatch(await text('#desktopMessages'), /thoughtSignature|c3ludGhldGljLXNpZ25hdHVyZQ==/);
        // Google signatures must survive SDK-private continuation, never public text.
        if (provider === 'google') assert.match(JSON.stringify(calls[1].contents), /c3ludGhldGljLXNpZ25hdHVyZQ==/);
        await screenshot(`${provider}-local-report`);
      });
      await checked(`${provider}: stop cancels real upstream without deleting completed artifacts`, async () => {
        const before = (await snapshot()).artifacts.length, offset = requests.length;
        fixture.next(provider, [{ hold: true, text: `${provider}_STREAMING` }]); await send(`${provider}停止验收`);
        await until(() => requests.length > offset, 'stream starts'); await click('#desktopSend');
        await until(() => requests[offset].aborted, 'upstream aborted'); await finished();
        assert.equal((await snapshot()).artifacts.length, before);
      });
      await checked(`${provider}: provider error recovers by explicit retry with no repeated tool`, async () => {
        const before = (await snapshot()).artifacts.length;
        await scenario(provider, `${provider}错误恢复`, [{ error: true }]);
        const errorId = await inspect('return [...document.querySelectorAll("[data-component=message][data-state=error]")].at(-1).dataset.messageId');
        const retry = `[data-component="message"][data-message-id="${errorId}"] [data-action="retry"]`;
        await until(() => find(retry), 'error retry visible'); fixture.next(provider, [{ text: `${provider}_RECOVERED` }]); await click(retry);
        await until(async () => (await text('#desktopMessages')).includes(`${provider}_RECOVERED`), 'explicit retry recovered'); await finished();
        assert.equal((await snapshot()).artifacts.length, before); await screenshot(`${provider}-recovered`);
      });
    }
    await checked('Switching back to Anthropic revokes Google read grant', async () => {
      await connect('anthropic');
      await click('#preferences-content-dismiss'); await until(() => inspect('return !document.querySelector("#desktop-preferences").open'), 'return to conversation after provider switch');
      await click('#desktop-agent-tools');
      assert.equal(await inspect('return document.querySelector("#desktop-agent-read").checked || document.querySelector("#desktop-agent-share").checked'), false);
      await click('#desktop-agent-done');
    });
  } finally { setFixture(null); }
}
