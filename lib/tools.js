/**
 * `liuyao_cast` / `liuyao_cases` 两个工具的定义与执行。
 *
 * 为什么手写工具定义、不 import `@deepseek-ai/dsh-tools` 的 `defineTool`：
 * `defineTool` 的作用只是「参数 DSL → JSON Schema」+ 一次参数校验，而它返回的就是
 * 一个普通对象 `{ name, description, parameters(JSON Schema), output, execute, ... }`。
 * 手写标准 JSON Schema 可以完全去掉本插件对任何 DSH 包的 import，
 * 让 Host 半边**只依赖 node: 内建模块**，从而彻底消除第三方插件解析 DSH 包的失败面。
 * 代价是参数校验由本文件自己做（见 {@link assertArgs}），换来的是可离线全测。
 *
 * @module dsh-liuyao/tools
 */

import { castByCoins, normalizeLineValues } from './engine/cast.js';
import { buildChart } from './engine/chart.js';
import { civilTimeOf } from './engine/calendar.js';
import { formatChartText } from './engine/format.js';
import { DOCTRINE_SHORT } from './doctrine.js';

/** 默认时区。 */
export const DEFAULT_TIME_ZONE = 'Asia/Shanghai';

/** 工具名。 */
export const TOOL_CAST = 'liuyao_cast';
export const TOOL_CASES = 'liuyao_cases';

/** 卡片与前端约定的 JSON 信封标记。 */
export const ENVELOPE_CHART = 'chart';
export const ENVELOPE_CASES = 'cases';

/**
 * 组装工具定义。
 *
 * @param params.archive {@link module:dsh-liuyao/archive.createArchive} 产出的卦例库。
 * @param params.now 取当前时刻的函数（便于单测注入）。
 * @returns `{ name, description, parameters, output, execute, presentCall }[]`。
 */
export const buildToolDefinitions = ({ archive, now = () => Date.now() }) => [
  buildCastTool({ archive, now }),
  buildCasesTool({ archive }),
];

/** 工具名 + 一段永远在场的断卦规程，保证不加载技能也能规范断卦。 */
const castDescription = [
  '六爻（纳甲筮法）起卦与装卦。用于用户问卦、起卦、要求以六爻断事，或需要把一个六爻卦盘装出来时。',
  '会给出完整卦盘：本卦/变卦、所属八宫与世应、纳甲干支、六亲、六神、旬空、月破、旺衰、伏神、变爻关系与格局。',
  '装卦后请按工具返回的断卦规程解读，并引用卦盘字段。',
  '',
  '参数用法：',
  '- method="coins"：由本工具一键起卦（一次调用即出六爻，底层按三枚铜钱法取爻，系统加密随机源，不需要用户操作）。用户说"起一卦/帮我起一卦"时用它。',
  '- method="lines"：用调用方已经得到的六个爻值装卦（例如用户在界面上点了「一键起卦」，或用户自己报了爻）。',
  '  此时必须传 lines：长度 6 的数组，自初爻至上爻，元素取 6(老阴) / 7(少阳) / 8(少阴) / 9(老阳)。',
  '- at 缺省为当前时刻；timezone 缺省 ' + DEFAULT_TIME_ZONE + '。monthBranch 由节气定，不是农历月。',
  '',
  DOCTRINE_SHORT,
].join('\n');

/**
 * `liuyao_cast`：起卦 + 装卦 +（默认）存入卦例库。
 */
