import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import yaml from 'js-yaml';

const preview = new URL('../desktop/design-previews/', import.meta.url);
const read = path => readFileSync(new URL(path, preview), 'utf8');

test('each stage resolves to its own overview in flow order, including unknown URL recovery', async () => {
  const { STAGES, getStage, stageHref, renderStageLinks } = await import('../desktop/design-previews/stages.js');
  const flow = yaml.load(readFileSync(new URL('../flow.yaml', import.meta.url), 'utf8')).stages;
  assert.deepEqual(STAGES.map(stage => [stage.id, stage.title]), flow.map(stage => [stage.stage, stage.title]));
  const destinations = new Set();
  for (const stage of STAGES) {
    const destination = new URL(stageHref(stage.id), 'https://preview.invalid/');
    assert.equal(destination.pathname, '/stage-workspace.html');
    assert.equal(destination.searchParams.get('stage'), stage.id);
    assert.equal(getStage(destination.searchParams.get('stage')), stage);
    destinations.add(destination.href);
    const links = renderStageLinks(stage.id);
    assert.equal((links.match(/aria-current="page"/g) || []).length, 1);
    assert.match(links, new RegExp(`href="stage-workspace.html\\?stage=${stage.id}" aria-current="page"`));
  }
  assert.equal(destinations.size, 8);
  for (const unknown of [null, '', 'unknown', '__proto__', '<script>']) assert.equal(getStage(unknown).id, 'filing');
});

test('stage actions keep filing, category, domain, review and release paths distinct', async () => {
  const { STAGES, stageOverviewMarkup } = await import('../desktop/design-previews/stages.js');
  for (const stage of STAGES) {
    const html = stageOverviewMarkup(stage.id);
    assert.ok(html.includes(`<h1>${stage.title}</h1>`));
    assert.ok(html.includes('示例阶段'));
    assert.match(html, /返回上线工作台/);
  }
  assert.doesNotMatch(stageOverviewMarkup('filing'), /guided-step\.html/);
  assert.match(stageOverviewMarkup('domain'), /href="guided-step\.html"/);
  assert.match(stageOverviewMarkup('category'), /href="category-advisor\.html"/);
  assert.match(stageOverviewMarkup('review'), /href="explain\.html\?from=stage-workspace\.html%3Fstage%3Dreview"/);
  assert.match(stageOverviewMarkup('release'), /href="health-dashboard\.html\?from=stage-workspace\.html%3Fstage%3Drelease"/);
  assert.doesNotMatch(read('main-four-region.html'), /id="spine"|原型开关|示例进度/);
  assert.match(read('main-four-region.html'), /id="workspaceGuide"/);
  assert.match(read('stage-workspace.html'), /src="stage-workspace\.js"/);
});

function guideHarness() {
  const makeClassList = () => {
    const values = new Set();
    return { contains: key => values.has(key), toggle: (key, enabled) => enabled ? values.add(key) : values.delete(key) };
  };
  const steps = Array.from({ length: 5 }, () => {
    const checkbox = { checked: false };
    const number = { textContent: '' };
    const attrs = {};
    return { checkbox, number, attrs, classList: makeClassList(), querySelector: selector => selector === 'input' ? checkbox : number, setAttribute: (key, value) => { attrs[key] = value; }, removeAttribute: key => { delete attrs[key]; } };
  });
  const elements = Object.fromEntries(['pbar', 'ptext', 'steps', 'guideStatus', 'copyBtn'].map(id => [id, { style: {}, attrs: {}, events: {}, setAttribute(key, value) { this.attrs[key] = value; }, addEventListener(key, fn) { this.events[key] = fn; } }]));
  const context = vm.createContext({ document: { querySelectorAll: () => steps, getElementById: id => elements[id] } });
  const script = read('guided-step.html').match(/<script>\s*([^]*?)<\/script>/)[1];
  vm.runInContext(script, context);
  return { steps, elements, change(index, checked) { steps[index].checkbox.checked = checked; elements.steps.events.change({ target: { matches: () => true } }); } };
}

test('domain guide starts empty and marks only user-confirmed steps, without implying backend verification', () => {
  const source = read('guided-step.html');
  assert.match(source, /href="stage-workspace\.html\?stage=domain"/);
  assert.equal((source.match(/<input[^>]*type="checkbox"/g) || []).length, 5);
  assert.doesNotMatch(source, /我已经扫出来|会重新扫一遍|把后台截图拖进来|帮我复检|class="gstep done"/);
  const guide = guideHarness();
  assert.equal(guide.elements.pbar.attrs['aria-valuenow'], '0');
  assert.equal(guide.steps[0].attrs['aria-current'], 'step');
  guide.change(0, true);
  assert.equal(guide.elements.pbar.attrs['aria-valuenow'], '1');
  assert.equal(guide.steps[0].number.textContent, '✓');
  assert.equal(guide.steps[1].attrs['aria-current'], 'step');
  for (let index = 1; index < 5; index++) guide.change(index, true);
  assert.equal(guide.elements.pbar.attrs['aria-valuenow'], '5');
  assert.match(guide.elements.guideStatus.textContent, /未验证/);
  assert.equal(guide.steps.some(step => step.attrs['aria-current']), false);
  guide.change(0, false);
  assert.equal(guide.elements.pbar.attrs['aria-valuenow'], '4');
  assert.equal(guide.steps[0].number.textContent, '1');
  assert.equal(guide.steps[0].attrs['aria-current'], 'step');
});
