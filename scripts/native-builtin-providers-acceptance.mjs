// Synthetic upstream protocols only. The native suite uses the real connection
// UI, Rust IPC, credential broker, stream parser, and persisted conversation.
import assert from 'node:assert/strict';

export const builtinProviderFixtures = Object.freeze({
  deepseek: { name: 'DeepSeek', model: 'deepseek-flash', catalog: '/models', chat: '/chat/completions' },
  glm: { name: 'GLM', model: 'glm-5.2', catalog: null, chat: '/api/paas/v4/chat/completions' },
  kimi: { name: 'Kimi', model: 'kimi-k2.6', catalog: '/v1/models', chat: '/v1/chat/completions' },
});

export function createBuiltinProviderFixture(requests) {
  const steps = new Map(), catalogs = [], calls = [], failures = [];
  const frame = value => `data: ${JSON.stringify(value)}\n\n`;
  return {
    catalogs, calls, failures,
    next(provider, values) { assert.ok(builtinProviderFixtures[provider]); steps.set(provider, [...values]); },
    async handle(req, res) {
      const url = new URL(req.url, 'http://127.0.0.1');
      const entry = Object.entries(builtinProviderFixtures).find(([, value]) => [value.catalog, value.chat].includes(url.pathname));
      if (!entry) return false;
      const [provider, config] = entry;
      calls.push({ provider, method: req.method, path: url.pathname });
      try {
        if (req.headers.authorization !== `Bearer native-${provider}-fake-key`) {
          res.writeHead(401, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: { message: 'Synthetic rejected credential' } })); return true;
        }
        if (url.pathname === config.catalog) {
          assert.equal(req.method, 'GET'); catalogs.push(provider);
          const models = [{ id: config.model }];
          if (provider === 'kimi') models.push({ id: 'kimi-k3.1-pro' });
          res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ data: models })); return true;
        }
        assert.equal(req.method, 'POST');
        let raw = ''; for await (const chunk of req) raw += chunk;
        const body = JSON.parse(raw), record = { ...body, protocol: provider, completed: false, aborted: false };
        requests.push(record);
        const step = steps.get(provider)?.shift(); assert.ok(step, 'Unplanned native provider inference');
        assert.equal(body.model, config.model); assert.equal(body.stream, true);
        assert.deepEqual(body.thinking, { type: 'disabled' });
        const budgetKey = provider === 'kimi' ? 'max_completion_tokens' : 'max_tokens';
        assert.ok(Number.isInteger(body[budgetKey]) && body[budgetKey] >= 1 && body[budgetKey] <= 2048);
        assert.equal(body[provider === 'kimi' ? 'max_tokens' : 'max_completion_tokens'], undefined);
        assert.equal(body.tools, undefined);
        if (step.error) { record.failed = true; res.writeHead(503); res.end('Synthetic provider failure'); return true; }
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.on('close', () => { if (!record.completed) record.aborted = true; });
        res.write(frame({ choices: [{ index: 0, delta: { reasoning_content: 'PRIVATE_SYNTHETIC_REASONING' }, finish_reason: null }] }));
        res.write(frame({ choices: [{ index: 0, delta: { content: step.text || `${provider}_SYNTHETIC_REPLY` }, finish_reason: null }] }));
        if (step.hold) {
          await new Promise(resolve => {
            const timer = setTimeout(() => { res.destroy(); resolve(); }, 30_000);
            res.once('close', () => { clearTimeout(timer); resolve(); });
          });
        } else {
          res.write(frame({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }));
          record.completed = true; res.end('data: [DONE]\n\n');
        }
        return true;
      } catch (error) {
        failures.push(error.message); if (!res.headersSent) res.writeHead(500); res.end('Synthetic fixture assertion failed'); return true;
      }
    },
  };
}

