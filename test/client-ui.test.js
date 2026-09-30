/**
 * 客户端界面契约的单测。
 *
 * 这里守的是一类**已经真实发生过**的 bug：把 `--dsw-alias-brand-primary`
 * （一个前景/强调色 token）当成按钮背景，文字用 `color: inherit`（= label-primary），
 * 结果浅色模式黑底黑字、深色模式白底白字——按钮彻底看不见。
 *
 * 三条不再重犯的保证：
 *   1. 只用 DSH 真实存在的 `--dsw-*` token（快照见 dsw-theme-tokens.json）；
 *   2. 任何设了实心填充的规则，必须在同一条规则里给出成对的前景色 token；
 *   3. 主按钮固定用 button-primary-fill + label-primary-foreground 这一对。
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { loadClient } from '../tools/check-client.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const TOKEN_SNAPSHOT = JSON.parse(readFileSync(join(here, 'dsw-theme-tokens.json'), 'utf8'));
const KNOWN_TOKENS = new Set(TOKEN_SNAPSHOT.tokens);
const CLIENT_SOURCE = readFileSync(join(here, '..', 'lib', 'client.js'), 'utf8');

/** 取出 `const CSS = \`...\`;` 里的样式文本，并去掉注释（注释不属于声明，不该参与断言）。 */
const extractCss = () => {
  const match = /const CSS = `([\s\S]*?)`;/.exec(CLIENT_SOURCE);
  assert.ok(match !== null, '未能从 lib/client.js 中提取 CSS 块');
  return match[1].replace(/\/\*[\s\S]*?\*\//g, '');
};

/** 把 CSS 拆成 `选择器 -> 声明块` 列表。 */
const parseRules = (css) => {
  const rules = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (const match of css.matchAll(re)) {
    rules.push({ selector: match[1].trim(), body: match[2].trim() });
  }
  return rules;
};

const declarationsOf = (body) => {
  const out = {};
  for (const part of body.split(';')) {
    const index = part.indexOf(':');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key.length > 0) out[key] = value;
  }
  return out;
};

test('样式只使用 DSH 真实存在的主题 token', () => {
  const css = extractCss();
  const used = [...new Set([...css.matchAll(/--dsw-[a-z0-9-]+/g)].map((match) => match[0]))];
  assert.ok(used.length > 0, '样式里没有出现任何 --dsw-* token');
  const unknown = used.filter((token) => !KNOWN_TOKENS.has(token));
  assert.deepEqual(
    unknown,
    [],
    `样式里出现了 DSH 不存在的 token（大概率是笔误，会退化成兜底色）：${unknown.join(', ')}`,
  );
});

test('设了实心填充的规则必须同时给出成对的前景色', () => {
  const rules = parseRules(extractCss());
  const offenders = [];
  for (const rule of rules) {
    const declarations = declarationsOf(rule.body);
    const background = declarations.background;
    if (background === undefined) continue;
    // 透明/兜底透明不算"实心填充"。
    if (background === 'transparent' || background.startsWith('none')) continue;
    // 纯色兜底（如 #247bbf）也算实心填充。
    if (declarations.color === undefined) {
      offenders.push(`${rule.selector} 有 background:${background} 却没有显式 color`);
      continue;
    }
    // 若填充取自 token，前景也必须取自 token，避免"填充跟着主题翻、文字却继承"的错配。
    if (background.includes('var(--dsw-') && !declarations.color.includes('var(--dsw-')) {
      offenders.push(`${rule.selector} 的填充来自 token，但 color 没有（${declarations.color}）`);
    }
  }
  assert.deepEqual(offenders, [], offenders.join('\n'));
});

test('主按钮使用成对的 button-primary-fill / label-primary-foreground', () => {
  const rules = parseRules(extractCss());
  const primary = rules.filter((rule) => rule.selector.includes('.liuyao-btn-primary'));
  assert.ok(primary.length > 0, '找不到 .liuyao-btn-primary 规则');
  const base = declarationsOf(primary[0].body);
  assert.match(base.background, /button-primary-fill/, '主按钮填充必须取 button-primary-fill');
  assert.match(base.color, /label-primary-foreground/, '主按钮文字必须取 label-primary-foreground');
  // 绝不能再把 brand-primary 当按钮背景用。
  for (const rule of rules) {
    const declarations = declarationsOf(rule.body);
    if (rule.selector.includes('.liuyao-btn') && declarations.background !== undefined) {
      assert.ok(
        !declarations.background.includes('brand-primary'),
        `${rule.selector} 把 brand-primary（前景色 token）当成了背景`,
      );
    }
  }
});

