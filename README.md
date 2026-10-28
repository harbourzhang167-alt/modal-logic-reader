# 模态逻辑六讲 · 交互讲义

把 6 讲模态逻辑教学 DOCX 变成一个可交互网页：

- **正文按 H1 分章**：一次显示一章，章节选择器切换，小标题仍可跳转
- **左侧目录**：章/节/小节可勾选显示，宽度可拖拽，滚动高亮
- **正文全文搜索**：搜索所有章节，结果显示章节/片段，点击跳转并高亮
- **右侧解释栏**：宽度可拖拽；支持“浮窗/停靠”和“钉住/取消钉住”
- **正文独立页**：`reader/content.html` 按大标题分节，每章带小目录，可跳章、打印
- **第二讲精读**：`reader/deep-dive.html`，五步引导、T/4/5/B/D 四段精读、10 题诊断、KaTeX 公式树
- **Kripke 实验室**：`reader/lab/`，拖世界、加边、改赋值、求值、逐子公式 trace、查框架、找反模型
- **知识地图**：`reader/map.html`，概念依赖、学习路径、章节与工具入口
- 选中正文中的词/句，点“解释”
- 默认 **本地 RAG**（离线，BM25 检索 + 抽取式回答）
- 可选 **内置 API**（网页里填服务商/模型/Key，浏览器直接调用，不需要 Python）
- 可选 **代理**（Key 在服务端，适合线上/团队使用）

![内置 API 设置](reader/screenshot-settings.png)

> 在线版：<https://harbourzhang167-alt.github.io/modal-logic-reader/>  
> 页面截图：[reader/screenshot.png](reader/screenshot.png)、[reader/screenshot-panel.png](reader/screenshot-panel.png)、[reader/screenshot-float.png](reader/screenshot-float.png)、[reader/screenshot-content.png](reader/screenshot-content.png)、[reader/screenshot-deep-dive.png](reader/screenshot-deep-dive.png)、[reader/screenshot-formula-tree.png](reader/screenshot-formula-tree.png)、[reader/screenshot-map.png](reader/screenshot-map.png)、[reader/screenshot-lab-trace.png](reader/screenshot-lab-trace.png)

## 直接使用

```powershell
# 方式一：直接打开静态页面（本地 RAG，无需联网）
start reader/index.html

# 方式二：本地服务（可选；代理模式需要）
python reader/serve.py --port 8010
```

打开 <http://127.0.0.1:8010/>。

### 正文独立页

点击右上角“正文独立页”，或直接打开 `reader/content.html`：

- 全部 9 章按 H1 分节；
- 每章开头有本章小目录；
- 顶部“跳章”下拉、打印按钮、返回阅读器；
- H2/H3 点击仍可跳到小节。

### 第二讲精读

打开 `reader/deep-dive.html`，或侧栏底部“第二讲精读”：

- 五步引导：自然语言问题 → 最小模型 → 逐项求值 → 改变模型 → 回到定义；
- 空可及关系反例分三步展示；
- T/4/5/B/D 五条公理各有“直觉 → 关系条件 → 反模型 → 系统对比”；
- 10 题诊断题库，按知识点分项统计；
- KaTeX 公式树：□◇p vs ◇□p，可输入任意公式生成 AST 树；
- 可跳转到 Kripke 实验室亲手改模型。

### Kripke 实验室

点击右上角“实验室”，或打开 `reader/lab/index.html`：

- 拖动世界、加边、切换命题赋值；
- 输入公式求值，查看子公式；
- 逐子公式 trace：每个子公式显示世界、真值和原因，跟随选中世界；
- 检查框架性质；
- 在 ≤3 个世界中搜索反模型。

### 知识地图

打开 `reader/map.html`，或侧栏底部“知识地图”：

- SVG 依赖图：命题逻辑 → 模态语言 → Kripke 语义 → 公理/框架/完全性 → 表列法/应用；
- 节点链接章节、精读、题库、公式树、实验室；
- 四条学习路径与工具入口。

### 接 API

