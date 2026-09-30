/**
 * 在同一进程内顺序执行 `test/*.test.js`。
 *
 * 为什么不用 `node --test`：DSH 的 Windows 沙箱禁止程序通过管道抓取子进程输出，
 * `node --test` 会为每个测试文件 spawn 一个子进程，因而以 `spawn EPERM` 失败。
 * 逐个 `import` 到同一进程既绕开该限制，又保留 `node:test` 的断言与报告。
 *
 * 用法：`node tools/run-tests.mjs`（全部通过 exit 0；有失败 exit 1）。
 */

import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const testDir = join(root, 'test');

const files = readdirSync(testDir)
  .filter((name) => name.endsWith('.test.js'))
  .sort();

if (files.length === 0) {
  console.error('test/ 下没有找到任何 *.test.js');
  process.exit(1);
}

const failures = [];
for (const file of files) {
  const before = process.exitCode;
  try {
    await import(pathToFileURL(join(testDir, file)).href);
  } catch (error) {
    failures.push(`${file}: ${String(error?.message ?? error)}`);
    process.exitCode = before;
  }
}

// `node:test` 在测试失败时会把 process.exitCode 置为非 0；这里只把「导入阶段就抛错」
// 的文件补报出来，避免把已经打印过的断言失败重复计一遍。
if (failures.length > 0) {
  console.error('\n以下测试文件加载失败：');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exitCode = 1;
}
