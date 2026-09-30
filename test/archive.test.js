/**
 * 卦例库单测：增删查、原子写、损坏自愈、上限淘汰。
 */

import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { ARCHIVE_FILE, MAX_CASES, createArchive } from '../lib/archive.js';

/** 造一个隔离的 DSH_HOME。优先用系统临时目录，不可写时退到工作区内。 */
const makeHome = () => {
  let dir;
  try {
    dir = mkdtempSync(join(tmpdir(), 'liuyao-test-'));
  } catch {
    const fallback = join(process.cwd(), 'test', '.tmp');
    mkdirSync(fallback, { recursive: true });
    dir = mkdtempSync(join(fallback, 'liuyao-'));
  }
  return dir;
};

const fakeChart = (name = '乾为天', movingPositions = [1]) => ({
  question: 'x',
  primary: { name, palace: '乾', shi: 6, ying: 3 },
  changed: movingPositions.length > 0 ? { name: '天风姤' } : null,
  calendar: { monthBranch: '午', dayPillar: '庚戌', xunKong: ['寅', '卯'] },
  summary: { movingPositions },
  lines: [],
});

test('空库起步、可存取查删', async (t) => {
  const home = makeHome();
  t.after(() => rmSync(home, { recursive: true, force: true }));

  const archive = createArchive({ dshHome: home });
  assert.equal(archive.count(), 0);
  assert.deepEqual(archive.list(), []);
  assert.equal(archive.path, join(home, 'liuyao', ARCHIVE_FILE));

  const saved = await archive.saveAsync({ question: '今年财运', chart: fakeChart(), note: '备注', now: 1000 });
  assert.equal(typeof saved.id, 'string');
  assert.equal(saved.question, '今年财运');
  assert.equal(saved.note, '备注');
  assert.equal(saved.hexagram, '乾为天');
  assert.equal(archive.count(), 1);
  assert.equal(archive.get(saved.id).id, saved.id);
  assert.equal(archive.get('不存在'), undefined);

  // 落盘可被重新读入。
  const reopened = createArchive({ dshHome: home });
  assert.equal(reopened.count(), 1);
  assert.equal(reopened.get(saved.id).question, '今年财运');

  // 列表按时间倒序。
  await archive.saveAsync({ question: '第二卦', chart: fakeChart('坤为地'), now: 2000 });
  const list = archive.list();
  assert.deepEqual(list.map((entry) => entry.question), ['第二卦', '今年财运']);
  assert.equal(archive.list({ limit: 1 }).length, 1);

  assert.equal(await archive.removeAsync('不存在'), false);
  assert.equal(await archive.removeAsync(saved.id), true);
  assert.equal(archive.count(), 1);
  assert.equal(await archive.clearAsync(), 1);
  assert.equal(archive.count(), 0);
});

test('写入是原子的：不会留下 .tmp，且文件始终可解析', async (t) => {
  const home = makeHome();
  t.after(() => rmSync(home, { recursive: true, force: true }));

  const archive = createArchive({ dshHome: home });
  await archive.saveAsync({ question: 'a', chart: fakeChart(), now: 1 });
  await archive.saveAsync({ question: 'b', chart: fakeChart(), now: 2 });

  const dir = join(home, 'liuyao');
  const leftovers = readdirSync(dir).filter((name) => name.endsWith('.tmp'));
  assert.deepEqual(leftovers, [], `残留临时文件：${leftovers.join(', ')}`);
  const parsed = JSON.parse(readFileSync(join(dir, ARCHIVE_FILE), 'utf8'));
  assert.equal(parsed.version, 1);
  assert.equal(parsed.cases.length, 2);
});

test('并发写入被串行化，不会互相覆盖', async (t) => {
  const home = makeHome();
  t.after(() => rmSync(home, { recursive: true, force: true }));

  const archive = createArchive({ dshHome: home });
  await Promise.all(
    Array.from({ length: 25 }, (_, index) => archive.saveAsync({
      question: `并发 ${index}`,
      chart: fakeChart(),
      now: 1000 + index,
    })),
  );

  assert.equal(archive.count(), 25);
  const reopened = createArchive({ dshHome: home });
  assert.equal(reopened.count(), 25);
  const questions = new Set(reopened.list({ limit: 100 }).map((entry) => entry.question));
  for (let index = 0; index < 25; index += 1) {
    assert.ok(questions.has(`并发 ${index}`), `并发写入丢失了第 ${index} 条`);
  }
});

test('超过上限时按时间淘汰最旧记录', async (t) => {
  const home = makeHome();
  t.after(() => rmSync(home, { recursive: true, force: true }));

  const archive = createArchive({ dshHome: home });
  for (let index = 0; index < MAX_CASES + 5; index += 1) {
    await archive.saveAsync({ question: `第 ${index}`, chart: fakeChart(), now: 1000 + index });
  }
  assert.equal(archive.count(), MAX_CASES);
  const list = archive.list({ limit: MAX_CASES });
  assert.equal(list[0].question, `第 ${MAX_CASES + 4}`);
  assert.ok(!list.some((entry) => entry.question === '第 0'), '最旧的记录应当被淘汰');
});

test('文件损坏时备份改名并空库启动', async (t) => {
  const home = makeHome();
  t.after(() => rmSync(home, { recursive: true, force: true }));

  const dir = join(home, 'liuyao');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, ARCHIVE_FILE), '{ 这不是合法 JSON', 'utf8');

  const warnings = [];
  const archive = createArchive({ dshHome: home, logger: { warn: (message) => warnings.push(message) } });
  assert.equal(archive.count(), 0);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /损坏/);
  const backups = readdirSync(dir).filter((name) => name.includes('.corrupt-'));
  assert.equal(backups.length, 1, '损坏文件应被改名备份');

  // 空库仍可正常使用。
  await archive.saveAsync({ question: '恢复后', chart: fakeChart(), now: 1 });
  assert.equal(archive.count(), 1);
});

test('结构正确但混杂坏记录时只丢弃坏记录', async (t) => {
  const home = makeHome();
  t.after(() => rmSync(home, { recursive: true, force: true }));

  const dir = join(home, 'liuyao');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, ARCHIVE_FILE), JSON.stringify({
    version: 1,
    cases: [
      { id: 'good', question: '好记录', chart: fakeChart(), createdAt: 1 },
      { id: 'bad-no-chart', question: '无卦盘' },
      { question: '无 id', chart: fakeChart() },
      null,
    ],
  }), 'utf8');

  const archive = createArchive({ dshHome: home });
  assert.equal(archive.count(), 1);
  assert.equal(archive.get('good').id, 'good');
});

test('DSH_HOME 缺失时回退到 ~/.dsh 路径规则', () => {
  const archive = createArchive({ dshHome: 'D:\\fake\\dsh-home' });
  assert.ok(archive.path.endsWith(join('liuyao', ARCHIVE_FILE)));
  assert.ok(archive.path.startsWith('D:\\fake\\dsh-home'));
  assert.equal(existsSync(archive.path), false, '仅构造句柄不应创建文件');
});