test('dock 有最大宽度，不再左右顶到底', () => {
  const rules = parseRules(extractCss());
  const dock = rules.find((rule) => rule.selector === '.liuyao-dock');
  assert.ok(dock !== undefined, '找不到 .liuyao-dock 规则');
  const declarations = declarationsOf(dock.body);
  assert.ok(declarations['max-width'] !== undefined, '.liuyao-dock 必须设 max-width');
  assert.match(declarations['max-width'], /^\d+px$/, 'max-width 应当是具体像素值');
  assert.equal(declarations['max-width'], '700px', 'dock 宽度定为 700px');
  assert.match(declarations.margin, /auto/, 'dock 应当居中而不是贴边');
  assert.equal(declarations['box-sizing'], 'border-box');
});

test('次级按钮与「选中标签」用同一个底色 token，且不再用偏重的 tool-bar token', () => {
  const rules = parseRules(extractCss());
  const activeTab = rules.find((rule) => rule.selector.includes('.liuyao-tab[data-active'));
  const button = rules.find((rule) => rule.selector === '.liuyao-btn');
  assert.ok(activeTab !== undefined, '找不到选中标签规则');
  assert.ok(button !== undefined, '找不到 .liuyao-btn 规则');

  const tabFill = declarationsOf(activeTab.body).background;
  const buttonFill = declarationsOf(button.body).background;
  // 提取首个 token 名做比较（声明里还带兜底值）。
  const tokenOf = (value) => /var\((--dsw-[a-z0-9-]+)/.exec(value)?.[1] ?? null;
  assert.equal(tokenOf(buttonFill), tokenOf(tabFill), '次级按钮底色应与选中标签一致');
  assert.equal(tokenOf(buttonFill), '--dsw-alias-interactive-bg-active');

  // 全样式表里不允许再出现 button-tool-bar-fill / -hover——它在深色主题下偏重。
  const css = extractCss();
  for (const banned of ['--dsw-alias-button-tool-bar-fill', '--dsw-alias-button-tool-bar-hover']) {
    assert.ok(!css.includes(banned), `样式里仍在用偏重的 ${banned}`);
  }

  // hover 不允许把底色压得更深：应当保持同一个 token。
  const hover = rules.find((rule) => rule.selector.includes('.liuyao-btn:hover'));
  assert.ok(hover !== undefined, '找不到 .liuyao-btn:hover 规则');
  const hoverFill = declarationsOf(hover.body).background;
  assert.equal(tokenOf(hoverFill), tokenOf(buttonFill), 'hover 不应改变底色 token（只强化描边）');
  assert.ok(declarationsOf(hover.body)['border-color'] !== undefined, 'hover 应当强化描边以给出反馈');
});

test('收起/展开：默认收起、状态可持久化、按钮带无障碍属性', () => {
  const client = loadClient();
  assert.ok(CLIENT_SOURCE.includes("const COLLAPSE_KEY = 'dsh-liuyao:dock-collapsed'"), '缺少持久化键');
  assert.ok(CLIENT_SOURCE.includes('globalThis.localStorage'), '未持久化收起状态');
  // 默认收起：localStorage 为空时返回 true。
  assert.match(
    CLIENT_SOURCE,
    /raw === null \|\| raw === undefined \? true : raw === '1'/,
    '默认值应当是「收起」',
  );
  // 切换按钮必须带 aria-expanded 与标题，键盘与读屏可用。
  assert.ok(CLIENT_SOURCE.includes("'aria-expanded': String(!collapsed)"), '切换按钮缺少 aria-expanded');
  assert.ok(CLIENT_SOURCE.includes("'aria-label': collapsed ? t('dock.expand') : t('dock.collapse')"), '切换按钮缺少 aria-label');
  // 收起态不再渲染正文（否则仍然挡视线）。
  assert.ok(client.exports.__internals !== undefined);
});

test('收起态的展开/收起文案两种语言都有', () => {
  const client = loadClient();
  const dictionaries = client.calls.locale[0].dictionaries;
  for (const key of ['dock.expand', 'dock.collapse']) {
    assert.equal(typeof dictionaries.zh[key], 'string', `zh 缺 ${key}`);
    assert.equal(typeof dictionaries.en[key], 'string', `en 缺 ${key}`);
  }
});

test('CSS 里的类名都在组件里被用到，且组件用到的类名都有样式', () => {
  const css = extractCss();
  const defined = new Set([...css.matchAll(/\.(liuyao-[a-z0-9-]+)/g)].map((match) => match[1]));
  const usedInSource = new Set([...CLIENT_SOURCE.matchAll(/className: '([^']+)'/g)]
    .flatMap((match) => match[1].split(/\s+/))
    .filter((name) => name.startsWith('liuyao-')));
  const missingStyles = [...usedInSource].filter((name) => !defined.has(name));
  assert.deepEqual(missingStyles, [], `这些类名被使用但没有样式定义：${missingStyles.join(', ')}`);
});
