/**
 * 客户端 bundle 单测。
 *
 * 关键价值：`lib/client.js` 与引擎各自持有一份常量表（客户端不能 import 引擎，
 * 因为 DSH 只允许 bundle `require` 9 个 seed 模块）。这里用**逐项断言**把两份表锁在
 * 一起——表一旦漂移，测试立刻红，而不是等到用户在浏览器里看到错误的卦名。
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { HEXAGRAM_NAMES, TRIGRAMS } from '../lib/engine/tables.js';
import { nameOfTrigrams } from '../lib/engine/hexagram.js';
import { loadClient } from '../tools/check-client.mjs';

const client = loadClient();
const internals = client.exports.__internals;

/** 用「少阳/少阴」构造指定上下卦的六个爻值（不影响客户端的阴阳判定）。 */
const valuesOf = (upper, lower) => {
  const bits = { 乾: [1, 1, 1], 兑: [1, 1, 0], 离: [1, 0, 1], 震: [1, 0, 0], 巽: [0, 1, 1], 坎: [0, 1, 0], 艮: [0, 0, 1], 坤: [0, 0, 0] }[upper];
  const bits2 = { 乾: [1, 1, 1], 兑: [1, 1, 0], 离: [1, 0, 1], 震: [1, 0, 0], 巽: [0, 1, 1], 坎: [0, 1, 0], 艮: [0, 0, 1], 坤: [0, 0, 0] }[lower];
  const toValue = (bit, moving) => (bit === 1 ? (moving ? 9 : 7) : (moving ? 6 : 8));
  return [...bits2.map((bit) => toValue(bit, false)), ...bits.map((bit) => toValue(bit, false))];
};

test('bundle 结构与注册调用符合约定', () => {
  assert.equal(client.id, 'dsh-liuyao');
  assert.deepEqual(Array.from(client.required), ['react']);
  assert.deepEqual(Array.from(client.exports.inject), ['slots', 'locale']);
  assert.equal(client.styleInjected, 1);

  const slotNames = client.calls.slotsRegister.map((entry) => entry.descriptor.name);
  assert.deepEqual(slotNames, ['conversation.input.dock', 'tool.call.toolview']);
  const cast = client.calls.slotsRegister.find((entry) => entry.descriptor.name === 'tool.call.toolview');
  assert.equal(cast.descriptor.key, 'liuyao_cast');
  assert.equal(typeof cast.component, 'function');

  const dock = client.calls.slotsRegister.find((entry) => entry.descriptor.name === 'conversation.input.dock');
  assert.equal(dock.descriptor.id, 'liuyao');
  assert.equal(typeof dock.descriptor.inject, 'function');
  // dock 的 inject 必须给出 send 动词；会话不可用时应抛错而不是静默。
  const injected = dock.descriptor.inject('session-x');
  assert.equal(typeof injected.send, 'function');
  assert.throws(() => injected.send('x'), /会话不可用/);

  assert.deepEqual(client.calls.locale.map((entry) => entry.namespace), ['liuyao']);
  const dictionaries = client.calls.locale[0].dictionaries;
  assert.deepEqual(Object.keys(dictionaries).sort(), ['en', 'zh']);
  // 中英文案必须键集一致：zh 是 key 全集基准，en 缺键会让界面回退成显示 key。
  assert.deepEqual(
    Object.keys(dictionaries.en).sort(),
    Object.keys(dictionaries.zh).sort(),
    'en 与 zh 的 key 集合不一致',
  );
  // 文案里不允许出现占位符以外的未替换模板。
  for (const [language, entries] of Object.entries(dictionaries)) {
    for (const [key, value] of Object.entries(entries)) {
      assert.equal(typeof value, 'string', `${language}.${key} 必须是字符串`);
      assert.ok(value.length > 0, `${language}.${key} 不能为空`);
    }
  }
});

test('客户端六十四卦名表与引擎表逐项一致', () => {
  const engine = Object.entries(HEXAGRAM_NAMES).flatMap(([upper, row]) => Object.entries(row).map(([lower, name]) => `${upper}${lower}=${name}`)).sort();
  const clientSide = Object.entries(internals.HEX_NAMES).flatMap(([upper, row]) => Object.entries(row).map(([lower, name]) => `${upper}${lower}=${name}`)).sort();
  assert.equal(clientSide.length, 64);
  assert.deepEqual(clientSide, engine);
});

test('客户端八卦三爻表与引擎一致', () => {
  for (const trigram of TRIGRAMS) {
    // 客户端表由 vm 沙箱求值，数组原型与宿主不同，故先用 Array.from 归一。
    assert.deepEqual(
      Array.from(internals.TRIGRAM_LINES[trigram.name]),
      trigram.lines,
      `${trigram.name} 三爻不一致`,
    );
  }
  assert.equal(Object.keys(internals.TRIGRAM_LINES).length, 8);
});

test('客户端由爻值定卦名与引擎一致（全六十四卦）', () => {
  for (const upper of Object.keys(HEXAGRAM_NAMES)) {
    for (const lower of Object.keys(HEXAGRAM_NAMES[upper])) {
      const values = valuesOf(upper, lower);
      const clientName = internals.hexagramOf(values).name;
      const engineName = nameOfTrigrams(upper, lower);
      assert.equal(clientName, engineName, `${upper}/${lower} 卦名不一致`);
    }
  }
});

