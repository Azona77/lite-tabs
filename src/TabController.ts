import { WorkspaceLeaf } from "obsidian";
import OnlyTabsPlugin from "./main";
import {
	TabItem,
	collectTabs,
	getLeafId,
	moveLeafBefore,
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
	private plugin: OnlyTabsPlugin;
	private rootEl: HTMLElement;
	private listEl: HTMLElement;
	private emptyEl: HTMLElement;
	private rows = new Map<string, RowRecord>();
	private orderedIds: string[] = [];
	private frame: number | null = null;
	private activeId: string | null = null;
	private draggedId: string | null = null;

	constructor(plugin: OnlyTabsPlugin, containerEl: HTMLElement) {
		this.plugin = plugin;
		containerEl.empty();
		this.rootEl = containerEl.createDiv({ cls: "only-tabs-root" });
		this.listEl = this.rootEl.createDiv({ cls: "only-tabs-list" });
		this.emptyEl = this.listEl.createDiv({
			cls: "only-tabs-empty",
			text: "No open tabs",
		});
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
			.querySelectorAll(".only-tabs-group-separator")
			.forEach((el) => el.remove());

		let previousParentId: string | null = null;
		for (const id of nextIds) {
			const row = this.rows.get(id);
			const item = itemsById.get(id);
			if (
				item &&
				previousParentId !== null &&
				item.parentId !== previousParentId
			) {
				this.listEl.appendChild(this.createGroupSeparator());
			}
			if (row) this.listEl.appendChild(row.el);
			previousParentId = item?.parentId ?? previousParentId;
		}

		this.orderedIds = nextIds;
		this.emptyEl.toggle(items.length === 0);
		this.syncActive(items);
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
		const el = createDiv({ cls: "only-tabs-item" });
		el.dataset.leafId = item.id;
		el.draggable = true;

		const iconEl = el.createDiv({ cls: "only-tabs-icon" });
		const titleEl = el.createDiv({ cls: "only-tabs-title" });
		const closeEl = el.createDiv({ cls: "only-tabs-close" });
		renderIcon(closeEl, "x");

		el.addEventListener("click", (event) => {
			if ((event.target as HTMLElement).closest(".only-tabs-close")) {
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

		el.addEventListener("dragstart", (event) => {
			this.draggedId = item.id;
			event.dataTransfer?.setData("text/plain", item.id);
			event.dataTransfer?.setDragImage(el, 10, 10);
		});
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
			this.draggedId = null;
			if (sourceId && moveLeafBefore(this.plugin.app, sourceId, item.id)) {
				this.scheduleRefresh();
			}
		});
		el.addEventListener("dragend", () => {
			this.draggedId = null;
			el.toggleClass("is-drag-over", false);
		});

		const row = { item, el, iconEl, titleEl, closeEl };
		this.updateRow(row, item);
		return row;
	}

	private createGroupSeparator(): HTMLElement {
		return createDiv({ cls: "only-tabs-group-separator" });
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

	private closeLeaf(leaf: WorkspaceLeaf): void {
		const wasActive = this.activeId === getLeafId(leaf);
		leaf.detach();
		if (wasActive) this.activeId = null;
		this.scheduleRefresh();
	}
}
