# 开发文档 · dsh-liuyao

面向要改这个插件的人。用户安装与使用说明见 [../README.md](../README.md)。

---

## 1. 架构总览

一个包同时交付 DSH 的**两个半边**：Host（Node 侧）与 Client（浏览器侧）。
两半边由同一行 patch 挂载——包名解析到 Host 的 `main`，浏览器半边则由
`package.json` 的 `dsh.client` 声明自动发现。

```
package.json          name / dsh.bundle.patch / dsh.client / exports / files
cordis.patch.yml      insert 一行 { id: liuyao, name: dsh-liuyao }
locale/
  zh.json             插件页显示的「名字 + 介绍」（中文）
  en.json             同上（英文；它也是 DSH 读取语言文件的锚点，不能少）
lib/
  index.js            Host 插件：注册工具、技能、卦例只读路由
  tools.js            两个工具的定义与执行（手写 JSON Schema）
  archive.js          卦例库（原子写 + 写链串行化 + 损坏自愈 + 上限淘汰）
  doctrine.js         解卦体例：完整版读 doctrine.md，精简版内嵌工具描述
  doctrine.md         完整《六爻断卦体例》（模型按需经技能加载）
  client.js           浏览器半边（手写惰性 CJS bundle，无打包器）
  engine/
    tables.js         八卦 / 六十四卦名 / 纳甲 / 六神 / 地支五行 / 冲合刑 / 旬空
    hexagram.js       爻值 ↔ 阴阳爻 ↔ 上下卦 ↔ 卦名 ↔ 变卦
    palace.js         京房八宫卦序（算法生成）+ 世应 + 宫五行
    najia.js          纳甲、六亲、六神、旬空、月破、旺衰、伏神
    calendar.js       儒略日 / 日干支 / 节气 / 月建 / 四柱
    cast.js           三钱法取爻（随机源可注入）
    chart.js          装卦组装（含变爻、格局）
    format.js         卦盘 → 模型可读 Markdown
test/                 92 个单测
  dsw-theme-tokens.json   DSH 主题 token 快照（供样式契约测试）
tools/
  check-client.mjs          离线加载并校验客户端 bundle
  run-tests.mjs             同进程跑全部测试（绕开沙箱禁止 spawn 管道）
  snapshot-theme-tokens.mjs 重新枚举主题 token 刷新快照
```

---

## 2. Host 半边

### 2.1 零 DSH import（重要约束）

`lib/index.js`、`lib/tools.js`、`lib/archive.js`、`lib/doctrine.js` 与 `lib/engine/*`
**只 import `node:*` 内建模块**，不 import 任何 `@deepseek-ai/*` 包。

原因：`@deepseek-ai/*` 只在 DSH 进程内可解析（启动器装了进程内解析表）。
第三方插件一旦 import 它们，就多了一个"解析不到就整个插件不 apply"的失败面。
而 `defineTool` 实际只做两件事——把参数 DSL 编译成 JSON Schema、包一层参数校验——
它返回的就是普通对象。所以 `lib/tools.js` 直接手写标准 JSON Schema。

代价与对策：自己保证 schema 落在 DSH 支持的子集内
（`type/oneOf/properties/required/additionalProperties/items/enum/const` + 注解）。
`test/tools.test.js` 里的 `assertSupportedSubset()` 逐条复刻了 DSH 的
`checkSchemaNode` / `checkObjectSchemaTail` 规则，schema 写歪了测试直接红。

同理，**不 import `@deepseek-ai/dsh-storage-domain` 与 `zod`**：卦例库改用
`$DSH_HOME/liuyao/cases.json`（`lib/archive.js`），把原子写、写链串行化、
损坏备份自愈、上限淘汰都自己做掉。

### 2.2 插件契约

```js
export const name = 'liuyao';
export const inject = ['tools', 'skills'];   // 必需服务
export function apply(ctx) { /* ... */ }
```

