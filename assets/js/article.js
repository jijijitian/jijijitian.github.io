/* ==========================================================================
   article.js —— 文章页交互：阅读进度、目录高亮、代码块复制
   ========================================================================== */
(function () {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* ---------------- 阅读进度条 ---------------- */
  function initProgress() {
    const bar = $("#readingProgress");
    const body = $("#articleBody");
    if (!bar || !body) return;

    let ticking = false;

    const update = () => {
      const rect = body.getBoundingClientRect();
      const start = window.scrollY + rect.top;
      const total = rect.height - window.innerHeight + 160;
      const progress = total > 0 ? (window.scrollY - start + 120) / total : 0;
      bar.style.width = `${Math.min(100, Math.max(0, progress * 100))}%`;
      ticking = false;
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
  }

  /* ---------------- 目录高亮 ---------------- */
  function initToc() {
    const toc = $(".toc");
    if (!toc || !("IntersectionObserver" in window)) return;

    const links = $$(".toc a", toc);
    const map = new Map();
    links.forEach((a) => {
      const id = a.getAttribute("href").slice(1);
      const heading = document.getElementById(id);
      if (heading) map.set(heading, a);
    });

    if (!map.size) {
      toc.hidden = true;
      return;
    }

    let current = null;

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const link = map.get(entry.target);
          if (!link || link === current) return;
          if (current) current.classList.remove("is-active");
          current = link;
          current.classList.add("is-active");
        });
      },
      { rootMargin: "-80px 0px -68% 0px", threshold: 0 }
    );

    map.forEach((_, heading) => io.observe(heading));
  }

  /* ---------------- 代码块复制 ---------------- */
  function initCodeCopy() {
    $$(".code-block").forEach((block) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "code-copy";
      btn.textContent = "复制";
      btn.setAttribute("aria-label", "复制代码");

      btn.addEventListener("click", async () => {
        const code = block.querySelector("code");
        if (!code) return;
        try {
          await navigator.clipboard.writeText(code.innerText);
          btn.textContent = "已复制";
          btn.classList.add("is-done");
        } catch {
          btn.textContent = "复制失败";
        }
        setTimeout(() => {
          btn.textContent = "复制";
          btn.classList.remove("is-done");
        }, 1600);
      });

      block.appendChild(btn);
    });
  }

  /* ---------------- 标题锚点平滑跳转 ---------------- */
  function initAnchorScroll() {
    document.addEventListener("click", (e) => {
      const link = e.target.closest('a[href^="#"]');
      if (!link) return;
      const id = decodeURIComponent(link.getAttribute("href").slice(1));
      const target = id && document.getElementById(id);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      history.replaceState(null, "", `#${id}`);
    });
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    initProgress();
    initToc();
    initCodeCopy();
    initAnchorScroll();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
