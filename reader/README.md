# 交互讲义：模态逻辑六讲

在线版：<https://harbourzhang167-alt.github.io/modal-logic-reader/>  
源码仓库：<https://github.com/harbourzhang167-alt/modal-logic-reader>

把 `course/模态逻辑六讲讲义.docx` 转成一个可交互的网页：

- **正文按 H1 分章**：一次显示一个大标题章节，章节选择器切换；小标题仍可点击跳转；
- **左侧目录**：章 / 节 / 小节分级，可勾选显示层级，宽度可拖拽，滚动高亮；
- **正文全文搜索**：搜索所有章节的正文，结果显示章节/片段，点击跳转并高亮；
- **右侧解释栏**：宽度可拖拽；可在“停靠 / 浮窗”之间切换；浮窗可拖动、可缩放；“钉住”后点外部不关闭；
- **正文独立页**：`reader/content.html` 按大标题分节，带每章小目录、跳章下拉和打印样式；
- **第二讲精读**：`reader/deep-dive.html`，五步引导、可改模型、空框架反例、三道即时反馈测验；
- **Kripke 实验室**：`reader/lab/`，拖动世界、加边、切换赋值、求值、查框架、找反模型；
- 选中正文中的词/句，弹出“解释”按钮；
- 解释模式三选一：
  - **本地 RAG**：离线，BM25 检索 + 抽取式回答，不需要 API；
  - **内置 API**：在网页设置里填服务商、模型和 Key，浏览器直接调用 OpenAI 兼容接口，**不需要运行 Python**；
  - **代理**：通过本地或远程代理调用，Key 在服务端（适合线上部署/团队使用）。

![设置：内置 API](screenshot-settings.png)

## 快速开始

### 只读 + 本地 RAG

直接双击 `reader/index.html`。它是纯静态页面，不需要服务器、不需要联网。

如果浏览器对 `file://` 有额外限制，也可以：

```powershell
python reader/serve.py --port 8010
```

然后打开 <http://127.0.0.1:8010/>。

### 正文独立页

点击右上角“正文独立页”，或直接打开 `reader/content.html`：

- 全部 9 章按 H1 分节；
- 每章开头有本章小目录；
- 顶部“跳章”下拉、打印按钮、返回阅读器；
- H2/H3 仍然可以点击跳到小节。

### 第二讲精读

打开 `reader/deep-dive.html`，或侧栏底部“第二讲精读”：

- 五步引导：自然语言问题 → 最小模型 → 逐项求值 → 改变模型 → 回到定义；
- 空可及关系反例分三步展示：p 假 → □p 空真 → □p→p 假；
- 三道即时反馈测验，错误选项会指出具体误解；
- 可跳转到 Kripke 实验室亲手改模型。

### Kripke 实验室

点击右上角“实验室”，或打开 `reader/lab/index.html`：

- 点击世界选中/拖动，点击空白加世界，拖拽加边；
- 切换各世界的原子命题真值；
- 输入公式求值，查看每个子公式；
- 检查框架性质；
- 在 ≤3 个世界中搜索反模型。

### 使用内置 API（不需要 Python）

打开页面 → 右上角“设置” → 模式选 **内置 API**：

1. 选服务商预设（OpenAI / DeepSeek / OpenRouter / SiliconFlow / 自定义）；
2. 确认 API 地址与模型；
3. 填 API Key（只保存在当前标签页的 `sessionStorage`）；
4. 点“测试连接”确认可用；
5. 保存。

之后选中正文内容，点“解释”，浏览器会直接请求该 API，并把本地 RAG 检索到的讲义片段一起发给模型。  
不需要运行 `serve.py`，也不需要本地 Python 环境。

注意：

- 浏览器直连受 **CORS** 限制。OpenAI 官方通常不建议浏览器直连；DeepSeek、OpenRouter、SiliconFlow 或自建网关是否允许，取决于服务商。
- 如果“测试连接”提示 CORS/网络错误，改用下面的“代理”模式，或换支持浏览器跨域的网关。
- Key 会出现在浏览器请求头里；不要在公共电脑上保存，使用后可在设置里清空。

### 使用代理（可选，Key 在服务端）

```powershell
$env:READER_API_KEY = "sk-..."
$env:READER_API_BASE = "https://api.openai.com/v1"   # 任意 OpenAI 兼容地址
$env:READER_MODEL = "gpt-4o-mini"
python reader/serve.py --port 8010
```

打开 <http://127.0.0.1:8010/>，右上角“设置” → 模式选 **代理** → 地址保持 `/api/explain` → 保存。

