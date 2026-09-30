/**
 * 离线加载并校验客户端 bundle（`lib/client.js`）。
 *
 * 为什么需要它：DSH 不做运行时打包，`lib/client.js` 是**预编译产物**，
 * 一旦语法或包装出错，只会在浏览器里以"插件激活失败"的形式暴露——而这一步
 * 正好落在重启 DSH 之后，代价很高。本脚本用 `node:vm` 在一个模拟的
 * `window.__ModuleLoader__` 环境里把它真加载一遍，把风险前移到安装之前。
 *
 * 它同时是 `test/client.test.js` 的加载器：`loadClient()` 会返回 bundle 导出的
 * `__internals`，供单测校验客户端常量表与引擎表逐项一致。
 *
 * 用法：`node tools/check-client.mjs`（成功 exit 0，失败打印原因并 exit 1）。
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

/** 包根目录。 */
export const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** bundle 期望的插件 id（必须等于包名，否则 boot 图里找不到）。 */
export const EXPECTED_ID = 'dsh-liuyao';

/** 客户端 bundle 允许 require 的 DSH seed 模块（前端 `function rM()` 的完整列表）。 */
export const SEED_SPECIFIERS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
];

/** 极简 React 替身：够跑通组件定义与 `apply`，不渲染。 */
export const createReactStub = () => ({
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
  Fragment: Symbol.for('react.fragment'),
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useRef: () => ({ current: undefined }),
  useEffect: () => {},
  useCallback: (fn) => fn,
  useMemo: (fn) => fn(),
});

/** 记录一次 `apply` 期间对各注册表的调用，供单测断言。 */
export const createStubContext = () => {
  const calls = {
    locale: [],
    slotsInject: [],
    slotsRegister: [],
    effects: [],
  };
  const ctx = {
    effect: (callback, label) => {
      calls.effects.push({ label });
      const dispose = callback();
      return typeof dispose === 'function' ? dispose : () => {};
    },
    locale: {
      register: (namespace, dictionaries) => {
        calls.locale.push({ namespace, dictionaries });
        return () => {};
      },
    },
    slots: {
      inject: (key, callback) => {
        calls.slotsInject.push({ key });
        return callback();
      },
      register: (descriptor, component) => {
        calls.slotsRegister.push({ descriptor, component });
        return () => {};
      },
    },
    sessions: {
      binding: () => undefined,
    },
    get: (name) => (name === 'sessions' ? { binding: () => undefined } : undefined),
  };
  return { ctx, calls };
};

/**
 * 在模拟环境中加载 `lib/client.js`。
 *
 * @returns `{ id, exports, calls, styleInjected }`。
 *   - `id`：bundle 声明的插件 id。
 *   - `exports`：factory 的返回值（`apply` / `inject` / `__internals`）。
 *   - `calls`：stub ctx 上记录到的注册调用。
 * @throws 语法错误、包装格式错误、id 不符、apply 抛错等。
 */
export const loadClient = ({ source, cryptoStub } = {}) => {
  const code = source ?? readFileSync(join(PACKAGE_ROOT, 'lib', 'client.js'), 'utf8');

  const registrations = [];
  const styleTags = [];
  const documentStub = {
    head: { appendChild: (element) => styleTags.push(element) },
    createElement: () => ({ setAttribute: () => {}, textContent: '' }),
    querySelector: () => null,
  };
  const windowStub = {
    __ModuleLoader__: {
      load: (registration) => registrations.push(registration),
    },
  };

  const sandbox = {
    window: windowStub,
    document: documentStub,
    console,
    setTimeout,
    clearTimeout,
    fetch: () => Promise.reject(new Error('offline')),
    Uint8Array,
    JSON,
    Math,
    Date,
    Object,
    Array,
    String,
    Number,
    Boolean,
    Symbol,
    Error,
    Promise,
    crypto: cryptoStub ?? {
      getRandomValues: (array) => {
        for (let index = 0; index < array.length; index += 1) array[index] = Math.floor(Math.random() * 256);
        return array;
      },
    },
  };
  sandbox.self = sandbox;

  const context = vm.createContext(sandbox);
  // 同步执行：bundle 顶层只做 `__ModuleLoader__.load(...)` 注册，不做别的事。
  new vm.Script(code, { filename: 'lib/client.js' }).runInContext(context);

  if (registrations.length !== 1) {
    throw new Error(`bundle 顶层应当只调用一次 __ModuleLoader__.load，实际 ${registrations.length} 次`);
  }
  const registration = registrations[0];
  if (registration.id !== EXPECTED_ID) {
    throw new Error(`bundle id 必须是 ${EXPECTED_ID}，实际 ${String(registration.id)}`);
  }
  if (typeof registration.factory !== 'function') {
    throw new Error('bundle 的 factory 必须是函数');
  }

  const required = new Set();
  const react = createReactStub();
  const requireStub = (specifier) => {
    required.add(specifier);
    if (specifier === 'react') return react;
    if (specifier === 'react/jsx-runtime') return { jsx: react.createElement, jsxs: react.createElement };
    throw new Error(`客户端 bundle require("${specifier}") 不在允许的 seed 列表内`);
  };
  requireStub.async = async (specifier) => requireStub(specifier);

  const exports = registration.factory(requireStub);

  const { ctx, calls } = createStubContext();
  if (typeof exports.apply !== 'function') throw new Error('bundle 必须导出 apply()');
  exports.apply(ctx);

  if (required.size === 0) throw new Error('factory 没有 require 任何模块（疑似使用了 import，客户端 bundle 不允许）');

  return {
    id: registration.id,
    exports,
    calls,
    required: [...required],
    styleInjected: styleTags.length,
  };
};