export async function checkBuiltinProviderFlows(options) {
  const { checked, click, fill, press, inspect, text, find, command, until, screenshot, openModelSettings, send, finished, requests, quit, launch, setFixture } = options;
  const fixture = createBuiltinProviderFixture(requests);
  const monitorErrors = () => inspect('window.__builtinProviderErrors=[];window.addEventListener("error",e=>window.__builtinProviderErrors.push(e.message));window.addEventListener("unhandledrejection",e=>window.__builtinProviderErrors.push(String(e.reason?.message||e.reason)));');
  const selectProvider = async provider => {
    if (!await inspect('return document.querySelector("#desktop-model-dialog").open')) await openModelSettings();
    await until(() => inspect('return !document.querySelector(arguments[0]).disabled', [`[data-provider-id="${provider}"]`]), 'provider enabled');
    await click(`[data-provider-id="${provider}"]`);
  };
  setFixture(fixture.handle);
  try {
    await monitorErrors();
    await command('POST', '/window/rect', { width: 1200, height: 850 });
    await checked('DeepSeek, GLM and Kimi appear with named native controls and vendored icons', async () => {
      await openModelSettings();
      await until(() => inspect('return !document.querySelector("[data-provider-id=deepseek]").disabled'), 'built-in connections ready');
      for (const [provider, config] of Object.entries(builtinProviderFixtures)) {
        const selector = `#desktop-model-dialog nav [data-provider-id="${provider}"]`;
        assert.ok((await text(selector)).includes(config.name));
        assert.equal(await inspect('const b=document.querySelector(arguments[0]);return b.tagName==="BUTTON" && Boolean(b.querySelector(".provider-brand"));', [selector]), true);
      }
      await screenshot('builtin-provider-navigation');
    });
    for (const [provider, config] of Object.entries(builtinProviderFixtures)) {
      await checked(`${provider}: key validation is honest and configuration never starts inference`, async () => {
        await selectProvider(provider); const count = requests.length, callCount = fixture.calls.length;
        await fill('#desktop-provider-key', 'native-invalid-fake-key'); await click('#desktop-provider-connect');
        if (provider === 'glm') {
          await until(() => find(`#desktop-model-dialog [data-model-id="${config.model}"]`), 'local GLM presets');
          assert.equal(fixture.calls.length, callCount, 'saving GLM presets performs no undocumented catalog request');
          assert.match(await text('#desktop-provider-status'), /未验证|尚未|配置/);
          await click(`#desktop-model-dialog [data-model-id="${config.model}"]`); await openModelSettings(); await selectProvider(provider);
          await click('#desktop-provider-verify');
          await until(async () => /未完成|权限/.test(await text('#desktop-inference-status')), 'explicit GLM test detects invalid credential');
          assert.doesNotMatch(await text('#desktop-inference-status'), /已通过/);
          assert.equal(fixture.calls.at(-1).path, config.chat);
          if (!await inspect('return document.querySelector("#desktop-connection-editor").open')) await click('#desktop-connection-editor-toggle');
        } else {
          await until(() => inspect('return document.querySelector("#desktop-provider-status").dataset.tone === "error" && !document.querySelector("#desktop-provider-key").disabled'), 'invalid key feedback');
        }
        assert.equal(await inspect('return document.querySelector("#desktop-provider-key").value'), '');
        await fill('#desktop-provider-key', `native-${provider}-fake-key`); await click('#desktop-provider-connect');
        await until(() => find(`#desktop-model-dialog [data-model-id="${config.model}"]`), 'built-in catalog');
        assert.equal(requests.length, count, 'connecting never starts valid inference');
        assert.equal(await inspect('return document.querySelector("#desktop-provider-key").value'), '');
        if (provider === 'kimi') assert.equal(await inspect('return Boolean(document.querySelector("#desktop-model-dialog [data-model-id=\\"kimi-k3.1-pro\\"]"))'), false);
        await screenshot(`${provider}-connected`);
        await click(`#desktop-model-dialog [data-model-id="${config.model}"]`);
        await until(() => inspect('return !document.querySelector("#desktop-model-dialog").open'), 'model selection closes dialog');
      });
      await checked(`${provider}: selected model streams public reply through real native transport`, async () => {
        const before = requests.length; fixture.next(provider, [{ text: `${provider}_中文回复` }]);
        await send(`${provider} 原生文本验收`); await until(() => requests.length > before, 'native provider inference'); await finished();
        assert.equal(requests.at(-1).protocol, provider); assert.equal(requests.at(-1).model, config.model);
        assert.ok((await text('#desktopMessages')).includes(`${provider}_中文回复`));
        assert.doesNotMatch(await text('#desktopMessages'), /PRIVATE_SYNTHETIC_REASONING|native-\w+-fake-key/);
      });
      await checked(`${provider}: stopping preserves partial text and cancels upstream`, async () => {
        const before = requests.length; fixture.next(provider, [{ hold: true, text: `${provider}_PARTIAL` }]);
        await send(`${provider} 停止验收`); await until(() => requests.length > before, 'held upstream');
        await until(async () => (await text('#desktopMessages')).includes(`${provider}_PARTIAL`), 'partial text visible');
        await click('#desktopSend'); await until(() => requests.at(-1).aborted, 'upstream canceled'); await finished();
        assert.ok((await text('#desktopMessages')).includes(`${provider}_PARTIAL`));
      });
      await checked(`${provider}: provider error has explicit retry and recovers`, async () => {
        const before = requests.length; fixture.next(provider, [{ error: true }]);
        await send(`${provider} 错误恢复验收`); await until(() => requests.length > before, 'failed inference'); await finished();
        const messageId = await inspect('return [...document.querySelectorAll("[data-component=message][data-state=error]")].at(-1).dataset.messageId');
        fixture.next(provider, [{ text: `${provider}_RECOVERED` }]);
        await click(`[data-component="message"][data-message-id="${messageId}"] [data-action="retry"]`);
        await until(async () => (await text('#desktopMessages')).includes(`${provider}_RECOVERED`), 'explicit retry succeeds'); await finished();
        assert.equal(requests.length, before + 2); await screenshot(`${provider}-recovered`);
      });
    }
    await checked('Provider dialog fits 390px with named controls, modal focus and keyboard dismissal', async () => {
      await openModelSettings(); await command('POST', '/window/rect', { width: 390, height: 844 });
      for (const provider of Object.keys(builtinProviderFixtures)) {
        await selectProvider(provider);
        await until(() => inspect('const b=document.querySelector(arguments[0]),n=b.parentElement.getBoundingClientRect(),r=b.getBoundingClientRect();return r.left>=n.left && r.right<=n.right+1;', [`[data-provider-id="${provider}"]`]), 'selected provider label is fully visible');
        assert.equal(await inspect('const d=document.querySelector("#desktop-model-dialog"), r=d.getBoundingClientRect();return r.left>=0 && r.right<=innerWidth+1 && d.scrollWidth<=d.clientWidth+1 && document.documentElement.scrollWidth<=innerWidth;'), true);
        assert.equal(await inspect('const input=document.querySelector("#desktop-model-search"),icon=input.parentElement.querySelector(".app-icon");return input.getBoundingClientRect().left+parseFloat(getComputedStyle(input).paddingLeft)>=icon.getBoundingClientRect().right+4;'), true, 'search text leaves space for its icon');
        await screenshot(`${provider}-connection-narrow`);
      }
      for (let i = 0; i < 10; i++) {
        await press('\uE004');
        const focus = await inspect('const d=document.querySelector("#desktop-model-dialog"), a=document.activeElement, s=a?.shadowRoot?.activeElement;return {contained:d.contains(a),dialogOpen:d.open,dialogModal:d.matches(":modal"),documentFocused:document.hasFocus(),activeTag:a?.tagName,activeId:a?.id,activeClass:a?.className,shadowActiveTag:s?.tagName,shadowActiveId:s?.id};');
        assert.equal(focus.contained, true, `Tab ${i + 1} escaped model dialog: ${JSON.stringify(focus)}`);
      }
      await press('\uE00C'); await until(() => inspect('return !document.querySelector("#desktop-model-dialog").open'), 'keyboard dismissal');
      await command('POST', '/window/rect', { width: 1200, height: 850 });
    });
    await checked('Restart retains conversation and selected model without restoring temporary keys or issuing inference', async () => {
      assert.deepEqual(await inspect('return window.__builtinProviderErrors'), []);
      const count = requests.length; await fill('#desktopInput', '重启保留的模型草稿'); await quit(); await launch(); await monitorErrors();
      assert.equal(await inspect('return document.querySelector("#desktopInput").value'), '重启保留的模型草稿');
      assert.ok((await text('#desktopMessages')).includes('kimi_RECOVERED'));
      assert.match(await text('#desktopComposer .agent-composer__model'), /kimi-k2\.6/);
      await openModelSettings();
      for (const provider of Object.keys(builtinProviderFixtures)) {
        await selectProvider(provider);
        assert.equal(await inspect('return document.querySelector("#desktop-provider-key").value'), '');
        assert.equal(await inspect('return document.querySelector("#desktop-provider-refresh").hidden'), true);
      }
      assert.equal(requests.length, count); await screenshot('builtin-provider-restart'); await click('#desktop-model-close');
      assert.deepEqual(await inspect('return window.__builtinProviderErrors'), []);
    });
    assert.deepEqual(fixture.failures, []);
  } finally { setFixture(null); }
}
