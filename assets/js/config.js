/**
 * 站点配置 —— 只需要改这个文件，就能把整站变成你的。
 * 所有字段都可以留空，模板会自动兜底。
 * 改完推送即可，构建脚本读取的是同一份配置。
 */
window.SITE_CONFIG = {
  /* ---------- 身份 ---------- */
  name: "Jht", // 显示名（昵称）
  fullName: "Jht", // 全名，页脚用
  handle: "@jijijitian", // 社交账号
  avatar: "assets/img/avatar.png", // 头像，可换成自己的图片
  siteTitle: "Jht 的小站", // 浏览器标签 / 页脚
  description: "一个关于番剧、游戏和代码的个人角落。",
  url: "https://jijijitian.github.io/", // 部署后的线上地址（RSS / sitemap 用）
  lang: "zh-CN",

  /* ---------- 首屏 ---------- */
  greeting: "你好，我是",
  headline: "白天写代码，晚上追番，偶尔打游戏。",
  bio: "这里记录我喜欢的东西：番剧、游戏、还有折腾出来的小玩意儿。喜欢 Bento Grid，因为每个格子都能装一点生活。",
  location: "中国 · 某座城市",
  status: "保持好奇，缓慢生长",
  tags: ["前端", "Markdown", "番剧", "游戏", "折腾"],

  /* ---------- Bangumi ---------- */
  bangumi: {
    // 你的 Bangumi 用户名（bgm.tv/user/ 后面的那段）
    username: "your_bangumi_id",
    nickname: "yourid",
    // true = 浏览器实时请求 Bangumi 公开 API（数据最新，需要联网）
    // false = 使用 assets/data/bangumi.json 里的快照（离线可用，可定时刷新）
    live: true,
    // 实时请求失败时自动回退到快照；快照路径
    snapshot: "assets/data/bangumi.json",
    // 首页展示数量
    animeLimit: 3,
    gameLimit: 3,
    // 进度条总集数的兜底值（Bangumi 接口偶尔不给总集数）
    fallbackEpisodes: 12,
  },

  /* ---------- 社交链接 ---------- */
  socials: [
    { label: "GitHub", href: "https://github.com/jijijitian", icon: "github" },
    { label: "Bangumi", href: "https://bgm.tv/", icon: "bangumi" },
    { label: "Email", href: "mailto:jihaotian0627@foxmail.com", icon: "mail" },
    { label: "RSS", href: "feed.xml", icon: "rss" },
  ],

  /* ---------- 首页精选链接（自选 4 个） ---------- */
  nowDoing: [
    { title: "重构个人主页", note: "Bento Grid + 零依赖", emoji: "🛠️" },
    { title: "补完《芙莉莲》", note: "每周一集慢慢看", emoji: "📺" },
    { title: "通关《空洞骑士》", note: "五门进不去", emoji: "🎮" },
  ],

  /* ---------- 博客 ---------- */
  posts: {
    // 文章清单的路径（由构建脚本生成，一般不用改）
    manifest: "posts/index.json",
    basePath: "posts/",
    perPage: 5,
  },
};
