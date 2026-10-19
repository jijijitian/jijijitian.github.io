#!/usr/bin/env node
/**
 * new-post.mjs —— 新建一篇文章
 *
 *   node scripts/new-post.mjs "文章标题"
 *   node scripts/new-post.mjs "文章标题" --tags 番剧,杂谈 --draft
 *   pnpm new "文章标题"
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const POSTS = path.join(ROOT, "posts");

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const title = args.filter((a) => !a.startsWith("--"))[0];
const tagsIdx = args.indexOf("--tags");
const tags = tagsIdx >= 0 ? args[tagsIdx + 1] || "" : "";
const draft = flags.has("--draft");

if (!title) {
  console.error('用法：node scripts/new-post.mjs "文章标题" [--tags 标签1,标签2] [--draft]');
  process.exit(1);
}

function slugify(text) {
  return (
    text
      .toLowerCase()
      .trim()
      .replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "post"
  );
}

function pad(n) {
  return String(n).padStart(2, "0");
}

const now = new Date();
const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(
  now.getHours()
)}:${pad(now.getMinutes())}`;

let slug = slugify(title);
let file = path.join(POSTS, `${slug}.md`);
let i = 2;
while (await exists(file)) {
  slug = `${slugify(title)}-${i++}`;
  file = path.join(POSTS, `${slug}.md`);
}

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

const tagLine = tags
  ? `[${tags
      .split(/[,，]/)
      .map((t) => t.trim())
      .filter(Boolean)
      .join(", ")}]`
  : "[]";

const body = `---
title: ${title}
date: ${stamp}
tags: ${tagLine}
summary:
draft: ${draft}
---

在这里开始写正文。

## 小标题

支持常见的 Markdown 语法：

- **加粗**、*斜体*、~~删除线~~、\`行内代码\`
- [链接](https://bangumi.tv)
- 图片：\`![说明](assets/img/example.png)\`（相对于仓库根目录）

\`\`\`js
console.log("代码块会自动高亮");
\`\`\`
`;

await fs.mkdir(POSTS, { recursive: true });
await fs.writeFile(file, body, "utf8");

console.log(`\n  ✓ 已创建 posts/${slug}.md\n    写完后：git add . && git commit -m "post: ${title}" && git push\n`);
