/**
 * dsh-liuyao —— Host 半边。
 *
 * 只依赖 `node:` 内建模块（无任何 `@deepseek-ai/*` import），
 * 因此不存在「第三方插件解析不到 DSH 包」的失败面。
 *
 * 注册三样东西：
 *  1. `tools`：`liuyao_cast`（起卦+装卦）与 `liuyao_cases`（卦例库）。
 *  2. `skills`：`liuyao-divination` 技能，正文即完整解卦体例。
 *  3. `webServer`（**可选**服务）：`/dsh-liuyao/*` 只读路由，给前端「卦例」面板取数据。
 *     刻意不写进 `inject`：headless profile 没有 webServer，一旦进 inject 整个插件会
 *     永远等不到服务而完全不 apply。改用 `ctx.inject([...], cb)` 局部等待。
 *
 * @module dsh-liuyao
 */

import { createArchive } from './archive.js';
import { DOCTRINE_DESCRIPTION, DOCTRINE_FULL, DOCTRINE_SKILL_NAME } from './doctrine.js';
import { buildToolDefinitions } from './tools.js';

/** Cordis 插件名。 */
export const name = 'liuyao';

/** 必需服务：工具注册表与技能注册表。 */
export const inject = ['tools', 'skills'];

/** 只读路由前缀。 */
export const ROUTE_PREFIX = '/dsh-liuyao';

/**
 * 插件入口。
 * @param ctx cordis 插件上下文。
 */
export function apply(ctx) {
  const logger = {
    warn: (message) => {
      if (typeof ctx.logger?.warn === 'function') ctx.logger.warn(message);
    },
  };

  const archive = createArchive({ logger });

  // 工具注册：`ctx.tools.register` 内部以 `layers.effect(this.ctx, …)` 绑定本 fiber，
  // 插件卸载时自动撤销，无需再包一层 effect。
  for (const definition of buildToolDefinitions({ archive })) {
    ctx.tools.register(definition);
  }

  // 技能注册：正文刻意内联随包发布，不依赖用户目录里放文件。
  ctx.skills.register({
    name: DOCTRINE_SKILL_NAME,
    description: DOCTRINE_DESCRIPTION,
    content: DOCTRINE_FULL,
    source: 'dsh-liuyao',
  });

  // 前端「卦例」面板的数据源。webServer 缺失时静默跳过，工具侧不受影响。
  ctx.inject(['webServer'], (scope) => {
    scope.effect(
      () => scope.webServer.register({
        kind: 'prefix',
        path: ROUTE_PREFIX,
        handler: (req, res) => handleRequest({ archive, req, res }),
      }),
      'liuyao: 卦例路由注册',
    );
  });
}

/**
 * `/dsh-liuyao` 下的只读 JSON 接口。
 *
 * 之所以用 HTTP 而不是自定义 Remote：`dsh-api-remotes` 的能力集是构建期固定的，
 * 第三方插件无法在运行期新增 remote 命名空间（见其 README 的 Known Limitations）。
 * 同源 HTTP 路由是本机已验证的第三方做法（dsh-whale-widget 即如此）。
 *
 * 路由：
 *   GET    /dsh-liuyao/status          插件与卦例库状态
 *   GET    /dsh-liuyao/cases?limit=50  卦例列表（不含完整卦盘）
 *   GET    /dsh-liuyao/cases/<id>      单条卦例（含完整卦盘）
 *   DELETE /dsh-liuyao/cases/<id>      删除一条卦例
 */
const handleRequest = async ({ archive, req, res }) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname;
    const method = (req.method ?? 'GET').toUpperCase();

    if (method === 'GET' && (path === `${ROUTE_PREFIX}/status` || path === `${ROUTE_PREFIX}/`)) {
      return sendJson(res, 200, {
        ok: true,
        plugin: 'dsh-liuyao',
        cases: archive.count(),
        archivePath: archive.path,
      });
    }

    if (method === 'GET' && path === `${ROUTE_PREFIX}/cases`) {
      const limit = Number(url.searchParams.get('limit') ?? 50);
      return sendJson(res, 200, {
        ok: true,
        total: archive.count(),
        cases: archive.list({ limit: Number.isFinite(limit) ? limit : 50 }),
      });
    }

    const caseMatch = new RegExp(`^${ROUTE_PREFIX}/cases/([^/]+)$`).exec(path);
    if (caseMatch !== null) {
      const id = decodeURIComponent(caseMatch[1]);
      if (method === 'GET') {
        const found = archive.get(id);
        if (found === undefined) return sendJson(res, 404, { ok: false, error: 'not-found', id });
        return sendJson(res, 200, { ok: true, case: found });
      }
      if (method === 'DELETE') {
        const removed = await archive.removeAsync(id);
        return sendJson(res, removed ? 200 : 404, { ok: removed, id, total: archive.count() });
      }
    }

    return sendJson(res, 404, { ok: false, error: 'unknown-route', method, path });
  } catch (error) {
    return sendJson(res, 500, { ok: false, error: 'internal', message: String(error?.message ?? error) });
  }
};

/** 统一的 JSON 响应。 */
const sendJson = (res, status, payload) => {
  const body = `${JSON.stringify(payload)}\n`;
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
};
