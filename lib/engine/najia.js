/**
 * 纳甲装卦：干支、六亲、六神、旬空、月破、旺衰、伏神。
 *
 * @module dsh-liuyao/engine/najia
 */

import {
  BRANCH_ELEMENT,
  ELEMENT_CONTROLS,
  ELEMENT_GENERATES,
  NAJIA,
  SPIRIT_START_BY_DAY_STEM,
  SIX_SPIRITS,
  isClash,
  relativeOf,
} from './tables.js';

/**
 * 一个卦的纳甲：初/二/三爻取内卦纳甲，四/五/上爻取外卦纳甲。
 * @param upperName 上卦（外卦）名。
 * @param lowerName 下卦（内卦）名。
 * @returns 6 项「干支」字符串，自下而上。
 */
export const najiaOf = (upperName, lowerName) => {
  const inner = NAJIA[lowerName];
  const outer = NAJIA[upperName];
  if (inner === undefined) throw new Error(`纳甲表缺少下卦 ${lowerName}`);
  if (outer === undefined) throw new Error(`纳甲表缺少上卦 ${upperName}`);
  return [...inner.inner, ...outer.outer];
};

/** 拆分「甲子」为干支两字。 */
export const splitGanzhi = (ganzhi) => {
  if (typeof ganzhi !== 'string' || ganzhi.length !== 2) {
    throw new Error(`干支应为两字，收到 ${JSON.stringify(ganzhi)}`);
  }
  return { gan: ganzhi[0], zhi: ganzhi[1] };
};

/** 由地支取五行。 */
export const elementOfBranch = (branch) => {
  const element = BRANCH_ELEMENT[branch];
  if (element === undefined) throw new Error(`未知地支 ${branch}`);
  return element;
};

/**
 * 六神自初爻向上的排列。
 * @param dayStem 日干。
 * @returns 6 个六神名。
 */
export const spiritsOf = (dayStem) => {
  const start = SPIRIT_START_BY_DAY_STEM[dayStem];
  if (start === undefined) throw new Error(`未知日干 ${dayStem}`);
  return Array.from({ length: 6 }, (_, index) => SIX_SPIRITS[(start + index) % 6]);
};

/**
 * 相对月建的旺相休囚死。
 *   与月建同五行＝旺；月建所生＝相；生月建者＝休；克月建者＝囚；被月建克者＝死。
 * @param element 爻（或变爻）的五行。
 * @param monthBranch 月建地支。
 * @returns `{ state, score }`，score 旺 5 … 死 1。
 */
export const seasonalState = (element, monthBranch) => {
  const monthElement = elementOfBranch(monthBranch);
  if (element === monthElement) return { state: '旺', score: 5 };
  if (ELEMENT_GENERATES[monthElement] === element) return { state: '相', score: 4 };
  if (ELEMENT_GENERATES[element] === monthElement) return { state: '休', score: 3 };
  if (ELEMENT_CONTROLS[element] === monthElement) return { state: '囚', score: 2 };
  return { state: '死', score: 1 };
};

/** 地支是否落在旬空之内。 */
export const isKongBranch = (branch, kongPair) => Array.isArray(kongPair) && kongPair.includes(branch);

/**
 * 日辰对该爻的作用。
 * 相冲时：动爻为「冲动」，静而旺相为「暗动」，静而衰弱为「日破」。
 * @returns `false | 'clash-moving' | 'secret-moving' | 'day-broken'`
 */
export const dayImpact = (branch, dayBranch, element, monthBranch, moving) => {
  if (!isClash(branch, dayBranch)) return false;
  if (moving) return 'clash-moving';
  return seasonalState(element, monthBranch).score >= 4 ? 'secret-moving' : 'day-broken';
};

/**
 * 月建对某爻的扶抑分（-2..2），用于粗排强弱。
 * 同五行或月建生爻＝+2；月建克爻＝-2；爻生月建或爻克月建＝-1；其余 0。
 */
