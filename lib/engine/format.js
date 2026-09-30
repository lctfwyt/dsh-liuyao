/**
 * 卦盘 → 模型可读的 Markdown。
 *
 * 输出刻意保持「术语 + 数据」的高密度格式：每一处判断依据都能在文本里找到，
 * 便于模型在解读时逐条引用字段，而不是空泛断语。
 *
 * @module dsh-liuyao/engine/format
 */

/** 爻的图形标记：老阳 ○、老阴 ×。 */
const LINE_GLYPH = {
  6: '▅ ▅ ×',
  7: '▅▅▅',
  8: '▅ ▅',
  9: '▅▅▅ ○',
};

/** 爻值 → 传统名。 */
const LINE_NAME = { 6: '老阴', 7: '少阳', 8: '少阴', 9: '老阳' };

/** 由爻的阴阳与动静反推爻值（用于打印）。 */
const valueOf = (line) => {
  if (line.yinYang === 1) return line.moving ? 9 : 7;
  return line.moving ? 6 : 8;
};

/** 日辰对爻的附加标记。 */
const dayImpactText = (line) => {
  switch (line.dayImpact) {
    case 'clash-moving': return '日冲（动）';
    case 'secret-moving': return '暗动';
    case 'day-broken': return '日破';
    default: return null;
  }
};

/** 把一行内的若干短标记拼成 `（a·b）` 形式；无标记时返回空串。 */
const marks = (list) => {
  const kept = list.filter(Boolean);
  return kept.length === 0 ? '' : `（${kept.join('·')}）`;
};

/**
 * 渲染完整卦盘。
 * @param chart {@link module:dsh-liuyao/engine/chart.buildChart} 的结果。
 * @returns Markdown 文本。
 */
