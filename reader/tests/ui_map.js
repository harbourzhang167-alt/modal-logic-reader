/*
 * Knowledge map smoke test.
 * Run: node tests/ui_map.js
 */
const { spawn } = require("child_process");
const { pathToFileURL } = require("url");
const fs = require("fs");
const path = require("path");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9348;
const PROFILE = path.join(__dirname, ".chrome-profile-map");
const URL = pathToFileURL(path.join(__dirname, "..", "map.html")).toString();

const chrome = spawn(CHROME, [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
  "--window-size=1500,1100", URL,
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getWsUrl() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
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
    if ((await evalJs(send, "document.querySelectorAll('#map-canvas .map-node').length")) >= 14) break;
    await sleep(100);
  }

  const state = await evalJs(
    send,
    `({
      nodes: document.querySelectorAll('#map-canvas .map-node').length,
      edges: document.querySelectorAll('#map-canvas .map-edge').length,
      pathCards: document.querySelectorAll('.path-card').length,
      links: document.querySelectorAll('.link-card').length,
      hasDeep: !!document.querySelector('a[href="deep-dive.html#axioms"]'),
      hasLab: !!document.querySelector('a[href="lab/index.html"]'),
      hasQuiz: !!document.querySelector('a[href="deep-dive.html#quiz"]')
    })`
  );
  if (state.nodes !== 14 || state.edges < 15 || state.pathCards !== 4 || !state.hasDeep || !state.hasLab || !state.hasQuiz) {
    throw new Error("knowledge map structure failed: " + JSON.stringify(state));
  }
  console.log("ok   knowledge map:", state.nodes, "nodes,", state.edges, "edges,", state.pathCards, "path cards");

  const shot = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(
    path.join(__dirname, "..", "screenshot-map.png"),
    Buffer.from(shot.data, "base64")
  );
  console.log("ok   screenshot-map.png");

  console.log("\nknowledge map tests passed");
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
