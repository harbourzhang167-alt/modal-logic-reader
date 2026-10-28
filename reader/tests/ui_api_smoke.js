/*
 * API-mode UI smoke test. Requires:
 *   python reader/tests/mock_api.py                 (port 8012)
 *   READER_API_BASE=http://127.0.0.1:8012/v1 \
 *   READER_API_KEY=test READER_MODEL=mock \
 *   python reader/serve.py --port 8013
 *
 * Run: node tests/ui_api_smoke.js
 */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9335;
const PROFILE = path.join(__dirname, ".chrome-profile-api");
const URL = "http://127.0.0.1:8013/";

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

async function waitReady(send) {
  for (let i = 0; i < 60; i++) {
    const ready = await evalJs(
      send,
      "document.readyState === 'complete' && typeof ReaderExplain !== 'undefined' && document.querySelectorAll('#toc a').length > 0"
    );
    if (ready) return;
    await sleep(100);
  }
  throw new Error("reader did not become ready");
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
  await waitReady(send);

  await evalJs(
    send,
    `localStorage.setItem('modal-reader.settings.v1', JSON.stringify({mode:'api', endpoint:'/api/explain', model:'mock'})); location.reload();`
  );
  await sleep(600);
  await waitReady(send);

  const badge = await evalJs(send, "document.getElementById('mode-badge').textContent");
  if (badge !== "API") throw new Error("mode badge is not API: " + badge);
  console.log("ok   mode badge:", badge);

  await evalJs(
    send,
    `(() => {
      const p = [...document.querySelectorAll('#doc p, #doc li')].find((el) =>
        el.textContent.includes('反模型是证明'));
      p.scrollIntoView({ block: 'center', behavior: 'instant' });
      const range = document.createRange();
      range.selectNodeContents(p);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      document.getElementById('doc').dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      return true;
    })()`
  );
  await sleep(150);
  await evalJs(send, "document.getElementById('explain-selection-btn').click()");
  await sleep(800);

  const answer = await evalJs(send, "document.getElementById('explain-answer').textContent");
  if (!answer.includes("MOCK ANSWER")) throw new Error("API answer not shown: " + answer);
  const mode = await evalJs(send, "document.getElementById('explain-mode').textContent");
  console.log("ok   API answer:", answer.replace(/\s+/g, " ").slice(0, 100));
  console.log("ok   panel mode:", mode);

  const shot = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(
    path.join(__dirname, "..", "screenshot-api.png"),
    Buffer.from(shot.data, "base64")
  );
  console.log("ok   screenshot-api.png");

  console.log("\nall API-mode UI smoke tests passed");
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
