# Obsidian Only Tabs

English | [中文](#中文)

Obsidian Only Tabs is a lightweight Obsidian plugin that replaces the native single-line tab strip with an independent tab panel. It focuses on fast tab switching, simple drag sorting, and low runtime overhead.

## Features

- Independent tab panel in the Obsidian sidebar.
- Click to activate a tab.
- Middle click or close button to close a tab.
- Minimal context menu: close, close others in the same group.
- Same-group and cross-group drag sorting.
- Drop a tab into the empty end area of a group to move it to the end.
- List and card layouts.
- Quick layout switcher in the panel toolbar.
- Optional file icons.
- Optional hiding of inactive native tabs in the main editor area.

## Design Goals

- No polling loops.
- No React or large UI framework dependency.
- No high-cost tab cache.
- Active-tab changes update only the active state whenever possible.
- Advanced actions are added only when they are useful and cheap.

## Installation

### Manual Installation

1. Download `main.js`, `manifest.json`, and `styles.css` from a release.
2. Create this folder in your vault:
   `Vault/.obsidian/plugins/obsidian-only-tabs/`
3. Put the three files into that folder.
4. Reload Obsidian.
5. Enable `Only Tabs` in `Settings -> Community plugins`.

### Build From Source

```bash
npm install
npm run build
```

The production build writes `main.js` to the repository root. For a manual release, publish:

- `main.js`
- `manifest.json`
- `styles.css`

## Settings

- `Hide native tabs`: hide inactive native tab headers in the main editor area.
- `Layout style`: choose list or card layout.
- `Show file icons`: toggle file icons in the tab panel.
- `Card width`: minimum card width.
- `Card height`: fixed card height.

## Notes

This plugin intentionally does not implement persistent editable group titles. Obsidian workspace groups are runtime layout structures, so storing user-facing names against them adds synchronization and invalidation cost. The plugin keeps group boundaries lightweight instead.

## License

MIT

---

# 中文

[English](#obsidian-only-tabs) | 中文

Obsidian Only Tabs 是一款轻量级 Obsidian 插件，用独立面板替代原生单行标签页。插件重点关注快速切换、简单拖动排序和低运行时开销。

## 功能

- 在 Obsidian 侧边栏显示独立标签页面板。
- 单击切换标签。
- 中键或关闭按钮关闭标签。
- 最小右键菜单：关闭、关闭同组其他标签。
- 支持同组和跨组拖动排序。
- 拖动到分组末尾空白区域时，可移动到该组最后。
- 支持列表和卡片两种布局。
- 面板顶部提供快速布局切换按钮。
- 可选择显示或隐藏文件图标。
- 可选择隐藏主编辑区中的非活跃原生标签。

## 设计目标

- 不使用轮询刷新。
- 不依赖 React 或大型 UI 框架。
- 不维护高开销标签缓存。
- 活动标签变化尽量只更新 active 状态。
- 只加入确实有用且开销低的进阶操作。

## 安装

### 手动安装

1. 从 release 下载 `main.js`、`manifest.json`、`styles.css`。
2. 在你的库中创建目录：
   `Vault/.obsidian/plugins/obsidian-only-tabs/`
3. 将这三个文件放入该目录。
4. 重启或刷新 Obsidian。
5. 在 `设置 -> 第三方插件` 中启用 `Only Tabs`。

### 从源码构建

```bash
npm install
npm run build
```

生产构建会在仓库根目录生成 `main.js`。手动发布时需要发布：

- `main.js`
- `manifest.json`
- `styles.css`

## 设置项

- `Hide native tabs`：隐藏主编辑区中的非活跃原生标签头。
- `Layout style`：选择列表或卡片布局。
- `Show file icons`：显示或隐藏标签面板中的文件图标。
- `Card width`：卡片最小宽度。
- `Card height`：卡片固定高度。

## 说明

本插件刻意不实现持久化的可编辑分组标题。Obsidian 的 workspace group 更接近运行时布局结构，将用户可见名称绑定到这些结构上会增加同步和失效处理成本。因此插件只保留轻量的分组边界。

## 许可证

MIT
