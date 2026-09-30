/**
 * 六爻基础常量表。
 *
 * 全部为纯数据 + 纯函数，无 I/O、无随机、无时钟依赖，便于离线单测。
 * 爻的表示统一为 **自下而上** 的数组：index 0 = 初爻，index 5 = 上爻。
 * 阴阳用 1（阳）/ 0（阴）表示。
 *
 * @module dsh-liuyao/engine/tables
 */

/** 十天干。 */
export const HEAVENLY_STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];

/** 十二地支。 */
export const EARTHLY_BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

/** 五行。 */
export const ELEMENTS = ['木', '火', '土', '金', '水'];

/** 天干五行。 */
export const STEM_ELEMENT = {
  甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土',
  己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水',
};

/** 地支五行。 */
export const BRANCH_ELEMENT = {
  子: '水', 丑: '土', 寅: '木', 卯: '木', 辰: '土', 巳: '火',
  午: '火', 未: '土', 申: '金', 酉: '金', 戌: '土', 亥: '水',
};

/**
 * 八卦。`lines` 为自下而上的三爻（1 阳 / 0 阴），`symbol` 为卦符，`element` 为卦的五行。
 * 顺序采用「乾兑离震巽坎艮坤」（邵雍先天卦序），仅用于稳定遍历与 8×8 表索引。
 */
export const TRIGRAMS = [
  { name: '乾', symbol: '☰', lines: [1, 1, 1], element: '金', nature: '天' },
  { name: '兑', symbol: '☱', lines: [1, 1, 0], element: '金', nature: '泽' },
  { name: '离', symbol: '☲', lines: [1, 0, 1], element: '火', nature: '火' },
  { name: '震', symbol: '☳', lines: [1, 0, 0], element: '木', nature: '雷' },
  { name: '巽', symbol: '☴', lines: [0, 1, 1], element: '木', nature: '风' },
  { name: '坎', symbol: '☵', lines: [0, 1, 0], element: '水', nature: '水' },
  { name: '艮', symbol: '☶', lines: [0, 0, 1], element: '土', nature: '山' },
  { name: '坤', symbol: '☷', lines: [0, 0, 0], element: '土', nature: '地' },
];

/** 卦名查表：`TRIGRAM_BY_NAME.get(name)`。 */
export const TRIGRAM_BY_NAME = new Map(TRIGRAMS.map((trigram) => [trigram.name, trigram]));

/** 由三爻数组（自下而上）反查八卦；找不到返回 undefined。 */
export const TRIGRAM_BY_LINES = new Map(TRIGRAMS.map((trigram) => [trigram.lines.join(''), trigram]));

/** 八宫（京房）顺序。 */
export const PALACE_ORDER = ['乾', '坎', '艮', '震', '巽', '离', '坤', '兑'];

/**
 * 六十四卦名。外层索引为**上卦（外卦）**，内层索引为**下卦（内卦）**。
 * 键为八卦名，值为卦名。
 */
export const HEXAGRAM_NAMES = {
  乾: {
    乾: '乾为天', 兑: '天泽履', 离: '天火同人', 震: '天雷无妄',
    巽: '天风姤', 坎: '天水讼', 艮: '天山遁', 坤: '天地否',
  },
  兑: {
    乾: '泽天夬', 兑: '兑为泽', 离: '泽火革', 震: '泽雷随',
    巽: '泽风大过', 坎: '泽水困', 艮: '泽山咸', 坤: '泽地萃',
  },
  离: {
    乾: '火天大有', 兑: '火泽睽', 离: '离为火', 震: '火雷噬嗑',
    巽: '火风鼎', 坎: '火水未济', 艮: '火山旅', 坤: '火地晋',
  },
  震: {
    乾: '雷天大壮', 兑: '雷泽归妹', 离: '雷火丰', 震: '震为雷',
    巽: '雷风恒', 坎: '雷水解', 艮: '雷山小过', 坤: '雷地豫',
  },
  巽: {
    乾: '风天小畜', 兑: '风泽中孚', 离: '风火家人', 震: '风雷益',
    巽: '巽为风', 坎: '风水涣', 艮: '风山渐', 坤: '风地观',
  },
  坎: {
    乾: '水天需', 兑: '水泽节', 离: '水火既济', 震: '水雷屯',
    巽: '水风井', 坎: '坎为水', 艮: '水山蹇', 坤: '水地比',
  },
  艮: {
    乾: '山天大畜', 兑: '山泽损', 离: '山火贲', 震: '山雷颐',
    巽: '山风蛊', 坎: '山水蒙', 艮: '艮为山', 坤: '山地剥',
  },
  坤: {
    乾: '地天泰', 兑: '地泽临', 离: '地火明夷', 震: '地雷复',
    巽: '地风升', 坎: '地水师', 艮: '地山谦', 坤: '坤为地',
  },
};

