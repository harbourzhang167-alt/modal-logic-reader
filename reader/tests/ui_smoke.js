/*
 * Headless UI smoke test for the chapter reader (Windows, local Chrome).
 * Run: node tests/ui_smoke.js
 */
const { spawn } = require("child_process");
const { pathToFileURL } = require("url");
const fs = require("fs");
const path = require("path");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9334;
const PROFILE = path.join(__dirname, ".chrome-profile");
const URL = pathToFileURL(path.join(__dirname, "..", "index.html")).toString();

const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--no-first-run",
    "--no-default-browser-check",
    "--hide-scrollbars",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`,
    "--window-size=1500,1000",
    URL,
  ],
  { stdio: "ignore" }
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getWsUrl() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      const page = list.find((x) => x.type === "page");
      if (page && page.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch (_) {}
    await sleep(200);
  }
  throw new Error("Chrome DevTools endpoint did not start");
}

function cdp(ws) {
  let nextId = 1;
  const pending = new Map();
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    }
  });
  return (method, params) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params: params || {} }));
    });
}

async function evalJs(send, expression) {
  const res = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails));
  return res.result.value;
}

async function waitReady(send) {
  for (let i = 0; i < 60; i++) {
    const ready = await evalJs(
      send,
      "document.readyState === 'complete' && typeof ReaderExplain !== 'undefined' && document.querySelectorAll('#chapter-select option').length > 0"
    );
    if (ready) return;
    await sleep(100);
  }
  throw new Error("reader did not become ready");
}

(async () => {
  const ws = new WebSocket(await getWsUrl());
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve);
    ws.addEventListener("error", reject);
  });
  const send = cdp(ws);
  await send("Runtime.enable");
  await waitReady(send);

  // reset persisted layout for a deterministic run
  await evalJs(send, "localStorage.removeItem('modal-reader.ui.v1'); location.reload();");
  await sleep(600);
  await waitReady(send);

  // chapter split
  const chapterCount = await evalJs(send, "document.querySelectorAll('#chapter-select option').length");
  const h1Count = await evalJs(send, "document.querySelectorAll('#doc h1').length");
  const tocLinks = await evalJs(send, "document.querySelectorAll('#toc a').length");
  if (chapterCount !== 9) throw new Error("expected 9 chapters, got " + chapterCount);
  if (h1Count !== 1) throw new Error("expected one H1 in the current chapter, got " + h1Count);
  if (tocLinks < chapterCount) throw new Error("TOC missing chapters: " + tocLinks);
  console.log("ok   chapters:", chapterCount, "| toc links:", tocLinks, "| h1 in view:", h1Count);

  const meta = await evalJs(send, "document.getElementById('doc-meta').textContent");
  if (!meta.includes("章") || !meta.includes("RAG")) throw new Error("meta missing stats: " + meta);
  console.log("ok   meta:", meta.trim());

  // switch to the second lecture by chapter selector
  const chapterTitle = await evalJs(
    send,
    `(() => {
      const option = [...document.querySelectorAll('#chapter-select option')]
        .find((o) => o.textContent.includes('第二讲'));
      const select = document.getElementById('chapter-select');
      select.value = option.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return option.textContent;
    })()`
  );
  await sleep(250);
  const currentH1 = await evalJs(send, "document.querySelector('#doc h1').textContent");
  if (!currentH1.includes("第二讲")) throw new Error("chapter switch failed: " + currentH1);
  console.log("ok   chapter switch:", chapterTitle);

  const standaloneHref = await evalJs(send, "document.getElementById('standalone-link').getAttribute('href')");
  if (!standaloneHref.includes("content.html#")) {
    throw new Error("standalone link missing: " + standaloneHref);
  }
  console.log("ok   standalone link:", standaloneHref);

  // select a paragraph containing 反模型
  const selected = await evalJs(
    send,
    `(() => {
      const p = [...document.querySelectorAll('#doc p, #doc li')].find((el) =>
        el.textContent.includes('反模型是证明'));
      if (!p) return null;
      p.scrollIntoView({ block: 'center', behavior: 'instant' });
      const range = document.createRange();
      range.selectNodeContents(p);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      document.getElementById('doc').dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      return p.textContent.slice(0, 60);
    })()`
  );
  if (!selected) throw new Error("selection paragraph not found");
  await sleep(250);

  const activeTOC = await evalJs(
    send,
    "(document.querySelector('#toc a.active') || {}).textContent || ''"
  );
  if (!activeTOC || activeTOC.startsWith("1.") || activeTOC.startsWith("第一讲")) {
    throw new Error("scrollspy did not update: " + activeTOC);
  }
  console.log("ok   active TOC:", activeTOC);

  const toolbarVisible = await evalJs(send, "!document.getElementById('selection-toolbar').hidden");
  if (!toolbarVisible) throw new Error("selection toolbar did not appear");
  console.log("ok   selection toolbar:", selected.trim());

  await evalJs(send, "document.getElementById('explain-selection-btn').click()");
  await sleep(350);

  const panelVisible = await evalJs(send, "!document.getElementById('explain-panel').hidden");
  if (!panelVisible) throw new Error("explain panel did not open");

  const answer = await evalJs(send, "document.getElementById('explain-answer').textContent");
  if (!answer || answer.length < 10) throw new Error("empty local answer");
  if (!answer.includes("反模型")) throw new Error("answer does not mention 反模型: " + answer.slice(0, 120));

  const sources = await evalJs(send, "document.querySelectorAll('#explain-sources .source-card').length");
  if (sources < 1) throw new Error("no source cards");
  console.log("ok   local answer:", answer.replace(/\s+/g, " ").slice(0, 90));
  console.log("ok   sources:", sources);

  // screenshot docked panel
  const shot = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(
    path.join(__dirname, "..", "screenshot-panel.png"),
    Buffer.from(shot.data, "base64")
  );
  console.log("ok   screenshot-panel.png");

  // docked panel width drag
  const panelWidthBefore = await evalJs(
    send,
    "getComputedStyle(document.documentElement).getPropertyValue('--panel-w').trim()"
  );
  await evalJs(
    send,
    `(() => {
      const handle = document.getElementById('panel-resizer');
      const rect = handle.getBoundingClientRect();
      handle.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true, clientX: rect.left + 2, clientY: 200, pointerId: 2
      }));
      window.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true, clientX: rect.left - 60, clientY: 200, pointerId: 2
      }));
      window.dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true, clientX: rect.left - 60, clientY: 200, pointerId: 2
      }));
    })()`
  );
  await sleep(100);
  const panelWidthAfter = await evalJs(
    send,
    "getComputedStyle(document.documentElement).getPropertyValue('--panel-w').trim()"
  );
  if (parseInt(panelWidthAfter, 10) <= parseInt(panelWidthBefore, 10)) {
    throw new Error(`panel resize failed: ${panelWidthBefore} -> ${panelWidthAfter}`);
  }
  console.log("ok   panel resize:", panelWidthBefore, "->", panelWidthAfter);

  // float toggle
  await evalJs(send, "document.getElementById('panel-float').click()");
  await sleep(100);
  const floating = await evalJs(
    send,
    "document.getElementById('explain-panel').classList.contains('floating')"
  );
  if (!floating) throw new Error("panel did not float");
  console.log("ok   panel float");

  const floatShot = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(
    path.join(__dirname, "..", "screenshot-float.png"),
    Buffer.from(floatShot.data, "base64")
  );
  console.log("ok   screenshot-float.png");

  // floating window resize + move
  const floatBefore = await evalJs(
    send,
    `(() => {
      const p = document.getElementById('explain-panel');
      return { width: parseFloat(p.style.width), height: parseFloat(p.style.height), left: parseFloat(p.style.left), top: parseFloat(p.style.top) };
    })()`
  );
  await evalJs(
    send,
    `(() => {
      const handle = document.getElementById('float-resizer');
      const rect = handle.getBoundingClientRect();
      handle.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true, clientX: rect.left + 4, clientY: rect.top + 4, pointerId: 3
      }));
      window.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true, clientX: rect.left + 54, clientY: rect.top + 44, pointerId: 3
      }));
      window.dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true, clientX: rect.left + 54, clientY: rect.top + 44, pointerId: 3
      }));
    })()`
  );
  await sleep(80);
  const floatResized = await evalJs(
    send,
    `(() => {
      const p = document.getElementById('explain-panel');
      return { width: parseFloat(p.style.width), height: parseFloat(p.style.height), left: parseFloat(p.style.left), top: parseFloat(p.style.top) };
    })()`
  );
  if (floatResized.width <= floatBefore.width || floatResized.height <= floatBefore.height) {
    throw new Error(`float resize failed: ${JSON.stringify(floatBefore)} -> ${JSON.stringify(floatResized)}`);
  }

  await evalJs(
    send,
    `(() => {
      const head = document.querySelector('.panel-head');
      const hr = head.getBoundingClientRect();
      head.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true, clientX: hr.left + 40, clientY: hr.top + 20, pointerId: 4
      }));
      window.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true, clientX: hr.left, clientY: hr.top, pointerId: 4
      }));
      window.dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true, clientX: hr.left, clientY: hr.top, pointerId: 4
      }));
    })()`
  );
  await sleep(80);
  const floatMoved = await evalJs(
    send,
    `(() => {
      const p = document.getElementById('explain-panel');
      return { width: parseFloat(p.style.width), height: parseFloat(p.style.height), left: parseFloat(p.style.left), top: parseFloat(p.style.top) };
    })()`
  );
  if (floatMoved.left >= floatResized.left || floatMoved.top >= floatResized.top) {
    throw new Error(`float move failed: ${JSON.stringify(floatResized)} -> ${JSON.stringify(floatMoved)}`);
  }
  console.log("ok   float resize + move");

  // pin toggle: outside click should keep the floating panel
  await evalJs(send, "document.getElementById('panel-pin').click()");
  await sleep(80);
  const pinned = await evalJs(
    send,
    "document.getElementById('panel-pin').getAttribute('aria-pressed')"
  );
  if (pinned !== "true") throw new Error("panel did not pin");
  await evalJs(
    send,
    "document.getElementById('doc').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));"
  );
  await sleep(80);
  const stillOpen = await evalJs(send, "!document.getElementById('explain-panel').hidden");
  if (!stillOpen) throw new Error("pinned panel closed on outside click");
  console.log("ok   panel pin keeps panel open");

  // unpin + outside click closes
  await evalJs(send, "document.getElementById('panel-pin').click()");
  await evalJs(
    send,
    "document.getElementById('doc').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));"
  );
  await sleep(80);
  const closed = await evalJs(send, "document.getElementById('explain-panel').hidden");
  if (!closed) throw new Error("unpinned panel did not close on outside click");
  console.log("ok   unpinned panel closes");

  // full-text search
  const searchInfo = await evalJs(
    send,
    `(() => {
      const input = document.getElementById('content-search');
      input.value = '完全性';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`
  );
  await sleep(250);
  const searchState = await evalJs(
    send,
    `({
      results: document.querySelectorAll('#search-results .search-result').length,
      tocHidden: document.getElementById('toc').hidden,
      resultsHidden: document.getElementById('search-results').hidden
    })`
  );
  if (!searchState.results || !searchState.tocHidden || searchState.resultsHidden) {
    throw new Error("content search failed: " + JSON.stringify(searchState));
  }
  console.log("ok   content search results:", searchState.results);

  await evalJs(send, "document.querySelector('#search-results .search-result').click()");
  await sleep(250);
  const searchHit = await evalJs(send, "document.getElementById('doc').textContent.includes('完全性')");
  if (!searchHit) throw new Error("search result did not navigate to matching content");
  console.log("ok   search result navigation");

  await evalJs(
    send,
    `(() => {
      const input = document.getElementById('content-search');
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`
  );
  await sleep(100);

  // TOC level toggle
  const levelState = await evalJs(
    send,
    `(() => {
      const box = document.querySelector('.toc-levels input[data-level="2"]');
      box.checked = false;
      box.dispatchEvent(new Event('change', { bubbles: true }));
      const hidden = [...document.querySelectorAll('#section-list li.level-2')]
        .every((li) => li.classList.contains('hidden'));
      box.checked = true;
      box.dispatchEvent(new Event('change', { bubbles: true }));
      return hidden;
    })()`
  );
  if (!levelState) throw new Error("TOC level toggle failed");
  console.log("ok   TOC level toggle");

  // sidebar width drag
  const widthBefore = await evalJs(
    send,
    "getComputedStyle(document.documentElement).getPropertyValue('--sidebar-w').trim()"
  );
  await evalJs(
    send,
    `(() => {
      const handle = document.getElementById('sidebar-resizer');
      const rect = handle.getBoundingClientRect();
      handle.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true, clientX: rect.left + 2, clientY: 200, pointerId: 1
      }));
      window.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true, clientX: rect.left + 62, clientY: 200, pointerId: 1
      }));
      window.dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true, clientX: rect.left + 62, clientY: 200, pointerId: 1
      }));
      return true;
    })()`
  );
  await sleep(100);
  const widthAfter = await evalJs(
    send,
    "getComputedStyle(document.documentElement).getPropertyValue('--sidebar-w').trim()"
  );
  if (parseInt(widthAfter, 10) <= parseInt(widthBefore, 10)) {
    throw new Error(`sidebar resize failed: ${widthBefore} -> ${widthAfter}`);
  }
  console.log("ok   sidebar resize:", widthBefore, "->", widthAfter);

  // settings modal
  await evalJs(send, "document.getElementById('settings-btn').click()");
  await sleep(100);
  const modalVisible = await evalJs(send, "!document.getElementById('settings-modal').hidden");
  if (!modalVisible) throw new Error("settings modal did not open");
  const apiState = await evalJs(
    send,
    `(() => {
      const direct = document.querySelector('input[name=mode][value=direct]');
      direct.checked = true;
      direct.dispatchEvent(new Event('change', { bubbles: true }));
      const directState = {
        apiHidden: document.getElementById('api-fields').hidden,
        directHidden: document.getElementById('direct-fields').hidden,
        proxyHidden: document.getElementById('proxy-fields').hidden,
        hasTestButton: !!document.getElementById('api-test'),
      };
      const proxy = document.querySelector('input[name=mode][value=proxy]');
      proxy.checked = true;
      proxy.dispatchEvent(new Event('change', { bubbles: true }));
      const proxyState = {
        apiHidden: document.getElementById('api-fields').hidden,
        directHidden: document.getElementById('direct-fields').hidden,
        proxyHidden: document.getElementById('proxy-fields').hidden,
      };
      return { directState, proxyState };
    })()`
  );
  if (
    apiState.directState.apiHidden ||
    apiState.directState.directHidden ||
    !apiState.directState.proxyHidden ||
    !apiState.directState.hasTestButton
  ) {
    throw new Error("direct API fields did not show: " + JSON.stringify(apiState));
  }
  if (
    apiState.proxyState.apiHidden ||
    !apiState.proxyState.directHidden ||
    apiState.proxyState.proxyHidden
  ) {
    throw new Error("proxy fields did not show: " + JSON.stringify(apiState));
  }
  await evalJs(send, "document.getElementById('settings-cancel').click()");
  console.log("ok   settings modal + direct/proxy fields");

  console.log("\nall reader UI smoke tests passed");
  ws.close();
  chrome.kill();
  setTimeout(() => process.exit(0), 300);
})().catch((err) => {
  console.error("FAIL", err);
  try {
    chrome.kill();
  } catch (_) {}
  process.exit(1);
});
