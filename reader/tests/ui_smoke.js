/*
 * Headless UI smoke test for the reader (Windows, local Chrome).
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
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
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

(async () => {
  const wsUrl = await getWsUrl();
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve);
    ws.addEventListener("error", reject);
  });
  const send = cdp(ws);
  await send("Runtime.enable");

  for (let i = 0; i < 60; i++) {
    const ready = await evalJs(
      send,
      "document.readyState === 'complete' && typeof ReaderExplain !== 'undefined' && document.querySelectorAll('#toc a').length > 0"
    );
    if (ready) break;
    await sleep(100);
  }

  const tocLinks = await evalJs(send, "document.querySelectorAll('#toc a').length");
  const headingCount = await evalJs(send, "document.querySelectorAll('#doc h1,#doc h2,#doc h3').length");
  if (tocLinks < 10) throw new Error("TOC was not built: " + tocLinks);
  if (tocLinks !== headingCount) throw new Error(`TOC mismatch: ${tocLinks} vs ${headingCount}`);
  console.log("ok   TOC:", tocLinks, "links");

  const meta = await evalJs(send, "document.getElementById('doc-meta').textContent");
  if (!meta.includes("RAG")) throw new Error("meta missing RAG stats: " + meta);
  console.log("ok   meta:", meta.trim());

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

  // screenshot with panel open
  const shot = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(
    path.join(__dirname, "..", "screenshot-panel.png"),
    Buffer.from(shot.data, "base64")
  );
  console.log("ok   screenshot-panel.png");

  await evalJs(send, "document.getElementById('explain-close').click()");

  // TOC filter
  const filtered = await evalJs(
    send,
    `(() => {
      const input = document.getElementById('toc-search');
      input.value = '完全性';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return [...document.querySelectorAll('#toc li:not(.hidden) > a')].map(a => a.textContent);
    })()`
  );
  if (!filtered.length || !filtered.some((t) => t.includes("完全性"))) {
    throw new Error("TOC filter failed: " + JSON.stringify(filtered));
  }
  console.log("ok   TOC filter:", filtered.length, "visible");
  await evalJs(
    send,
    `(() => {
      const input = document.getElementById('toc-search');
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`
  );

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