export const formatChartText = (chart) => {
  const { calendar: cal, primary, changed, flags } = chart;
  const out = [];

  out.push('## 六爻卦盘');
  out.push('');
  out.push(`**所问**：${chart.question}`);
  out.push(`**起卦**：${formatLocalTime(chart)}（${chart.timeZone}）`);
  out.push(`**四柱**：${cal.yearPillar}年 ${cal.monthPillar}月 ${cal.dayPillar}日 ${cal.hourPillar}时`);
  out.push(`**月建**：${cal.monthBranch}（${cal.monthNodeTerm}后${cal.nearMonthBoundary ? '，⚠️距交节不足30分钟，月建临界' : ''}）`);
  out.push(`**日辰**：${cal.dayPillar}　**旬**：${cal.xun}　**旬空**：${cal.xunKong.join('')}`);
  out.push(`**本卦**：${primary.name} ${primary.symbol}（${primary.palace}宫·${primary.stepName}·世${primary.shi}应${primary.ying}·宫五行${primary.palaceElement}）`);
  out.push(`**变卦**：${changed === null ? '无（六爻安静）' : `${changed.name} ${changed.symbol}`}`);
  const flagText = formatFlags(flags);
  if (flagText !== null) out.push(`**格局**：${flagText}`);
  out.push('');

  // 卦盘主体：上爻 → 初爻（传统阅读顺序）。
  out.push('| 爻位 | 六神 | 伏神 | 本卦（爻象 纳甲 六亲） | 世应 | 旺衰 | 变卦（纳甲 六亲） |');
  out.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (let index = 5; index >= 0; index -= 1) {
    const line = chart.lines[index];
    const value = valueOf(line);
    const fushen = line.fushen === null || line.fushen === undefined
      ? '—'
      : `${line.fushen.ganzhi}${line.fushen.element} ${line.fushen.relative}`;
    const seat = line.isShi ? '**世**' : line.isYing ? '**应**' : '';
    const seasonal = `${line.seasonal}${marks([
      line.isKong ? '空' : null,
      line.isMonthBroken ? '月破' : null,
      dayImpactText(line),
    ])}`;
    const change = line.change === null || line.change === undefined
      ? ''
      : `${line.change.najia}${line.change.element} ${line.change.relative}${marks([
        line.change.relation,
        line.change.advance,
        line.change.isKong ? '变空' : null,
        line.change.isMonthBroken ? '变破' : null,
        line.change.tomb ? '化墓' : null,
        line.change.extinction ? '化绝' : null,
      ])}`;
    out.push(`| ${positionName(line.position)} | ${line.spirit} | ${fushen} | ${LINE_GLYPH[value]} ${line.najia}${line.element} ${line.relative} | ${seat} | ${seasonal} | ${change} |`);
  }
  out.push('');

  // 动变明细：逐条给出可引用的判断依据。
  if (chart.movingLines.length === 0) {
    out.push('**动变**：六爻安静，无动爻。以世应、月建日辰生克与格局论事。');
  } else {
    out.push(`**动变**（共 ${chart.movingLines.length} 爻发动）：`);
    for (const line of chart.movingLines) {
      const change = line.change;
      const bits = [
        `${positionName(line.position)} ${line.najia}${line.element}（${line.relative}${line.isShi ? '·世' : line.isYing ? '·应' : ''}，${LINE_NAME[valueOf(line)]}动）`,
        `→ 变 ${change.najia}${change.element}（${change.relative}）`,
        change.relation,
        change.advance,
        change.isKong ? '变爻旬空（化空）' : null,
        change.isMonthBroken ? '变爻月破（化破）' : null,
        change.tomb ? '变爻为本爻五行之墓（化墓）' : null,
        change.extinction ? '变爻为本爻五行之绝地（化绝）' : null,
        `变爻${change.seasonal}`,
      ].filter(Boolean);
      out.push(`- ${bits.join('，')}`);
    }
  }
  out.push('');

  // 六亲齐全度与伏神。
  const missing = chart.summary.relativesMissing;
  out.push(`**六亲**：现 ${chart.summary.relativesPresent.join('、')}${missing.length > 0 ? `；缺 ${missing.join('、')}（见伏神列）` : '（六亲齐全）'}`);
  const fushenList = chart.lines.filter((line) => line.fushen !== null && line.fushen !== undefined);
  if (fushenList.length > 0) {
    out.push(`**伏神**：${fushenList.map((line) => `${positionName(line.position)}伏 ${line.fushen.ganzhi}${line.fushen.element} ${line.fushen.relative}（飞神 ${line.fushen.flying.relative}${marks([line.fushen.flying.moving ? '动' : null, line.fushen.flying.isKong ? '空' : null])}）`).join('；')}`);
  }
  if (flags.movingThreeHarmony.length > 0) {
    out.push(`**动爻三合**：${flags.movingThreeHarmony.map((group) => `${group.branches.join('')}合${group.element}局（动爻占 ${group.movingHits.join('')}）`).join('；')}`);
  }
  if (flags.threeHarmony.length > 0) {
    out.push(`**全卦三合**：${flags.threeHarmony.map((group) => `${group.branches.join('')}合${group.element}局（第 ${group.positions.join('、')} 爻）`).join('；')}`);
  }
  out.push('');
  out.push('**世应**：世在' + positionName(chart.primary.shi) + `（${describeLineBrief(chart, chart.primary.shi)}）；应在` + positionName(chart.primary.ying) + `（${describeLineBrief(chart, chart.primary.ying)}）`);

  return out.join('\n');
};

/** 取第 n 爻的一句话简述（爻位从 1 起）。 */
const describeLineBrief = (chart, position) => {
  const line = chart.lines[position - 1];
  return `${line.najia}${line.element} ${line.relative}${marks([
    line.seasonal,
    line.isKong ? '空' : null,
    line.isMonthBroken ? '月破' : null,
    line.moving ? '动' : null,
  ])}`;
};

/** 格局文本。 */
const formatFlags = (flags) => {
  const parts = [];
  if (flags.clash) parts.push('六冲卦');
  if (flags.combine) parts.push('六合卦');
  if (flags.youhun) parts.push('游魂卦');
  if (flags.guihun) parts.push('归魂卦');
  return parts.length === 0 ? null : parts.join('、');
};

/** 爻位中文名。 */
export const positionName = (position) => ['初爻', '二爻', '三爻', '四爻', '五爻', '上爻'][position - 1] ?? `${position}爻`;

/**
 * 起卦时刻的本地化显示（按卦盘所属时区）。
 * @param chart 卦盘。
 * @returns `YYYY-MM-DD HH:mm:ss`。
 */
export const formatLocalTime = (chart) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: chart.timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(new Date(chart.castInstant));
  const map = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  const hour = String(Number(map.hour) % 24).padStart(2, '0');
  return `${map.year}-${map.month}-${map.day} ${hour}:${map.minute}:${map.second}`;
};
