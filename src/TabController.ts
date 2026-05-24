import { Menu, WorkspaceLeaf, setIcon } from "obsidian";
import LiteTabsPlugin from "./main";
import { LiteTabsLayoutStyle } from "./settings";
import {
	TabItem,
	closeOtherLeavesInGroup,
	collectTabs,
	getActiveTabId,
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
	renderedTitle: string;
	renderedIcon: string;
	renderedParentId: string;
	active: boolean;
}

interface RectSnapshot {
	left: number;
	right: number;
	top: number;
	bottom: number;
	width: number;
	height: number;
}

interface RowGeometry {
	id: string;
	el: HTMLElement;
	rect: RectSnapshot;
}

interface SeparatorGeometry {
	endId: string;
	rowRect: RectSnapshot;
	separatorRect: RectSnapshot;
}

interface DragGeometry {
	listRect: RectSnapshot;
	rows: RowGeometry[];
	separators: SeparatorGeometry[];
}

export class TabController {
	private plugin: LiteTabsPlugin;
	private rootEl: HTMLElement;
	private toolbarEl: HTMLElement;
	private listButtonEl: HTMLButtonElement;
	private cardButtonEl: HTMLButtonElement;
	private masonryButtonEl: HTMLButtonElement;
	private iconButtonEl: HTMLButtonElement;
	private inactiveTabsButtonEl: HTMLButtonElement;
	private refreshButtonEl: HTMLButtonElement;
	private searchInputEl: HTMLInputElement;
	private listEl: HTMLElement;
	private dropIndicatorEl: HTMLElement;
	private emptyEl: HTMLElement;
	private rows = new Map<string, RowRecord>();
	private orderedIds: string[] = [];
	private orderedIndexById = new Map<string, number>();
	private structureSignature: string | null = null;
	private frame: number | null = null;
	private activeId: string | null = null;
	private draggedId: string | null = null;
	private dragSourceEl: HTMLElement | null = null;
	private dragOverId: string | null = null;
	private dragOverZoneEl: HTMLElement | null = null;
	private lastGroupEndId: string | null = null;
	private groupSeparators: { endId: string; el: HTMLElement }[] = [];
	private dropPosition: "before" | "after" = "before";
	private indicatorKey: string | null = null;
	private indicatorTargetKey: string | null = null;
	private dragGeometry: DragGeometry | null = null;
	private filterQuery = "";
	private masonryFrame: number | null = null;
	private resizeObserver: ResizeObserver | null = null;

	constructor(plugin: LiteTabsPlugin, containerEl: HTMLElement) {
		this.plugin = plugin;
		containerEl.empty();
		this.rootEl = containerEl.createDiv({ cls: "lite-tabs-root" });
		this.toolbarEl = this.rootEl.createDiv({ cls: "lite-tabs-toolbar" });
		this.listButtonEl = this.createLayoutButton("list", "List view");
		this.cardButtonEl = this.createLayoutButton("card", "Card view");
		this.masonryButtonEl = this.createLayoutButton(
			"masonry",
			"Masonry view"
		);
		this.iconButtonEl = this.createIconButton();
		this.inactiveTabsButtonEl = this.createInactiveTabsButton();
		this.refreshButtonEl = this.createRefreshButton();
		this.searchInputEl = this.createSearchInput();
		this.listEl = this.rootEl.createDiv({ cls: "lite-tabs-list" });
		this.listEl.addEventListener("dragover", (event) => {
			this.handleListDragOver(event);
		});
		this.listEl.addEventListener("drop", (event) => {
			this.handleListDrop(event);
		});
		this.listEl.addEventListener("scroll", () => {
			this.invalidateDragGeometry();
		});
		this.emptyEl = this.listEl.createDiv({
			cls: "lite-tabs-empty",
			text: "No open tabs",
		});
		this.dropIndicatorEl = this.listEl.createDiv({
			cls: "lite-tabs-drop-indicator",
		});
		this.resizeObserver = new ResizeObserver(() => {
			this.invalidateDragGeometry();
			this.scheduleMasonryLayout();
		});
		this.resizeObserver.observe(this.listEl);
		this.syncLayoutButtons();
		this.syncIconButton();
		this.syncInactiveTabsButton();
	}

