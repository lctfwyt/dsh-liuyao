/**
 * dsh-liuyao —— Client 半边（浏览器）。
 *
 * 本文件是**预编译产物格式**：DSH 不做运行时打包，客户端插件必须以
 * `window.__ModuleLoader__.load({ id, factory })` 的惰性 CJS 形式随包发布。
 * 这里手写这一层，因此不需要任何打包器；JSX 用 `React.createElement` 代替。
 *
 * `require()` 只能解析 DSH 的 9 个 seed 模块（react / react/jsx-runtime /
 * react-dom / react-dom/client / cordis / client-store / ui-slots /
 * ui-primitives / ui-dockkit）以及已在 boot 图中的插件包。
 * 按官方 practices，**不** import `dsh-client-ui-primitives`，样式只用
 * `--dsw-*` 主题 token 自带兜底值。
 *
 * 注册三处：
 *  1. `conversation.input.dock`：composer 上方的「六爻起卦」dock（含「卦例」标签页）。
 *  2. `tool.call.toolview` key=liuyao_cast：把卦盘渲染成标准六爻盘卡片。
 *  3. `ctx.locale.register('liuyao', { zh, en })`：中英文案。
 *
 * @module dsh-liuyao/client
 */

window.__ModuleLoader__.load({
  id: 'dsh-liuyao',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useRef, useEffect, useCallback, useMemo } = React;

    /* ---------------------------------------------------------------- *
     * 常量表（与 lib/engine/tables.js 保持一致，由 test/client.test.js 断言）
     * ---------------------------------------------------------------- */

    /** 八卦三爻（自下而上），用于由爻值推卦名。 */
    const TRIGRAM_LINES = {
      乾: [1, 1, 1], 兑: [1, 1, 0], 离: [1, 0, 1], 震: [1, 0, 0],
      巽: [0, 1, 1], 坎: [0, 1, 0], 艮: [0, 0, 1], 坤: [0, 0, 0],
    };

    /** 八卦卦符。 */
    const TRIGRAM_SYMBOL = {
      乾: '☰', 兑: '☱', 离: '☲', 震: '☳', 巽: '☴', 坎: '☵', 艮: '☶', 坤: '☷',
    };

    /** 六十四卦名（上卦 → 下卦）。与 engine 的 HEXAGRAM_NAMES 必须逐项一致。 */
    const HEX_NAMES = {
      乾: { 乾: '乾为天', 兑: '天泽履', 离: '天火同人', 震: '天雷无妄', 巽: '天风姤', 坎: '天水讼', 艮: '天山遁', 坤: '天地否' },
      兑: { 乾: '泽天夬', 兑: '兑为泽', 离: '泽火革', 震: '泽雷随', 巽: '泽风大过', 坎: '泽水困', 艮: '泽山咸', 坤: '泽地萃' },
      离: { 乾: '火天大有', 兑: '火泽睽', 离: '离为火', 震: '火雷噬嗑', 巽: '火风鼎', 坎: '火水未济', 艮: '火山旅', 坤: '火地晋' },
      震: { 乾: '雷天大壮', 兑: '雷泽归妹', 离: '雷火丰', 震: '震为雷', 巽: '雷风恒', 坎: '雷水解', 艮: '雷山小过', 坤: '雷地豫' },
      巽: { 乾: '风天小畜', 兑: '风泽中孚', 离: '风火家人', 震: '风雷益', 巽: '巽为风', 坎: '风水涣', 艮: '风山渐', 坤: '风地观' },
      坎: { 乾: '水天需', 兑: '水泽节', 离: '水火既济', 震: '水雷屯', 巽: '水风井', 坎: '坎为水', 艮: '水山蹇', 坤: '水地比' },
      艮: { 乾: '山天大畜', 兑: '山泽损', 离: '山火贲', 震: '山雷颐', 巽: '山风蛊', 坎: '山水蒙', 艮: '艮为山', 坤: '山地剥' },
      坤: { 乾: '地天泰', 兑: '地泽临', 离: '地火明夷', 震: '地雷复', 巽: '地风升', 坎: '地水师', 艮: '地山谦', 坤: '坤为地' },
    };

    /** 爻位名（1..6）。 */
    const POSITION_NAMES = ['初爻', '二爻', '三爻', '四爻', '五爻', '上爻'];

    /** 爻值 → 传统名。 */
    const LINE_NAMES = { 6: '老阴', 7: '少阳', 8: '少阴', 9: '老阳' };

    /* ---------------------------------------------------------------- *
     * 纯函数：起卦（浏览器端加密随机源）
     * ---------------------------------------------------------------- */

    /** 均匀取一枚铜钱的正反面：`crypto.getRandomValues` 一个字节，256 可被 2 整除故无偏。 */
    const randomFace = () => {
      const buffer = new Uint8Array(1);
      globalThis.crypto.getRandomValues(buffer);
      return buffer[0] % 2 === 0 ? '背' : '字';
    };

    /** 摇一次（三枚）：爻值 = 6 + 背数。 */
    const tossOnce = () => {
      const faces = [randomFace(), randomFace(), randomFace()];
      const backs = faces.filter((face) => face === '背').length;
      const value = 6 + backs;
      return { faces, backs, value, label: LINE_NAMES[value] };
    };

    /** 由三爻（自下而上）取八卦名。 */
    const trigramOf = (lines) => {
      const key = lines.join('');
      for (const name of Object.keys(TRIGRAM_LINES)) {
        if (TRIGRAM_LINES[name].join('') === key) return name;
      }
      throw new Error(`无法由三爻 [${key}] 反查八卦`);
    };

    /** 由六个爻值（自下而上）取 `{ name, symbol, upper, lower }`。 */
    const hexagramOf = (values) => {
      const lines = values.map((value) => (value % 2 === 1 ? 1 : 0));
      const lower = trigramOf(lines.slice(0, 3));
      const upper = trigramOf(lines.slice(3, 6));
      return {
        name: HEX_NAMES[upper][lower],
        symbol: `${TRIGRAM_SYMBOL[upper]}${TRIGRAM_SYMBOL[lower]}`,
        upper,
        lower,
      };
    };

    /** 变卦的六个爻值（老阳变阴、老阴变阳，少阳少阴不变）。 */
    const changedValuesOf = (values) => values.map((value) => {
      if (value === 9) return 8;
      if (value === 6) return 7;
      return value;
    });

    /** 把爻值数组压成「老阳 少阳 …」形式。 */
    const valuesToLabels = (values) => values.map((value) => LINE_NAMES[value]).join(' ');

    /** 爻的图形标记。 */
    const lineGlyph = (value) => ({ 6: '▅ ▅ ×', 7: '▅▅▅', 8: '▅ ▅', 9: '▅▅▅ ○' }[value] ?? '▅▅▅');

    /* ---------------------------------------------------------------- *
     * 卡片数据提取：对未知的 block 形状做防御式解析
     * ---------------------------------------------------------------- */

    /**
     * 深度收集任意对象里所有字符串。asar 不发布任何 `.d.ts`，
     * `ToolResultNode` 的确切结构无法离线确认，所以这里用「深度扫描 + JSON 入信封」
     * 的稳健契约，而不是硬编码 content[1].text。
     */
    const collectStrings = (node, out = [], depth = 0) => {
      if (depth > 12 || out.length > 400) return out;
      if (typeof node === 'string') {
        out.push(node);
        return out;
      }
      if (Array.isArray(node)) {
        for (const item of node) collectStrings(item, out, depth + 1);
        return out;
      }
      if (node !== null && typeof node === 'object') {
        for (const key of Object.keys(node)) collectStrings(node[key], out, depth + 1);
      }
      return out;
    };

    /**
     * 从一个字符串里尝试解析出带 `__liuyao` 标记的 JSON 信封。
     * 允许字符串前后带说明文字：从第一个 `{` 起、逐步收缩末尾的 `}` 试解析。
     */
    const parseEnvelopeIn = (text, marker) => {
      const start = text.indexOf('{');
      if (start < 0 || !text.includes('__liuyao')) return null;
      let end = text.lastIndexOf('}');
      while (end > start) {
        const candidate = text.slice(start, end + 1);
        if (candidate.length < 16) return null;
        try {
          const parsed = JSON.parse(candidate);
          if (parsed !== null && typeof parsed === 'object' && parsed.__liuyao === marker) return parsed;
          // 解析成功但不是目标信封，继续收缩没有意义。
          return null;
        } catch {
          end = text.lastIndexOf('}', end - 1);
        }
      }
      return null;
    };

    /**
     * 从工具结果 block 中找出带 `__liuyao` 标记的 JSON 信封。
     * @param block 工具结果节点。
     * @param marker 期望的信封类型（`'chart'` / `'cases'`）。
     */
    const findEnvelope = (block, marker) => {
      for (const text of collectStrings(block)) {
        const found = parseEnvelopeIn(text, marker);
        if (found !== null) return found;
      }
      return null;
    };

    /* ---------------------------------------------------------------- *
     * 样式：一个 <style> 标签，类名统一 liuyao- 前缀，只用主题 token（带兜底）
     * ---------------------------------------------------------------- */

    // 只用 DSH 真实存在的主题 token（从 dsh-web-frontend/dist/*.css 枚举得到）。
    // 关键约束：**凡是设成实心填充的地方，前景色必须取成对的 token**——
    // 例如主按钮用 button-primary-fill + label-primary-foreground。
    // 曾经把 brand-primary（一个前景/强调色 token）当按钮背景、文字用 inherit
    // （= label-primary），结果浅色模式黑底黑字、深色模式白底白字。
    const CSS = `
.liuyao-dock{display:flex;flex-direction:column;gap:8px;width:100%;max-width:700px;margin:0 auto 8px;padding:8px 12px;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.3));border-radius:var(--dsw-radius-lg,10px);background:var(--dsw-alias-bg-layer-1,transparent);color:var(--dsw-alias-label-primary,inherit);font-size:13px;line-height:1.5}
.liuyao-col{display:flex;flex-direction:column;gap:8px}
.liuyao-dock-head{display:flex;align-items:center;gap:8px;min-height:24px}
.liuyao-title{font-weight:600;color:var(--dsw-alias-label-primary,inherit);white-space:nowrap}
.liuyao-head-summary{color:var(--dsw-alias-label-secondary,inherit);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.liuyao-spacer{flex:1 1 auto;min-width:0}
.liuyao-tabs{display:flex;gap:4px;flex:0 0 auto}
.liuyao-tab{cursor:pointer;padding:2px 10px;border-radius:999px;border:1px solid transparent;background:transparent;color:var(--dsw-alias-label-secondary,inherit);font-size:12px;font-family:inherit}
.liuyao-tab:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12));color:var(--dsw-alias-label-primary,inherit)}
.liuyao-tab[data-active="true"]{border-color:var(--dsw-alias-border-l2,rgba(127,127,127,.4));background:var(--dsw-alias-interactive-bg-active,rgba(127,127,127,.16));color:var(--dsw-alias-label-primary,inherit);font-weight:600}
/* 次级按钮的底色刻意与「选中标签」取同一个 token（interactive-bg-active）：
   原先用 button-tool-bar-fill 在深色主题下偏重，显得整排按钮发黑。 */
.liuyao-btn{cursor:pointer;padding:4px 12px;border-radius:var(--dsw-radius-md,8px);border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.4));background:var(--dsw-alias-interactive-bg-active,rgba(127,127,127,.16));color:var(--dsw-alias-label-primary,inherit);font-size:13px;font-family:inherit;line-height:1.5}
.liuyao-btn:hover:not(:disabled){border-color:var(--dsw-alias-border-l3,rgba(127,127,127,.6));background:var(--dsw-alias-interactive-bg-active,rgba(127,127,127,.16));color:var(--dsw-alias-label-primary,inherit)}
.liuyao-btn:disabled{opacity:.5;cursor:not-allowed}
.liuyao-btn-icon{padding:2px 8px;min-width:26px;font-size:12px}
.liuyao-btn-primary{border-color:transparent;background:var(--dsw-alias-button-primary-fill,#247bbf);color:var(--dsw-alias-label-primary-foreground,#fff);font-weight:600}
.liuyao-btn-primary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover,#1f6aa8);color:var(--dsw-alias-label-primary-foreground,#fff)}
.liuyao-input{flex:1;min-width:160px;padding:4px 10px;border-radius:var(--dsw-radius-md,8px);border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.4));background:var(--dsw-alias-bg-base,transparent);color:var(--dsw-alias-label-primary,inherit);font-size:13px;font-family:inherit}
.liuyao-input::placeholder{color:var(--dsw-alias-label-tertiary,rgba(127,127,127,.75))}
.liuyao-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.liuyao-coins{display:flex;gap:6px;align-items:center;min-height:22px}
.liuyao-coin{width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.4));background:var(--dsw-alias-interactive-bg-active,rgba(127,127,127,.16));color:var(--dsw-alias-label-primary,inherit)}
.liuyao-coin[data-face="背"]{font-weight:700}
.liuyao-hint{color:var(--dsw-alias-label-secondary,inherit);font-size:12px}
.liuyao-hint-inline{color:var(--dsw-alias-label-tertiary,inherit);font-size:12px}
.liuyao-error{color:var(--dsw-alias-label-error,#d33);font-size:12px}
.liuyao-lines{display:flex;flex-direction:column;gap:1px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;color:var(--dsw-alias-label-primary,inherit)}
.liuyao-line{display:flex;gap:8px;align-items:center}
.liuyao-line[data-moving="true"]{color:var(--dsw-alias-brand-primary,inherit);font-weight:600}
.liuyao-seat{color:var(--dsw-alias-label-secondary,inherit)}
.liuyao-kv{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12px;color:var(--dsw-alias-label-secondary,inherit)}
.liuyao-panel{max-height:300px;overflow:auto;display:flex;flex-direction:column;gap:6px}
.liuyao-case{display:flex;flex-direction:column;gap:2px;padding:6px 8px;border:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.22));border-radius:var(--dsw-radius-md,8px);cursor:pointer;background:transparent;color:var(--dsw-alias-label-primary,inherit);text-align:left;font-size:12px;font-family:inherit}
.liuyao-case:hover{border-color:var(--dsw-alias-border-l3,rgba(127,127,127,.5));background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.1));color:var(--dsw-alias-label-primary,inherit)}
.liuyao-case-q{font-weight:600;color:var(--dsw-alias-label-primary,inherit)}
.liuyao-card{border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.3));border-radius:var(--dsw-radius-lg,10px);padding:10px 12px;display:flex;flex-direction:column;gap:8px;background:var(--dsw-alias-bg-layer-2,transparent);color:var(--dsw-alias-label-primary,inherit);font-size:12px;max-width:100%;box-sizing:border-box}
.liuyao-card-head{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
.liuyao-card-name{font-weight:700;font-size:14px;color:var(--dsw-alias-label-primary,inherit)}
.liuyao-grid-wrap{overflow-x:auto}
.liuyao-grid{display:grid;grid-template-columns:auto auto auto 1fr auto auto;gap:2px 10px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;color:var(--dsw-alias-label-primary,inherit);min-width:max-content}
.liuyao-grid-head{color:var(--dsw-alias-label-secondary,inherit);font-weight:600}
.liuyao-grid-move{color:var(--dsw-alias-brand-primary,inherit);font-weight:600}
.liuyao-tag{display:inline-block;padding:0 6px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.3));color:var(--dsw-alias-label-secondary,inherit);font-size:11px}
.liuyao-muted{color:var(--dsw-alias-label-tertiary,inherit)}
`;

    /* ---------------------------------------------------------------- *
     * 文案
     * ---------------------------------------------------------------- */

    const NS = 'liuyao';

    const zh = {
      'dock.title': '六爻起卦',
      'dock.expand': '展开起卦面板',
      'dock.collapse': '收起起卦面板',
      'dock.tab.cast': '起卦',
      'dock.tab.cases': '卦例',
      'dock.question': '所问何事？（越具体越准，例如"今年下半年换工作能否成功"）',
      'dock.cast': '一键起卦',
      'dock.casting': '起卦中…',
      'dock.again': '重新起卦',
      'dock.ask': '请教解卦',
      'dock.asking': '已送出…',
      'dock.ready': '六爻已成',
      'dock.noQuestion': '请先写下所问之事',
      'dock.sendFailed': '发送失败，请手动把下方文本复制到输入框',
      'dock.hint': '心中默念所问之事，点一下即可起卦（三枚铜钱法，六爻一次生成）。',
      'dock.primary': '本卦',
      'dock.changed': '变卦',
      'dock.static': '六爻安静',
      'cases.title': '卦例库',
      'cases.empty': '还没有卦例。摇一卦就会自动入库。',
      'cases.refresh': '刷新',
      'cases.loading': '加载中…',
      'cases.failed': '读取卦例失败：{message}',
      'cases.delete': '删除',
      'cases.back': '返回列表',
      'card.preparing': '六爻装卦中…',
      'card.month': '月建',
      'card.day': '日辰',
      'card.kong': '旬空',
      'card.palace': '宫',
      'card.shi': '世',
      'card.ying': '应',
      'card.fushen': '伏神',
      'card.change': '变',
      'card.moving': '动爻',
      'card.none': '—',
      'card.missing': '未能从工具结果中解析出卦盘（可在工具调用详情里查看原始输出）',
      'card.saved': '已存入卦例库',
    };

    const en = {
      'dock.title': 'Six-Line Cast',
      'dock.expand': 'Expand the cast panel',
      'dock.collapse': 'Collapse the cast panel',
      'dock.tab.cast': 'Cast',
      'dock.tab.cases': 'Cases',
      'dock.question': 'What are you asking about? (be specific)',
      'dock.cast': 'Cast now',
      'dock.casting': 'Casting…',
      'dock.again': 'Cast again',
      'dock.ask': 'Interpret',
      'dock.asking': 'Sent',
      'dock.ready': 'Hexagram complete',
      'dock.noQuestion': 'Please write your question first',
      'dock.sendFailed': 'Send failed — copy the text below into the composer',
      'dock.hint': 'Hold the question in mind, then tap once to cast all six lines.',
      'dock.primary': 'Primary',
      'dock.changed': 'Changed',
      'dock.static': 'All lines static',
      'cases.title': 'Case Archive',
      'cases.empty': 'No cases yet. Casting one will save it automatically.',
      'cases.refresh': 'Refresh',
      'cases.loading': 'Loading…',
      'cases.failed': 'Failed to load cases: {message}',
      'cases.delete': 'Delete',
      'cases.back': 'Back',
      'card.preparing': 'Building the chart…',
      'card.month': 'Month',
      'card.day': 'Day',
      'card.kong': 'Void',
      'card.palace': 'Palace',
      'card.shi': 'Self',
      'card.ying': 'Other',
      'card.fushen': 'Hidden',
      'card.change': 'Change',
      'card.moving': 'Moving',
      'card.none': '—',
      'card.missing': 'Could not parse a chart from the tool result (see the raw tool output).',
      'card.saved': 'Saved to archive',
    };

    /* ---------------------------------------------------------------- *
     * 组件：卦盘（卡片与卦例面板共用）
     * ---------------------------------------------------------------- */

    /** 六爻盘表格。 */
    function ChartGrid({ chart }) {
      const rows = [];
      for (let index = 5; index >= 0; index -= 1) {
        const line = chart.lines[index];
        const value = line.yinYang === 1 ? (line.moving ? 9 : 7) : (line.moving ? 6 : 8);
        const fushen = line.fushen === null || line.fushen === undefined
          ? '—'
          : `${line.fushen.ganzhi}${line.fushen.element}${line.fushen.relative}`;
        const seat = line.isShi ? '世' : line.isYing ? '应' : '';
        const flags = [
          line.seasonal,
          line.isKong ? '空' : null,
          line.isMonthBroken ? '月破' : null,
          line.dayImpact === 'secret-moving' ? '暗动' : null,
        ].filter(Boolean).join('·');
        const change = line.change === null || line.change === undefined
          ? ''
          : `${line.change.najia}${line.change.element}${line.change.relative}`;
        rows.push(h('div', { className: 'liuyao-grid-head', key: `p${line.position}` }, POSITION_NAMES[index]));
        rows.push(h('div', { className: 'liuyao-grid-head', key: `s${line.position}` }, line.spirit));
        rows.push(h('div', { className: 'liuyao-muted', key: `f${line.position}` }, fushen));
        rows.push(h('div', { className: line.moving ? 'liuyao-grid-move' : '', key: `l${line.position}` },
          `${lineGlyph(value)} ${line.najia}${line.element} ${line.relative}${seat ? ` ${seat}` : ''}`));
        rows.push(h('div', { className: 'liuyao-muted', key: `w${line.position}` }, flags));
        rows.push(h('div', { className: 'liuyao-grid-move', key: `c${line.position}` }, change));
      }
      return h('div', { className: 'liuyao-grid' }, rows);
    }

    /** 卦盘卡片外壳：抬头信息 + 表格。 */
    function ChartCard({ chart, t, archiveId }) {
      if (chart === null || typeof chart !== 'object' || !Array.isArray(chart.lines)) return null;
      const cal = chart.calendar ?? {};
      const primary = chart.primary ?? {};
      const changed = chart.changed;
      const tags = [];
      if (chart.flags?.clash) tags.push('六冲');
      if (chart.flags?.combine) tags.push('六合');
      if (chart.flags?.youhun) tags.push('游魂');
      if (chart.flags?.guihun) tags.push('归魂');
      if (chart.staticHexagram) tags.push('六爻安静');
      return h('div', { className: 'liuyao-card' },
        h('div', { className: 'liuyao-card-head' },
          h('span', { className: 'liuyao-card-name' }, `${primary.name ?? '?'} ${primary.symbol ?? ''}`),
          changed ? h('span', { className: 'liuyao-muted' }, `→ ${changed.name} ${changed.symbol ?? ''}`) : null,
          ...tags.map((tag) => h('span', { className: 'liuyao-tag', key: tag }, tag)),
        ),
        h('div', { className: 'liuyao-kv' },
          h('span', null, `${t('card.palace')}：${primary.palace ?? '?'}（${primary.stepName ?? ''}·${primary.palaceElement ?? ''}）`),
          h('span', null, `${t('card.shi')}${primary.shi ?? '?'}／${t('card.ying')}${primary.ying ?? '?'}`),
          h('span', null, `${t('card.month')}：${cal.monthBranch ?? '?'}`),
          h('span', null, `${t('card.day')}：${cal.dayPillar ?? '?'}`),
          h('span', null, `${t('card.kong')}：${Array.isArray(cal.xunKong) ? cal.xunKong.join('') : '—'}`),
          h('span', null, `${cal.yearPillar ?? ''}年 ${cal.monthPillar ?? ''}月 ${cal.dayPillar ?? ''}日 ${cal.hourPillar ?? ''}时`),
        ),
        chart.question ? h('div', { className: 'liuyao-case-q' }, chart.question) : null,
        h('div', { className: 'liuyao-grid-wrap' }, h(ChartGrid, { chart })),
        archiveId ? h('div', { className: 'liuyao-hint' }, t('card.saved')) : null,
      );
    }

    /** `liuyao_cast` 的工具卡片。 */
    function CastCard(props) {
      const t = typeof props.t === 'function' ? props.t : (key) => key;
      const envelope = useMemo(() => {
        if (props.phase !== 'result') return null;
        return findEnvelope(props.block, 'chart');
      }, [props.phase, props.block]);

      if (props.phase !== 'result') {
        return h('div', { className: 'liuyao-card' }, h('span', { className: 'liuyao-hint' }, t('card.preparing')));
      }
      if (envelope === null) {
        return h('div', { className: 'liuyao-card' }, h('span', { className: 'liuyao-hint' }, t('card.missing')));
      }
      return h(ChartCard, { chart: envelope.chart, t, archiveId: envelope.archiveId });
    }

    /* ---------------------------------------------------------------- *
     * 组件：卦例面板（dock 内第二个标签页）
     * ---------------------------------------------------------------- */

    function CasesPanel({ t }) {
      const [state, setState] = useState({ phase: 'idle', cases: [], error: null, total: 0 });
      const [detail, setDetail] = useState(null);

      const load = useCallback(async () => {
        setState((current) => ({ ...current, phase: 'loading', error: null }));
        try {
          const response = await fetch('/dsh-liuyao/cases?limit=50', { headers: { accept: 'application/json' } });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const payload = await response.json();
          setState({ phase: 'ready', cases: Array.isArray(payload.cases) ? payload.cases : [], total: payload.total ?? 0, error: null });
        } catch (error) {
          setState({ phase: 'error', cases: [], total: 0, error: String(error?.message ?? error) });
        }
      }, []);

      useEffect(() => { load(); }, [load]);

      const openCase = useCallback(async (id) => {
        try {
          const response = await fetch(`/dsh-liuyao/cases/${encodeURIComponent(id)}`, { headers: { accept: 'application/json' } });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const payload = await response.json();
          if (payload?.case?.chart) setDetail(payload.case);
        } catch (error) {
          setState((current) => ({ ...current, error: String(error?.message ?? error) }));
        }
      }, []);

      const removeCase = useCallback(async (id) => {
        try {
          await fetch(`/dsh-liuyao/cases/${encodeURIComponent(id)}`, { method: 'DELETE' });
          setDetail((current) => (current?.id === id ? null : current));
          load();
        } catch (error) {
          setState((current) => ({ ...current, error: String(error?.message ?? error) }));
        }
      }, [load]);

      if (detail !== null) {
        return h('div', { className: 'liuyao-panel' },
          h('div', { className: 'liuyao-row' },
            h('button', { type: 'button', className: 'liuyao-btn', onClick: () => setDetail(null) }, t('cases.back')),
            h('button', { type: 'button', className: 'liuyao-btn', onClick: () => removeCase(detail.id) }, t('cases.delete')),
          ),
          h(ChartCard, { chart: detail.chart, t }),
        );
      }

      return h('div', { className: 'liuyao-panel' },
        h('div', { className: 'liuyao-row' },
          h('span', { className: 'liuyao-hint' }, `${t('cases.title')}（${state.total}）`),
          h('button', { type: 'button', className: 'liuyao-btn', onClick: load, disabled: state.phase === 'loading' },
            state.phase === 'loading' ? t('cases.loading') : t('cases.refresh')),
        ),
        state.error !== null ? h('div', { className: 'liuyao-error' }, t('cases.failed').replace('{message}', state.error)) : null,
        state.cases.length === 0 && state.phase === 'ready' ? h('div', { className: 'liuyao-hint' }, t('cases.empty')) : null,
        ...state.cases.map((entry) => h('button', {
          type: 'button',
          className: 'liuyao-case',
          key: entry.id,
          onClick: () => openCase(entry.id),
        },
        h('span', { className: 'liuyao-case-q' }, entry.question),
        h('span', { className: 'liuyao-hint' },
          `${formatWhen(entry.createdAt)}　${entry.hexagram ?? '?'}${entry.changed ? ` → ${entry.changed}` : ''}　${entry.monthBranch ?? '?'}月 ${entry.dayPillar ?? '?'}日`),
        )),
      );
    }

    /** 时间戳 → 本地 `MM-DD HH:mm`。 */
    const formatWhen = (value) => {
      if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
      const date = new Date(value);
      const pad = (input) => String(input).padStart(2, '0');
      return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    };

    /* ---------------------------------------------------------------- *
     * 组件：起卦 dock
     * ---------------------------------------------------------------- */

    /** 收起状态的本地持久化键。 */
    const COLLAPSE_KEY = 'dsh-liuyao:dock-collapsed';

    /** 读回收起状态；默认**收起**，避免一上来就挡住聊天区。 */
    const readCollapsed = () => {
      try {
        const raw = globalThis.localStorage?.getItem(COLLAPSE_KEY);
        return raw === null || raw === undefined ? true : raw === '1';
      } catch {
        return true;
      }
    };

    /** 写回收起状态；localStorage 不可用时静默忽略。 */
    const writeCollapsed = (collapsed) => {
      try {
        globalThis.localStorage?.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
      } catch {
        // 隐私模式等场景下写不进去，不影响功能。
      }
    };

    function LiuyaoDock(props) {
      const t = typeof props.t === 'function' ? props.t : (key) => key;
      const [collapsed, setCollapsed] = useState(readCollapsed);
      const [tab, setTab] = useState('cast');
      const [question, setQuestion] = useState('');
      const [values, setValues] = useState([]);
      const [current, setCurrent] = useState(null);
      const [phase, setPhase] = useState('idle');
      const [error, setError] = useState(null);
      const runRef = useRef(0);

      const toggleCollapsed = useCallback(() => {
        setCollapsed((currentValue) => {
          const next = !currentValue;
          writeCollapsed(next);
          return next;
        });
      }, []);

      const cast = useCallback(async () => {
        if (question.trim().length === 0) {
          setError(t('dock.noQuestion'));
          return;
        }
        const run = runRef.current + 1;
        runRef.current = run;
        setError(null);
        setValues([]);
        setCurrent(null);
        setPhase('casting');
        const collected = [];
        for (let index = 0; index < 6; index += 1) {
          const toss = tossOnce();
          // 每爻之间留一点节奏，让"摇"这件事看得见。
          await new Promise((resolve) => { setTimeout(resolve, 150); });
          if (runRef.current !== run) return;
          collected.push(toss.value);
          setCurrent(toss);
          setValues([...collected]);
        }
        setPhase('ready');
      }, [question, t]);

      const ask = useCallback(() => {
        const text = buildPrompt(question.trim(), values);
        // 首选：经 slot inject 注入的 send（内部走 client Session 的 prompt）。
        if (typeof props.send === 'function') {
          try {
            props.send(text);
            setPhase('sent');
            setError(null);
            return;
          } catch (sendError) {
            setError(String(sendError?.message ?? sendError));
          }
        }
        // 降级：写进 composer 草稿，由用户自己回车。
        if (props.inputActions && typeof props.inputActions.setDraft === 'function') {
          try {
            props.inputActions.setDraft(text);
            return;
          } catch {
            // 继续落到最后的提示
          }
        }
        setError(t('dock.sendFailed'));
      }, [props, question, values, t]);

      const primary = values.length === 6 ? hexagramOf(values) : null;
      const changed = values.length === 6 ? hexagramOf(changedValuesOf(values)) : null;
      const movingPositions = values.map((value, index) => (value === 6 || value === 9 ? index + 1 : 0)).filter(Boolean);

      // 收起时仍给出一行摘要，让"收起"不等于"失联"。
      const summary = phase === 'casting'
        ? t('dock.casting')
        : primary === null
          ? null
          : `${primary.name} ${primary.symbol}${movingPositions.length === 0 ? `（${t('dock.static')}）` : ` → ${changed.name} ${changed.symbol}`}`;

      return h('div', { className: 'liuyao-dock' },
        h('div', { className: 'liuyao-dock-head' },
          h('button', {
            type: 'button',
            className: 'liuyao-btn liuyao-btn-icon',
            onClick: toggleCollapsed,
            title: collapsed ? t('dock.expand') : t('dock.collapse'),
            'aria-expanded': String(!collapsed),
            'aria-label': collapsed ? t('dock.expand') : t('dock.collapse'),
          }, collapsed ? '▸' : '▾'),
          h('span', { className: 'liuyao-title' }, t('dock.title')),
          collapsed && summary !== null
            ? h('span', { className: 'liuyao-head-summary' }, summary)
            : null,
          h('span', { className: 'liuyao-spacer' }),
          collapsed
            ? null
            : h('span', { className: 'liuyao-tabs' },
              h('button', { type: 'button', className: 'liuyao-tab', 'data-active': String(tab === 'cast'), onClick: () => setTab('cast') }, t('dock.tab.cast')),
              h('button', { type: 'button', className: 'liuyao-tab', 'data-active': String(tab === 'cases'), onClick: () => setTab('cases') }, t('dock.tab.cases')),
            ),
        ),
        collapsed
          ? null
          : tab === 'cases'
            ? h(CasesPanel, { t })
            : h('div', { className: 'liuyao-col' },
              h('div', { className: 'liuyao-row' },
                h('input', {
                  className: 'liuyao-input',
                  value: question,
                  placeholder: t('dock.question'),
                  disabled: phase === 'casting',
                  onChange: (event) => setQuestion(event.target.value),
                  onKeyDown: (event) => { if (event.key === 'Enter' && phase !== 'casting') cast(); },
                }),
                h('button', {
                  type: 'button',
                  className: 'liuyao-btn liuyao-btn-primary',
                  onClick: cast,
                  disabled: phase === 'casting',
                }, phase === 'casting' ? t('dock.casting') : t('dock.cast')),
              ),
              phase === 'idle' ? h('div', { className: 'liuyao-hint' }, t('dock.hint')) : null,
              current !== null && phase === 'casting'
                ? h('div', { className: 'liuyao-row' },
                  h('span', { className: 'liuyao-hint' }, `${POSITION_NAMES[values.length - 1] ?? ''}`),
                  h('span', { className: 'liuyao-coins' },
                    ...current.faces.map((face, index) => h('span', { className: 'liuyao-coin', 'data-face': face, key: index }, face))),
                  h('span', { className: 'liuyao-hint' }, `${current.label} → ${current.value}`),
                )
                : null,
              values.length > 0 ? h('div', { className: 'liuyao-lines' },
                ...values.map((value, index) => {
                  const isMoving = value === 6 || value === 9;
                  return h('div', { className: 'liuyao-line', 'data-moving': String(isMoving), key: index },
                    h('span', { className: 'liuyao-seat' }, POSITION_NAMES[index]),
                    h('span', null, lineGlyph(value)),
                    h('span', null, LINE_NAMES[value]),
                    isMoving ? h('span', null, '动') : null,
                  );
                }),
              ) : null,
              primary !== null ? h('div', { className: 'liuyao-kv' },
                h('span', null, `${t('dock.primary')}：${primary.name} ${primary.symbol}`),
                h('span', null, `${t('dock.changed')}：${movingPositions.length === 0 ? t('dock.static') : `${changed.name} ${changed.symbol}`}`),
                movingPositions.length > 0 ? h('span', null, `${t('card.moving')}：${movingPositions.map((position) => POSITION_NAMES[position - 1]).join('、')}`) : null,
              ) : null,
              primary !== null ? h('div', { className: 'liuyao-row' },
                h('button', { type: 'button', className: 'liuyao-btn', onClick: cast }, t('dock.again')),
                h('button', { type: 'button', className: 'liuyao-btn liuyao-btn-primary', onClick: ask }, phase === 'sent' ? t('dock.asking') : t('dock.ask')),
              ) : null,
              error !== null ? h('div', { className: 'liuyao-error' }, error) : null,
            ),
      );
    }

    /** 组装送进会话的用户消息：显式指示模型调用工具，避免"只聊天不装卦"。 */
    const buildPrompt = (question, values) => [
      '【六爻起卦】',
      `所问：${question}`,
      `六爻（初爻→上爻）：${valuesToLabels(values)}`,
      `爻值：${JSON.stringify(values)}`,
      '',
      `请立即调用 liuyao_cast 工具装卦：method="lines"，question=${JSON.stringify(question)}，lines=${JSON.stringify(values)}。`,
      '装卦后按六爻体例（先定用神，再看月建日辰旺衰，再看动变与世应，最后给应期区间）解读，并引用卦盘字段。',
    ].join('\n');

    /* ---------------------------------------------------------------- *
     * 插件体
     * ---------------------------------------------------------------- */

    const inject = ['slots', 'locale'];

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'liuyao: dictionaries');

      // `sessions` 刻意不写进 inject：写成静态依赖后，一旦该服务缺席，整个插件都不会
      // apply——dock 会彻底不出现。改成运行时惰性取用，最坏情况只是「发送」退化成
      // 写进 composer 草稿，dock 与卡片照常工作。
      const bindSession = (sessionId) => {
        const sessions = typeof ctx.get === 'function' ? ctx.get('sessions') : undefined;
        const binding = sessions?.binding?.(sessionId);
        return binding?.session ?? null;
      };

      ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
        name: 'conversation.input.dock',
        id: 'liuyao',
        order: 30,
        locale: NS,
        // 业务动词经 slot 的 inject 注入为 props（与 dsh-client-ui-goal 的用法一致）。
        inject: (sessionId) => ({
          send: (text) => {
            const session = bindSession(sessionId);
            if (session === null || typeof session.prompt !== 'function') {
              throw new Error('liuyao: 当前会话不可用');
            }
            return session.prompt([{ type: 'text', text }], 'queue');
          },
        }),
      }, LiuyaoDock));

      ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
        name: 'tool.call.toolview',
        key: 'liuyao_cast',
        locale: NS,
      }, CastCard));
    }

    // 样式注入：工厂materialize 时执行一次；预打 data-plugin 便于卸载时被 loader 清理。
    if (typeof document !== 'undefined' && document.querySelector('style[data-plugin="dsh-liuyao"]') === null) {
      const style = document.createElement('style');
      style.setAttribute('data-plugin', 'dsh-liuyao');
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    return {
      inject,
      apply,
      // 供离线单测校验客户端表与引擎表一致：
      __internals: { HEX_NAMES, TRIGRAM_LINES, hexagramOf, changedValuesOf, lineGlyph, collectStrings, findEnvelope, buildPrompt, tossOnce },
    };
  },
});
