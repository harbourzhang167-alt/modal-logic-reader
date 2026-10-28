# 模态逻辑六讲 RAG 文档

由 `reader/build_reader.py` 从 `course/模态逻辑六讲讲义.docx` 自动生成。

- 生成时间：2026-10-28T21:37:45+08:00
- 块数：100
- 标题数：96
- 章节数：9
- 字段：`id`、`source`、`section`、`anchor`、`level`、`text`、`chars`

`modal-logic-rag.jsonl` 每行一个 JSON 块；`rag.js` 是浏览器加载的同一份数据。
`anchor` 对应网页正文中标题的 `id`，可用于“在讲义中定位”。

重新生成：

```powershell
python reader/build_reader.py
```
