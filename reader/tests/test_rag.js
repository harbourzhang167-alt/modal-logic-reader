const assert = require("assert");
require("../rag.js");
require("../content.js");
require("../explain.js");

const R = global.ReaderExplain;
const chunks = global.RAG_DATA.chunks;
const chapters = global.READER_DOC.chapters;
const html = chapters.map((c) => c.html).join("\n");
const retriever = R.createRetriever(chunks);

function test(name, fn) {
  try {
    fn();
    console.log("ok  ", name);
  } catch (err) {
    console.error("FAIL", name);
    console.error(err && err.stack ? err.stack : err);
    process.exitCode = 1;
  }
}

test("RAG chunks are present and addressable", () => {
  assert.ok(chunks.length >= 50, "expected at least 50 chunks");
  for (const c of chunks.slice(0, 10)) {
    assert.ok(c.id && c.section && c.anchor && c.text);
  }
});

test("DOC is split into major chapters", () => {
  assert.ok(Array.isArray(chapters) && chapters.length >= 5);
  assert.ok(chapters.every((c) => c.id && c.title && c.html));
  console.log("     chapters:", chapters.length);
});

test("every chunk anchor exists in the generated HTML", () => {
  const ids = new Set(
    Array.from(html.matchAll(/id="([^"]+)"/g), (m) => m[1])
  );
  const missing = chunks.filter((c) => !ids.has(c.anchor));
  assert.strictEqual(missing.length, 0, "missing anchors: " + missing.map((c) => c.anchor).join(", "));
});

test("retrieval: 反模型", () => {
  const top = retriever.search("反模型", 3);
  assert.ok(top.length > 0);
  const text = top.map((r) => r.chunk.section + "\n" + r.chunk.text).join("\n");
  assert.ok(text.includes("反模型"), "top results should mention 反模型");
  console.log("     top:", top[0].chunk.section, "score", top[0].score.toFixed(2));
});

test("retrieval: 完全性", () => {
  const top = retriever.search("完全性", 3);
  assert.ok(top.length > 0);
  const text = top.map((r) => r.chunk.section + "\n" + r.chunk.text).join("\n");
  assert.ok(text.includes("完全性"));
  console.log("     top:", top[0].chunk.section, "score", top[0].score.toFixed(2));
});

test("retrieval: exact formula", () => {
  const top = retriever.search("□p → p", 3);
  assert.ok(top.length > 0);
  const text = top.map((r) => r.chunk.text).join("\n");
  assert.ok(text.includes("□p → p"));
  console.log("     top:", top[0].chunk.section, "score", top[0].score.toFixed(2));
});

test("chat completions URL normalization", () => {
  assert.strictEqual(
    R.chatCompletionsUrl("https://api.openai.com/v1"),
    "https://api.openai.com/v1/chat/completions"
  );
  assert.strictEqual(
    R.chatCompletionsUrl("https://example.test/chat/completions"),
    "https://example.test/chat/completions"
  );
  assert.strictEqual(
    R.chatCompletionsUrl("https://api.deepseek.com/"),
    "https://api.deepseek.com/chat/completions"
  );
});

test("local answer has points and sources", () => {
  const results = retriever.search("反模型", 4);
  const ans = R.answer("反模型", results);
  assert.ok(ans.points.length > 0, "expected points");
  assert.ok(ans.sources.length > 0, "expected sources");
  assert.ok(ans.summary.includes("反模型") || ans.summary.length > 0);
  console.log("     answer:", ans.points[0].text.slice(0, 80));
});

test("local answer for 完全性", () => {
  const ans = R.answer("完全性", retriever.search("完全性", 4));
  assert.ok(ans.points.length > 0);
  console.log("     answer:", ans.points[0].text.slice(0, 80));
});

if (!process.exitCode) {
  console.log("\nall RAG tests passed");
}
