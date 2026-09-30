/**
 * 基础表与卦构造的单测。
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  BRANCH_ELEMENT,
  EARTHLY_BRANCHES,
  HEAVENLY_STEMS,
  HEXAGRAM_NAMES,
  NAJIA,
  SIX_SPIRITS,
  TRIGRAMS,
  isClash,
  isCombine,
  isPunish,
  relativeOf,
  sexagenary,
  sexagenaryIndexOf,
  xunKongOfIndex,
} from '../lib/engine/tables.js';
import {
  allHexagrams,
  buildHexagramPair,
  changedLines,
  describeLines,
  interpretLineValue,
  nameOfTrigrams,
  trigramOf,
} from '../lib/engine/hexagram.js';

test('天干地支与五行表齐全', () => {
  assert.equal(HEAVENLY_STEMS.length, 10);
  assert.equal(EARTHLY_BRANCHES.length, 12);
  assert.equal(Object.keys(BRANCH_ELEMENT).length, 12);
  assert.equal(SIX_SPIRITS.length, 6);
  assert.equal(TRIGRAMS.length, 8);
});

test('六十四卦名唯一且覆盖 8×8', () => {
  const all = allHexagrams();
  assert.equal(all.length, 64);
  assert.equal(new Set(all.map((entry) => entry.name)).size, 64);
  assert.equal(all.filter((entry) => entry.pure).length, 8);
  // 抽查：上卦/下卦 → 卦名。
  assert.equal(nameOfTrigrams('乾', '乾'), '乾为天');
  assert.equal(nameOfTrigrams('乾', '坤'), '天地否');
  assert.equal(nameOfTrigrams('坤', '乾'), '地天泰');
  assert.equal(nameOfTrigrams('离', '乾'), '火天大有');
  assert.equal(nameOfTrigrams('乾', '离'), '天火同人');
  assert.equal(HEXAGRAM_NAMES['坎']['离'], '水火既济');
});

test('爻值 → 阴阳与动静', () => {
  assert.deepEqual(interpretLineValue(6), { value: 6, yinYang: 0, moving: true });
  assert.deepEqual(interpretLineValue(7), { value: 7, yinYang: 1, moving: false });
  assert.deepEqual(interpretLineValue(8), { value: 8, yinYang: 0, moving: false });
  assert.deepEqual(interpretLineValue(9), { value: 9, yinYang: 1, moving: true });
  assert.throws(() => interpretLineValue(5), /6\/7\/8\/9/);
});

test('三爻反查八卦与卦符顺序', () => {
  assert.equal(trigramOf([1, 1, 1]).name, '乾');
  assert.equal(trigramOf([0, 0, 0]).name, '坤');
  assert.equal(trigramOf([1, 0, 1]).name, '离');
  assert.equal(trigramOf([0, 1, 0]).name, '坎');
  const described = describeLines([1, 0, 1, 1, 1, 1]);
  assert.equal(described.name, '天火同人');
  // 卦符按「上卦在上」书写。
  assert.equal(described.symbol, '☰☲');
  assert.equal(described.structure, '离下乾上');
});

test('变卦：老阳变阴、老阴变阳，少阳少阴不动', () => {
  const values = [9, 7, 8, 6, 7, 8];
  const pair = buildHexagramPair(values);
  assert.deepEqual(pair.lines, [1, 1, 0, 0, 1, 0]);
  assert.deepEqual(pair.moving, [true, false, false, true, false, false]);
  assert.deepEqual(changedLines(pair.lines, pair.moving), [0, 1, 0, 1, 1, 0]);
  assert.equal(pair.staticHexagram, false);
  assert.notEqual(pair.changed.name, null);
});

test('六爻安静时变卦为 null 且显式标注', () => {
  const pair = buildHexagramPair([7, 8, 7, 8, 7, 8]);
  assert.equal(pair.staticHexagram, true);
  assert.equal(pair.changed, null);
  assert.equal(pair.primary.changed, false);
});

test('六十甲子序与反查', () => {
  assert.equal(sexagenary(0).text, '甲子');
  assert.equal(sexagenary(59).text, '癸亥');
  assert.equal(sexagenary(54).text, '戊午');
  assert.equal(sexagenaryIndexOf('甲', '子'), 0);
  assert.equal(sexagenaryIndexOf('癸', '亥'), 59);
  assert.equal(sexagenaryIndexOf('甲', '丑'), undefined);
});

test('六亲由宫五行与爻支定', () => {
  // 乾宫属金：子水=子孙、寅木=妻财、辰土=父母、午火=官鬼、申金=兄弟、戌土=父母。
  assert.equal(relativeOf('金', '子'), '子孙');
  assert.equal(relativeOf('金', '寅'), '妻财');
  assert.equal(relativeOf('金', '辰'), '父母');
  assert.equal(relativeOf('金', '午'), '官鬼');
  assert.equal(relativeOf('金', '申'), '兄弟');
  assert.equal(relativeOf('金', '戌'), '父母');
  // 坤宫属土：子水=妻财、寅木=官鬼、巳火=父母。
  assert.equal(relativeOf('土', '子'), '妻财');
  assert.equal(relativeOf('土', '寅'), '官鬼');
  assert.equal(relativeOf('土', '巳'), '父母');
});

test('旬空由日柱旬序推得', () => {
  assert.deepEqual(xunKongOfIndex(0).kong, ['戌', '亥']);   // 甲子旬
  assert.deepEqual(xunKongOfIndex(9).kong, ['戌', '亥']);
  assert.deepEqual(xunKongOfIndex(10).kong, ['申', '酉']);  // 甲戌旬
  assert.deepEqual(xunKongOfIndex(50).kong, ['子', '丑']);  // 甲寅旬
  assert.deepEqual(xunKongOfIndex(59).kong, ['子', '丑']);
});

test('冲 / 合 / 刑', () => {
  assert.equal(isClash('子', '午'), true);
  assert.equal(isClash('子', '丑'), false);
  assert.equal(isCombine('子', '丑'), true);
  assert.equal(isCombine('午', '未'), true);
  assert.equal(isPunish('子', '卯'), true);
  assert.equal(isPunish('辰', '辰'), true);
  assert.equal(isPunish('子', '丑'), false);
});

test('纳甲表覆盖八卦且内三爻外三爻齐备', () => {
  for (const trigram of TRIGRAMS) {
    const entry = NAJIA[trigram.name];
    assert.ok(entry, `纳甲表缺 ${trigram.name}`);
    assert.equal(entry.inner.length, 3);
    assert.equal(entry.outer.length, 3);
    for (const ganzhi of [...entry.inner, ...entry.outer]) {
      assert.match(ganzhi, /^[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]$/u);
    }
  }
  assert.deepEqual(NAJIA['乾'].inner, ['甲子', '甲寅', '甲辰']);
  assert.deepEqual(NAJIA['乾'].outer, ['壬午', '壬申', '壬戌']);
  assert.deepEqual(NAJIA['坤'].inner, ['乙未', '乙巳', '乙卯']);
  assert.deepEqual(NAJIA['坤'].outer, ['癸丑', '癸亥', '癸酉']);
});
