// Structural checks for the v1.5 content upgrade.
// These are intentionally cheap: they catch accidental heading drift,
// missing teaching-loop sections, and stale exercise/RAG counts.
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const root = path.resolve(__dirname, "..", "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const lectures = [
  ["第一讲", "course/lectures/01-language.md"],
  ["第二讲", "course/lectures/02-semantics.md"],
  ["第三讲", "course/lectures/03-systems.md"],
  ["第四讲", "course/lectures/04-correspondence.md"],
  ["第五讲", "course/lectures/05-tableaux.md"],
  ["第六讲", "course/lectures/06-applications.md"],
];

const required = [
  "**本讲导入。**",
  "**先修回顾。**",
  "**本讲在课程中的位置。**",
  "**迁移检验。**",
];

for (const [name, file] of lectures) {
  const text = read(file);
  for (const marker of required) {
    assert.ok(text.includes(marker), `${file}: missing ${marker}`);
  }
  assert.ok(/## 学习目标/.test(text), `${file}: missing 学习目标`);
  assert.ok((text.match(/^\*\*常见错误诊断。|^\*\*常见误解。/gm) || []).length >= 1,
    `${file}: missing misconception/diagnosis block`);
  assert.ok((text.match(/^\*\*应用与边界。/gm) || []).length >= 1,
    `${file}: missing application/limits block`);
  assert.ok(/## .*本讲要点/.test(text), `${file}: missing 本讲要点`);
  assert.ok(/## .*练习/.test(text), `${file}: missing 练习`);
  assert.ok(/拆解/.test(text), `${file}: missing definition breakdown`);
  console.log("ok   v1.5 loop:", name);
}

const map = read("course/curriculum-map.md");
for (const phrase of [
  "对象与不面向谁", "先修与诊断", "四个核心问题", "六讲依赖图", "六讲地图",
  "范围边界", "顺序理由", "三条学习路径", "评估映射", "出口能力", "交互资产", "维护规则",
]) {
  assert.ok(map.includes(phrase), `curriculum map missing: ${phrase}`);
}
console.log("ok   curriculum map sections");

const index = read("course/exercise-index.md");
const rows = index.split(/\r?\n/).filter((line) => /^\|\s*\d\.\d+\s*\|/.test(line));
assert.strictEqual(rows.length, 42, `exercise index rows: ${rows.length}`);
for (const row of rows) {
  const cols = row.split("|").slice(1, -1).map((s) => s.trim());
  assert.strictEqual(cols.length, 5, `bad index row: ${row}`);
  assert.ok(cols[1] && cols[2] && /基础|中等|较难|进阶/.test(cols[3]) && cols[4], `incomplete row: ${row}`);
}
console.log(`ok   exercise index: ${rows.length} rows`);

const solutions = read("course/solutions.md");
assert.strictEqual((solutions.match(/\*\*本组常见错因。\*\*/g) || []).length, 6,
  "solutions should have six error-diagnosis sections");

const stats = JSON.parse(read("reader/rag/stats.json"));
assert.strictEqual(stats.headings, 96);
assert.strictEqual(stats.chapters, 9);
assert.ok(stats.chunks >= 120, `chunks: ${stats.chunks}`);
assert.ok(stats.chars >= 100000, `chars: ${stats.chars}`);
console.log(`ok   build stats: ${stats.chapters} chapters / ${stats.headings} headings / ${stats.chunks} chunks / ${stats.chars} chars`);

const html = read("reader/content.html");
assert.strictEqual((html.match(/<section class="standalone-chapter"/g) || []).length, 9,
  "content.html should contain 9 chapter sections");
assert.ok(html.includes('id="sec-23"'), "content.html should keep sec-23 anchor");
assert.ok(!html.includes("**"), "content.html should not leak raw bold markers");
assert.ok(!html.includes("`"), "content.html should not leak raw inline-code markers");

for (const asset of ["reader/deep-dive.html", "reader/lab/index.html", "reader/map.html"]) {
  assert.ok(fs.existsSync(path.join(root, asset)), `missing asset: ${asset}`);
}
console.log("ok   generated anchors and interactive assets");

console.log("\ncontent v1.5 tests passed");
