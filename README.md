# 六爻起卦 · AI 解卦

给 DeepSeek Harness 装的一个小插件：**写下你要问的事，点一下「一键起卦」**，
AI 会按传统六爻（纳甲筮法）的规矩把卦盘装出来并解读给你听。

卦象会画成一张标准的六爻盘（六神、六亲、世应、动爻、变卦一应俱全），
起过的卦会自动存进「卦例库」，以后想回看随时能翻。

> **English** — A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
> plugin for traditional Chinese six-line divination (*liuyao*, najia method). Write the
> question you actually want to ask, click **Cast** once, and the model reads the hexagram
> for that specific question. The chart is drawn as a standard six-line card in the
> conversation, and every cast is kept in a local case archive.
>
> **Install** — add `dsh-liuyao` (or `github:lctfwyt/dsh-liuyao`) in the Plugins page, or
> `dsh plugin --profile desktop add dsh-liuyao` from a shell (use `--profile web` if you
> run `dsh web`). Then restart DeepSeek Harness — the desktop app has no page refresh.
> The cast panel sits above the message box, collapsed to one line by default.
>
> **Note** — the plugin's own panel labels are Chinese-only for now; the model answers in
> whatever language you ask in, so asking in English works fine.
>
> Traditional culture reference only — not advice of any kind.

---

## 它能帮你做什么

| 你想做的事 | 它怎么帮你 |
| --- | --- |
| 问一件事的吉凶趋势 | 写下问题 → 点「一键起卦」→ 点「请教解卦」，AI 按六爻规矩逐步解读并给建议 |
| 看看卦盘长什么样 | 卦盘会画成一张标准六爻盘卡片，排在对话里 |
| 回看以前起过的卦 | 面板里的「卦例」页保存了历史卦盘，点开就能看，也能删 |
| 手上有现成的卦 | 把六个爻值告诉 AI（6/7/8/9），它会直接装卦，不用重新起 |

**关于起卦方式**：点一下即完成，不需要你分六次操作。底层取爻用的是传统
**三枚铜钱法**（三钱法）：三枚一组定一爻，六组定六爻——
三背为「重」（老阳）、三字为「交」（老阴）、一背二字为少阳、二背一字为少阴。
随机数用的是系统加密随机源，不是伪随机玩具。

---

## 安装

> 前提：你已经装好了 DeepSeek Harness。

装完需要**重启对应的客户端**，输入框上方才会出现「六爻起卦」面板。

### 方式一：从 npm 安装（推荐）

在 DeepSeek Harness 的**侧栏找到「插件」→ 添加插件**，输入包名：

```
dsh-liuyao
```

### 方式二：从 GitHub 安装

同样是**「插件」→ 添加插件**，输入：

```
github:lctfwyt/dsh-liuyao
```

想装某个具体版本就带上 tag，例如 `github:lctfwyt/dsh-liuyao#v0.2.0`。

### 方式三：命令行

```bash
# 桌面版
dsh plugin --profile desktop add dsh-liuyao

# dsh web 起的网页版
dsh plugin --profile web add dsh-liuyao
```

从 GitHub 安装同理，把 `dsh-liuyao` 换成 `github:lctfwyt/dsh-liuyao` 即可。

> **`--profile` 要和你用的客户端对上**：桌面版是 `desktop`，`dsh web` 起的网页版是 `web`。
> 写错了不会报错，但那个客户端永远不会加载这个插件——这是最容易踩的坑。

### 装完看不到面板？

- **桌面版**：桌面端没有刷新页面这回事，**重启 DeepSeek Harness**（完全退出再启动）。
- **网页版**：先按 **F5 刷新页面**；还是看不到，再重启 `dsh web`。

面板本身也不占地方：它默认**收起**成输入框上方的一行 `▸ 六爻起卦`，
别只在聊天区找。

---

## 怎么用

### 方式一：用界面起卦（推荐）

1. 点输入框上方那条 **`▸ 六爻起卦`** 把它展开。
2. 在输入框里写下**你要问的具体事情**，例如：
   - 「今年下半年换工作能否成功」
   - 「这笔货款春节前能不能收回」
   - 「房子这个月签得成吗」
3. 点 **「一键起卦」**。六爻会一条条落下来，显出**本卦**和**变卦**。
4. 点 **「请教解卦」**。问题连同卦象一起送进对话，AI 开始解读。