代理会在 `POST /api/explain` 里把选中内容、所在章节和 RAG 片段发给模型，Key 只保存在服务端。  
GitHub Pages 是静态站，线上要使用 API 时需要一个远程代理（本地 `serve.py` 不在线上运行）。

## 从 DOCX 重新生成

```powershell
python reader/build_reader.py
```

输入：

```text
course/模态逻辑六讲讲义.docx
```

输出：

| 文件 | 作用 |
|---|---|
| `reader/content.js` | 按 H1 分章的 HTML 与统计信息（`globalThis.READER_DOC.chapters`） |
| `reader/content.html` | 正文独立页：所有章分节 + 每章小目录 + 跳章 |
| `reader/content-page.css` | 正文独立页样式（含打印样式） |
| `reader/rag.js` | 浏览器端 RAG 块（`globalThis.RAG_DATA`） |
| `reader/rag/modal-logic-rag.jsonl` | 标准 RAG 文档，每行一个 JSON 块 |
| `reader/rag/stats.json` | 块数、标题数、章节数、字符数 |
| `reader/rag/README.md` | RAG 文档说明 |

当前构建结果：9 章、96 个标题、100 个 RAG 块、约 6.5 万字符。

RAG 块字段：

```json
{
  "id": "rag-0001",
  "source": "course/模态逻辑六讲讲义.docx",
  "section": "第二讲 Kripke 语义与反模型 / 2.5 反模型",
  "anchor": "sec-31",
  "level": 2,
  "text": "……",
  "chars": 412
}
```

`anchor` 与网页标题的 `id` 一致，解释面板里的“定位原文”就是跳到这个锚点。

## 解释是怎么工作的

### 本地 RAG（默认）

1. `build_reader.py` 按标题切分 DOCX，生成 100 个 chunk；
2. 浏览器加载 `rag.js`，在本地建立 BM25 索引（中文 unigram + bigram，英文/公式 token）；
3. 选中文本后，用“选中内容 + 所在章节”检索 top 5；
4. `answer()` 从命中段落中挑 3 句最相关的句子，附上来源编号；
5. 面板里显示“讲义中的相关表述”和“定位原文”。

这是**抽取式**回答，不是生成式模型；优点是离线、可复现、不会编造，缺点是语言不如 LLM 流畅。需要更自然的解释就切到 API 模式。

### API（内置直连或代理）

**内置 API：**

1. 同样先做本地 RAG 检索；
2. 浏览器把选中内容、章节、top 4 片段和 API Key 直接发到配置的 `/chat/completions`；
3. 返回的回答显示在面板里，来源仍用本地检索结果。

**代理：**

1. 浏览器把同样的 payload 发到 `serve.py` 的 `/api/explain`；
2. 代理调用 OpenAI 兼容接口，Key 只在服务端。

两种方式共用同一个 Prompt：“只根据讲义片段回答；讲义没覆盖就明确说未覆盖；用 [1][2] 标注来源”，以降低幻觉。

## 目录与正文

- `build_reader.py` 直接解析 DOCX：`Heading 1/2/3` → `h1/h2/h3`，段落 → `<p>`，`List Bullet` → `<ul>`，表格 → `<table>`，带灰色底纹的 Consolas 段落 → `<pre><code>`。
- 自动跳过封面和 DOCX 里手写的“目录”，用网页侧栏替代。
- 正文按 H1 拆成 9 个章节；一次只渲染一个章节，顶部/侧栏的章节选择器切换。
- 标题 ID 为 `sec-1`、`sec-2`…，RAG、目录、独立页共用同一套 ID。
- 左侧目录：
  - 章 / 节 / 小节三级，可勾选显示；
  - 宽度可拖拽（220–480px），保存在 localStorage；
  - 滚动高亮；点击小标题跳到对应小节。
- 正文搜索：
  - 搜索所有章节的正文（复用 RAG 块）；
  - 结果显示章节、片段和命中标记；
  - 点击后跳到对应章节/小节，并短暂高亮正文块。
- 右侧解释栏：
  - 停靠模式可拖拽左边缘调整宽度（320–760px）；
  - “浮窗”切换为可拖动、可缩放的浮动窗口；
  - “钉住”后点击外部不会关闭；未钉住时点击外部自动收起；
  - 宽度、浮窗位置/大小、钉住状态都会保存。
