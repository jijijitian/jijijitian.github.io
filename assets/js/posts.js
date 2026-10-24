/* ==========================================================================
   posts.js —— 首页「最近文章」列表
   文章清单由 scripts/build.mjs 生成的 posts/index.json 提供：
     [{ title, slug, date, tags, summary, url, readingTime }]
   ========================================================================== */
(function () {
  "use strict";

  const cfg = window.SITE_CONFIG || {};
  const postCfg = cfg.posts || {};
  const utils = window.siteUtils;
  const MANIFEST = postCfg.manifest || "posts/index.json";
  const LIMIT = 4;

  async function init() {
    const list = document.getElementById("postList");
    if (!list) return;

    try {
      const data = await utils.fetchJSON(MANIFEST, { timeout: 8000 });
      const posts = (Array.isArray(data) ? data : data.posts || []).slice(0, LIMIT);
      render(list, posts);
    } catch (err) {
      console.warn("[posts] 文章清单加载失败：", err && err.message);
      list.innerHTML = `<p class="media-empty">还没有文章。在 <code>posts/</code> 里新建一个 <code>.md</code> 文件，提交后自动出现。</p>`;
    }
  }

  function render(list, posts) {
    if (!posts.length) {
      list.innerHTML = `<p class="media-empty">还没有文章。在 <code>posts/</code> 里新建一个 <code>.md</code> 文件，提交后自动出现。</p>`;
      return;
    }

    list.innerHTML = posts
      .map((post) => {
        const date = new Date(post.date);
        const label = Number.isNaN(date.getTime())
          ? ""
          : `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(
              date.getDate()
            ).padStart(2, "0")}`;
        const tag = (post.tags && post.tags[0]) || post.category || "";
        return `
          <a class="post-row" href="${utils.escapeHtml(post.url || `posts/${post.slug}.html`)}">
            <span class="post-row__date">${label}</span>
            <span class="post-row__title">${utils.escapeHtml(post.title)}</span>
            <span class="post-row__tag">${utils.escapeHtml(tag)}</span>
          </a>`;
      })
      .join("");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
