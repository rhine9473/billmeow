# 页面架构（必读）

> 适用范围：`src/views/` 下的全部页面，以及 `src/router/`、`src/components/TabBar.vue`
> 关联任务：TASK.md A3（路由与页签骨架）· 设计约束：DESIGN.md 第 5、7 节

---

## 目录与命名

**一页一目录，入口统一 `index.vue`**：路由懒加载永远指向 `views/{页面名}/index.vue`，
不出现 `views/SettingsView.vue` 这种带 `View` 后缀的平铺文件。

```
src/views/
├── records/     index.vue   # 账单列表
├── record/      index.vue   # 记一笔
├── accounts/    index.vue   # 账户
├── stats/       index.vue   # 统计
└── settings/    index.vue   # 设置
    └── Theme.vue            # 仅该页使用的子组件，就近放置
```

页内专用子组件放本页文件夹，去掉页面名前缀（`settings/Theme.vue` 而非 `settings/SettingsTheme.vue`）；
**只有跨页面复用**才提升到 `src/components/`（如 `TabBar.vue`）。

---

## 路由表

| 路径 | 路由名 | 入口文件 |
| ---- | ------ | -------- |
| `/` | — | 重定向至 `/records` |
| `/records` | `records` | `views/records/index.vue` |
| `/record` | `record` | `views/record/index.vue` |
| `/accounts` | `accounts` | `views/accounts/index.vue` |
| `/stats` | `stats` | `views/stats/index.vue` |
| `/settings` | `settings` | `views/settings/index.vue` |
| `/:pathMatch(.*)*` | — | 重定向至 `/records` |

所有页面独立成 chunk，互不牵连。`scrollBehavior` 统一回到顶部，避免沿用上一页滚动位置。

---

## 底部页签

`src/components/TabBar.vue` 是跨页面复用的导航组件，在 `src/App.vue` 中与 `<RouterView>` 并列挂载。

- 固定在视口底部，`padding-bottom` 叠加 `env(safe-area-inset-bottom)` 适配刘海屏 / 手势条
- 单个页签热区不小于 44×44px，满足 DESIGN.md 第 5 节触控要求
- 文字默认收起（`max-height: 0`），仅当前页签在图标下方展开，防止五个标签同时挤压小屏
- 「记一笔」为中间强调页签，用主题色实心圆承载；激活时**不用下方文字，改用图标上方气泡**，与其余四个页签区分

---

## 弱网下的两个问题

初始版本在弱网（3G / 高丢包）下有两个症状，根因不同，需要分别处理。

### 问题一：首次切换页面白屏数秒

**根因**：路由懒加载意味着首次点击某页签时才开始下载对应 chunk。弱网往返时延大，用户只能盯着旧页面，没有任何反馈。

**解决：空闲预取。**

`src/router/index.ts` 导出 `prefetchRoutes()`，在首屏挂载后（`src/main.ts` 调用）用 `requestIdleCallback` 逐个触发其余页面的动态导入。动态导入结果进入模块缓存，因此：

- 预取不会重复下载，点击时也无需二次请求
- 预取失败不影响点击——点击时会重新走一遍导入
- 首屏渲染不被阻塞，预取始终发生在浏览器空闲期

`requestIdleCallback` 在旧版 Safari 缺失，此时退回 `setTimeout(fn, 1000)`。
同时尊重 `navigator.connection.saveData`：用户开启省流量模式时跳过预取，不替他做主消耗流量。

### 问题二：点击页签「没反应」

**根因**：页签高亮原本由 `RouterLink` 的 `active-class` 驱动，而它依赖路由**切换完成**。chunk 下载期间路由尚未 commit，页签保持旧高亮；用户多点几次，观感就是「卡死了」。

**解决：点击即反馈。**

`TabBar.vue` 维护 `pendingName` ref：

1. 点击瞬间记录目标路由名，不等 chunk
2. 计算属性 `activeName` 优先取 `pendingName`，页签高亮立刻切换
3. 目标页签图标旁渲染一条旋转弧线，明确表达「正在加载」
4. 三个出口清空 pending，避免永久转圈：`router.afterEach`（成功）、`router.onError`（懒加载失败）、监听 `route.fullPath` 变化（兜底）

