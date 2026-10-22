#!/usr/bin/env node
/**
 * build.mjs —— 零依赖静态站点构建
 *
 * 做四件事：
 *   1. 读取 posts/*.md（带 front-matter），渲染成 posts/<slug>.html
 *   2. 生成文章列表 posts/index.html 和 posts/index.json
 *   3. 生成 feed.xml / sitemap.xml / robots.txt
 *   4. 清理上次生成、这次已经不存在的旧文章页
 *
 * 用法：
 *   node scripts/build.mjs
 *   node scripts/build.mjs --base-url https://name.github.io/repo/
 *   node scripts/build.mjs --drafts     # 连草稿一起构建（本地预览用）
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { marked } from "./vendor/marked.mjs";
import hljs from "./vendor/hljs.cjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

/* 源文件 */
const POSTS_SRC = path.join(ROOT, "posts");
const MANIFEST_FILE = path.join(ROOT, ".build-manifest.json");

/* 输出目录：构建产物全部写进 dist/，GitHub Pages 直接发布它 */
const DIST = path.join(ROOT, process.env.OUT_DIR || "dist");
const DIST_POSTS = path.join(DIST, "posts");
const POSTS_PER_PAGE = 8;

/* ------------------------------------------------------------------ */
/* 参数与配置                                                          */
/* ------------------------------------------------------------------ */
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const arg = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : null;
};

const INCLUDE_DRAFTS = flag("drafts");

async function loadSiteConfig() {
  const code = await fs.readFile(path.join(ROOT, "assets/js/config.js"), "utf8");
  const sandbox = {};
  // config.js 只做 window.SITE_CONFIG = {...}，在沙箱里执行很安全
  new Function("window", code)(sandbox);
  return sandbox.SITE_CONFIG || {};
}

const site = await loadSiteConfig();
const BASE_URL = (
  process.env.SITE_URL ||
  arg("base-url") ||
  site.url ||
  "https://example.github.io/"
)
  .replace(/\/+$/, "")
  .replace(/\/index\.html$/, "");

/** 站点在域名下的路径（项目页是 /repo/，用户页是 /），用于 404 这类无法依赖相对路径的页面 */
const BASE_PATH = new URL(`${BASE_URL}/`).pathname;

const SITE = {
  name: site.name || "血小板埋埋",
  fullName: site.fullName || site.name || "血小板埋埋",
  title: site.siteTitle || "血小板埋埋的小站",
  description: site.description || "番剧、游戏与代码的个人角落。",
  lang: site.lang || "zh-CN",
  avatar: site.avatar || "assets/img/avatar.png",
  bangumiUrl: site.bangumi?.username
    ? `https://bgm.tv/user/${site.bangumi.username}`
    : "https://bgm.tv/",
};

/* ------------------------------------------------------------------ */
/* 小工具                                                              */
/* ------------------------------------------------------------------ */
const escapeHtml = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));

const escapeXml = (s) =>
  String(s ?? "").replace(/[<>&'"]/g, (c) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    "'": "&apos;",
    '"': "&quot;",
  }[c]));

const stripMarkdown = (md) =>
  String(md ?? "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/[#>*_`~|-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const slugify = (text, used) => {
  let base = String(text || "")
    .toLowerCase()
    .trim()
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (!base) base = "section";
  let slug = base;
  let i = 2;
  while (used.has(slug)) slug = `${base}-${i++}`;
  used.add(slug);
  return slug;
};

const pad = (n) => String(n).padStart(2, "0");

function formatDate(date, style = "long") {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  if (style === "short") return `${y}.${pad(m)}.${pad(d)}`;
  return `${y} 年 ${m} 月 ${d} 日`;
}

