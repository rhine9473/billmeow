import { defineConfig } from 'vitepress'

export default defineConfig({
  title: "账单喵 | billmeow",
  description: "更好的账单管理工具 —— 2026 Qoder 高校创造力大赛参赛作品",
  themeConfig: {
    nav: [
      { text: '首页', link: '/' },
    ],

    sidebar: [],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/rhine9473/billmeow' }
    ],

    editLink: {
      pattern: 'https://github.com/rhine9473/billmeow/edit/main/docs/:path',
      text: '在 GitHub 上编辑此页',
    },

    footer: {
      copyright: 'Copyright © 2026 billmeow',
    },
  },
})
