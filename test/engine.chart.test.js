/**
 * 八宫世应、纳甲装卦、伏神、变爻与格局的单测。
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildChart } from '../lib/engine/chart.js';
import { formatChartText } from '../lib/engine/format.js';
import { allHexagrams, describeLines } from '../lib/engine/hexagram.js';
import { najiaOf, spiritsOf, seasonalState } from '../lib/engine/najia.js';
import { PALACE_STEPS, allPalaceEntries, palaceOf, pureHexagramLines } from '../lib/engine/palace.js';
import { SIX_RELATIVES } from '../lib/engine/tables.js';

const AT = Date.parse('2024-06-15T12:00:00+08:00');

/** 用「少阳/少阴」全静态爻值精确构造指定上下卦的卦（不影响纳甲）。 */
const staticValuesOf = (upper, lower) => {
  const trigramValues = (name) => ({
    乾: [7, 7, 7], 兑: [7, 7, 8], 离: [7, 8, 7], 震: [7, 8, 8],
    巽: [8, 7, 7], 坎: [8, 7, 8], 艮: [8, 8, 7], 坤: [8, 8, 8],
  }[name]);
  return [...trigramValues(lower), ...trigramValues(upper)];
};

test('八宫卦序：8 宫 × 8 位恰好覆盖六十四卦且无重无漏', () => {
  const entries = allPalaceEntries();
  assert.equal(entries.length, 64);
  assert.equal(new Set(entries.map((entry) => entry.lines.join(''))).size, 64);
  assert.equal(PALACE_STEPS.length, 8);
});

test('乾宫八卦顺序与世应', () => {
  // 京房乾宫：乾为天、天风姤、天山遁、天地否、风地观、山地剥、火地晋、火天大有。
  const expected = ['乾为天', '天风姤', '天山遁', '天地否', '风地观', '山地剥', '火地晋', '火天大有'];
  const palace = allPalaceEntries().filter((entry) => entry.palace === '乾');
  const names = palace.map((entry) => describeLines(entry.lines).name);
  assert.deepEqual(names, expected);
  assert.deepEqual(palace.map((entry) => entry.stepName), ['八纯', '一世', '二世', '三世', '四世', '五世', '游魂', '归魂']);
  assert.deepEqual(palace.map((entry) => entry.shi), [6, 1, 2, 3, 4, 5, 4, 3]);
  assert.deepEqual(palace.map((entry) => entry.ying), [3, 4, 5, 6, 1, 2, 1, 6]);
  // 每一卦的八宫归属都与它所属的这一宫一致。
  for (const entry of palace) {
    assert.equal(palaceOf(entry.lines).palace, '乾');
  }
});

test('八宫五行：乾兑金、离火、震巽木、坎水、艮坤土', () => {
  const elements = Object.fromEntries(allPalaceEntries().map((entry) => [entry.palace, entry.palaceElement]));
  assert.deepEqual(elements, { 乾: '金', 兑: '金', 离: '火', 震: '木', 巽: '木', 坎: '水', 艮: '土', 坤: '土' });
});

test('八纯卦的内外卦都是本宫卦', () => {
  for (const name of ['乾', '坎', '艮', '震', '巽', '离', '坤', '兑']) {
    const lines = pureHexagramLines(name);
    assert.equal(lines.length, 6);
    const upper = lines.slice(3, 6);
    const lower = lines.slice(0, 3);
    const described = describeLines(lines);
    assert.equal(described.upper, name);
    assert.equal(described.lower, name);
    assert.deepEqual(upper, lower);
    assert.equal(described.name, `${name}为${name === '乾' ? '天' : name === '兑' ? '泽' : name === '离' ? '火' : name === '震' ? '雷' : name === '巽' ? '风' : name === '坎' ? '水' : name === '艮' ? '山' : '地'}`);
  }
});

