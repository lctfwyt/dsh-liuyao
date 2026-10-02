/**
 * 历法换算：儒略日、日干支、节气、月建、年/月/时干支。
 *
 * 设计要点：
 * - 所有时间判断都在**绝对瞬时**上做（UTC 毫秒 / 儒略日），不做本地时区加减，
 *   因此不存在夏令时错误。民用年月日时通过 `Intl.DateTimeFormat` 按 IANA 时区取得。
 * - 节气的太阳视黄经采用 Meeus《Astronomical Algorithms》第 25 章的低精度公式，
 *   精度约 0.01°（对应时间约 ±15 分钟）。这是本模块**已知的精度上限**：
 *   {@link buildCalendar} 会在起卦时刻距交节 30 分钟内时给出 `nearMonthBoundary: true`，
 *   让解读可以如实说明月建归属的临界性，而不是假装精确。
 *
 * @module dsh-liuyao/engine/calendar
 */

import {
  EARTHLY_BRANCHES,
  HEAVENLY_STEMS,
  HOUR_BRANCH_BY_HOUR,
  MONTH_NODE_TERMS,
  sexagenary,
  sexagenaryIndexOf,
  xunKongOfIndex,
} from './tables.js';

/** 十二「节」的近似公历日期（月, 日），仅用作求解初值。 */
const TERM_APPROX = {
  小寒: [1, 6], 立春: [2, 4], 惊蛰: [3, 6], 清明: [4, 5],
  立夏: [5, 6], 芒种: [6, 6], 小暑: [7, 7], 立秋: [8, 8],
  白露: [9, 8], 寒露: [10, 8], 立冬: [11, 7], 大雪: [12, 7],
};

const MS_PER_DAY = 86400000;
const UNIX_EPOCH_JD = 2440587.5;
const toRad = (degrees) => (degrees * Math.PI) / 180;

/** 换日口径取值（引擎内部开关，工具层不暴露）。 */
export const DAY_BOUNDARIES = ['ziShi', 'midnight'];

/**
 * 默认换日口径：子时换日（23:00 起算次日），见 `lib/doctrine.md` 的默认口径一览。
 *
 * 取早晚子时不分的做法：23:00 整即换日，时支仍为子，时干按新日干用五鼠遁；
 * 00:00–00:59 属新日的早子时，与当日其它子时结果一致。
 */
export const DEFAULT_DAY_BOUNDARY = 'ziShi';

/** UTC 毫秒 → 儒略日。 */
export const jdFromInstant = (ms) => ms / MS_PER_DAY + UNIX_EPOCH_JD;

/** 儒略日 → UTC 毫秒。 */
export const instantFromJd = (jd) => (jd - UNIX_EPOCH_JD) * MS_PER_DAY;

/**
 * 公历（格里高利历）年月日 → 儒略日数（当日正午）。
 * 标准算法，对 1582 年后的日期有效。
 */
export const jdnOf = (year, month, day) => {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return day
    + Math.floor((153 * m + 2) / 5)
    + 365 * y
    + Math.floor(y / 4)
    - Math.floor(y / 100)
    + Math.floor(y / 400)
    - 32045;
};

/**
 * 由儒略日数反推公历年月日。用于把「加一天」的日柱偏移还原成日期。
 * @param jdn 儒略日数。
 */
export const civilFromJdn = (jdn) => {
  const a = jdn + 32044;
  const b = Math.floor((4 * a + 3) / 146097);
  const c = a - Math.floor((146097 * b) / 4);
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m = Math.floor((5 * e + 2) / 153);
  return {
    year: 100 * b + d - 4800 + Math.floor(m / 10),
    month: m + 3 - 12 * Math.floor(m / 10),
    day: e - Math.floor((153 * m + 2) / 5) + 1,
  };
};

/**
 * 日柱的六十甲子序。
 * 锚点：儒略日 2451545（2000-01-01）为戊午日，即序 54；故 `(JDN + 49) % 60`。
 */
export const dayPillarIndex = (jdn) => (((jdn + 49) % 60) + 60) % 60;

/**
 * 太阳视黄经（度，0..360）。
 * Meeus 低精度公式：几何平黄经 + 中心差 + 章动与光行差修正。
 */
