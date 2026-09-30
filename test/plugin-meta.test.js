/**
 * 插件**展示元数据**的单测。
 *
 * 这是发布后用户第一眼看到的东西：插件页里的「插件介绍」。DSH 的读取逻辑
 * （`dsh-app-boot` 的 `readPluginMeta` / `dictionariesOf`）是这样的：
 *
 *   1. 先解析 `<包名>/locale/en.json`——**这个文件是锚点**，解析不到就完全不看任何语言文件；
 *   2. 以该文件所在目录为准，枚举同目录下所有 `*.json`，文件名必须是语言 id（小写、不可重复）；
 *   3. 每个文件读 `meta.title` / `meta.description`，都要求是非空字符串；
 *   4. `package.json` 的 `name` / `description` 作为 `en` 兜底值。
 *
 * 两个静默失败的模式必须被测试拦住：
 *   - `exports` 里没写 `./locale/*.json` → 解析抛 `ERR_PACKAGE_PATH_NOT_EXPORTED`，
 *     被 `optionalResourcePath` 吞掉，于是**悄悄退回 package.json 的 description**；
 *   - 把 `title` / `description` 写在文件顶层（而不是 `meta` 里）→ 读不到，也是静默无效。
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGE = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const LOCALE_DIR = join(ROOT, 'locale');

/** 与 dsh-app-boot 的 `LANGUAGE_ID` 一致。 */
const LANGUAGE_ID = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u;

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

const localeFiles = () => readdirSync(LOCALE_DIR).filter((name) => name.endsWith('.json'));

test('locale/en.json 存在——它是 DSH 读取展示元数据的锚点', () => {
  assert.ok(localeFiles().includes('en.json'), '缺少 locale/en.json：DSH 会完全不看任何语言文件');
});

test('至少提供中文与英文两套展示元数据', () => {
  const names = localeFiles();
  assert.ok(names.includes('zh.json'), '缺少中文展示元数据');
  assert.ok(names.includes('en.json'), '缺少英文展示元数据');
  for (const name of names) {
    assert.match(name.slice(0, -5), LANGUAGE_ID, `${name} 的文件名不是合法的语言 id`);
  }
  // DSH 会把语言 id 小写化并拒绝重复，所以同一语言不能有两种大小写拼法。
  const lowered = names.map((name) => name.slice(0, -5).toLowerCase());
  assert.equal(new Set(lowered).size, lowered.length, '语言 id 小写化后出现重复');
});

test('每个语言文件的 meta.title / meta.description 都是非空字符串', () => {
  for (const name of localeFiles()) {
    const parsed = readJson(join(LOCALE_DIR, name));
    assert.equal(typeof parsed, 'object', `${name} 必须是 JSON 对象`);
    assert.ok(parsed !== null, `${name} 不能是 null`);
    const meta = parsed.meta;
    assert.equal(typeof meta, 'object', `${name} 缺少 meta 对象`);
    assert.ok(meta !== null, `${name}.meta 不能是 null`);
    for (const field of ['title', 'description']) {
      const value = meta[field];
      assert.equal(typeof value, 'string', `${name}: meta.${field} 必须是字符串`);
      assert.ok(value.trim().length > 0, `${name}: meta.${field} 不能为空`);
    }
  }
});

test('展示文案不能写在顶层——DSH 只读 meta 里的字段', () => {
  for (const name of localeFiles()) {
    const parsed = readJson(join(LOCALE_DIR, name));
    const stray = ['title', 'description', 'name'].filter((key) => Object.hasOwn(parsed, key));
    assert.deepEqual(
      stray,
      [],
      `${name} 顶层出现了 ${stray.join('/')}——DSH 只读 meta.title / meta.description，写在顶层是静默无效`,
    );
  }
});

test('exports 必须声明 ./locale/*.json，否则展示元数据被静默忽略', () => {
  const keys = Object.keys(PACKAGE.exports ?? {});
  assert.ok(
    keys.includes('./locale/*.json'),
    `exports 缺少 "./locale/*.json"。缺了它，解析 ${PACKAGE.name}/locale/en.json 会抛 `
    + 'ERR_PACKAGE_PATH_NOT_EXPORTED，被 optionalResourcePath 吞掉，插件页会静默退回 package.json 的 description',
  );
  // 另外两个半边也不能少。
  assert.ok(keys.includes('.'), 'exports 缺少 "."');
  assert.ok(keys.includes('./client'), 'exports 缺少 "./client"（客户端半边）');
});

