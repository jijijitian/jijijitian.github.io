#!/usr/bin/env node
/**
 * dev.mjs —— 本地预览：构建一次 + 起一个静态服务器
 * 修改 Markdown 后按 Ctrl+C 重跑即可（文件量很小，构建 0.1 秒）。
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const PORT = Number(process.env.PORT) || 4173;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function build() {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(__dirname, "build.mjs")], {
      cwd: ROOT,
      stdio: "inherit",
    });
    child.on("exit", () => resolve());
  });
}

await build();

const server = http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch {
    res.writeHead(400).end("Bad Request");
    return;
  }

  let filePath = path.join(DIST, urlPath);
  if (!filePath.startsWith(DIST)) {
    res.writeHead(403).end("Forbidden");
    return;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }

  // 无扩展名的干净链接：/posts/hello-markdown → /posts/hello-markdown.html
  if (!fs.existsSync(filePath) && !path.extname(filePath)) {
    const withHtml = `${filePath}.html`;
    if (fs.existsSync(withHtml)) filePath = withHtml;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        `<h1 style="font-family:system-ui;padding:40px">404</h1><p style="font-family:system-ui;padding:0 40px">没有找到 <code>${urlPath}</code></p>`
      );
      return;
    }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`\n  ▸ 本地预览：http://localhost:${PORT}\n    按 Ctrl+C 停止\n`);
});
