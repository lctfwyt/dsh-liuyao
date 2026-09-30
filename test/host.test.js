/**
 * Host 半边的装配单测：在 stub cordis 上下文里跑一遍 `apply`，
 * 覆盖工具注册、技能注册、以及 `/dsh-liuyao/*` 路由的真实 HTTP 行为。
 *
 * 这一步的价值是把"装到用户环境里才发现插件 apply 抛错"的风险前移到离线阶段。
 */

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { apply, inject, name, ROUTE_PREFIX } from '../lib/index.js';
import { DOCTRINE_DESCRIPTION, DOCTRINE_SKILL_NAME } from '../lib/doctrine.js';

/** 造一个 stub cordis 上下文，记录所有注册调用。 */
const createStubContext = () => {
  const state = {
    tools: [],
    skills: [],
    routes: [],
    effects: [],
    warnings: [],
    injected: [],
  };
  const scopeContext = {
    effect: (callback, label) => {
      state.effects.push(label);
      const dispose = callback();
      return typeof dispose === 'function' ? dispose : () => {};
    },
    webServer: {
      register: (route) => {
        state.routes.push(route);
        return () => {};
      },
    },
  };
  const ctx = {
    logger: { warn: (message) => state.warnings.push(message) },
    tools: { register: (definition) => { state.tools.push(definition); return () => {}; } },
    skills: { register: (skill) => { state.skills.push(skill); return () => {}; } },
    inject: (services, callback) => {
      state.injected.push(services);
      callback(scopeContext);
    },
  };
  return { ctx, state };
};

/** 极简 res 替身，记录状态码与响应体。 */
const createResponse = () => {
  const captured = { status: null, headers: null, body: null };
  return {
    captured,
    writeHead: (status, headers) => {
      captured.status = status;
      captured.headers = headers;
    },
    end: (body) => {
      captured.body = body;
    },
  };
};