const buildCastTool = ({ archive, now }) => ({
  name: TOOL_CAST,
  description: castDescription,
  parameters: {
    type: 'object',
    properties: {
      question: {
        type: 'string',
        description: '用户所问的具体事项，原话照录。解读只用它来定用神，不要改写或泛化。',
      },
      method: {
        type: 'string',
        enum: ['coins', 'lines'],
        description: 'coins = 由本工具一键起卦；lines = 使用调用方给出的六个爻值装卦。',
      },
      lines: {
        type: 'array',
        items: { type: 'integer' },
        description: 'method="lines" 时必填：自初爻至上爻的 6 个爻值，取 6 老阴 / 7 少阳 / 8 少阴 / 9 老阳。',
      },
      at: {
        type: 'string',
        description: '起卦时刻。省略则取当前时刻。带时区偏移的 ISO 8601（如 2024-06-15T12:00:00+08:00），或 "YYYY-MM-DD HH:mm:ss"（按 timezone 解释）。',
      },
      timezone: {
        type: 'string',
        description: `IANA 时区，默认 ${DEFAULT_TIME_ZONE}。用于取年月日时四柱与节气月建。`,
      },
      save: {
        type: 'boolean',
        description: '是否存入卦例库（默认 true）。用户只想随口看看时可传 false。',
      },
      note: {
        type: 'string',
        description: '可选备注，随卦例一起保存，便于日后回看。',
      },
    },
    required: ['question', 'method'],
  },
  output: {
    schema: { type: 'object', additionalProperties: true },
    render: (_args, value) => [
      { type: 'text', text: value.markdown },
      { type: 'text', text: JSON.stringify({ __liuyao: ENVELOPE_CHART, archiveId: value.archiveId, chart: value.chart }) },
    ],
  },
  async execute(args) {
    const question = requireText(args?.question, 'question');
    const method = requireEnum(args?.method, 'method', ['coins', 'lines']);
    const timeZone = optionalText(args?.timezone) ?? DEFAULT_TIME_ZONE;
    const instant = args?.at === undefined || args.at === null || args.at === ''
      ? now()
      : parseInstant(String(args.at), timeZone);

    let values;
    let tosses = null;
    if (method === 'coins') {
      const cast = castByCoins();
      values = cast.values;
      tosses = cast.tosses;
    } else {
      values = normalizeLineValues(args?.lines);
    }

    const chart = buildChart({ values, instant, timeZone, question, method, tosses });
    const markdown = formatChartText(chart);

    let archiveId = null;
    if (args?.save !== false) {
      const saved = await archive.saveAsync({
        question,
        chart,
        note: optionalText(args?.note) ?? null,
        now: now(),
      });
      archiveId = saved.id;
    }

    return { ok: true, archiveId, markdown, chart };
  },
  presentCall: (args) => ({
    card: 'generic',
    title: '六爻起卦',
    kind: 'other',
    rawInput: args?.question,
  }),
});

/**
 * `liuyao_cases`：卦例库读写。
 */
const buildCasesTool = ({ archive }) => ({
  name: TOOL_CASES,
  description: [
    '六爻卦例库（本机保存的历史卦盘）。用于回看之前起过的卦、按所问之事查找旧卦、删除或清空卦例。',
    'action="list" 列出最近的卦例（默认 20 条）；"get" 取一条完整卦盘（需传 id）；',
    '"delete" 删除一条（需传 id）；"clear" 清空全部。',
    '需要详细解卦时先 list 找到目标 id，再 get 拿到完整卦盘后按断卦规程解读。',
  ].join('\n'),
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['list', 'get', 'delete', 'clear'],
        description: '要执行的操作。',
      },
      id: {
        type: 'string',
        description: 'action="get" / "delete" 时的卦例 id。',
      },
      limit: {
        type: 'integer',
        description: 'action="list" 时最多返回条数，默认 20。',
      },
    },
    required: ['action'],
  },
  output: {
    schema: { type: 'object', additionalProperties: true },
    render: (_args, value) => [
      { type: 'text', text: value.markdown },
      { type: 'text', text: JSON.stringify({ __liuyao: ENVELOPE_CASES, ...value.envelope }) },
    ],
  },
  async execute(args) {
    const action = requireEnum(args?.action, 'action', ['list', 'get', 'delete', 'clear']);
    const limit = optionalInteger(args?.limit, 'limit') ?? 20;
    const id = optionalText(args?.id);

    if (action === 'list') {
      const cases = archive.list({ limit }).map(condenseCase);
      return {
        ok: true,
        markdown: renderCaseList(cases, archive.count()),
        envelope: { action, cases, total: archive.count(), path: archive.path },
      };
    }

    if (action === 'get') {
      const wanted = requireText(id, 'action="get" 时的 id');
      const found = archive.get(wanted);
      if (found === undefined) {
        return {
          ok: false,
          markdown: `找不到卦例 ${wanted}。请先用 action="list" 查看可用 id。`,
          envelope: { action, found: false, id: wanted },
        };
      }
      return {
        ok: true,
        markdown: `以下为该卦例保存的完整卦盘（${found.question}）：\n\n${formatChartText(found.chart)}`,
        envelope: { action, found: true, case: found },
      };
    }

    if (action === 'delete') {
      const wanted = requireText(id, 'action="delete" 时的 id');
      const removed = await archive.removeAsync(wanted);
      return {
        ok: removed,
        markdown: removed ? `已删除卦例 ${wanted}。` : `找不到卦例 ${wanted}，未删除任何记录。`,
        envelope: { action, removed, id: wanted, total: archive.count() },
      };
    }

    const cleared = await archive.clearAsync();
    return {
      ok: true,
      markdown: `已清空卦例库，共删除 ${cleared} 条。`,
      envelope: { action, cleared, total: 0 },
    };
  },
  presentCall: (args) => ({
    card: 'generic',
    title: '六爻卦例库',
    kind: 'other',
    rawInput: args?.action,
  }),
});