test('全部六十四卦的世应都相隔三位（环形）', () => {
  for (const entry of allPalaceEntries()) {
    assert.ok(entry.shi >= 1 && entry.shi <= 6, `世爻越界：${entry.shi}`);
    assert.ok(entry.ying >= 1 && entry.ying <= 6, `应爻越界：${entry.ying}`);
    // 世应相隔三位：1↔4、2↔5、3↔6（八纯卦为世6应3，环上也正好隔三位）。
    const distance = (((entry.shi - entry.ying) % 6) + 6) % 6;
    assert.equal(distance, 3, `世${entry.shi} 应${entry.ying} 不相隔三位`);
  }
});

test('纳甲：乾为天逐爻干支', () => {
  assert.deepEqual(najiaOf('乾', '乾'), ['甲子', '甲寅', '甲辰', '壬午', '壬申', '壬戌']);
  assert.deepEqual(najiaOf('坤', '坤'), ['乙未', '乙巳', '乙卯', '癸丑', '癸亥', '癸酉']);
  // 内外卦不同：火天大有 = 上离下乾。
  assert.deepEqual(najiaOf('离', '乾'), ['甲子', '甲寅', '甲辰', '己酉', '己未', '己巳']);
});

test('六神按日干起', () => {
  assert.deepEqual(spiritsOf('甲'), ['青龙', '朱雀', '勾陈', '螣蛇', '白虎', '玄武']);
  assert.deepEqual(spiritsOf('庚'), ['白虎', '玄武', '青龙', '朱雀', '勾陈', '螣蛇']);
  assert.deepEqual(spiritsOf('壬'), ['玄武', '青龙', '朱雀', '勾陈', '螣蛇', '白虎']);
});

test('旺相休囚死相对月建', () => {
  // 午月（火旺）的标准格局：火旺、土相、木休、水囚、金死。
  assert.equal(seasonalState('火', '午').state, '旺');
  assert.equal(seasonalState('土', '午').state, '相');
  assert.equal(seasonalState('木', '午').state, '休');
  assert.equal(seasonalState('水', '午').state, '囚');
  assert.equal(seasonalState('金', '午').state, '死');
  // 卯月（木旺）：木旺、火相、水休、金囚、土死。
  assert.equal(seasonalState('木', '卯').state, '旺');
  assert.equal(seasonalState('火', '卯').state, '相');
  assert.equal(seasonalState('水', '卯').state, '休');
  assert.equal(seasonalState('金', '卯').state, '囚');
  assert.equal(seasonalState('土', '卯').state, '死');
});

test('乾为天初爻动：完整装卦核对', () => {
  const chart = buildChart({ values: [9, 7, 7, 7, 7, 7], instant: AT, question: '财运' });
  assert.equal(chart.primary.name, '乾为天');
  assert.equal(chart.primary.palace, '乾');
  assert.equal(chart.primary.palaceElement, '金');
  assert.equal(chart.primary.stepName, '八纯');
  assert.equal(chart.primary.shi, 6);
  assert.equal(chart.primary.ying, 3);
  assert.equal(chart.changed.name, '天风姤');
  assert.equal(chart.flags.clash, true);
  assert.equal(chart.calendar.monthBranch, '午');
  assert.deepEqual(chart.calendar.xunKong, ['寅', '卯']);

  const relatives = chart.lines.map((line) => line.relative);
  assert.deepEqual(relatives, ['子孙', '妻财', '父母', '官鬼', '兄弟', '父母']);
  const spirits = chart.lines.map((line) => line.spirit);
  assert.deepEqual(spirits, ['白虎', '玄武', '青龙', '朱雀', '勾陈', '螣蛇']);

  const first = chart.lines[0];
  assert.equal(first.moving, true);
  assert.equal(first.isMonthBroken, true); // 子与月建午相冲
  assert.equal(first.dayImpact, false);    // 子与日辰戌不相冲
  // 初爻甲子水 化 辛丑土：土克水 → 回头克。
  assert.equal(first.change.najia, '辛丑');
  assert.equal(first.change.relative, '父母');
  assert.equal(first.change.relation, '回头克');
});

