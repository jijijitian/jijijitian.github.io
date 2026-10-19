#!/usr/bin/env node
/**
 * sync-bangumi.mjs —— 抓取 Bangumi 收藏，生成离线快照
 *
 * 输出 assets/data/bangumi.json，首页在 API 不可用时会自动读取它。
 * GitHub Actions 每天跑一次，本地想刷新也可以直接执行：
 *
 *   node scripts/sync-bangumi.mjs
 *   node scripts/sync-bangumi.mjs --user yourid --limit 6
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "assets", "data", "bangumi.json");

const argv = process.argv.slice(2);
const arg = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : null;
};

/* 和浏览器端保持一致的请求头（Bangumi 要求带 UA） */
const UA = "bento-homepage/1.0 (+https://github.com/)";

async function loadConfig() {
  const code = await fs.readFile(path.join(ROOT, "assets/js/config.js"), "utf8");
  const sandbox = {};
  new Function("window", code)(sandbox);
  return sandbox.SITE_CONFIG || {};
}

async function fetchJSON(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  return res.json();
}

function normalize(item) {
  const s = item.subject || {};
  return {
    id: s.id || item.subject_id,
    name: s.name || s.name_cn || "未命名",
    nameCN: s.name_cn || s.name || "未命名",
    cover: (s.images && (s.images.common || s.images.small)) || "",
    score: s.score || null,
    date: s.date || "",
    ep: item.ep_status || 0,
    total: s.eps || 0,
    type: item.type,
    tags: (s.tags || [])
      .map((t) => (typeof t === "string" ? t : t && t.name))
      .filter(Boolean),
    status: item.ep_status ? "在看" : "",
    updatedAt: item.updated_at || "",
    url: s.id ? `https://bgm.tv/subject/${s.id}` : "https://bgm.tv/",
  };
}

async function fetchCollection(username, subjectType) {
  const all = [];
  let offset = 0;
  const limit = 50;
  for (let page = 0; page < 4; page++) {
    const url = `https://api.bgm.tv/v0/users/${encodeURIComponent(
      username
    )}/collections?subject_type=${subjectType}&type=3&limit=${limit}&offset=${offset}`;
    const data = await fetchJSON(url);
    const items = Array.isArray(data) ? data : data.data || [];
    all.push(...items.filter((x) => x.type === 3));
    if (items.length < limit) break;
    offset += limit;
  }
  return all;
}

const ADULT_TAGS = /(里番|18禁|R-?18|成人向|工口)/i;

function sortEntries(list, hideAdult = true) {
  return list
    .map(normalize)
    .filter((entry) => !(hideAdult && (entry.tags || []).some((t) => ADULT_TAGS.test(t))))
    .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
}

async function main() {
  const cfg = await loadConfig();
  const bgm = cfg.bangumi || {};
  const username = arg("user") || bgm.username;
  const limit = Number(arg("limit")) || Math.max(bgm.animeLimit || 3, bgm.gameLimit || 3, 6);

  if (!username || /^(your_|your$|yourid$)/i.test(username)) {
    console.log(
      "\n  ⚠ 还没有配置 Bangumi 用户名，跳过同步。\n" +
        "    在 assets/js/config.js 里设置 bangumi.username 后重试。\n"
    );
    // 保留已有快照，不要覆盖成空文件
    return;
  }

  const [anime, game] = await Promise.all([
    fetchCollection(username, 2),
    fetchCollection(username, 4),
  ]);

  const payload = {
    source: "snapshot",
    updatedAt: new Date().toISOString(),
    user: { username },
    totalAnime: anime.length,
    totalGame: game.length,
    anime: sortEntries(anime, bgm.hideAdult !== false).slice(0, limit),
    game: sortEntries(game, bgm.hideAdult !== false).slice(0, limit),
  };

  await fs.mkdir(path.dirname(OUT), { recursive: true });
  await fs.writeFile(OUT, JSON.stringify(payload, null, 2) + "\n", "utf8");

  console.log(
    `\n  ✓ Bangumi 快照已更新：在追 ${anime.length} 部 / 在玩 ${game.length} 部\n` +
      `    → assets/data/bangumi.json（${payload.updatedAt}）\n`
  );
}

main().catch((err) => {
  // 同步失败不应该阻断部署：保留旧快照，只打印警告
  console.error(`\n  ⚠ Bangumi 同步失败：${err.message}\n    将保留上一次的快照。\n`);
  process.exitCode = 0;
});
