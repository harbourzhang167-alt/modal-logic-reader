#!/usr/bin/env python3
"""Serve the interactive reader and proxy an OpenAI-compatible chat API.

Usage:
    python reader/serve.py
    python reader/serve.py --port 8010

Environment:
    READER_API_BASE   default https://api.openai.com/v1
    READER_API_KEY    API key (required for api.openai.com)
    READER_MODEL      default gpt-4o-mini

The browser calls POST /api/explain with:
    {"selection": "...", "heading": "...", "context": [{"section": "...", "text": "..."}]}

The key stays on the server. CORS is open so a file:// reader page can call
http://127.0.0.1:8010/api/explain if desired.
"""

from __future__ import annotations

import argparse
import json
import os
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

READER_DIR = Path(__file__).resolve().parent
API_BASE = os.environ.get("READER_API_BASE", "https://api.openai.com/v1").rstrip("/")
API_KEY = os.environ.get("READER_API_KEY", "").strip()
API_MODEL = os.environ.get("READER_MODEL", "gpt-4o-mini")


def api_available() -> bool:
    return bool(API_KEY) or "openai.com" not in API_BASE


def build_messages(payload: dict) -> list[dict]:
    selection = str(payload.get("selection", "")).strip()[:2000]
    heading = str(payload.get("heading", "")).strip()[:300]
    context_items = payload.get("context") or []

    blocks = []
    for i, item in enumerate(context_items[:4], start=1):
        if not isinstance(item, dict):
            continue
        section = str(item.get("section", "")).strip()[:300]
        text = str(item.get("text", "")).strip()[:1800]
        blocks.append(f"[{i}] {section}\n{text}")

    context = "\n\n".join(blocks) or "（无）"
    return [
        {
            "role": "system",
            "content": (
                "你是模态逻辑课程助教。请只根据提供的讲义片段解释用户选中的词或句子。"
                "先用一句话概括，再给 2-4 点解释，最后用 [1][2] 标明依据的片段编号。"
                "如果讲义没有覆盖，请明确说“讲义未覆盖”，不要编造。回答用中文。"
            ),
        },
        {
            "role": "user",
            "content": (
                f"选中的内容：{selection}\n\n"
                f"所在章节：{heading or '未知'}\n\n"
                f"讲义片段：\n{context}\n\n"
                "请解释这段内容。"
            ),
        },
    ]


def call_upstream(payload: dict) -> str:
    body = {
        "model": API_MODEL,
        "messages": build_messages(payload),
        "temperature": 0.2,
    }
    headers = {"Content-Type": "application/json"}
    if API_KEY:
        headers["Authorization"] = f"Bearer {API_KEY}"

    request = urllib.request.Request(
        API_BASE + "/chat/completions",
        data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        data = json.loads(response.read().decode("utf-8"))
    try:
        return data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise RuntimeError(f"上游返回格式不正确：{data}") from exc


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(READER_DIR), **kwargs)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        super().end_headers()

    def _json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        if self.path == "/api/health":
            self._json(
                200,
                {
                    "ok": True,
                    "api": api_available(),
                    "model": API_MODEL,
                    "base": API_BASE,
                },
            )
            return
        super().do_GET()

    def do_POST(self):
        if self.path != "/api/explain":
            self._json(404, {"error": "not found"})
            return

        if not api_available():
            self._json(
                503,
                {
                    "error": (
                        "未配置 READER_API_KEY。请设置环境变量后重启 serve.py，"
                        "或在前端继续使用本地 RAG 模式。"
                    )
                },
            )
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            raw = self.rfile.read(length) if length else b"{}"
            payload = json.loads(raw.decode("utf-8"))
            if not isinstance(payload, dict):
                raise ValueError("body 必须是 JSON 对象")
            answer = call_upstream(payload)
            self._json(200, {"answer": answer, "model": API_MODEL})
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")[:600]
            self._json(502, {"error": f"上游 HTTP {exc.code}：{detail}"})
        except Exception as exc:  # noqa: BLE001 - return a readable error to the UI
            self._json(500, {"error": f"{type(exc).__name__}：{exc}"})


def main() -> None:
    parser = argparse.ArgumentParser(description="Serve the modal logic interactive reader.")
    parser.add_argument("--port", type=int, default=8010)
    parser.add_argument("--host", default="127.0.0.1")
    args = parser.parse_args()

    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"reader: http://{args.host}:{args.port}/")
    print(f"api:    {API_BASE}  model={API_MODEL}  available={api_available()}")
    if not api_available():
        print("提示：未设置 READER_API_KEY；/api/explain 会返回 503，前端会自动回退本地 RAG。")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nbye")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
