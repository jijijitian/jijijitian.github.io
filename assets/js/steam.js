/* ==========================================================================
   steam.js —— 首页「Now playing」读取 Steam 最近在玩的游戏
   数据来自 scripts/sync-steam.mjs 生成的静态快照 assets/data/steam.json
   ========================================================================== */
(function () {
  "use strict";

  const cfg = window.SITE_CONFIG || {};
  const steam = cfg.steam || {};
  const utils = window.siteUtils;
  const SNAPSHOT = steam.snapshot || "assets/data/steam.json";
  const PROFILE = steam.profileUrl || "https://steamcommunity.com/";
  const LIMIT = Number(steam.limit) || 3;

  function formatDate(iso) {
    if (!iso) return "";
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return "";
    return `${Number(m[2])} 月 ${Number(m[3])} 日`;
  }

  /** 没有封面时生成一张带首字的渐变占位图，避免出现破图 */
  function placeholderCover(name) {
    const char = Array.from(String(name || "?").trim())[0] || "?";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="92" height="124" viewBox="0 0 92 124">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#1c2433"/><stop offset="1" stop-color="#2c2350"/>
        </linearGradient>
      </defs>
      <rect width="92" height="124" rx="8" fill="url(#g)"/>
      <text x="46" y="76" font-size="42" font-family="system-ui, sans-serif" font-weight="700"
            fill="#8b7cff" text-anchor="middle">${utils.escapeHtml(char)}</text>
    </svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  function itemHtml(game) {
    const bits = [];
    if (Number.isFinite(game.hours)) {
      bits.push(`<span class="score">${game.hours.toLocaleString("zh-CN")} 小时</span>`);
    }
    const played = formatDate(game.lastPlayed);
    if (played) bits.push(`<span>${utils.escapeHtml(played)}</span>`);

    return `
      <a class="media-item is-now" href="${utils.escapeHtml(game.url)}"
         target="_blank" rel="noopener" title="${utils.escapeHtml(game.name)}">
        <img class="media-item__cover" src="${utils.escapeHtml(game.cover || "")}"
             data-initial="${utils.escapeHtml(Array.from(String(game.name || "?"))[0] || "?")}"
             alt="${utils.escapeHtml(game.name)} 封面" loading="lazy" width="46" height="62">
        <span class="media-item__main">
          <span class="media-item__name">${utils.escapeHtml(game.name)}</span>
          <span class="media-item__sub">${bits.join('<span aria-hidden="true">·</span>')}</span>
        </span>
      </a>`;
  }

  function render(data) {
    const list = document.getElementById("gameList");
    const count = document.getElementById("gameCount");
    if (!list) return;

    const games = (data.games || []).slice(0, LIMIT);

    if (!games.length) {
      list.innerHTML = `<div class="media-empty">
        最近没有公开的 Steam 游戏记录 ——
        <a href="${utils.escapeHtml(PROFILE)}" target="_blank" rel="noopener">去 Steam 主页看看</a>
      </div>`;
    } else {
      list.innerHTML = games.map(itemHtml).join("");
      // 封面缺失 / 加载失败时换成本地生成的占位图
      list.querySelectorAll(".media-item__cover").forEach((img) => {
        img.addEventListener(
          "error",
          () => {
            img.src = placeholderCover(img.dataset.initial);
          },
          { once: true }
        );
      });
    }

    if (count) {
      if (games.length) {
        count.textContent = `Steam · 最近在玩 ${games.length} 款`;
        count.title = data.updatedAt
          ? `Steam 快照更新于 ${utils.timeAgo(data.updatedAt)}`
          : "Steam 最近在玩";
      } else {
        count.textContent = "Steam · 暂无记录";
      }
    }
  }

  function empty(message) {
    const list = document.getElementById("gameList");
    if (!list) return;
    list.innerHTML = `<div class="media-empty">
      ${utils.escapeHtml(message)}
    </div>`;
    const count = document.getElementById("gameCount");
    if (count) count.textContent = "Steam · 暂不可用";
  }

  async function init() {
    if (!document.getElementById("gameList")) return;

    try {
      const data = await utils.fetchJSON(SNAPSHOT, { timeout: 8000 });
      render(data);
    } catch (err) {
      console.warn("[steam] 快照加载失败：", err && err.message);
      empty("Steam 数据加载失败，运行 npm run steam 生成快照后再试。");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
