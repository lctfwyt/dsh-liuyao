/**
 * 工具定义与执行的单测。
 *
 * 重点之一是**校验手写的 JSON Schema 落在 DSH 支持的子集内**：
 * 我们刻意没有 import `@deepseek-ai/dsh-tools` 的 `defineTool`（避免第三方插件解析
 * DSH 包的风险），所以这份 schema 必须自己保证合法。DSH 支持的键是
 * `type/oneOf/properties/required/additionalProperties/items/enum/const` + 注解。
 */

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { createArchive } from '../lib/archive.js';
import {
  DEFAULT_TIME_ZONE,
  TOOL_CAST,
  TOOL_CASES,
  buildToolDefinitions,
  parseInstant,
  zonedTimeToInstant,
} from '../lib/tools.js';

/** DSH 支持的 schema 子集（与 dsh-tools 的 checkSchemaNode 一致）。 */
const CONSTRAINT_KEYWORDS = new Set(['type', 'oneOf', 'properties', 'required', 'additionalProperties', 'items', 'enum', 'const']);
const ANNOTATION_KEYWORDS = new Set(['description', 'title', 'default', 'examples']);
const SCHEMA_TYPES = ['string', 'number', 'integer', 'boolean', 'null', 'array', 'object'];

/**
 * 逐条复刻 dsh-tools 的 `checkSchemaNode` / `checkObjectSchemaTail` 规则：
 * 关键字白名单、类型白名单、关键字只能落在匹配的类型上、
 * `required` 必须点名 `properties` 里存在的键、`additionalProperties` 必须是布尔、
 * `enum` 必须是非空且元素类型匹配的数组。
 */
const assertSupportedSubset = (schema, path = 'schema') => {
  assert.ok(schema !== null && typeof schema === 'object' && !Array.isArray(schema), `${path} 必须是对象`);
  for (const key of Object.keys(schema)) {
    assert.ok(
      CONSTRAINT_KEYWORDS.has(key) || ANNOTATION_KEYWORDS.has(key),
      `${path}.${key} 不是 DSH 支持的 schema 键`,
    );
  }
  if (Object.hasOwn(schema, 'description')) {
    assert.equal(typeof schema.description, 'string', `${path}.description 必须是字符串`);
  }
  const hasType = Object.hasOwn(schema, 'type');
  const hasOneOf = Object.hasOwn(schema, 'oneOf');
  assert.ok(!(hasType && hasOneOf), `${path} 不能同时声明 type 与 oneOf`);
  if (hasOneOf) {
    assert.ok(Array.isArray(schema.oneOf) && schema.oneOf.length >= 2, `${path}.oneOf 至少两项`);
    for (const sibling of ['type', 'properties', 'required', 'additionalProperties', 'items', 'enum', 'const']) {
      assert.ok(!Object.hasOwn(schema, sibling), `${path}.${sibling} 不能与 oneOf 并存`);
    }
    schema.oneOf.forEach((child, index) => assertSupportedSubset(child, `${path}.oneOf[${index}]`));
    return;
  }
  if (!hasType) return;
  assert.ok(SCHEMA_TYPES.includes(schema.type), `${path}.type 非法：${schema.type}`);
  const scalar = ['string', 'number', 'integer', 'boolean', 'null'].includes(schema.type);

  // 关键字只能落在匹配的类型上。
  for (const [key, types] of Object.entries({
    properties: ['object'],
    required: ['object'],
    additionalProperties: ['object'],
    items: ['array'],
    enum: ['string', 'number', 'integer', 'boolean', 'null'],
    const: ['string', 'number', 'integer', 'boolean', 'null'],
  })) {
    if (Object.hasOwn(schema, key)) {
      assert.ok(types.includes(schema.type), `${path}.${key} 不能用于 type="${schema.type}"`);
    }
  }

  if (schema.type === 'object') {
    if (Object.hasOwn(schema, 'additionalProperties')) {
      assert.equal(typeof schema.additionalProperties, 'boolean', `${path}.additionalProperties 必须是布尔`);
    }
    if (Object.hasOwn(schema, 'required')) {
      assert.ok(Array.isArray(schema.required) && schema.required.every((entry) => typeof entry === 'string'), `${path}.required 必须是字符串数组`);
      const declared = schema.properties ?? {};
      for (const key of schema.required) {
        assert.ok(Object.hasOwn(declared, key), `${path}.required 点名的 "${key}" 不在 properties 里`);
      }
    }
    for (const [name, child] of Object.entries(schema.properties ?? {})) {
      assertSupportedSubset(child, `${path}.properties.${name}`);
    }
  }

  if (schema.type === 'array' && Object.hasOwn(schema, 'items')) {
    assertSupportedSubset(schema.items, `${path}.items`);
  }

  if (scalar && Object.hasOwn(schema, 'enum')) {
    assert.ok(Array.isArray(schema.enum) && schema.enum.length > 0, `${path}.enum 必须是非空数组`);
    for (const entry of schema.enum) {
      const matches = schema.type === 'integer'
        ? Number.isInteger(entry)
        : schema.type === 'number'
          ? typeof entry === 'number'
          : schema.type === 'null'
            ? entry === null
            : typeof entry === schema.type;
      assert.ok(matches, `${path}.enum 的元素 ${JSON.stringify(entry)} 与 type="${schema.type}" 不符`);
    }
  }
};