export const solarApparentLongitude = (jd) => {
  const T = (jd - 2451545.0) / 36525;
  const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
  const M = 357.52911 + 35999.05029 * T - 0.0001537 * T * T;
  const Mr = toRad(M);
  const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(Mr)
    + (0.019993 - 0.000101 * T) * Math.sin(2 * Mr)
    + 0.000289 * Math.sin(3 * Mr);
  const trueLong = L0 + C;
  const omega = 125.04 - 1934.136 * T;
  const apparent = trueLong - 0.00569 - 0.00478 * Math.sin(toRad(omega));
  return ((apparent % 360) + 360) % 360;
};

/** 归一化到 (-180, 180]，用于判黄经跨越。 */
const norm180 = (degrees) => {
  const wrapped = ((degrees % 360) + 360) % 360;
  return wrapped > 180 ? wrapped - 360 : wrapped;
};

/**
 * 求某年某个「节」的交节瞬时（UTC 毫秒）。
 *
 * 做法：以近似日期为初值，在 ±6 天内以 0.25 天步长扫描太阳视黄经与目标黄经之差的符号变化，
 * 锁定区间后二分到约 10⁻³ 秒。
 *
 * @param year 公历年。
 * @param term 节名（见 `MONTH_NODE_TERMS`）。
 * @returns UTC 毫秒。
 */
export const solarTermInstant = (year, term) => {
  const entry = MONTH_NODE_TERMS.find((candidate) => candidate.term === term);
  if (entry === undefined) throw new Error(`未知的节：${term}`);
  const approx = TERM_APPROX[term];
  if (approx === undefined) throw new Error(`缺少 ${term} 的近似日期`);
  const center = jdnOf(year, approx[0], approx[1]) + 0.5;
  const delta = (jd) => norm180(solarApparentLongitude(jd) - entry.longitude);
  const step = 0.25;
  let bracket = null;
  let previous = delta(center - 6);
  for (let jd = center - 6 + step; jd <= center + 6; jd += step) {
    const current = delta(jd);
    if (previous <= 0 && current > 0) {
      bracket = [jd - step, jd];
      break;
    }
    previous = current;
  }
  if (bracket === null) throw new Error(`无法定位 ${year} 年 ${term} 的交节时刻`);
  let [lo, hi] = bracket;
  for (let iteration = 0; iteration < 60; iteration += 1) {
    const mid = (lo + hi) / 2;
    if (delta(mid) > 0) hi = mid;
    else lo = mid;
  }
  return instantFromJd((lo + hi) / 2);
};

/** 由 IANA 时区取民用年月日时分秒。 */
export const civilTimeOf = (instant, timeZone) => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date(instant))
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  // 'hour' 在部分实现下对午夜返回 '24'，统一归一到 0。
  const hour = Number(parts.hour) % 24;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour,
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
};

/**
 * 该时刻落在哪个「节」之后（节气月建）。
 * @returns `{ branch, term, since }`，`since` 为交节瞬时（UTC 毫秒）。
 */
export const monthNodeOf = (instant) => {
  const civil = civilTimeOf(instant, 'UTC');
  const candidates = [];
  for (const year of [civil.year - 1, civil.year, civil.year + 1]) {
    for (const entry of MONTH_NODE_TERMS) {
      candidates.push({ ...entry, instant: solarTermInstant(year, entry.term) });
    }
  }
  candidates.sort((a, b) => a.instant - b.instant);
  let found = null;
  for (const candidate of candidates) {
    if (candidate.instant <= instant) found = candidate;
    else break;
  }
  if (found === null) throw new Error('无法定位节气月建');
  return { branch: found.branch, term: found.term, since: found.instant, longitude: found.longitude };
};

/** 五虎遁：年干 + 月支 → 月干。 */
export const monthStemOf = (yearStem, monthBranch) => {
  const yearStemIndex = HEAVENLY_STEMS.indexOf(yearStem);
  const branchIndex = EARTHLY_BRANCHES.indexOf(monthBranch);
  if (yearStemIndex < 0 || branchIndex < 0) throw new Error('五虎遁入参非法');
  // 寅月的天干：甲己之年丙作首，乙庚之岁戊为头……即 (2 + 2 * (年干 % 5)) % 10。
  const yinMonthStem = (2 + 2 * (yearStemIndex % 5)) % 10;
  const offset = ((branchIndex - 2) % 12 + 12) % 12;
  return HEAVENLY_STEMS[(yinMonthStem + offset) % 10];
};

