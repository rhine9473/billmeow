# 项目约定

## 目录结构

### 页面（views）

新建页面时，在 `src/views/` 下为该页面单独建一个同名文件夹，页面入口统一命名为 `index.vue`。

```
src/views/
├── settings/          # 设置页
│   ├── index.vue      # 页面入口（必须叫 index）
│   └── Theme.vue      # 该页专用的子组件
└── records/           # 另一个页面
    └── index.vue
```

规则要点：

- **一页一目录**：不要把多个页面平铺在 `views/` 根目录，也不要写成 `SettingsView.vue` 这种带 `View` 后缀的单文件
- **入口统一 `index.vue`**：路由懒加载指向 `views/{页面名}/index.vue`
- **页内组件就近放置**：仅该页面使用的子组件，放进该页面的文件夹；跨页面复用的组件才放到 `src/components/`
- **命名简洁**：子组件去掉页面名前缀，例如 `settings/Theme.vue` 而非 `settings/SettingsTheme.vue`

路由中的写法：

```ts
{
  path: '/settings',
  name: 'settings',
  component: () => import('../views/settings/index.vue'),
}
```

## 注释规范

### 一律使用块注释，禁止 `//` 行注释

所有注释都用块注释形式，不要写 `//` 行注释。

### 两类块注释，按用途区分

**1. `/** */` —— API 文档注释（JSDoc）**

用于描述**对外暴露的 API**：导出的函数、类型、接口、常量、组件 props 等。

这类注释会被编辑器识别，鼠标悬停时显示文档浮窗，并支持标准 JSDoc 标签：

| 标签 | 用途 |
| ---- | ---- |
| `@param` | 描述参数（名称 + 类型含义） |
| `@returns` | 描述返回值 |
| `@example` | 给出可运行的使用示例 |
| `@throws` | 说明可能抛出的异常 |
| `@deprecated` | 标记废弃（编辑器会显示删除线并警告） |
| `@see` | 关联的其他 API 或文档 |
| `@remarks` | 补充说明 / 注意事项 |

示例：

```ts
/**
 * 把主题应用到 `<html>` 元素。
 *
 * `auto` 模式会移除 `data-theme` 属性，交给 CSS 的 `prefers-color-scheme` 决定；
 * 其余模式写入同名属性，由 `theme.scss` 中对应的选择器接管。
 *
 * @param mode 主题模式
 * @example
 * applyTheme('dark')  // <html data-theme="dark">
 * applyTheme('auto')  // <html>（无 data-theme）
 */
function applyTheme(mode: ThemeMode) { ... }
```

**2. `/* */` —— 普通说明注释**

用于**函数体内部的实现说明**：某一行代码为什么这么写、踩过的坑、临时注意事项等。
这类内容不是 API 的一部分，不需要被编辑器提取为文档。

```ts
function runTransition(duration: number) {
  if (typeof window === 'undefined') return

  /* 系统要求减少动效时直接跳过（CSS 里也有兜底） */
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
}
```

### 判断标准

写注释前先问一句：**「这个信息对调用方有价值吗？」**

- **有价值**（参数含义、返回值、用法示例、废弃提醒）→ 用 `/** */`，尽量把 `@param` / `@returns` / `@example` 写全
- **只对维护者有价值**（实现细节、性能取舍、兼容性绕行）→ 用 `/* */`

### 其他约定

- 样式文件（`.scss`）内用 `/* */`（SCSS 中的 `/** */` 无 JSDoc 语义）
- 注释统一使用中文，术语保持英文原样（如 `data-theme`、`prefers-color-scheme`）
- 不要保留被注释掉的死代码，直接删除