- **不导出 `Config`**：本插件没有配置项，导出空 Config 反而容易在 patch 的
  "整体替换 config" 语义下踩坑。
- **`webServer` 绝不进模块级 `inject`**：headless profile 没有该服务，
  写进 `inject` 会让整个插件永远不 apply。改用 `ctx.inject(['webServer'], scope => ...)`
  局部等待；服务缺席时工具照常工作，只有卦例面板降级。
- 工具注册用 `ctx.tools.register(definition)`，技能用
  `ctx.skills.register({ name, description, content, source })`；
  两者内部都以 `layers.effect(this.ctx, ...)` 绑定本 fiber，卸载自动撤销。

### 2.3 工具

| 工具 | 用途 |
| --- | --- |
| `liuyao_cast` | 起卦 + 装卦。`method='coins'` 由 Host 一键起卦；`method='lines'` 用调用方给的六个爻值装卦 |
| `liuyao_cases` | 卦例库 `list` / `get` / `delete` / `clear` |

`output.render` 返回**两个** content part：

1. 卦盘 Markdown —— 给模型读的正文；
2. `JSON.stringify({ __liuyao: 'chart', ... })` —— 给卡片用的结构化信封。

前端卡片靠第二段渲染六爻盘。这是刻意设计的稳定契约：Host 的
`presentCall` / `presentResult` **不会**传到浏览器（DSH 的 Web 客户端不消费它们），
自定义卡片必须由客户端 `tool.call.toolview` 按工具名注册。

### 2.4 插件展示元数据（插件页显示的「名字 + 介绍」）

**改这里，不要只改 `package.json` 的 `description`。** 插件页读的是
`dsh-app-boot` 的 `readPluginMeta()`，顺序是：

1. 解析 `<包名>/locale/en.json` —— **它是锚点**，解析不到就完全不看任何语言文件；
2. 以该文件所在目录为准，枚举同目录所有 `*.json`；
3. 每个文件读 `meta.title` / `meta.description`（必须是非空字符串）；
4. `package.json` 的 `name` / `description` 只作 `en` 兜底。

```json
{ "meta": { "title": "六爻起卦 · AI 解卦", "description": "……" } }
```

两个**静默失败**的坑（都有测试守着，见 `test/plugin-meta.test.js`）：

- `package.json` 的 `exports` 必须声明 `"./locale/*.json"`。缺了它，
  解析 `<包名>/locale/en.json` 会抛 `ERR_PACKAGE_PATH_NOT_EXPORTED`，
  被 `optionalResourcePath` 吞掉，插件页**悄悄退回** `package.json` 的 `description`。
- 展示文案必须写在 `meta` 里。写在文件顶层读不到，同样静默无效。

语言文件名必须是合法语言 id（小写、不可重复）。`readPluginMeta` 是**每次调用都重读文件、
没有缓存**的自由函数，所以改完只要**刷新插件页**即可，不需要重启 DSH。

另：`readPluginMeta` 还支持 manifest 的 `icon` 字段（SVG/PNG/JPEG/WebP，≤256 KiB，
相对 manifest 目录）——本插件暂未提供图标。

### 2.5 卦例路由

`ctx.webServer.register({ kind: 'prefix', path: '/dsh-liuyao', handler })`，
handler 是标准 `(req, res)`：

```
GET    /dsh-liuyao/status          插件与卦例库状态
GET    /dsh-liuyao/cases?limit=50  卦例列表（不含完整卦盘）
GET    /dsh-liuyao/cases/<id>      单条卦例（含完整卦盘）
DELETE /dsh-liuyao/cases/<id>      删除一条
```

之所以走 HTTP 而不是自定义 Remote：`dsh-api-remotes` 的能力集是**构建期固定**的，
第三方插件无法在运行期新增 remote 命名空间（见其 README 的 Known Limitations）。

前端面板通过同源 `fetch` 读这些接口。

---

## 3. Client 半边

### 3.1 bundle 契约