/** 中英文混排字数统计 + 预计阅读时间 */
function readingStats(text) {
  const plain = stripMarkdown(text);
  const cjk = (plain.match(/[\u4e00-\u9fff]/g) || []).length;
  const words = plain
    .replace(/[\u4e00-\u9fff]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
  const chars = plain.replace(/\s/g, "").length;
  const minutes = Math.max(1, Math.round((cjk + words * 1.6) / 380));
  return { chars, minutes };
}

const encodePath = (p) => p.split("/").map(encodeURIComponent).join("/");

/* ------------------------------------------------------------------ */
/* front-matter 解析（YAML 的一个小子集）                              */
/* ------------------------------------------------------------------ */
function parseFrontMatter(raw) {
  const text = raw.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const match = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!match) return { data: {}, body: text };

  const data = {};
  let key = null;

  for (const line of match[1].split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) continue;

    const listItem = line.match(/^\s*-\s+(.*)$/);
    if (listItem && key) {
      if (!Array.isArray(data[key])) data[key] = [];
      data[key].push(unquote(listItem[1]));
      continue;
    }

    const kv = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!kv) continue;
    key = kv[1].toLowerCase();
    const value = kv[2].trim();

    if (!value) {
      data[key] = "";
    } else if (/^\[.*\]$/.test(value)) {
      data[key] = value
        .slice(1, -1)
        .split(",")
        .map((v) => unquote(v.trim()))
        .filter(Boolean);
    } else if (/^["'].*["']$/.test(value)) {
      data[key] = unquote(value);
    } else if (/^(true|false)$/i.test(value)) {
      data[key] = value.toLowerCase() === "true";
    } else {
      data[key] = value;
    }
  }

  return { data, body: text.slice(match[0].length) };
}

