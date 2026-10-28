#!/usr/bin/env python3
"""Build the interactive reader from the teaching DOCX.

Outputs:
  reader/content.js                 HTML fragment + metadata
  reader/rag.js                     browser-side RAG chunks
  reader/rag/modal-logic-rag.jsonl  one JSON chunk per line
  reader/rag/stats.json             build statistics

The DOCX is the source of truth: headings become anchors, paragraphs/tables
become HTML, and the same blocks become RAG chunks with matching anchors.
"""

from __future__ import annotations

import html
import json
import re
from datetime import datetime, timezone
from pathlib import Path

from docx import Document
from docx.oxml.ns import qn
from docx.table import Table
from docx.text.paragraph import Paragraph

ROOT = Path(__file__).resolve().parents[1]
DOCX = ROOT / "course" / "模态逻辑六讲讲义.docx"
OUT = Path(__file__).resolve().parent
RAG_DIR = OUT / "rag"

SOURCE_LABEL = "course/模态逻辑六讲讲义.docx"


# --------------------------------------------------------------------- utils


def esc(text: str) -> str:
    return html.escape(text, quote=False)


def run_html(run) -> str:
    text = run.text
    if not text:
        return ""
    body = esc(text).replace("\n", "<br>")
    name = run.font.name or ""
    if name in ("Consolas", "Courier New"):
        body = f"<code>{body}</code>"
    if run.bold:
        body = f"<strong>{body}</strong>"
    if run.italic:
        body = f"<em>{body}</em>"
    return body


def paragraph_inline(p: Paragraph) -> str:
    rendered = "".join(run_html(r) for r in p.runs)
    return rendered or esc(p.text)


def is_code_block(p: Paragraph) -> bool:
    ppr = p._p.pPr
    if ppr is not None:
        shd = ppr.find(qn("w:shd"))
        if shd is not None:
            fill = (shd.get(qn("w:fill")) or "").upper()
            if fill in {"F4F5F7", "F2F2F2"}:
                return True
    runs = [r for r in p.runs if r.text.strip()]
    return (
        bool(runs)
        and all((r.font.name or "") in ("Consolas", "Courier New") for r in runs)
        and "\n" in p.text
    )


def cell_html(cell) -> str:
    parts = []
    for p in cell.paragraphs:
        text = paragraph_inline(p).strip()
        if text:
            parts.append(text)
    return "<br>".join(parts) or ""


def table_html(table: Table) -> str:
    rows = []
    for ri, row in enumerate(table.rows):
        tag = "th" if ri == 0 else "td"
        cells = [f"<{tag}>{cell_html(c)}</{tag}>" for c in row.cells]
        rows.append("<tr>" + "".join(cells) + "</tr>")
    if not rows:
        return ""
    return (
        '<div class="table-wrap"><table><thead>'
        + rows[0]
        + "</thead><tbody>"
        + "".join(rows[1:])
        + "</tbody></table></div>"
    )


def table_text(table: Table) -> str:
    lines = []
    for row in table.rows:
        lines.append(" | ".join(c.text.strip().replace("\n", " ") for c in row.cells))
    return "\n".join(lines)


def split_chunks(text: str, max_chars: int = 720, overlap: int = 100) -> list[str]:
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    if not text:
        return []
    if len(text) <= max_chars:
        return [text]

    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    chunks: list[str] = []
    current = ""

    for para in paragraphs:
        if len(para) > max_chars:
            if current:
                chunks.append(current)
                current = ""
            start = 0
            while start < len(para):
                end = min(start + max_chars, len(para))
                if end < len(para):
                    window_start = start + max_chars // 3
                    cut = -1
                    for ch in "。！？；\n":
                        pos = para.rfind(ch, window_start, end)
                        cut = max(cut, pos)
                    if cut > window_start:
                        end = cut + 1
                piece = para[start:end].strip()
                if piece:
                    chunks.append(piece)
                if end >= len(para):
                    break
                start = max(end - overlap, start + 1)
            continue

        candidate = (current + "\n\n" + para).strip() if current else para
        if len(candidate) <= max_chars:
            current = candidate
        else:
            if current:
                chunks.append(current)
            current = para

    if current:
        chunks.append(current)
    return [c for c in chunks if c.strip()]


def iter_blocks(doc: Document):
    body = doc.element.body
    for child in body.iterchildren():
        if child.tag == qn("w:p"):
            yield Paragraph(child, doc)
        elif child.tag == qn("w:tbl"):
            yield Table(child, doc)


LINK_RE = re.compile(r"\[(.+?)\]\(([^)\s]+)\)")


def clean_links(html_text: str) -> str:
    """Turn the few leftover Markdown links from the DOCX into HTML links."""

    def repl(match: re.Match) -> str:
        label, url = match.group(1), match.group(2)
        if url.startswith(("http://", "https://")):
            safe = html.escape(url, quote=True)
            return f'<a href="{safe}" target="_blank" rel="noopener">{label}</a>'
        # Links in the DOCX were written relative to course/lectures/.
        # The reader lives at the workspace root, one level higher.
        if url.startswith("../../"):
            href = "../" + url[6:]
        elif url.startswith("../"):
            href = url
        else:
            return label
        return f'<a href="{html.escape(href, quote=True)}">{label}</a>'

    return LINK_RE.sub(repl, html_text)


# --------------------------------------------------------------------- build


