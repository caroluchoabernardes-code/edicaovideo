// Testes das regras de triagem: node test/triage.test.js
const assert = require('assert');
const { classify, triageAll } = require('../src/triage');

const base = { width: 1080, height: 1920, durationSec: 30, hasAudio: true, tags: {} };

assert.strictEqual(classify({ ...base, name: 'reels_microbiota_final.mp4' }).status, 'pronto');
assert.strictEqual(classify({ ...base, name: 'x.mp4', tags: { encoder: 'CapCut' } }).status, 'pronto');
assert.strictEqual(classify({ ...base, name: 'IMG_4521.MOV' }).status, 'bruto');
assert.strictEqual(classify({ ...base, name: 'treino.mov', tags: { 'com.apple.quicktime.make': 'Apple' } }).status, 'bruto');
assert.strictEqual(classify({ ...base, name: 'sem pista.mp4' }).status, 'revisar');
assert.strictEqual(classify({ ...base, name: 'IMG_1.MOV', durationSec: 1.5 }).status, 'revisar');
assert.strictEqual(classify({ ...base, name: 'IMG_1.MOV', hasAudio: false }).status, 'revisar');
assert.strictEqual(classify({ name: 'quebrado.mp4', error: 'Arquivo ilegível' }).status, 'revisar');

const vids = triageAll([
  { ...base, id: 'a', name: 'IMG_1.MOV', hash: 'h1', size: 1000, addedAt: 1 },
  { ...base, id: 'b', name: 'copia.MOV', hash: 'h1', size: 1000, addedAt: 2 },
  { ...base, id: 'c', name: 'IMG_2.MOV', hash: 'h2', size: 1010, addedAt: 3 },
  { ...base, id: 'd', name: 'IMG_3.MOV', hash: 'h3', size: 5000, durationSec: 60, addedAt: 4, manual: true, status: 'pronto' },
]);
const by = Object.fromEntries(vids.map((v) => [v.id, v]));
assert.strictEqual(by.a.status, 'bruto');
assert.strictEqual(by.b.status, 'duplicado');
assert.strictEqual(by.c.status, 'duplicado'); // quase idêntico (mesma duração/resolução, tamanho ~1%)
assert.strictEqual(by.d.status, 'pronto'); // escolha manual é preservada
assert.strictEqual(by.d.autoStatus, 'bruto');

console.log('Triagem: todos os testes passaram ✔');
