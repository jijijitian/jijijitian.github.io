#!/usr/bin/env node
/**
 * sync-steam.mjs —— 抓取 Steam 公开主页的「最近在玩」
 *
 * Steam 没有公开的免 key 游戏接口，这里解析公开个人主页（无需登录）：
 *   - https://steamcommunity.com/id/<vanity>?xml=1   基础资料
 *   - https://steamcommunity.com/id/<vanity>/         最近游戏
 *
 * 输出 assets/data/steam.json，首页直接读取静态快照。
 * 抓取失败时保留旧快照，不阻断构建。
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "assets", "data", "steam.json");

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";

async function loadConfig() {
  const code = await fs.readFile(path.join(ROOT, "assets/js/config.js"), "utf8");
  const sandbox = {};
  new Function("window", code)(sandbox);
  return sandbox.SITE_CONFIG || {};
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8" },
    redirect: "follow",
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  return res.text();
}

function decodeEntities(s) {
  return String(s)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .trim();
}

function parseProfile(xml) {
  const pick = (tag) => {
    const m = xml.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`));
    return m ? decodeEntities(m[1]) : "";
  };
  return {
    steamid: pick("steamID64"),
    name: pick("steamID"),
    avatar: pick("avatarFull") || pick("avatarMedium"),
    state: pick("onlineState"),
    privacy: pick("privacyState"),
  };
}

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** "18 Oct" / "10 月 18 日" -> "2026-10-18"（按当前年份推断，跨年则回退一年） */
function parseLastPlayed(raw) {
  let day, month;
  const zh = String(raw || "").match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (zh) {
    month = Number(zh[1]);
    day = Number(zh[2]);
  } else {
    const en = String(raw || "").match(/(\d{1,2})\s+([A-Za-z]{3})/);
    if (!en) return "";
    day = Number(en[1]);
    month = MONTHS[en[2].toLowerCase()];
  }
  if (!month || !day) return "";
  const now = new Date();
  const year = now.getUTCFullYear();
  let date = new Date(Date.UTC(year, month - 1, day));
  if (date.getTime() - now.getTime() > 3 * 86400000) {
    date = new Date(Date.UTC(year - 1, month - 1, day));
  }
  return date.toISOString().slice(0, 10);
}

async function portraitCover(appid) {
  const url = `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/library_600x900.jpg`;
  try {
    const res = await fetch(url, {
      method: "HEAD",
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(10000),
    });
    return res.ok ? url : "";
  } catch {
    return "";
  }
}

function parseRecentGames(html) {
  const parts = html.split('<div class="recent_game">').slice(1);
  const games = [];
  const seen = new Set();

  for (const block of parts) {
    const appMatch = block.match(/steamcommunity\.com\/app\/(\d+)/);
    if (!appMatch) continue;
    const appid = appMatch[1];
    if (seen.has(appid)) continue;

    const nameMatch = block.match(/<div class="game_name">[\s\S]*?<a[^>]*>([^<]+)<\/a>/);
    const hoursMatch =
      block.match(/总时数\s*([\d,]+)\s*小时/) ||
      block.match(/([\d,]+)\s*(?:hours?|hrs?)\s+on record/i);
    const lastMatch = block.match(/(?:last played on|最后运行日期：?)\s*([^<]+)/i);
    const capsuleMatch = block.match(/<img class="game_capsule"\s+src="([^"]+)"/);

    seen.add(appid);
    games.push({
      appid,
      name: decodeEntities(nameMatch ? nameMatch[1] : `App ${appid}`),
      hours: hoursMatch ? Number(hoursMatch[1].replace(/,/g, "")) : null,
      lastPlayed: parseLastPlayed(lastMatch ? lastMatch[1].trim() : ""),
      lastPlayedRaw: lastMatch ? lastMatch[1].trim() : "",
      cover: "", // 稍后补
      fallbackCover: capsuleMatch ? capsuleMatch[1] : "",
      url: `https://steamcommunity.com/app/${appid}`,
    });
  }

  return games;
}

async function main() {
  const cfg = await loadConfig();
  const steam = cfg.steam || {};
  const vanity = steam.vanity || "jijijitian";
  const limit = Number(steam.limit) || 3;

  const [xml, html] = await Promise.all([
    fetchText(`https://steamcommunity.com/id/${encodeURIComponent(vanity)}?xml=1`),
    fetchText(`https://steamcommunity.com/id/${encodeURIComponent(vanity)}/`),
  ]);

  const profile = parseProfile(xml);
  if (profile.privacy && profile.privacy !== "public") {
    throw new Error(`Steam 资料不可见（privacyState=${profile.privacy}）`);
  }

  let games = parseRecentGames(html).slice(0, limit);
  if (!games.length) {
    throw new Error("没有解析到「最近在玩」（可能是私密资料或页面结构变化）");
  }

  // 优先使用竖版封面，缺图时退回页面里的横版胶囊图
  games = await Promise.all(
    games.map(async (g) => {
      g.cover = (await portraitCover(g.appid)) || g.fallbackCover;
      delete g.fallbackCover;
      return g;
    })
  );

  const payload = {
    source: "steam",
    updatedAt: new Date().toISOString(),
    profile: {
      ...profile,
      url: `https://steamcommunity.com/id/${encodeURIComponent(vanity)}/`,
    },
    games,
  };

  await fs.mkdir(path.dirname(OUT), { recursive: true });
  await fs.writeFile(OUT, JSON.stringify(payload, null, 2) + "\n", "utf8");

  console.log(
    `\n  ✓ Steam 快照已更新：${profile.name || vanity}，最近在玩 ${games.length} 款\n` +
      games.map((g) => `    - ${g.name}（${g.hours ?? "?"} 小时）`).join("\n") +
      `\n    → assets/data/steam.json\n`
  );
}

main().catch((err) => {
  // 失败保留旧快照，不阻断部署
  console.error(`\n  ⚠ Steam 同步失败：${err.message}\n    将保留上一次的快照。\n`);
  process.exitCode = 0;
});
