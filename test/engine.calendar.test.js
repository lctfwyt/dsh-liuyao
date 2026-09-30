/**
 * 历法模块单测：儒略日、日干支、节气、月建、四柱。
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildCalendar,
  civilFromJdn,
  civilTimeOf,
  dayPillarIndex,
  hourStemOf,
  jdnOf,
  monthNodeOf,
  monthStemOf,
  solarTermInstant,
} from '../lib/engine/calendar.js';
import { sexagenary, sexagenaryIndexOf } from '../lib/engine/tables.js';
import { parseInstant, zonedTimeToInstant } from '../lib/tools.js';

const CST = (text) => Date.parse(text);
const cstText = (instant) => new Date(instant + 8 * 3600000).toISOString().slice(0, 19).replace('T', ' ');

test('儒略日数与已知锚点', () => {
  assert.equal(jdnOf(2000, 1, 1), 2451545);
  assert.deepEqual(civilFromJdn(2451545), { year: 2000, month: 1, day: 1 });
  assert.deepEqual(civilFromJdn(jdnOf(2024, 6, 15)), { year: 2024, month: 6, day: 15 });
});

test('日柱干支与公开锚点一致', () => {
  // 2000-01-01 为戊午日（儒略日 2451545，序 54）。
  assert.equal(sexagenary(dayPillarIndex(jdnOf(2000, 1, 1))).text, '戊午');
  // 1949-10-01 为甲子日（序 0）—— 与 2000-01-01 锚点互相独立地印证公式。
  assert.equal(sexagenary(dayPillarIndex(jdnOf(1949, 10, 1))).text, '甲子');
  // 2024-06-15 为庚戌日。
  assert.equal(sexagenary(dayPillarIndex(jdnOf(2024, 6, 15))).text, '庚戌');
});

test('日柱逐日 +1，60 日循环', () => {
  const start = jdnOf(2024, 1, 1);
  for (let offset = 0; offset < 120; offset += 1) {
    const expected = (dayPillarIndex(start) + offset) % 60;
    assert.equal(dayPillarIndex(start + offset), expected);
  }
});

test('节气时刻落在公开值附近（低精度公式 ±15 分钟已文档化）', () => {
  const cases = [
    { year: 2023, term: '立春', expected: '2023-02-04 10:42:00' },
    { year: 2024, term: '立春', expected: '2024-02-04 16:27:00' },
    { year: 2025, term: '立春', expected: '2025-02-03 22:10:00' },
  ];
  for (const item of cases) {
    const actual = solarTermInstant(item.year, item.term);
    const driftMinutes = Math.abs(actual - CST(`${item.expected.replace(' ', 'T')}+08:00`)) / 60000;
    assert.ok(driftMinutes < 15, `${item.year} ${item.term} 偏差 ${driftMinutes.toFixed(1)} 分钟，超过 15 分钟上限（实际 ${cstText(actual)}）`);
  }
});

test('月建在交节时刻切换', () => {
  // 2024 立春在 2024-02-04 16:27 CST 附近；前后各取一小时。
  const before = monthNodeOf(CST('2024-02-04T00:00:00+08:00'));
  const after = monthNodeOf(CST('2024-02-05T00:00:00+08:00'));
  assert.equal(before.branch, '丑');
  assert.equal(before.term, '小寒');
  assert.equal(after.branch, '寅');
  assert.equal(after.term, '立春');
});

test('五虎遁与五鼠遁', () => {
  // 甲己之年丙作首：甲年寅月为丙寅。
  assert.equal(monthStemOf('甲', '寅'), '丙');
  assert.equal(monthStemOf('甲', '卯'), '丁');
  assert.equal(monthStemOf('己', '寅'), '丙');
  assert.equal(monthStemOf('乙', '寅'), '戊');
  assert.equal(monthStemOf('戊', '寅'), '甲');
  // 五鼠遁：甲日子时起甲子，乙日子时起丙子。
  assert.equal(hourStemOf('甲', '子'), '甲');
  assert.equal(hourStemOf('乙', '子'), '丙');
  assert.equal(hourStemOf('丙', '子'), '戊');
  assert.equal(hourStemOf('庚', '午'), '壬');
});

test('四柱组装：2024-06-15 12:00 CST', () => {
  const calendar = buildCalendar({ instant: CST('2024-06-15T12:00:00+08:00') });
  assert.equal(calendar.yearPillar, '甲辰');
  assert.equal(calendar.monthPillar, '庚午');
  assert.equal(calendar.dayPillar, '庚戌');
  assert.equal(calendar.hourPillar, '壬午');
  assert.equal(calendar.monthBranch, '午');
  assert.equal(calendar.monthNodeTerm, '芒种');
  assert.equal(calendar.dayStem, '庚');
  assert.equal(calendar.dayBranch, '戌');
  assert.equal(calendar.xun, '甲辰');
  assert.deepEqual(calendar.xunKong, ['寅', '卯']);
  assert.equal(calendar.dayBoundary, 'midnight');
  assert.equal(calendar.timeZone, 'Asia/Shanghai');
});

test('年干支以立春换年', () => {
  const before = buildCalendar({ instant: CST('2024-01-15T12:00:00+08:00') });
  const after = buildCalendar({ instant: CST('2024-03-15T12:00:00+08:00') });
  assert.equal(before.yearPillar, '癸卯');
  assert.equal(after.yearPillar, '甲辰');
});

test('临近交节时给出临界标记', () => {
  const node = solarTermInstant(2024, '立春');
  const close = buildCalendar({ instant: node + 60 * 1000 });
  const far = buildCalendar({ instant: node + 6 * 3600 * 1000 });
  assert.equal(close.nearMonthBoundary, true);
  assert.equal(far.nearMonthBoundary, false);
  assert.equal(close.monthBranch, '寅');
});

test('子时换日口径可切换', () => {
  const instant = CST('2024-06-15T23:30:00+08:00');
  const midnight = buildCalendar({ instant, dayBoundary: 'midnight' });
  const ziShi = buildCalendar({ instant, dayBoundary: 'ziShi' });
  // 2024-06-15 为庚戌日，次日为辛亥日。
  assert.equal(midnight.dayPillar, '庚戌');
  assert.equal(ziShi.dayPillar, '辛亥');
  // 时支两种口径都是子时（晚子时）。
  assert.equal(midnight.hourBranch, '子');
  assert.equal(ziShi.hourBranch, '子');
  // 非 23 点时两种口径给出同一天。
  const afternoon = CST('2024-06-15T15:00:00+08:00');
  assert.equal(
    buildCalendar({ instant: afternoon, dayBoundary: 'midnight' }).dayPillar,
    buildCalendar({ instant: afternoon, dayBoundary: 'ziShi' }).dayPillar,
  );
});

test('四柱干支都落在六十甲子之内', () => {
  for (const instant of [CST('1984-02-04T00:00:00+08:00'), CST('2000-01-01T00:00:00+08:00'), CST('2024-12-31T23:59:59+08:00')]) {
    const calendar = buildCalendar({ instant });
    for (const pillar of [calendar.yearPillar, calendar.monthPillar, calendar.dayPillar, calendar.hourPillar]) {
      assert.notEqual(sexagenaryIndexOf(pillar[0], pillar[1]), undefined, `${pillar} 不成六十甲子`);
    }
  }
});

test('民用时间换算轮转一致', () => {
  const instant = CST('2024-06-15T12:34:56+08:00');
  const civil = civilTimeOf(instant, 'Asia/Shanghai');
  assert.deepEqual(civil, { year: 2024, month: 6, day: 15, hour: 12, minute: 34, second: 56 });
  assert.equal(zonedTimeToInstant('2024-06-15 12:34:56', 'Asia/Shanghai'), instant);
  assert.equal(parseInstant('2024-06-15T12:34:56+08:00', 'Asia/Shanghai'), instant);
  assert.equal(parseInstant('2024-06-15 12:34:56', 'Asia/Shanghai'), instant);
  assert.throws(() => parseInstant('不是时间', 'Asia/Shanghai'), /无法识别/);
});

test('跨时区与夏令时下仍取到正确的民用时间', () => {
  // 纽约夏令时 2024-07-01 12:00 EDT = 16:00 UTC。
  assert.equal(civilTimeOf(CST('2024-07-01T16:00:00Z'), 'America/New_York').hour, 12);
  const instant = zonedTimeToInstant('2024-07-01 12:00:00', 'America/New_York');
  assert.equal(new Date(instant).toISOString(), '2024-07-01T16:00:00.000Z');
});
