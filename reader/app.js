(function () {
  "use strict";

  const DOC = globalThis.READER_DOC;
  const RAG = globalThis.RAG_DATA;
  const R = globalThis.ReaderExplain;

  const docEl = document.getElementById("doc");
  const tocEl = document.getElementById("toc");
  const chapterListEl = document.getElementById("chapter-list");
  const sectionListEl = document.getElementById("section-list");
  const sectionLabel = document.getElementById("section-label");
  const tocCount = document.getElementById("toc-count");
  const contentSearch = document.getElementById("content-search");
  const searchResults = document.getElementById("search-results");
  const chapterSelect = document.getElementById("chapter-select");
  const sidebar = document.getElementById("sidebar");
  const sidebarResizer = document.getElementById("sidebar-resizer");
  const overlay = document.getElementById("overlay");
  const menuToggle = document.getElementById("menu-toggle");
  const progress = document.getElementById("reading-progress");
  const standaloneLink = document.getElementById("standalone-link");

  const toolbar = document.getElementById("selection-toolbar");
  const panel = document.getElementById("explain-panel");
  const panelStatus = document.getElementById("explain-status");
  const panelAnswer = document.getElementById("explain-answer");
  const panelSources = document.getElementById("explain-sources");
  const panelSelection = document.getElementById("explain-selection");
  const panelMode = document.getElementById("explain-mode");
  const panelFloatBtn = document.getElementById("panel-float");
  const panelPinBtn = document.getElementById("panel-pin");
  const panelResizer = document.getElementById("panel-resizer");
  const floatResizer = document.getElementById("float-resizer");
  const modeBadge = document.getElementById("mode-badge");
  const toastEl = document.getElementById("toast");

  if (!DOC || !RAG || !R) {
    document.body.innerHTML =
      '<p style="padding:40px;font-family:sans-serif">加载失败：content.js / rag.js / explain.js 未生成。请先运行 <code>python reader/build_reader.py</code>。</p>';
    return;
  }

  const chapters =
    DOC.chapters && DOC.chapters.length
      ? DOC.chapters
      : [{ id: "sec-1", title: DOC.title || "正文", html: DOC.html || "" }];

  const chapterById = new Map(chapters.map((ch) => [ch.id, ch]));
  const anchorChapter = new Map();
  for (const ch of chapters) {
    for (const match of ch.html.matchAll(/id="([^"]+)"/g)) {
      anchorChapter.set(match[1], ch);
    }
  }

  let currentChapter = null;
  let headings = [];
  let headingLinks = new Map();
  let activeId = null;
  let retriever = null;
  let currentSelection = null;
  let selectionTimer = null;
  let searchTimer = null;
  let searchQuery = "";
  let lastResults = [];
  let lastLocal = null;
  let drag = null;

  const tocLevels = { 1: true, 2: true, 3: true };

  const panelState = {
    mode: "docked",
    pinned: false,
    width: 430,
    floatRect: null,
  };

  const UI_KEY = "modal-reader.ui.v1";
  const SETTINGS_KEY = "modal-reader.settings.v1";
  const KEY_KEY = "modal-reader.api-key.v1";

  const PROVIDERS = {
    openai: {
      label: "OpenAI",
      endpoint: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
    },
    deepseek: {
      label: "DeepSeek",
      endpoint: "https://api.deepseek.com",
      model: "deepseek-chat",
    },
    openrouter: {
      label: "OpenRouter",
      endpoint: "https://openrouter.ai/api/v1",
      model: "openai/gpt-4o-mini",
    },
    siliconflow: {
      label: "SiliconFlow",
      endpoint: "https://api.siliconflow.cn/v1",
      model: "Qwen/Qwen2.5-7B-Instruct",
    },
    custom: { label: "自定义", endpoint: "", model: "" },
  };

  const MODE_LABELS = {
    local: "本地 RAG",
    direct: "内置 API",
    proxy: "代理",
  };

  const settings = {
    mode: "local",
    provider: "openai",
    directEndpoint: PROVIDERS.openai.endpoint,
    proxyEndpoint: "/api/explain",
    model: PROVIDERS.openai.model,
    apiKey: "",
  };

  document.title = `${DOC.title} · 交互讲义`;
  standaloneLink.href = "content.html";

  // ------------------------------------------------------------------ utils

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (ch) => {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
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

  function saveUI() {
    try {
      localStorage.setItem(
        UI_KEY,
        JSON.stringify({
          sidebarWidth: parseInt(
            getComputedStyle(document.documentElement).getPropertyValue("--sidebar-w"),
            10
          ) || 300,
          tocLevels,
          panelMode: panelState.mode,
          panelPinned: panelState.pinned,
          panelWidth: panelState.width,
          floatRect: panelState.floatRect,
        })
      );
    } catch (_) {}
  }

  // --------------------------------------------------------------- chapters

  function buildChapterSelect() {
    chapterSelect.innerHTML = "";
    for (const ch of chapters) {
      const option = document.createElement("option");
      option.value = ch.id;
      option.textContent = ch.title;
      chapterSelect.appendChild(option);
    }
  }

  function updateStandaloneLink(anchor) {
    const target = anchor || (currentChapter ? currentChapter.id : "");
    standaloneLink.href = target ? `content.html#${target}` : "content.html";
  }

  function buildTOC() {
    chapterListEl.innerHTML = "";
    sectionListEl.innerHTML = "";
    headingLinks = new Map();

    for (const ch of chapters) {
      const li = document.createElement("li");
      li.className = "toc-chapter level-1" + (currentChapter && ch.id === currentChapter.id ? " current" : "");
      const a = document.createElement("a");
      a.href = `#${ch.id}`;
      a.textContent = ch.title;
      a.dataset.anchor = ch.id;
      li.appendChild(a);
      chapterListEl.appendChild(li);
      headingLinks.set(ch.id, a);
    }

    const subs = headings.filter((h) => /^H[23]$/.test(h.tagName));
    const stack = [{ level: 1, ul: sectionListEl }];

    for (const heading of subs) {
      const level = Number(heading.tagName.slice(1));
      while (stack.length > 1 && stack[stack.length - 1].level >= level) {
        stack.pop();
      }
      const parent = stack[stack.length - 1].ul;

      const li = document.createElement("li");
      li.className = `toc-section level-${level}`;
      const a = document.createElement("a");
      a.href = `#${heading.id}`;
      a.dataset.anchor = heading.id;
      const titleEl = heading.querySelector(".heading-text");
      a.textContent = (titleEl ? titleEl.textContent : heading.textContent)
        .replace(/#$/, "")
        .trim();
      li.appendChild(a);
      parent.appendChild(li);
      headingLinks.set(heading.id, a);

      if (level < 3) {
        const child = document.createElement("ul");
        li.appendChild(child);
        stack.push({ level, ul: child });
      }
    }

    sectionLabel.hidden = subs.length === 0;
    tocCount.textContent = `${chapters.length} 章 · ${subs.length} 节`;
    applyTocLevels();
    updateStandaloneLink(activeId || (currentChapter ? currentChapter.id : ""));
  }

  function applyTocLevels() {
    chapterListEl.hidden = !tocLevels[1];
    sectionLabel.hidden =
      !(tocLevels[2] || tocLevels[3]) || sectionListEl.children.length === 0;

    for (const li of sectionListEl.querySelectorAll("li.toc-section")) {
      const level = Number((li.className.match(/level-(\d)/) || [0, 0])[1]);
      li.classList.toggle("hidden", !tocLevels[level]);
    }
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
      const tocRect = tocEl.getBoundingClientRect();
      if (rect.top < tocRect.top + 8 || rect.bottom > tocRect.bottom - 8) {
        link.scrollIntoView({ block: "nearest" });
      }
    }
    updateStandaloneLink(id);
  }

  function onScroll() {
    if (!headings.length) return;
    const y = window.scrollY + 110;
    let current = headings[0];
    for (const heading of headings) {
      const top = heading.getBoundingClientRect().top + window.scrollY;
      if (top <= y) current = heading;
      else break;
    }
    if (current) setActive(current.id);

    const max = document.documentElement.scrollHeight - window.innerHeight;
    progress.style.width = `${max > 0 ? Math.min(100, (window.scrollY / max) * 100) : 0}%`;
  }

  function scrollToAnchor(anchor, smooth) {
    const target = document.getElementById(anchor);
    if (!target) return;
    const top = target.getBoundingClientRect().top + window.scrollY - 82;
    window.scrollTo({ top: Math.max(0, top), behavior: smooth === false ? "instant" : "smooth" });
    setActive(anchor);
  }

  function renderChapter(chapterId, targetAnchor, push) {
    const chapter = chapterById.get(chapterId);
    if (!chapter) return;

    if (!panel.hidden && !panelState.pinned) closePanel();

    currentChapter = chapter;
    docEl.innerHTML = chapter.html;
    headings = Array.from(docEl.querySelectorAll("h1, h2, h3"));
    activeId = null;
    buildTOC();
    chapterSelect.value = chapter.id;
    updateStandaloneLink(targetAnchor || chapter.id);

    if (targetAnchor) {
      const target = document.getElementById(targetAnchor);
      if (target) {
        window.scrollTo({
          top: Math.max(0, target.getBoundingClientRect().top + window.scrollY - 82),
          behavior: "instant",
        });
        setActive(targetAnchor);
      }
    } else {
      window.scrollTo({ top: 0, behavior: "instant" });
    }

    if (push) {
      const hash = targetAnchor || chapter.id;
      history.pushState(null, "", `#${hash}`);
    }
    if (searchQuery) flashQuery(searchQuery);
    onScroll();
  }

  function navigateToAnchor(anchor, push) {
    const chapter = anchorChapter.get(anchor);
    if (!chapter) return false;
    if (!currentChapter || currentChapter.id !== chapter.id) {
      renderChapter(chapter.id, anchor, push);
    } else {
      scrollToAnchor(anchor, true);
      if (push) history.pushState(null, "", `#${anchor}`);
      updateStandaloneLink(anchor);
      if (searchQuery) flashQuery(searchQuery);
    }
    return true;
  }

  function routeFromHash(initial) {
    const anchor = decodeURIComponent(location.hash.slice(1));
    if (!anchor) {
      renderChapter(chapters[0].id, null, false);
      return;
    }
    const chapter = anchorChapter.get(anchor);
    if (!chapter) {
      renderChapter(chapters[0].id, null, false);
      return;
    }
    if (initial || !currentChapter || currentChapter.id !== chapter.id) {
      renderChapter(chapter.id, anchor, false);
    } else {
      scrollToAnchor(anchor, false);
    }
  }

  // ----------------------------------------------------------------- search

  function escapeRegExp(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function snippetFor(text, query) {
    const lower = text.toLowerCase();
    const q = query.toLowerCase();
    let index = lower.indexOf(q);
    if (index < 0) index = 0;
    const start = Math.max(0, index - 48);
    const end = Math.min(text.length, index + query.length + 70);
    const before = text.slice(start, index);
    const hit = text.slice(index, index + query.length);
    const after = text.slice(index + query.length, end);
    return `${start > 0 ? "…" : ""}${escapeHtml(before)}<mark>${escapeHtml(hit)}</mark>${escapeHtml(
      after
    )}${end < text.length ? "…" : ""}`;
  }

  function runSearch(query) {
    searchQuery = query;
    const q = query.trim();
    if (!q) {
      searchResults.hidden = true;
      tocEl.hidden = false;
      return;
    }

    const ql = q.toLowerCase();
    const hits = [];
    for (const chunk of RAG.chunks) {
      const haystack = `${chunk.section}\n${chunk.text}`.toLowerCase();
      const index = haystack.indexOf(ql);
      if (index === -1) continue;
      let score = 1;
      if (chunk.section.toLowerCase().includes(ql)) score += 3;
      if (chunk.text.toLowerCase().startsWith(ql)) score += 2;
      if (index < 80) score += 1;
      hits.push({ chunk, score });
    }
    hits.sort((a, b) => b.score - a.score);

    tocEl.hidden = true;
    searchResults.hidden = false;
    searchResults.innerHTML = "";

    const meta = document.createElement("div");
    meta.className = "search-meta";
    meta.textContent = hits.length
      ? `正文中找到 ${hits.length} 个相关块，显示前 ${Math.min(15, hits.length)} 个`
      : "没有找到匹配的正文内容";
    searchResults.appendChild(meta);

    for (const { chunk } of hits.slice(0, 15)) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "search-result";
      const textForSnippet = chunk.text.toLowerCase().includes(ql) ? chunk.text : chunk.section;
      button.innerHTML =
        `<span class="search-title">${escapeHtml(chunk.section)}</span>` +
        `<span class="search-snippet">${snippetFor(textForSnippet, q)}</span>`;
      button.addEventListener("click", () => {
        navigateToAnchor(chunk.anchor, true);
        flashQuery(q);
        if (window.innerWidth <= 900) closeSidebar();
      });
      searchResults.appendChild(button);
    }
  }

  function flashQuery(query) {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return;
    const blocks = Array.from(docEl.querySelectorAll("p, li, td, pre, h1, h2, h3"));
    const target = blocks.find((el) => el.textContent.toLowerCase().includes(q));
    if (!target) return;
    target.classList.remove("search-flash");
    void target.offsetWidth;
    target.classList.add("search-flash");
    setTimeout(() => target.classList.remove("search-flash"), 2400);
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
      if (!text || text.length > 900) {
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
        heading: heading
          ? (heading.querySelector(".heading-text") || heading).textContent
          : "",
        context: blockText(range.startContainer),
      };
      showToolbar(rect);
    }, 10);
  }

  // ------------------------------------------------------------------ panel

  function clampFloatRect(rect) {
    const width = clamp(rect.width || 460, 320, Math.min(760, window.innerWidth - 24));
    const height = clamp(rect.height || 560, 280, Math.max(300, window.innerHeight - 100));
    const left = clamp(rect.left || window.innerWidth - width - 28, 8, window.innerWidth - width - 8);
    const top = clamp(rect.top || 96, 72, Math.max(72, window.innerHeight - height - 8));
    return { left, top, width, height };
  }

  function applyPanelLayout() {
    const mobile = window.innerWidth <= 900;
    const mode = mobile ? "docked" : panelState.mode;

    panel.classList.toggle("docked", mode !== "floating");
    panel.classList.toggle("floating", mode === "floating");
    document.documentElement.style.setProperty("--panel-w", `${panelState.width}px`);

    if (mode === "floating") {
      if (!panelState.floatRect) {
        panelState.floatRect = clampFloatRect({
          left: window.innerWidth - 480,
          top: 96,
          width: 460,
          height: 560,
        });
      }
      const rect = clampFloatRect(panelState.floatRect);
      panelState.floatRect = rect;
      panel.style.left = `${rect.left}px`;
      panel.style.top = `${rect.top}px`;
      panel.style.width = `${rect.width}px`;
      panel.style.height = `${rect.height}px`;
    } else {
      panel.style.left = "";
      panel.style.top = "";
      panel.style.width = "";
      panel.style.height = "";
    }

    panelFloatBtn.textContent = panelState.mode === "floating" ? "停靠" : "浮窗";
    panelFloatBtn.setAttribute("aria-pressed", String(panelState.mode === "floating"));
    panelFloatBtn.disabled = mobile;
    panelPinBtn.textContent = panelState.pinned ? "取消钉住" : "钉住";
    panelPinBtn.setAttribute("aria-pressed", String(panelState.pinned));
  }

  function closePanel() {
    panel.hidden = true;
  }

  function updateSourceAnchor(anchor) {
    const chapter = anchorChapter.get(anchor);
    if (!chapter) return;
    if (!currentChapter || currentChapter.id !== chapter.id) {
      renderChapter(chapter.id, anchor, true);
    } else {
      scrollToAnchor(anchor, true);
      history.pushState(null, "", `#${anchor}`);
    }
    if (!panelState.pinned) closePanel();
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
      button.addEventListener("click", () => updateSourceAnchor(source.anchor));
      panelSources.appendChild(button);
    }
  }

  function setPanelStatus(text, kind) {
    panelStatus.textContent = text;
    panelStatus.className = "panel-status" + (kind ? ` ${kind}` : "");
  }

  function renderLocal(ans, note) {
    panelMode.textContent = note ? "本地 RAG（回退）" : MODE_LABELS[settings.mode] || "本地 RAG";
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

  async function callForSelection(selection, results, cfg) {
    const payload = {
      selection: selection.text,
      heading: selection.heading,
      context: results.map((r) => ({ section: r.chunk.section, text: r.chunk.text })),
      results,
    };
    if (cfg.mode === "proxy") {
      if (!cfg.proxyEndpoint) throw new Error("未配置代理地址");
      return R.callProxy(cfg.proxyEndpoint, payload);
    }
    if (cfg.mode === "direct") {
      if (!cfg.directEndpoint) throw new Error("未配置 API 地址");
      return R.callOpenAI(cfg.directEndpoint, cfg.apiKey, cfg.model, payload);
    }
    throw new Error("未选择 API 模式");
  }

  function runExplain(selection) {
    panel.hidden = false;
    applyPanelLayout();
    panelSelection.textContent = selection.text;
    panelAnswer.innerHTML = "";
    panelSources.innerHTML = "";
    panelMode.textContent = MODE_LABELS[settings.mode] || "本地 RAG";
    setPanelStatus("正在检索讲义并生成解释…", "loading");

    lastResults = retriever.search(`${selection.text} ${selection.heading || ""}`, 5);
    lastLocal = R.answer(selection.text, lastResults);

    if (settings.mode === "local") {
      renderLocal(lastLocal);
      return;
    }

    setPanelStatus(
      `正在调用${MODE_LABELS[settings.mode]}（失败会自动回退到本地 RAG）…`,
      "loading"
    );
    callForSelection(selection, lastResults, settings)
      .then((text) => renderApi(text, lastLocal.sources))
      .catch((err) => {
        renderLocal(
          lastLocal,
          `API 调用失败，已回退到本地 RAG：${err && err.message ? err.message : err}`
        );
      });
  }

  // ---------------------------------------------------------------- settings

  function loadSettings() {
    try {
      const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
      if (stored && typeof stored === "object") {
        if (stored.mode === "api") {
          const endpoint = typeof stored.endpoint === "string" ? stored.endpoint : "";
          settings.mode = isProxyEndpoint(endpoint) ? "proxy" : "direct";
        } else if (["local", "direct", "proxy"].includes(stored.mode)) {
          settings.mode = stored.mode;
        }
        if (typeof stored.provider === "string" && PROVIDERS[stored.provider]) {
          settings.provider = stored.provider;
        }
        if (typeof stored.directEndpoint === "string") {
          settings.directEndpoint = stored.directEndpoint;
        } else if (typeof stored.endpoint === "string" && !isProxyEndpoint(stored.endpoint)) {
          settings.directEndpoint = stored.endpoint;
        }
        if (typeof stored.proxyEndpoint === "string") {
          settings.proxyEndpoint = stored.proxyEndpoint;
        } else if (typeof stored.endpoint === "string" && isProxyEndpoint(stored.endpoint)) {
          settings.proxyEndpoint = stored.endpoint;
        }
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
    settings.provider = document.getElementById("api-provider").value;
    settings.directEndpoint =
      document.getElementById("api-endpoint").value.trim() ||
      (PROVIDERS[settings.provider] ? PROVIDERS[settings.provider].endpoint : "");
    settings.proxyEndpoint =
      document.getElementById("api-proxy-endpoint").value.trim() || "/api/explain";
    settings.model =
      document.getElementById("api-model").value.trim() ||
      (PROVIDERS[settings.provider] ? PROVIDERS[settings.provider].model : "gpt-4o-mini");
    settings.apiKey = document.getElementById("api-key").value.trim();

    try {
      localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify({
          mode: settings.mode,
          provider: settings.provider,
          directEndpoint: settings.directEndpoint,
          proxyEndpoint: settings.proxyEndpoint,
          model: settings.model,
        })
      );
      if (settings.apiKey) sessionStorage.setItem(KEY_KEY, settings.apiKey);
      else sessionStorage.removeItem(KEY_KEY);
    } catch (_) {}

    syncModeUI();
    document.getElementById("settings-modal").hidden = true;
    showToast(`已切换到${MODE_LABELS[settings.mode] || settings.mode}`);
  }

  function syncModeUI() {
    const label = MODE_LABELS[settings.mode] || "本地 RAG";
    modeBadge.textContent = label;
    panelMode.textContent = label;
  }

  function updateSettingsVisibility() {
    const mode = document.querySelector('input[name="mode"]:checked');
    const current = mode ? mode.value : "local";
    document.getElementById("api-fields").hidden = current === "local";
    document.getElementById("direct-fields").hidden = current !== "direct";
    document.getElementById("proxy-fields").hidden = current !== "proxy";
    const status = document.getElementById("api-test-status");
    status.textContent = "";
    status.className = "api-test-status";
  }

  function applyProviderPreset() {
    const provider = document.getElementById("api-provider").value;
    const preset = PROVIDERS[provider];
    if (!preset || !preset.endpoint) return;
    document.getElementById("api-endpoint").value = preset.endpoint;
    document.getElementById("api-model").value = preset.model;
    settings.provider = provider;
    settings.directEndpoint = preset.endpoint;
    settings.model = preset.model;
  }

  async function testApiConnection() {
    const button = document.getElementById("api-test");
    const status = document.getElementById("api-test-status");
    const endpoint = document.getElementById("api-endpoint").value.trim();
    const model = document.getElementById("api-model").value.trim() || "gpt-4o-mini";
    const key = document.getElementById("api-key").value.trim();

    status.className = "api-test-status";
    if (!endpoint) {
      status.textContent = "请先填写 API 地址";
      status.classList.add("error");
      return;
    }

    button.disabled = true;
    status.textContent = "连接中…";
    try {
      const reply = await R.testConnection(endpoint, key, model);
      status.textContent = `连接成功：${reply}`;
      status.classList.add("ok");
    } catch (err) {
      status.textContent = err && err.message ? err.message : String(err);
      status.classList.add("error");
    } finally {
      button.disabled = false;
    }
  }

  function openSettings() {
    const modal = document.getElementById("settings-modal");
    document.querySelectorAll('input[name="mode"]').forEach((input) => {
      input.checked = input.value === settings.mode;
    });
    document.getElementById("api-provider").value = settings.provider;
    document.getElementById("api-endpoint").value = settings.directEndpoint;
    document.getElementById("api-model").value = settings.model;
    document.getElementById("api-key").value = settings.apiKey;
    document.getElementById("api-proxy-endpoint").value = settings.proxyEndpoint;
    updateSettingsVisibility();
    modal.hidden = false;
  }

  function closeSettings() {
    document.getElementById("settings-modal").hidden = true;
  }

  function isProxyEndpoint(endpoint) {
    const e = String(endpoint || "").trim();
    return e.startsWith("/") || /\/api\/explain\/?$/.test(e);
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

  // -------------------------------------------------------------- panel drag

  function startPanelResize(event) {
    if (window.innerWidth <= 900) return;
    event.preventDefault();
    drag = {
      type: "panel-width",
      startX: event.clientX,
      startWidth: panelState.width,
    };
    panelResizer.classList.add("dragging");
  }

  function startPanelDrag(event) {
    if (panelState.mode !== "floating" || window.innerWidth <= 900) return;
    if (event.target.closest("button") || event.target.closest("input")) return;
    if (!event.target.closest(".panel-head")) return;
    if (!panelState.floatRect) return;
    event.preventDefault();
    const rect = clampFloatRect(panelState.floatRect);
    drag = {
      type: "float-move",
      startX: event.clientX,
      startY: event.clientY,
      left: rect.left,
      top: rect.top,
    };
  }

  function startFloatResize(event) {
    if (panelState.mode !== "floating") return;
    if (!panelState.floatRect) return;
    event.preventDefault();
    const rect = clampFloatRect(panelState.floatRect);
    drag = {
      type: "float-resize",
      startX: event.clientX,
      startY: event.clientY,
      width: rect.width,
      height: rect.height,
    };
  }

  function startSidebarResize(event) {
    if (window.innerWidth <= 900) return;
    event.preventDefault();
    drag = {
      type: "sidebar",
      startX: event.clientX,
      startWidth: sidebar.getBoundingClientRect().width,
    };
    sidebarResizer.classList.add("dragging");
  }

  function handlePointerMove(event) {
    if (!drag) return;

    if (drag.type === "sidebar") {
      const width = clamp(drag.startWidth + event.clientX - drag.startX, 220, 480);
      document.documentElement.style.setProperty("--sidebar-w", `${width}px`);
    } else if (drag.type === "panel-width") {
      const width = clamp(drag.startWidth - (event.clientX - drag.startX), 320, 760);
      panelState.width = width;
      document.documentElement.style.setProperty("--panel-w", `${width}px`);
    } else if (drag.type === "float-move") {
      const width = panelState.floatRect ? panelState.floatRect.width : 460;
      const height = panelState.floatRect ? panelState.floatRect.height : 560;
      const rect = clampFloatRect({
        left: drag.left + event.clientX - drag.startX,
        top: drag.top + event.clientY - drag.startY,
        width,
        height,
      });
      panelState.floatRect = rect;
      panel.style.left = `${rect.left}px`;
      panel.style.top = `${rect.top}px`;
    } else if (drag.type === "float-resize") {
      const rect = clampFloatRect({
        left: panelState.floatRect.left,
        top: panelState.floatRect.top,
        width: drag.width + event.clientX - drag.startX,
        height: drag.height + event.clientY - drag.startY,
      });
      panelState.floatRect = rect;
      panel.style.width = `${rect.width}px`;
      panel.style.height = `${rect.height}px`;
    }
  }

  function handlePointerUp() {
    if (!drag) return;
    if (drag.type === "panel-width") {
      panelResizer.classList.remove("dragging");
    }
    if (drag.type === "sidebar") {
      sidebarResizer.classList.remove("dragging");
    }
    drag = null;
    saveUI();
    applyPanelLayout();
  }

  // -------------------------------------------------------------------- init

  function init() {
    buildChapterSelect();
    loadSettings();
    syncModeUI();
    retriever = R.createRetriever(RAG.chunks);

    try {
      const ui = JSON.parse(localStorage.getItem(UI_KEY) || "null");
      if (ui && typeof ui === "object") {
        const width = Number(ui.sidebarWidth);
        if (Number.isFinite(width)) {
          document.documentElement.style.setProperty("--sidebar-w", `${clamp(width, 220, 480)}px`);
        }
        for (const level of [1, 2, 3]) {
          if (typeof ui.tocLevels?.[level] === "boolean") {
            tocLevels[level] = ui.tocLevels[level];
          }
        }
        if (ui.panelMode === "floating" || ui.panelMode === "docked") {
          panelState.mode = ui.panelMode;
        }
        panelState.pinned = Boolean(ui.panelPinned);
        const pw = Number(ui.panelWidth);
        if (Number.isFinite(pw)) panelState.width = clamp(pw, 320, 760);
        if (ui.floatRect && Number.isFinite(Number(ui.floatRect.left))) {
          panelState.floatRect = clampFloatRect({
            left: Number(ui.floatRect.left),
            top: Number(ui.floatRect.top),
            width: Number(ui.floatRect.width) || 460,
            height: Number(ui.floatRect.height) || 560,
          });
        }
      }
    } catch (_) {}

    document.querySelectorAll(".toc-levels input").forEach((input) => {
      const level = Number(input.dataset.level);
      input.checked = tocLevels[level];
      input.addEventListener("change", () => {
        tocLevels[level] = input.checked;
        applyTocLevels();
        saveUI();
      });
    });

    applyPanelLayout();

    const stats = DOC.stats || {};
    document.getElementById("doc-meta").innerHTML =
      `<span>${stats.chapters || chapters.length} 章 · ${stats.headings || 0} 节 · ${
        stats.chunks || RAG.chunks.length
      } 个 RAG 块</span>` +
      `<span>生成于 ${new Date(DOC.generatedAt).toLocaleString("zh-CN")}</span>`;

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", () => {
      if (window.innerWidth > 900) closeSidebar();
      const width = parseInt(
        getComputedStyle(document.documentElement).getPropertyValue("--sidebar-w"),
        10
      );
      if (Number.isFinite(width)) {
        document.documentElement.style.setProperty("--sidebar-w", `${clamp(width, 220, 480)}px`);
      }
      applyPanelLayout();
      hideToolbar();
    });

    chapterSelect.addEventListener("change", () => {
      navigateToAnchor(chapterSelect.value, true);
    });

    contentSearch.addEventListener("input", () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => runSearch(contentSearch.value), 120);
    });

    chapterListEl.addEventListener("click", handleTocClick);
    sectionListEl.addEventListener("click", handleTocClick);

    menuToggle.addEventListener("click", toggleSidebar);
    overlay.addEventListener("click", closeSidebar);

    docEl.addEventListener("mouseup", scheduleSelection);
    docEl.addEventListener("keyup", scheduleSelection);
    document.addEventListener("mousedown", (event) => {
      if (!toolbar.contains(event.target) && !panel.contains(event.target)) hideToolbar();
      if (
        !panel.hidden &&
        !panelState.pinned &&
        !panel.contains(event.target) &&
        !toolbar.contains(event.target) &&
        !document.getElementById("settings-modal").contains(event.target)
      ) {
        closePanel();
      }
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
    panelFloatBtn.addEventListener("click", () => {
      panelState.mode = panelState.mode === "floating" ? "docked" : "floating";
      if (panelState.mode === "floating") {
        panelState.floatRect = clampFloatRect({
          left: window.innerWidth - 480,
          top: 96,
          width: 460,
          height: 560,
        });
      }
      applyPanelLayout();
      saveUI();
    });
    panelPinBtn.addEventListener("click", () => {
      panelState.pinned = !panelState.pinned;
      applyPanelLayout();
      saveUI();
      showToast(panelState.pinned ? "已钉住解释面板" : "已取消钉住");
    });

    panelResizer.addEventListener("pointerdown", startPanelResize);
    document.querySelector(".panel-head").addEventListener("pointerdown", startPanelDrag);
    floatResizer.addEventListener("pointerdown", startFloatResize);
    sidebarResizer.addEventListener("pointerdown", startSidebarResize);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    document.getElementById("settings-btn").addEventListener("click", openSettings);
    document.getElementById("settings-close").addEventListener("click", closeSettings);
    document.getElementById("settings-cancel").addEventListener("click", closeSettings);
    document.getElementById("settings-save").addEventListener("click", saveSettings);
    document.querySelectorAll('input[name="mode"]').forEach((input) => {
      input.addEventListener("change", updateSettingsVisibility);
    });
    document.getElementById("api-provider").addEventListener("change", applyProviderPreset);
    document.getElementById("api-test").addEventListener("click", testApiConnection);

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

    window.addEventListener("hashchange", () => routeFromHash(false));

    routeFromHash(true);
    onScroll();
  }

  function handleTocClick(event) {
    const link = event.target.closest("a[data-anchor]");
    if (!link) return;
    event.preventDefault();
    navigateToAnchor(link.dataset.anchor, true);
    if (window.innerWidth <= 900) closeSidebar();
  }

  init();
})();
