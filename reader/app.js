(function () {
  "use strict";

  const DOC = globalThis.READER_DOC;
  const RAG = globalThis.RAG_DATA;
  const R = globalThis.ReaderExplain;

  const docEl = document.getElementById("doc");
  const tocEl = document.getElementById("toc");
  const tocCount = document.getElementById("toc-count");
  const tocSearch = document.getElementById("toc-search");
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("overlay");
  const menuToggle = document.getElementById("menu-toggle");
  const progress = document.getElementById("reading-progress");
  const toolbar = document.getElementById("selection-toolbar");
  const panel = document.getElementById("explain-panel");
  const panelStatus = document.getElementById("explain-status");
  const panelAnswer = document.getElementById("explain-answer");
  const panelSources = document.getElementById("explain-sources");
  const panelSelection = document.getElementById("explain-selection");
  const panelMode = document.getElementById("explain-mode");
  const modeBadge = document.getElementById("mode-badge");
  const toastEl = document.getElementById("toast");

  if (!DOC || !RAG || !R) {
    document.body.innerHTML =
      '<p style="padding:40px;font-family:sans-serif">加载失败：content.js / rag.js / explain.js 未生成。请先运行 <code>python reader/build_reader.py</code>。</p>';
    return;
  }

  document.title = `${DOC.title} · 交互讲义`;
  docEl.innerHTML = DOC.html;

  const headings = Array.from(docEl.querySelectorAll("h1, h2, h3"));
  const headingLinks = new Map();
  let activeId = null;
  let currentSelection = null;
  let selectionTimer = null;
  let retriever = null;
  let lastResults = [];
  let lastLocal = null;

  const SETTINGS_KEY = "modal-reader.settings.v1";
  const KEY_KEY = "modal-reader.api-key.v1";

  const settings = {
    mode: "local",
    endpoint: "/api/explain",
    model: "gpt-4o-mini",
    apiKey: "",
  };

  // ------------------------------------------------------------------ utils

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (ch) => {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function showToast(message) {
    toastEl.textContent = message;
    toastEl.hidden = false;
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => {
      toastEl.hidden = true;
    }, 2200);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      showToast("已复制");
      return true;
    } catch (_) {
      const area = document.createElement("textarea");
      area.value = text;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      try {
        document.execCommand("copy");
        showToast("已复制");
        return true;
      } catch (err) {
        showToast("复制失败");
        return false;
      } finally {
        area.remove();
      }
    }
  }

  // -------------------------------------------------------------------- TOC

  function buildTOC() {
    tocEl.innerHTML = "";
    const root = document.createElement("ul");
    tocEl.appendChild(root);

    const stack = [{ level: 0, ul: root }];

    for (const h of headings) {
      const level = Number(h.tagName.slice(1));
      while (stack.length > 1 && stack[stack.length - 1].level >= level) {
        stack.pop();
      }
      const parent = stack[stack.length - 1].ul;

      const li = document.createElement("li");
      li.className = `level-${level}`;

      const a = document.createElement("a");
      a.href = `#${h.id}`;
      const titleEl = h.querySelector(".heading-text");
      a.textContent = (titleEl ? titleEl.textContent : h.textContent).replace(/#$/, "").trim();
      a.dataset.anchor = h.id;

      li.appendChild(a);
      parent.appendChild(li);
      headingLinks.set(h.id, a);

      if (level < 3) {
        const child = document.createElement("ul");
        li.appendChild(child);
        stack.push({ level, ul: child });
      }
    }

    tocCount.textContent = `${headings.length} 节`;
  }

  function setActive(id) {
    if (!id || id === activeId) return;
    if (activeId && headingLinks.has(activeId)) {
      headingLinks.get(activeId).classList.remove("active");
    }
    activeId = id;
    const link = headingLinks.get(id);
    if (link) {
      link.classList.add("active");
      const rect = link.getBoundingClientRect();
      if (rect.top < 80 || rect.bottom > window.innerHeight - 20) {
        link.scrollIntoView({ block: "nearest" });
      }
    }
  }

  function onScroll() {
    const y = window.scrollY + 100;
    let current = headings[0];
    for (const h of headings) {
      const top = h.getBoundingClientRect().top + window.scrollY;
      if (top <= y) current = h;
      else break;
    }
    if (current) setActive(current.id);

    const max = document.documentElement.scrollHeight - window.innerHeight;
    progress.style.width = `${max > 0 ? Math.min(100, (window.scrollY / max) * 100) : 0}%`;
  }

  function filterTOC(query) {
    const q = query.trim().toLowerCase();
    const items = Array.from(tocEl.querySelectorAll("li"));
    if (!q) {
      items.forEach((li) => li.classList.remove("hidden"));
      return;
    }
    items.forEach((li) => li.classList.add("hidden"));
    for (const li of items) {
      const a = li.querySelector(":scope > a");
      if (!a) continue;
      if (a.textContent.toLowerCase().includes(q)) {
        li.classList.remove("hidden");
        let parent = li.parentElement.closest("li");
        while (parent) {
          parent.classList.remove("hidden");
          parent = parent.parentElement.closest("li");
        }
      }
    }
  }

  // --------------------------------------------------------------- selection

  function findHeading(node) {
    let el = node && node.nodeType === 3 ? node.parentElement : node;
    if (el && /^H[1-3]$/.test(el.tagName)) return el;
    while (el && el !== docEl) {
      let sib = el.previousElementSibling;
      while (sib) {
        if (/^H[1-3]$/.test(sib.tagName)) return sib;
        sib = sib.previousElementSibling;
      }
      el = el.parentElement;
    }
    return null;
  }

  function blockText(node) {
    const el = node && node.nodeType === 3 ? node.parentElement : node;
    if (!el) return "";
    const block = el.closest("p, li, pre, td, th, h1, h2, h3, blockquote");
    return block ? block.textContent.trim().slice(0, 900) : "";
  }

  function hideToolbar() {
    toolbar.hidden = true;
  }

  function showToolbar(rect) {
    toolbar.hidden = false;
    const width = toolbar.offsetWidth || 150;
    let left = rect.left + rect.width / 2 - width / 2;
    left = Math.max(8, Math.min(window.innerWidth - width - 8, left));
    let top = rect.top - 46;
    if (top < 68) top = rect.bottom + 8;
    toolbar.style.left = `${left}px`;
    toolbar.style.top = `${top}px`;
  }

  function scheduleSelection() {
    clearTimeout(selectionTimer);
    selectionTimer = setTimeout(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) {
        hideToolbar();
        return;
      }
      const text = sel.toString().trim();
      if (!text || text.length > 800) {
        hideToolbar();
        return;
      }
      const range = sel.getRangeAt(0);
      if (!docEl.contains(range.commonAncestorContainer)) {
        hideToolbar();
        return;
      }
      const rect = range.getBoundingClientRect();
      if (!rect || (!rect.width && !rect.height)) {
        hideToolbar();
        return;
      }
      const heading = findHeading(range.startContainer);
      currentSelection = {
        text,
        heading: heading ? heading.querySelector(".heading-text")?.textContent || heading.textContent : "",
        context: blockText(range.startContainer),
      };
      showToolbar(rect);
    }, 10);
  }

  // ----------------------------------------------------------------- panel

  function closePanel() {
    panel.hidden = true;
    lastResults = [];
    lastLocal = null;
  }

  function scrollToAnchor(anchor) {
    const target = document.getElementById(anchor);
    if (!target) return;
    closePanel();
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    history.replaceState(null, "", `#${anchor}`);
  }

  function renderSources(sources) {
    if (!sources || sources.length === 0) {
      panelSources.innerHTML = "";
      return;
    }
    panelSources.innerHTML = "<h3>定位原文</h3>";
    for (const source of sources) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "source-card";
      button.innerHTML =
        `<span class="source-title">[${source.index}] ${escapeHtml(source.section)}</span>` +
        `<span class="source-excerpt">${escapeHtml(source.excerpt)}</span>`;
      button.addEventListener("click", () => scrollToAnchor(source.anchor));
      panelSources.appendChild(button);
    }
  }

  function setPanelStatus(text, kind) {
    panelStatus.textContent = text;
    panelStatus.className = "panel-status" + (kind ? ` ${kind}` : "");
  }

  function renderLocal(ans, note) {
    panelMode.textContent = note
      ? "本地 RAG（回退）"
      : settings.mode === "api"
        ? "API"
        : "本地 RAG";
    setPanelStatus(note || `本地 RAG：命中 ${ans.sources.length} 个相关段落`, note ? "warn" : "");
    const parts = [`<p>${escapeHtml(ans.summary)}</p>`];
    if (ans.points.length) {
      parts.push('<h3>讲义中的相关表述</h3><ul class="answer-points">');
      for (const point of ans.points) {
        parts.push(
          `<li>${escapeHtml(point.text)}<span class="source-badge">[${point.source}]</span></li>`
        );
      }
      parts.push("</ul>");
    } else {
      parts.push('<p class="hint">没有找到足够具体的解释句，下面是检索到的原文段落。</p>');
    }
    panelAnswer.innerHTML = parts.join("");
    renderSources(ans.sources);
  }

  function renderApi(text, sources) {
    setPanelStatus("API 回答", "");
    const paragraphs = String(text)
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`);
    panelAnswer.innerHTML = paragraphs.join("") || "<p>API 返回为空。</p>";
    renderSources(sources || []);
  }

  function isProxyEndpoint(endpoint) {
    const e = String(endpoint || "").trim();
    return e.startsWith("/") || /\/api\/explain\/?$/.test(e);
  }

  async function apiExplain(selection, results) {
    const payload = {
      selection: selection.text,
      heading: selection.heading,
      context: results.map((r) => ({ section: r.chunk.section, text: r.chunk.text })),
      results,
    };

    if (!settings.endpoint) throw new Error("未配置 API 地址");

    if (isProxyEndpoint(settings.endpoint)) {
      return await R.callProxy(settings.endpoint, payload);
    }
    return await R.callOpenAI(settings.endpoint, settings.apiKey, settings.model, payload);
  }

  async function runExplain(selection) {
    panel.hidden = false;
    panelSelection.textContent = selection.text;
    panelAnswer.innerHTML = "";
    panelSources.innerHTML = "";
    panelMode.textContent = settings.mode === "api" ? "API" : "本地 RAG";
    setPanelStatus("正在检索讲义并生成解释…", "loading");

    lastResults = retriever.search(`${selection.text} ${selection.heading || ""}`, 5);
    lastLocal = R.answer(selection.text, lastResults);

    if (settings.mode === "local") {
      renderLocal(lastLocal);
      return;
    }

    setPanelStatus("正在调用 API（失败会自动回退到本地 RAG）…", "loading");
    try {
      const text = await apiExplain(selection, lastResults);
      renderApi(text, lastLocal.sources);
    } catch (err) {
      renderLocal(
        lastLocal,
        `API 调用失败，已回退到本地 RAG：${err && err.message ? err.message : err}`
      );
    }
  }

  // ---------------------------------------------------------------- settings

  function loadSettings() {
    try {
      const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
      if (stored && typeof stored === "object") {
        if (stored.mode === "api" || stored.mode === "local") settings.mode = stored.mode;
        if (typeof stored.endpoint === "string") settings.endpoint = stored.endpoint;
        if (typeof stored.model === "string") settings.model = stored.model;
      }
    } catch (_) {}

    try {
      settings.apiKey = sessionStorage.getItem(KEY_KEY) || "";
    } catch (_) {}
  }

  function saveSettings() {
    const mode = document.querySelector('input[name="mode"]:checked');
    settings.mode = mode ? mode.value : "local";
    settings.endpoint = document.getElementById("api-endpoint").value.trim() || "/api/explain";
    settings.model = document.getElementById("api-model").value.trim() || "gpt-4o-mini";
    settings.apiKey = document.getElementById("api-key").value.trim();

    try {
      localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify({ mode: settings.mode, endpoint: settings.endpoint, model: settings.model })
      );
      if (settings.apiKey) sessionStorage.setItem(KEY_KEY, settings.apiKey);
      else sessionStorage.removeItem(KEY_KEY);
    } catch (_) {}

    syncModeUI();
    document.getElementById("settings-modal").hidden = true;
    showToast(settings.mode === "api" ? "已切换到 API 模式" : "已切换到本地 RAG 模式");
  }

  function syncModeUI() {
    modeBadge.textContent = settings.mode === "api" ? "API" : "本地 RAG";
    panelMode.textContent = settings.mode === "api" ? "API" : "本地 RAG";
  }

  function openSettings() {
    const modal = document.getElementById("settings-modal");
    document.querySelectorAll('input[name="mode"]').forEach((input) => {
      input.checked = input.value === settings.mode;
    });
    document.getElementById("api-endpoint").value = settings.endpoint;
    document.getElementById("api-model").value = settings.model;
    document.getElementById("api-key").value = settings.apiKey;
    document.getElementById("api-fields").hidden = settings.mode !== "api";
    modal.hidden = false;
  }

  function closeSettings() {
    document.getElementById("settings-modal").hidden = true;
  }

  // ------------------------------------------------------------------ mobile

  function openSidebar() {
    sidebar.classList.add("open");
    overlay.hidden = false;
  }

  function closeSidebar() {
    sidebar.classList.remove("open");
    overlay.hidden = true;
  }

  function toggleSidebar() {
    if (sidebar.classList.contains("open")) closeSidebar();
    else openSidebar();
  }

  // -------------------------------------------------------------------- init

  function init() {
    buildTOC();
    loadSettings();
    syncModeUI();

    retriever = R.createRetriever(RAG.chunks);

    const stats = DOC.stats || {};
    document.getElementById("doc-meta").innerHTML =
      `<span>${stats.headings || headings.length} 个章节 · ${stats.chunks || RAG.chunks.length} 个 RAG 块</span>` +
      `<span>生成于 ${new Date(DOC.generatedAt).toLocaleString("zh-CN")}</span>`;

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", () => {
      if (window.innerWidth > 900) closeSidebar();
      hideToolbar();
    });

    tocSearch.addEventListener("input", () => filterTOC(tocSearch.value));
    tocEl.addEventListener("click", (event) => {
      if (event.target.closest("a") && window.innerWidth <= 900) closeSidebar();
    });

    menuToggle.addEventListener("click", toggleSidebar);
    overlay.addEventListener("click", closeSidebar);

    docEl.addEventListener("mouseup", scheduleSelection);
    docEl.addEventListener("keyup", scheduleSelection);
    document.addEventListener("mousedown", (event) => {
      if (!toolbar.contains(event.target) && !panel.contains(event.target)) hideToolbar();
    });

    toolbar.addEventListener("mousedown", (event) => event.preventDefault());
    document.getElementById("explain-selection-btn").addEventListener("click", () => {
      if (!currentSelection) return;
      hideToolbar();
      runExplain(currentSelection);
    });
    document.getElementById("copy-selection").addEventListener("click", () => {
      if (currentSelection) copyText(currentSelection.text);
    });

    document.getElementById("explain-close").addEventListener("click", closePanel);
    panel.addEventListener("click", (event) => {
      if (event.target === panel) closePanel();
    });

    document.getElementById("settings-btn").addEventListener("click", openSettings);
    document.getElementById("settings-close").addEventListener("click", closeSettings);
    document.getElementById("settings-cancel").addEventListener("click", closeSettings);
    document.getElementById("settings-save").addEventListener("click", saveSettings);
    document.querySelectorAll('input[name="mode"]').forEach((input) => {
      input.addEventListener("change", () => {
        document.getElementById("api-fields").hidden =
          document.querySelector('input[name="mode"]:checked').value !== "api";
      });
    });

    docEl.addEventListener("click", (event) => {
      const button = event.target.closest(".copy-code");
      if (!button) return;
      const code = button.parentElement.querySelector("pre code");
      if (code) copyText(code.innerText);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if (!document.getElementById("settings-modal").hidden) closeSettings();
      else if (!panel.hidden) closePanel();
      else if (sidebar.classList.contains("open")) closeSidebar();
      else hideToolbar();
    });

    onScroll();
  }

  init();
})();
