import test from 'node:test';
import vm from 'node:vm';
import { URLSearchParams } from 'node:url';
import { settingsHref, getCommandGroups } from '../desktop/design-previews/navigation.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mountOnboarding } from '../desktop/design-previews/onboarding.js';
import { mountMemoryFilters } from '../desktop/design-previews/memory.js';

test('real memory cards use the same filter category as their visible type label', () => {
  const html = readFileSync(new URL('../desktop/design-previews/memory.html', import.meta.url), 'utf8');
  const entries = [...html.matchAll(/class="mem-card" data-memory-type="([^"]+)"[^]*?class="mtype mtype--([^"]+)"/g)];
  assert.equal(entries.length, 6);
  for (const [, category, label] of entries) assert.equal(category, label === 'ref' ? 'reference' : label);
});

class Control {
  constructor({ value = '', text = '', category = '' } = {}) {
    this.value = value;
    this.textContent = text;
    this.dataset = { memoryType: category };
    this.hidden = false;
    this.attributes = {};
    this.events = new Map();
    this.classList = { toggle() {} };
  }
  addEventListener(event, callback) { this.events.set(event, callback); }
  setAttribute(name, value) { this.attributes[name] = value; }
  focus() { this.focused = true; }
  fire(event) { let prevented = false; this.events.get(event)?.({ preventDefault() { prevented = true; } }); return prevented; }
}

test('onboarding reflects the selected lifecycle and submits to its named destination', () => {
  const form = new Control();
  const button = new Control();
  const detail = new Control();
  let choice = 'new';
  const document = {
    getElementById: id => ({ 'onboarding-form': form, 'start-label': button, 'start-description': detail })[id],
    querySelector: () => ({ value: choice }),
  };
  const visits = [];
  mountOnboarding(document, url => visits.push(url));
  assert.match(button.textContent, /上线工作台/);
  assert.match(detail.textContent, /示例项目/);
  assert.equal(form.fire('submit'), true);
  choice = 'live';
  form.fire('change');
  assert.match(button.textContent, /健康检查/);
  assert.match(detail.textContent, /示例/);
  form.fire('submit');
  assert.deepEqual(visits, ['main-four-region.html', 'health-dashboard.html']);
});

test('onboarding safely defaults to the launch workspace if the native choice is absent', () => {
  const form = new Control();
  const document = { getElementById: id => id === 'onboarding-form' ? form : new Control(), querySelector: () => null };
  let destination;
  mountOnboarding(document, url => { destination = url; });
  form.fire('submit');
  assert.equal(destination, 'main-four-region.html');
});

function memoryHarness() {
  const search = new Control();
  const count = new Control();
  const empty = new Control();
  const reset = new Control();
  const items = [
    ['project', 'ICP 备案待完成', '项目资料'],
    ['project', '使用用户头像', '项目资料'],
    ['user', '偏好简体中文', '用户偏好'],
    ['reference', 'ICP 备案指南', '参考链接'],
  ].map(([category, text, meta]) => {
    const card = new Control({ category });
    card.querySelector = selector => new Control({ text: selector === '.mem-card__body' ? text : meta });
    return card;
  });
  const filters = ['all', 'project', 'user', 'feedback', 'reference'].map(category => {
    const filter = new Control({ category });
    filter.count = new Control();
    filter.querySelector = () => filter.count;
    return filter;
  });
  const document = {
    getElementById: id => ({ 'memory-search': search, 'memory-count': count, 'memory-empty': empty, 'memory-reset': reset })[id],
    querySelectorAll: selector => selector === '.mem-card' ? items : filters,
  };
  mountMemoryFilters(document);
  const visible = () => items.filter(card => !card.hidden);
  return { search, count, empty, reset, items, filters, visible };
}

test('memory keyword and category filters combine, including case and whitespace normalization', () => {
  const h = memoryHarness();
  assert.equal(h.visible().length, 4);
  h.search.value = '  icp  备案 ';
  h.search.fire('input');
  assert.equal(h.visible().length, 2);
  h.filters[1].fire('click');
  assert.deepEqual(h.visible(), [h.items[0]]);
  assert.equal(h.filters[1].attributes['aria-pressed'], 'true');
  assert.equal(h.filters[0].attributes['aria-pressed'], 'false');
  assert.match(h.count.textContent, /1.*4/);
  assert.equal(h.filters[4].count.textContent, '1');
});