**方式 A：内置 API（不需要 Python）**

页面右上角“设置” → 模式 **内置 API**：

1. 选服务商预设（OpenAI / DeepSeek / OpenRouter / SiliconFlow / 自定义）；
2. 确认 API 地址与模型；
3. 填 API Key（仅当前标签页 `sessionStorage`）；
4. 点“测试连接”；
5. 保存。

之后划词解释时，浏览器会直接调用该 OpenAI 兼容接口，不需要本地服务器。  
浏览器直连受 **CORS** 限制；若提示 CORS/网络错误，改用方式 B，或换支持浏览器跨域的网关。

**方式 B：代理（Key 在服务端）**

```powershell
$env:READER_API_KEY = "sk-..."
$env:READER_API_BASE = "https://api.openai.com/v1"   # 任意 OpenAI 兼容地址
$env:READER_MODEL = "gpt-4o-mini"
python reader/serve.py --port 8010
```

页面右上角“设置” → 模式 **代理** → 地址保持 `/api/explain` → 保存。  
API Key 只保存在服务端。GitHub Pages 是静态站，线上使用代理模式时需要一个远程代理。

## 本地 RAG 与 RAG 文档

这个仓库**有意提交**了生成后的 RAG 数据和前端产物，这样 GitHub Pages 不需要构建步骤即可直接运行：

| 文件 | 说明 |
|---|---|
| `reader/rag/modal-logic-rag.jsonl` | 标准 RAG 文档，100 个块，每行一个 JSON |
| `reader/rag/stats.json` | 96 个标题、100 个块、约 6.5 万字符 |
| `reader/rag.js` | 浏览器加载的同一份 RAG 数据 |
| `reader/content.js` | DOCX 转换后的 HTML 与统计信息 |

重新生成（需要 Python 3.10+ 与 `python-docx`）：

```powershell
pip install python-docx
python reader/build_reader.py
```

脚本会读取 `course/模态逻辑六讲讲义.docx`，同时更新 `reader/content.js`、`reader/rag.js` 和 `reader/rag/*`。  
生成文件不要手改；如需更新内容，改 DOCX 后重新运行脚本。

## 目录结构

```text
.
├── index.html                     GitHub Pages 根入口（跳转到 reader/）
├── LICENSE                        MIT License（代码）
├── CONTENT-LICENSE.md             CC BY 4.0（讲义内容）
├── reader/
│   ├── index.html                 阅读器（分章、可拖拽目录/解释栏）
│   ├── style.css / app.js         布局、分章路由、搜索、浮窗
│   ├── explain.js                 BM25 检索、抽取式回答、API
│   ├── content.js                 按 H1 分章的正文数据
│   ├── content.html               正文独立页
│   ├── content-page.css           正文独立页样式
│   ├── deep-dive.html/css/js      第二讲精读（五步 + 公理 + 题库 + 公式树）
│   ├── lab/                       Kripke 实验室（模型编辑器 + trace）
│   ├── map.html/css/js            知识地图
│   ├── vendor/katex/              本地 KaTeX（MIT）
│   ├── rag.js                     生成的 RAG 数据
│   ├── rag/modal-logic-rag.jsonl  标准 RAG 文档
│   ├── build_reader.py            DOCX → 分章 HTML + RAG + 独立页
│   ├── serve.py                   静态服务 + API 代理
│   └── tests/                     RAG、UI、API、独立页、精读、实验室、地图测试
├── course/模态逻辑六讲讲义.docx      内容源
└── modal_lab.py                   讲义中引用的 Python 示例库
```

## 测试

```powershell
# RAG 检索、章节拆分、抽取式回答、anchor 一致性
node reader/tests/test_rag.js

# 分章、目录层级、正文搜索、拖拽、浮窗/钉住、设置（headless Chrome）
node reader/tests/ui_smoke.js

# 正文独立页：9 章、每章小目录、锚点、跳章
node reader/tests/ui_content_page.js

# 第二讲精读：五步、T/4/5/B/D、10 题诊断、KaTeX 公式树
node reader/tests/ui_deep_dive.js

# Kripke 实验室：反模型、求值、逐子公式 trace、框架性质、加世界
node reader/tests/ui_lab_smoke.js

# 知识地图：14 个节点、17 条边、学习路径与工具链接
node reader/tests/ui_map.js
```