DSH **不做运行时打包**。客户端半边必须是预编译产物：一个只做注册的惰性 CJS 包装。

```js
window.__ModuleLoader__.load({
  id: 'dsh-liuyao',              // 必须等于包名
  factory(require) {
    const React = require('react');
    // …… 组件 ……
    return { inject: ['slots', 'locale'], apply(ctx) { /* 注册 */ }, __internals: { /* 供单测 */ } };
  },
});
```

- `factory` 的**返回值**就是模块导出；`apply` 是 cordis 插件体。
- `require()` 只能解析 DSH 的 9 个 seed 模块（`react`、`react/jsx-runtime`、
  `react-dom`、`react-dom/client`、`@deepseek-ai/cordis`、`dsh-client-store`、
  `dsh-client-ui-slots`、`dsh-client-ui-primitives`、`dsh-client-ui-dockkit`），
  以及已在 boot 图中的插件包（需写进 `dsh.client.external`）。
- 所以本文件**不能 import 引擎**（`lib/engine/*` 是 ESM，浏览器半边拿不到）。
  客户端需要的常量表（六十四卦名、八卦三爻）在 `lib/client.js` 里各存一份，
  由 `test/client.test.js` **逐项断言**两边一致，表一漂就红。
- JSX 不可用，统一 `const h = React.createElement`。

### 3.2 注册的三个扩展点

| 扩展点 | 用途 |
| --- | --- |
| `conversation.input.dock`（list/session，`id: 'liuyao'`, `order: 30`） | 起卦面板：输入问题 → 一键起卦 → 请教解卦；内含「卦例」标签页 |
| `tool.call.toolview`（keyed/session，`key: 'liuyao_cast'`） | 卦盘卡片 |
| `ctx.locale.register('liuyao', { zh, en })` | 中英文案 |

面板的"请教解卦"经 slot 的 `inject(sessionId)` 拿到动词，
内部走 client Session 的 `prompt(content, 'queue')`；会话服务缺席时降级为
把文本写进 composer 草稿。**`sessions` 刻意不写进 `inject`**——写成静态依赖后
一旦该服务缺席，整个插件不 apply，面板会彻底不出现；改成运行时 `ctx.get('sessions')`
最坏只是"发送"降级。

### 3.3 样式纪律

- **只用 DSH 真实存在的 `--dsw-*` token**（快照见 `test/dsw-theme-tokens.json`）。
- **凡是设成实心填充的地方，必须配成对的前景色 token。**

第 2 条是踩过的坑：曾经把 `--dsw-alias-brand-primary`（一个前景/强调色 token）
当成按钮背景，文字用 `color: inherit`（= `label-primary`），于是浅色模式黑底黑字、
深色模式白底白字，按钮完全看不见。正确做法是用成对的按钮 token：

| 用途 | 填充 | 前景 |
| --- | --- | --- |
| 主按钮 | `--dsw-alias-button-primary-fill` | `--dsw-alias-label-primary-foreground` |
| 次级按钮 / 选中标签 | `--dsw-alias-interactive-bg-active` | `--dsw-alias-label-primary` |
| 卡片 / 面板 | `--dsw-alias-bg-layer-1` / `-layer-2` | `--dsw-alias-label-primary` |
| 描边 | `--dsw-alias-border-l1` / `-l2` / `-l3` | — |

次级按钮刻意与"选中标签"取同一填充 token；hover 不改底色，只把描边强化到 `l3`，
避免 hover 时又压深。`test/client-ui.test.js` 把这几条都锁成了断言。

样式用单个 `<style data-plugin="dsh-liuyao">` 注入（预打 `data-plugin` 便于
loader 在 HMR 卸载时清理）。按官方 practices，**不 import
`@deepseek-ai/dsh-client-ui-primitives`**。

---

## 4. 六爻引擎口径

引擎是纯函数，无 I/O、无时钟依赖（时刻由调用方传入），便于离线全测。

