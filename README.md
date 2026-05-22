# Obsidian Just Tabs

English | [中文](#中文)

Just Tabs is a lightweight Obsidian plugin that shows open editor tabs in an independent sidebar panel. It is built as a compact replacement for Obsidian's crowded single-line tab strip, with a focus on fast switching and low runtime overhead.

## Features

- Independent sidebar panel for editor tabs.
- Vertical list view for dense scanning.
- Card view with configurable width, height, gap, and font size.
- Same-group and cross-group drag sorting.
- Drop to a group's empty end area to move a tab to the end.
- Click to activate, middle click or close button to close.
- Minimal context menu: close, close others in the same group.
- Optional file icons, toolbar hiding, and inactive native tab hiding.
- Manual refresh command and toolbar button.

## Performance

- Event-driven updates, no polling loop.
- Refreshes are coalesced with `requestAnimationFrame`.
- Existing row elements are reused when possible.
- Active-tab changes only update active row classes.
- No persistent tab cache or editable group-title synchronization.

## Installation

Download `main.js`, `manifest.json`, and `styles.css` from a release, then place them in:

```text
Vault/.obsidian/plugins/obsidian-just-tabs/
```

Reload Obsidian and enable `Just Tabs` in community plugins.

## Build

```bash
npm install
npm run build
```

The production build writes `main.js` to the repository root.

## Commands

- `Open Just Tabs`: open or reveal the Just Tabs panel.
- `Refresh Just Tabs panel`: rebuild the panel from the current workspace state.

## Notes

`Hide inactive tabs` is disabled by default because it changes Obsidian's native tab strip. Enable it only if you want Just Tabs to visually replace inactive native tab headers in the main editor area.

Persistent editable group titles are intentionally not included. Obsidian workspace groups are runtime layout structures, and storing custom names for them would add synchronization cost.

## License

MIT

---

# 中文

Just Tabs 是一个轻量级 Obsidian 插件，用独立侧边栏面板展示当前编辑区打开的标签页。它的目标是替代拥挤的原生单行标签栏，同时保持快速切换和低运行开销。

## 功能

- 独立侧边栏标签页面板。
- 适合快速检索的垂直列表视图。
- 卡片视图，支持配置宽度、高度、间距和字体大小。
- 支持同组和跨组拖动排序。
- 拖到分组末尾空白区域可移动到该组末尾。
- 单击激活，中键或关闭按钮关闭。
- 精简右键菜单：关闭、关闭同组其他标签页。
- 可选文件图标、隐藏工具栏、隐藏非活跃原生标签页。
- 提供手动刷新命令和工具栏按钮。

## 性能

- 事件驱动更新，不使用轮询。
- 使用 `requestAnimationFrame` 合并刷新。
- 尽量复用已有条目 DOM。
- 活跃标签变化只更新活跃状态 class。
- 不维护大体量持久缓存，不同步自定义分组标题。

## 安装

从 release 下载 `main.js`、`manifest.json` 和 `styles.css`，放入：

```text
Vault/.obsidian/plugins/obsidian-just-tabs/
```

重启 Obsidian 后，在第三方插件中启用 `Just Tabs`。

## 构建

```bash
npm install
npm run build
```

生产构建会把 `main.js` 输出到仓库根目录。

## 命令

- `Open Just Tabs`：打开或显示 Just Tabs 面板。
- `Refresh Just Tabs panel`：根据当前工作区状态重建面板。

## 说明

`Hide inactive tabs` 默认关闭，因为它会改变 Obsidian 原生标签栏的显示方式。只有在希望 Just Tabs 视觉上替代主编辑区非活跃原生标签页时再开启。

插件刻意不实现持久化的可编辑分组标题。Obsidian 的 workspace group 是运行时布局结构，额外存储自定义名称会增加同步成本。

## 许可证

MIT