export const relativeScore = (branch, monthBranch) => {
  const element = elementOfBranch(branch);
  const monthElement = elementOfBranch(monthBranch);
  if (element === monthElement) return 2;
  if (ELEMENT_GENERATES[monthElement] === element) return 2;
  if (ELEMENT_CONTROLS[monthElement] === element) return -2;
  if (ELEMENT_GENERATES[element] === monthElement) return -1;
  if (ELEMENT_CONTROLS[element] === monthElement) return -1;
  return 0;
};

/**
 * 组装一个卦的逐爻明细（纳甲 + 六亲 + 六神 + 旬空 + 月破 + 旺衰）。
 *
 * @param params.lines 6 个阴阳爻（自下而上）。
 * @param params.moving 6 个布尔（自下而上）。
 * @param params.upperName 上卦名。
 * @param params.lowerName 下卦名。
 * @param params.palaceElement 宫五行。
 * @param params.dayStem 日干。
 * @param params.dayBranch 日辰地支。
 * @param params.monthBranch 月建地支。
 * @param params.kongPair 旬空的两个地支。
 * @param params.shi 世爻位（1..6）。
 * @param params.ying 应爻位（1..6）。
 * @returns 长度 6 的逐爻明细数组（自下而上，`position` 为 1..6）。
 */
export const buildLineDetails = ({
  lines,
  moving,
  upperName,
  lowerName,
  palaceElement,
  dayStem,
  dayBranch,
  monthBranch,
  kongPair,
  shi,
  ying,
}) => {
  const najia = najiaOf(upperName, lowerName);
  const spirits = spiritsOf(dayStem);
  return lines.map((yinYang, index) => {
    const ganzhi = najia[index];
    const { gan, zhi } = splitGanzhi(ganzhi);
    const element = elementOfBranch(zhi);
    const position = index + 1;
    const isMoving = moving[index];
    return {
      position,
      yinYang,
      yinYangText: yinYang ? '阳' : '阴',
      moving: isMoving,
      najia: ganzhi,
      gan,
      zhi,
      element,
      relative: relativeOf(palaceElement, zhi),
      spirit: spirits[index],
      isShi: position === shi,
      isYing: position === ying,
      isKong: isKongBranch(zhi, kongPair),
      isMonthBroken: isClash(zhi, monthBranch),
      dayImpact: dayImpact(zhi, dayBranch, element, monthBranch, isMoving),
      seasonal: seasonalState(element, monthBranch).state,
      seasonalScore: seasonalState(element, monthBranch).score,
      monthScore: relativeScore(zhi, monthBranch),
    };
  });
};

/**
 * 计算一个卦每一爻的伏神。
 *
 * 规则：本卦缺某六亲时，去**本宫八纯卦**中找该六亲所在爻位，取那一爻的纳甲作为伏神，
 * 伏在本卦同一爻位之下。八纯卦的上下卦皆为宫名，故纳甲 = `najiaOf(palace, palace)`。
 *
 * @param params.lineDetails {@link buildLineDetails} 的结果。
 * @param params.palaceName 本卦所属八宫。
 * @param params.palaceElement 宫五行。
 * @returns 长度 6 的数组，命中处为 `{ ganzhi, gan, zhi, element, relative, flying }`，否则 `null`。
 */
export const fushenFor = ({ lineDetails, palaceName, palaceElement }) => {
  const pureNajia = najiaOf(palaceName, palaceName);
  const present = new Set(lineDetails.map((line) => line.relative));
  return lineDetails.map((line, index) => {
    const ganzhi = pureNajia[index];
    const { gan, zhi } = splitGanzhi(ganzhi);
    const relative = relativeOf(palaceElement, zhi);
    if (present.has(relative)) return null;
    return {
      position: index + 1,
      ganzhi,
      gan,
      zhi,
      element: elementOfBranch(zhi),
      relative,
      // 飞神：本卦同一爻位的那一爻，用于判「伏神能否起」。
      flying: {
        relative: line.relative,
        najia: line.najia,
        element: line.element,
        moving: line.moving,
        isKong: line.isKong,
        isMonthBroken: line.isMonthBroken,
      },
    };
  });
};
