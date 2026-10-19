---
title: 用 Markdown 写文章的完整流程
date: 2026-10-18 21:30
tags: [教程, Markdown, GitHub]
summary: 从新建一个 .md 文件，到 GitHub Actions 自动渲染上线，整个流程只需要三次操作。
pinned: true
---

这是一篇示范文章。它同时验证了本站 Markdown 渲染管线支持的绝大多数语法：标题、列表、表格、代码高亮、引用、图片和任务清单。

## 三步写一篇文章

整个流程被刻意做得很短，不需要本地安装任何东西。

1. 在 `posts/` 目录新建一个 `.md` 文件，例如 `hello-world.md`
2. 在文件顶部写上 front-matter（见下一节）
3. `git add . && git commit -m "new post" && git push`

推送之后，GitHub Actions 会自动：

- 把 Markdown 渲染成 HTML 页面
- 更新首页的「最近文章」和文章列表页
- 重新生成 RSS 与 sitemap
- 部署到 GitHub Pages

> 也就是说：**你只管写 Markdown，剩下的交给流水线。**

## Front-matter 怎么写

文件开头用两条 `---` 包起来的部分就是 front-matter，它告诉构建脚本这篇文章的元信息：

```yaml
---
title: 文章标题
date: 2026-10-18 21:30
tags: [教程, Markdown]
summary: 显示在列表页的一句话摘要
cover: assets/img/cover.jpg
pinned: false
draft: false
---
```

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `title` | 否 | 不填则用文件名 |
| `date` | 推荐 | 不填则用文件修改时间 |
| `tags` | 否 | 数组或逗号分隔字符串 |
| `summary` | 否 | 不填则自动截取正文前 110 字 |
| `cover` | 否 | 文章头图 |
| `pinned` | 否 | 置顶到列表最前 |
| `draft` | 否 | 设为 `true` 时线上不构建 |

## 代码块会自动高亮

```js
// 构建脚本用的是 marked + highlight.js，语法高亮在构建时完成
const posts = await loadPosts();

for (const post of posts) {
  await fs.writeFile(`posts/${post.slug}.html`, articlePage(post), "utf8");
}

console.log(`✓ 已生成 ${posts.length} 篇文章`);
```

也支持没有语言标注的代码块：

```
$ git commit -m "post: 新文章"
$ git push
```

## 列表样式

- 无序列表
  - 嵌套一层
  - 再嵌套一层
- **加粗**、*斜体*、~~删除线~~、`行内代码`
- 链接：[Bangumi](https://bgm.tv) 会自动在新标签页打开

### 任务清单

- [x] 搭建 Bento Grid 首页
- [x] 接入 Bangumi 正在追番
- [x] Markdown 自动构建
- [ ] 写更多文章
- [ ] 换一张更喜欢的头像

## 引用与分隔线

> 写博客最难的部分从来不是工具，而是坐下来敲下第一个字。
>
> 所以工具应该尽可能消失。

---

## 本地预览

如果你想在 push 之前先看看效果，在仓库根目录运行：

```bash
# 构建 + 起一个本地服务器
npm run dev
```

Windows 上如果提示 `node` 找不到，把 Node 的安装路径加进 PATH 即可，或者直接用 GitHub Desktop 提交，让 Actions 去构建。

## 小结

这套方案的核心只有一个文件：`scripts/build.mjs`。它没有第三方依赖（marked 和 highlight.js 已经放在 `scripts/vendor/` 里），所以构建速度很快，也不会某天因为 npm 包更新而突然坏掉。