function unquote(v) {
  return String(v).replace(/^["']|["']$/g, "").trim();
}

/* ------------------------------------------------------------------ */
/* Markdown 渲染                                                       */
/* ------------------------------------------------------------------ */
const usedIds = new Set();

const renderer = {
  heading({ tokens, depth }) {
    const inline = this.parser.parseInline(tokens);
    const plain = stripMarkdown(inline);
    const id = slugify(plain, usedIds);
    return `<h${depth} id="${id}"><a class="anchor" href="#${id}" aria-hidden="true" tabindex="-1">#</a>${inline}</h${depth}>\n`;
  },

  code({ text, lang }) {
    const language = (lang || "").split(/\s+/)[0];
    let highlighted;
    try {
      highlighted =
        language && hljs.getLanguage(language)
          ? hljs.highlight(text, { language, ignoreIllegals: true }).value
          : hljs.highlightAuto(text).value;
    } catch {
      highlighted = escapeHtml(text);
    }
    const label = language || "text";
    return `<div class="code-block" data-lang="${escapeHtml(label)}"><pre><code class="hljs language-${escapeHtml(
      label
    )}">${highlighted}</code></pre></div>\n`;
  },

  image({ href, title, text }) {
    const src = resolveAsset(href);
    const alt = escapeHtml(stripMarkdown(text) || "");
    const t = title ? ` title="${escapeHtml(title)}"` : "";
    return `<figure class="figure"><img src="${escapeHtml(src)}" alt="${alt}"${t} loading="lazy" decoding="async"><figcaption>${alt}</figcaption></figure>\n`;
  },

  link({ href, title, tokens }) {
    const text = this.parser.parseInline(tokens);
    const t = title ? ` title="${escapeHtml(title)}"` : "";
    const external = /^https?:\/\//i.test(href);
    const cleanHref = href.replace(/\.md(?=#|$)/, ".html");
    return `<a href="${escapeHtml(cleanHref)}"${t}${external ? ' target="_blank" rel="noopener"' : ""}>${text}</a>`;
  },
};

marked.use({
  gfm: true,
  breaks: false,
  renderer,
  mangle: false,
  headerIds: false,
});

/** 文章里的图片路径：相对 posts/ 目录解析 */
function resolveAsset(src) {
  if (!src) return "";
  if (/^(https?:|data:|mailto:|#)/i.test(src)) return src;
  const clean = src.replace(/^\.?\//, "");
  return `../${clean}`;
}

function renderMarkdown(body) {
  usedIds.clear();
  let html = marked.parse(body);
  // 表格包一层，方便横向滚动
  html = html
    .replace(/<table>/g, '<div class="table-wrap"><table>')
    .replace(/<\/table>/g, "</table></div>");
  return html;
}

/* 抽取目录（h2 / h3） */
function extractToc(html) {
  const items = [];
  const re = /<h([23]) id="([^"]+)">([\s\S]*?)<\/h\1>/g;
  let m;
  while ((m = re.exec(html))) {
    const text = stripMarkdown(m[3]);
    if (!text) continue;
    items.push({ level: Number(m[1]), id: m[2], text });
  }
  return items;
}

/* ------------------------------------------------------------------ */
/* 文章加载                                                            */
/* ------------------------------------------------------------------ */
async function loadPosts() {
  let entries = [];
  try {
    entries = await fs.readdir(POSTS_SRC, { withFileTypes: true });
  } catch {
    return [];
  }

  const posts = [];

  for (const entry of entries) {
    if (!entry.isFile() || !/\.md$/i.test(entry.name)) continue;

    const file = path.join(POSTS_SRC, entry.name);
    const raw = await fs.readFile(file, "utf8");
    const { data, body } = parseFrontMatter(raw);

    const fileSlug = entry.name.replace(/\.md$/i, "");
    const slug = String(data.slug || fileSlug).trim();
    const draft = data.draft === true;

    if (draft && !INCLUDE_DRAFTS) continue;

    const date = new Date(data.date || "");
    const fallbackDate = (await fs.stat(file)).mtime;
    const finalDate = Number.isNaN(date.getTime()) ? fallbackDate : date;

    const html = renderMarkdown(body);
    const toc = extractToc(html);
    const stats = readingStats(body);

    const summary = String(
      data.summary || data.description || stripMarkdown(body).slice(0, 110)
    ).trim();

    const tags = Array.isArray(data.tags)
      ? data.tags
      : String(data.tags || "")
          .split(/[,，]/)
          .map((t) => t.trim())
          .filter(Boolean);

    posts.push({
      slug,
      file: entry.name,
      title: data.title || fileSlug,
      date: finalDate,
      dateText: formatDate(finalDate),
      dateShort: formatDate(finalDate, "short"),
      iso: finalDate.toISOString(),
      tags,
      draft,
      pinned: data.pinned === true,
      cover: data.cover ? resolveAsset(String(data.cover)) : "",
      summary,
      html,
      toc,
      minutes: stats.minutes,
      chars: stats.chars,
      url: `${encodePath(slug)}.html`,
    });
  }

  posts.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.date - a.date;
  });

  return posts;
}

/* ------------------------------------------------------------------ */
/* 页面模板                                                            */
/* ------------------------------------------------------------------ */
const ICON = {
  moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 1 0 9.79 9.79Z" fill="currentColor"/>',
  sun: '<circle cx="12" cy="12" r="4.2" fill="currentColor"/><g stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4 17 7M7 17l-1.6 1.6"/></g>',
  arrow: '<path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  back: '<path d="M19 12H6M11 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
};

function headHtml({ title, description, canonical, type = "website", image, prefix = "../" }) {
  return `<!DOCTYPE html>
<html lang="${SITE.lang}" data-theme="light">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta name="author" content="${escapeHtml(SITE.fullName)}" />
    ${canonical ? `<link rel="canonical" href="${escapeHtml(canonical)}" />` : ""}
    <meta property="og:type" content="${type}" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    ${image ? `<meta property="og:image" content="${escapeHtml(image)}" />` : ""}
    <meta name="twitter:card" content="summary_large_image" />
    <link rel="icon" href="${prefix}${escapeHtml(SITE.avatar)}" type="image/png" />
    <link rel="alternate" type="application/rss+xml" title="${escapeHtml(SITE.title)} · RSS" href="${prefix}feed.xml" />
    <link rel="stylesheet" href="${prefix}assets/css/base.css" />
    <link rel="stylesheet" href="${prefix}assets/css/gov.css" />
    <link rel="stylesheet" href="${prefix}assets/css/article.css" />
    <link rel="stylesheet" href="${prefix}assets/css/gov-page.css" />
  </head>`;
}

function headerHtml(active, prefix = "../") {
  const link = (href, label, key) =>
    `<a href="${href}"${active === key ? ' class="is-active"' : ""}>${label}</a>`;
  return `  <div class="gsub-top">
    <div class="wrap">
      <span class="gsub-badge">个人网站 · 非政府官方</span>
      <div class="gsub-toplinks">
        <a href="${prefix}">首页</a>
        <a href="${prefix}posts/">文章公开</a>
        <a href="${prefix}feed.xml">RSS</a>
        <a href="${escapeHtml(SITE.bangumiUrl)}" target="_blank" rel="noopener">Bangumi</a>
      </div>
    </div>
  </div>
  <header class="gsub-head">
    <div class="wrap">
      <a class="gsub-brand" href="${prefix}" aria-label="回到首页">
        <span class="gsub-seal" aria-hidden="true">埋</span>
        <span class="gsub-brand__text">
          <strong>${escapeHtml(SITE.title)}</strong>
          <em>PERSONAL PORTAL</em>
        </span>
      </a>
      <nav class="gsub-nav" aria-label="主导航">
        <a href="${prefix}">首页</a>
        ${link(`${prefix}posts/`, "文章公开", "posts")}
        ${link(`${prefix}#bangumi`, "追番记录", "bangumi")}
        ${link(`${prefix}#games`, "游戏天地", "games")}
        ${link(`${prefix}#contact`, "互动交流", "now")}
      </nav>
    </div>
  </header>`;
}

function footerHtml(prefix = "../") {
  return `  <footer class="gsub-footer">
    <div class="wrap">
      <div class="gsub-footer__links">
        <a href="${prefix}">首页</a>
        <a href="${prefix}posts/">文章公开</a>
        <a href="${prefix}feed.xml">RSS</a>
        <a href="https://github.com/jijijitian" target="_blank" rel="noopener">GitHub</a>
        <a href="${escapeHtml(SITE.bangumiUrl)}" target="_blank" rel="noopener">Bangumi</a>
      </div>
      <p class="gsub-footer__note">本站为个人网站，非政府官方网站；页面版式仅为个人审美尝试，不代表任何机构。</p>
      <p>© ${new Date().getFullYear()} ${escapeHtml(SITE.fullName)} · ${escapeHtml(SITE.title)} · 由 GitHub Pages 提供托管</p>
    </div>
  </footer>`;
}

const SCRIPTS = `    <script src="../assets/js/config.js"></script>
    <script src="../assets/js/site.js"></script>
    <script src="../assets/js/article.js"></script>`;

const ARCHIVE_SCRIPTS = `    <script src="../assets/js/config.js"></script>
    <script src="../assets/js/site.js"></script>
    <script src="../assets/js/archive.js"></script>`;

/* ------------------------------------------------------------------ */
/* 文章页                                                              */
/* ------------------------------------------------------------------ */
function articlePage(post, prev, next) {
  const tags = post.tags
    .map((t) => `<span class="chip">${escapeHtml(t)}</span>`)
    .join("");

  const toc =
    post.toc.length >= 2
      ? `<aside class="toc" aria-label="目录">
          <p class="toc__title">本文目录</p>
          <ol>
            ${post.toc
              .map(
                (item) =>
                  `<li class="toc__item toc__item--h${item.level}"><a href="#${item.id}">${escapeHtml(
                    item.text
                  )}</a></li>`
              )
              .join("\n            ")}
          </ol>
        </aside>`
      : "";

  const nav = `
    <nav class="post-nav" aria-label="文章导航">
      ${
        prev
          ? `<a class="post-nav__link post-nav__link--prev" href="${encodePath(prev.slug)}.html">
              <span class="post-nav__hint">← 上一篇</span>
              <span class="post-nav__title">${escapeHtml(prev.title)}</span>
            </a>`
          : `<span></span>`
      }
      ${
        next
          ? `<a class="post-nav__link post-nav__link--next" href="${encodePath(next.slug)}.html">
              <span class="post-nav__hint">下一篇 →</span>
              <span class="post-nav__title">${escapeHtml(next.title)}</span>
            </a>`
          : `<span></span>`
      }
    </nav>`;

  return `${headHtml({
    title: `${post.title} · ${SITE.title}`,
    description: post.summary,
    canonical: `${BASE_URL}/posts/${encodePath(post.slug)}.html`,
    type: "article",
    image: post.cover || `${BASE_URL}/${SITE.avatar.replace(/^\.?\//, "")}`,
  })}
  <body class="page-article" data-title-lock>
    <div class="reading-progress" id="readingProgress" aria-hidden="true"></div>
${headerHtml("posts")}

    <main class="wrap article-layout">
      <article class="post">
        <nav class="breadcrumb" aria-label="面包屑">
          <a href="../">首页</a>
          <span>/</span>
          <a href="./">文章</a>
          <span>/</span>
          <span aria-current="page">${escapeHtml(post.title)}</span>
        </nav>

        <header class="post__header">
          <div class="post__tags">${tags}</div>
          <h1 class="post__title">${escapeHtml(post.title)}</h1>
          ${post.summary ? `<p class="post__summary">${escapeHtml(post.summary)}</p>` : ""}
          <div class="post__meta">
            <time datetime="${post.iso}">${post.dateText}</time>
            <span aria-hidden="true">·</span>
            <span>约 ${post.minutes} 分钟</span>
            <span aria-hidden="true">·</span>
            <span>${post.chars} 字</span>
            ${post.draft ? '<span class="chip chip--demo">草稿</span>' : ""}
          </div>
        </header>

        ${post.cover ? `<img class="post__cover" src="${escapeHtml(post.cover)}" alt="${escapeHtml(post.title)}" loading="eager" decoding="async" />` : ""}

        <div class="article-layout__body">
          <div class="prose" id="articleBody">
${post.html}
          </div>
          ${toc}
        </div>

        <footer class="post__footer">
          <div class="post__tags">${tags}</div>
          <a class="link-more" href="./">
            <svg viewBox="0 0 24 24" aria-hidden="true">${ICON.back}</svg>
            返回文章列表
          </a>
        </footer>

        ${nav}
      </article>
    </main>

    <script type="application/json" id="postMeta">${JSON.stringify({
      slug: post.slug,
      title: post.title,
      date: post.iso,
    }).replace(/</g, "\\u003c")}</script>
${footerHtml()}
${SCRIPTS}
  </body>
</html>
`;
}

/* ------------------------------------------------------------------ */
/* 文章列表页                                                          */
/* ------------------------------------------------------------------ */
function postCard(post) {
  return `<a class="post-card" href="${encodePath(post.slug)}.html" data-tags="${escapeHtml(
    post.tags.join(",")
  )}" data-search="${escapeHtml(
    `${post.title} ${post.summary} ${post.tags.join(" ")}`.toLowerCase()
  )}">
    <span class="post-card__date">${post.dateShort}</span>
    <span class="post-card__body">
      <span class="post-card__title">${escapeHtml(post.title)}</span>
      <span class="post-card__summary">${escapeHtml(post.summary)}</span>
      <span class="post-card__meta">
        ${post.tags.map((t) => `<span class="chip">${escapeHtml(t)}</span>`).join("")}
        <span class="post-card__time">${post.minutes} 分钟</span>
      </span>
    </span>
    <span class="post-card__arrow" aria-hidden="true"><svg viewBox="0 0 24 24">${ICON.arrow}</svg></span>
  </a>`;
}

function postsIndexPage(posts) {
  const tags = [...new Set(posts.flatMap((p) => p.tags))].sort((a, b) => a.localeCompare(b, "zh"));

  const filter = tags.length
    ? `<div class="filter" role="group" aria-label="按标签筛选">
        <button class="filter__btn is-active" type="button" data-tag="">全部</button>
        ${tags
          .map(
            (t) =>
              `<button class="filter__btn" type="button" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</button>`
          )
          .join("")}
      </div>`
    : "";

  return `${headHtml({
    title: `文章 · ${SITE.title}`,
    description: `记录关于番剧、游戏与代码的思考，共 ${posts.length} 篇。`,
    canonical: `${BASE_URL}/posts/`,
  })}
  <body class="page-archive" data-title-lock>
${headerHtml("posts")}

    <main class="wrap archive">
      <header class="archive__header" data-reveal>
        <p class="archive__eyebrow">Archive ${String(posts.length).padStart(2, "0")}</p>
        <h1 class="archive__title">文章</h1>
        <p class="archive__desc">
          用 Markdown 写，提交到 GitHub 后由 Actions 自动渲染上线。
          共 <strong>${posts.length}</strong> 篇，累计约 ${posts.reduce((n, p) => n + p.minutes, 0)} 分钟阅读。
        </p>
        <search class="archive__search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.6" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="m16 16 4.2 4.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
          <input id="postSearch" type="search" placeholder="搜索标题、摘要或标签…" aria-label="搜索文章" autocomplete="off" />
        </search>
      </header>

      ${filter}

      <div class="post-cards" id="postCards">
        ${posts.map(postCard).join("\n        ")}
      </div>

      <p class="archive__empty" id="archiveEmpty" hidden>没有匹配的文章，换个关键词试试。</p>
      <button class="btn archive__more" id="loadMore" type="button" hidden>加载更多</button>
    </main>

${footerHtml()}
${ARCHIVE_SCRIPTS}
  </body>
</html>
`;
}
/* ------------------------------------------------------------------ */
/* 404                                                                 */
/* ------------------------------------------------------------------ */
function notFoundPage() {
  return `${headHtml({
    title: `页面走丢了 · ${SITE.title}`,
    description: "这一页不存在。",
    canonical: `${BASE_URL}/404.html`,
    prefix: BASE_PATH,
  })}
  <body class="page-404" data-title-lock>
${headerHtml("", BASE_PATH)}
    <main class="wrap not-found">
      <p class="not-found__code">404</p>
      <h1>这一格是空的</h1>
      <p>你要找的页面不存在，可能是文章改名了，或者链接复制时少了一截。</p>
      <a class="btn btn--primary" href="${BASE_PATH}">回到首页</a>
    </main>
${footerHtml(BASE_PATH)}
  </body>
</html>
`;
}

/* ------------------------------------------------------------------ */
/* feed / sitemap / robots                                             */
/* ------------------------------------------------------------------ */
function feedXml(posts) {
  const entries = posts
    .slice(0, 20)
    .map(
      (post) => `    <entry>
      <title type="text">${escapeXml(post.title)}</title>
      <link rel="alternate" type="text/html" href="${escapeXml(
        `${BASE_URL}/posts/${encodePath(post.slug)}.html`
      )}"/>
      <id>${escapeXml(`${BASE_URL}/posts/${encodePath(post.slug)}.html`)}</id>
      <updated>${post.iso}</updated>
      <published>${post.iso}</published>
      <summary type="html">${escapeXml(post.summary)}</summary>
