(function () {
  "use strict";

  const NS = "http://www.w3.org/2000/svg";
  const XLINK = "http://www.w3.org/1999/xlink";
  const svg = document.getElementById("map-canvas");

  const nodes = [
    {
      id: "logic", label: "命题逻辑基础", sub: "联结词 · 真值表 · 推理",
      x: 120, y: 75, w: 190, h: 56, cat: "base",
      href: "index.html#sec-14",
    },
    {
      id: "lang", label: "模态语言", sub: "□ ◇ · 辖域 · 嵌套",
      x: 370, y: 75, w: 190, h: 56, cat: "base",
      href: "index.html#sec-14",
    },
    {
      id: "kripke", label: "Kripke 语义", sub: "W · R · V · 满足关系",
      x: 630, y: 75, w: 200, h: 56, cat: "sem",
      href: "index.html#sec-23",
    },
    {
      id: "model", label: "模型与反模型", sub: "逐世界求值 · 失败见证",
      x: 890, y: 75, w: 200, h: 56, cat: "sem",
      href: "deep-dive.html#counter",
    },
    {
      id: "deep", label: "公理精读", sub: "直觉 · 条件 · 反模型 · 对比",
      x: 120, y: 235, w: 200, h: 58, cat: "res",
      href: "deep-dive.html#axioms",
    },
    {
      id: "axioms", label: "公理系统", sub: "K / T / S4 / S5 / D / B",
      x: 370, y: 235, w: 200, h: 58, cat: "proof",
      href: "index.html#sec-33",
    },
    {
      id: "frame", label: "框架对应", sub: "自反 · 传递 · 对称 · 串行",
      x: 630, y: 235, w: 200, h: 58, cat: "proof",
      href: "index.html#sec-46",
    },
    {
      id: "complete", label: "完全性", sub: "典范模型 · 真值引理",
      x: 890, y: 235, w: 200, h: 58, cat: "proof",
      href: "index.html#sec-46",
    },
    {
      id: "epistemic", label: "认知 / 时间 / 道义", sub: "S5 · 时序 · D",
      x: 120, y: 400, w: 200, h: 58, cat: "app",
      href: "index.html#sec-76",
    },
    {
      id: "apps", label: "应用与系统选择", sub: "先问假设，再选系统",
      x: 370, y: 400, w: 200, h: 58, cat: "app",
      href: "index.html#sec-72",
    },
    {
      id: "tableau", label: "表列法", sub: "证明搜索 · 开放枝",
      x: 630, y: 400, w: 200, h: 58, cat: "proof",
      href: "index.html#sec-58",
    },
    {
      id: "lab", label: "Kripke 实验室", sub: "画模型 · 求值 · 找反模型",
      x: 890, y: 400, w: 200, h: 58, cat: "res",
      href: "lab/index.html",
    },
    {
      id: "quiz", label: "诊断题库", sub: "10 题 · 知识点反馈",
      x: 370, y: 545, w: 200, h: 54, cat: "res",
      href: "deep-dive.html#quiz",
    },
    {
      id: "tree", label: "公式树 / KaTeX", sub: "□◇p vs ◇□p",
      x: 630, y: 545, w: 200, h: 54, cat: "res",
      href: "deep-dive.html#formula-tree",
    },
  ];

  const edges = [
    ["logic", "lang"],
    ["lang", "kripke"],
    ["kripke", "model"],
    ["lang", "axioms"],
    ["kripke", "axioms"],
    ["deep", "axioms", "精读"],
    ["axioms", "frame"],
    ["frame", "complete"],
    ["kripke", "tableau"],
    ["frame", "tableau"],
    ["axioms", "apps"],
    ["kripke", "apps"],
    ["apps", "epistemic"],
    ["lab", "model", "验证", true],
    ["lab", "kripke", "实验", true],
    ["quiz", "axioms", "自测", true],
    ["tree", "kripke", "结构", true],
  ];

  const byId = new Map(nodes.map((n) => [n.id, n]));

  function el(name, attrs) {
    const node = document.createElementNS(NS, name);
    for (const [key, value] of Object.entries(attrs || {})) {
      node.setAttribute(key, value);
    }
    return node;
  }

  function addMarker(id, color) {
    const marker = el("marker", {
      id,
      viewBox: "0 0 10 10",
      refX: "9",
      refY: "5",
      markerWidth: "6",
      markerHeight: "6",
      orient: "auto-start-reverse",
    });
    marker.appendChild(el("path", { d: "M 0 0 L 10 5 L 0 10 z", fill: color }));
    return marker;
  }

  const defs = el("defs");
  defs.appendChild(addMarker("map-arrow", "#a9b8ca"));
  defs.appendChild(addMarker("map-arrow-green", "#9cc9b1"));
  svg.appendChild(defs);

  // edges first
  for (const [fromId, toId, label, dashed] of edges) {
    const from = byId.get(fromId);
    const to = byId.get(toId);
    if (!from || !to) continue;
    const line = el("line", {
      x1: from.x,
      y1: from.y,
      x2: to.x,
      y2: to.y,
      class: "map-edge" + (dashed ? " dashed" : ""),
    });
    svg.appendChild(line);

    if (label) {
      const text = el("text", {
        x: (from.x + to.x) / 2,
        y: (from.y + to.y) / 2 - 3,
        "text-anchor": "middle",
        class: "map-edge-label",
      });
      text.textContent = label;
      svg.appendChild(text);
    }
  }

  // nodes
  for (const node of nodes) {
    const link = el("a", { class: `map-node ${node.cat}` });
    link.setAttribute("href", node.href);
    link.setAttributeNS(XLINK, "xlink:href", node.href);
    link.setAttribute("aria-label", `${node.label}：${node.sub}`);

    const rect = el("rect", {
      x: node.x - node.w / 2,
      y: node.y - node.h / 2,
      width: node.w,
      height: node.h,
      rx: "10",
      ry: "10",
    });
    link.appendChild(rect);

    const label = el("text", {
      x: node.x,
      y: node.y - 3,
      "text-anchor": "middle",
      class: "node-label",
    });
    label.textContent = node.label;
    link.appendChild(label);

    const sub = el("text", {
      x: node.x,
      y: node.y + 15,
      "text-anchor": "middle",
      class: "node-sub",
    });
    sub.textContent = node.sub;
    link.appendChild(sub);

    svg.appendChild(link);
  }
})();