**取爻（三钱法）**：三枚一组定一爻，记 `b` = 背数，`爻值 = 6 + b`：
`0 背 → 6 老阴(动)`、`1 背 → 7 少阳`、`2 背 → 8 少阴`、`3 背 → 9 老阳(动)`；
奇数为阳、偶数为阴。随机源注入式，默认 `node:crypto.randomInt`（Host）或
`crypto.getRandomValues`（浏览器）。

**八宫卦序**：算法生成，不硬编码 64 行。从八纯卦出发，按
一世→二世→三世→四世→五世→游魂（五世再变第四爻）→归魂（游魂内卦三爻还原）。
8 宫 × 8 位恰好覆盖六十四卦，且世应恒相隔三位（环形距离为 3）。

**世应**：八纯 6/3、一世 1/4、二世 2/5、三世 3/6、四世 4/1、五世 5/2、游魂 4/1、归魂 3/6。

**纳甲**：京房纳甲，内卦管初/二/三爻、外卦管四/五/上爻。

**六亲**：以本卦宫五行为"我"——同我兄弟、我生子孙、我克妻财、克我官鬼、生我父母。

**伏神**：本卦缺某六亲时，取**本宫八纯卦**同爻位的纳甲为伏神，并给出对应飞神。

**六神**：甲乙起青龙、丙丁朱雀、戊勾陈、己螣蛇、庚辛白虎、壬癸玄武，自初爻向上排。

**旬空**：由日柱六十甲子序推（`floor(index/10)` 即旬序）。

**日柱**：`(JDN + 49) % 60`。锚点自检：1949-10-01 = 甲子日、2000-01-01 = 戊午日。

**月建**：按**节气**（立春寅、惊蛰卯……小寒丑），非农历月；年干支以立春换年。
节气用 Meeus《Astronomical Algorithms》第 25 章低精度太阳视黄经 + 二分求解，
**精度约 ±15 分钟**（实测 2023–2025 立春偏差 1–11 分钟）。起卦时刻距交节
30 分钟内时卦盘返回 `nearMonthBoundary: true`，如实标注临界，不假装精确。

**变爻六亲**一律以**本卦之宫**论（《增删卜易》通行口径）；给出
回头生/回头克/比和/化泄/化耗、进神/退神、化空/化破/化墓/化绝。

**格局**：六冲、六合由上下卦对应爻（初四、二五、三六）的**纳甲地支**判定——
这是纯算法推导，结果恰好复现传世的两组卦名（六冲十卦 = 八纯 + 天雷无妄 + 雷天大壮；
六合八卦 = 否/泰/困/节/旅/贲/豫/复），可作为纳甲表的交叉校验。
另给三合局（全卦与动爻分别标注）、游魂、归魂、月破、暗动、日破。

**口径选择**（流派有差异处）：月建按节气、日辰默认子正换日（可切 `ziShi`）、
旬空按日柱、应期只给区间、六神只加色彩不定吉凶。这些在 `lib/doctrine.md` 里对模型也是明示的。

---

## 5. 测试与自检

```bash
node tools/check-client.mjs   # 离线加载客户端 bundle，断言包装/id/导出/注册调用/表一致性
node tools/run-tests.mjs      # 92 个单测
```

> 为什么不用 `node --test`：`node --test` 会为每个测试文件 spawn 子进程，
> 而 DSH 的 Windows 沙箱禁止程序通过管道抓取子进程输出，会以 `spawn EPERM` 失败。
> `tools/run-tests.mjs` 把测试文件逐个 `import` 进同一进程，绕过该限制且保留
> `node:test` 的断言与退出码。

覆盖要点：

