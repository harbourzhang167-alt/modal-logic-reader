/*
 * explain.js -- local RAG (BM25 + extractive answer) and API helpers.
 *
 * UMD: window.ReaderExplain in the browser, module.exports in Node.
 */
(function (global) {
  "use strict";

  const STOP = new Set(
    (
      "的 了 和 是 在 与 及 或 而 被 把 让 使 对 从 到 为 等 中 上 下 里 就 也 都 有 " +
      "没有 一个 一种 我们 你 我 他 她 它 这 那 什么 如何 为什么 可以 能够 如果 那么 " +
      "因为 所以 但是 不是 以及 进行 通过 使用 这个 其中 这些 那些 其 之 者 所 则 即 " +
      "例如 比如 注意 定义 表示 称 读作 如下 以下 上面 下面 这里 那里 就是 还是 已经 " +
      "需要 应该 不能 不会 不是 只是 这样 那样"
    ).split(/\s+/)
  );

  const CJK_RE = /[\u4e00-\u9fff]/;

  function normalize(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function tokenize(text) {
    const s = normalize(text);
    const out = [];

    for (const word of s.match(/[a-z0-9_]+/g) || []) out.push(word);

    const chars = Array.from(s).filter((ch) => CJK_RE.test(ch));
    for (let i = 0; i < chars.length; i += 1) {
      out.push(chars[i]);
      if (i + 1 < chars.length) out.push(chars[i] + chars[i + 1]);
    }

    for (const sym of s.match(/[□◇→∧∨¬↔⊨⊢∈⊆∀∃]/g) || []) out.push(sym);

    return out.filter((t) => t && !STOP.has(t));
  }

  function splitSentences(text) {
    return String(text || "")
      .replace(/\r/g, "")
      .replace(/([。！？；!?;])/g, "$1\n")
      .split(/\n+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 6);
  }

  function createRetriever(chunks) {
    const docs = (chunks || []).map((chunk, index) => {
      const text = `${chunk.section || ""}\n${chunk.text || ""}`;
      const tokens = tokenize(text);
      const tf = new Map();
      for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
      return {
        chunk,
        index,
        tf,
        len: tokens.length,
        norm: normalize(text).replace(/\s+/g, ""),
      };
    });

    const df = new Map();
    for (const doc of docs) {
      for (const term of doc.tf.keys()) {
        df.set(term, (df.get(term) || 0) + 1);
      }
    }

    const N = docs.length || 1;
    const avgLen = docs.reduce((a, d) => a + d.len, 0) / N || 1;
    const k1 = 1.5;
    const b = 0.75;

    function search(query, topK) {
      topK = topK || 5;
      const qTokens = tokenize(query);
      const qSet = Array.from(new Set(qTokens));
      const exact = normalize(query).replace(/\s+/g, "");

      const scored = docs
        .map((doc) => {
          let score = 0;
          for (const term of qSet) {
            const f = doc.tf.get(term) || 0;
            if (!f) continue;
            const n = df.get(term) || 1;
            const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
            score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * doc.len) / avgLen)));
          }
          if (exact.length >= 2 && doc.norm.includes(exact)) score += 4;
          if (
            exact.length >= 2 &&
            normalize(doc.chunk.section).replace(/\s+/g, "").includes(exact)
          ) {
            score += 2;
          }
          return { chunk: doc.chunk, index: doc.index, score };
        })
        .filter((x) => x.score > 0)
        .sort((a, b2) => b2.score - a.score);

      return scored.slice(0, topK);
    }

    return { search, docs, size: docs.length };
  }

  function overlapScore(sentence, qSet) {
    const st = new Set(tokenize(sentence));
    let n = 0;
    for (const q of qSet) if (st.has(q)) n += 1;
    return n;
  }

  function answer(query, results) {
    const qSet = new Set(tokenize(query));
    const exact = normalize(query);
    const candidates = [];

    (results || []).forEach((result, rank) => {
      const sentences = splitSentences(result.chunk.text);
      sentences.forEach((sentence, pos) => {
        if (sentence.length > 260) return;
        let score = overlapScore(sentence, qSet);
        const isEcho = exact.length >= 8 && normalize(sentence) === exact;
        if (exact.length >= 2 && normalize(sentence).includes(exact)) score += 6;
        if (normalize(sentence).startsWith(exact) && exact.length >= 2) score += 2;
        if (isEcho) score -= 8;
        if (sentence.length < 14) score -= 1.2;
        score += Math.min(1.2, sentence.length / 100);
        score += Math.max(0, 2 - rank) * 0.5;
        score += Math.max(0, 1 - pos / 20) * 0.3;
        if (score > 0) {
          candidates.push({
            text: sentence,
            source: rank + 1,
            section: result.chunk.section,
            score,
            echo: isEcho,
          });
        }
      });
    });

    candidates.sort((a, b) => b.score - a.score);

    const picked = [];
    const seen = new Set();

    function take(candidate) {
      const key = normalize(candidate.text).slice(0, 32);
      if (seen.has(key)) return false;
      seen.add(key);
      picked.push(candidate);
      return true;
    }

    // Prefer explanations that do not simply repeat the selected sentence.
    for (const c of candidates) {
      if (c.echo) continue;
      if (take(c) && picked.length >= 3) break;
    }
    if (picked.length < 3) {
      for (const c of candidates) {
        if (!c.echo) continue;
        if (take(c) && picked.length >= 3) break;
      }
    }

    if (picked.length === 0 && results && results.length > 0) {
      for (const sentence of splitSentences(results[0].chunk.text).slice(0, 2)) {
        picked.push({
          text: sentence,
          source: 1,
          section: results[0].chunk.section,
          score: 0,
        });
      }
    }

    const topSection = results && results.length ? results[0].chunk.section : "";
    const summary = topSection
      ? `讲义中与「${query.length > 36 ? query.slice(0, 35) + "…" : query}」最相关的章节是「${topSection}」。`
      : "讲义中没有找到直接相关的段落。";

    return {
      query,
      summary,
      points: picked,
      sources: (results || []).slice(0, 3).map((r, i) => ({
        index: i + 1,
        section: r.chunk.section,
        anchor: r.chunk.anchor,
        excerpt: String(r.chunk.text).replace(/\s+/g, " ").slice(0, 180),
        score: r.score,
      })),
    };
  }

  function buildMessages(selection, heading, results) {
    const context = (results || [])
      .slice(0, 4)
      .map((r, i) => `[${i + 1}] ${r.chunk.section}\n${r.chunk.text}`)
      .join("\n\n");

    return [
      {
        role: "system",
        content:
          "你是模态逻辑课程助教。请只根据提供的讲义片段解释用户选中的词或句子。" +
          "先用一句话概括，再给 2-4 点解释，最后用 [1][2] 标明依据的片段编号。" +
          "如果讲义没有覆盖，请明确说“讲义未覆盖”，不要编造。回答用中文。",
      },
      {
        role: "user",
        content:
          `选中的内容：${selection}\n\n` +
          `所在章节：${heading || "未知"}\n\n` +
          `讲义片段：\n${context || "（无）"}\n\n` +
          "请解释这段内容。",
      },
    ];
  }

  async function parseError(response) {
    let detail = "";
    try {
      const data = await response.json();
      detail = data.error || data.message || JSON.stringify(data);
    } catch (_) {
      try {
        detail = await response.text();
      } catch (_) {
        detail = "";
      }
    }
    return `HTTP ${response.status}${detail ? `：${String(detail).slice(0, 240)}` : ""}`;
  }

  async function requestJson(url, options, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs || 45000);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      if (!response.ok) throw new Error(await parseError(response));
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Call the local reader proxy: POST {selection, heading, context}.
   * The proxy owns the API key and calls an OpenAI-compatible backend.
   */
  async function callProxy(endpoint, payload) {
    const data = await requestJson(
      endpoint,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
      60000
    );
    if (!data || !data.answer) throw new Error("代理没有返回 answer");
    return data.answer;
  }

  /**
   * Normalize a base URL or a full chat completions URL.
   */
  function chatCompletionsUrl(baseUrl) {
    const url = String(baseUrl || "").trim().replace(/\/+$/, "");
    if (!url) throw new Error("未填写 API 地址");
    if (/\/chat\/completions$/i.test(url)) return url;
    return url + "/chat/completions";
  }

  function isNetworkError(err) {
    return (
      err instanceof TypeError ||
      /failed to fetch|networkerror|load failed|network request failed/i.test(
        String(err && err.message ? err.message : err)
      )
    );
  }

  /**
   * Call an OpenAI-compatible endpoint directly from the browser.
   * Note: many providers block browser CORS; a local/remote proxy is safer.
   */
  async function callOpenAI(baseUrl, apiKey, model, payload) {
    const messages = buildMessages(payload.selection, payload.heading, payload.results);
    const url = chatCompletionsUrl(baseUrl);
    const headers = { "Content-Type": "application/json" };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    let data;
    try {
      data = await requestJson(
        url,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            model: model || "gpt-4o-mini",
            messages,
            temperature: 0.2,
          }),
        },
        60000
      );
    } catch (err) {
      if (err && err.name === "AbortError") {
        throw new Error("API 请求超时（60 秒）。");
      }
      if (isNetworkError(err)) {
        throw new Error(
          "浏览器直连失败（可能是 CORS 或网络限制）。" +
            "请改用“代理”模式，或使用允许浏览器跨域的网关。原始错误：" +
            (err && err.message ? err.message : err)
        );
      }
      throw err;
    }

    const content =
      data &&
      data.choices &&
      data.choices[0] &&
      data.choices[0].message &&
      data.choices[0].message.content;
    if (!content) throw new Error("API 返回中没有 choices[0].message.content");
    return content;
  }

  /**
   * Tiny request used by the settings dialog to verify endpoint/key/model.
   */
  async function testConnection(baseUrl, apiKey, model) {
    const url = chatCompletionsUrl(baseUrl);
    const headers = { "Content-Type": "application/json" };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    let data;
    try {
      data = await requestJson(
        url,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            model: model || "gpt-4o-mini",
            messages: [{ role: "user", content: "只回复 OK" }],
            temperature: 0,
          }),
        },
        30000
      );
    } catch (err) {
      if (isNetworkError(err)) {
        throw new Error(
          "连接失败（可能是 CORS/网络）。可改用代理模式，或使用支持浏览器跨域的网关。"
        );
      }
      throw err;
    }

    const content =
      data &&
      data.choices &&
      data.choices[0] &&
      data.choices[0].message &&
      data.choices[0].message.content;
    if (!content) throw new Error("接口可达，但返回中没有 choices[0].message.content");
    return content.trim().slice(0, 80) || "OK";
  }

  const api = {
    tokenize,
    normalize,
    splitSentences,
    createRetriever,
    answer,
    buildMessages,
    chatCompletionsUrl,
    callProxy,
    callOpenAI,
    testConnection,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.ReaderExplain = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
