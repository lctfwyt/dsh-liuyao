/**
 * 解卦体例：完整版（技能正文）与精简版（工具描述内嵌）。
 *
 * 完整版以 Markdown 数据文件 `doctrine.md` 随包发布并在加载时读入：
 * 这样体例可以随时改文字而不用碰代码，也不会因为 JS 模板字面量转义而出错。
 * 读取方式与 DSH 上已验证的第三方插件（dsh-whale-widget 读自身 assets）一致。
 *
 * @module dsh-liuyao/doctrine
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 本包根目录（lib/doctrine.js → 包根）。 */
export const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * 精简版体例：写进 `liuyao_cast` 的工具描述，保证模型在**不加载技能**的情况下
 * 也能按规范断卦。刻意保留：取用神、月建日辰为纲、动变为重、空破、应期只给区间、
 * 六段输出结构、以及「不得编造盘外信息」的边界。
 */
export const DOCTRINE_SHORT = [
  '断卦规程（必须遵守）：',
  '1) 先由 question 在 lines[].relative 中定用神：求财/生意→妻财；求官/求职/考试/官司/病症→官鬼；',
  '   父母长辈/文书合同/房产车辆→父母；子女下属/平安解忧/医药→子孙；兄弟朋友/竞争合作→兄弟；',
  '   问自身→世爻 isShi。用神多现取与世爻相近、得月日生扶、不空不破者；用神不上卦看 fushen（伏神）。',
  '2) 月建 monthBranch 与日辰 dayBranch 为纲，能生克任何爻；再按旺相休囚死判力，标出旬空 isKong、月破 isMonthBroken、暗动。',
  '3) 动爻为重：逐条看 moving 之爻与其 change（回头生/回头克、进神/退神、化空/化破/化墓/化绝），',
  '   再看其对用神与世应 isShi/isYing 的作用；staticHexagram 为真时改以世应与格局论。',
  '4) 格局只作修正：六冲（快、散）、六合（慢、聚）、三合局、游魂（不定、外出）、归魂（复归、旧事）。',
  '5) 六神 spirit 只加色彩不定吉凶，与六亲冲突时以六亲为主。',
  '6) 应期只给区间与先后次序（填实、冲开、值日值月、爻位期数），禁止给绝对日期。',
  '7) 输出六段：①一句话结论与吉凶倾向 ②用神与旺衰（引用具体字段）③动变与关键爻作用 ④应期区间',
  '   ⑤建议与规避 ⑥免责声明。每条判断都要引用卦盘字段，禁止空泛断语。',
  '8) 只用卦盘提供的字段，不得编造神煞、飞神、卦身、纳音等盘外信息；健康/诉讼/重大财务只作传统文化参考。',
  '免责声明原文：以上解读基于传统六爻（纳甲筮法）文化体例，仅为传统文化参考，不构成决策、法律、投资或医疗建议；涉及健康、诉讼、重大财务事项请以专业意见为准。',
].join('\n');

/** 完整解卦体例（技能正文）。读不到时退化为精简版，绝不因缺文件而让插件启动失败。 */
export const DOCTRINE_FULL = (() => {
  try {
    return readFileSync(join(PACKAGE_ROOT, 'lib', 'doctrine.md'), 'utf8');
  } catch {
    return DOCTRINE_SHORT;
  }
})();

/** 技能的 description（决定模型何时加载技能）。 */
export const DOCTRINE_DESCRIPTION = '按传统六爻（纳甲筮法）体例解读六爻卦盘：取用神、判旺衰、看动变、定应期，并按固定六段结构输出结论与建议。当用户问卦、要求解卦或需要解读 liuyao_cast 产出的卦盘时使用。';

/** 技能名（kebab-case）。 */
export const DOCTRINE_SKILL_NAME = 'liuyao-divination';
