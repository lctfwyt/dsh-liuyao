/**
 * 卦例库：把每次起卦的完整卦盘存成一份 JSON，供工具与前端面板共用。
 *
 * 为什么不用 `ctx.storageDomain`：那条路要 import `@deepseek-ai/dsh-storage-domain`
 * 与 `zod`，会给一个第三方插件叠加 DSH 包的版本耦合面；而"在 `$DSH_HOME` 下自建
 * JSON"是本机已验证可用的第三方插件做法（dsh-whale-widget 的角色/音效库就是这么存的）。
 *
 * 可靠性措施：
 * - 原子写：先写 `<file>.tmp` 再 rename，任何时刻磁盘上都有一份完整文件。
 * - 单写链：进程内用一条 promise 链串行化所有写操作，避免并发写互相覆盖。
 * - 损坏自愈：JSON 解析失败时把原文件改名备份并空库启动，同时记一条警告。
 * - 上限淘汰：超过 `MAX_CASES` 时按时间从旧到新丢弃，避免无限增长。
 *
 * @module dsh-liuyao/archive
 */

import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** 卦例上限（防止文件无限增长）。 */
export const MAX_CASES = 300;

/** 卦例库文件名。 */
export const ARCHIVE_FILE = 'cases.json';

/** 解析 DSH_HOME：环境变量优先，否则 `~/.dsh`。 */
export const resolveDshHome = (explicit) => explicit ?? process.env.DSH_HOME ?? join(homedir(), '.dsh');

/**
 * 创建一个卦例库句柄。
 *
 * @param params.dshHome DSH 家目录；缺省读 `DSH_HOME` 或 `~/.dsh`。
 * @param params.logger 可选的日志接口（形如 `{ warn }`）。
 * @returns 同步读取 + 异步写入的卦例库句柄。
 */
export const createArchive = ({ dshHome, logger } = {}) => {
  const root = join(resolveDshHome(dshHome), 'liuyao');
  const file = join(root, ARCHIVE_FILE);
  let state = load();
  let writeChain = Promise.resolve();

  /** 读取并校验磁盘上的卦例库；损坏则备份改名后空库启动。 */
  function load() {
    if (!existsSync(file)) return { version: 1, cases: [] };
    let raw;
    try {
      raw = readFileSync(file, 'utf8');
    } catch (error) {
      warn(`读取卦例库失败：${String(error?.message ?? error)}`);
      return { version: 1, cases: [] };
    }
    try {
      const parsed = JSON.parse(raw);
      if (parsed === null || typeof parsed !== 'object' || !Array.isArray(parsed.cases)) {
        throw new Error('结构不是 { version, cases: [] }');
      }
      return { version: 1, cases: parsed.cases.filter(isUsableCase) };
    } catch (error) {
      const backup = `${file}.corrupt-${Date.now()}`;
      try {
        renameSync(file, backup);
        warn(`卦例库损坏（${String(error?.message ?? error)}），已备份到 ${backup} 并以空库启动。`);
      } catch (renameError) {
        warn(`卦例库损坏且备份失败：${String(renameError?.message ?? renameError)}`);
      }
      return { version: 1, cases: [] };
    }
  }

  function warn(message) {
    if (logger !== undefined && typeof logger.warn === 'function') logger.warn(`[liuyao] ${message}`);
  }

  /** 最小可用性校验：坏记录不让整个库失效，但也不能渲染出诡异卡片。 */
  function isUsableCase(entry) {
    return entry !== null
      && typeof entry === 'object'
      && typeof entry.id === 'string'
      && typeof entry.question === 'string'
      && entry.chart !== null
      && typeof entry.chart === 'object';
  }

  /** 原子写盘。 */
  function persist() {
    const tmp = `${file}.tmp`;
    const payload = `${JSON.stringify(state, null, 1)}\n`;
    if (!existsSync(root)) mkdirSync(root, { recursive: true });
    writeFileSync(tmp, payload, 'utf8');
    renameSync(tmp, file);
  }

  /** 串行化一次写操作；返回一个在该次写完成后 settle 的 promise。 */
  function enqueue(task) {
    const next = writeChain.then(task, task);
    // 链上保留一个已消化异常的分支，避免一次失败永久毒化后续写入。
    writeChain = next.then(() => undefined, () => undefined);
    return next;
  }

  return {
    /** 卦例库文件绝对路径。 */
    get path() {
      return file;
    },

    /**
     * 列出卦例（新的在前）。
     * @param params.limit 最多返回条数，默认 50。
     * @returns 精简后的列表项，含卡片所需的卦盘快照。
     */
    list({ limit = 50 } = {}) {
      const size = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), MAX_CASES) : 50;
      return [...state.cases]
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
        .slice(0, size);
    },

    /** 取单条卦例（含完整卦盘）；找不到返回 undefined。 */
    get(id) {
      return state.cases.find((entry) => entry.id === id);
    },

    /** 统计条数。 */
    count() {
      return state.cases.length;
    },

    /**
     * 保存一条卦例。
     * @param params.question 所问之事。
     * @param params.chart 完整卦盘。
     * @param params.note 可选备注。
     * @param params.now 写入时刻（毫秒），便于单测注入。
     * @returns 落盘后的记录。
     */
    saveAsync({ question, chart, note, now = Date.now() }) {
      const record = {
        id: randomUUID(),
        createdAt: now,
        question,
        hexagram: chart?.primary?.name ?? null,
        changed: chart?.changed?.name ?? null,
        palace: chart?.primary?.palace ?? null,
        shi: chart?.primary?.shi ?? null,
        ying: chart?.primary?.ying ?? null,
        monthBranch: chart?.calendar?.monthBranch ?? null,
        dayPillar: chart?.calendar?.dayPillar ?? null,
        xunKong: chart?.calendar?.xunKong ?? null,
        movingPositions: chart?.summary?.movingPositions ?? [],
        note: note ?? null,
        chart,
      };
      return enqueue(() => {
        state.cases.push(record);
        if (state.cases.length > MAX_CASES) {
          state.cases.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
          state.cases = state.cases.slice(0, MAX_CASES);
        }
        persist();
        return record;
      });
    },

    /** 删除一条卦例；不存在返回 false。 */
    removeAsync(id) {
      return enqueue(() => {
        const before = state.cases.length;
        state.cases = state.cases.filter((entry) => entry.id !== id);
        if (state.cases.length === before) return false;
        persist();
        return true;
      });
    },

    /** 清空卦例库；返回清除条数。 */
    clearAsync() {
      return enqueue(() => {
        const removed = state.cases.length;
        state.cases = [];
        persist();
        return removed;
      });
    },
  };
};
