import { Menu, WorkspaceLeaf, setIcon } from "obsidian";
import JustTabsPlugin from "./main";
import {
	TabItem,
	closeOtherLeavesInGroup,
	collectTabs,
	getLeafId,
	moveLeafRelative,
	renderIcon,
} from "./tabs";

interface RowRecord {
	item: TabItem;
	el: HTMLElement;
	iconEl: HTMLElement;
	titleEl: HTMLElement;
	closeEl: HTMLElement;
}

export class TabController {
	private plugin: JustTabsPlugin;
	private rootEl: HTMLElement;
	private toolbarEl: HTMLElement;
	private listButtonEl: HTMLButtonElement;
	private cardButtonEl: HTMLButtonElement;
	private iconButtonEl: HTMLButtonElement;
	private listEl: HTMLElement;
	private emptyEl: HTMLElement;
	private rows = new Map<string, RowRecord>();
	private orderedIds: string[] = [];
	private frame: number | null = null;
	private activeId: string | null = null;
	private draggedId: string | null = null;
	private dragOverId: string | null = null;
	private dropPosition: "before" | "after" = "before";

	constructor(plugin: JustTabsPlugin, containerEl: HTMLElement) {
		this.plugin = plugin;
		containerEl.empty();
		this.rootEl = containerEl.createDiv({ cls: "just-tabs-root" });
		this.toolbarEl = this.rootEl.createDiv({ cls: "just-tabs-toolbar" });
		this.listButtonEl = this.createLayoutButton("list", "List view");
		this.cardButtonEl = this.createLayoutButton("card", "Card view");
		this.iconButtonEl = this.createIconButton();
		this.listEl = this.rootEl.createDiv({ cls: "just-tabs-list" });
		this.emptyEl = this.listEl.createDiv({
			cls: "just-tabs-empty",
			text: "No open tabs",
		});
		this.syncLayoutButtons();
		this.syncIconButton();
	}

	dispose(): void {
		if (this.frame !== null) {
			cancelAnimationFrame(this.frame);
			this.frame = null;
		}
		this.rows.clear();
		this.rootEl.remove();
	}

	scheduleRefresh(): void {
		if (this.frame !== null) return;
		this.frame = requestAnimationFrame(() => {
			this.frame = null;
			this.refreshStructure();
		});
	}

	refreshStructure(): void {
		const items = collectTabs(this.plugin.app);
		const nextIds = items.map((item) => item.id);
		const nextIdSet = new Set(nextIds);
		const itemsById = new Map(items.map((item) => [item.id, item]));

		for (const [id, row] of this.rows) {
			if (!nextIdSet.has(id)) {
				row.el.remove();
				this.rows.delete(id);
			}
		}

		for (const item of items) {
			const existing = this.rows.get(item.id);
			if (existing) {
				this.updateRow(existing, item);
			} else {
				this.rows.set(item.id, this.createRow(item));
			}
		}

		this.listEl
			.querySelectorAll(
				".just-tabs-group-separator, .just-tabs-group-drop-zone"
			)
			.forEach((el) => el.remove());

		let previousParentId: string | null = null;
		let previousItem: TabItem | null = null;
		let groupItemCount = 0;
		for (const id of nextIds) {
			const row = this.rows.get(id);
			const item = itemsById.get(id);
			if (
				item &&
				previousParentId !== null &&
				item.parentId !== previousParentId
			) {
				if (previousItem) {
					this.appendGroupDropZones(previousItem, groupItemCount);
				}
				this.listEl.appendChild(this.createGroupSeparator());
				groupItemCount = 0;
			}
			if (row) this.listEl.appendChild(row.el);
			previousParentId = item?.parentId ?? previousParentId;
			previousItem = item ?? previousItem;
			if (item) groupItemCount += 1;
		}
		if (previousItem) {
			this.appendGroupDropZones(previousItem, groupItemCount);
		}

		this.orderedIds = nextIds;
		this.emptyEl.toggle(items.length === 0);
		this.syncActive(items);
		this.syncLayoutButtons();
		this.syncIconButton();
	}

	syncActive(items = collectTabs(this.plugin.app)): void {
		const active = items.find((item) => item.active)?.id ?? null;
		if (active === this.activeId) return;

		if (this.activeId) {
			this.rows.get(this.activeId)?.el.toggleClass("is-active", false);
		}
		if (active) {
			this.rows.get(active)?.el.toggleClass("is-active", true);
		}
		this.activeId = active;
	}

