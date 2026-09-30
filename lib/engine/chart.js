/**
 * 装卦：把六个爻值 + 起卦瞬时组装成完整卦盘。
 *
 * 变爻的六亲一律以**本卦之宫五行**为准（《增删卜易》通行口径），
 * 而非以变卦之宫论，避免不同流派混用。
 *
 * @module dsh-liuyao/engine/chart
 */

import { buildCalendar } from './calendar.js';
import { buildHexagramPair, changedLines, describeLines, splitTrigrams } from './hexagram.js';
import {
  buildLineDetails,
  elementOfBranch,
  fushenFor,
  najiaOf,
  seasonalState,
  splitGanzhi,
} from './najia.js';
import { palaceOf } from './palace.js';
import { THREE_HARMONY, isClash, isCombine, relativeOf } from './tables.js';

/** 同五行的地支顺序，用于判进神/退神。 */
const ELEMENT_BRANCH_ORDER = {
  木: ['寅', '卯'],
  火: ['巳', '午'],
  金: ['申', '酉'],
  水: ['亥', '子'],
  土: ['丑', '辰', '未', '戌'],
};

/** 五行墓库。 */
const ELEMENT_TOMB = { 木: '未', 火: '戌', 土: '辰', 金: '丑', 水: '辰' };

/** 五行绝地（土同水）。 */
const ELEMENT_EXTINCTION = { 木: '申', 火: '亥', 土: '巳', 金: '寅', 水: '巳' };

/** 变爻对动爻的生克关系。 */
const changeRelation = (movingElement, changedElement) => {
  const generates = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
  const controls = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };
  if (movingElement === changedElement) return '比和';
  if (generates[changedElement] === movingElement) return '回头生';
  if (controls[changedElement] === movingElement) return '回头克';
  if (generates[movingElement] === changedElement) return '化泄';
  return '化耗';
};

/** 进神 / 退神。 */
const advanceRetreat = (movingBranch, changedBranch) => {
  const movingElement = elementOfBranch(movingBranch);
  if (movingElement !== elementOfBranch(changedBranch)) return null;
  const order = ELEMENT_BRANCH_ORDER[movingElement];
  const from = order.indexOf(movingBranch);
  const to = order.indexOf(changedBranch);
  if (from < 0 || to < 0) return null;
  const size = order.length;
  if ((from + 1) % size === to) return '进神';
  if ((from - 1 + size) % size === to) return '退神';
  return null;
};

/** 卦级格局：六冲、六合、三合局、游魂、归魂。 */
const buildFlags = ({ lines, lineDetails, changedDetail, palace }) => {
  const branches = lineDetails.map((line) => line.zhi);
  // 六冲 / 六合：判上下卦对应爻（初四、二五、三六）是否两两相冲 / 相合。
  const pairs = [[0, 3], [1, 4], [2, 5]];
  const clash = pairs.every(([a, b]) => isClash(branches[a], branches[b]));
  const combine = pairs.every(([a, b]) => isCombine(branches[a], branches[b]));
  const threeHarmony = [];
  for (const group of THREE_HARMONY) {
    const positions = group.branches.map((branch) => branches.indexOf(branch) + 1);
    if (positions.every((position) => position > 0)) {
      threeHarmony.push({ element: group.element, branches: [...group.branches], positions });
    }
  }
  // 动爻参与的三合局单列，便于「三方合力」的解读。
  const movingBranches = lineDetails.filter((line) => line.moving).map((line) => line.zhi);
  const movingThreeHarmony = [];
  for (const group of THREE_HARMONY) {
    const hits = group.branches.filter((branch) => movingBranches.includes(branch));
    if (hits.length >= 2 && movingBranches.length >= 2) {
      movingThreeHarmony.push({ element: group.element, branches: [...group.branches], movingHits: hits });
    }
  }
  return {
    clash,
    combine,
    clashText: clash ? '六冲卦' : null,
    combineText: combine ? '六合卦' : null,
    threeHarmony,
    movingThreeHarmony,
    youhun: palace.stepName === '游魂',
    guihun: palace.stepName === '归魂',
    changedName: changedDetail?.name ?? null,
    lineCount: lines.length,
  };
};

/**
 * 组装完整卦盘。
 *
 * @param params.values 6 个爻值（自下而上）。
 * @param params.instant 起卦瞬时（UTC 毫秒）。
 * @param params.timeZone IANA 时区。
 * @param params.dayBoundary `'midnight' | 'ziShi'`。
 * @param params.question 所问之事。
 * @param params.method `'coins' | 'lines'`，仅作记录。
 * @param params.tosses 投币明细（`method='coins'` 时有值），用于审计。
 * @returns 完整卦盘对象（可直接 JSON 序列化）。
 */
