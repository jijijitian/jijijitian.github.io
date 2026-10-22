/* ==========================================================================
   gov.js —— 政务风首页交互
   轮播、要闻标签页、长者版、返回顶部、数据统计
   ========================================================================== */
(function () {
  "use strict";

  const cfg = window.SITE_CONFIG || {};
  const utils = window.siteUtils;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  let posts = [];
  let nowItems = [];

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
      timer = setInterval(() => show(index + 1), 6500);
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

  /* ---------------- 要闻列表 ---------------- */
  function dateLabel(post) {
    const d = new Date(post.date);
    if (Number.isNaN(d.getTime())) return "";
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;
  }

  function escapeHtml(value) {
    return utils ? utils.escapeHtml(value) : String(value || "");
  }

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
          <span class="gov-news-item__date">${dateLabel(post)}</span>
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

  function initTabs() {
    const tabs = $$(".gov-tab");
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
    initTabs();
    initTop();

    try {
      const data = await utils.fetchJSON("posts/index.json", { timeout: 8000 });
      posts = Array.isArray(data) ? data : data.posts || [];
    } catch (err) {
      console.warn("[gov] 文章清单加载失败：", err && err.message);
      posts = [];
    }

    nowItems = Array.isArray(cfg.nowDoing) ? cfg.nowDoing : [];
    renderNews();
    initStats();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