	private createRow(item: TabItem): RowRecord {
		const el = createDiv({ cls: "just-tabs-item" });
		el.dataset.leafId = item.id;
		el.draggable = true;

		const iconEl = el.createDiv({ cls: "just-tabs-icon" });
		const titleEl = el.createDiv({ cls: "just-tabs-title" });
		const closeEl = el.createDiv({ cls: "just-tabs-close" });
		renderIcon(closeEl, "x");

		el.addEventListener("click", (event) => {
			if ((event.target as HTMLElement).closest(".just-tabs-close")) {
				this.closeLeaf(item.leaf);
				return;
			}
			this.activateLeaf(item.leaf);
		});
		el.addEventListener("auxclick", (event) => {
			if (event.button === 1) {
				event.preventDefault();
				this.closeLeaf(item.leaf);
			}
		});
		closeEl.addEventListener("click", (event) => {
			event.stopPropagation();
			this.closeLeaf(item.leaf);
		});
		el.addEventListener("contextmenu", (event) => {
			event.preventDefault();
			this.showContextMenu(item.leaf, event);
		});

		el.addEventListener("dragstart", (event) => {
			this.draggedId = item.id;
			this.rootEl.toggleClass("is-dragging", true);
			el.toggleClass("is-drag-source", true);
			event.dataTransfer?.setData("text/plain", item.id);
			event.dataTransfer?.setDragImage(el, 10, 10);
		});
		el.addEventListener("dragover", (event) => {
			if (!this.draggedId || this.draggedId === item.id) return;
			event.preventDefault();
			this.setDropTarget(item.id, el, event);
		});
		el.addEventListener("dragleave", () => {
			this.clearDropTarget(item.id);
		});
		el.addEventListener("drop", (event) => {
			event.preventDefault();
			this.setDropTarget(item.id, el, event);
			const sourceId =
				event.dataTransfer?.getData("text/plain") || this.draggedId;
			const position = this.dropPosition;
			this.clearAllDragState();
			this.draggedId = null;
			if (
				sourceId &&
				moveLeafRelative(this.plugin.app, sourceId, item.id, position)
			) {
				this.scheduleRefresh();
			}
		});
		el.addEventListener("dragend", () => {
			this.clearAllDragState();
		});

		const row = { item, el, iconEl, titleEl, closeEl };
		this.updateRow(row, item);
		return row;
	}

	private createLayoutButton(
		style: "list" | "card",
		label: string
	): HTMLButtonElement {
		const button = this.toolbarEl.createEl("button", {
			cls: "just-tabs-layout-button",
			attr: {
				"aria-label": label,
				title: label,
			},
		});
		setIcon(button, style === "list" ? "list" : "layout-grid");
		button.addEventListener("click", async () => {
			if (this.plugin.settings.layoutStyle === style) return;
			this.plugin.settings.layoutStyle = style;
			this.plugin.applySettings();
			this.syncLayoutButtons();
			await this.plugin.saveSettings();
		});
		return button;
	}

	private syncLayoutButtons(): void {
		const isList = this.plugin.settings.layoutStyle === "list";
		this.listButtonEl.toggleClass("is-active", isList);
		this.cardButtonEl.toggleClass("is-active", !isList);
	}

	private createIconButton(): HTMLButtonElement {
		const button = this.toolbarEl.createEl("button", {
			cls: "just-tabs-toolbar-button",
			attr: {
				"aria-label": "Toggle file icons",
				title: "Toggle file icons",
			},
		});
		button.addEventListener("click", async () => {
			this.plugin.settings.showIcons = !this.plugin.settings.showIcons;
			this.plugin.applySettings();
			this.syncIconButton();
			await this.plugin.saveSettings();
		});
		return button;
	}

	private syncIconButton(): void {
		const showIcons = this.plugin.settings.showIcons;
		this.iconButtonEl.toggleClass("is-active", showIcons);
		setIcon(this.iconButtonEl, showIcons ? "file" : "file-x");
	}

	private createGroupSeparator(): HTMLElement {
		return createDiv({ cls: "just-tabs-group-separator" });
	}