/** 列表项瘦身：不把完整卦盘塞进列表，避免 list 结果过大。 */
const condenseCase = (entry) => ({
  id: entry.id,
  createdAt: entry.createdAt,
  question: entry.question,
  hexagram: entry.hexagram,
  changed: entry.changed,
  palace: entry.palace,
  monthBranch: entry.monthBranch,
  dayPillar: entry.dayPillar,
  movingPositions: entry.movingPositions,
  note: entry.note,
});

/** 卦例列表的 Markdown。 */
const renderCaseList = (cases, total) => {
  if (cases.length === 0) return `卦例库为空（共 ${total} 条）。先用 ${TOOL_CAST} 起一卦即可入库。`;
  const lines = [`卦例库共 ${total} 条，以下为最近 ${cases.length} 条：`, ''];
  for (const entry of cases) {
    const when = formatTimestamp(entry.createdAt);
    const changed = entry.changed === null || entry.changed === undefined ? '' : ` → ${entry.changed}`;
    const moving = Array.isArray(entry.movingPositions) && entry.movingPositions.length > 0
      ? ` 动爻 ${entry.movingPositions.join('、')}`
      : ' 六爻安静';
    lines.push(`- ${entry.id} | ${when} | ${entry.hexagram}${changed} | ${entry.palace}宫 | ${entry.monthBranch}月 ${entry.dayPillar}日 |${moving}`);
    lines.push(`  所问：${entry.question}${entry.note ? `（备注：${entry.note}）` : ''}`);
  }
  lines.push('', `如需完整卦盘，用 action="get" 传对应 id。`);
  return lines.join('\n');
};

/** 时间戳 → `YYYY-MM-DD HH:mm`（按默认时区显示）。 */
const formatTimestamp = (value) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '未知时间';
  const civil = civilTimeOf(value, DEFAULT_TIME_ZONE);
  const pad = (input) => String(input).padStart(2, '0');
  return `${civil.year}-${pad(civil.month)}-${pad(civil.day)} ${pad(civil.hour)}:${pad(civil.minute)}`;
};

/**
 * 把一个「不带时区偏移」的本地时间按指定 IANA 时区解释为绝对瞬时。
 * 做法：先按 UTC 猜测，再用该猜测时刻在目标时区的民用时间反算偏移，迭代两次即可收敛
 * （时区偏移在两天内基本不变，夏令时切换点上也能得到合理结果）。
 *
 * @param text `YYYY-MM-DD HH:mm[:ss]` / `YYYY-MM-DDTHH:mm[:ss]`。
 * @param timeZone IANA 时区。
 * @returns UTC 毫秒。
 */
export const zonedTimeToInstant = (text, timeZone) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(text.trim());
  if (match === null) throw new Error(`时间格式无法识别：${JSON.stringify(text)}（应为 YYYY-MM-DD HH:mm[:ss] 或带偏移的 ISO 8601）`);
  const [, year, month, day, hour, minute, second] = match;
  const target = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second ?? 0));
  let guess = target;
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const civil = civilTimeOf(guess, timeZone);
    const asUtc = Date.UTC(civil.year, civil.month - 1, civil.day, civil.hour, civil.minute, civil.second);
    const offset = asUtc - guess;
    const corrected = target - offset;
    if (corrected === guess) break;
    guess = corrected;
  }
  return guess;
};

/**
 * 解析 `at` 参数：带偏移的 ISO 8601 直接解析，否则按 `timeZone` 解释。
 * @param text 时间文本。
 * @param timeZone IANA 时区。
 * @returns UTC 毫秒。
 */
export const parseInstant = (text, timeZone) => {
  const trimmed = text.trim();
  const hasOffset = /(?:Z|[+-]\d{2}:?\d{2})$/.test(trimmed);
  if (hasOffset) {
    const parsed = Date.parse(trimmed);
    if (Number.isNaN(parsed)) throw new Error(`时间无法解析：${JSON.stringify(text)}`);
    return parsed;
  }
  return zonedTimeToInstant(trimmed, timeZone);
};

/** 必填文本参数校验。 */
const requireText = (value, label) => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} 必须是非空字符串，收到 ${JSON.stringify(value)}`);
  }
  return value.trim();
};

/** 可选文本参数校验。 */
const optionalText = (value) => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new Error(`可选文本参数必须是字符串，收到 ${JSON.stringify(value)}`);
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
};

/** 必填枚举参数校验。 */
const requireEnum = (value, label, allowed) => {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new Error(`${label} 必须是 ${allowed.map((item) => JSON.stringify(item)).join(' / ')} 之一，收到 ${JSON.stringify(value)}`);
  }
  return value;
};

/** 可选整数参数校验。 */
const optionalInteger = (value, label) => {
  if (value === undefined || value === null) return undefined;
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(numeric)) throw new Error(`${label} 必须是整数，收到 ${JSON.stringify(value)}`);
  return numeric;
};