const makeHome = () => {
  try {
    return mkdtempSync(join(tmpdir(), 'liuyao-tools-'));
  } catch {
    return mkdtempSync(join(process.cwd(), 'test', '.tmp', 'liuyao-'));
  }
};

const setup = (t) => {
  const home = makeHome();
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const archive = createArchive({ dshHome: home });
  const now = () => Date.parse('2024-06-15T12:00:00+08:00');
  const definitions = buildToolDefinitions({ archive, now });
  return { home, archive, definitions, byName: Object.fromEntries(definitions.map((item) => [item.name, item])) };
};

test('导出两个工具，名字与 schema 合法', (t) => {
  const { definitions, byName } = setup(t);
  assert.equal(definitions.length, 2);
  assert.deepEqual(definitions.map((item) => item.name).sort(), [TOOL_CASES, TOOL_CAST].sort());

  for (const definition of definitions) {
    assert.equal(typeof definition.description, 'string');
    assert.ok(definition.description.length > 100);
    assertSupportedSubset(definition.parameters, `${definition.name}.parameters`);
    assertSupportedSubset(definition.output.schema, `${definition.name}.output.schema`);
    assert.equal(typeof definition.output.render, 'function');
    assert.equal(typeof definition.execute, 'function');
    assert.equal(typeof definition.presentCall, 'function');
    // 参数根节点与 defineTool 的编译产物一致：只有 type/properties/required。
    assert.deepEqual(Object.keys(definition.parameters).sort(), ['properties', 'required', 'type']);
    assert.equal(definition.parameters.type, 'object');
  }

  const cast = byName[TOOL_CAST];
  assert.deepEqual(cast.parameters.required, ['question', 'method']);
  assert.deepEqual(cast.parameters.properties.method.enum, ['coins', 'lines']);
  assert.equal(cast.parameters.properties.lines.items.type, 'integer');
  // 断卦规程必须内嵌在工具描述里，保证不加载技能也能规范断卦。
  assert.ok(cast.description.includes('取用神') || cast.description.includes('定用神'));
  assert.ok(cast.description.includes('免责'));
});

test('liuyao_cast（lines）：装卦、入库、渲染两段内容', async (t) => {
  const { byName, archive } = setup(t);
  const tool = byName[TOOL_CAST];
  const value = await tool.execute({
    question: '今年财运如何',
    method: 'lines',
    lines: [9, 7, 7, 7, 7, 7],
  });

  assert.equal(value.ok, true);
  assert.equal(value.chart.primary.name, '乾为天');
  assert.equal(value.chart.changed.name, '天风姤');
  assert.equal(value.chart.calendar.monthBranch, '午');
  assert.equal(value.chart.palace ?? value.chart.primary.palace, '乾');
  assert.equal(typeof value.archiveId, 'string');
  assert.equal(archive.count(), 1);
  assert.equal(archive.get(value.archiveId).question, '今年财运如何');
  assert.ok(value.markdown.includes('乾为天'));

  const parts = tool.output.render({}, value);
  assert.equal(parts.length, 2);
  assert.ok(parts.every((part) => part.type === 'text' && typeof part.text === 'string'));
  assert.ok(parts[0].text.includes('乾为天'));
  const envelope = JSON.parse(parts[1].text);
  assert.equal(envelope.__liuyao, 'chart');
  assert.equal(envelope.chart.primary.name, '乾为天');
  assert.equal(envelope.archiveId, value.archiveId);
});

test('liuyao_cast（coins）：一键起卦并留下投币审计明细', async (t) => {
  const { byName } = setup(t);
  const value = await byName[TOOL_CAST].execute({ question: '随便看看', method: 'coins' });
  assert.equal(value.chart.method, 'coins');
  assert.equal(value.chart.tosses.length, 6);
  assert.equal(value.chart.values.length, 6);
  for (const toss of value.chart.tosses) {
    assert.equal(toss.faces.length, 3);
    assert.equal(toss.value, 6 + toss.backs);
    assert.ok([6, 7, 8, 9].includes(toss.value));
  }
  assert.deepEqual(value.chart.values, value.chart.tosses.map((toss) => toss.value));
});

