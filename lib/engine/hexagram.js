/**
 * 卦的构造与拆解：爻值 ↔ 阴阳爻 ↔ 上下卦 ↔ 卦名 ↔ 变卦。
 *
 * 爻数组一律 **自下而上**：index 0 = 初爻，index 5 = 上爻。
 * 阴阳爻用 1（阳）/ 0（阴）。
 *
 * @module dsh-liuyao/engine/hexagram
 */

import {
  HEXAGRAM_NAMES,
  TRIGRAM_BY_LINES,
  TRIGRAM_BY_NAME,
  TRIGRAMS,
} from './tables.js';

/** 爻值：6 老阴（动）、7 少阳、8 少阴、9 老阳（动）。 */
export const LINE_VALUES = [6, 7, 8, 9];

/**
 * 由一个爻值推出其阴阳与动静。
 * @param value 6 / 7 / 8 / 9。
 * @returns `{ value, yinYang, moving }`，阴阳 1 为阳、0 为阴。
 */
export const interpretLineValue = (value) => {
  if (!LINE_VALUES.includes(value)) {
    throw new Error(`爻值必须是 6/7/8/9 之一，收到 ${JSON.stringify(value)}`);
  }
  return {
    value,
    yinYang: value % 2 === 1 ? 1 : 0,
    moving: value === 6 || value === 9,
  };
};

/**
 * 把 6 个爻值（自下而上）翻译成爻的描述数组。
 * @param values 长度必须为 6。
 * @returns `{ value, yinYang, moving }[]`（自下而上）。
 */
export const interpretLineValues = (values) => {
  if (!Array.isArray(values) || values.length !== 6) {
    throw new Error(`需要自下而上的 6 个爻值，收到 ${Array.isArray(values) ? values.length : typeof values} 个`);
  }
  return values.map(interpretLineValue);
};

/** 三爻（自下而上）→ 八卦；找不到即数据非法。 */
export const trigramOf = (lines) => {
  const trigram = TRIGRAM_BY_LINES.get(lines.join(''));
  if (trigram === undefined) throw new Error(`无法由三爻 [${lines.join(',')}] 反查八卦`);
  return trigram;
};

/**
 * 拆出内外卦。
 * @param lines 6 个阴阳爻（自下而上）。
 * @returns `{ lower, upper }` 两个八卦对象。
 */
export const splitTrigrams = (lines) => {
  if (!Array.isArray(lines) || lines.length !== 6) {
    throw new Error('需要 6 个阴阳爻（自下而上）');
  }
  return {
    lower: trigramOf(lines.slice(0, 3)),
    upper: trigramOf(lines.slice(3, 6)),
  };
};

/** 由上卦名与下卦名取卦名。 */
export const nameOfTrigrams = (upperName, lowerName) => {
  const row = HEXAGRAM_NAMES[upperName];
  if (row === undefined) throw new Error(`未知上卦 ${upperName}`);
  const name = row[lowerName];
  if (name === undefined) throw new Error(`未知下卦 ${lowerName}`);
  return name;
};

/**
 * 把一个卦的三爻数组补全为完整的卦描述。
 * @param lines 6 个阴阳爻（自下而上）。
 * @returns `{ lines, upper, lower, name, symbol, structure }`。
 *   `structure` 为「下卦名 + 下 + 上卦名 + 上」形式的简化描述（如「乾下坤上」）。
 */
export const describeLines = (lines) => {
  const { upper, lower } = splitTrigrams(lines);
  return {
    lines: [...lines],
    upper: upper.name,
    lower: lower.name,
    upperSymbol: upper.symbol,
    lowerSymbol: lower.symbol,
    name: nameOfTrigrams(upper.name, lower.name),
    // 卦符按「上卦在上」书写：先上卦后下卦。
    symbol: `${upper.symbol}${lower.symbol}`,
    structure: `${lower.name}下${upper.name}上`,
  };
};

/**
 * 变卦：翻转所有动爻。
 * @param lines 6 个阴阳爻（自下而上）。
 * @param moving 6 个布尔（自下而上），标记哪些爻发动。
 * @returns 变卦的 6 个阴阳爻；无动爻时与本卦相同。
 */
export const changedLines = (lines, moving) => lines.map((line, index) => (moving[index] ? (line ? 0 : 1) : line));

/**
 * 把 6 个爻值直接装成一个完整卦（本卦 + 变卦）。
 * @param values 6 个爻值（自下而上）。
 * @returns `{ primary, changed, moving, lines, staticHexagram }`，
 *   其中 `primary` / `changed` 均由 {@link describeLines} 产出的卦描述。
 */
export const buildHexagramPair = (values) => {
  const interpreted = interpretLineValues(values);
  const lines = interpreted.map((line) => line.yinYang);
  const moving = interpreted.map((line) => line.moving);
  const primary = describeLines(lines);
  const changedLineArray = changedLines(lines, moving);
  // 六爻安静时变卦即本卦，显式标注避免下游误判为「有变」。
  const staticHexagram = !moving.some(Boolean);
  return {
    values: interpreted.map((line) => line.value),
    lines,
    moving,
    staticHexagram,
    primary: staticHexagram ? { ...primary, changed: false } : { ...primary, changed: true },
    changed: staticHexagram ? null : describeLines(changedLineArray),
    changedLineArray,
  };
};

/** 全部六十四个卦的 `{ upper, lower, name }`，供遍历与单测。 */
export const allHexagrams = () => {
  const list = [];
  for (const upper of TRIGRAMS) {
    for (const lower of TRIGRAMS) {
      list.push({
        upper: upper.name,
        lower: lower.name,
        name: HEXAGRAM_NAMES[upper.name][lower.name],
        // 八纯卦：上下卦相同。
        pure: upper.name === lower.name,
      });
    }
  }
  return list;
};

/**
 * 由内外卦名取八卦对象，便于按名检索。
 * @param name 八卦名。
 */
export const trigramByName = (name) => {
  const trigram = TRIGRAM_BY_NAME.get(name);
  if (trigram === undefined) throw new Error(`未知八卦 ${name}`);
  return trigram;
};
