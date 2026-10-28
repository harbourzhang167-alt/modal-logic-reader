(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const NS = "http://www.w3.org/2000/svg";

  const steps = [
    {
      title: "先别急着写公式",
      body: `
        <p>设想门现在锁着。我们能不能说：“门必然锁着”？</p>
        <p>日常语言里的“必然”，通常不是指“此刻为真”，而是指
        <strong>在所有相关可能性中都为真</strong>。所以第一步不是写 □p，
        而是先问：相对于哪些“可能情况”来判断？</p>
        <ul>
          <li>如果只考虑当前情况，p 真就够了；</li>
          <li>如果还要考虑“钥匙忘带”“门锁故障”等可能情况，p 未必都真；</li>
          <li>Kripke 模型把这些“相关可能性”显式画成世界和箭头。</li>
        </ul>
        <p class="muted">这一步的目标：把“必然”从一个模糊的副词，变成一个可检查的量词。</p>
      `,
    },
    {
      title: "画一个最小的模型",
      body: `
        <p>取三个世界：w0 是当前世界，w1、w2 是 w0 认为可能的两个情况。</p>
        <ul>
          <li><b>W</b> = {w0, w1, w2}</li>
          <li><b>R</b> = {(w0,w1), (w0,w2)}：w0 能“看到”w1 和 w2</li>
          <li><b>V(p)</b> = {w1}：只有 w1 满足 p</li>
        </ul>
        <p>右侧就是这个模型。先不要算公式，先看清：从 w0 出发，箭头指向哪里？</p>
      `,
    },
    {
      title: "逐项求值：每一步检查哪个世界？",
      body: `
        <p>在 w0 上：</p>
        <ul>
          <li><span class="m">p</span> 假：w0 自己不在 V(p) 里；</li>
          <li><span class="m">◇p</span> 真：w0 可及 w1，而 w1 满足 p；至少一个；</li>
          <li><span class="m">□p</span> 假：w0 还可及 w2，而 w2 不满足 p；并非所有；</li>
          <li><span class="m">□p → p</span> 真：这里前件 □p 是假，蕴涵因此为真。
          但“当前模型里为真”不等于“T 在 K 中有效”；要找前件真、后件假的反例，
          请看下面的空框架。</li>
        </ul>
        <p>右侧表格会随模型实时更新。关键不是背结论，而是能指出
        “是哪一个可及世界让全称失败”。</p>
      `,
    },
    {
      title: "改变模型，观察结论如何变化",
      body: `
        <p>现在动手：</p>
        <ul>
          <li>点“切换 w2 的 p”：w2 也满足 p，□p 会变成真；但 w0 仍然不满足 p，
          所以 □p → p 仍然假；</li>
          <li>点“加/删 w0→w2”：只留下 w1 作为后继，□p 会变成真（因为所有剩余后继都满足 p）；</li>
          <li>直接点某个世界，可以切换该世界的 p；把 w0 也设为 p 真，再看 □p → p。</li>
        </ul>
        <p>这说明：同一个公式的真假，不只取决于“p 在 w0 真不真”，
        还取决于<strong>可及关系</strong>和<strong>其他世界的赋值</strong>。</p>
      `,
    },
    {
      title: "回到定义：为什么是“所有”和“至少一个”？",
      body: `
        <p>把上面的检查压缩成两条语义子句：</p>
        <ul>
          <li><span class="m">□p</span> 在 w 真 ⇔ 对所有 v，若 wRv，则 p 在 v 真；</li>
          <li><span class="m">◇p</span> 在 w 真 ⇔ 存在 v，使得 wRv 且 p 在 v 真。</li>
        </ul>
        <p>方框是“全称量词 + 箭头”，菱形是“存在量词 + 箭头”。
        它们不是两个神秘符号，而是把“所有可能情况”和“至少一种可能情况”形式化。</p>
        <p><b>边界：</b>如果 w 没有可及世界，□p 空真，◇p 假。
        这正是 K 中 □p → p 失败的原因，也是为什么加入自反性（T）后它才成立。</p>
      `,
    },
  ];

  let currentStep = 0;

  function renderStep(index) {
    currentStep = index;
    document.querySelectorAll(".step-tab").forEach((tab, i) => {
      tab.classList.toggle("active", i === index);
      tab.setAttribute("aria-selected", i === index ? "true" : "false");
    });
    const step = steps[index];
    $("step-panel").innerHTML = `<h3>${step.title}</h3>${step.body}`;
  }

  document.querySelectorAll(".step-tab").forEach((tab, index) => {
    tab.addEventListener("click", () => renderStep(index));
  });

  // ------------------------------------------------------------ main model

  const initialModel = {
    p: { w0: false, w1: true, w2: false },
    edges: [["w0", "w1"], ["w0", "w2"]],
  };
  let model = JSON.parse(JSON.stringify(initialModel));

  const positions = {
    w0: { x: 230, y: 205 },
    w1: { x: 100, y: 70 },
    w2: { x: 360, y: 70 },
  };

  const modelSvg = $("model-canvas");

  function addDefs(svg, markerId) {
    const defs = document.createElementNS(NS, "defs");
    const marker = document.createElementNS(NS, "marker");
    marker.setAttribute("id", markerId);
    marker.setAttribute("viewBox", "0 0 10 10");
    marker.setAttribute("refX", "9");
    marker.setAttribute("refY", "5");
    marker.setAttribute("markerWidth", "7");
    marker.setAttribute("markerHeight", "7");
    marker.setAttribute("orient", "auto-start-reverse");
    const path = document.createElementNS(NS, "path");
    path.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
    path.setAttribute("fill", "#6b7f99");
    marker.appendChild(path);
    defs.appendChild(marker);
    svg.appendChild(defs);
  }

  function edgeKey(a, b) {
    return `${a}->${b}`;
  }

  function hasEdge(a, b) {
    return model.edges.some(([x, y]) => x === a && y === b);
  }

  function successors(world) {
    return model.edges.filter(([x]) => x === world).map(([, y]) => y);
  }

  function circleEdgePoint(from, to, radius) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    return {
      x: from.x + (dx / len) * radius,
      y: from.y + (dy / len) * radius,
    };
  }

  function drawModel() {
    modelSvg.innerHTML = "";
    addDefs(modelSvg, "model-arrow");

    for (const [a, b] of model.edges) {
      const from = positions[a];
      const to = positions[b];
      const start = circleEdgePoint(from, to, 29);
      const end = circleEdgePoint(to, from, 29);
      const line = document.createElementNS(NS, "line");
      line.setAttribute("x1", start.x);
      line.setAttribute("y1", start.y);
      line.setAttribute("x2", end.x);
      line.setAttribute("y2", end.y);
      line.setAttribute("stroke", "#6b7f99");
      line.setAttribute("stroke-width", "2");
      line.setAttribute("marker-end", "url(#model-arrow)");
      modelSvg.appendChild(line);
    }

    for (const [id, pos] of Object.entries(positions)) {
      const group = document.createElementNS(NS, "g");
      group.setAttribute("data-world", id);
      group.style.cursor = "pointer";
      group.setAttribute("role", "button");
      group.setAttribute("aria-label", `${id}，点击切换 p`);

      const circle = document.createElementNS(NS, "circle");
      circle.setAttribute("cx", pos.x);
      circle.setAttribute("cy", pos.y);
      circle.setAttribute("r", "29");
      circle.setAttribute("fill", model.p[id] ? "#e5f7ee" : "#ffffff");
      circle.setAttribute("stroke", model.p[id] ? "#2e9b64" : "#8ca0b8");
      circle.setAttribute("stroke-width", "2");
      group.appendChild(circle);

      const label = document.createElementNS(NS, "text");
      label.setAttribute("x", pos.x);
      label.setAttribute("y", pos.y + 4);
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("font-family", "Microsoft YaHei, sans-serif");
      label.setAttribute("font-size", "13");
      label.setAttribute("font-weight", "700");
      label.setAttribute("fill", "#1f3864");
      label.textContent = id;
      group.appendChild(label);

      const value = document.createElementNS(NS, "text");
      value.setAttribute("x", pos.x);
      value.setAttribute("y", pos.y + 48);
      value.setAttribute("text-anchor", "middle");
      value.setAttribute("font-family", "Microsoft YaHei, sans-serif");
      value.setAttribute("font-size", "11");
      value.setAttribute("fill", model.p[id] ? "#1b7f4b" : "#9b5b55");
      value.textContent = `p: ${model.p[id] ? "真" : "假"}`;
      group.appendChild(value);

      group.addEventListener("click", () => {
        model.p[id] = !model.p[id];
        updateModel();
      });
      modelSvg.appendChild(group);
    }
  }

  function verdictRow(id, value, why) {
    const el = $(`v-${id}`);
    el.textContent = value ? "真" : "假";
    el.className = `v ${value ? "true" : "false"}`;
    $(`why-${id}`).textContent = why;
  }

  function updateModel() {
    drawModel();

    const succ = successors("w0");
    const succP = succ.filter((w) => model.p[w]);
    const boxTrue = succ.every((w) => model.p[w]);
    const diaTrue = succP.length > 0;
    const tTrue = !boxTrue || model.p.w0;

    verdictRow("p", model.p.w0, model.p.w0 ? "w0 本身满足 p。" : "w0 本身不满足 p。");

    verdictRow(
      "dia",
      diaTrue,
      diaTrue
        ? `w0 可及 ${succ.join("、")}；其中 ${succP.join("、")} 满足 p。至少一个即可。`
        : "w0 没有可及世界满足 p（若没有任何可及世界，则存在量化为假）。"
    );

    verdictRow(
      "box",
      boxTrue,
      boxTrue
        ? succ.length
          ? `w0 可及 ${succ.join("、")}，这些世界都满足 p。`
          : "w0 没有可及世界，□p 空真。"
        : `w0 可及 ${succ.join("、")}，但 ${succ.find((w) => !model.p[w])} 不满足 p；并非所有。`
    );

    verdictRow(
      "t",
      tTrue,
      !boxTrue
        ? "□p 为假，蕴涵前件假，所以整句为真；这并不说明 T 在 K 中成立。"
        : model.p.w0
        ? "□p 真且 p 在 w0 真，所以蕴涵真。"
        : "□p 真但 p 在 w0 假：前件真、后件假，所以蕴涵失败。"
    );

    const note = succ.length
      ? `当前 w0 有 ${succ.length} 个可及世界（${succ.join("、")}）。□p 要检查全部，◇p 只需至少一个。`
      : "当前 w0 没有可及世界：□p 空真，◇p 假。这是 T 在 K 中失败的关键模型。";
    $("model-note").textContent = note;
  }

  $("toggle-w2-p").addEventListener("click", () => {
    model.p.w2 = !model.p.w2;
    updateModel();
  });

  $("toggle-edge").addEventListener("click", () => {
    if (hasEdge("w0", "w2")) {
      model.edges = model.edges.filter(([a, b]) => !(a === "w0" && b === "w2"));
    } else {
      model.edges.push(["w0", "w2"]);
    }
    updateModel();
  });

  $("reset-model").addEventListener("click", () => {
    model = JSON.parse(JSON.stringify(initialModel));
    updateModel();
  });

  // --------------------------------------------------------- countermodel

  const counterSteps = [
    {
      title: "第 1 步：先看 p",
      text: "模型只有一个世界 w0，没有任何可及边；p 在 w0 为假。先确认后件 p 是假的。",
      highlight: "p",
    },
    {
      title: "第 2 步：算 □p",
      text: "□p 要求在 w0 的所有可及世界中 p 都为真。可是 w0 没有可及世界；全称量化在空集上为真，所以 □p 空真。",
      highlight: "box",
    },
    {
      title: "第 3 步：算 □p → p",
      text: "前件 □p 真，后件 p 假，所以 □p → p 在 w0 为假。因此 T 公理不是 K 的定理；要让它在所有自反框架上成立，必须额外加入自反性。",
      highlight: "t",
    },
  ];

  let counterIndex = 0;

  function drawCounterModel(highlight) {
    const svg = $("counter-canvas");
    svg.innerHTML = "";
    addDefs(svg, "counter-arrow");

    const pos = { x: 230, y: 150 };
    const group = document.createElementNS(NS, "g");

    const circle = document.createElementNS(NS, "circle");
    circle.setAttribute("cx", pos.x);
    circle.setAttribute("cy", pos.y);
    circle.setAttribute("r", "36");
    circle.setAttribute("fill", highlight === "p" ? "#fff8e8" : "#ffffff");
    circle.setAttribute("stroke", "#8ca0b8");
    circle.setAttribute("stroke-width", "2");
    group.appendChild(circle);

    const label = document.createElementNS(NS, "text");
    label.setAttribute("x", pos.x);
    label.setAttribute("y", pos.y + 4);
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("font-family", "Microsoft YaHei, sans-serif");
    label.setAttribute("font-size", "14");
    label.setAttribute("font-weight", "700");
    label.setAttribute("fill", "#1f3864");
    label.textContent = "w0";
    group.appendChild(label);

    const pText = document.createElementNS(NS, "text");
    pText.setAttribute("x", pos.x);
    pText.setAttribute("y", pos.y + 58);
    pText.setAttribute("text-anchor", "middle");
    pText.setAttribute("font-family", "Microsoft YaHei, sans-serif");
    pText.setAttribute("font-size", "12");
    pText.setAttribute("fill", "#9b5b55");
    pText.textContent = "p: 假";
    group.appendChild(pText);

    if (highlight === "box" || highlight === "t") {
      const badge = document.createElementNS(NS, "text");
      badge.setAttribute("x", pos.x + 86);
      badge.setAttribute("y", pos.y + 4);
      badge.setAttribute("text-anchor", "middle");
      badge.setAttribute("font-family", "Microsoft YaHei, sans-serif");
      badge.setAttribute("font-size", "12");
      badge.setAttribute("fill", "#1b7f4b");
      badge.textContent = "□p: 空真";
      group.appendChild(badge);
    }

    if (highlight === "t") {
      const fail = document.createElementNS(NS, "text");
      fail.setAttribute("x", pos.x + 86);
      fail.setAttribute("y", pos.y + 26);
      fail.setAttribute("text-anchor", "middle");
      fail.setAttribute("font-family", "Microsoft YaHei, sans-serif");
      fail.setAttribute("font-size", "12");
      fail.setAttribute("fill", "#b42318");
      fail.textContent = "□p→p: 假";
      group.appendChild(fail);
    }

    svg.appendChild(group);
  }

  function renderCounter() {
    const step = counterSteps[counterIndex];
    $("counter-title").textContent = step.title;
    $("counter-text").textContent = step.text;
    drawCounterModel(step.highlight);
    $("counter-progress").innerHTML = counterSteps
      .map((_, i) => `<span class="counter-dot${i <= counterIndex ? " on" : ""}"></span>`)
      .join("");
    $("counter-next").textContent = counterIndex === counterSteps.length - 1 ? "再看一遍" : "下一步";
  }

  $("counter-next").addEventListener("click", () => {
    counterIndex = (counterIndex + 1) % counterSteps.length;
    renderCounter();
  });
  $("counter-reset").addEventListener("click", () => {
    counterIndex = 0;
    renderCounter();
  });

  // ------------------------------------------------------------------ quiz

  const questions = [
    {
      tag: "语义",
      q: "设 w0 可及 w1、w2；p 在 w1 真、在 w2 假。下面哪一项正确？",
      options: [
        "□p 与 ◇p 都为真",
        "□p 为假，◇p 为真",
        "□p 为真，◇p 为假",
        "□p 与 ◇p 都为假",
      ],
      correct: 1,
      feedback: [
        "□p 要求所有可及世界都满足 p；w2 不满足，所以 □p 假。",
        "对：w2 让全称失败，w1 让存在成立。",
        "◇p 只要求至少一个；w1 已经满足，所以 ◇p 真。",
        "w1 满足 p，所以 ◇p 不是假。",
      ],
    },
    {
      tag: "证明规则",
      q: "从假设 p 推出 p，能否因此直接得到 □p？",
      options: [
        "能，NEC 对任何推导都适用",
        "不能，NEC 只对定理或无前提推导适用",
        "能，只要 p 是现实世界中的真命题",
        "不能，因为 □p 永远为假",
      ],
      correct: 1,
      feedback: [
        "NEC 的适用对象是定理；依赖假设的推导不能直接加方框。",
        "对：必然化规则只对定理使用，不能把假设变成必然。",
        "现实真不等于必然真；还要看所有可及世界。",
        "□p 当然可以为真，例如自反模型中的有效公式。",
      ],
    },
    {
      tag: "反模型",
      q: "设 W={w0}，R=∅，p 在 w0 为假。下面哪一项正确？",
      options: [
        "□p 假，因为 w0 不满足 p",
        "□p 真且 p 假，所以 □p→p 假",
        "□p 与 p 都假",
        "□p→p 真",
      ],
      correct: 1,
      feedback: [
        "□p 检查的是可及世界；w0 没有可及世界，全称为空真。",
        "对：空可及关系让 □p 空真，后件 p 假，蕴涵失败。",
        "□p 不是假；空集上的全称量化是真。",
        "前件真、后件假，蕴涵不可能是真。",
      ],
    },
    {
      tag: "T",
      q: "下列哪个模型能让 □p→p 在 K 中失败？",
      options: [
        "w0 有自反边，p 在 w0 假",
        "w0 没有可及世界，p 在 w0 假",
        "w0→w1，p 在 w0、w1 都真",
        "w0→w1，p 在 w0 假、w1 假",
      ],
      correct: 1,
      feedback: [
        "自反边让 w0 也进入 □p 的检查范围；p 假则 □p 假，蕴涵不为假。",
        "对：空可及关系让 □p 空真，而 p 假，于是蕴涵失败。",
        "□p 真、p 真，T 成立。",
        "w1 也假，□p 为假，蕴涵真；这不是 T 的反例。",
      ],
    },
    {
      tag: "4",
      q: "w0→w1→w2，缺少 w0→w2；p 在 w0、w1 真，在 w2 假。在 w0 上哪个公理失败？",
      options: ["T", "4", "D", "B"],
      correct: 1,
      feedback: [
        "T 在 w0 成立：□p 真（w0 只看 w1，w1 满足 p），且 p 在 w0 真。",
        "对：□p 在 w0 真，但 w1 上 □p 假（w1 看到 w2），所以 □□p 在 w0 假。",
        "D 在 w0 成立：w0 有后继，□p 真时也能找到 p。",
        "B 不是这里的关键；失败的是传递性对应的 4。",
      ],
    },
    {
      tag: "5",
      q: "w0 看到 w1、w2，但 w1 看不到 w2；p 只在 w1 真。在 w0 上哪个公理失败？",
      options: ["4", "5", "T", "D"],
      correct: 1,
      feedback: [
        "4 不要求 w0 的后继之间互相可及；这里的关键是 5。",
        "对：◇p 在 w0 真（看到 w1），但 w1 上 ◇p 假，所以 □◇p 在 w0 假。",
        "T 在 w0 成立：□p 为假，蕴涵真。",
        "D 在 w0 成立：w0 有后继。",
      ],
    },
    {
      tag: "B",
      q: "w0→w1，但 w1 看不到 w0；p 在 w0 真、在 w1 假。在 w0 上哪个公理失败？",
      options: ["T", "4", "B", "D"],
      correct: 2,
      feedback: [
        "T 不要求反向边；p 在 w0 真。",
        "4 不涉及反向边。",
        "对：p 在 w0 真，但 w1 上 ◇p 假，所以 □◇p 在 w0 假；关系不对称。",
        "D 只要求每个世界有后继；w0 有后继。",
      ],
    },
    {
      tag: "D",
      q: "W={w0}，R=∅，p 在 w0 真。哪个公理失败？",
      options: ["T", "D", "K", "4"],
      correct: 1,
      feedback: [
        "T 成立：□p 空真，p 在 w0 真。",
        "对：□p 空真，但 ◇p 假（没有可及世界），所以 □p→◇p 失败。",
        "K 在空关系下仍有效。",
        "4 在空关系下也成立。",
      ],
    },
    {
      tag: "系统比较",
      q: "下列系统包含关系哪项正确？",
      options: ["K ⊂ S4 ⊂ T", "K ⊂ T ⊂ S4 ⊂ S5", "S5 ⊂ S4", "T ⊂ K"],
      correct: 1,
      feedback: [
        "S4 比 T 强，不是 T 包含 S4。",
        "对：K 最弱；T 加自反；S4 再加传递；S5 再加欧几里得。",
        "S5 比 S4 强，方向反了。",
        "T 比 K 强，K 不包含 T。",
      ],
    },
    {
      tag: "系统比较",
      q: "S5 对应的框架条件是什么？",
      options: ["串行", "自反", "等价关系", "传递"],
      correct: 2,
      feedback: [
        "串行是 D 的条件。",
        "自反只是 T 的条件；S5 还要求传递和欧几里得。",
        "对：S5 的 R 是自反、传递、对称（等价）关系。",
        "传递只是 4 的条件，不充分。",
      ],
    },
  ];

  const answers = new Map();

  function renderDiagnostics() {
    const box = $("quiz-diagnostics");
    const tags = [...new Set(questions.map((q) => q.tag))];
    let answered = 0;
    let correct = 0;
    for (const value of answers.values()) {
      answered += 1;
      if (value) correct += 1;
    }

    const chips = tags
      .map((tag) => {
        const items = questions
          .map((q, i) => ({ q, i }))
          .filter(({ q }) => q.tag === tag);
        let done = 0;
        let ok = 0;
        for (const { i } of items) {
          if (answers.has(i)) {
            done += 1;
            if (answers.get(i)) ok += 1;
          }
        }
        const cls = done === 0 ? "empty" : ok === done ? "good" : ok > 0 ? "partial" : "";
        const text = done === 0 ? "未答" : `${ok}/${done}`;
        return `<span class="diag-chip ${cls}">${tag} · ${text}</span>`;
      })
      .join("");

    box.innerHTML =
      `<div class="diag-head"><b>知识点诊断</b><span>已答 ${answered}/${questions.length} · 正确 ${correct}</span></div>` +
      `<div class="diag-grid">${chips}</div>`;
  }

  function renderQuiz() {
    const wrap = $("quiz-list");
    wrap.innerHTML = "";
    questions.forEach((item, qi) => {
      const card = document.createElement("div");
      card.className = "quiz-item";
      card.dataset.tag = item.tag;
      card.dataset.correct = String(item.correct);
      card.innerHTML = `<p class="quiz-q"><span class="quiz-tag">${item.tag}</span><b>Q${qi + 1}.</b> ${item.q}</p>`;
      const options = document.createElement("div");
      options.className = "quiz-options";
      const feedback = document.createElement("div");
      feedback.className = "quiz-feedback";

      item.options.forEach((label, oi) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "quiz-option";
        button.textContent = `${String.fromCharCode(65 + oi)}. ${label}`;
        button.addEventListener("click", () => {
          options.querySelectorAll(".quiz-option").forEach((b) => {
            b.classList.remove("correct", "wrong");
          });
          const isCorrect = oi === item.correct;
          answers.set(qi, isCorrect);
          if (isCorrect) {
            button.classList.add("correct");
            feedback.className = "quiz-feedback show ok";
            feedback.textContent = `答对了。${item.feedback[oi]}`;
          } else {
            button.classList.add("wrong");
            options.querySelectorAll(".quiz-option")[item.correct].classList.add("correct");
            feedback.className = "quiz-feedback show bad";
            feedback.textContent = `再想想：${item.feedback[oi]}`;
          }
          renderDiagnostics();
        });
        options.appendChild(button);
      });

      card.appendChild(options);
      card.appendChild(feedback);
      wrap.appendChild(card);
    });
    renderDiagnostics();
  }

  $("quiz-reset").addEventListener("click", () => {
    answers.clear();
    renderQuiz();
  });

  // ------------------------------------------------- formula tree + KaTeX

  const Core = globalThis.ModalCore;
  const katex = globalThis.katex;

  function renderTex(el, tex) {
    if (!el) return;
    if (katex) {
      katex.render(tex, el, { throwOnError: false, displayMode: false });
    } else {
      el.textContent = tex;
    }
  }

  function toLatex(ast) {
    switch (ast.t) {
      case "atom":
        return ast.name;
      case "not":
        return "\\neg " + toLatex(ast.a);
      case "box":
        return "\\Box " + toLatex(ast.a);
      case "dia":
        return "\\Diamond " + toLatex(ast.a);
      case "and":
        return `(${toLatex(ast.a)} \\land ${toLatex(ast.b)})`;
      case "or":
        return `(${toLatex(ast.a)} \\lor ${toLatex(ast.b)})`;
      case "imp":
        return `(${toLatex(ast.a)} \\to ${toLatex(ast.b)})`;
      case "iff":
        return `(${toLatex(ast.a)} \\leftrightarrow ${toLatex(ast.b)})`;
      default:
        return "?";
    }
  }

  const OP_LATEX = {
    not: "\\neg",
    box: "\\Box",
    dia: "\\Diamond",
    and: "\\land",
    or: "\\lor",
    imp: "\\to",
    iff: "\\leftrightarrow",
  };

  function buildTreeNode(ast) {
    const wrap = document.createElement("div");
    wrap.className = "ft-node";

    const op = document.createElement("span");
    op.className = "ft-op";
    if (ast.t === "atom") {
      op.classList.add("atom");
      op.textContent = ast.name;
    } else {
      renderTex(op, OP_LATEX[ast.t] || "?");
    }
    wrap.appendChild(op);

    const children = [];
    if (ast.a) children.push(ast.a);
    if (ast.b) children.push(ast.b);
    if (children.length) {
      const box = document.createElement("div");
      box.className = "ft-children";
      for (const child of children) box.appendChild(buildTreeNode(child));
      wrap.appendChild(box);
    }
    return wrap;
  }

  function drawFormulaTree(container, ast) {
    container.innerHTML = "";
    container.appendChild(buildTreeNode(ast));
  }

  function renderStaticFormulaTree() {
    if (!Core) return;
    document.querySelectorAll("[data-tex]").forEach((el) => {
      renderTex(el, el.dataset.tex);
    });
    document.querySelectorAll(".ft-tree[data-formula]").forEach((container) => {
      try {
        drawFormulaTree(container, Core.parse(container.dataset.formula));
      } catch (err) {
        container.textContent = "公式解析失败";
      }
    });
  }

  function renderCustomFormulaTree() {
    const input = $("ft-input");
    const texBox = $("ft-custom-tex");
    const treeBox = $("ft-custom-tree");
    const errorBox = $("ft-error");
    if (!input || !Core) return;
    errorBox.textContent = "";
    try {
      const ast = Core.parse(input.value);
      renderTex(texBox, toLatex(ast));
      drawFormulaTree(treeBox, ast);
    } catch (err) {
      texBox.innerHTML = "";
      treeBox.innerHTML = "";
      errorBox.textContent = `解析失败：${err.message}`;
    }
  }

  if ($("ft-render")) {
    $("ft-render").addEventListener("click", renderCustomFormulaTree);
    $("ft-input").addEventListener("keydown", (event) => {
      if (event.key === "Enter") renderCustomFormulaTree();
    });
    renderStaticFormulaTree();
    renderCustomFormulaTree();
  }

  // ---------------------------------------------- axiom counter-models

  const miniCases = {
    T: {
      p: { w0: false },
      edges: [],
      pos: { w0: { x: 140, y: 78 } },
    },
    "4": {
      p: { w0: false, w1: true, w2: false },
      edges: [["w0", "w1"], ["w1", "w2"]],
      pos: { w0: { x: 50, y: 82 }, w1: { x: 140, y: 42 }, w2: { x: 230, y: 82 } },
    },
    "5": {
      p: { w0: false, w1: true, w2: false },
      edges: [["w0", "w1"], ["w0", "w2"]],
      pos: { w0: { x: 50, y: 82 }, w1: { x: 140, y: 42 }, w2: { x: 230, y: 82 } },
    },
    B: {
      p: { w0: true, w1: false },
      edges: [["w0", "w1"]],
      pos: { w0: { x: 85, y: 80 }, w1: { x: 195, y: 80 } },
    },
    D: {
      p: { w0: true },
      edges: [],
      pos: { w0: { x: 140, y: 78 } },
    },
  };

  function drawMiniModel(container, spec, key) {
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 280 150");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", `${key} 的反模型`);
    addDefs(svg, `mini-arrow-${key}`);

    for (const [a, b] of spec.edges) {
      const from = spec.pos[a];
      const to = spec.pos[b];
      const start = circleEdgePoint(from, to, 18);
      const end = circleEdgePoint(to, from, 18);
      const line = document.createElementNS(NS, "line");
      line.setAttribute("x1", start.x);
      line.setAttribute("y1", start.y);
      line.setAttribute("x2", end.x);
      line.setAttribute("y2", end.y);
      line.setAttribute("stroke", "#6b7f99");
      line.setAttribute("stroke-width", "1.8");
      line.setAttribute("marker-end", `url(#mini-arrow-${key})`);
      svg.appendChild(line);
    }

    for (const [id, pos] of Object.entries(spec.pos)) {
      const group = document.createElementNS(NS, "g");
      const circle = document.createElementNS(NS, "circle");
      circle.setAttribute("cx", pos.x);
      circle.setAttribute("cy", pos.y);
      circle.setAttribute("r", "18");
      circle.setAttribute("fill", spec.p[id] ? "#e5f7ee" : "#ffffff");
      circle.setAttribute("stroke", spec.p[id] ? "#2e9b64" : "#8ca0b8");
      circle.setAttribute("stroke-width", "1.8");
      group.appendChild(circle);

      const label = document.createElementNS(NS, "text");
      label.setAttribute("x", pos.x);
      label.setAttribute("y", pos.y + 4);
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("font-family", "Microsoft YaHei, sans-serif");
      label.setAttribute("font-size", "10");
      label.setAttribute("font-weight", "700");
      label.setAttribute("fill", "#1f3864");
      label.textContent = id;
      group.appendChild(label);

      const p = document.createElementNS(NS, "text");
      p.setAttribute("x", pos.x);
      p.setAttribute("y", pos.y + 31);
      p.setAttribute("text-anchor", "middle");
      p.setAttribute("font-family", "Microsoft YaHei, sans-serif");
      p.setAttribute("font-size", "9");
      p.setAttribute("fill", spec.p[id] ? "#1b7f4b" : "#9b5b55");
      p.textContent = `p:${spec.p[id] ? "真" : "假"}`;
      group.appendChild(p);
      svg.appendChild(group);
    }
    container.appendChild(svg);
  }

  document.querySelectorAll(".mini-model").forEach((container) => {
    const key = container.dataset.case;
    if (miniCases[key]) drawMiniModel(container, miniCases[key], key);
  });

  // ------------------------------------------------------------------ init

  renderStep(0);
  updateModel();
  renderCounter();
  renderQuiz();
})();