- 正文独立页 `content.html`：
  - 全部章节按 H1 分节；
  - 每章开头有本章小目录；
  - 顶部“跳章”下拉、打印按钮、返回阅读器链接；
  - H2/H3 点击仍可索引到小节。
- 代码块有“复制”按钮；移动端侧栏可收起。

## 测试

```powershell
# RAG 检索、章节拆分、抽取式回答
node reader/tests/test_rag.js

# 页面、分章、目录层级、正文搜索、拖拽、浮窗/钉住、设置（headless Chrome）
node reader/tests/ui_smoke.js

# 正文独立页：9 章、每章小目录、锚点、跳章
node reader/tests/ui_content_page.js

# 第二讲精读：五步、模型切换、空框架 stepper、测验反馈
node reader/tests/ui_deep_dive.js

# Kripke 实验室：反模型、求值、框架性质、加世界
node reader/tests/ui_lab_smoke.js
```

API 模式可以用 mock 服务验证，不需要真实 Key。

**内置 API 直连测试：**

```powershell
# 终端 1：CORS mock OpenAI
python reader/tests/mock_api.py

# 终端 2：静态 reader
python reader/serve.py --port 8013

# 终端 3：浏览器直连 mock，不经过 reader 代理
node reader/tests/ui_direct_api_smoke.js
```

**代理模式测试：**

```powershell
# 终端 1：mock OpenAI
python reader/tests/mock_api.py

# 终端 2：reader 代理指向 mock
$env:READER_API_BASE = "http://127.0.0.1:8012/v1"
$env:READER_API_KEY = "test"
$env:READER_MODEL = "mock"
python reader/serve.py --port 8013

# 终端 3
node reader/tests/ui_api_smoke.js
```

`ui_smoke.js` 需要本机 Chrome；脚本里的路径是：

```js
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
```

如果路径不同，改这一行。

## 文件结构

```text
reader/
├── index.html                 阅读器外壳（分章、可拖拽目录/解释栏）
├── style.css                  样式
├── app.js                     分章路由、搜索、目录、划词、浮窗、设置
├── explain.js                 BM25 检索、抽取式回答、API 调用
├── content.js                 按 H1 分章的 HTML（生成）
├── content.html               正文独立页（生成）
├── content-page.css           正文独立页样式
├── deep-dive.html             第二讲精读（五步 + 反例 + 测验）
├── deep-dive.css              精读页样式
├── deep-dive.js               精读页交互
├── lab/                       Kripke 实验室（模型编辑器）
├── rag.js                     RAG 块（生成）
├── rag/
│   ├── modal-logic-rag.jsonl  标准 RAG 文档
│   ├── stats.json
│   └── README.md
├── build_reader.py            DOCX → 分章 HTML + 独立页 + RAG
├── serve.py                   静态服务 + API 代理
├── screenshot.png             初始界面
├── screenshot-panel.png       划词解释面板
├── screenshot-float.png       解释浮窗
├── screenshot-settings.png    内置 API 设置
├── screenshot-content.png     正文独立页
├── screenshot-deep-dive.png   第二讲精读
└── tests/
    ├── test_rag.js
    ├── ui_smoke.js
    ├── ui_api_smoke.js
    ├── ui_direct_api_smoke.js
    ├── ui_content_page.js
    ├── ui_deep_dive.js
    ├── ui_lab_smoke.js
    └── mock_api.py
```

## 边界

- 本地 RAG 是检索 + 抽取，不是生成式问答；它不会“推理”出讲义里没有的结论。
- 第二讲精读是教学切片，不等于六讲全部内容都已完成同等深度改写。
- 实验室的反模型搜索在 ≤3 个世界中穷举；“没找到”不等于公式普遍有效。
- 内置 API 的质量取决于模型和 Prompt，且受服务商 CORS 策略影响；浏览器直连失败时请改用代理。
- 没有账号、没有云端存储；所有模型选择/端点保存在浏览器 localStorage，API Key 在 sessionStorage 或服务端环境变量。
- 没有公式排版引擎（KaTeX/MathJax）；公式以 Unicode 文本呈现，和 DOCX 一致。
- 正文搜索是子串匹配 + RAG 块排序，不是语义搜索；可以后续换成 embedding。
- DOCX 更新后需要重新运行 `build_reader.py`，并提交生成文件。

## 与工作区其他部分的关系

- 内容源：`course/模态逻辑六讲讲义.docx`（A 产物）；
- 语义/证明工具：`modal_lab.py`（Python）；
- 交互模型编辑器：`app/`（B 产物）；
- 形式化：`D/ModalK.lean`（D 产物）。
