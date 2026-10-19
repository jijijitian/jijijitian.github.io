---
title: 这个站点是怎么自动部署的
date: 2026-08-20 10:00
tags: [教程, GitHub, 自动化]
summary: 一次推送触发构建，三十秒后 GitHub Pages 上线，整个过程不需要本地安装任何环境。
---

这一篇讲讲 `.github/workflows/deploy.yml` 里到底发生了什么。

## 触发条件

```yaml
on:
  push:
    branches: [main]
  workflow_dispatch:
  schedule:
    - cron: "0 2 * * *"
```

- `push`：每次推送到 `main` 都重新构建
- `workflow_dispatch`：可以在 Actions 页面手动点一下
- `schedule`：每天凌晨自动刷新一次 Bangumi 快照

## 步骤

```yaml
steps:
  - uses: actions/checkout@v4
  - uses: actions/setup-node@v4
    with:
      node-version: 22
  - run: node scripts/sync-bangumi.mjs
  - run: node scripts/build.mjs --base-url ${{ steps.pages.outputs.base_url }}
  - uses: actions/upload-pages-artifact@v3
    with:
      path: .
  - uses: actions/deploy-pages@v4
```

关键点：

1. **没有 `npm install`**。所有依赖都已经放在 `scripts/vendor/`，构建是零安装的。
2. **`base-url` 自动注入**。不管部署到 `username.github.io` 还是 `username.github.io/repo/`，链接和 RSS 都正确。
3. **快照先于构建**。抓取 Bangumi 失败时会保留上一次的快照，不会让构建挂掉。

## 为什么不用现成的静态博客框架

试过三个，最后一个都没留下来：

- Hugo：要装 Go
- Hexo：`node_modules` 又大又慢
- Astro：很好，但对我这种内容量来说太重了

这套自建管线的构建时间大约是 **0.1 秒**，输出文件数是文章数 + 4。

## 如果构建失败

去 Actions 里看日志。90% 的情况是：

- front-matter 的 `---` 没闭合
- 文件名里有空格或特殊字符
- `date` 格式写错了

改完重新 push 即可，失败了不会覆盖线上版本。

## 小结

自动化的意义不是炫技，而是让你在想写东西的时候，只需要想内容本身。