/** 五鼠遁：日干 + 时支 → 时干。 */
export const hourStemOf = (dayStem, hourBranch) => {
  const dayStemIndex = HEAVENLY_STEMS.indexOf(dayStem);
  const branchIndex = EARTHLY_BRANCHES.indexOf(hourBranch);
  if (dayStemIndex < 0 || branchIndex < 0) throw new Error('五鼠遁入参非法');
  return HEAVENLY_STEMS[((dayStemIndex % 5) * 2 + branchIndex) % 10];
};

/**
 * 组装一次起卦所需的全部历法信息。
 *
 * @param params.instant 起卦瞬时（UTC 毫秒）。
 * @param params.timeZone IANA 时区，默认 `Asia/Shanghai`。
 * @param params.dayBoundary 换日口径：`'ziShi'`（子时换日，23:00 起算次日，默认）或
 *   `'midnight'`（子正换日）。引擎内部开关，工具层不下发。
 * @returns 四柱、月建、旬空、临界标记等。
 */
export const buildCalendar = ({
  instant,
  timeZone = 'Asia/Shanghai',
  dayBoundary = DEFAULT_DAY_BOUNDARY,
}) => {
  if (!DAY_BOUNDARIES.includes(dayBoundary)) {
    throw new Error(`dayBoundary 必须是 ${DAY_BOUNDARIES.map((item) => JSON.stringify(item)).join(' / ')} 之一，收到 ${JSON.stringify(dayBoundary)}`);
  }
  const civil = civilTimeOf(instant, timeZone);
  // 子时换日：23:00–23:59 归入次日。进位交给 jdnOf 处理（月末、年末都对）。
  const dayShift = dayBoundary === 'ziShi' && civil.hour === 23 ? 1 : 0;
  const dayJdn = jdnOf(civil.year, civil.month, civil.day) + dayShift;
  const dayIndex = dayPillarIndex(dayJdn);
  const day = sexagenary(dayIndex);
  const xun = xunKongOfIndex(dayIndex);

  const monthNode = monthNodeOf(instant);
  // 年干支以立春换年。
  const lichunThisYear = solarTermInstant(civil.year, '立春');
  const yearForPillar = instant < lichunThisYear ? civil.year - 1 : civil.year;
  const yearIndex = (((yearForPillar - 4) % 60) + 60) % 60;
  const year = sexagenary(yearIndex);

  const monthStem = monthStemOf(year.stem, monthNode.branch);
  const monthGanzhiIndex = sexagenaryIndexOf(monthStem, monthNode.branch);
  if (monthGanzhiIndex === undefined) throw new Error(`月柱干支不成六十甲子：${monthStem}${monthNode.branch}`);

  const hourBranch = HOUR_BRANCH_BY_HOUR[civil.hour];
  const hourStem = hourStemOf(day.stem, hourBranch);
  const hourGanzhiIndex = sexagenaryIndexOf(hourStem, hourBranch);
  if (hourGanzhiIndex === undefined) throw new Error(`时柱干支不成六十甲子：${hourStem}${hourBranch}`);

  // 交节的精度约 ±15 分钟，30 分钟内视为临界，供解读如实说明。
  const minutesFromNode = Math.abs(instant - monthNode.since) / 60000;

  return {
    instant,
    timeZone,
    dayBoundary,
    civil,
    // 换日后的有效日期，日柱按它取；子时换日下可能比 civil 的钟面日期多一天。
    civilEffectiveDay: civilFromJdn(dayJdn),
    dayRolled: dayShift === 1,
    dayJdn,
    yearPillar: year.text,
    yearPillarIndex: year.index,
    yearForPillar,
    monthPillar: `${monthStem}${monthNode.branch}`,
    monthPillarIndex: monthGanzhiIndex,
    monthBranch: monthNode.branch,
    monthNodeTerm: monthNode.term,
    monthNodeInstant: monthNode.since,
    monthNodeMinutesAgo: (instant - monthNode.since) / 60000,
    nearMonthBoundary: minutesFromNode <= 30,
    dayPillar: day.text,
    dayPillarIndex: dayIndex,
    dayStem: day.stem,
    dayBranch: day.branch,
    hourPillar: `${hourStem}${hourBranch}`,
    hourPillarIndex: hourGanzhiIndex,
    hourBranch,
    hourStem,
    xun: xun.xun,
    xunKong: [...xun.kong],
    solarTermAccuracyMinutes: 15,
  };
};