/**
 * 京房纳甲表。内卦对应初/二/三爻，外卦对应四/五/上爻。
 * 每项为「天干 + 地支」两字。
 */
export const NAJIA = {
  乾: { inner: ['甲子', '甲寅', '甲辰'], outer: ['壬午', '壬申', '壬戌'] },
  坎: { inner: ['戊寅', '戊辰', '戊午'], outer: ['戊申', '戊戌', '戊子'] },
  艮: { inner: ['丙辰', '丙午', '丙申'], outer: ['丙戌', '丙子', '丙寅'] },
  震: { inner: ['庚子', '庚寅', '庚辰'], outer: ['庚午', '庚申', '庚戌'] },
  巽: { inner: ['辛丑', '辛亥', '辛酉'], outer: ['辛未', '辛巳', '辛卯'] },
  离: { inner: ['己卯', '己丑', '己亥'], outer: ['己酉', '己未', '己巳'] },
  坤: { inner: ['乙未', '乙巳', '乙卯'], outer: ['癸丑', '癸亥', '癸酉'] },
  兑: { inner: ['丁巳', '丁卯', '丁丑'], outer: ['丁亥', '丁酉', '丁未'] },
};

/** 六神（六兽）自初爻向上的固定顺序。 */
export const SIX_SPIRITS = ['青龙', '朱雀', '勾陈', '螣蛇', '白虎', '玄武'];

/**
 * 六神的起神索引：由**日干**决定哪一神落在初爻。
 * 甲乙起青龙、丙丁起朱雀、戊起勾陈、己起螣蛇、庚辛起白虎、壬癸起玄武。
 */
export const SPIRIT_START_BY_DAY_STEM = {
  甲: 0, 乙: 0,
  丙: 1, 丁: 1,
  戊: 2,
  己: 3,
  庚: 4, 辛: 4,
  壬: 5, 癸: 5,
};

/** 六亲名。 */
export const SIX_RELATIVES = ['父母', '兄弟', '子孙', '妻财', '官鬼'];

/** 六冲：支 → 相冲之支。 */
export const BRANCH_CLASH = {
  子: '午', 午: '子', 丑: '未', 未: '丑', 寅: '申', 申: '寅',
  卯: '酉', 酉: '卯', 辰: '戌', 戌: '辰', 巳: '亥', 亥: '巳',
};

/** 六合：支 → 相合之支。 */
export const BRANCH_COMBINE = {
  子: '丑', 丑: '子', 寅: '亥', 亥: '寅', 卯: '戌', 戌: '卯',
  辰: '酉', 酉: '辰', 巳: '申', 申: '巳', 午: '未', 未: '午',
};

/** 三合局：一组三支构成的正五行局。 */
export const THREE_HARMONY = [
  { branches: ['申', '子', '辰'], element: '水' },
  { branches: ['亥', '卯', '未'], element: '木' },
  { branches: ['寅', '午', '戌'], element: '火' },
  { branches: ['巳', '酉', '丑'], element: '金' },
];

/** 相刑（v1 只报「有刑」而不细分三刑种类，避免流派分歧）。 */
export const BRANCH_PUNISH = [
  ['子', '卯'],
  ['寅', '巳'],
  ['巳', '申'],
  ['申', '寅'],
  ['丑', '戌'],
  ['戌', '未'],
  ['未', '丑'],
];
/** 自刑之支。 */
export const SELF_PUNISH = ['辰', '午', '酉', '亥'];

/** 每旬的旬首与旬空。索引 = 旬序（0..5），由 `(六十甲子序 - 干序) / 10` 的旬推得。 */
export const XUN_KONG = [
  { xun: '甲子', kong: ['戌', '亥'] },
  { xun: '甲戌', kong: ['申', '酉'] },
  { xun: '甲申', kong: ['午', '未'] },
  { xun: '甲午', kong: ['辰', '巳'] },
  { xun: '甲辰', kong: ['寅', '卯'] },
  { xun: '甲寅', kong: ['子', '丑'] },
];

/**
 * 二十四节气名，按太阳黄经 15° 递增排列，从春分（0°）开始。
 * 用于由黄经反查节气名，不用于排定月建（月建用另一张「节」表）。
 */