test('liuyao_cast：save=false 不入库，at 可指定时刻', async (t) => {
  const { byName, archive } = setup(t);
  const value = await byName[TOOL_CAST].execute({
    question: '不入库',
    method: 'lines',
    lines: [7, 7, 7, 7, 7, 7],
    save: false,
    at: '2023-02-03T20:00:00+08:00',
  });
  assert.equal(value.archiveId, null);
  assert.equal(archive.count(), 0);
  // 2023-02-04 立春前，年干支应为壬寅、月建为丑。
  assert.equal(value.chart.calendar.yearPillar, '壬寅');
  assert.equal(value.chart.calendar.monthBranch, '丑');
});

test('liuyao_cast：参数非法时抛出可读错误', async (t) => {
  const { byName } = setup(t);
  const tool = byName[TOOL_CAST];
  await assert.rejects(() => tool.execute({ method: 'coins' }), /question 必须是非空字符串/);
  await assert.rejects(() => tool.execute({ question: '   ', method: 'coins' }), /question/);
  await assert.rejects(() => tool.execute({ question: 'x', method: '看卦' }), /method 必须是/);
  await assert.rejects(() => tool.execute({ question: 'x', method: 'lines' }), /长度 6 的数组/);
  await assert.rejects(() => tool.execute({ question: 'x', method: 'lines', lines: [1, 2, 3, 4, 5, 6] }), /lines\[0\]/);
  await assert.rejects(() => tool.execute({ question: 'x', method: 'coins', dayBoundary: 'noon' }), /dayBoundary/);
  await assert.rejects(() => tool.execute({ question: 'x', method: 'coins', at: '不是时间' }), /无法识别/);
});

test('liuyao_cases：list / get / delete / clear', async (t) => {
  const { byName } = setup(t);
  const castTool = byName[TOOL_CAST];
  const casesTool = byName[TOOL_CASES];

  const empty = await casesTool.execute({ action: 'list' });
  assert.equal(empty.ok, true);
  assert.deepEqual(empty.envelope.cases, []);
  assert.ok(empty.markdown.includes('卦例库为空'));

  const first = await castTool.execute({ question: '第一卦', method: 'lines', lines: [7, 7, 7, 7, 7, 7] });
  const second = await castTool.execute({ question: '第二卦', method: 'lines', lines: [8, 8, 8, 8, 8, 8] });

  const listed = await casesTool.execute({ action: 'list' });
  assert.equal(listed.envelope.total, 2);
  assert.equal(listed.envelope.cases.length, 2);
  // 列表不携带完整卦盘，避免 list 结果过大。
  assert.equal(listed.envelope.cases[0].chart, undefined);
  assert.ok(listed.envelope.cases.some((entry) => entry.question === '第二卦'));

  const got = await casesTool.execute({ action: 'get', id: first.archiveId });
  assert.equal(got.ok, true);
  assert.equal(got.envelope.case.chart.primary.name, '乾为天');
  assert.equal(JSON.parse(casesTool.output.render({}, got)[1].text).__liuyao, 'cases');

  const missing = await casesTool.execute({ action: 'get', id: '不存在' });
  assert.equal(missing.ok, false);
  assert.match(missing.markdown, /找不到卦例/);

  const deleted = await casesTool.execute({ action: 'delete', id: second.archiveId });
  assert.equal(deleted.ok, true);
  assert.equal(deleted.envelope.total, 1);

  const cleared = await casesTool.execute({ action: 'clear' });
  assert.equal(cleared.envelope.cleared, 1);
  assert.equal((await casesTool.execute({ action: 'list' })).envelope.total, 0);

  await assert.rejects(() => casesTool.execute({ action: '删除' }), /action 必须是/);
  await assert.rejects(() => casesTool.execute({ action: 'get' }), /action="get" 时的 id/);
  await assert.rejects(() => casesTool.execute({ action: 'list', limit: 1.5 }), /limit 必须是整数/);
});

test('时间解析：带偏移与不带偏移两种写法', () => {
  const instant = Date.parse('2024-06-15T12:00:00+08:00');
  assert.equal(parseInstant('2024-06-15T12:00:00+08:00', DEFAULT_TIME_ZONE), instant);
  assert.equal(parseInstant('2024-06-15T04:00:00Z', DEFAULT_TIME_ZONE), instant);
  assert.equal(parseInstant('2024-06-15 12:00:00', DEFAULT_TIME_ZONE), instant);
  assert.equal(parseInstant('2024-06-15 12:00', DEFAULT_TIME_ZONE), instant);
  assert.equal(zonedTimeToInstant('2024-06-15 12:00:00', 'UTC'), Date.UTC(2024, 5, 15, 12, 0, 0));
  assert.equal(DEFAULT_TIME_ZONE, 'Asia/Shanghai');
});
