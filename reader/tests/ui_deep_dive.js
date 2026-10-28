/*
 * Deep-dive page smoke test.
 * Run: node tests/ui_deep_dive.js
 */
const { spawn } = require("child_process");
const { pathToFileURL } = require("url");
const path = require("path");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9345;
const PROFILE = path.join(__dirname, ".chrome-profile-deep");
const URL = pathToFileURL(path.join(__dirname, "..", "deep-dive.html")).toString();

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
    const ready =
      (await evalJs(send, "document.querySelectorAll('.quiz-item').length")) >= 10 &&
      (await evalJs(send, "document.querySelectorAll('#model-canvas circle').length")) >= 3;
    if (ready) break;
    await sleep(100);
  }

  const structure = await evalJs(
    send,
    `({
      steps: document.querySelectorAll('.step-tab').length,
      worlds: document.querySelectorAll('#model-canvas circle').length,
      verdicts: document.querySelectorAll('.verdict-row').length,
      quizzes: document.querySelectorAll('.quiz-item').length,
      hasLab: !!document.querySelector('a[href="lab/index.html"]')
    })`
  );
  if (structure.steps !== 5 || structure.worlds !== 3 || structure.verdicts !== 4 || structure.quizzes !== 10 || !structure.hasLab) {
    throw new Error("deep-dive structure failed: " + JSON.stringify(structure));
  }
  console.log("ok   deep-dive structure:", structure.steps, "steps,", structure.quizzes, "quizzes");

  const formulaTree = await evalJs(
    send,
    `({
      cards: document.querySelectorAll('#formula-tree .ft-card').length,
      nodes: document.querySelectorAll('#formula-tree .ft-tree .ft-node').length,
      katex: !!document.querySelector('#formula-tree .katex')
    })`
  );
  if (formulaTree.cards !== 2 || formulaTree.nodes < 5 || !formulaTree.katex) {
    throw new Error("formula tree failed: " + JSON.stringify(formulaTree));
  }
  await evalJs(send, `(() => {
    const input = document.getElementById('ft-input');
    input.value = '[]p';
    document.getElementById('ft-render').click();
  })()`);
  const customTree = await evalJs(send, "document.querySelectorAll('#ft-custom-tree .ft-node').length");
  if (customTree !== 2) throw new Error("custom formula tree failed: " + customTree);
  console.log("ok   formula tree:", formulaTree.nodes, "nodes; custom:", customTree);

  await evalJs(send, "document.getElementById('formula-tree').scrollIntoView({block: 'start'})");
  await sleep(250);
  const treeShot = await send("Page.captureScreenshot", { format: "png" });
  require("fs").writeFileSync(
    path.join(__dirname, "..", "screenshot-formula-tree.png"),
    Buffer.from(treeShot.data, "base64")
  );
  console.log("ok   screenshot-formula-tree.png");

  await evalJs(send, "document.querySelectorAll('.step-tab')[4].click()");
  const stepText = await evalJs(send, "document.getElementById('step-panel').textContent");
  if (!stepText.includes("全称量词")) throw new Error("step 5 content failed");

  const initial = await evalJs(
    send,
    `({ p: document.getElementById('v-p').textContent, dia: document.getElementById('v-dia').textContent, box: document.getElementById('v-box').textContent, t: document.getElementById('v-t').textContent })`
  );
  if (initial.p !== "假" || initial.dia !== "真" || initial.box !== "假") {
    throw new Error("initial model verdicts failed: " + JSON.stringify(initial));
  }
  console.log("ok   initial verdicts:", JSON.stringify(initial));

  await evalJs(send, "document.getElementById('toggle-w2-p').click()");
  const changed = await evalJs(
    send,
    `({ box: document.getElementById('v-box').textContent, t: document.getElementById('v-t').textContent })`
  );
  if (changed.box !== "真" || changed.t !== "假") {
    throw new Error("toggle w2 valuation failed: " + JSON.stringify(changed));
  }
  console.log("ok   model toggle: box ->", changed.box, ", implication ->", changed.t);

  await evalJs(send, "document.getElementById('reset-model').click()");
  await evalJs(send, "document.getElementById('toggle-edge').click()");
  const edgeState = await evalJs(
    send,
    `({ box: document.getElementById('v-box').textContent, dia: document.getElementById('v-dia').textContent })`
  );
  if (edgeState.box !== "真" || edgeState.dia !== "真") {
    throw new Error("edge toggle failed: " + JSON.stringify(edgeState));
  }
  console.log("ok   edge toggle:", JSON.stringify(edgeState));

  await evalJs(send, "document.getElementById('counter-next').click()");
  await evalJs(send, "document.getElementById('counter-next').click()");
  const counter = await evalJs(send, "document.getElementById('counter-title').textContent");
  if (!counter.includes("第 3 步")) throw new Error("counter stepper failed: " + counter);
  console.log("ok   counter stepper:", counter);

  const quizResult = await evalJs(
    send,
    `(() => {
      const cards = [...document.querySelectorAll('.quiz-item')];
      cards.forEach((card) => {
        const correct = Number(card.dataset.correct);
        card.querySelectorAll('.quiz-option')[correct].click();
      });
      return [...document.querySelectorAll('.quiz-item')].map((card) => ({
        ok: card.querySelector('.quiz-feedback').classList.contains('ok'),
        text: card.querySelector('.quiz-feedback').textContent
      }));
    })()`
  );
  if (!quizResult.every((x) => x.ok && x.text.length > 5)) {
    throw new Error("quiz feedback failed: " + JSON.stringify(quizResult));
  }
  const diag = await evalJs(send, "document.getElementById('quiz-diagnostics').textContent");
  if (!diag.includes("知识点诊断") || !diag.includes("10/10")) {
    throw new Error("quiz diagnostics failed: " + diag);
  }
  console.log("ok   quiz feedback: 10 correct answers");
  console.log("ok   diagnostics:", diag.replace(/\s+/g, " ").trim().slice(0, 100));

  console.log("\ndeep-dive tests passed");
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