| 测试文件 | 守什么 |
| --- | --- |
| `test/engine.tables.test.js` | 64 卦名唯一、纳甲表齐备、六亲/旬空/冲合刑 |
| `test/engine.calendar.test.js` | 儒略日与万年历锚点、节气偏差 < 15 分钟、五虎遁/五鼠遁、子时换日 |
| `test/engine.chart.test.js` | 八宫覆盖与世应、乾宫卦序、全 64 卦伏神不变量、六冲/六合卦名集合、旺相休囚死 |
| `test/engine.cast.test.js` | 爻值 = 6 + 背数、大样本 1:3:3:1 分布、入参校验 |
| `test/tools.test.js` | 手写 JSON Schema 落在 DSH 支持子集内、起卦/装卦/入库、参数报错、时间解析 |
| `test/archive.test.js` | 原子写无 `.tmp` 残留、并发串行、上限淘汰、损坏自愈 |
| `test/host.test.js` | `apply` 在 stub ctx 下注册正确、`webServer` 不在模块级 inject、技能名合正则、路由真实 HTTP 行为 |
| `test/client.test.js` | bundle 契约、客户端常量表与引擎逐项一致、信封解析穿透、文案键集对齐 |
| `test/client-ui.test.js` | token 白名单、填充/前景配对、主按钮 token 组合、dock 宽度、收起契约、类名与样式对齐 |
| `test/plugin-meta.test.js` | 插件页展示元数据：`locale/en.json` 锚点、语言文件名合法性、`meta.title`/`meta.description` 非空、`exports` 声明 `./locale/*.json`、顶层字段不静默失效、旧文案不复活 |

DSH 升级后若主题 token 有增减，重新生成快照：

```bash
node tools/snapshot-theme-tokens.mjs "D:\path\to\DeepSeek Harness\resources\app.asar"
# 或设置 DSH_ASAR 环境变量；不传参时会尝试 %LOCALAPPDATA% 与 %PROGRAMFILES% 下的常见位置
```

---

## 6. 安装、发布与开发回路

### 6.1 安装（面向用户，三种等价方式）

装进**你实际使用的那个客户端的 profile**，否则它永远不加载这个插件。

```bash
# 桌面版
dsh plugin --profile desktop add dsh-liuyao                        # npm
dsh plugin --profile desktop add github:lctfwyt/dsh-liuyao         # GitHub 主干
dsh plugin --profile desktop add github:lctfwyt/dsh-liuyao#v0.1.0  # 指定 tag

# dsh web 起的网页版
dsh plugin --profile web add dsh-liuyao
```

也可以在**插件 → 添加插件**界面填 `dsh-liuyao` 或 `github:lctfwyt/dsh-liuyao`。

> **`--profile` 必须与客户端对应**：桌面版 → `desktop`，`dsh web` → `web`。
> 写错了命令会"成功"，但那个客户端永远不会加载它——这是最常踩的坑。

**让改动生效的方式按客户端不同**：

| 客户端 | 装完 / 改完之后 |
| --- | --- |
| 桌面版 | **重启 DeepSeek Harness**。桌面端没有刷新页面这一操作 |
| `dsh web` 网页版 | 先 **F5 刷新页面**；仍是旧的，再重启 `dsh web` 服务 |

### 6.2 发布

```bash
npm run check      # 客户端 bundle 自检 + 全部单测
npm publish        # prepublishOnly 会自动再跑一次 check
git push           # npm 与 GitHub 两条线各自独立发布
```

发布前的机械检查：

```bash
npm pack --dry-run
```

它应当只列出运行时需要的文件（`lib/`、`locale/*.json`、`cordis.patch.yml`）
加上 `README.md`、`LICENSE`、`docs/`——**不应**出现 `backup/`、`test/`、`tools/`。
若在受限沙箱里 `npm` 报缓存目录不可写，把缓存指到工作区内再跑：
`npm pack --dry-run --cache .npm-cache`（该目录已在 `.gitignore` 中）。

### 6.3 改动生效方式