export const SOLAR_TERMS = [
  '春分', '清明', '谷雨', '立夏', '小满', '芒种',
  '夏至', '小暑', '大暑', '立秋', '处暑', '白露',
  '秋分', '寒露', '霜降', '立冬', '小雪', '大雪',
  '冬至', '小寒', '大寒', '立春', '雨水', '惊蛰',
];

/**
 * 十二「节」（非「气」）与月建地支的对应。
 * 月建在交节时刻切换：立春→寅、惊蛰→卯 …… 小寒→丑。
 */
export const MONTH_NODE_TERMS = [
  { term: '立春', longitude: 315, branch: '寅' },
  { term: '惊蛰', longitude: 345, branch: '卯' },
  { term: '清明', longitude: 15, branch: '辰' },
  { term: '立夏', longitude: 45, branch: '巳' },
  { term: '芒种', longitude: 75, branch: '午' },
  { term: '小暑', longitude: 105, branch: '未' },
  { term: '立秋', longitude: 135, branch: '申' },
  { term: '白露', longitude: 165, branch: '酉' },
  { term: '寒露', longitude: 195, branch: '戌' },
  { term: '立冬', longitude: 225, branch: '亥' },
  { term: '大雪', longitude: 255, branch: '子' },
  { term: '小寒', longitude: 285, branch: '丑' },
];

/**
 * 十二时辰地支的归属：索引 = 小时（0..23），值为时支。
 * 子时跨午夜（23:00–00:59），这里按「晚子时属当日之子时」的通行做法映射。
 */
export const HOUR_BRANCH_BY_HOUR = [
  '子', '丑', '丑', '寅', '寅', '卯', '卯', '辰', '辰', '巳', '巳', '午',
  '午', '未', '未', '申', '申', '酉', '酉', '戌', '戌', '亥', '亥', '子',
];

/** 五行相生：我生者。 */
export const ELEMENT_GENERATES = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };

/** 五行相克：我克者。 */
export const ELEMENT_CONTROLS = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };

/** 干支序 → 天干 / 地支。 */
export const sexagenary = (index) => {
  const normalized = ((index % 60) + 60) % 60;
  return {
    index: normalized,
    stem: HEAVENLY_STEMS[normalized % 10],
    branch: EARTHLY_BRANCHES[normalized % 12],
    text: `${HEAVENLY_STEMS[normalized % 10]}${EARTHLY_BRANCHES[normalized % 12]}`,
  };
};

/** 由干支两字反查六十甲子序；非法组合返回 undefined。 */
export const sexagenaryIndexOf = (stem, branch) => {
  const s = HEAVENLY_STEMS.indexOf(stem);
  const b = EARTHLY_BRANCHES.indexOf(branch);
  if (s < 0 || b < 0) return undefined;
  for (let index = 0; index < 60; index += 1) {
    if (index % 10 === s && index % 12 === b) return index;
  }
  return undefined;
};

/**
 * 由卦宫五行与爻地支五行定六亲。
 * @param palaceElement 宫五行（「我」）。
 * @param branch 爻地支。
 * @returns 六亲名。
 */
export const relativeOf = (palaceElement, branch) => {
  const other = BRANCH_ELEMENT[branch];
  if (other === undefined) throw new Error(`relativeOf: 未知地支 ${branch}`);
  if (other === palaceElement) return '兄弟';
  if (ELEMENT_GENERATES[palaceElement] === other) return '子孙';
  if (ELEMENT_CONTROLS[palaceElement] === other) return '妻财';
  if (ELEMENT_CONTROLS[other] === palaceElement) return '官鬼';
  return '父母';
};

/**
 * 由日柱的六十甲子序推旬空。
 * 每旬十位，故 `Math.floor(index / 10)` 直接给出旬序 0..5。
 * @param index 日柱的六十甲子序（0..59）。
 * @returns `{ xun, kong }`，旬首与两个空亡地支。
 */
export const xunKongOfIndex = (index) => XUN_KONG[Math.floor((((index % 60) + 60) % 60) / 10)];

/** 两个地支是否相冲。 */
export const isClash = (a, b) => BRANCH_CLASH[a] === b;

/** 两个地支是否六合。 */
export const isCombine = (a, b) => BRANCH_COMBINE[a] === b;

/** 两个地支是否相刑（含自刑）。 */
export const isPunish = (a, b) => {
  if (a === b) return SELF_PUNISH.includes(a);
  return BRANCH_PUNISH.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
};
