/* ==========================================================================
   bangumi.js —— 首页「正在追」与「正在玩」联动
   --------------------------------------------------------------------------
   数据来源优先级：
     1. 浏览器实时请求 Bangumi 公开 API（config.bangumi.live = true）
     2. 失败时回退到 assets/data/bangumi.json 快照
     3. 再失败则显示「示例数据」（本地开发的兜底，避免页面空荡）
   快照由 scripts/sync-bangumi.mjs 生成，GitHub Actions 每天刷新一次。
   ========================================================================== */
(function () {
  "use strict";

  const cfg = window.SITE_CONFIG || {};
  const bgm = cfg.bangumi || {};
  const utils = window.siteUtils;
  const $ = (s, r = document) => r.querySelector(s);

  const API = "https://api.bgm.tv/v0";
  const SUBJECT_URL = "https://bgm.tv/subject/";

  /* 用户还没填 Bangumi 用户名时视为未配置 */
  const UNCONFIGURED = /^(your_|your$|yourid$|$)/i;

  /* 番剧接口偶尔不给总集数，用配置的兜底值 */
  const FALLBACK_EPS = Number(bgm.fallbackEpisodes) || 12;

  const TYPE_LABEL = { 1: "想看", 2: "看过", 3: "在看", 4: "搁置", 5: "抛弃" };

  const isUnconfigured = !bgm.username || UNCONFIGURED.test(bgm.username);

  /* ---------------- 示例数据（仅在完全拿不到数据时使用） ---------------- */
  const demoDate = (daysAgo) =>
    new Date(Date.now() - daysAgo * 86400000).toISOString();

  const DEMO = {
    source: "demo",
    updatedAt: demoDate(1),
    user: { nickname: bgm.nickname || "yourid", username: bgm.username || "yourid" },
    totalAnime: 3,
    totalGame: 2,
    anime: [
      {
        id: 400602,
        name: "葬送的芙莉莲",
        nameCN: "葬送的芙莉莲",
        cover: "assets/img/demo/anime-frieren.jpg",
        score: 8.9,
        ep: 9,
        total: 28,
        type: 3,
        updatedAt: demoDate(1),
        url: "https://bgm.tv/subject/400602",
      },
      {
        id: 253,
        name: "星际牛仔",
        nameCN: "星际牛仔",
        cover: "assets/img/demo/anime-bebop.jpg",
        score: 9.1,
        ep: 12,
        total: 26,
        type: 3,
        updatedAt: demoDate(2),
        url: "https://bgm.tv/subject/253",
      },
      {
        id: 326,
        name: "攻壳机动队 S.A.C. 2nd GIG",
        nameCN: "攻壳机动队 S.A.C. 2nd GIG",
        cover: "assets/img/demo/anime-gits.jpg",
        score: 9.2,
        ep: 5,
        total: 26,
        type: 3,
        updatedAt: demoDate(4),
        url: "https://bgm.tv/subject/326",
      },
    ],
    game: [
      {
        id: 172808,
        name: "星露谷物语",
        nameCN: "星露谷物语",
        cover: "assets/img/demo/game-stardew.jpg",
        score: 8.6,
        ep: 0,
        total: 0,
        type: 3,
        updatedAt: demoDate(3),
        url: "https://bgm.tv/subject/172808",
      },
      {
        id: 274582,
        name: "空洞骑士：丝之歌",
        nameCN: "空洞骑士：丝之歌",
        cover: "assets/img/demo/game-silksong.jpg",
        score: 8.1,
        ep: 0,
        total: 0,
        type: 3,
        updatedAt: demoDate(9),
        url: "https://bgm.tv/subject/274582",
      },
    ],
  };

  /* ---------------- Bangumi → 统一结构 ---------------- */
  function normalize(item, kind) {
    const subject = item.subject || {};
    const nameCN = (subject.name_cn || "").trim();
    const name = (subject.name || "").trim();
    return {
      id: subject.id || item.subject_id,
      name: name || nameCN || "未命名",
      nameCN: nameCN || name,
      cover:
        (subject.images &&
          (subject.images.common || subject.images.medium || subject.images.small)) ||
        "",
      score: subject.score ? Number(subject.score) : null,
      date: subject.date || "",
      ep: Number(item.ep_status) || 0,
      total: Number(subject.eps) || (kind === "game" ? 0 : FALLBACK_EPS),
      status: TYPE_LABEL[item.type] || "",
      tags: (subject.tags || [])
        .map((t) => (typeof t === "string" ? t : t && t.name))
        .filter(Boolean),
      type: item.type,
      rate: item.rate || 0,
      comment: item.comment || "",
      updatedAt: item.updated_at || subject.date || "",
      url: subject.id ? SUBJECT_URL + subject.id : "https://bgm.tv/",
    };
  }

  const ADULT_TAGS = /(里番|18禁|R-?18|成人向|工口)/i;
  const hideAdult = bgm.hideAdult !== false;
  const isAdult = (entry) => hideAdult && entry.tags.some((t) => ADULT_TAGS.test(t));

  /** 只保留「在看 / 在玩」，优先展示进度未完成、最近更新的 */
  function pickActive(list, kind, limit) {
    const active = (list || [])
      .filter((item) => item && item.type === 3)
      .map((item) => normalize(item, kind))
      .filter((item) => item.id && !isAdult(item));

    active.sort((a, b) => {
      const doneA = a.total > 0 && a.ep >= a.total;
      const doneB = b.total > 0 && b.ep >= b.total;
      if (doneA !== doneB) return doneA ? 1 : -1;
      return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
    });

    return active.slice(0, limit);
  }

  /* ---------------- 数据获取 ---------------- */
  async function fetchCollection(username, subjectType) {
    const all = [];
    const limit = 50;
    let offset = 0;
    // 每页 50 条，最多拉 3 页（首页展示足够，也避免拖慢加载）
    for (let page = 0; page < 3; page++) {
      const url = `${API}/users/${encodeURIComponent(
        username
      )}/collections?subject_type=${subjectType}&type=3&limit=${limit}&offset=${offset}`;
      const data = await utils.fetchJSON(url, {
        headers: { Accept: "application/json" },
      });
      const items = Array.isArray(data) ? data : data.data || [];
      all.push(...items);
      if (items.length < limit) break;
      offset += limit;
    }
    return all;
  }

  async function loadLive() {
    if (isUnconfigured) throw new Error("Bangumi 用户名尚未配置");
    const [animeRaw, gameRaw] = await Promise.all([
      fetchCollection(bgm.username, 2),
      fetchCollection(bgm.username, 4),
    ]);
    const anime = animeRaw.filter((x) => x.type === 3);
    const game = gameRaw.filter((x) => x.type === 3);
    return {
      source: "live",
      updatedAt: new Date().toISOString(),
      user: { username: bgm.username },
      totalAnime: anime.length,
      totalGame: game.length,
      anime: pickActive(animeRaw, "anime", bgm.animeLimit || 3),
      game: pickActive(gameRaw, "game", bgm.gameLimit || 3),
    };
  }

  async function loadSnapshot() {
    if (!bgm.snapshot) throw new Error("没有配置快照路径");
    const data = await utils.fetchJSON(bgm.snapshot, { timeout: 6000 });
    if (!data || (!data.anime && !data.game)) throw new Error("快照为空");
    return { ...data, source: "snapshot" };
  }

  /* ---------------- 渲染 ---------------- */
  function progressPercent(entry) {
    if (!entry.total || entry.total <= 0) return entry.ep > 0 ? 20 : 0;
    return Math.min(100, Math.max(3, Math.round((entry.ep / entry.total) * 100)));
  }

  function itemHtml(entry, kind) {
    const title = entry.nameCN || entry.name;
    const bits =
      kind === "game"
        ? [
            entry.score ? `<span class="score">★ ${entry.score.toFixed(1)}</span>` : "",
            entry.date ? `<span>${utils.escapeHtml(String(entry.date).slice(0, 4))}</span>` : "",
            entry.status ? `<span>${utils.escapeHtml(entry.status)}</span>` : "",
          ]
        : [
            entry.score ? `<span class="score">★ ${entry.score.toFixed(1)}</span>` : "",
            entry.total ? `<span>共 ${entry.total} 话</span>` : "",
            entry.date ? `<span>${utils.escapeHtml(String(entry.date).slice(0, 4))}</span>` : "",
          ];

    const progress =
      kind === "anime"
        ? `<span class="media-item__progress"><i style="width:${progressPercent(entry)}%"></i></span>`
        : "";

    const ep =
      kind === "anime" && entry.ep > 0
        ? `<span class="media-item__ep">${entry.ep}${entry.total ? "/" + entry.total : ""}</span>`
        : "";

    return `
      <a class="media-item${entry.type === 3 ? " is-now" : ""}" href="${utils.escapeHtml(
        entry.url
      )}" target="_blank" rel="noopener" title="${utils.escapeHtml(entry.name)}">
        <img class="media-item__cover" src="${utils.escapeHtml(entry.cover)}"
             alt="${utils.escapeHtml(title)} 封面" loading="lazy" width="46" height="62"
             onerror="this.style.visibility='hidden'">
        <span class="media-item__main">
          <span class="media-item__name">${utils.escapeHtml(title)}</span>
          <span class="media-item__sub">${bits
            .filter(Boolean)
            .join('<span aria-hidden="true">·</span>')}</span>
          ${progress}
        </span>
        ${ep}
      </a>`;
  }

  function renderList(container, entries, kind) {
    if (!container) return;
    if (!entries || !entries.length) {
      container.innerHTML = `<div class="media-empty">这里还空着 —— 去 Bangumi 标记几部${
        kind === "anime" ? "在看的番" : "在玩的游戏"
      }吧。</div>`;
      return;
    }
    container.innerHTML = entries.map((e) => itemHtml(e, kind)).join("");
  }

  function setSourceChip(el, source, updatedAt) {
    if (!el) return;
    if (source === "live") {
      el.className = "chip chip--live";
      el.innerHTML = '<span class="dot-live"></span> Bangumi 实时';
      el.title = "数据直接来自 Bangumi 公开 API";
    } else if (source === "snapshot") {
      el.className = "chip";
      el.innerHTML = "Bangumi 快照";
      el.title = updatedAt ? `快照更新于 ${utils.timeAgo(updatedAt)}` : "本地快照数据";
    } else {
      el.className = "chip chip--demo";
      el.textContent = "示例数据";
      el.title =
        "当前为示例数据：在 assets/js/config.js 里把 bangumi.username 换成你的 Bangumi 用户名即可显示真实收藏。";
    }
  }

  /** 快照已是精简结构，API 数据也已归一化；这里兼容两种输入 */
  function ensureNormalized(list, kind) {
    return (list || []).map((item) => (item && item.subject ? normalize(item, kind) : item));
  }

  function render(data) {
    const animeLimit = bgm.animeLimit || 3;
    const gameLimit = bgm.gameLimit || 3;

    const anime = ensureNormalized(data.anime, "anime").slice(0, animeLimit);
    const game = ensureNormalized(data.game, "game").slice(0, gameLimit);

    renderList($("#animeList"), anime, "anime");
    renderList($("#gameList"), game, "game");

    const countEl = $("#animeCount");
    if (countEl) {
      const total = Number.isFinite(data.totalAnime) ? data.totalAnime : anime.length;
      countEl.textContent = total ? `${total} 部在追` : "暂无在追";
    }

    const gameCount = $("#gameCount");
    if (gameCount) {
      if (data.source === "demo") {
        gameCount.textContent = "示例数据 · 配置后自动同步";
      } else {
        const total = Number.isFinite(data.totalGame) ? data.totalGame : game.length;
        gameCount.textContent = `${total} 部在玩 · 更新于 ${utils.timeAgo(data.updatedAt)}`;
      }
    }

    setSourceChip($("#animeSource"), data.source, data.updatedAt);
  }

  /* ---------------- 主流程 ---------------- */
  async function init() {
    if (!$("#animeList") && !$("#gameList")) return;

    let data = null;

    if (bgm.live) {
      try {
        data = await loadLive();
      } catch (err) {
        console.warn("[bangumi] 实时数据获取失败，尝试快照：", err && err.message);
      }
    }

    if (!data) {
      try {
        data = await loadSnapshot();
      } catch (err) {
        console.warn("[bangumi] 快照不可用，使用示例数据：", err && err.message);
      }
    }

    if (!data) data = { ...DEMO };

    render(data);
  }

  window.BangumiWidget = { init };
})();
