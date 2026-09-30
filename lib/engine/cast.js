/**
 * 起卦取爻：三枚铜钱法（三钱法），一组三枚定一爻，六组定六爻。
 *
 * 用户侧是**一键起卦**——点一下，六爻一次生成；这里实现的是底层取爻规则。
 *
 * 口诀（《增删卜易》通行法）：
 *   一背二字为少阳、二背一字为少阴、三背为重（老阳）、三字为交（老阴）。
 * 记 `b` = 背数，则爻值 = 6 + b：
 *   0 背 → 6 老阴（动）· 1 背 → 7 少阳 · 2 背 → 8 少阴 · 3 背 → 9 老阳（动）
 *
 * 随机源可注入，便于单测；默认使用 `node:crypto.randomInt`，逐枚取面、无模偏差。
 *
 * @module dsh-liuyao/engine/cast
 */

import { randomInt as nodeRandomInt } from 'node:crypto';

/** 一组（一次投币）的铜钱枚数。 */
export const COINS_PER_TOSS = 3;

/** 一次起卦的爻数。 */
export const TOSS_COUNT = 6;

/** 铜钱两面。背为阳面计数，字为阴面。 */
export const COIN_BACK = '背';
export const COIN_FACE = '字';

/**
 * 投一次币（三枚铜钱定一爻）。
 * @param params.randomIntFn 取 [0, max) 均匀整数的函数；默认 `node:crypto.randomInt`。
 * @returns `{ faces, backs, value, label }`，`faces` 为三枚铜钱的正反面（自内向外）。
 */
export const tossOnce = ({ randomIntFn = nodeRandomInt } = {}) => {
  const faces = Array.from({ length: COINS_PER_TOSS }, () => (randomIntFn(0, 2) === 0 ? COIN_BACK : COIN_FACE));
  const backs = faces.filter((face) => face === COIN_BACK).length;
  const value = 6 + backs;
  return { faces, backs, value, label: LINE_LABEL[value] };
};

/** 爻值 → 传统名。 */
export const LINE_LABEL = {
  6: '老阴（交）',
  7: '少阳',
  8: '少阴',
  9: '老阳（重）',
};

/**
 * 完整起卦：六组三枚，自初爻至上爻。
 * @param params.randomIntFn 可注入的随机源。
 * @returns `{ tosses, values }`，`tosses[i]` 含 `position`（1..6）。
 */
export const castByCoins = ({ randomIntFn = nodeRandomInt } = {}) => {
  const tosses = Array.from({ length: TOSS_COUNT }, (_, index) => ({
    ...tossOnce({ randomIntFn }),
    position: index + 1,
  }));
  return { tosses, values: tosses.map((toss) => toss.value) };
};

/**
 * 校验外部传入的六个爻值（例如浏览器端一键起卦后回传）。
 * @param values 期望为长度 6、元素属于 {6,7,8,9} 的数组。
 * @returns 归一化后的数字数组（自下而上）。
 * @throws 描述清楚的中文错误，便于直接冒泡给模型。
 */
export const normalizeLineValues = (values) => {
  if (!Array.isArray(values)) {
    throw new Error(`lines 必须是长度 6 的数组（自初爻至上爻），收到 ${typeof values}`);
  }
  if (values.length !== 6) {
    throw new Error(`lines 必须是 6 项（自初爻至上爻），收到 ${values.length} 项`);
  }
  return values.map((value, index) => {
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isInteger(numeric) || ![6, 7, 8, 9].includes(numeric)) {
      throw new Error(`lines[${index}] 必须是 6（老阴）/7（少阳）/8（少阴）/9（老阳）之一，收到 ${JSON.stringify(value)}`);
    }
    return numeric;
  });
};