/** CLI 入口。 */
const main = () => {
  const problems = [];
  let result;
  try {
    result = loadClient();
  } catch (error) {
    console.error(`✗ 加载 lib/client.js 失败：${String(error?.message ?? error)}`);
    process.exit(1);
  }

  const { exports, calls, required } = result;
  if (typeof exports.inject !== 'undefined' && !Array.isArray(exports.inject)) {
    problems.push('导出的 inject 必须是字符串数组');
  }
  const slotKeys = calls.slotsRegister.map((entry) => entry.descriptor?.name);
  if (!slotKeys.includes('conversation.input.dock')) problems.push('未注册 conversation.input.dock');
  if (!slotKeys.includes('tool.call.toolview')) problems.push('未注册 tool.call.toolview');
  const locales = calls.locale.map((entry) => entry.namespace);
  if (!locales.includes('liuyao')) problems.push('未注册 liuyao 命名空间的文案');

  const internals = exports.__internals;
  if (internals === undefined) {
    problems.push('未导出 __internals（单测需要它做表一致性断言）');
  } else {
    const names = Object.values(internals.HEX_NAMES).flatMap((row) => Object.values(row));
    if (names.length !== 64) problems.push(`HEX_NAMES 应有 64 项，实际 ${names.length}`);
    if (new Set(names).size !== 64) problems.push('HEX_NAMES 存在重名');
    const sample = internals.hexagramOf([7, 9, 7, 7, 7, 7]);
    if (sample.name !== '乾为天') problems.push(`hexagramOf 抽样结果异常：${sample.name}（应为乾为天）`);
    // 二爻动 → 下卦由乾变离 → 天火同人；五爻动 → 上卦由乾变离 → 火天大有。
    const changedTwo = internals.hexagramOf(internals.changedValuesOf([7, 9, 7, 7, 7, 7]));
    if (changedTwo.name !== '天火同人') problems.push(`变卦抽样异常：${changedTwo.name}（应为天火同人）`);
    const changedFive = internals.hexagramOf(internals.changedValuesOf([7, 7, 7, 7, 9, 7]));
    if (changedFive.name !== '火天大有') problems.push(`变卦抽样异常：${changedFive.name}（应为火天大有）`);
  }

  console.log('客户端 bundle 自检：');
  console.log(`  id            = ${result.id}`);
  console.log(`  require       = ${required.join(', ')}`);
  console.log(`  inject        = ${JSON.stringify(exports.inject)}`);
  console.log(`  slots.inject  = ${calls.slotsInject.map((entry) => entry.key).join(', ') || '(none)'}`);
  console.log(`  slots.register= ${slotKeys.join(', ')}`);
  console.log(`  locale        = ${locales.join(', ')}`);
  console.log(`  style 注入     = ${result.styleInjected} 个 <style>`);
  for (const specifier of required) {
    if (!SEED_SPECIFIERS.includes(specifier)) {
      problems.push(`require("${specifier}") 不是 seed，必须写进 dsh.client.external 才能用`);
    }
  }
  if (problems.length > 0) {
    console.error('\n✗ 发现问题：');
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }
  console.log('\n✓ 客户端 bundle 结构自检通过');
};

if (process.argv[1] !== undefined && process.argv[1].endsWith('check-client.mjs')) {
  main();
}
