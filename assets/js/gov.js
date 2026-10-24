/* ==========================================================================
   gov.js —— 政务风首页交互
   轮播、要闻标签、公告日期卡、热门推荐、文章索引、长者版、返回顶部
   ========================================================================== */
(function () {
  "use strict";

  const cfg = window.SITE_CONFIG || {};
  const utils = window.siteUtils;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  let posts = [];
  let nowItems = [];
  let bangumi = null;
  let steam = null;

  /* ---------------- 小工具 ---------------- */
  function escapeHtml(value) {
    return utils ? utils.escapeHtml(value) : String(value || "");
  }

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function dateParts(value) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return {
      day: pad(d.getDate()),
      month: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`,
      label: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    };
  }

  /* ---------------- 日期 ---------------- */
  function initDate() {
    const el = $("#govDate");
    if (!el) return;
    const now = new Date();
    el.textContent = new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "long",
    }).format(now);
    el.dateTime = now.toISOString().slice(0, 10);
  }

  /* ---------------- 长者版 ---------------- */
  function initSenior() {
    const btn = $("#govSenior");
    if (!btn) return;
    const root = document.documentElement;
    const KEY = "gov-senior";
    let enabled = false;
    try {
      enabled = localStorage.getItem(KEY) === "1";
    } catch (e) {}

    const sync = () => {
      root.classList.toggle("gov-senior", enabled);
      btn.textContent = enabled ? "标准版" : "长者版";
      btn.setAttribute("aria-pressed", String(enabled));
    };

    btn.addEventListener("click", () => {
      enabled = !enabled;
      try {
        localStorage.setItem(KEY, enabled ? "1" : "0");
      } catch (e) {}
      sync();
    });

    sync();
  }

  /* ---------------- 轮播 ---------------- */
  function initCarousel() {
    const carousel = $("#govCarousel");
    if (!carousel) return;
    const slides = $$(".gov-slide", carousel);
    const dots = $$(".gov-dot", carousel);
    if (slides.length < 2) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let index = 0;
    let timer = null;

    const show = (next) => {
      index = (next + slides.length) % slides.length;
      slides.forEach((slide, i) => {
        const active = i === index;
        slide.classList.toggle("is-active", active);
        slide.setAttribute("aria-hidden", String(!active));
      });
      dots.forEach((dot, i) => {
        const active = i === index;
        dot.classList.toggle("is-active", active);
        dot.setAttribute("aria-selected", String(active));
      });
    };

    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    const start = () => {
      if (reduce || timer) return;
      timer = setInterval(() => show(index + 1), 8000);
    };

    $("#govNext")?.addEventListener("click", () => {
      show(index + 1);
      stop();
      start();
    });
    $("#govPrev")?.addEventListener("click", () => {
      show(index - 1);
      stop();
      start();
    });
    dots.forEach((dot) => {
      dot.addEventListener("click", () => {
        show(Number(dot.dataset.goto) || 0);
        stop();
        start();
      });
    });

    carousel.addEventListener("mouseenter", stop);
    carousel.addEventListener("mouseleave", start);
    carousel.addEventListener("focusin", stop);
    carousel.addEventListener("focusout", start);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stop();
      else start();
    });

    start();
  }

  /* ---------------- 要闻动态 ---------------- */
  function renderNews() {
    const body = $("#govNewsBody");
    if (!body) return;
    if (!posts.length) {
      body.innerHTML = '<p class="media-empty">还没有公开文章。</p>';
      return;
    }

    const lead = posts[0];
    const rest = posts.slice(1, 6);

    body.innerHTML = `
      <a class="gov-news__lead" href="${escapeHtml(lead.url)}">
        <span class="gov-news-item__title">${escapeHtml(lead.title)}</span>
        <p class="gov-news__summary">${escapeHtml(lead.summary || "")}</p>
      </a>
      ${rest
        .map(
          (post) => `
        <a class="gov-news-item" href="${escapeHtml(post.url)}">
          <span class="gov-news-item__title">${escapeHtml(post.title)}</span>
          <span class="gov-news-item__date">${dateParts(post.date)?.label || ""}</span>
        </a>`
        )
        .join("")}
      <a class="gov-more" href="posts/">更多文章 +</a>
    `;
  }

  function renderNow() {
    const body = $("#govNewsBody");
    if (!body) return;
    if (!nowItems.length) {
      body.innerHTML = '<p class="media-empty">暂未填写个人动态。</p>';
      return;
    }
    body.innerHTML = `
      ${nowItems
        .map(
          (item) => `
        <div class="gov-now-item">
          <p class="gov-now-item__title">${escapeHtml(item.emoji || "·")} ${escapeHtml(item.title)}</p>
          ${item.note ? `<p class="gov-now-item__note">${escapeHtml(item.note)}</p>` : ""}
        </div>`
        )
        .join("")}
      <a class="gov-more" href="#about">了解我 +</a>
    `;
  }

  function initNewsTabs() {
    const tabs = $$(".gov-news .gov-tab");
    if (!tabs.length) return;

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        tabs.forEach((t) => {
          t.classList.toggle("is-active", t === tab);
          t.setAttribute("aria-selected", String(t === tab));
        });
        if (tab.dataset.tab === "now") renderNow();
        else renderNews();
      });
    });
  }

  /* ---------------- 公告日期卡 ---------------- */
  function announceItems(type) {
    if (type === "anime") {
      return (bangumi?.anime || []).slice(0, 4).map((item) => ({
        title: item.nameCN || item.name,
        date: item.updatedAt,
        url: item.url || "#bangumi",
      }));
    }
    if (type === "games") {
      return (steam?.games || []).slice(0, 4).map((item) => ({
        title: item.name,
        date: item.lastPlayed,
        url: item.url || "#games",
      }));
    }
    return posts.slice(0, 4).map((post) => ({
      title: post.title,
      date: post.date,
      url: post.url,
    }));
  }

  function renderDateCards(type = "posts") {
    const grid = $("#govDateGrid");
    if (!grid) return;
    const items = announceItems(type);

    if (!items.length) {
      grid.innerHTML = '<p class="media-empty" style="grid-column:1/-1">暂时没有可展示的内容。</p>';
      return;
    }

    grid.innerHTML = items
      .map((item) => {
        const d = dateParts(item.date);
        return `
          <a class="gov-date-card" href="${escapeHtml(item.url)}">
            <span class="gov-date-card__date">
              <span class="gov-date-card__day">${d ? d.day : "—"}</span>
              <span class="gov-date-card__month">${d ? d.month : ""}</span>
            </span>
            <span class="gov-date-card__title">${escapeHtml(item.title)}</span>
          </a>`;
      })
      .join("");
  }

  function initAnnounceTabs() {
    const tabs = $$(".gov-announce-tabs .gov-tab");
    if (!tabs.length) return;
    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        tabs.forEach((t) => {
          t.classList.toggle("is-active", t === tab);
          t.setAttribute("aria-selected", String(t === tab));
        });
        renderDateCards(tab.dataset.announce || "posts");
      });
    });
  }

  /* ---------------- 热门推荐 ---------------- */
  function renderRecommend() {
    const list = $("#govRecommend");
    if (!list) return;
    const items = posts.slice(1, 6);
    if (!items.length) {
      list.innerHTML = '<p class="media-empty">暂无推荐。</p>';
      return;
    }
    list.innerHTML = items
      .map(
        (post) => `
        <div class="gov-recommend__item">
          <a href="${escapeHtml(post.url)}">${escapeHtml(post.title)}</a>
          <span>${dateParts(post.date)?.label || ""}</span>
        </div>`
      )
      .join("");
  }

  /* ---------------- 文章索引 ---------------- */
  let docTag = "all";
  let docKeyword = "";

  function renderDocList() {
    const list = $("#govDocList");
    if (!list) return;

    const keyword = docKeyword.trim().toLowerCase();
    const items = posts
      .filter((post) => {
        if (docTag !== "all" && !(post.tags || []).includes(docTag)) return false;
        if (!keyword) return true;
        const haystack = `${post.title} ${post.summary || ""} ${(post.tags || []).join(" ")}`.toLowerCase();
        return haystack.includes(keyword);
      })
      .slice(0, 7);

    if (!items.length) {
      list.innerHTML = '<p class="media-empty">没有匹配的文章。</p>';
      return;
    }

    list.innerHTML = items
      .map(
        (post) => `
        <a class="gov-doc-item" href="${escapeHtml(post.url)}">
          <span class="gov-doc-item__title">${escapeHtml(post.title)}</span>
          <span class="gov-doc-item__date">${dateParts(post.date)?.label || ""}</span>
        </a>`
      )
      .join("");
  }

  function initDocControls() {
    const tabs = $$(".gov-doc-tab");
    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        tabs.forEach((t) => t.classList.toggle("is-active", t === tab));
        docTag = tab.dataset.docTag || "all";
        renderDocList();
      });
    });

    const search = $("#govDocSearch");
    if (search) {
      search.addEventListener("input", () => {
        docKeyword = search.value || "";
        renderDocList();
      });
    }
  }

  /* ---------------- 数据 ---------------- */
  function setStat(name, value) {
    if (!Number.isFinite(value)) return;
    $$(`[data-stat="${name}"]`).forEach((el) => {
      if (el.textContent !== String(value)) el.textContent = String(value);
    });
  }

  function initStats() {
    setStat("posts", posts.length);

    const start = cfg.startDate ? new Date(cfg.startDate) : null;
    if (start && !Number.isNaN(start.getTime())) {
      const days = Math.max(1, Math.ceil((Date.now() - start.getTime()) / 86400000));
      setStat("days", days);
    }

    const animeEl = $("#animeCount");
    if (animeEl) {
      const updateAnime = () => {
        const m = animeEl.textContent.match(/(\d+)/);
        if (m) setStat("anime", Number(m[1]));
      };
      updateAnime();
      new MutationObserver(updateAnime).observe(animeEl, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    }

    const gameList = $("#gameList");
    if (gameList) {
      const updateGames = () => {
        setStat("games", gameList.querySelectorAll(".media-item").length);
      };
      updateGames();
      new MutationObserver(updateGames).observe(gameList, { childList: true, subtree: true });
    }
  }

  /* ---------------- 返回顶部 ---------------- */
  function initTop() {
    const btn = $("#govTop");
    if (!btn) return;
    const sync = () => btn.classList.toggle("is-visible", window.scrollY > 600);
    sync();
    window.addEventListener("scroll", sync, { passive: true });
    btn.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  /* ---------------- 启动 ---------------- */
  async function init() {
    initDate();
    initSenior();
    initCarousel();
    initNewsTabs();
    initAnnounceTabs();
    initDocControls();
    initTop();

    nowItems = Array.isArray(cfg.nowDoing) ? cfg.nowDoing : [];

    const [postResult, bgmResult, steamResult] = await Promise.allSettled([
      utils.fetchJSON("posts/index.json", { timeout: 8000 }),
      utils.fetchJSON("assets/data/bangumi.json", { timeout: 8000 }),
      utils.fetchJSON("assets/data/steam.json", { timeout: 8000 }),
    ]);

    if (postResult.status === "fulfilled") {
      const data = postResult.value;
      posts = Array.isArray(data) ? data : data.posts || [];
    } else {
      console.warn("[gov] 文章清单加载失败：", postResult.reason?.message);
    }

    if (bgmResult.status === "fulfilled") bangumi = bgmResult.value;
    if (steamResult.status === "fulfilled") steam = steamResult.value;

    renderNews();
    renderDateCards("posts");
    renderRecommend();
    renderDocList();
    initStats();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
