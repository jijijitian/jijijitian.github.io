/* ==========================================================================
   archive.js —— 文章列表页：搜索 + 标签筛选 + 分页
   ========================================================================== */
(function () {
  "use strict";

  const PER_PAGE = 8;

  function init() {
    const container = document.getElementById("postCards");
    if (!container) return;

    const cards = Array.from(container.querySelectorAll(".post-card"));
    const search = document.getElementById("postSearch");
    const filters = Array.from(document.querySelectorAll(".filter__btn"));
    const empty = document.getElementById("archiveEmpty");
    const moreBtn = document.getElementById("loadMore");

    let keyword = "";
    let tag = "";
    let shown = PER_PAGE;

    const matches = (card) =>
      (!tag || (card.dataset.tags || "").split(",").includes(tag)) &&
      (!keyword || (card.dataset.search || "").includes(keyword));

    function apply() {
      let count = 0;
      const visible = [];

      cards.forEach((card) => {
        const ok = matches(card);
        card.hidden = true;
        if (ok) visible.push(card);
      });

      visible.forEach((card) => {
        if (count < shown) {
          card.hidden = false;
          count++;
        }
      });

      if (empty) empty.hidden = visible.length !== 0;
      if (moreBtn) moreBtn.hidden = visible.length <= shown;

      // 结果数量提示
      const desc = document.querySelector(".archive__desc");
      if (desc && (keyword || tag)) {
        const strong = desc.querySelector("strong");
        if (strong) strong.textContent = String(visible.length);
      }
    }

    search?.addEventListener("input", () => {
      keyword = search.value.trim().toLowerCase();
      shown = PER_PAGE;
      apply();
    });

    filters.forEach((btn) => {
      btn.addEventListener("click", () => {
        filters.forEach((b) => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        tag = btn.dataset.tag || "";
        shown = PER_PAGE;
        apply();
      });
    });

    moreBtn?.addEventListener("click", () => {
      shown += PER_PAGE;
      apply();
    });

    // 支持 ?q=关键词 与 ?tag=xxx 直接定位
    const params = new URLSearchParams(location.search);
    const urlQ = (params.get("q") || "").trim();
    if (urlQ) {
      keyword = urlQ.toLowerCase();
      if (search) search.value = urlQ;
      shown = PER_PAGE;
    }

    const urlTag = params.get("tag");
    if (urlTag) {
      const btn = filters.find((b) => b.dataset.tag === urlTag);
      if (btn) btn.click();
    }

    apply();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