${post.tags.map((t) => `      <category term="${escapeXml(t)}"/>`).join("\n")}
    </entry>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="${SITE.lang}">
  <title type="text">${escapeXml(SITE.title)}</title>
  <subtitle type="text">${escapeXml(SITE.description)}</subtitle>
  <link rel="self" type="application/atom+xml" href="${escapeXml(`${BASE_URL}/feed.xml`)}"/>
  <link rel="alternate" type="text/html" href="${escapeXml(`${BASE_URL}/`)}"/>
  <id>${escapeXml(`${BASE_URL}/`)}</id>
  <updated>${posts[0] ? posts[0].iso : new Date().toISOString()}</updated>
  <author>
    <name>${escapeXml(SITE.fullName)}</name>
    <uri>${escapeXml(`${BASE_URL}/`)}</uri>
  </author>
${entries}
</feed>
`;
}

function sitemapXml(posts) {
  const urls = [
    { loc: `${BASE_URL}/`, priority: "1.0" },
    { loc: `${BASE_URL}/posts/`, priority: "0.8" },
    ...posts.map((p) => ({
      loc: `${BASE_URL}/posts/${encodePath(p.slug)}.html`,
      lastmod: p.date.toISOString().slice(0, 10),
      priority: "0.6",
    })),
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${escapeXml(u.loc)}</loc>${u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : ""}
    <priority>${u.priority}</priority>
  </url>`
  )
  .join("\n")}