test('package.json 的 name / description 是非空的兜底值', () => {
  // localizedText 会用 manifest 的 name/description 充当 en 兜底，不能为空。
  assert.equal(typeof PACKAGE.name, 'string');
  assert.ok(PACKAGE.name.trim().length > 0);
  assert.equal(typeof PACKAGE.description, 'string');
  assert.ok(PACKAGE.description.trim().length > 0, 'description 是插件页的英文兜底，不能为空');
});

test('展示元数据不残留旧文案', () => {
  // 曾经用来描述「三枚铜钱真实摇卦」的旧措辞，不得在任何展示面复活。
  const surfaces = [
    PACKAGE.description,
    ...localeFiles().map((name) => readFileSync(join(LOCALE_DIR, name), 'utf8')),
  ].join('\n');
  for (const forbidden of ['三枚铜钱真实摇卦', '真实摇卦']) {
    assert.ok(!surfaces.includes(forbidden), `展示文案里出现了旧措辞「${forbidden}」`);
  }
  // 交互口径是「一键起卦」，应当出现在中文展示文案里。
  const zh = readJson(join(LOCALE_DIR, 'zh.json'));
  assert.ok(
    `${zh.meta.description}${PACKAGE.description}`.includes('一键起卦'),
    '中文展示文案应当说明是「一键起卦」',
  );
});

test('发布的 files 列表包含 locale', () => {
  const files = PACKAGE.files ?? [];
  assert.ok(
    files.some((entry) => entry === 'locale/*.json' || entry === 'locale'),
    'files 列表缺 locale，npm 包不会带上展示元数据',
  );
});

/* ─────────────────────── 发布面向的元数据 ─────────────────────── */

/** 仓库地址：文档、npm 页面与 GitHub 安装命令都必须与它一致。 */
const REPO = 'lctfwyt/dsh-liuyao';

test('包可以被发布（不能有 private: true）', () => {
  assert.notEqual(
    PACKAGE.private,
    true,
    'private: true 会让 npm publish 直接拒绝；要发 npm 就必须去掉',
  );
});

test('repository / homepage / bugs 都指向同一个仓库，且没有占位符', () => {
  assert.ok(PACKAGE.repository !== undefined, '缺少 repository');
  assert.equal(PACKAGE.repository.type, 'git');
  assert.ok(PACKAGE.repository.url.includes(REPO), `repository.url 应当包含 ${REPO}`);

  assert.ok(PACKAGE.homepage !== undefined, '缺少 homepage');
  assert.ok(PACKAGE.homepage.includes(REPO), `homepage 应当包含 ${REPO}`);

  assert.ok(PACKAGE.bugs !== undefined, '缺少 bugs');
  assert.ok(PACKAGE.bugs.url.includes(REPO), `bugs.url 应当包含 ${REPO}`);

  // 占位符如果溜进发布就会出现在 npm 页面上。
  const surfaces = [PACKAGE.repository.url, PACKAGE.homepage, PACKAGE.bugs.url].join('\n');
  for (const placeholder of ['<owner>', '<your-org>', 'example.com', '<你的GitHub用户名>']) {
    assert.ok(!surfaces.includes(placeholder), `发布元数据里残留占位符 ${placeholder}`);
  }
});

test('author 与 LICENSE 的著作权人一致', () => {
  assert.equal(PACKAGE.author, 'dsh-liuyao contributors');
  const license = readFileSync(join(ROOT, 'LICENSE'), 'utf8');
  assert.ok(license.includes('dsh-liuyao contributors'), 'LICENSE 的著作权人应当与 author 一致');
});

test('用户文档只提供 npm / GitHub 安装，不含本地路径安装', () => {
  // 面向用户的安装方式固定为 npm 或 GitHub；本地 link 只允许作为「维护者提示」出现，
  // 且不得给出真实盘符路径（脱敏扫描另外管这件事）。
  for (const doc of ['README.md', join('docs', 'DEVELOPMENT.md')]) {
    const text = readFileSync(join(ROOT, doc), 'utf8');
    assert.ok(text.includes('dsh-liuyao'), `${doc} 应当给出 npm 安装用的包名`);
    assert.ok(
      text.includes(`github:${REPO}`),
      `${doc} 应当给出 GitHub 安装命令 github:${REPO}`,
    );
    for (const bad of ['link:D:', 'link:C:', 'link:/Users', 'link:<仓库绝对路径>']) {
      assert.ok(!text.includes(bad), `${doc} 仍在把「${bad}」写成安装方式`);
    }
  }
});