读完之后想再起一卦，点「重新起卦」即可。

> 面板默认是**收起**状态，占一行，不挡着聊天。展开状态会被记住，下次还是展开的。
>
> 起卦与解卦会消耗一次 AI 对话（因为要让 AI 解读），不是本地离线计算。

### 方式二：直接在对话里问

不想用界面也行，直接在对话里说：

> 帮我起一卦，问今年财运如何

AI 会自己完成起卦和解读，并把卦盘画出来。

如果你手上已经有爻值，直接报给它：

> 我摇出来的是 9 7 8 9 8 7（初爻到上爻），问明年适不适合换城市，帮我装卦解读

### 回看卦例

把面板展开，切到 **「卦例」** 页：历次卦盘按时间倒序列出，
点任意一条看完整卦盘，右上角可以删除。

---

## 怎么问更准（实用建议）

传统六爻讲究「一事一断」，这几点很影响解读质量：

- **一次只问一件事。** 别把「事业、婚姻、健康」塞进同一个问题里。
- **问题要具体、有时间或对象。** 「今年财运如何」比「我命怎么样」好得多。
- **心里先想清楚再点。** 传统说法是「心诚则灵」，实际效果是问题越明确，
  AI 越能准确取用神（找出代表这件事的那一爻）。
- **同一件事不要反复起卦。** 起一次、认真看一次，比连起十次有用。

---

## 卦盘怎么看（简版）

不懂六爻也能读个大概，卡片里最容易看懂的几项：

| 位置 | 含义 |
| --- | --- |
| **本卦 / 变卦** | 事情现在的样子 → 往哪边走。显示「六爻安静」表示没有动爻，事情较稳 |
| **世 / 应** | 「世」是你自己，「应」是对方或外部环境 |
| **六亲** | 父母（长辈/文书/房子）、兄弟（朋友/竞争/分财）、子孙（子女/平安/解忧）、妻财（钱）、官鬼（职位/压力/病） |
| **动爻**（标了「动」并带 ○ 或 ×） | 事情变化的关键点，解读重点看它 |
| **月建 / 日辰** | 起卦当时的「大环境和当下助力」，决定各爻强弱 |
| **旬空** | 标「空」的爻当下不管用，要等出空或填实 |
| **伏神** | 卦里没出现、藏在别爻下面的信息（缺六亲时才有） |

专业判词（旺相休囚、回头生克、进神退神、应期等）交给 AI 解释，它会逐条引用卦盘里的字段。

---

## 常见问题

**装好了但看不到面板？**
先找一下 `▸ 六爻起卦` 那一行——它在输入框上方、默认收起，别只在聊天区找。
还是没有，就按 [「装完看不到面板？」](#装完看不到面板) 里的排查走一遍：
桌面版重启应用，网页版先 F5 再考虑重启服务；另外确认 `--profile` 用的是你正在用的那个客户端。

**点了「一键起卦」没反应？**
检查有没有先写下问题——问题为空时不会起卦，面板里会提示「请先写下所问之事」。

**颜色、按钮看起来不对？**
本插件跟随 DeepSeek Harness 的主题配色（浅色/深色都会自动适配）。
如果某个按钮看不清，请反馈具体的按钮名字。

**起卦结果每次都不一样？**
正常。起卦本就是随机的，同一件事反复起卦没有意义。

**卦例存在哪里？会被上传吗？**
只存在你自己电脑的 DeepSeek Harness 数据目录下（`liuyao/cases.json`），
不会被上传到任何地方。删除对应条目即从本地移除。

**能离线用吗？**
起卦本身是本地完成的；但**解卦要调用 AI**，所以需要正常的模型连接。

---

## 卸载

在 DeepSeek Harness 的**插件**页面里找到本插件，移除即可，然后重启。

```bash
dsh plugin --profile desktop remove dsh-liuyao
```

卸载**不会删除你的卦例**——它们存在数据目录的 `liuyao/cases.json`，需要的话可以手动备份。

---

## 参与开发

源码、问题反馈与更新日志：<https://github.com/lctfwyt/dsh-liuyao>

实现细节、六爻算法口径与开发方式见 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)。

---

## 免责声明

以上解读基于传统六爻（纳甲筮法）文化体例，**仅为传统文化参考**，
不构成决策、法律、投资或医疗建议；涉及健康、诉讼、重大财务事项请以专业意见为准。