	private appendGroupDropZones(item: TabItem, groupItemCount: number): void {
		const count = this.getGroupDropZoneCount(groupItemCount);
		for (let index = 0; index < count; index += 1) {
			this.listEl.appendChild(this.createGroupDropZone(item));
		}
	}

	private getGroupDropZoneCount(groupItemCount: number): number {
		if (this.plugin.settings.layoutStyle !== "card") return 1;
		const columns = getComputedStyle(this.listEl)
			.gridTemplateColumns.split(" ")
			.filter(Boolean).length;
		if (columns <= 1) return 1;
		const remainder = groupItemCount % columns;
		return remainder === 0 ? 1 : columns - remainder;
	}

	private createGroupDropZone(item: TabItem): HTMLElement {
		const el = createDiv({ cls: "just-tabs-group-drop-zone" });
		el.addEventListener("dragover", (event) => {
			if (!this.draggedId || this.draggedId === item.id) return;
			event.preventDefault();
			el.toggleClass("is-drag-over", true);
		});
		el.addEventListener("dragleave", () => {
			el.toggleClass("is-drag-over", false);
		});
		el.addEventListener("drop", (event) => {
			event.preventDefault();
			el.toggleClass("is-drag-over", false);
			const sourceId =
				event.dataTransfer?.getData("text/plain") || this.draggedId;
			this.clearAllDragState();
			if (
				sourceId &&
				moveLeafRelative(this.plugin.app, sourceId, item.id, "after")
			) {
				this.scheduleRefresh();
			}
		});
		return el;
	}

	private setDropTarget(
		id: string,
		el: HTMLElement,
		event: DragEvent
	): void {
		if (this.dragOverId && this.dragOverId !== id) {
			this.clearDropTarget(this.dragOverId);
		}
		const rect = el.getBoundingClientRect();
		const isCardLayout = this.plugin.settings.layoutStyle === "card";
		const position = isCardLayout
			? event.clientX > rect.left + rect.width / 2
				? "after"
				: "before"
			: event.clientY > rect.top + rect.height / 2
				? "after"
				: "before";
		this.dragOverId = id;
		this.dropPosition = position;
		el.toggleClass("is-drag-over", true);
		el.toggleClass("is-drop-before", position === "before");
		el.toggleClass("is-drop-after", position === "after");
	}

	private clearDropTarget(id: string): void {
		const row = this.rows.get(id);
		if (!row) return;
		row.el.toggleClass("is-drag-over", false);
		row.el.toggleClass("is-drop-before", false);
		row.el.toggleClass("is-drop-after", false);
		if (this.dragOverId === id) {
			this.dragOverId = null;
		}
	}

	private clearAllDragState(): void {
		for (const row of this.rows.values()) {
			row.el.toggleClass("is-drag-source", false);
			row.el.toggleClass("is-drag-over", false);
			row.el.toggleClass("is-drop-before", false);
			row.el.toggleClass("is-drop-after", false);
		}
		this.draggedId = null;
		this.dragOverId = null;
		this.dropPosition = "before";
		this.rootEl.toggleClass("is-dragging", false);
	}

	private updateRow(row: RowRecord, item: TabItem): void {
		row.item = item;
		row.titleEl.setText(item.title);
		row.el.title = item.title;
		row.el.dataset.parentId = item.parentId;
		row.el.toggleClass("is-active", item.active);
		renderIcon(row.iconEl, item.icon);
	}

	private activateLeaf(leaf: WorkspaceLeaf): void {
		this.plugin.app.workspace.setActiveLeaf(leaf, { focus: true });
	}

	private showContextMenu(leaf: WorkspaceLeaf, event: MouseEvent): void {
		const menu = new Menu();
		menu.addItem((item) => {
			item.setTitle("Close").setIcon("x").onClick(() => {
				this.closeLeaf(leaf);
			});
		});
		menu.addItem((item) => {
			item
				.setTitle("Close others in same group")
				.setIcon("x-circle")
				.onClick(() => {
					this.activateLeaf(leaf);
					closeOtherLeavesInGroup(leaf);
					this.scheduleRefresh();
				});
		});
		menu.showAtMouseEvent(event);
	}

	private closeLeaf(leaf: WorkspaceLeaf): void {
		const wasActive = this.activeId === getLeafId(leaf);
		leaf.detach();
		if (wasActive) this.activeId = null;
		this.scheduleRefresh();
	}
}