点击当前页签直接 return，不进入 pending。

---

## 无障碍与降级

| 场景 | 处理方式 |
| ---- | -------- |
| 页签当前页 | `aria-current="page"` |
| 页签加载中 | `aria-busy="true"` |
| 装饰性图标 / 气泡 / 转圈 | `aria-hidden="true"`，无障碍名由链接文本提供 |
| `prefers-reduced-motion: reduce` | 转圈改为静态半透明，所有过渡 / 动画关闭 |
| 省流量模式 | 跳过路由预取 |

---

## 移动端手势

### 长按

推荐自写 composable 而非引入框架：

- 项目只需「长按删除」一种手势，框架体积远大于收益
- 现成库（如 VueUse `onLongPress`）在长按触发后仍会派发 `click`，列表项会先弹菜单再跳详情，必须自己拦截

实现要点：

- 用 **Pointer Events** 而非 Touch Events，一套代码覆盖触摸 / 鼠标 / 触控笔
- 必须清理定时器的三个出口：`pointerup`、移动超阈值、`pointercancel`（滚动接管手势时触发）
- 长按触发后抑制紧随其后的 `click`，否则误触跳转

### 配套 CSS

```scss
.long-pressable {
  -webkit-touch-callout: none;  /* 关闭 iOS 长按弹出的「拷贝 / 存储图像」气泡 */
  -webkit-user-select: none;    /* 禁止长按选中文本 */
  user-select: none;
  touch-action: manipulation;   /* 保留滚动，只干掉双击缩放，顺带消除点击延迟 */
}
```

**不要写 `touch-action: none`**——那会禁止滚动，违反 DESIGN.md 第 7 节「内容可滚动」的要求。

### `contextmenu` 不可靠

部分 Android 浏览器长按触发 `contextmenu`，但 iOS Safari **完全不支持**，且触发阈值由浏览器决定、无法控制。只能顺手兼容，不能当主方案。

### 手势库取舍

| 方案 | 体积 | 结论 |
| ---- | ---- | ---- |
| 自写 composable | ~1 KB | ✅ 长按场景首选 |
| `@vueuse/core` | 按需引入，`useSwipe` 约 949 B | ✅ 需要横滑时首选 |
| Hammer.js | ~30 KB | ❌ 多年停更、无 TS 类型 |
| `vue3-touch-events` | ~5 KB | ❌ 维护弱、类型不全 |
| `@use-gesture/vue` | ~15 KB | ⚠️ 仅在做拖拽 / 惯性 / 捏合时考虑 |

注意：VueUse `useSwipe` 基于 Touch Events，**桌面鼠标不触发**。DESIGN.md 明确桌面 Web / PWA 也是主要形态，因此横滑删除只能作为移动端增强，桌面必须另有删除入口，否则功能在桌面不可达。

---

## 产物拆分

`pnpm build` 后每个页面独立成 chunk：

```
dist/assets/index-*.js       约 104 KB（gzip 41 KB）—— 框架 + 路由 + TabBar
dist/assets/records-*.js     约 0.36 KB
dist/assets/record-*.js      约 0.36 KB
dist/assets/accounts-*.js    约 0.36 KB
dist/assets/stats-*.js       约 0.36 KB
dist/assets/settings-*.js    约 5.57 KB—— 主题设置页较重
```

主包已含五个页签图标（`unplugin-icons` 编译期内联 SVG，无额外网络请求），故页面级 chunk 极小。
**后续填充业务代码时主包不应继续变胖**——新依赖优先考虑能否按页面拆分。

---

## 已知遗留

- 业务页面目前均为占位骨架，预取收益要等页面充实后才能充分体现
- 预取在 `dev` 模式下同样生效，HMR 期间可能看到重复请求，属正常现象
- 若未来接入 Service Worker（PWA / K2 任务），可用 Cache API 缓存 chunk，弱网表现会再上一个台阶
