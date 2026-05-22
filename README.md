# Obsidian Just Tabs

English | [中文](#中文)

Obsidian Just Tabs is a lightweight Obsidian plugin that replaces the crowded native single-line tab strip with an independent tab panel. It focuses on fast switching, low runtime overhead, and a layout system that can grow from vertical tabs to cards and future gallery-style views.

## Why This Plugin

Most tab panel plugins optimize for a full-featured tab manager. Just Tabs is intentionally narrower:

- It only targets the main editor area, not every workspace pane.
- It uses event-driven updates instead of polling.
- It avoids React, virtual DOM layers, and large tab caches.
- It keeps right-click actions minimal to reduce maintenance and runtime cost.
- It treats layouts as lightweight render styles, so vertical, card, and future gallery layouts can share the same core tab model.

## Layouts

- **Vertical / List**: the default dense layout for fast scanning and switching.
- **Cards**: a multi-column layout with configurable card width and height for users who prefer larger visual targets.
- **Gallery-ready**: the architecture keeps layout concerns separate from tab collection and sorting, so a future gallery layout can be added without rewriting the core controller.

## Features

- Independent tab panel in the Obsidian sidebar.
- Click to activate a tab.
- Middle click or close button to close a tab.
- Minimal context menu: close, close others in the same group.
- Same-group and cross-group drag sorting.
- Drop a tab into the empty end area of a group to move it to the end.
- Quick layout switcher in the panel toolbar.
- Optional file icons.
- Optional hiding of inactive native tabs in the main editor area.
- Manual refresh command and toolbar button for recovery if Obsidian's layout state gets out of sync.

## Performance Notes

- Active-tab changes update only active row classes.
- Full panel refreshes are coalesced with `requestAnimationFrame`.
- Structural refreshes are skipped when tab order, group, title, icon, and layout signature are unchanged.
- Existing tab rows are reused; titles, parent ids, active state, and icons are only written when changed.
- No polling loop, no high-cost persistent cache, and no complex group-title synchronization.

## Installation

### Manual Installation

1. Download `main.js`, `manifest.json`, and `styles.css` from a release.
2. Create this folder in your vault:
   `Vault/.obsidian/plugins/obsidian-just-tabs/`
3. Put the three files into that folder.
4. Reload Obsidian.
5. Enable `Just Tabs` in `Settings -> Community plugins`.

### Build From Source

```bash
npm install
npm run build
```

The production build writes `main.js` to the repository root. For a manual release, publish:

- `main.js`
- `manifest.json`
- `styles.css`

## Commands

- `Open Just Tabs`: open or reveal the Just Tabs panel.
- `Refresh Just Tabs panel`: force the panel to rebuild from the current Obsidian workspace state.

## Settings

- `Hide native tabs`: hide inactive native tab headers in the main editor area.
- `Layout style`: choose list or card layout.
- `Show file icons`: toggle file icons in the tab panel.
- `Card width`: minimum card width.
- `Card height`: fixed card height. Overflowing title text is hidden.

## Notes

This plugin intentionally does not implement persistent editable group titles. Obsidian workspace groups are runtime layout structures, so storing user-facing names against them adds synchronization and invalidation cost. The plugin keeps group boundaries lightweight instead.

## License

MIT

---

# 中文

[English](#obsidian-just-tabs) | 中文

Obsidian Just Tabs 是一款轻量级 Obsidian 插件，用独立标签页面板替代拥挤的原生单行标签栏。它优先保证切换效率、低运行开销，并为从 vertical/list 到 cards，再到未来 gallery 样式的扩展保留清晰结构。

## 插件差异点

很多标签页插件更接近完整的标签管理器。Just Tabs 的定位更克制：

- 只针对主编辑区域，不接管所有工作区面板。
- 使用事件驱动刷新，不使用轮询。
- 不引入 React、虚拟 DOM 层或大型标签缓存。
- 右键菜单保持最小功能集，降低维护和运行成本。
- 将布局视为轻量渲染样式，vertical、cards 和未来 gallery 可以共享同一套核心标签模型。

## 布局特点

- **Vertical / List**：默认的纵向紧凑列表，适合快速扫视和切换。
- **Cards**：多列卡片布局，支持配置卡片宽度和高度，适合更大的点击目标。
- **Gallery-ready**：当前架构已将布局表现与标签收集、排序逻辑拆开，后续可扩展 gallery 风格视图，而不需要重写核心控制器。

## 主要功能

- Obsidian 侧边栏中的独立标签页面板。
- 单击切换标签。
- 中键或关闭按钮关闭标签。
- 最小右键菜单：关闭、关闭同组其他标签。
- 支持同组和跨组拖动排序。
- 可拖动到分组末尾空白区域，将标签移动到该组最后。
- 面板顶部提供快速布局切换。
- 可选择显示或隐藏文件图标。
- 可选择隐藏主编辑区中的非活跃原生标签。
- 提供手动刷新命令和工具栏按钮，用于 Obsidian 布局状态意外不同步时恢复面板。

## 性能说明

- 活动标签切换只更新活动行 class。
- 完整面板刷新通过 `requestAnimationFrame` 合并。
- 当标签顺序、分组、标题、图标和布局签名没有变化时，会跳过结构刷新。
- 已有标签行会复用；标题、父级 id、活动状态和图标只在变化时写入 DOM。
- 无轮询刷新、无高开销持久缓存、无复杂分组标题同步。

## 安装

### 手动安装

1. 从 release 下载 `main.js`、`manifest.json` 和 `styles.css`。
2. 在你的 vault 中创建目录：
   `Vault/.obsidian/plugins/obsidian-just-tabs/`
3. 将三个文件放入该目录。
4. 重新加载 Obsidian。
5. 在 `设置 -> 第三方插件` 中启用 `Just Tabs`。

### 从源码构建

```bash
npm install
npm run build
```

生产构建会将 `main.js` 输出到仓库根目录。手动发布时需要包含：

- `main.js`
- `manifest.json`
- `styles.css`

## 命令

- `Open Just Tabs`：打开或显示 Just Tabs 面板。
- `Refresh Just Tabs panel`：根据当前 Obsidian 工作区状态强制重建面板。

## 设置

- `Hide native tabs`：隐藏主编辑区中的非活跃原生标签页标题。
- `Layout style`：选择 list 或 card 布局。
- `Show file icons`：切换标签页面板中的文件图标。
- `Card width`：卡片最小宽度。
- `Card height`：卡片固定高度，超出高度的标题内容会被隐藏。

## 说明

本插件刻意不实现持久化的可编辑分组标题。Obsidian 的 workspace group 是运行时布局结构，如果为其存储用户可见名称，会增加同步和失效处理成本。Just Tabs 目前只保留轻量的分组边界。

## License

MIT
