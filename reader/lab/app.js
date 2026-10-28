(function () {
  "use strict";

  const C = window.ModalCore;
  const NS = "http://www.w3.org/2000/svg";
  const R = 36;

  const svg = document.getElementById("canvas");
  const formulaInput = document.getElementById("formula");
  const logicSelect = document.getElementById("logic");
  const statusBox = document.getElementById("status");
  const evalResults = document.getElementById("eval-results");
  const traceBox = document.getElementById("trace");
  const propsList = document.getElementById("props");
  const logicStatus = document.getElementById("logic-status");
  const atomsBox = document.getElementById("atoms");
  const selectedWorldBadge = document.getElementById("selected-world");
  const modelSummary = document.getElementById("model-summary");
  const modeHint = document.getElementById("mode-hint");
  const canvasEmpty = document.getElementById("canvas-empty");

  const PROP_LABELS = {
    reflexive: "自反",
    serial: "串行",
    transitive: "传递",
    symmetric: "对称",
    euclidean: "欧几里得",
  };

  const state = {
    model: C.defaultModel(),
    pos: new Map([
      [0, { x: 340, y: 360 }],
      [1, { x: 660, y: 360 }],
    ]),
    selectedWorld: 0,
    selectedEdge: null,
    mode: "select",
    drag: null,
    edgeStart: null,
    edgePoint: null,
    hoverWorld: null,
    lastEval: null,
    atoms: ["p", "q", "r"],
    nextId: 2,
  };

  function $(id) {
    return document.getElementById(id);
  }

  function svgEl(tag, attrs) {
    const node = document.createElementNS(NS, tag);
    for (const key of Object.keys(attrs || {})) {
      node.setAttribute(key, attrs[key]);
    }
    return node;
  }

  function setStatus(text, kind) {
    statusBox.textContent = text;
    statusBox.className = "status " + (kind || "info");
  }

  function selectedLogic() {
    return logicSelect.value;
  }

  function worldPos(id) {
    if (!state.pos.has(id)) {
      state.pos.set(id, { x: 500, y: 350 });
    }
    return state.pos.get(id);
  }

  function clearSVG() {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
  }

  function addMarker(defs, id, color) {
    const marker = svgEl("marker", {
      id,
      viewBox: "0 0 10 10",
      refX: "9",
      refY: "5",
      markerWidth: "7",
      markerHeight: "7",
      orient: "auto-start-reverse",
    });
    marker.appendChild(svgEl("path", { d: "M 0 0 L 10 5 L 0 10 z", fill: color }));
    defs.appendChild(marker);
  }

  function edgeGeometry(a, b) {
    const p = worldPos(a);
    const q = worldPos(b);
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    const ux = dx / d;
    const uy = dy / d;
    return {
      x1: p.x + ux * R,
      y1: p.y + uy * R,
      x2: q.x - ux * R,
      y2: q.y - uy * R,
    };
  }

  function selfLoopPath(id) {
    const p = worldPos(id);
    return [
      "M", p.x - 14, p.y - R,
      "C", p.x - 92, p.y - 132,
      p.x + 92, p.y - 132,
      p.x + 14, p.y - R,
    ].join(" ");
  }

  function edgeSelected(a, b) {
    return (
      state.selectedEdge &&
      state.selectedEdge[0] === a &&
      state.selectedEdge[1] === b
    );
  }

  function renderGraph() {
    clearSVG();
    svg.dataset.mode = state.mode;

    const defs = svgEl("defs");
    addMarker(defs, "arrow", "#7b8aa0");
    addMarker(defs, "arrow-selected", "#c9a227");
    svg.appendChild(defs);

    // edges
    for (const [a, b] of state.model.edges) {
      const selected = edgeSelected(a, b);
      const marker = selected ? "arrow-selected" : "arrow";
      const cls = "edge" + (selected ? " selected" : "");

      if (a === b) {
        const d = selfLoopPath(a);
        const path = svgEl("path", {
          d,
          class: cls,
          "marker-end": `url(#${marker})`,
        });
        svg.appendChild(path);
        const hit = svgEl("path", {
          d,
          class: "edge-hit",
          "data-edge": `${a}:${b}`,
          "pointer-events": "stroke",
        });
        hit.addEventListener("click", (ev) => selectEdge(ev, a, b));
        svg.appendChild(hit);
      } else {
        const g = edgeGeometry(a, b);
        const line = svgEl("line", {
          x1: g.x1,
          y1: g.y1,
          x2: g.x2,
          y2: g.y2,
          class: cls,
          "marker-end": `url(#${marker})`,
        });
        svg.appendChild(line);
        const hit = svgEl("line", {
          x1: g.x1,
          y1: g.y1,
          x2: g.x2,
          y2: g.y2,
          class: "edge-hit",
          "data-edge": `${a}:${b}`,
          "pointer-events": "stroke",
        });
        hit.addEventListener("click", (ev) => selectEdge(ev, a, b));
        svg.appendChild(hit);
      }
    }

    // preview edge while dragging
    if (state.edgeStart !== null && state.edgePoint) {
      const p = worldPos(state.edgeStart);
      svg.appendChild(
        svgEl("line", {
          x1: p.x,
          y1: p.y,
          x2: state.edgePoint.x,
          y2: state.edgePoint.y,
          stroke: "#c9a227",
          "stroke-width": 2,
          "stroke-dasharray": "6 5",
          fill: "none",
        })
      );
    }

    // nodes
    for (const id of state.model.worlds) {
      const p = worldPos(id);
      const selected = state.selectedWorld === id;
      const result = state.lastEval ? state.lastEval.results[id] : undefined;
      const cls = [
        "node",
        selected ? "selected" : "",
        result === true ? "true" : "",
        result === false ? "false" : "",
        state.drag && state.drag.id === id ? "dragging" : "",
      ]
        .filter(Boolean)
        .join(" ");

      const g = svgEl("g", {
        class: cls,
        transform: `translate(${p.x}, ${p.y})`,
        "data-world": String(id),
      });

      g.appendChild(svgEl("circle", { r: String(R) }));

      const label = svgEl("text", { class: "world-label", y: "-4" });
      label.textContent = `w${id}`;
      g.appendChild(label);

      const atoms = (state.model.val[id] || []).slice().sort();
      const atomText = atoms.length ? atoms.join(", ") : "∅";
      const atomLabel = svgEl("text", { class: "atoms-label", y: "17" });
      atomLabel.textContent = atomText.length > 14 ? atomText.slice(0, 13) + "…" : atomText;
      g.appendChild(atomLabel);

      g.addEventListener("pointerdown", (ev) => onNodePointerDown(ev, id));
      svg.appendChild(g);
    }

    canvasEmpty.hidden = state.model.worlds.length > 0;
  }

  function selectEdge(ev, a, b) {
    ev.stopPropagation();
    state.selectedEdge = [a, b];
    state.selectedWorld = null;
    renderGraph();
    renderAtoms();
    setStatus(`选中边 ${a} → ${b}；按 Delete 删除。`, "info");
  }

  function onNodePointerDown(ev, id) {
    ev.preventDefault();
    ev.stopPropagation();
    state.selectedWorld = id;
    state.selectedEdge = null;

    if (state.mode === "add-edge") {
      state.edgeStart = id;
      state.edgePoint = { x: worldPos(id).x, y: worldPos(id).y };
      setStatus("拖到目标世界，松开即可加边。", "info");
      renderGraph();
      renderAtoms();
      renderTrace();
      return;
    }

    const p = worldPos(id);
    const pt = svgPoint(ev);
    state.drag = { id, dx: p.x - pt.x, dy: p.y - pt.y };
    renderGraph();
    renderAtoms();
    renderTrace();
  }

  function svgPoint(ev) {
    const pt = svg.createSVGPoint();
    pt.x = ev.clientX;
    pt.y = ev.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 500, y: 350 };
    const out = pt.matrixTransform(ctm.inverse());
    return { x: out.x, y: out.y };
  }

  function findWorldAt(pt) {
    for (let i = state.model.worlds.length - 1; i >= 0; i -= 1) {
      const id = state.model.worlds[i];
      const p = worldPos(id);
      if (Math.hypot(pt.x - p.x, pt.y - p.y) <= R + 8) return id;
    }
    return null;
  }

  function addWorld(x, y) {
    const id = state.nextId;
    state.nextId += 1;
    state.model.worlds.push(id);
    state.model.val[id] = [];
    state.pos.set(id, { x, y });
    state.selectedWorld = id;
    state.selectedEdge = null;
    renderAll();
    setStatus(`已添加 w${id}。勾选右侧原子命题给它赋值。`, "success");
  }

  function addEdge(a, b) {
    if (a === null || b === null || a === b) {
      // self-loop is allowed, but not from a drag onto the same node
      if (a !== null && b === a) return;
      return;
    }
    const exists = state.model.edges.some((e) => e[0] === a && e[1] === b);
    if (!exists) {
      state.model.edges.push([a, b]);
      setStatus(`已添加边 ${a} → ${b}。`, "success");
    } else {
      setStatus(`边 ${a} → ${b} 已存在。`, "info");
    }
    state.selectedEdge = [a, b];
    state.selectedWorld = null;
    renderAll();
  }

  function removeEdge(a, b) {
    state.model.edges = state.model.edges.filter((e) => !(e[0] === a && e[1] === b));
    state.selectedEdge = null;
    renderAll();
  }

  function deleteSelected() {
    if (state.selectedEdge) {
      const [a, b] = state.selectedEdge;
      removeEdge(a, b);
      setStatus(`已删除边 ${a} → ${b}。`, "success");
      return;
    }
    if (state.selectedWorld === null) {
      setStatus("先选中一个世界或一条边。", "info");
      return;
    }
    if (state.model.worlds.length <= 1) {
      setStatus("至少保留一个世界。", "error");
      return;
    }
    const id = state.selectedWorld;
    state.model.worlds = state.model.worlds.filter((w) => w !== id);
    state.model.edges = state.model.edges.filter((e) => e[0] !== id && e[1] !== id);
    delete state.model.val[id];
    state.pos.delete(id);
    state.selectedWorld = state.model.worlds[0];
    state.selectedEdge = null;
    state.lastEval = null;
    setStatus(`已删除 w${id}。`, "success");
    renderAll();
  }

  function toggleLoop() {
    const id = state.selectedWorld;
    if (id === null) {
      setStatus("先选中一个世界。", "info");
      return;
    }
    const has = state.model.edges.some((e) => e[0] === id && e[1] === id);
    if (has) {
      removeEdge(id, id);
      setStatus(`已移除 w${id} 的自反边。`, "success");
    } else {
      state.model.edges.push([id, id]);
      setStatus(`已添加 w${id} 的自反边。`, "success");
      renderAll();
    }
  }

  function ensureAtoms(formula) {
    const set = new Set(state.atoms);
    for (const w of state.model.worlds) {
      for (const a of state.model.val[w] || []) set.add(a);
    }
    if (formula) {
      for (const a of C.atomsOf(formula)) set.add(a);
    }
    state.atoms = Array.from(set).sort((a, b) => a.localeCompare(b));
  }

  function renderAtoms() {
    atomsBox.innerHTML = "";
    selectedWorldBadge.textContent =
      state.selectedWorld === null ? "—" : `w${state.selectedWorld}`;

    if (state.selectedWorld === null) {
      const p = document.createElement("p");
      p.className = "hint";
      p.textContent = "先选中一个世界，才能编辑它的原子命题。";
      atomsBox.appendChild(p);
      return;
    }

    const w = state.selectedWorld;
    const current = new Set(state.model.val[w] || []);
    ensureAtoms(null);

    for (const atom of state.atoms) {
      const label = document.createElement("label");
      label.className = "atom";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = current.has(atom);
      cb.addEventListener("change", () => {
        const set = new Set(state.model.val[w] || []);
        if (cb.checked) set.add(atom);
        else set.delete(atom);
        state.model.val[w] = Array.from(set).sort();
        if (state.lastEval) {
          try {
            state.lastEval = computeEval(parseInput());
          } catch (err) {
            state.lastEval = null;
          }
        }
        renderGraph();
        renderEvalResults();
      });
      label.appendChild(cb);
      label.appendChild(document.createTextNode(atom));
      atomsBox.appendChild(label);
    }
  }

  function renderProps() {
    const props = C.frameProperties(state.model);
    propsList.innerHTML = "";
    for (const key of ["reflexive", "serial", "transitive", "symmetric", "euclidean"]) {
      const li = document.createElement("li");
      li.className = "prop " + (props[key] ? "ok" : "bad");
      const name = document.createElement("span");
      name.textContent = PROP_LABELS[key];
      const icon = document.createElement("span");
      icon.className = "icon";
      icon.textContent = props[key] ? "✓" : "✗";
      li.appendChild(name);
      li.appendChild(icon);
      propsList.appendChild(li);
    }

    const logic = selectedLogic();
    const constraints = C.LOGICS[logic] || [];
    if (constraints.length === 0) {
      logicStatus.innerHTML = "K 对所有框架都成立；这里只检查公式在模型中的真值。";
    } else {
      const missing = constraints.filter((c) => !props[c]);
      if (missing.length === 0) {
        logicStatus.innerHTML =
          `当前模型满足 <b>${logic}</b> 的框架条件：` +
          constraints.map((c) => PROP_LABELS[c]).join("、") +
          "。";
      } else {
        logicStatus.innerHTML =
          `当前模型<b class="bad">不满足</b> <b>${logic}</b> 的框架条件：缺 ` +
          missing.map((c) => PROP_LABELS[c]).join("、") +
          "。";
      }
    }
  }

  function renderEvalResults() {
    evalResults.innerHTML = "";
    if (!state.lastEval) {
      traceBox.hidden = true;
      traceBox.innerHTML = "";
      return;
    }
    for (const w of state.model.worlds) {
      const chip = document.createElement("span");
      const value = state.lastEval.results[w];
      chip.className = "eval-chip " + (value ? "true" : "false");
      chip.textContent = `w${w}: ${value ? "真" : "假"}`;
      evalResults.appendChild(chip);
    }
    renderTrace();
  }

  function traceNode(node, depth) {
    const wrap = document.createElement("div");
    wrap.className = "trace-node" + (depth === 0 ? " root" : "");

    const row = document.createElement("div");
    row.className = "trace-row";

    const formula = document.createElement("span");
    formula.className = "trace-formula";
    formula.textContent = node.formula;
    row.appendChild(formula);

    const world = document.createElement("span");
    world.className = "trace-world";
    world.textContent = `@ w${node.world}`;
    row.appendChild(world);

    const truth = document.createElement("span");
    truth.className = "trace-truth " + (node.truth ? "true" : "false");
    truth.textContent = node.truth ? "真" : "假";
    row.appendChild(truth);
    wrap.appendChild(row);

    const reason = document.createElement("div");
    reason.className = "trace-reason";
    reason.textContent = node.reason;
    wrap.appendChild(reason);

    for (const child of node.children) {
      wrap.appendChild(traceNode(child, depth + 1));
    }
    return wrap;
  }

  function renderTrace() {
    if (!state.lastEval || !state.model.worlds.length) {
      traceBox.hidden = true;
      traceBox.innerHTML = "";
      return;
    }
    const world =
      state.selectedWorld !== null && state.model.worlds.includes(state.selectedWorld)
        ? state.selectedWorld
        : state.model.worlds[0];
    let root;
    try {
      root = C.trace(state.model, world, state.lastEval.formula);
    } catch (err) {
      traceBox.hidden = true;
      return;
    }

    traceBox.hidden = false;
    traceBox.innerHTML = "";
    const head = document.createElement("div");
    head.className = "trace-head";
    head.innerHTML = `逐子公式 trace <span>从 w${world} 出发</span>`;
    traceBox.appendChild(head);
    traceBox.appendChild(traceNode(root, 0));
  }

  function renderSummary() {
    modelSummary.textContent = C.describeModel(state.model);
  }

  function renderAll() {
    renderGraph();
    renderProps();
    renderAtoms();
    renderEvalResults();
    renderSummary();
  }

  function parseInput() {
    return C.parse(formulaInput.value);
  }

  function computeEval(f) {
    const results = {};
    for (const w of state.model.worlds) {
      results[w] = C.evaluate(state.model, w, f);
    }
    return { formula: f, results };
  }

  function doEvaluate() {
    let f;
    try {
      f = parseInput();
    } catch (err) {
      state.lastEval = null;
      setStatus(err.message, "error");
      renderGraph();
      renderEvalResults();
      return;
    }
    ensureAtoms(f);
    state.lastEval = computeEval(f);
    const falseWorlds = state.model.worlds.filter((w) => !state.lastEval.results[w]);
    if (falseWorlds.length === 0) {
      setStatus("在当前模型中，公式在所有世界为真。", "success");
    } else {
      setStatus(
        "在当前模型中，公式在 " +
          falseWorlds.map((w) => `w${w}`).join("、") +
          " 为假。",
        "info"
      );
    }
    renderAll();
  }

  function findCountermodel() {
    let f;
    try {
      f = parseInput();
    } catch (err) {
      setStatus(err.message, "error");
      return;
    }
    ensureAtoms(f);
    setStatus("正在 ≤3 个世界中搜索反模型…", "info");
    window.setTimeout(() => {
      let result;
      try {
        result = C.findCountermodel(f, selectedLogic(), 3);
      } catch (err) {
        setStatus(err.message, "error");
        return;
      }
      if (!result.found) {
        setStatus(
          `在 ≤3 个世界内没有找到反模型（逻辑 ${selectedLogic()}）。` +
            "这不能证明公式普遍有效。",
          "info"
        );
        return;
      }
      state.model = result.model;
      state.nextId = Math.max(...state.model.worlds) + 1;
      layoutModel();
      state.selectedWorld = result.world;
      state.selectedEdge = null;
      state.lastEval = computeEval(f);
      setStatus(
        `找到反模型：公式在 w${result.world} 为假（${result.worlds} 个世界，逻辑 ${selectedLogic()}）。`,
        "success"
      );
      renderAll();
    }, 20);
  }

  function layoutModel() {
    const n = state.model.worlds.length;
    const cx = 500;
    const cy = 350;
    state.pos = new Map();
    if (n === 1) {
      state.pos.set(state.model.worlds[0], { x: cx, y: cy });
      return;
    }
    if (n === 2) {
      state.pos.set(state.model.worlds[0], { x: 340, y: 360 });
      state.pos.set(state.model.worlds[1], { x: 660, y: 360 });
      return;
    }
    const radius = 210;
    for (let i = 0; i < n; i += 1) {
      const angle = -Math.PI / 2 + (2 * Math.PI * i) / n;
      state.pos.set(state.model.worlds[i], {
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
      });
    }
  }

  function reset() {
    state.model = C.defaultModel();
    state.pos = new Map([
      [0, { x: 340, y: 360 }],
      [1, { x: 660, y: 360 }],
    ]);
    state.selectedWorld = 0;
    state.selectedEdge = null;
    state.nextId = 2;
    state.lastEval = null;
    state.atoms = ["p", "q", "r"];
    formulaInput.value = "[]p -> p";
    logicSelect.value = "K";
    doEvaluate();
  }

  function setMode(mode) {
    state.mode = mode;
    state.edgeStart = null;
    state.edgePoint = null;
    for (const btn of document.querySelectorAll(".mode")) {
      btn.classList.toggle("active", btn.dataset.mode === mode);
    }
    if (mode === "add-world") {
      modeHint.textContent = "点击空白处添加世界";
    } else if (mode === "add-edge") {
      modeHint.textContent = "从一个世界拖到另一个世界";
    } else {
      modeHint.textContent = "点击世界选中；拖动移动";
    }
    renderGraph();
  }

  // ------------------------------------------------------------- events

  svg.addEventListener("pointerdown", (ev) => {
    if (ev.target !== svg) return;
    const pt = svgPoint(ev);
    if (state.mode === "add-world") {
      addWorld(pt.x, pt.y);
    } else {
      state.selectedWorld = null;
      state.selectedEdge = null;
      renderGraph();
      renderAtoms();
    }
  });

  window.addEventListener("pointermove", (ev) => {
    if (state.drag) {
      const pt = svgPoint(ev);
      state.pos.set(state.drag.id, {
        x: pt.x + state.drag.dx,
        y: pt.y + state.drag.dy,
      });
      renderGraph();
      return;
    }
    if (state.edgeStart !== null) {
      state.edgePoint = svgPoint(ev);
      renderGraph();
    }
  });

  window.addEventListener("pointerup", (ev) => {
    if (state.drag) {
      state.drag = null;
      renderGraph();
      return;
    }
    if (state.edgeStart !== null) {
      const from = state.edgeStart;
      const pt = svgPoint(ev);
      const to = findWorldAt(pt);
      state.edgeStart = null;
      state.edgePoint = null;
      if (to !== null && to !== from) {
        addEdge(from, to);
      } else {
        renderGraph();
      }
    }
  });

  window.addEventListener("keydown", (ev) => {
    if (document.activeElement === formulaInput) return;
    if (ev.key === "Delete" || ev.key === "Backspace") {
      ev.preventDefault();
      deleteSelected();
    } else if (ev.key === "Escape") {
      state.edgeStart = null;
      state.edgePoint = null;
      state.selectedEdge = null;
      renderGraph();
    }
  });

  $("eval").addEventListener("click", doEvaluate);
  $("find").addEventListener("click", findCountermodel);
  $("clear").addEventListener("click", reset);
  $("toggle-loop").addEventListener("click", toggleLoop);
  $("delete-world").addEventListener("click", deleteSelected);

  formulaInput.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") doEvaluate();
  });

  logicSelect.addEventListener("change", () => {
    renderProps();
  });

  for (const btn of document.querySelectorAll(".mode")) {
    btn.addEventListener("click", () => setMode(btn.dataset.mode));
  }

  // ------------------------------------------------------------- start

  ensureAtoms(null);
  setMode("select");
  doEvaluate();
})();
