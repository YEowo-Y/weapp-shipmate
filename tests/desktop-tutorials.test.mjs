import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(new URL('../desktop/package.json', import.meta.url));
const { JSDOM } = require('jsdom');
const ts = require('typescript');

function harness() {
  const dom = new JSDOM('<!doctype html><body><button id="trigger">更多功能</button><button id="fallback">返回</button></body>', { url: 'https://tauri.localhost/' });
  const { document, HTMLElement, HTMLMediaElement, HTMLDialogElement, Event } = dom.window;
  HTMLElement.prototype.getClientRects = function () { return this.hidden ? [] : [{}]; };
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new Event('close')); };
  let pauses = 0, plays = 0;
  HTMLMediaElement.prototype.pause = function () { this.pauseCount = (this.pauseCount || 0) + 1; pauses++; };
  HTMLMediaElement.prototype.play = function () { plays++; return Promise.resolve(); };
  const source = readFileSync(new URL('../desktop/src/tutorials.ts', import.meta.url), 'utf8').replace(/^import .*\r?\n/gm, '').replace('export function', 'function');
  const context = vm.createContext({ document, createActionButton(doc, label) { const button = doc.createElement('button'); button.textContent = label; return button; } });
  vm.runInContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText, context);
  const trigger = document.querySelector('#trigger'), fallback = document.querySelector('#fallback');
  const app = context.mountTutorials({ returnFocus: () => fallback });
  const find = selector => document.querySelector(selector);
  return { app, document, trigger, fallback, find, Event, get pauses() { return pauses; }, get plays() { return plays; } };
}

test('tutorials remain passive until opened and expose a named controllable video with full text', () => {
  const h = harness();
  assert.equal(h.find('video'), null);
  h.app.open(h.trigger);
  const video = h.find('video');
  assert.equal(h.app.element.getAttribute('aria-labelledby'), 'tutorials-title');
  assert.equal(video.controls, true);
  assert.equal(video.preload, 'none');
  assert.equal(video.autoplay, false);
  assert.equal(video.loop, false);
  assert.equal(h.plays, 0);
  assert.equal(video.getAttribute('src'), '/tutorials/preflight.mp4');
  assert.equal(video.getAttribute('poster'), '/tutorials/preflight.jpg');
  assert.equal(h.find('#tutorials-steps').children.length, 3);
  assert.match(h.find('#tutorials-steps').textContent, /运行项目预检.*阅读报告/);
  assert.match(h.find('#tutorials-note').textContent, /不能保证官方审核通过/);
  assert.equal(h.document.activeElement, h.find('#tutorials-title'));
});

test('switching tutorials pauses the old video and keeps saved-fact and handoff boundaries visible', () => {
  const h = harness(); h.app.open(h.trigger);
  const first = h.find('video');
  h.find('#tutorials-select-workflow').click();
  assert.equal(first.pauseCount, 1);
  assert.equal(h.find('video').getAttribute('src'), '/tutorials/workflow.mp4');
  assert.match(h.find('#tutorials-note').textContent, /不包含未保存草稿.*人工确认不等于官方平台已完成/);
  assert.equal(h.find('#tutorials-select-workflow').getAttribute('aria-pressed'), 'true');
  h.find('#tutorials-select-handoff').click();
  assert.match(h.find('#tutorials-steps').textContent, /复制 Markdown.*导出 Markdown/);
  assert.match(h.find('#tutorials-note').textContent, /不会自动改代码/);
  assert.equal(h.plays, 0);
});

test('video failure leaves readable steps and an obsolete video cannot corrupt a newer selection', () => {
  const h = harness(); h.app.open(h.trigger);
  const first = h.find('video');
  first.dispatchEvent(new h.Event('error'));
  assert.equal(h.find('#tutorials-status').hidden, false);
  assert.match(h.find('#tutorials-status').textContent, /完整文字步骤/);
  assert.equal(h.find('#tutorials-steps').children.length, 3);
  h.find('#tutorials-select-workflow').click();
  first.dispatchEvent(new h.Event('error'));
  assert.equal(h.find('#tutorials-status').hidden, true);
  assert.match(h.find('#tutorials-current-title').textContent, /导出准备清单/);
});

test('visible close and native Escape stop playback and restore visible trigger or fallback', () => {
  const h = harness(); h.app.open(h.trigger);
  const first = h.find('video');
  h.find('#tutorials-close').click();
  assert.ok(first.pauseCount > 0);
  assert.equal(h.app.element.open, false);
  assert.equal(h.document.activeElement, h.trigger);
  assert.equal(h.trigger.getAttribute('aria-expanded'), 'false');
  h.app.open(h.trigger); h.trigger.hidden = true;
  const next = h.find('video');
  h.app.element.dispatchEvent(new h.Event('cancel', { cancelable: true }));
  assert.ok(next.pauseCount > 0);
  h.app.element.close();
  assert.equal(h.document.activeElement, h.fallback);
});

test('reopening starts paused and destroy stops media without allowing the dialog to return', () => {
  const h = harness(); h.app.open(h.trigger);
  h.find('#tutorials-select-handoff').click(); h.app.close(); h.app.open(h.trigger);
  assert.equal(h.find('video').getAttribute('src'), '/tutorials/handoff.mp4');
  assert.equal(h.find('video').currentTime, 0);
  assert.equal(h.plays, 0);
  const video = h.find('video');
  h.app.destroy();
  assert.ok(video.pauseCount > 0);
  assert.equal(h.app.element.isConnected, false);
  h.app.open(h.trigger);
  assert.equal(h.app.element.isConnected, false);
});