	dispose(): void {
		if (this.frame !== null) {
			cancelAnimationFrame(this.frame);
			this.frame = null;
		}
		if (this.masonryFrame !== null) {
			cancelAnimationFrame(this.masonryFrame);
			this.masonryFrame = null;
		}
		this.resizeObserver?.disconnect();
		this.resizeObserver = null;
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

	forceRefresh(): void {
		if (this.frame !== null) {
			cancelAnimationFrame(this.frame);
			this.frame = null;
		}
		this.structureSignature = null;
		this.refreshStructure(true);
	}

	refreshStructure(force = false): void {
		this.invalidateDragGeometry();
		const items = collectTabs(this.plugin.app);
		const nextSignature = this.getStructureSignature(items);
		if (!force && nextSignature === this.structureSignature) {
			this.syncActive();
			return;
		}
		const previousScrollTop = this.listEl.scrollTop;
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

		this.lastGroupEndId = null;
		this.groupSeparators = [];
		this.listEl
			.querySelectorAll(".lite-tabs-group-separator")
			.forEach((el) => el.remove());

		let previousParentId: string | null = null;
		let previousItem: TabItem | null = null;
		for (const id of nextIds) {
			const row = this.rows.get(id);
			const item = itemsById.get(id);
			if (
				item &&
				previousParentId !== null &&
				item.parentId !== previousParentId
			) {
				if (previousItem) {
					const separator = this.createGroupSeparator();
					this.groupSeparators.push({
						endId: previousItem.id,
						el: separator,
					});
					this.listEl.appendChild(separator);
				}
			}
			if (row) this.listEl.appendChild(row.el);
			previousParentId = item?.parentId ?? previousParentId;
			previousItem = item ?? previousItem;
		}
		if (previousItem) {
			this.lastGroupEndId = previousItem.id;
		}

		this.orderedIds = nextIds;
		this.orderedIndexById = new Map(
			nextIds.map((id, index) => [id, index])
		);
		this.structureSignature = nextSignature;
		this.syncActive(items);
		this.syncLayoutButtons();
		this.syncIconButton();
		this.syncInactiveTabsButton();
		this.applyFilter();
		this.scheduleMasonryLayout();
		this.restoreScrollTop(previousScrollTop);
	}

	syncActive(items?: TabItem[]): void {
		const active = items
			? items.find((item) => item.active)?.id ?? null
			: getActiveTabId(this.plugin.app);
		if (active === this.activeId) return;

		if (this.activeId) {
			const row = this.rows.get(this.activeId);
			row?.el.toggleClass("is-active", false);
			if (row) row.active = false;
		}
		if (active) {
			const row = this.rows.get(active);
			row?.el.toggleClass("is-active", true);
			if (row) row.active = true;
		}
		this.activeId = active;
	}

	private getStructureSignature(items: TabItem[]): string {
		return `${this.getLayoutSignature()}|${items
			.map(
				(item) =>
					`${item.id}\u001f${item.parentId}\u001f${item.title}\u001f${item.icon}`
			)
			.join("\u001e")}`;
	}

	private getLayoutSignature(): string {
		if (!this.isGridLikeLayout()) {
			return "list";
		}
		return `${this.plugin.settings.layoutStyle}:${this.getCardColumnCount()}`;
	}

	private createRow(item: TabItem): RowRecord {
		const el = createDiv({ cls: "lite-tabs-item" });
		el.dataset.leafId = item.id;
		el.draggable = true;

		const iconEl = el.createDiv({ cls: "lite-tabs-icon" });
		const titleEl = el.createDiv({ cls: "lite-tabs-title" });
		const closeEl = el.createDiv({ cls: "lite-tabs-close" });
		iconEl.draggable = true;
		titleEl.draggable = true;
		closeEl.draggable = false;
		renderIcon(closeEl, "x");

		el.addEventListener("mousedown", (event) => {
			if (event.button !== 1) return;
			event.preventDefault();
			event.stopPropagation();
			this.closeLeaf(item.leaf);
		});
		el.addEventListener("pointerdown", (event) => {
			if (event.button !== 0) return;
			this.draggedId = item.id;
			this.dragSourceEl = el;
		});
		el.addEventListener("click", (event) => {
			if ((event.target as HTMLElement).closest(".lite-tabs-close")) {
				this.closeLeaf(item.leaf);
				return;
			}
			this.activateLeaf(item.leaf);
		});
		el.addEventListener("auxclick", (event) => {
			if (event.button === 1) {
				event.preventDefault();
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
			this.startDrag(item.id, el, event);
		});
		iconEl.addEventListener("dragstart", (event) => {
			event.stopPropagation();
			this.startDrag(item.id, el, event);
		});
		titleEl.addEventListener("dragstart", (event) => {
			event.stopPropagation();
			this.startDrag(item.id, el, event);
		});
		el.addEventListener("dragend", () => {
			this.clearAllDragState();
		});

		const row = {
			item,
			el,
			iconEl,
			titleEl,
			closeEl,
			renderedTitle: "",
			renderedIcon: "",
			renderedParentId: "",
			active: false,
		};
		this.updateRow(row, item);
		return row;
	}

	private startDrag(id: string, el: HTMLElement, event: DragEvent): void {
		this.draggedId = id;
		this.dragSourceEl = el;
		this.invalidateDragGeometry();
		this.rootEl.toggleClass("is-dragging", true);
		el.toggleClass("is-drag-source", true);
		event.dataTransfer?.setData("text/plain", id);
		event.dataTransfer?.setDragImage(el, 10, 10);
	}

	private createLayoutButton(
		style: LiteTabsLayoutStyle,
		label: string
	): HTMLButtonElement {
		const button = this.toolbarEl.createEl("button", {
			cls: "lite-tabs-layout-button",
			attr: {
				"aria-label": label,
				title: label,
			},
		});
		setIcon(button, this.getLayoutIcon(style));
		button.addEventListener("click", async () => {
			if (this.plugin.settings.layoutStyle === style) return;
			this.plugin.settings.layoutStyle = style;
			this.plugin.applySettings();
			this.forceRefresh();
			this.syncLayoutButtons();
			await this.plugin.saveSettings();
		});
		return button;
	}

	private getLayoutIcon(style: LiteTabsLayoutStyle): string {
		if (style === "list") return "list";
		if (style === "masonry") return "layout-dashboard";
		return "layout-grid";
	}

	private syncLayoutButtons(): void {
		const isList = this.plugin.settings.layoutStyle === "list";
		const isCard = this.plugin.settings.layoutStyle === "card";
		const isMasonry = this.plugin.settings.layoutStyle === "masonry";
		this.listButtonEl.toggleClass("is-active", isList);
		this.cardButtonEl.toggleClass("is-active", isCard);
		this.masonryButtonEl.toggleClass("is-active", isMasonry);
	}

	private createIconButton(): HTMLButtonElement {
		const button = this.toolbarEl.createEl("button", {
			cls: "lite-tabs-toolbar-button",
			attr: {
				"aria-label": "Toggle file icons",
				title: "Toggle file icons",
			},
		});
		button.addEventListener("click", async () => {
			this.plugin.settings.showIcons = !this.plugin.settings.showIcons;
			this.plugin.applySettings();
			this.syncIconButton();
			this.scheduleMasonryLayout();
			await this.plugin.saveSettings();
		});
		return button;
	}

	private syncIconButton(): void {
		const showIcons = this.plugin.settings.showIcons;
		this.iconButtonEl.toggleClass("is-active", showIcons);
		setIcon(this.iconButtonEl, showIcons ? "file" : "file-x");
	}

	private createInactiveTabsButton(): HTMLButtonElement {
		const button = this.toolbarEl.createEl("button", {
			cls: "lite-tabs-toolbar-button",
			attr: {
				"aria-label": "Hide inactive tabs",
				title: "Hide inactive tabs",
			},
		});
		button.addEventListener("click", async () => {
			this.plugin.settings.hideNativeTabs =
				!this.plugin.settings.hideNativeTabs;
			this.plugin.applySettings();
			this.syncInactiveTabsButton();
			await this.plugin.saveSettings();
		});
		return button;
	}

	private syncInactiveTabsButton(): void {
		const hideInactiveTabs = this.plugin.settings.hideNativeTabs;
		this.inactiveTabsButtonEl.toggleClass("is-active", hideInactiveTabs);
		setIcon(this.inactiveTabsButtonEl, hideInactiveTabs ? "eye-off" : "eye");
	}

	private createRefreshButton(): HTMLButtonElement {
		const button = this.toolbarEl.createEl("button", {
			cls: "lite-tabs-toolbar-button",
			attr: {
				"aria-label": "Refresh Lite Tabs",
				title: "Refresh Lite Tabs",
			},
		});
		setIcon(button, "refresh-cw");
		button.addEventListener("click", () => {
			this.forceRefresh();
		});
		return button;
	}

	private createSearchInput(): HTMLInputElement {
		const input = this.toolbarEl.createEl("input", {
			cls: "lite-tabs-search",
			attr: {
				"aria-label": "Search tabs",
				placeholder: "Search tabs",
				type: "search",
			},
		});
		input.addEventListener("input", () => {
			this.filterQuery = input.value.trim().toLocaleLowerCase();
			this.clearAllDragState();
			this.applyFilter();
			this.scheduleMasonryLayout();
		});
		input.addEventListener("keydown", (event) => {
			if (event.key !== "Escape" || !input.value) return;
			event.stopPropagation();
			input.value = "";
			this.filterQuery = "";
			this.applyFilter();
			this.scheduleMasonryLayout();
		});
		return input;
	}

	private createGroupSeparator(): HTMLElement {
		return createDiv({ cls: "lite-tabs-group-separator" });
	}

	private getCardColumnCount(): number {
		return getComputedStyle(this.listEl)
			.gridTemplateColumns.split(" ")
			.filter(Boolean).length;
	}

	private restoreScrollTop(scrollTop: number): void {
		if (this.listEl.scrollTop === scrollTop) return;
		this.listEl.scrollTop = scrollTop;
	}

	private setDropTarget(
		id: string,
		el: HTMLElement,
		event: DragEvent
	): void {
		const rect = el.getBoundingClientRect();
		const rawPosition = this.isGridLikeLayout()
			? event.clientX > rect.left + rect.width / 2
				? "after"
				: "before"
			: event.clientY > rect.top + rect.height / 2
				? "after"
				: "before";
		const target = this.normalizeDropTarget(id, rawPosition);
		const targetRow = this.rows.get(target.id);
		if (!targetRow) return;
		const targetKey = `${target.id}:${target.position}`;
		if (this.indicatorTargetKey === targetKey) {
			this.dragOverId = target.id;
			this.dropPosition = target.position;
			return;
		}
		this.clearGroupDropTarget();
		this.dragOverId = target.id;
		this.dropPosition = target.position;
		this.showDropIndicator(targetRow.el, target.position, targetKey);
	}

	private normalizeDropTarget(
		id: string,
		position: "before" | "after"
	): { id: string; position: "before" | "after" } {
		if (position !== "after") {
			return { id, position };
		}
		const index = this.orderedIndexById.get(id) ?? -1;
		const current = this.rows.get(id);
		const nextId = index >= 0 ? this.orderedIds[index + 1] : null;
		const next = nextId ? this.rows.get(nextId) : null;
		if (current && next && current.item.parentId === next.item.parentId) {
			return { id: next.item.id, position: "before" };
		}
		return { id, position };
	}

	private setGroupDropTarget(id: string): void {
		this.clearGroupDropTarget();
		const targetRow = this.rows.get(id);
		if (targetRow) {
			this.showDropIndicator(targetRow.el, "after", `group:${id}`);
		} else {
			this.hideDropIndicator();
		}
		this.dragOverId = id;
		this.dropPosition = "after";
	}

	private clearGroupDropTarget(): void {
		this.dragOverZoneEl?.toggleClass("is-drag-over", false);
		this.dragOverZoneEl = null;
	}

	private showDropIndicator(
		el: HTMLElement,
		position: "before" | "after",
		targetKey: string
	): void {
		this.indicatorTargetKey = targetKey;
		const rect = this.getCachedElementRect(el);
		const listRect = this.getDragGeometry().listRect;
		const isGridLikeLayout = this.isGridLikeLayout();
		const x = isGridLikeLayout
			? position === "before"
				? rect.left - listRect.left + this.listEl.scrollLeft
				: rect.right - listRect.left + this.listEl.scrollLeft
			: 6 + this.listEl.scrollLeft;
		const y = isGridLikeLayout
			? rect.top - listRect.top + this.listEl.scrollTop
			: (position === "before" ? rect.top : rect.bottom) -
				listRect.top +
				this.listEl.scrollTop;
		const width = isGridLikeLayout ? 2 : Math.max(0, listRect.width - 12);
		const height = isGridLikeLayout ? rect.height : 2;
		const key = `${Math.round(x)}:${Math.round(y)}:${Math.round(width)}:${Math.round(height)}`;
		if (this.indicatorKey === key) return;
		this.indicatorKey = key;
		this.dropIndicatorEl.style.width = `${width}px`;
		this.dropIndicatorEl.style.height = `${height}px`;
		this.dropIndicatorEl.style.transform = `translate3d(${x}px, ${y}px, 0)`;
		this.dropIndicatorEl.toggleClass("is-visible", true);
	}

	private hideDropIndicator(): void {
		if (!this.indicatorKey && !this.indicatorTargetKey) return;
		this.indicatorKey = null;
		this.indicatorTargetKey = null;
		this.dropIndicatorEl.toggleClass("is-visible", false);
	}

	private handleListDragOver(event: DragEvent): void {
		if (this.isFilterActive()) return;
		const rowEl = this.getEventRow(event);
		const rowId = rowEl?.dataset.leafId;
		if (rowEl && rowId && this.draggedId && this.draggedId !== rowId) {
			event.preventDefault();
			this.setDropTarget(rowId, rowEl, event);
			return;
		}
		const groupEndId = this.getGroupEndTargetAtPoint(event);
		if (groupEndId && groupEndId !== this.draggedId) {
			event.preventDefault();
			this.setGroupDropTarget(groupEndId);
			return;
		}
		if (!this.canDropAtListEnd(event)) return;
		event.preventDefault();
		this.setGroupDropTarget(this.lastGroupEndId as string);
	}

	private handleListDrop(event: DragEvent): void {
		if (this.isFilterActive()) return;
		const rowEl = this.getEventRow(event);
		const rowId = rowEl?.dataset.leafId;
		if (rowEl && rowId && this.draggedId && this.draggedId !== rowId) {
			event.preventDefault();
			this.dropOnRow(rowId, rowEl, event);
			return;
		}
		const groupEndId = this.getGroupEndTargetAtPoint(event);
		if (groupEndId && groupEndId !== this.draggedId) {
			event.preventDefault();
			this.dropAfterGroupEnd(groupEndId, event);
			return;
		}
		if (!this.canDropAtListEnd(event)) return;
		event.preventDefault();
		this.dropAfterGroupEnd(this.lastGroupEndId as string, event);
	}

	private dropAfterGroupEnd(targetId: string, event: DragEvent): void {
		const sourceId =
			event.dataTransfer?.getData("text/plain") || this.draggedId;
		this.clearAllDragState();
		if (
			sourceId &&
			moveLeafRelative(this.plugin.app, sourceId, targetId, "after")
		) {
			this.scheduleRefresh();
		}
	}

	private dropOnRow(id: string, el: HTMLElement, event: DragEvent): void {
		this.setDropTarget(id, el, event);
		const sourceId =
			event.dataTransfer?.getData("text/plain") || this.draggedId;
		const position = this.dropPosition;
		const targetId = this.dragOverId ?? id;
		this.clearAllDragState();
		if (
			sourceId &&
			moveLeafRelative(this.plugin.app, sourceId, targetId, position)
		) {
			this.scheduleRefresh();
		}
	}

	private getEventRow(event: DragEvent): HTMLElement | null {
		const target = event.target;
		if (target instanceof HTMLElement) {
			const row = target.closest(".lite-tabs-item");
			if (row instanceof HTMLElement) return row;
		}
		return this.getRowAtPoint(event.clientX, event.clientY);
	}

	private getRowAtPoint(x: number, y: number): HTMLElement | null {
		for (const { el, rect } of this.getDragGeometry().rows) {
			if (
				x >= rect.left &&
				x <= rect.right &&
				y >= rect.top &&
				y <= rect.bottom
			) {
				return el;
			}
		}
		return null;
	}

	private canDropAtListEnd(event: DragEvent): boolean {
		if (!this.draggedId || !this.lastGroupEndId) return false;
		if (this.isInsideDropTarget(event.target)) return false;
		const geometry = this.getDragGeometry();
		const lastRow = geometry.rows.find(
			(row) => row.id === this.lastGroupEndId
		);
		if (!lastRow) return false;
		const listRect = geometry.listRect;
		if (
			event.clientX < listRect.left ||
			event.clientX > listRect.right ||
			event.clientY < listRect.top ||
			event.clientY > listRect.bottom
		) {
			return false;
		}

		const lastRect = lastRow.rect;
		if (event.clientY >= lastRect.bottom) return true;
		return (
			this.isGridLikeLayout() &&
			event.clientY >= lastRect.top &&
			event.clientY < lastRect.bottom &&
			event.clientX > lastRect.right
		);
	}

	private getGroupEndTargetAtPoint(event: DragEvent): string | null {
		if (!this.draggedId) return null;
		if (this.isInsideDropTarget(event.target)) return null;

		const geometry = this.getDragGeometry();
		const listRect = geometry.listRect;
		if (
			event.clientX < listRect.left ||
			event.clientX > listRect.right ||
			event.clientY < listRect.top ||
			event.clientY > listRect.bottom
		) {
			return null;
		}

		const isGridLikeLayout = this.isGridLikeLayout();
		for (const { endId, rowRect, separatorRect } of geometry.separators) {
			if (
				event.clientX >= separatorRect.left &&
				event.clientX <= separatorRect.right &&
				event.clientY >= separatorRect.top &&
				event.clientY <= separatorRect.bottom
			) {
				return null;
			}

			const inBottomBlank =
				event.clientY >= rowRect.bottom &&
				event.clientY < separatorRect.top;
			if (inBottomBlank) return endId;

			const inGridTrailingBlank =
				isGridLikeLayout &&
				event.clientY >= rowRect.top &&
				event.clientY < separatorRect.top &&
				event.clientX > rowRect.right;
			if (inGridTrailingBlank) return endId;
		}
		return null;
	}

	private isInsideDropTarget(target: EventTarget | null): boolean {
		if (!(target instanceof HTMLElement)) return false;
		return !!target.closest(".lite-tabs-item, .lite-tabs-group-separator");
	}

	private clearAllDragState(): void {
		this.dragSourceEl?.toggleClass("is-drag-source", false);
		this.dragSourceEl = null;
		this.invalidateDragGeometry();
		this.clearGroupDropTarget();
		this.hideDropIndicator();
		this.draggedId = null;
		this.dragOverId = null;
		this.dropPosition = "before";
		this.rootEl.toggleClass("is-dragging", false);
	}

	private getDragGeometry(): DragGeometry {
		if (this.dragGeometry) return this.dragGeometry;
		const rows: RowGeometry[] = [];
		for (const id of this.orderedIds) {
			const row = this.rows.get(id);
			if (!row) continue;
			rows.push({
				id,
				el: row.el,
				rect: this.readRect(row.el),
			});
		}
		this.dragGeometry = {
			listRect: this.readRect(this.listEl),
			rows,
			separators: this.groupSeparators
				.map(({ endId, el }) => {
					const row = rows.find((candidate) => candidate.id === endId);
					if (!row) return null;
					return {
						endId,
						rowRect: row.rect,
						separatorRect: this.readRect(el),
					};
				})
				.filter(
					(
						separator
					): separator is SeparatorGeometry => separator !== null
				),
		};
		return this.dragGeometry;
	}

	private getCachedElementRect(el: HTMLElement): RectSnapshot {
		const row = this.getDragGeometry().rows.find((entry) => entry.el === el);
		return row?.rect ?? this.readRect(el);
	}

	private readRect(el: HTMLElement): RectSnapshot {
		const rect = el.getBoundingClientRect();
		return {
			left: rect.left,
			right: rect.right,
			top: rect.top,
			bottom: rect.bottom,
			width: rect.width,
			height: rect.height,
		};
	}

	private invalidateDragGeometry(): void {
		this.dragGeometry = null;
	}

	private scheduleMasonryLayout(): void {
		if (this.masonryFrame !== null) return;
		this.masonryFrame = requestAnimationFrame(() => {
			this.masonryFrame = null;
			this.applyMasonryLayout();
		});
	}

	private applyMasonryLayout(): void {
		if (!this.isMasonryLayout()) {
			this.clearMasonrySpans();
			return;
		}

		const styles = getComputedStyle(this.listEl);
		const rowHeight = parseFloat(styles.gridAutoRows);
		const rowGap = parseFloat(styles.rowGap);
		if (!Number.isFinite(rowHeight) || rowHeight <= 0) return;
		const gap = Number.isFinite(rowGap) ? rowGap : 0;

		for (const row of this.rows.values()) {
			if (!row.el.isShown()) continue;
			row.el.style.removeProperty("--lite-tabs-masonry-span");
			const height = Math.max(row.el.scrollHeight, row.el.offsetHeight);
			const span = Math.max(
				1,
				Math.ceil((height + gap) / (rowHeight + gap))
			);
			row.el.style.setProperty(
				"--lite-tabs-masonry-span",
				String(span)
			);
		}
		this.invalidateDragGeometry();
	}

	private clearMasonrySpans(): void {
		for (const row of this.rows.values()) {
			row.el.style.removeProperty("--lite-tabs-masonry-span");
		}
		this.invalidateDragGeometry();
	}

	private isMasonryLayout(): boolean {
		return this.plugin.settings.layoutStyle === "masonry";
	}

	private isGridLikeLayout(): boolean {
		return (
			this.plugin.settings.layoutStyle === "card" ||
			this.plugin.settings.layoutStyle === "masonry"
		);
	}

	private updateRow(row: RowRecord, item: TabItem): void {
		row.item = item;
		if (row.renderedTitle !== item.title) {
			row.titleEl.setText(item.title);
			row.el.title = item.title;
			row.renderedTitle = item.title;
		}
		if (row.renderedParentId !== item.parentId) {
			row.el.dataset.parentId = item.parentId;
			row.renderedParentId = item.parentId;
		}
		if (row.active !== item.active) {
			row.el.toggleClass("is-active", item.active);
			row.active = item.active;
		}
		if (row.renderedIcon !== item.icon) {
			renderIcon(row.iconEl, item.icon);
			row.renderedIcon = item.icon;
		}
	}

	private applyFilter(): void {
		const hasFilter = this.isFilterActive();
		let visibleCount = 0;
		for (const row of this.rows.values()) {
			const visible =
				!hasFilter ||
				row.item.title.toLocaleLowerCase().includes(this.filterQuery);
			row.el.toggle(visible);
			row.el.draggable = !hasFilter;
			if (visible) visibleCount += 1;
		}
		for (const { el } of this.groupSeparators) {
			el.toggle(!hasFilter);
		}
		this.emptyEl.setText(
			this.rows.size === 0
				? "No open tabs"
				: hasFilter
					? "No matching tabs"
					: "No open tabs"
		);
		this.emptyEl.toggle(visibleCount === 0);
		this.invalidateDragGeometry();
	}

	private isFilterActive(): boolean {
		return this.filterQuery.length > 0;
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
