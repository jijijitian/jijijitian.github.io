/* ==========================================================================
   site.js —— 通用逻辑：主题、时钟、配置绑定、入场动画
   无构建、无依赖，直接以 <script> 引入即可。
   ========================================================================== */
(function () {
  "use strict";

  const cfg = window.SITE_CONFIG || {};
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* ---------------- 工具函数 ---------------- */
  const utils = {
    escapeHtml(str) {
      return String(str == null ? "" : str).replace(/[&<>"']/g, (c) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[c]));
    },

    /** 中文友好日期：2026年10月19日 */
    formatDate(input, opts = {}) {
      const d = input instanceof Date ? input : new Date(input);
      if (Number.isNaN(d.getTime())) return "";
      return new Intl.DateTimeFormat("zh-CN", {
        year: "numeric",
        month: opts.short ? "numeric" : "long",
        day: "numeric",
        ...opts,
      }).format(d);
    },

    /** 相对时间：3 天前 */
    timeAgo(input) {
      const d = new Date(input);
      if (Number.isNaN(d.getTime())) return "";
      const diff = Date.now() - d.getTime();
      const mins = Math.round(diff / 60000);
      if (mins < 1) return "刚刚";
      if (mins < 60) return `${mins} 分钟前`;
      const hours = Math.round(mins / 60);
      if (hours < 24) return `${hours} 小时前`;
      const days = Math.round(hours / 24);
      if (days < 30) return `${days} 天前`;
      const months = Math.round(days / 30);
      if (months < 12) return `${months} 个月前`;
      return `${Math.round(months / 12)} 年前`;
    },

    /** 带超时的 fetch（避免弱网下一直转圈） */
    async fetchJSON(url, { timeout = 9000, ...init } = {}) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeout);
      try {
        const res = await fetch(url, { ...init, signal: ctrl.signal });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return await res.json();
      } finally {
        clearTimeout(timer);
      }
    },

    /** 极简模板：把 #tpl-name 里的 <template> 克隆出来 */
    cloneTemplate(id) {
      const tpl = document.getElementById(id);
      return tpl ? tpl.content.firstElementChild.cloneNode(true) : null;
    },
  };

  window.siteUtils = utils;

  /* ---------------- 主题切换 ---------------- */
  function initTheme() {
    const root = document.documentElement;
    const toggle = $("#themeToggle");
    if (!toggle) return;

    const sync = () => {
      const isLight = root.dataset.theme === "light";
      toggle.setAttribute("aria-label", isLight ? "切换到深色主题" : "切换到浅色主题");
      toggle.title = isLight ? "切换到深色主题" : "切换到浅色主题";
      const meta = document.querySelector('meta[name="theme-color"]:not([media])');
      if (meta) meta.setAttribute("content", isLight ? "#f4f5f8" : "#0a0b0f");
    };

    toggle.addEventListener("click", () => {
      const next = root.dataset.theme === "light" ? "dark" : "light";
      root.dataset.theme = next;
      try {
        localStorage.setItem("theme", next);
      } catch (e) {}
      sync();
      document.dispatchEvent(new CustomEvent("themechange", { detail: next }));
    });

    // 用户没有手动选择时，跟随系统
    window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", (e) => {
      let saved = null;
      try {
        saved = localStorage.getItem("theme");
      } catch (err) {}
      if (!saved) {
        root.dataset.theme = e.matches ? "light" : "dark";
        sync();
      }
    });

    sync();
  }

  /* ---------------- 本地时钟 ---------------- */
  function initClock() {
    const timeEl = $("#clockTime");
    const dateEl = $("#clockDate");
    if (!timeEl) return;

    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "本地时间";
    const tzLabel = tz.split("/").pop().replace(/_/g, " ");
    const offsetMin = -new Date().getTimezoneOffset();

    const pad = (n) => String(n).padStart(2, "0");

    const tick = () => {
      const now = new Date();
      const h = now.getHours();
      const period = h < 6 ? "凌晨" : h < 12 ? "上午" : h < 14 ? "中午" : h < 18 ? "下午" : "晚上";
      timeEl.innerHTML = `${pad(h)}:${pad(now.getMinutes())}<small>${pad(now.getSeconds())}</small>`;
      timeEl.setAttribute("aria-label", `当前时间 ${pad(h)}:${pad(now.getMinutes())}`);

      if (dateEl) {
        const weekday = new Intl.DateTimeFormat("zh-CN", { weekday: "long" }).format(now);
        const date = new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric" }).format(now);
        const sign = offsetMin >= 0 ? "+" : "-";
        const abs = Math.abs(offsetMin);
        const offset = `UTC${sign}${Math.floor(abs / 60)}${abs % 60 ? ":" + pad(abs % 60) : ""}`;
        dateEl.textContent = `${period}好 · ${date} ${weekday} · ${offset}`;
      }
    };

    tick();
    setInterval(tick, 1000);

    // 时区名放到 clock 卡片的天气位
    const tzEl = $("#clockMetaTz");
    if (tzEl) tzEl.textContent = tzLabel;
  }

  /* ---------------- 配置绑定 ---------------- */
  function bindConfig() {
    // 文章页的标题由构建脚本写好，这里不覆盖
    if (!document.body.hasAttribute("data-title-lock") && cfg.siteTitle) {
      document.title = `${cfg.siteTitle} · 番剧、游戏与代码`;
    }

    const desc = document.querySelector('meta[name="description"]');
    if (desc && cfg.description) desc.setAttribute("content", cfg.description);

    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle && cfg.siteTitle) ogTitle.setAttribute("content", cfg.siteTitle);

    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc && cfg.description) ogDesc.setAttribute("content", cfg.description);

    $$("[data-bind]").forEach((el) => {
      const value = cfg[el.dataset.bind];
      if (value != null && value !== "") el.textContent = value;
    });

    $$("[data-bind-src]").forEach((el) => {
      const value = cfg[el.dataset.bindSrc];
      if (value) el.setAttribute("src", value);
    });

    $$("[data-bind-href]").forEach((el) => {
      const value = cfg[el.dataset.bindHref];
      if (value) el.setAttribute("href", value);
    });

    const tagsEl = $('[data-bind-tags="tags"]');
    if (tagsEl && Array.isArray(cfg.tags)) {
      tagsEl.innerHTML = cfg.tags
        .map((t) => `<span class="chip">${utils.escapeHtml(t)}</span>`)
        .join("");
    }

    const nowEl = $('[data-bind-now="nowDoing"]');
    if (nowEl && Array.isArray(cfg.nowDoing)) {
      nowEl.innerHTML = cfg.nowDoing
        .map(
          (item) => `
          <div class="now-item">
            <span class="now-item__emoji" aria-hidden="true">${utils.escapeHtml(item.emoji || "✨")}</span>
            <div>
              <p class="now-item__title">${utils.escapeHtml(item.title)}</p>
              ${item.note ? `<p class="now-item__note">${utils.escapeHtml(item.note)}</p>` : ""}
            </div>
          </div>`
        )
        .join("");
    }

    const socialEl = $('[data-bind-social="socials"]');
    if (socialEl && Array.isArray(cfg.socials)) {
      const icons = window.SITE_ICONS || {};
      socialEl.innerHTML = cfg.socials
        .map(
          (s) => `
          <a class="social-link" href="${utils.escapeHtml(s.href)}"
             ${/^https?:/.test(s.href) ? 'target="_blank" rel="noopener"' : ""}
             aria-label="${utils.escapeHtml(s.label)}">
            ${icons[s.icon] || icons.link || ""}
            <span>${utils.escapeHtml(s.label)}</span>
          </a>`
        )
        .join("");
    }

    // Bangumi 链接
    const bgmUser = cfg.bangumi && cfg.bangumi.username;
    const isPlaceholder = !bgmUser || /^(your_|your$)/.test(bgmUser);
    if (bgmUser && !isPlaceholder) {
      $$("[data-bind-href='bangumiUrl']").forEach((a) => {
        a.href = `https://bgm.tv/user/${encodeURIComponent(bgmUser)}`;
      });
      $$("[data-bind-href='bangumiAnimeUrl']").forEach((a) => {
        a.href = `https://bgm.tv/anime/list/${encodeURIComponent(bgmUser)}/collect`;
      });
      $$("[data-bind-href='bangumiGameUrl']").forEach((a) => {
        a.href = `https://bgm.tv/game/list/${encodeURIComponent(bgmUser)}/collect`;
      });
    }

    const yearEl = $("#year");
    if (yearEl) yearEl.textContent = new Date().getFullYear();
  }

  /* ---------------- 社交图标 ---------------- */
  window.SITE_ICONS = {
    github:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2C6.48 2 2 6.58 2 12.24c0 4.53 2.87 8.37 6.84 9.72.5.1.68-.22.68-.49 0-.24-.01-.87-.01-1.71-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.91-.63.07-.62.07-.62 1 .07 1.53 1.06 1.53 1.06.9 1.57 2.34 1.12 2.91.86.09-.66.35-1.12.63-1.38-2.22-.26-4.56-1.14-4.56-5.06 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.27 2.75 1.05a9.3 9.3 0 0 1 5 0c1.91-1.32 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.93-2.34 4.8-4.57 5.05.36.32.68.94.68 1.9 0 1.37-.01 2.47-.01 2.81 0 .27.18.6.69.49A10.02 10.02 0 0 0 22 12.24C22 6.58 17.52 2 12 2Z"/></svg>',
    bangumi:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.6" y="4.4" width="18.8" height="15.2" rx="3.4" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M7 9.2h3.4a2.2 2.2 0 0 1 0 4.4H7Zm0 4.4h3.8a2.2 2.2 0 0 1 0 4.4H7Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" transform="translate(0 -1.4)"/><circle cx="17.2" cy="11.2" r="1.35" fill="currentColor"/></svg>',
    mail:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.6" y="4.8" width="18.8" height="14.4" rx="2.8" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="m3.4 6.6 8.6 6.4 8.6-6.4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    rss:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19h.01" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/><path d="M4.4 10.6a9 9 0 0 1 9 9" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><path d="M4.4 5.4A14.2 14.2 0 0 1 18.6 19.6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
    link:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4.2 4.2 0 0 0 6 0l3-3a4.2 4.2 0 0 0-6-6l-1.2 1.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M14 10a4.2 4.2 0 0 0-6 0l-3 3a4.2 4.2 0 0 0 6 6l1.2-1.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  };

  /* ---------------- 入场动画 ---------------- */
  function initReveal() {
    const items = $$("[data-reveal]");
    if (!items.length) return;

    if (!("IntersectionObserver" in window)) {
      items.forEach((el) => el.classList.add("is-visible"));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 }
    );

    items.forEach((el) => io.observe(el));
  }

  /* ---------------- 鼠标高光 ---------------- */
  function initSpotlight() {
    if (window.matchMedia("(hover: none)").matches) return;
    $$(".tile").forEach((tile) => {
      tile.addEventListener("pointermove", (e) => {
        const rect = tile.getBoundingClientRect();
        tile.style.setProperty("--mx", `${((e.clientX - rect.left) / rect.width) * 100}%`);
        tile.style.setProperty("--my", `${((e.clientY - rect.top) / rect.height) * 100}%`);
      });
    });
  }

  /* ---------------- 顶栏滚动态 & 导航高亮 ---------------- */
  function initHeader() {
    const header = $("#siteHeader");
    if (header) {
      const onScroll = () => header.classList.toggle("is-scrolled", window.scrollY > 8);
      onScroll();
      window.addEventListener("scroll", onScroll, { passive: true });
    }

    const links = $$(".nav a[href^='#']");
    if (!links.length || !("IntersectionObserver" in window)) return;

    const map = new Map();
    links.forEach((link) => {
      const section = document.querySelector(link.getAttribute("href"));
      if (section) map.set(section, link);
    });

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          links.forEach((l) => l.classList.remove("is-active"));
          const active = map.get(entry.target);
          if (active) active.classList.add("is-active");
        });
      },
      { rootMargin: "-45% 0px -50% 0px" }
    );

    map.forEach((_, section) => io.observe(section));
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    bindConfig();
    initTheme();
    initClock();
    initReveal();
    initSpotlight();
    initHeader();

    if (window.BangumiWidget) {
      window.BangumiWidget.init();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