API 模式可以用 mock OpenAI 服务验证，不需要真实 Key。

**内置 API 直连测试（不经过 reader 代理）：**

```powershell
# 终端 1：CORS mock
python reader/tests/mock_api.py

# 终端 2：静态 reader
python reader/serve.py --port 8013

# 终端 3
node reader/tests/ui_direct_api_smoke.js
```

**代理模式测试：**

```powershell
# 终端 1：mock
python reader/tests/mock_api.py

# 终端 2：代理指向 mock
$env:READER_API_BASE = "http://127.0.0.1:8012/v1"
$env:READER_API_KEY = "test"
$env:READER_MODEL = "mock"
python reader/serve.py --port 8013

# 终端 3
node reader/tests/ui_api_smoke.js
```

`ui_smoke.js` 需要本机 Chrome；脚本里的路径按需修改。

## 部署到 GitHub Pages

仓库已包含 `.github/workflows/pages.yml`。首次部署：

1. 把仓库推到 GitHub；
2. 打开仓库 **Settings → Pages**；
3. **Build and deployment → Source** 选 **GitHub Actions**；
4. 向 `main` 推送，或在 **Actions** 里手动运行 `Deploy reader to GitHub Pages`；
5. 部署完成后访问 `https://<user>.github.io/<repo>/`，根入口会跳到 `reader/`。

如果不用 Actions，也可以把 Pages 的 Source 设为 `Deploy from a branch`，分支 `main`、目录 `/ (root)`；根 `index.html` 同样会跳转。`.nojekyll` 已就位。

## 说明与边界

- 本地 RAG 是**检索 + 抽取**，不是生成式模型；它不会编造，但语言不如 LLM 流畅。
- 内置 API 的质量取决于模型和 Prompt，且受服务商 **CORS** 策略影响；直连失败时改用代理或支持 CORS 的网关。
- `serve.py` 的代理模式只做转发。
- 正文仍以 Unicode 公式为主；精读页公式树与示例使用本地 vendored KaTeX（MIT），不依赖 CDN。
- 知识地图是学习建议，不是形式化依赖证明。
- 正文搜索是子串匹配 + RAG 块排序，不是语义搜索。
- 没有账号、没有云端存储；设置保存在浏览器 localStorage，API Key 在 sessionStorage 或服务端环境变量。
- DOCX 更新后需要重新运行 `reader/build_reader.py`，并提交生成文件。

## 致谢

内容参考了 SEP、Open Logic Project / *Boxes and Diamonds*、Isabelle AFP、QMLTP 等公开资料；具体链接与许可见讲义正文和调研报告。

## License

Copyright (c) 2026 harbourzhang167-alt.

This repository uses a **split license**:

- **Code** — MIT License. See [LICENSE](LICENSE).
  - `reader/app.js`, `reader/explain.js`, `reader/build_reader.py`, `reader/serve.py`
  - `reader/index.html`, `reader/style.css`
  - tests, build scripts, GitHub Actions workflow
- **Teaching content** — CC BY 4.0. See [CONTENT-LICENSE.md](CONTENT-LICENSE.md).
  - `course/模态逻辑六讲讲义.docx`
  - `reader/content.js`, `reader/rag.js`, `reader/rag/*`
  - screenshots and prose documentation
- **Third-party material** cited or linked in the teaching content remains under
  its own license (SEP, Open Logic Project / *Boxes and Diamonds*, Isabelle AFP,
  QMLTP, etc.); it is not relicensed here.

Attribution example for the content:

> 模态逻辑六讲 · 交互讲义, by harbourzhang167-alt,
> <https://github.com/harbourzhang167-alt/modal-logic-reader>,
> licensed under CC BY 4.0.