| 改了什么 | 生效方式 |
| --- | --- |
| `lib/client.js`（界面、样式） | `dsh-client-hmr` 已挂载，经 SSE 自动热换 bundle。**不需要重启**；网页版换不过来就 F5，桌面版没有刷新操作、等 HMR 或重启 |
| `lib/index.js`、`lib/tools.js`、`lib/engine/*`、`lib/doctrine.*` | 需要**重启客户端**（`dsh-hmr` 的 `config.root` 默认空，不监听源码模块） |
| `package.json` | 需要**重启客户端** |
| `locale/*.json`（插件页展示文案） | 每次读文件、无缓存，**重新打开插件页即可**（网页版可 F5） |

「重启客户端」= 桌面版重启 DeepSeek Harness；网页版重启 `dsh web` 服务。

> 维护者提示（不在用户文档中展开）：从 npm/GitHub 装的是包的副本，改工作树不会影响已装的那份。
> 想改一次立刻见效，可以把工作树以 `link:` 形式接进 profile 的 `node_modules`；
> 这只是维护者自用的便利手段，**不是**面向用户的安装方式。

**排障入口**：启动失败时 `%USERPROFILE%\.dsh\logs\startup-*.log` 有完整诊断；
`dsh --profile desktop --dump-config` 可重新合成配置树并在退出码上反映错误。
注意这些命令会写 profile 目录，需要相应写权限。

---

## 7. 入库前的脱敏约定

仓库面向公开发布，**不得包含任何与本机环境绑定的信息**。

**禁止出现**：

- 绝对路径（`C:\...`、`D:\...`、`/Users/...`）与其中的用户名；
- 任何人的用户名、机器名、组织内部路径；
- profile 备份、诊断转储、日志等运行时产物。

**写法**：用占位符或环境变量替代——`<仓库绝对路径>`、`<DSH 安装目录>`、
`%LOCALAPPDATA%`、`%USERPROFILE%\.dsh`、`$env:DSH_HOME`。

**已忽略**（见 `.gitignore`）：`backup/`（profile 备份与配置转储）、
`test/.tmp/`、`node_modules/`、日志与编辑器产物。

**入库前自检**：

```powershell
# 在仓库根目录执行。先把 $me 换成你自己的用户名。
# 模式用拼接方式构造，这样本文件自身不会成为命中项。
$me = 'your-user-name'
$needles = @(
  [regex]::Escape($me),
  ('C:' + '\\Users'),
  ('D:' + '\\projects'),
  ('D:' + '/projects'),
  ('AppData' + '\\Local')
)
Get-ChildItem -Recurse -File |
  Where-Object { $_.FullName -notmatch '\\node_modules\\|\\.git\\|\\backup\\|\\test\\.tmp\\' } |
  Select-String -Pattern $needles |
  Select-Object Path, LineNumber, Line
```

有输出就要处理。本文档里的 `D:` + `\path\to\...`、`<DSH 安装目录>` 等是**占位示例**，
不匹配上面的拼接模式；若你把 `C:` / `D:` 这类宽泛单段模式也放进去，命中这些示例属正常。

---

## 8. 已知限制与后续可做

- **卦例库在起卦面板的标签页里，不在右侧栏。** 右侧栏的 `sidebar.right.pane.tab`
  需要配套的 `sidebarRightTabs` 资源地址注册表，其 descriptor 形状在 asar 里没有
  `.d.ts` 可离线确认；强上有可能让 slot entry 崩在用户浏览器里。面板是官方模板
  验证过的扩展点，功能对用户等价。真机验证后再考虑迁移。
- **`liuyao_cases` 用通用文本卡片**（不单独注册 toolview）。
- **节气精度 ±15 分钟**（见第 4 节），临界时用 `nearMonthBoundary` 标注。
- **未实现**：反吟、伏吟、飞神细节、卦身、命爻、神煞（贵人/驿马/桃花/纳音）、
  太岁冲、奇门六壬类信息。工具与体例都明确禁止编造这些盘外内容。
- **浏览器端观感**只能在真机目视确认（无头环境无法截图）。
- 一个包同时改 Host 与 Client 时，Client 改动可热换、Host 改动要重启——
  **一次改完再重启**能省事。