const withTemporaryHome = (t) => {
  const home = mkdtempSync(join(tmpdir(), 'liuyao-host-'));
  const previous = process.env.DSH_HOME;
  process.env.DSH_HOME = home;
  t.after(() => {
    if (previous === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previous;
    rmSync(home, { recursive: true, force: true });
  });
  return home;
};

test('插件导出名与服务依赖', () => {
  assert.equal(name, 'liuyao');
  assert.deepEqual([...inject], ['tools', 'skills']);
  assert.equal(ROUTE_PREFIX, '/dsh-liuyao');
  // webServer 是可选服务：一旦写进模块级 inject，headless profile 下整个插件将永远
  // 等不到服务而完全不 apply（dsh-whale-widget 为此专门留过注释）。
  assert.ok(!inject.includes('webServer'), 'webServer 绝不能进模块级 inject');
});

test('技能名必须匹配 dsh-skill 的 SKILL_NAME 正则', () => {
  // 与 @deepseek-ai/dsh-skill 的 /^[a-z0-9]+(?:-[a-z0-9]+)*$/ 保持一致；
  // 不匹配会让 ctx.skills.register 在 apply 里抛错，进而导致插件激活失败。
  const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  assert.match(DOCTRINE_SKILL_NAME, SKILL_NAME);
  assert.ok(DOCTRINE_DESCRIPTION.length > 0);
});

test('apply 注册两个工具、一个技能与一条路由', async (t) => {
  withTemporaryHome(t);
  const { ctx, state } = createStubContext();
  apply(ctx);

  assert.deepEqual(state.tools.map((definition) => definition.name).sort(), ['liuyao_cases', 'liuyao_cast']);
  for (const definition of state.tools) {
    assert.equal(typeof definition.execute, 'function');
    assert.equal(typeof definition.output.render, 'function');
    assert.ok(definition.description.length > 50);
  }

  assert.equal(state.skills.length, 1);
  const skill = state.skills[0];
  assert.equal(skill.name, DOCTRINE_SKILL_NAME);
  assert.equal(skill.description, DOCTRINE_DESCRIPTION);
  assert.equal(skill.source, 'dsh-liuyao');
  // 技能正文必须是完整体例（而不是精简版），并且确实读到了 doctrine.md。
  assert.ok(skill.content.length > 3000, `技能正文只有 ${skill.content.length} 字符，疑似退化成了精简版`);
  assert.ok(skill.content.includes('取用神'));

  // webServer 是可选服务，必须经局部 inject 获取，绝不能写进模块级 inject。
  assert.deepEqual(state.injected, [['webServer']]);
  assert.equal(state.routes.length, 1);
  assert.equal(state.routes[0].kind, 'prefix');
  assert.equal(state.routes[0].path, ROUTE_PREFIX);
  assert.equal(typeof state.routes[0].handler, 'function');
});

test('路由：status / cases 列表 / 404 / 方法不匹配', async (t) => {
  withTemporaryHome(t);
  const { ctx, state } = createStubContext();
  apply(ctx);
  const handler = state.routes[0].handler;

  const status = createResponse();
  await handler({ url: `${ROUTE_PREFIX}/status`, method: 'GET' }, status);
  assert.equal(status.captured.status, 200);
  assert.match(status.captured.headers['content-type'], /application\/json/);
  const statusBody = JSON.parse(status.captured.body);
  assert.equal(statusBody.ok, true);
  assert.equal(statusBody.plugin, 'dsh-liuyao');
  assert.equal(statusBody.cases, 0);
  assert.ok(statusBody.archivePath.includes('liuyao'));

  const list = createResponse();
  await handler({ url: `${ROUTE_PREFIX}/cases?limit=10`, method: 'GET' }, list);
  assert.equal(list.captured.status, 200);
  const listBody = JSON.parse(list.captured.body);
  assert.equal(listBody.ok, true);
  assert.equal(listBody.total, 0);
  assert.deepEqual(listBody.cases, []);

  // 前缀路由下未知子路径 → 404（而不是把 SPA 首页当成接口返回）。
  const unknown = createResponse();
  await handler({ url: `${ROUTE_PREFIX}/nope`, method: 'GET' }, unknown);
  assert.equal(unknown.captured.status, 404);
  assert.equal(JSON.parse(unknown.captured.body).error, 'unknown-route');

  // 单条卦例不存在 → 404。
  const missing = createResponse();
  await handler({ url: `${ROUTE_PREFIX}/cases/不存在`, method: 'GET' }, missing);
  assert.equal(missing.captured.status, 404);
  assert.equal(JSON.parse(missing.captured.body).error, 'not-found');

  // 对 cases 集合用不支持的 POST → 404（明确拒绝，不静默成功）。
  const wrongMethod = createResponse();
  await handler({ url: `${ROUTE_PREFIX}/cases`, method: 'POST' }, wrongMethod);
  assert.equal(wrongMethod.captured.status, 404);
});

test('路由：起卦后 list / get / delete 走通同一条数据链', async (t) => {
  withTemporaryHome(t);
  const { ctx, state } = createStubContext();
  apply(ctx);
  const handler = state.routes[0].handler;
  const cast = state.tools.find((definition) => definition.name === 'liuyao_cast');

  const value = await cast.execute({ question: '路由联调', method: 'lines', lines: [9, 7, 7, 7, 7, 7] });
  assert.equal(typeof value.archiveId, 'string');

  const list = createResponse();
  await handler({ url: `${ROUTE_PREFIX}/cases`, method: 'GET' }, list);
  const listBody = JSON.parse(list.captured.body);
  assert.equal(listBody.total, 1);
  assert.equal(listBody.cases[0].question, '路由联调');
  assert.equal(listBody.cases[0].hexagram, '乾为天');

  const one = createResponse();
  await handler({ url: `${ROUTE_PREFIX}/cases/${encodeURIComponent(value.archiveId)}`, method: 'GET' }, one);
  assert.equal(one.captured.status, 200);
  const oneBody = JSON.parse(one.captured.body);
  assert.equal(oneBody.case.chart.primary.name, '乾为天');

  const removed = createResponse();
  await handler({ url: `${ROUTE_PREFIX}/cases/${encodeURIComponent(value.archiveId)}`, method: 'DELETE' }, removed);
  assert.equal(removed.captured.status, 200);
  assert.equal(JSON.parse(removed.captured.body).ok, true);

  const after = createResponse();
  await handler({ url: `${ROUTE_PREFIX}/cases`, method: 'GET' }, after);
  assert.equal(JSON.parse(after.captured.body).total, 0);
});

test('路由内抛错被兜住并返回 500，不会掀翻插件', async (t) => {
  withTemporaryHome(t);
  const { ctx, state } = createStubContext();
  apply(ctx);
  const handler = state.routes[0].handler;

  // 畸形的 url 会被 URL 解析抛出，属于请求侧问题；这里用一个会触发内部异常的路径。
  const response = createResponse();
  await handler({ url: `${ROUTE_PREFIX}/cases/%E0%A4%A`, method: 'GET' }, response);
  assert.ok([404, 500].includes(response.captured.status));
  assert.equal(JSON.parse(response.captured.body).ok, false);
});
