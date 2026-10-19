---
title: 把个人主页做成一块 Bento 便当
date: 2026-09-28 15:20
tags: [设计, 前端]
summary: 为什么我放弃了单栏博客，改用一张张可以自由组合的「格子」来介绍自己。
---

Bento Grid 这个词来自日式便当盒：每个格子大小不同，装的东西也不同，但合在一起刚好是一顿饭。

## 为什么是格子

传统的个人主页通常是一条竖线：头像、简介、链接、文章列表。信息密度低，滑三屏才能看到全部内容。

而 Bento 的思路是**先分格，再填内容**：

```css
.bento {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: 16px;
}

.tile--intro { grid-column: span 7; grid-row: span 2; }
.tile--clock { grid-column: span 5; }
```

12 列的好处是所有常见比例（1/2、1/3、1/4、2/3）都能整除，排起来不会有缝隙。

## 形状即信息

- 大格子 = 重点内容
- 小格子 = 补充信息
- 横向长条 = 列表
- 正方形 = 单一数据点（时钟、状态）

读者在没有读到文字之前，就已经从格子的大小里读到了「什么重要」。

## 几个实现细节

### 高光跟随鼠标

```js
tile.addEventListener("pointermove", (e) => {
  const rect = tile.getBoundingClientRect();
  tile.style.setProperty("--mx", `${(e.clientX - rect.left) / rect.width * 100}%`);
  tile.style.setProperty("--my", `${(e.clientY - rect.top) / rect.height * 100}%`);
});
```

CSS 里再用一个 `radial-gradient` 把光晕画出来，成本几乎为零。

### 响应式

窄屏时所有格子都变成整行，格子之间只保留间距。这样在手机上它又变回了「一条竖线」，但保留了卡片的分隔感。

## 最后

好的布局应该像便当一样：每一格都装得下，合起来又刚好。如果你也想做一个，可以直接 fork 这个仓库，把配置里的名字和链接换掉就行。
