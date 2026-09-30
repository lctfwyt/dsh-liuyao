/**
 * 京房八宫卦序、世应、卦宫五行。
 *
 * 八宫卦序**算法生成**而非硬编码六十四行：从每个八纯卦出发，按「一世→二世→三世→
 * 四世→五世→游魂→归魂」的变爻规则推出该宫八卦。8 宫 × 8 位 = 64，恰好覆盖全部
 * 六十四卦（由单测断言无重无漏）。
 *
 * 世应规则：
 *   八纯 世6应3 · 一世 世1应4 · 二世 世2应5 · 三世 世3应6 ·
 *   四世 世4应1 · 五世 世5应2 · 游魂 世4应1 · 归魂 世3应6
 *
 * @module dsh-liuyao/engine/palace
 */

import { PALACE_ORDER, TRIGRAM_BY_NAME } from './tables.js';

/**
 * 八宫内的八个位置，按世次排列。
 * `flip` 为相对八纯卦需要翻转的爻下标（自下而上，0 起）；游魂/归魂由 `from` 派生。
 */
export const PALACE_STEPS = [
  { index: 0, name: '八纯', shi: 6, ying: 3, flip: [] },
  { index: 1, name: '一世', shi: 1, ying: 4, flip: [0] },
  { index: 2, name: '二世', shi: 2, ying: 5, flip: [0, 1] },
  { index: 3, name: '三世', shi: 3, ying: 6, flip: [0, 1, 2] },
  { index: 4, name: '四世', shi: 4, ying: 1, flip: [0, 1, 2, 3] },
  { index: 5, name: '五世', shi: 5, ying: 2, flip: [0, 1, 2, 3, 4] },
  // 游魂：五世卦再变第四爻（下标 3）。
  { index: 6, name: '游魂', shi: 4, ying: 1, from: 5, flip: [3] },
  // 归魂：游魂卦内卦三爻一并还原为本宫内卦。
  { index: 7, name: '归魂', shi: 3, ying: 6, from: 6, flip: [0, 1, 2] },
];

/** 翻转指定下标的爻。 */
const flipAt = (lines, indices) => {
  const next = [...lines];
  for (const index of indices) next[index] = next[index] ? 0 : 1;
  return next;
};

/** 某宫的八纯卦六爻（自下而上）：上下卦同为该宫之卦。 */
export const pureHexagramLines = (palaceName) => {
  const trigram = TRIGRAM_BY_NAME.get(palaceName);
  if (trigram === undefined) throw new Error(`未知卦宫 ${palaceName}`);
  return [...trigram.lines, ...trigram.lines];
};

/** 按八宫规则依次推出该宫的八个卦。 */
const buildPalace = (palaceName) => {
  const trigram = TRIGRAM_BY_NAME.get(palaceName);
  const pure = pureHexagramLines(palaceName);
  const produced = [{ lines: pure, step: PALACE_STEPS[0] }];
  for (const step of PALACE_STEPS.slice(1)) {
    const base = step.from === undefined
      ? pure
      : produced.find((entry) => entry.step.index === step.from)?.lines;
    if (base === undefined) throw new Error(`八宫推导失败：${palaceName} 缺少世次 ${String(step.from)}`);
    produced.push({ lines: flipAt(base, step.flip), step });
  }
  return { palaceName, element: trigram.element, entries: produced };
};

/**
 * 全部八宫展开结果。
 * @returns `{ palaceName, element, name, stepName, shi, ying, lines }[]`（64 项）。
 */
export const allPalaceEntries = () => {
  const list = [];
  for (const palaceName of PALACE_ORDER) {
    const { element, entries } = buildPalace(palaceName);
    for (const entry of entries) {
      list.push({
        palace: palaceName,
        palaceElement: element,
        step: entry.step.index,
        stepName: entry.step.name,
        shi: entry.step.shi,
        ying: entry.step.ying,
        lines: entry.lines,
      });
    }
  }
  return list;
};

/** 六爻二进制串 → 八宫归属信息；建表一次后复用。 */
const INDEX = new Map(allPalaceEntries().map((entry) => [entry.lines.join(''), entry]));

/**
 * 查一个卦的八宫归属、世应与宫五行。
 * @param lines 6 个阴阳爻（自下而上）。
 * @returns `{ palace, palaceElement, step, stepName, shi, ying }`。
 */
export const palaceOf = (lines) => {
  const found = INDEX.get(lines.join(''));
  if (found === undefined) throw new Error(`无法为 [${lines.join(',')}] 定位八宫归属`);
  return {
    palace: found.palace,
    palaceElement: found.palaceElement,
    step: found.step,
    stepName: found.stepName,
    shi: found.shi,
    ying: found.ying,
  };
};
