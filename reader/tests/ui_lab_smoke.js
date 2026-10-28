/*
 * Kripke lab UI smoke test (Windows, local Chrome).
 * Run: node tests/ui_smoke.js
 */
const { spawn } = require("child_process");
const { pathToFileURL } = require("url");
const path = require("path");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9346;
const PROFILE = path.join(__dirname, ".chrome-profile-lab");
const URL = pathToFileURL(path.join(__dirname, "..", "lab", "index.html")).toString();

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
    "--window-size=1440,1000",
    URL,
  ],
  { stdio: "ignore" }
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getWsUrl() {
  for (let i = 0; i < 50; i++) {
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
  if (res.exceptionDetails) {
    throw new Error(JSON.stringify(res.exceptionDetails));
  }
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

  for (let i = 0; i < 50; i++) {
    const ready = await evalJs(send, "typeof window.ModalCore !== 'undefined' && document.readyState === 'complete'");
    if (ready) break;
    await sleep(100);
  }

  const set = async (formula, logic) => {
    await evalJs(
      send,
      `(() => {
        document.getElementById("formula").value = ${JSON.stringify(formula)};
        document.getElementById("logic").value = ${JSON.stringify(logic)};
        document.getElementById("logic").dispatchEvent(new Event("change"));
        return true;
      })()`
    );
  };

  const clickFind = async () => {
    await evalJs(send, 'document.getElementById("find").click()');
    await sleep(450);
  };

  const status = async () => evalJs(send, 'document.getElementById("status").textContent');
  const nodeCount = async () => evalJs(send, 'document.querySelectorAll(".node").length');

  // 1. T fails in K: find countermodel
  await set("[]p -> p", "K");
  await clickFind();
  const s1 = await status();
  const n1 = await nodeCount();
  if (!s1.includes("找到反模型")) throw new Error("expected countermodel status, got: " + s1);
  if (n1 !== 1) throw new Error("expected 1-world countermodel, got " + n1);
  console.log("ok   countermodel for []p -> p in K:", s1);

  // 2. 4 fails in T: countermodel needs 3 worlds
  await set("[]p -> [][]p", "T");
  await clickFind();
  const s2 = await status();
  const n2 = await nodeCount();
  if (!s2.includes("找到反模型")) throw new Error("expected countermodel for 4 in T, got: " + s2);
  if (n2 < 3) throw new Error("expected >=3 worlds, got " + n2);
  console.log("ok   4 fails in T:", s2);

  // 3. T is valid in T: no countermodel up to 3
  await set("[]p -> p", "T");
  await clickFind();
  const s3 = await status();
  if (!s3.includes("没有找到")) throw new Error("expected no-countermodel status, got: " + s3);
  console.log("ok   T valid in T (bounded):", s3);

  // 4. formula evaluation and chips
  await set("[]p -> p", "K");
  await evalJs(send, 'document.getElementById("eval").click()');
  await sleep(150);
  const chips = await evalJs(send, 'document.querySelectorAll(".eval-chip").length');
  if (chips < 1) throw new Error("expected evaluation chips");
  console.log("ok   evaluation chips:", chips);

  // 5. frame properties rendered
  const props = await evalJs(send, 'document.querySelectorAll("#props .prop").length');
  if (props !== 5) throw new Error("expected 5 frame properties, got " + props);
  console.log("ok   frame properties:", props);

  // 6. add a world by dispatching a pointerdown on the SVG
  await evalJs(send, 'document.querySelector("[data-mode=add-world]").click()');
  await evalJs(
    send,
    `(() => {
      const svg = document.getElementById("canvas");
      const r = svg.getBoundingClientRect();
      const ev = new PointerEvent("pointerdown", {
        bubbles: true, clientX: r.left + r.width * 0.25, clientY: r.top + r.height * 0.7,
        pointerId: 1, pointerType: "mouse"
      });
      svg.dispatchEvent(ev);
      return true;
    })()`
  );
  await sleep(100);
  const n3 = await nodeCount();
  if (n3 < 2) throw new Error("expected a new world, got " + n3);
  console.log("ok   add world: nodes =", n3);

  console.log("\nall UI smoke tests passed");
  ws.close();
  chrome.kill();
  setTimeout(() => process.exit(0), 300);
})().catch(async (err) => {
  console.error("FAIL", err);
  try {
    chrome.kill();
  } catch (_) {}
  process.exit(1);
});
