# 模态逻辑六讲：教学包

这是一个面向“已经学过命题逻辑、想系统入门模态逻辑”的 6 讲迷你课程。它把语义、证明论、算法和应用连在一起，并配有一套可运行的 Python 检查器。

## 课程信息

- **对象**：哲学、逻辑学、计算机科学、语言学方向的本科生或研究生；也适合自学。
- **先修**：命题逻辑（真值表、重言式、MP）；基本的集合与关系概念。
- **课时**：6 讲 × 2 小时，共 12 小时；可压缩为 6 × 1 小时的核心版。
- **语言**：中文；公式与术语附英文。
- **软件**：Python 3.10+；`modal_lab.py` 无第三方依赖；绘图需要 Pillow。

## 学习成果

完成课程后，学生应能：

1. 把自然语言中的必然/可能、知道/相信、应当/允许翻译成模态公式，并指出辖域歧义；
2. 在 Kripke 模型上计算满足关系，构造反模型证明“不有效”；
3. 写出 K 中的简单 Hilbert 证明，区分 K/T/S4/S5/D/B；
4. 解释标准公理与框架条件的对应，复述典范模型完全性证明的结构；
5. 用表列法搜索证明或反模型，理解终止性与复杂度；
6. 为知识、时间、义务等应用选择合适的系统，并说明理由。

## 课程安排

| 讲 | 主题 | 核心内容 | 配套 |
|---|---|---|---|
| 1 | 命题逻辑回顾与模态语言 | 语法、对偶、辖域、翻译 | `lectures/01-language.md`，Lab 1 |
| 2 | Kripke 语义与反模型 | 框架/模型、满足关系、有效性 | `lectures/02-semantics.md`，Lab 2 |
| 3 | 公理系统 K/T/S4/S5 | Hilbert 系统、证明、系统关系 | `lectures/03-systems.md`，Lab 3 |
| 4 | 框架对应与完全性 | 对应表、典范模型、FMP | `lectures/04-correspondence.md`，Lab 4 |
| 5 | 表列法与证明搜索 | 表列规则、闭枝、反模型提取 | `lectures/05-tableaux.md`，Lab 5 |
| 6 | 应用：认知、时间、道义 | S5 知识、PAL、LTL/CTL、D | `lectures/06-applications.md`，Lab 6 |

**课程地图摘要。** 本课程面向已学命题逻辑、想系统入门模态逻辑的本科生/研究生；不要求一阶逻辑、代数或编程背景。先修是命题联结词真值表、重言式、MP，以及集合与二元关系的基本记号。六讲围绕四个问题推进：怎样表达“必然/可能/知道/应当/将来”；模态公式在什么情况下为真；哪些公式在哪个系统中可证；面对知识、时间、义务场景怎样选系统并说明边界。依赖关系是：第 1 讲给语言，第 2 讲给语义，第 3–4 讲给证明论与对应，第 5 讲给搜索算法，第 6 讲用前三类能力做应用。完整版按六讲顺序；核心版每讲只读“导入 + 定义 + 一个完整例题 + 常见错误 + 要点”；编程版加 Lab 1–6。范围、顺序理由、三条学习路径与评估映射见 `curriculum-map.md`。

## 文件结构

```text
course/
├── README.md                 本文件
├── curriculum-map.md         课程地图（对象/先修/依赖/路径/评估）
├── lectures/                 6 讲讲义（Markdown）
├── exercises.md              6 组练习题
├── exercise-index.md         题目→目标/知识点/难度/答案索引
├── solutions.md              参考答案
├── code/
│   ├── lab01_syntax.py       Lab 1：语法与翻译
│   ├── lab02_models.py       Lab 2：模型与求值
│   ├── lab03_systems.py      Lab 3：系统与有效性
│   ├── lab04_frames.py       Lab 4：框架对应
│   ├── lab05_proofs.py       Lab 5：Hilbert 证明
│   ├── lab06_applications.py Lab 6：认知模型
│   └── solutions/            六个 Lab 的参考实现
├── build/
│   ├── build_docx.py         生成讲义 DOCX
│   └── build_pptx.py         生成课件 PPTX
├── 模态逻辑六讲讲义.docx
└── 模态逻辑六讲课件.pptx
```

## 怎么用

### 只讲课

按 `lectures/01` 到 `06` 顺序讲。每讲末尾有“本讲要点”，可以直接做小结；练习题在 `exercises.md`，答案在 `solutions.md`。

**网页版 + 划词解释**

打开 [`../reader/index.html`](../reader/index.html)：左侧目录、右侧正文，选中词/句可点“解释”。默认本地 RAG，离线可用；需要更自然的回答时可在页面设置中选“内置 API”直连服务商，或用 `reader/serve.py` 代理。说明见 [`../reader/README.md`](../reader/README.md)。

### 带编程

先安装 Python 3.10+，然后：

```powershell
python code/lab01_syntax.py
python code/lab02_models.py
python code/lab03_systems.py
python code/lab04_frames.py
python code/lab05_proofs.py
python code/lab06_applications.py
```

每个 Lab 里有 `TODO` 注释；参考答案在 `code/solutions/`。所有 Lab 只依赖工作区根目录的 `modal_lab.py`。

### 生成 DOCX/PPTX

```powershell
python build/build_docx.py
python build/build_pptx.py
```

需要 `python-docx`、`python-pptx`（环境已提供）。

## 作业与考核建议

- **每周练习（30%）**：6 组练习题，每组选 3 题；重视“反模型”和“证明”两类题。
- **编程 Lab（20%）**：完成 3 个 Lab 即可；鼓励自己扩展 `modal_lab.py`。
- **期中/期末（30%）**：闭卷，覆盖语义、证明、对应、表列。
- **期末项目（20%）**：选择一个论证或场景，做形式化、建模型、给证明或反模型，并写 2–3 页说明。

## 教学建议

- 第 1–2 讲不要急着上公理；先用模型和反模型建立直觉。
- 第 3 讲把“证明”与“语义”交替讲：每证一个公式，就用反模型检验它为什么在该系统中成立/不成立。
- 第 4 讲只要求复述完全性证明结构，不要求形式化细节；有兴趣的学生可以读 SEP 或 Boxes and Diamonds 的相关章节。
- 第 5 讲建议现场手写表列，让学生看到“闭枝/开放枝”与“证明/反模型”的对应。
- 第 6 讲用学生熟悉的场景（知识谜题、程序状态、义务冲突）引入，避免变成术语堆砌。

## 与 `modal_lab.py` 的对应

| 讲义概念 | 代码 |
|---|---|
| 公式解析 | `parse`, `to_ascii`, `to_unicode` |
| 模型求值 | `Model`, `evaluate` |
| 有效性/反模型 | `check_validity` |
| 框架性质 | `is_reflexive`, `is_serial`, `is_transitive`, `is_symmetric`, `is_euclidean` |
| 框架对应 | `check_on_property` |
| Hilbert 证明 | `Step`, `check_proof` |
| 系统 | `LOGICS`, `LOGIC_AXIOMS` |

## 许可与来源

讲义与习题为本工作区原创，可自由用于教学；引用 SEP、Open Logic Project、Boxes and Diamonds 等外部资料时请保留出处。外部教材的许可各不相同，详见 `docs/模态逻辑公开知识库调研.md`。