test('六爻安静时无变卦、无变爻', () => {
  const chart = buildChart({ values: staticValuesOf('坎', '离'), instant: AT, question: '静卦' });
  assert.equal(chart.staticHexagram, true);
  assert.equal(chart.changed, null);
  assert.equal(chart.movingCount, 0);
  assert.ok(chart.lines.every((line) => line.change === null));
  assert.equal(chart.primary.name, '水火既济');
  assert.equal(chart.primary.palace, '坎');
  assert.equal(chart.primary.stepName, '三世');
});

test('六爻全动', () => {
  const chart = buildChart({ values: [9, 6, 9, 6, 9, 6], instant: AT, question: '全动' });
  assert.equal(chart.movingCount, 6);
  assert.equal(chart.staticHexagram, false);
  assert.ok(chart.lines.every((line) => line.change !== null));
  for (const line of chart.lines) {
    assert.ok(['回头生', '回头克', '比和', '化泄', '化耗'].includes(line.change.relation));
  }
});

test('伏神恰好补齐缺失的六亲（全六十四卦不变量）', () => {
  for (const entry of allHexagrams()) {
    const chart = buildChart({ values: staticValuesOf(entry.upper, entry.lower), instant: AT, question: 'inventory' });
    const present = new Set(chart.lines.map((line) => line.relative));
    const missing = SIX_RELATIVES.filter((relative) => !present.has(relative));
    const fushenRelatives = chart.lines
      .map((line) => line.fushen?.relative)
      .filter((relative) => relative !== undefined);
    assert.deepEqual([...fushenRelatives].sort(), [...missing].sort(), `${entry.name} 的伏神与缺失六亲不一致`);
    // 有伏神的爻位，其伏神六亲必须确实不在本卦中。
    for (const line of chart.lines) {
      if (line.fushen != null) {
        assert.ok(missing.includes(line.fushen.relative), `${entry.name} 第${line.position}爻伏神多余`);
        assert.equal(line.fushen.position, line.position);
      }
    }
  }
});

test('六冲卦与六合卦的卦名集合与传世说法一致', () => {
  const clash = [];
  const combine = [];
  for (const entry of allHexagrams()) {
    const chart = buildChart({ values: staticValuesOf(entry.upper, entry.lower), instant: AT, question: 'x' });
    if (chart.flags.clash) clash.push(entry.name);
    if (chart.flags.combine) combine.push(entry.name);
  }
  // 六冲十卦：八纯卦 + 天雷无妄 + 雷天大壮。
  assert.deepEqual([...clash].sort(), [
    '乾为天', '兑为泽', '坤为地', '天雷无妄', '巽为风',
    '坎为水', '离为火', '艮为山', '震为雷', '雷天大壮',
  ].sort());
  // 六合八卦。
  assert.deepEqual([...combine].sort(), [
    '天地否', '地天泰', '泽水困', '水泽节', '火山旅', '山火贲', '雷地豫', '地雷复',
  ].sort());
});

test('三合局识别', () => {
  // 乾为天含 子寅辰午申戌，同时构成申子辰水局与寅午戌火局。
  const chart = buildChart({ values: [7, 7, 7, 7, 7, 7], instant: AT, question: '三合' });
  const elements = chart.flags.threeHarmony.map((group) => group.element).sort();
  assert.deepEqual(elements, ['水', '火']);
});

test('从卦盘文本能读出关键字段', () => {
  const chart = buildChart({ values: [9, 7, 7, 7, 7, 7], instant: AT, question: '今年财运如何' });
  const text = formatChartText(chart);
  for (const needle of ['乾为天', '天风姤', '乾宫', '世6应3', '月建', '旬空', '寅卯', '甲子', '子孙', '白虎', '回头克', '六冲卦']) {
    assert.ok(text.includes(needle), `卦盘文本缺少「${needle}」`);
  }
  assert.ok(text.includes('今年财运如何'));
});

test('缺六亲的卦会在文本里列出伏神', () => {
  // 天风姤（乾宫一世）：六亲不全，必有伏神。
  const chart = buildChart({ values: staticValuesOf('乾', '巽'), instant: AT, question: '伏神' });
  assert.ok(chart.summary.relativesMissing.length > 0);
  const text = formatChartText(chart);
  assert.ok(text.includes('伏神'));
  assert.ok(text.includes('缺'));
});