export const buildChart = ({
  values,
  instant,
  timeZone = 'Asia/Shanghai',
  dayBoundary = 'midnight',
  question,
  method = 'lines',
  tosses,
}) => {
  const pair = buildHexagramPair(values);
  const palace = palaceOf(pair.lines);
  const calendar = buildCalendar({ instant, timeZone, dayBoundary });

  const rawLines = buildLineDetails({
    lines: pair.lines,
    moving: pair.moving,
    upperName: pair.primary.upper,
    lowerName: pair.primary.lower,
    palaceElement: palace.palaceElement,
    dayStem: calendar.dayStem,
    dayBranch: calendar.dayBranch,
    monthBranch: calendar.monthBranch,
    kongPair: calendar.xunKong,
    shi: palace.shi,
    ying: palace.ying,
  });

  const fushen = fushenFor({
    lineDetails: rawLines,
    palaceName: palace.palace,
    palaceElement: palace.palaceElement,
  });

  // 变卦的纳甲：用于每个动爻的「变爻」。
  const changedLineArray = changedLines(pair.lines, pair.moving);
  const changedDetail = pair.staticHexagram ? null : describeLines(changedLineArray);
  const changedNajia = pair.staticHexagram ? [] : najiaOf(changedDetail.upper, changedDetail.lower);

  const lines = rawLines.map((line, index) => {
    const fushenEntry = fushen[index];
    const base = {
      ...line,
      fushen: fushenEntry,
    };
    if (!line.moving) return { ...base, change: null };

    const ganzhi = changedNajia[index];
    const { zhi } = splitGanzhi(ganzhi);
    const changedElement = elementOfBranch(zhi);
    const changedSeasonal = seasonalState(changedElement, calendar.monthBranch);
    return {
      ...base,
      change: {
        najia: ganzhi,
        zhi,
        element: changedElement,
        relative: relativeOf(palace.palaceElement, zhi),
        isKong: calendar.xunKong.includes(zhi),
        isMonthBroken: isClash(zhi, calendar.monthBranch),
        seasonal: changedSeasonal.state,
        relation: changeRelation(line.element, changedElement),
        advance: advanceRetreat(line.zhi, zhi),
        tomb: ELEMENT_TOMB[line.element] === zhi,
        extinction: ELEMENT_EXTINCTION[line.element] === zhi,
      },
    };
  });

  const flags = buildFlags({ lines: pair.lines, lineDetails: lines, changedDetail, palace });

  const movingLines = lines.filter((line) => line.moving);

  return {
    question,
    method,
    castInstant: instant,
    castAt: new Date(instant).toISOString(),
    timeZone,
    dayBoundary,
    calendar,
    values: pair.values,
    yinYangLines: pair.lines,
    movingFlags: pair.moving,
    staticHexagram: pair.staticHexagram,
    tosses: tosses ?? null,
    primary: {
      name: pair.primary.name,
      symbol: pair.primary.symbol,
      structure: pair.primary.structure,
      upper: pair.primary.upper,
      lower: pair.primary.lower,
      upperSymbol: pair.primary.upperSymbol,
      lowerSymbol: pair.primary.lowerSymbol,
      palace: palace.palace,
      palaceElement: palace.palaceElement,
      step: palace.step,
      stepName: palace.stepName,
      shi: palace.shi,
      ying: palace.ying,
    },
    changed: changedDetail === null ? null : {
      name: changedDetail.name,
      symbol: changedDetail.symbol,
      structure: changedDetail.structure,
      upper: changedDetail.upper,
      lower: changedDetail.lower,
      upperSymbol: changedDetail.upperSymbol,
      lowerSymbol: changedDetail.lowerSymbol,
    },
    lines,
    movingLines,
    movingCount: movingLines.length,
    flags,
    summary: {
      hexagram: pair.primary.name,
      changed: changedDetail?.name ?? null,
      shiAt: palace.shi,
      yingAt: palace.ying,
      movingPositions: movingLines.map((line) => line.position),
      monthBranch: calendar.monthBranch,
      dayPillar: calendar.dayPillar,
      xunKong: calendar.xunKong,
      relativesPresent: [...new Set(lines.map((line) => line.relative))],
      relativesMissing: ['父母', '兄弟', '子孙', '妻财', '官鬼'].filter(
        (relative) => !lines.some((line) => line.relative === relative),
      ),
    },
  };
};

/** 由卦名取内外卦名，供卡片或调试使用。 */
export const trigramsOfName = (lines) => splitTrigrams([...lines]);
