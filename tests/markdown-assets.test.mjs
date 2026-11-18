import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const asset = name => new URL(`../desktop/src/shared/components/vendor/markdown-it/${name}`, import.meta.url);
test('browser parser and source map match the audited official release bytes', () => {
  const hashes = {
    'markdown-it.esm.min.mjs': 'd5432491790141da046b1197353705db03264f40b5727f3b4b591f5aba193e30',
    'markdown-it.esm.min.mjs.map': 'b7a2e378f803958d214a8e5ed9f9c108e26c582c80c1b4dde4bcffac960f6efe',
    LICENSE: '792c48c5a849a15fdf9e37e8bcf9e6d1dd13b32b46c642a748a0a46a9919d473',
  };
  for (const [name, expected] of Object.entries(hashes)) {
    assert.equal(createHash('sha256').update(readFileSync(asset(name))).digest('hex'), expected, name);
  }
});

test('the browser bundle has attribution for every dependency named in its source map', () => {
  const map = JSON.parse(readFileSync(asset('markdown-it.esm.min.mjs.map'), 'utf8'));
  const dependencies = new Set(map.sources.filter(name => name.includes('node_modules/'))
    .map(name => name.split('node_modules/')[1].split('/')[0]));
  const notices = readFileSync(asset('THIRD-PARTY-NOTICES.txt'), 'utf8');
  assert.equal(dependencies.size, 5);
  for (const dependency of dependencies) assert.ok(notices.includes(`===== ${dependency} `), dependency);
  assert.match(notices, /Redistribution and use in source and binary forms/);
  assert.match(notices, /Permission is hereby granted/);
});