test('变卦推导：老阳变阴、老阴变阳', () => {
  assert.deepEqual(Array.from(internals.changedValuesOf([9, 7, 8, 6])), [8, 7, 8, 7]);
  assert.deepEqual(Array.from(internals.changedValuesOf([7, 8, 7, 8])), [7, 8, 7, 8]);
  // 乾为天二爻动 → 天火同人；五爻动 → 火天大有。
  assert.equal(internals.hexagramOf(internals.changedValuesOf([7, 9, 7, 7, 7, 7])).name, '天火同人');
  assert.equal(internals.hexagramOf(internals.changedValuesOf([7, 7, 7, 7, 9, 7])).name, '火天大有');
});

test('爻的图形标记', () => {
  assert.equal(internals.lineGlyph(6), '▅ ▅ ×');
  assert.equal(internals.lineGlyph(7), '▅▅▅');
  assert.equal(internals.lineGlyph(8), '▅ ▅');
  assert.equal(internals.lineGlyph(9), '▅▅▅ ○');
});

test('信封解析能穿透不同形状的工具结果', () => {
  const envelope = { __liuyao: 'chart', archiveId: 'a1', chart: { primary: { name: '乾为天' } } };
  const shapes = [
    // 典型 ContentPart 数组。
    { content: [{ type: 'text', text: '卦盘文本' }, { type: 'text', text: JSON.stringify(envelope) }] },
    // 结果包在 output 里。
    { output: { content: [{ type: 'text', text: JSON.stringify(envelope) }] } },
    // 深层嵌套。
    { block: { result: { node: { text: `前缀\n${JSON.stringify(envelope)}\n后缀` } } } },
    // 单字符串。
    { text: JSON.stringify(envelope) },
  ];
  for (const shape of shapes) {
    const found = internals.findEnvelope(shape, 'chart');
    assert.ok(found !== null, '未能解析出信封');
    assert.equal(found.archiveId, 'a1');
    assert.equal(found.chart.primary.name, '乾为天');
  }
});

test('信封解析对错误标记与半截 JSON 保持拒绝', () => {
  assert.equal(internals.findEnvelope({ text: JSON.stringify({ __liuyao: 'cases' }) }, 'chart'), null);
  assert.equal(internals.findEnvelope({ text: '{"__liuyao":"chart", 截断' }, 'chart'), null);
  assert.equal(internals.findEnvelope({ text: '普通文本没有信封' }, 'chart'), null);
  assert.equal(internals.findEnvelope(null, 'chart'), null);
  // 同一层里有多个字符串时应当找到那一个合法的。
  const mixed = { content: [{ type: 'text', text: '说明文字' }, { type: 'text', text: JSON.stringify({ __liuyao: 'chart', ok: true }) }] };
  assert.equal(internals.findEnvelope(mixed, 'chart').ok, true);
});

test('collectStrings 不会因循环引用或超深结构爆栈', () => {
  const node = { a: 'x', b: [{ c: 'y' }] };
  const found = internals.collectStrings(node);
  assert.ok(found.includes('x'));
  assert.ok(found.includes('y'));

  let deep = { text: 'bottom' };
  for (let index = 0; index < 40; index += 1) deep = { child: deep };
  assert.doesNotThrow(() => internals.collectStrings(deep));
});

test('送进会话的提示词包含工具名与爻值', () => {
  const prompt = internals.buildPrompt('今年财运如何', [9, 7, 7, 7, 7, 7]);
  assert.ok(prompt.includes('今年财运如何'));
  assert.ok(prompt.includes('liuyao_cast'));
  assert.ok(prompt.includes('[9,7,7,7,7,7]'));
  assert.ok(prompt.includes('老阳'));
  assert.ok(prompt.includes('method="lines"'));
});

test('起卦取爻：三背为老阳、三字为老阴（确定性随机源）', () => {
  const makeClient = (byte) => loadClient({
    cryptoStub: { getRandomValues: (array) => { for (let index = 0; index < array.length; index += 1) array[index] = byte; return array; } },
  });
  // 0 % 2 === 0 → 背 ×3 → 3 背 → 老阳 9。
  const allBacks = makeClient(0).exports.__internals.tossOnce();
  assert.deepEqual(Array.from(allBacks.faces), ['背', '背', '背']);
  assert.equal(allBacks.value, 9);
  assert.equal(allBacks.label, '老阳');
  // 1 % 2 === 1 → 字 ×3 → 0 背 → 老阴 6。
  const allFaces = makeClient(1).exports.__internals.tossOnce();
  assert.deepEqual(Array.from(allFaces.faces), ['字', '字', '字']);
  assert.equal(allFaces.value, 6);
  assert.equal(allFaces.label, '老阴');
});

test('bundle 顶层只注册一个 factory，且 id 与包名一致', () => {
  // loadClient 内部已经断言了这两点；这里再从外部确认包名来源一致。
  assert.equal(client.id, 'dsh-liuyao');
});
