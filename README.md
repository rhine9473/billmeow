# 账单喵 · billmeow

## 技术栈

| 类别 | 选型 |
| ---- | ---- |
| 框架 | Vue 3（`<script setup>` SFC） |
| 语言 | TypeScript |
| 构建 | Vite 7 |
| 路由 | Vue Router |
| 状态 | Pinia（按需）/ 组合式函数 |
| 样式 | SCSS + CSS 变量（主题 token） |
| 图标 | Iconify（离线 `unplugin-icons` + 在线 `@iconify/vue`） |
| 测试 | Vitest + jsdom |
| 文档 | VitePress |
| 包管理 | pnpm |

## 快速开始

```bash
pnpm install   # 安装依赖
pnpm dev       # 启动开发服务器（默认 http://localhost:5173）
```

其他命令：

| 命令 | 说明 |
| ---- | ---- |
| `pnpm build` | 类型检查 + 生产构建 |
| `pnpm preview` | 预览构建产物 |
| `pnpm test` | 运行单元测试 |
| `pnpm dev:docs` | 本地启动文档站点 |
| `pnpm build:docs` | 构建文档站点 |

## 目录结构

```
billmeow/
├── .github/               # GitHub 配置
│   └── workflows/         # GitHub Actions（含文档自动部署）
├── .vscode/               # 编辑器配置
├── docs/                  # VitePress 文档站点
│   ├── .vitepress/
│   │   ├── config.ts      # 站点配置（导航、主题、标题）
│   │   ├── cache/         # 依赖预构建缓存（自动生成）
│   │   └── dist/          # 构建产物（自动生成）
│   └── index.md           # 首页（layout: home）
├── public/                # 静态资源，原样复制到产物根目录
│   └── favicon.svg
├── src/                   # 应用源码
│   ├── App.vue            # 根组件
│   ├── main.ts            # 应用入口：初始化主题、挂载应用
│   ├── index.scss         # 全局样式入口（引入重置样式等）
│   ├── lib/               # 工具函数
│   │   ├── storage.ts     # localStorage 读写封装
│   │   └── storage.test.ts
│   ├── router/
│   │   └── index.ts       # 路由表
│   ├── stores/            # 全局状态
│   │   ├── theme.ts       
│   │   └── theme.test.ts
│   ├── styles/
│   │   ├── reset.scss     # 全局样式重置
│   │   └── theme.scss     # 主题颜色 token
│   └── views/             # 页面
│       └── settings/      # 设置页
│           ├── index.vue  # 页面入口
│           └── Theme.vue  # 页面专用子组件
├── dist/                  # 应用构建产物（自动生成）
├── index.html             # 应用 HTML 模板与入口
├── package.json           # 依赖与脚本
├── pnpm-lock.yaml         # 依赖锁定文件
├── pnpm-workspace.yaml    # pnpm 工作区配置
├── vite.config.ts         # Vite 配置（插件 / 开发服务器 / 测试）
├── tsconfig.json          # TS 总配置（引用下方两个子配置）
├── tsconfig.app.json      # 应用代码 TS 配置
├── tsconfig.node.json     # 构建脚本（vite.config 等）TS 配置
├── AGENTS.md              # 开发约定（目录结构 / 注释规范）
├── DESIGN.md              # 需求分析与设计
├── TASK.md                # 功能任务拆解
├── README.md              # 说明文件
└── LICENSE                # 许可证
```

## 开发约定

提交前请阅读 [AGENTS.md](./AGENTS.md)，重点：

- 页面一律放在 `src/views/{页面名}/index.vue`，子组件就近放在同目录并去掉页面名前缀
- 注释禁止 `//`，API 用 `/** */`（JSDoc），实现说明用 `/* */`

## 设计文档

- [DESIGN.md](./DESIGN.md)：需求分析、数据模型、主题与响应式规范
- [TASK.md](./TASK.md)：任务拆解
