/*
 * Standalone content page smoke test.
 * Run: node tests/ui_content_page.js
 */
const { spawn } = require("child_process");
const { pathToFileURL } = require("url");
const fs = require("fs");
const path = require("path");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9340;
const PROFILE = path.join(__dirname, ".chrome-profile-content");
const URL = pathToFileURL(path.join(__dirname, "..", "content.html")).toString();

const chrome = spawn(CHROME, [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
  "--window-size=1400,1000", URL,
], { stdio: "ignore" });

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

(async () => {
  const ws = new WebSocket(await getWsUrl());
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve);
    ws.addEventListener("error", reject);
  });
  const send = cdp(ws);
  await send("Runtime.enable");

  for (let i = 0; i < 60; i++) {
    if ((await evalJs(send, "document.querySelectorAll('.standalone-chapter').length")) >= 9) break;
    await sleep(100);
  }

  const stats = await evalJs(
    send,
    `({
      chapters: document.querySelectorAll('.standalone-chapter').length,
      h1: document.querySelectorAll('.standalone-chapter h1').length,
      miniTocs: document.querySelectorAll('.chapter-mini-toc').length,
      options: document.querySelectorAll('#chapter-jump option').length
    })`
  );
  if (stats.chapters !== 9 || stats.h1 !== 9 || stats.miniTocs !== 9 || stats.options !== 9) {
    throw new Error("standalone content structure failed: " + JSON.stringify(stats));
  }
  console.log("ok   standalone chapters:", stats.chapters, "| mini TOCs:", stats.miniTocs);

  const shot = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(
    path.join(__dirname, "..", "screenshot-content.png"),
    Buffer.from(shot.data, "base64")
  );
  console.log("ok   screenshot-content.png");

  const firstMini = await evalJs(
    send,
    `(() => {
      const link = document.querySelector('.chapter-mini-toc a');
      if (!link) return null;
      link.click();
      return { href: link.getAttribute('href'), hash: location.hash };
    })()`
  );
  if (!firstMini || !firstMini.hash || firstMini.hash !== firstMini.href) {
    throw new Error("mini TOC anchor navigation failed: " + JSON.stringify(firstMini));
  }
  console.log("ok   mini TOC anchor:", firstMini.hash);

  await evalJs(
    send,
    `(() => {
      const select = document.getElementById('chapter-jump');
      select.value = select.options[2].value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    })()`
  );
  await sleep(300);
  const jumpHash = await evalJs(send, "location.hash");
  if (!jumpHash) throw new Error("chapter jump did not update hash");
  console.log("ok   chapter jump:", jumpHash);

  console.log("\nstandalone content page tests passed");
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