test('memory empty state resets both filters and returns focus to search', () => {
  const h = memoryHarness();
  h.filters[2].fire('click');
  h.search.value = '备案';
  h.search.fire('input');
  assert.equal(h.visible().length, 0);
  assert.equal(h.empty.hidden, false);
  assert.equal(h.reset.hidden, false);
  h.reset.fire('click');
  assert.equal(h.search.value, '');
  assert.equal(h.search.focused, true);
  assert.equal(h.visible().length, 4);
  assert.equal(h.empty.hidden, true);
  assert.equal(h.reset.hidden, true);
  assert.equal(h.filters[0].attributes['aria-pressed'], 'true');
});

test('memory browser search-clear event restores the chosen category without discarding it', () => {
  const h = memoryHarness();
  h.filters[1].fire('click');
  h.search.value = 'missing';
  h.search.fire('input');
  h.search.value = '';
  h.search.fire('search');
  assert.deepEqual(h.visible(), h.items.slice(0, 2));
  assert.equal(h.filters[1].attributes['aria-pressed'], 'true');
});

test('onboarding settings round trip preserves only known lifecycle choices', () => {
  for (const status of ['new', 'live', 'unknown']) {
    const form = new Control(); const settings = new Control();
    const choices = { new: { value: 'new', checked: true }, live: { value: 'live', checked: false } };
    const root = {
      getElementById: id => id === 'onboarding-form' ? form : id === 'onboarding-settings' ? settings : new Control(),
      querySelector: selector => selector.includes(':checked') ? Object.values(choices).find(choice => choice.checked) : choices[selector.includes('"live"') ? 'live' : 'new'],
    };
    const visits = [];
    mountOnboarding(root, url => visits.push(url), `?status=${status}`);
    const expected = status === 'live' ? 'live' : 'new';
    assert.equal(choices[expected].checked, true);
    assert.equal(new URL(settings.href, 'https://preview.invalid').searchParams.get('from'), `first-run.html?status=${expected}`);
    form.fire('submit');
    assert.equal(visits[0], expected === 'live' ? 'health-dashboard.html' : 'main-four-region.html');
    choices.new.checked = false; choices.live.checked = true; form.fire('change');
    assert.equal(new URL(settings.href, 'https://preview.invalid').searchParams.get('from'), 'first-run.html?status=live');
  }
});


test('runtime choice updates the shared navigation URL without new history or storage', () => {
  const source = readFileSync(new URL('../desktop/design-previews/onboarding.js', import.meta.url), 'utf8').replace('export function', 'function');
  const form = new Control(); const settings = new Control();
  const choices = { new: { value: 'new', checked: true }, live: { value: 'live', checked: false } };
  const document = {
    getElementById: id => id === 'onboarding-form' ? form : id === 'onboarding-settings' ? settings : new Control(),
    querySelector: selector => selector.includes(':checked') ? Object.values(choices).find(choice => choice.checked) : choices[selector.includes('"live"') ? 'live' : 'new'],
  };
  const location = { pathname: '/first-run.html', search: '?status=unknown', hash: '#welcome' };
  const state = { retained: 'history state' }; const replacements = [];
  const history = { state, replaceState(next, title, path) {
    assert.equal(next, state); assert.equal(title, ''); replacements.push(path);
    const url = new URL(path, 'https://preview.invalid'); location.search = url.search;
  }, pushState() { assert.fail('must not push history'); } };
  vm.runInNewContext(source, { document, location, history, URLSearchParams });
  assert.equal(location.search, '?status=new');
  for (const choice of ['live', 'new']) {
    choices.new.checked = choice === 'new'; choices.live.checked = choice === 'live'; form.fire('change');
    assert.equal(location.search, `?status=${choice}`);
    const target = settingsHref(location.pathname, '', location.search);
    assert.equal(new URL(target, 'https://preview.invalid').searchParams.get('from'), `first-run.html?status=${choice}`);
    const commandTarget = getCommandGroups(location.pathname, location.search).flatMap(([, items]) => items).find(([label]) => label === '偏好与连接')[1];
    assert.equal(commandTarget, target);
    assert.equal(replacements.at(-1), `/first-run.html?status=${choice}#welcome`);
  }
  assert.equal(replacements.length, 3);
});
