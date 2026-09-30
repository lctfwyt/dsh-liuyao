/**
 * 起卦模块单测：铜钱法映射、随机源可注入、大样本分布、入参校验。
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { COINS_PER_TOSS, TOSS_COUNT, castByCoins, normalizeLineValues, tossOnce } from '../lib/engine/cast.js';

/** 用固定序列驱动的随机源：返回 queue 中的下一个值（0 或 1）。 */
const sequenceRandom = (queue) => () => {
  const next = queue.shift();
  if (next === undefined) throw new Error('随机序列用尽');
  return next;
};

test('爻值 = 6 + 背数，且面数与背数自洽', () => {
  // 0 表示「背」。三背 → 老阳 9；三字 → 老阴 6；一背二字 → 少阳 7；二背一字 → 少阴 8。
  const cases = [
    { queue: [0, 0, 0], backs: 3, value: 9, label: '老阳（重）' },
    { queue: [1, 1, 1], backs: 0, value: 6, label: '老阴（交）' },
    { queue: [0, 1, 1], backs: 1, value: 7, label: '少阳' },
    { queue: [0, 0, 1], backs: 2, value: 8, label: '少阴' },
  ];
  for (const item of cases) {
    const toss = tossOnce({ randomIntFn: sequenceRandom([...item.queue]) });
    assert.equal(toss.faces.length, COINS_PER_TOSS);
    assert.equal(toss.faces.filter((face) => face === '背').length, item.backs);
    assert.equal(toss.backs, item.backs);
    assert.equal(toss.value, item.value);
    assert.equal(toss.label, item.label);
  }
});

test('完整起卦产生 6 爻且自初爻排序', () => {
  const queue = [0, 0, 0, 1, 1, 1, 0, 1, 1, 0, 0, 1, 1, 1, 1, 0, 0, 0];
  const cast = castByCoins({ randomIntFn: sequenceRandom(queue) });
  assert.equal(cast.tosses.length, TOSS_COUNT);
  assert.deepEqual(cast.values, [9, 6, 7, 8, 6, 9]);
  assert.deepEqual(cast.tosses.map((toss) => toss.position), [1, 2, 3, 4, 5, 6]);
});

test('大样本下背数分布近似 1:3:3:1', () => {
  const counts = { 0: 0, 1: 0, 2: 0, 3: 0 };
  const samples = 24000;
  for (let index = 0; index < samples; index += 1) {
    counts[tossOnce().backs] += 1;
  }
  // 理论期望各为 1/8、3/8、3/8、1/8；用 ±2% 的宽容差（3σ 约 0.9%）。
  const expected = [0.125, 0.375, 0.375, 0.125];
  for (const backs of [0, 1, 2, 3]) {
    const ratio = counts[backs] / samples;
    assert.ok(
      Math.abs(ratio - expected[backs]) < 0.02,
      `背数 ${backs} 的比例 ${ratio.toFixed(4)} 偏离期望 ${expected[backs]} 超过 2%`,
    );
  }
});

test('入参校验拒绝非法爻值', () => {
  assert.deepEqual(normalizeLineValues([6, 7, 8, 9, 7, 8]), [6, 7, 8, 9, 7, 8]);
  assert.deepEqual(normalizeLineValues(['6', '7', '8', 9, 7, 8]), [6, 7, 8, 9, 7, 8]);
  assert.throws(() => normalizeLineValues([6, 7, 8, 9, 7]), /收到 5 项/);
  assert.throws(() => normalizeLineValues('678978'), /长度 6 的数组/);
  assert.throws(() => normalizeLineValues(null), /长度 6 的数组/);
  assert.throws(() => normalizeLineValues([6, 7, 8, 9, 7, 5]), /lines\[5\]/);
  assert.throws(() => normalizeLineValues([6, 7, 8, 9, 7, 10]), /lines\[5\]/);
  assert.throws(() => normalizeLineValues([6, 7, 8, 9, 7, 'x']), /lines\[5\]/);
});