</urlset>
`;
}

/* ------------------------------------------------------------------ */
/* 静态资源拷贝                                                        */
/* ------------------------------------------------------------------ */
const STATIC_FILES = ["index.html", ".nojekyll"];
const STATIC_DIRS = ["assets", "images", "files"];

async function copyStatic() {
  for (const file of STATIC_FILES) {
    const src = path.join(ROOT, file);
    try {
      if (file === "index.html") {
        // 首页的 OG 图 / canonical 需要绝对地址，构建时按实际站点地址替换
        let html = await fs.readFile(src, "utf8");
        html = html.replace(
          /<meta property="og:image" content="assets\/img\/og-cover\.png" \/>/,
          `<meta property="og:image" content="${BASE_URL}/assets/img/og-cover.png" />`
        );
        html = html.replace(
          '<meta property="og:type" content="website" />',
          `<meta property="og:type" content="website" />
    <link rel="canonical" href="${BASE_URL}/" />`
        );
        await fs.writeFile(path.join(DIST, file), html, "utf8");
      } else {
        await fs.copyFile(src, path.join(DIST, file));
      }
    } catch {
      /* 可选文件，不存在就跳过 */
    }
  }

  for (const dir of STATIC_DIRS) {
    const src = path.join(ROOT, dir);
    try {
      await fs.cp(src, path.join(DIST, dir), { recursive: true });
    } catch {
      /* 可选目录 */
    }
  }

  // 首页 / 文章页之外，用户放在根目录的其他静态文件（favicon 等）
  try {
    const entries = await fs.readdir(ROOT, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (entry.name.startsWith(".")) continue;
      if (/\.(html|css|js|png|jpg|jpeg|svg|webp|ico|txt|xml|json|webmanifest)$/i.test(entry.name)) {
        if (STATIC_FILES.includes(entry.name)) continue;
        if (["feed.xml", "sitemap.xml", "robots.txt", "package.json", "package-lock.json"].includes(entry.name)) continue;
        await fs.copyFile(path.join(ROOT, entry.name), path.join(DIST, entry.name));
      }
    }
  } catch {}
}

/* ------------------------------------------------------------------ */
/* 主流程                                                              */
/* ------------------------------------------------------------------ */
async function main() {
  const started = Date.now();
  const oldManifest = await readJSON(MANIFEST_FILE, { files: [] });

  await fs.rm(DIST, { recursive: true, force: true });
  await fs.mkdir(DIST_POSTS, { recursive: true });
  await copyStatic();

  const posts = await loadPosts();

  /* 1. 文章页 */
  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    // 数组按时间倒序：上一页是更新的文章
    const newer = posts[i - 1] || null;
    const older = posts[i + 1] || null;
    const file = path.join(DIST_POSTS, `${post.slug}.html`);
    await fs.writeFile(file, articlePage(post, newer, older), "utf8");
  }

  /* 2. 列表页 + 清单 */
  await fs.writeFile(path.join(DIST_POSTS, "index.html"), postsIndexPage(posts), "utf8");

  const manifest = posts.map((p) => ({
    slug: p.slug,
    title: p.title,
    date: p.iso,
    dateText: p.dateText,
    dateShort: p.dateShort,
    tags: p.tags,
    summary: p.summary,
    cover: p.cover,
    minutes: p.minutes,
    url: `posts/${encodePath(p.slug)}.html`,
    draft: p.draft,
  }));
  await fs.writeFile(
    path.join(DIST_POSTS, "index.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    "utf8"
  );

  /* 3. feed / sitemap / robots */
  await fs.writeFile(path.join(DIST, "404.html"), notFoundPage(), "utf8");
  await fs.writeFile(path.join(DIST, "feed.xml"), feedXml(posts), "utf8");
  await fs.writeFile(path.join(DIST, "sitemap.xml"), sitemapXml(posts), "utf8");
  await fs.writeFile(
    path.join(DIST, "robots.txt"),
    `User-agent: *\nAllow: /\n\nSitemap: ${BASE_URL}/sitemap.xml\n`,
    "utf8"
  );

  /* 4. 清理过期页面 */
  const generated = new Set(posts.map((p) => `${p.slug}.html`));
  const stale = (oldManifest.files || []).filter((f) => !generated.has(f));
  let removed = 0;
  for (const f of stale) {
    try {
      await fs.unlink(path.join(DIST_POSTS, f));
      removed++;
    } catch {}
  }

  await fs.writeFile(
    MANIFEST_FILE,
    JSON.stringify({ files: [...generated], builtAt: new Date().toISOString() }, null, 2) + "\n",
    "utf8"
  );

  const elapsed = Date.now() - started;
  console.log(
    `\n  ✓ 构建完成 ${new Date().toLocaleTimeString("zh-CN")}（${elapsed}ms）\n` +
      `    文章 ${posts.length} 篇，清理旧页 ${removed} 个\n` +
      `    站点地址 ${BASE_URL}\n` +
      (posts.length ? "" : "    （posts/ 里还没有 .md 文件）\n")
  );
  for (const p of posts) {
    console.log(`    - ${p.dateShort}  ${p.title}  →  posts/${encodePath(p.slug)}.html`);
  }
  console.log();
}

async function readJSON(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

main().catch((err) => {
  console.error("\n  ✗ 构建失败：", err);
  process.exit(1);
});
