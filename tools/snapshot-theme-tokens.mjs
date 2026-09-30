/**
 * 从 DSH 安装包重新枚举 `--dsw-*` 主题 token，刷新 `test/dsw-theme-tokens.json`。
 *
 * 为什么需要它：`test/client-ui.test.js` 用这张快照拦住「样式里写了 DSH 不存在的
 * token」这类笔误（曾经把 `--dsw-alias-brand-primary`——一个前景/强调色 token——
 * 当成按钮背景，导致浅色黑底黑字、深色白底白字）。DSH 升级后 token 可能有增减，
 * 届时重跑本脚本刷新快照，再跑测试。
 *
 * 用法：`node tools/snapshot-theme-tokens.mjs [asar路径]`
 */

import { existsSync, openSync, readSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 候选的 app.asar 位置。
 *
 * 这里**不写死任何用户名或盘符**——桌面版可能装在任意盘。解析顺序：
 *   1. 命令行参数
 *   2. `DSH_ASAR` 环境变量
 *   3. `%LOCALAPPDATA%\Programs\DeepSeek Harness\resources\app.asar`
 *   4. `%PROGRAMFILES%\DeepSeek Harness\resources\app.asar`
 * 都找不到时会给出可操作的报错，而不是猜一个路径然后 ENOENT。
 */
export const asarCandidates = (explicit) => [
  explicit,
  process.env.DSH_ASAR,
  process.env.LOCALAPPDATA === undefined ? undefined : join(process.env.LOCALAPPDATA, 'Programs', 'DeepSeek Harness', 'resources', 'app.asar'),
  process.env.PROGRAMFILES === undefined ? undefined : join(process.env.PROGRAMFILES, 'DeepSeek Harness', 'resources', 'app.asar'),
].filter((candidate) => typeof candidate === 'string' && candidate.length > 0);

/** 取第一个真实存在的候选路径；都不存在返回 undefined。 */
export const resolveAsar = (explicit) => asarCandidates(explicit).find((candidate) => existsSync(candidate));

/** Web 前端 dist 在 asar 里的路径前缀。 */
export const DIST_PREFIX = 'dsh/node_modules/@deepseek-ai/dsh-web-frontend/dist';

const OUT_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', 'test', 'dsw-theme-tokens.json');

/**
 * 用最小的 asar 读取器打开归档（只读头部 + 按需读取条目，不依赖任何第三方包）。
 * @param asarPath asar 文件路径。
 * @returns `{ readEntry, listFiles }`。
 */
export const openArchive = (asarPath) => {
  const fd = openSync(asarPath, 'r');
  const sizeBuffer = Buffer.alloc(16);
  readSync(fd, sizeBuffer, 0, 16, 0);
  const headerSize = sizeBuffer.readUInt32LE(12);
  const headerBuffer = Buffer.alloc(headerSize);
  readSync(fd, headerBuffer, 0, headerSize, 16);
  const header = JSON.parse(headerBuffer.toString('utf8'));
  const baseOffset = 16 + headerSize;

  const nodeAt = (path) => {
    let current = header;
    for (const part of path.split('/')) {
      if (current?.files?.[part] === undefined) return null;
      current = current.files[part];
    }
    return current;
  };

  return {
    readEntry(path) {
      const entry = nodeAt(path);
      if (entry === null || entry.files) return null;
      const offset = Number.parseInt(entry.offset, 10);
      if (!Number.isFinite(offset)) return null;
      const buffer = Buffer.alloc(entry.size);
      readSync(fd, buffer, 0, entry.size, baseOffset + offset);
      return buffer.toString('utf8');
    },
    listFiles(path, out = []) {
      const entry = nodeAt(path);
      if (entry === null) return out;
      for (const key of Object.keys(entry.files ?? {})) {
        const child = entry.files[key];
        const childPath = `${path}/${key}`;
        if (child.files) this.listFiles(childPath, out);
        else out.push(childPath);
      }
      return out;
    },
  };
};

const main = () => {
  const asarPath = resolveAsar(process.argv[2]);
  if (asarPath === undefined) {
    console.error('找不到 app.asar。请显式指定路径，例如：');
    console.error('  node tools/snapshot-theme-tokens.mjs "D:\\path\\to\\DeepSeek Harness\\resources\\app.asar"');
    console.error('或设置环境变量 DSH_ASAR。已尝试的位置：');
    for (const candidate of asarCandidates(process.argv[2])) console.error(`  - ${candidate}`);
    process.exit(1);
  }
  const archive = openArchive(asarPath);
  const cssFiles = archive.listFiles(DIST_PREFIX).filter((file) => file.endsWith('.css'));
  if (cssFiles.length === 0) {
    console.error(`在 ${asarPath} 里找不到 ${DIST_PREFIX} 下的 CSS`);
    process.exit(1);
  }

  const tokens = new Set();
  for (const file of cssFiles) {
    const text = archive.readEntry(file) ?? '';
    for (const match of text.matchAll(/--dsw-[a-z0-9-]+/g)) tokens.add(match[0]);
  }
  const sorted = [...tokens].sort();
  writeFileSync(OUT_FILE, `${JSON.stringify({
    note: 'DSH Web 前端 dist/*.css 里出现的全部 --dsw-* 主题 token（快照）。client.js 只允许使用这张表里的 token；用到表外 token 视为笔误，测试会失败。',
    source: cssFiles.map((file) => file.replace(`${DIST_PREFIX}/`, '')).join(' + '),
    capturedFrom: 'DeepSeek Harness app.asar',
    tokens: sorted,
  }, null, 2)}\n`, 'utf8');

  console.log(`已写入 ${OUT_FILE}`);
  console.log(`来源 CSS：${cssFiles.map((file) => file.split('/').pop()).join(' + ')}`);
  console.log(`token 数：${sorted.length}`);
};

if (process.argv[1] !== undefined && process.argv[1].endsWith('snapshot-theme-tokens.mjs')) {
  main();
}