def main() -> None:
    if not DOCX.exists():
        raise SystemExit(f"DOCX not found: {DOCX}")

    doc = Document(str(DOCX))
    html_parts: list[str] = []
    headings: list[dict] = []
    chunks: list[dict] = []
    section_buffer: list[str] = []
    heading_stack: list[dict] = []
    current_heading: dict | None = None
    list_items: list[str] = []
    started = False

    def flush_list() -> None:
        nonlocal list_items
        if list_items:
            html_parts.append("<ul>" + "".join(list_items) + "</ul>")
            list_items = []

    def flush_section() -> None:
        nonlocal section_buffer
        if current_heading is None:
            section_buffer = []
            return
        text = "\n\n".join(x for x in section_buffer if x.strip()).strip()
        if text:
            for piece in split_chunks(text):
                chunks.append(
                    {
                        "id": f"rag-{len(chunks) + 1:04d}",
                        "source": SOURCE_LABEL,
                        "section": current_heading["path"],
                        "anchor": current_heading["id"],
                        "level": current_heading["level"],
                        "text": piece,
                        "chars": len(piece),
                    }
                )
        section_buffer = []

    for block in iter_blocks(doc):
        if isinstance(block, Paragraph):
            text = block.text.strip()
            style = block.style.name or ""

            if style == "Heading 1" and text == "课程说明":
                started = True
            if not started:
                continue

            if style.startswith("Heading"):
                m = re.search(r"(\d+)", style)
                level = int(m.group(1)) if m else 1
                if level > 3:
                    level = 3
                if not text:
                    continue
                flush_list()
                flush_section()

                hid = f"sec-{len(headings) + 1}"
                while heading_stack and heading_stack[-1]["level"] >= level:
                    heading_stack.pop()
                heading_stack.append({"level": level, "text": text, "id": hid})
                path = " / ".join(h["text"] for h in heading_stack)
                current_heading = {"id": hid, "level": level, "text": text, "path": path}
                headings.append(current_heading)
                section_buffer = [text]

                cls = {1: "chapter", 2: "section", 3: "subsection"}.get(level, "section")
                html_parts.append(
                    f'<h{level} id="{hid}" class="{cls}">'
                    f'<span class="heading-text">{paragraph_inline(block)}</span>'
                    f'<a class="anchor" href="#{hid}" aria-label="链接">#</a>'
                    f"</h{level}>"
                )
                continue

            if not text:
                continue

            if is_code_block(block):
                flush_list()
                code = esc(block.text)
                html_parts.append(
                    '<div class="code-block">'
                    '<button class="copy-code" type="button">复制</button>'
                    f"<pre><code>{code}</code></pre>"
                    "</div>"
                )
                section_buffer.append(block.text)
                continue

            if style == "List Bullet":
                list_items.append(f"<li>{paragraph_inline(block)}</li>")
                section_buffer.append(text)
                continue

            flush_list()
            if re.match(r"^\d+\.\s+", text):
                html_parts.append(
                    f'<p class="numbered">{paragraph_inline(block)}</p>'
                )
            elif text == "· · ·":
                html_parts.append('<hr class="soft">')
            else:
                html_parts.append(f"<p>{paragraph_inline(block)}</p>")
            section_buffer.append(text)

        elif isinstance(block, Table):
            if not started:
                continue
            flush_list()
            html_parts.append(table_html(block))
            section_buffer.append(table_text(block))

    flush_list()
    flush_section()

    if not started:
        raise SystemExit("Could not find the first heading '课程说明' in the DOCX")

    generated_at = datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")
    body_html = clean_links("\n".join(html_parts))
    stats = {
        "generatedAt": generated_at,
        "source": str(DOCX.relative_to(ROOT)).replace("\\", "/"),
        "headings": len(headings),
        "chunks": len(chunks),
        "chars": len(body_html),
        "htmlBytes": len(body_html.encode("utf-8")),
    }

    content = {
        "title": "模态逻辑六讲",
        "subtitle": "从 Kripke 语义到认知、时间与道义应用",
        "generatedAt": generated_at,
        "html": body_html,
        "stats": stats,
    }
    (OUT / "content.js").write_text(
        "globalThis.READER_DOC = " + json.dumps(content, ensure_ascii=False) + ";\n",
        encoding="utf-8",
    )

    rag = {"generatedAt": generated_at, "source": SOURCE_LABEL, "chunks": chunks}
    (OUT / "rag.js").write_text(
        "globalThis.RAG_DATA = " + json.dumps(rag, ensure_ascii=False) + ";\n",
        encoding="utf-8",
    )

    RAG_DIR.mkdir(parents=True, exist_ok=True)
    with (RAG_DIR / "modal-logic-rag.jsonl").open("w", encoding="utf-8") as fh:
        for chunk in chunks:
            fh.write(json.dumps(chunk, ensure_ascii=False) + "\n")
    (RAG_DIR / "stats.json").write_text(
        json.dumps(stats, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    (RAG_DIR / "README.md").write_text(
        f"""# 模态逻辑六讲 RAG 文档

由 `reader/build_reader.py` 从 `{SOURCE_LABEL}` 自动生成。

- 生成时间：{generated_at}
- 块数：{len(chunks)}
- 标题数：{len(headings)}
- 字段：`id`、`source`、`section`、`anchor`、`level`、`text`、`chars`

`modal-logic-rag.jsonl` 每行一个 JSON 块；`rag.js` 是浏览器加载的同一份数据。
`anchor` 对应网页正文中标题的 `id`，可用于“在讲义中定位”。

重新生成：

```powershell
python reader/build_reader.py
```
""",
        encoding="utf-8",
    )

    print(f"wrote {OUT / 'content.js'}")
    print(f"wrote {OUT / 'rag.js'}")
    print(f"wrote {RAG_DIR / 'modal-logic-rag.jsonl'}")
    print(json.dumps(stats, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
