# 交互讲义：模态逻辑六讲

在线版：<https://harbourzhang167-alt.github.io/modal-logic-reader/>  
源码仓库：<https://github.com/harbourzhang167-alt/modal-logic-reader>

把 `course/模态逻辑六讲讲义.docx` 转成一个可交互的网页：

- 左侧目录（H1–H3，可筛选、滚动高亮）；
- 右侧正文（标题、段落、列表、表格、代码块）；
- 选中正文中的词/句，弹出“解释”按钮；
- 解释模式二选一：
  - **本地 RAG**：离线，BM25 检索 + 抽取式回答，不需要 API；
  - **API**：通过本地代理或 OpenAI 兼容接口生成回答，自动附带讲义来源。

## 快速开始

### 只读 + 本地 RAG

直接双击 `reader/index.html`。它是纯静态页面，不需要服务器、不需要联网。

如果浏览器对 `file://` 有额外限制，也可以：

```powershell
python reader/serve.py --port 8010
```

然后打开 <http://127.0.0.1:8010/>。

### 使用 API

推荐用本地代理，API Key 不进入浏览器：

```powershell
$env:READER_API_KEY = "sk-..."
$env:READER_API_BASE = "https://api.openai.com/v1"   # 可换成任何 OpenAI 兼容地址
$env:READER_MODEL = "gpt-4o-mini"
python reader/serve.py --port 8010
```

打开 <http://127.0.0.1:8010/>，右上角“设置” → 模式选 **API** → 地址保持 `/api/explain` → 保存。

代理会在 `POST /api/explain` 里把选中内容、所在章节和 RAG 片段发给模型，Key 只保存在服务端。

如果不想跑代理，也可以在设置里填一个完整的 OpenAI 兼容 base URL（例如 `https://api.openai.com/v1`）和 Key，由浏览器直连；但很多服务商会有 CORS 限制，且 Key 会暴露在前端，**不推荐**。

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
| `reader/content.js` | 页面 HTML 与统计信息（`globalThis.READER_DOC`） |
| `reader/rag.js` | 浏览器端 RAG 块（`globalThis.RAG_DATA`） |
| `reader/rag/modal-logic-rag.jsonl` | 标准 RAG 文档，每行一个 JSON 块 |
| `reader/rag/stats.json` | 块数、标题数、字符数 |
| `reader/rag/README.md` | RAG 文档说明 |

当前构建结果：96 个标题、100 个 RAG 块、约 6.5 万字符。

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

### API

1. 同样先做本地 RAG 检索；
2. 把选中内容、章节、top 4 片段打包发给代理；
3. 代理调用 OpenAI 兼容的 `/chat/completions`；
4. 返回的回答显示在面板里，来源仍用本地检索结果。

Prompt 要求模型“只根据讲义片段回答；讲义没覆盖就明确说未覆盖；用 [1][2] 标注来源”，以降低幻觉。

## 目录与正文

- `build_reader.py` 直接解析 DOCX：`Heading 1/2/3` → `h1/h2/h3`，段落 → `<p>`，`List Bullet` → `<ul>`，表格 → `<table>`，带灰色底纹的 Consolas 段落 → `<pre><code>`。
- 自动跳过封面和 DOCX 里手写的“目录”，用网页侧栏替代。
- 标题 ID 为 `sec-1`、`sec-2`…，RAG 与目录共用同一套 ID。
- 侧栏支持筛选；滚动时按当前标题高亮；点击目录平滑跳转。
- 代码块有“复制”按钮；移动端侧栏可收起。

## 测试

```powershell
# RAG 检索与抽取式回答
node reader/tests/test_rag.js

# 页面、目录、划词、面板、设置（headless Chrome）
node reader/tests/ui_smoke.js
```

API 模式可以用 mock 服务验证，不需要真实 Key：

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
├── index.html                 页面外壳
├── style.css                  样式
├── app.js                     目录、滚动高亮、划词、面板、设置
├── explain.js                 BM25 检索、抽取式回答、API 调用
├── content.js                 DOCX → HTML（生成）
├── rag.js                     RAG 块（生成）
├── rag/
│   ├── modal-logic-rag.jsonl  标准 RAG 文档
│   ├── stats.json
│   └── README.md
├── build_reader.py            DOCX → HTML + RAG
├── serve.py                   静态服务 + API 代理
├── screenshot.png             初始界面
├── screenshot-panel.png       划词解释面板
└── tests/
    ├── test_rag.js
    ├── ui_smoke.js
    ├── ui_api_smoke.js
    └── mock_api.py
```

## 边界

- 本地 RAG 是检索 + 抽取，不是生成式问答；它不会“推理”出讲义里没有的结论。
- API 模式的质量取决于模型和 Prompt；代理只做转发，不做内容审核。
- 没有账号、没有云端存储；所有模型选择/端点保存在浏览器 localStorage，API Key 在 sessionStorage 或服务端环境变量。
- 没有公式排版引擎（KaTeX/MathJax）；公式以 Unicode 文本呈现，和 DOCX 一致。
- 没有全文搜索（只有目录筛选和 RAG 检索）；可以后续加。
- DOCX 更新后需要重新运行 `build_reader.py`。

## 与工作区其他部分的关系

- 内容源：`course/模态逻辑六讲讲义.docx`（A 产物）；
- 语义/证明工具：`modal_lab.py`（Python）；
- 交互模型编辑器：`app/`（B 产物）；
- 形式化：`D/ModalK.lean`（D 产物）。
