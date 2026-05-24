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
	handleEl: HTMLElement;
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

interface MasonryDropSlot {
	id: string;
	position: "before" | "after";
	left: number;
	top: number;
	width: number;
	height: number;
	key: string;
}

interface PointerDragState {
	id: string;
	handleEl: HTMLElement;
	sourceEl: HTMLElement;
	pointerId: number;
	lastX: number;
	lastY: number;
	previousSourceTouchAction: string;
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
	private masonryIndicatorRect: RectSnapshot | null = null;
	private pendingMovedId: string | null = null;
	private dropResultEl: HTMLElement | null = null;
	private resizeObserver: ResizeObserver | null = null;
	private pointerDragState: PointerDragState | null = null;
	private autoScrollFrame: number | null = null;
	private autoScrollVelocity = 0;
	private overflowFrame: number | null = null;

	constructor(plugin: LiteTabsPlugin, containerEl: HTMLElement) {
		this.plugin = plugin;
		containerEl.empty();
		this.rootEl = containerEl.createDiv({ cls: "lite-tabs-root" });
		this.rootEl.addEventListener(
			"touchmove",
			(event) => {
				if (!this.pointerDragState) return;
				this.stopMobileHandleTouch(event);
			},
			{ passive: false, capture: true }
		);
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
			this.scheduleListOverflowCheck();
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
		if (this.overflowFrame !== null) {
			cancelAnimationFrame(this.overflowFrame);
			this.overflowFrame = null;
		}
		this.stopAutoScroll();
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
		this.scheduleListOverflowCheck();
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

		const handleEl = el.createDiv({ cls: "lite-tabs-drag-handle" });
		const iconEl = el.createDiv({ cls: "lite-tabs-icon" });
		const titleEl = el.createDiv({ cls: "lite-tabs-title" });
		const closeEl = el.createDiv({ cls: "lite-tabs-close" });
		handleEl.draggable = false;
		iconEl.draggable = true;
		titleEl.draggable = true;
		closeEl.draggable = false;
		handleEl.setAttr("aria-label", "Drag tab");
		handleEl.setAttr("title", "Drag tab");
		setIcon(handleEl, "grip-vertical");
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
		handleEl.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
		});
		handleEl.addEventListener("contextmenu", (event) => {
			event.preventDefault();
			event.stopPropagation();
		});
		handleEl.addEventListener(
			"touchstart",
			(event) => {
				this.stopMobileHandleTouch(event);
			},
			{ passive: false, capture: true }
		);
		handleEl.addEventListener(
			"touchmove",
			(event) => {
				this.stopMobileHandleTouch(event);
			},
			{ passive: false, capture: true }
		);
		handleEl.addEventListener("pointerdown", (event) => {
			this.startPointerDrag(item.id, el, handleEl, event);
		});
		handleEl.addEventListener("pointermove", (event) => {
			this.updatePointerDrag(event);
		});
		handleEl.addEventListener("pointerup", (event) => {
			this.finishPointerDrag(event);
		});
		handleEl.addEventListener("pointercancel", (event) => {
			this.cancelPointerDrag(event);
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
			handleEl,
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

	private startPointerDrag(
		id: string,
		el: HTMLElement,
		handleEl: HTMLElement,
		event: PointerEvent
	): void {
		if (!document.body.hasClass("is-mobile")) return;
		if (event.button !== 0 || this.isFilterActive()) return;
		event.preventDefault();
		event.stopPropagation();
		handleEl.setPointerCapture(event.pointerId);
		this.clearAllDragState();
		this.pointerDragState = {
			id,
			handleEl,
			sourceEl: el,
			pointerId: event.pointerId,
			lastX: event.clientX,
			lastY: event.clientY,
			previousSourceTouchAction: el.style.touchAction,
		};
		el.style.touchAction = "none";
		this.draggedId = id;
		this.dragSourceEl = el;
		this.invalidateDragGeometry();
		this.rootEl.toggleClass("is-dragging", true);
		el.toggleClass("is-drag-source", true);
		this.updatePointerDropTarget(event.clientX, event.clientY);
	}

	private updatePointerDrag(event: PointerEvent): void {
		const state = this.pointerDragState;
		if (!state || event.pointerId !== state.pointerId) return;
		event.preventDefault();
		event.stopPropagation();
		state.lastX = event.clientX;
		state.lastY = event.clientY;
		this.updatePointerAutoScroll(event.clientY);
		this.updatePointerDropTarget(event.clientX, event.clientY);
	}

	private finishPointerDrag(event: PointerEvent): void {
		const state = this.pointerDragState;
		if (!state || event.pointerId !== state.pointerId) return;
		event.preventDefault();
		event.stopPropagation();
		if (state.handleEl.hasPointerCapture(event.pointerId)) {
			state.handleEl.releasePointerCapture(event.pointerId);
		}
		this.restorePointerDragTouchAction(state);
		const sourceId = this.draggedId ?? state.id;
		const targetId = this.dragOverId;
		const position = this.dropPosition;
		const shouldMove =
			!!targetId && !this.isNoopMove(sourceId, targetId, position);
		this.pointerDragState = null;
		this.clearAllDragState();
		if (
			shouldMove &&
			targetId &&
			moveLeafRelative(this.plugin.app, sourceId, targetId, position)
		) {
			this.pendingMovedId = sourceId;
			this.scheduleRefresh();
		}
	}

	private cancelPointerDrag(event: PointerEvent): void {
		const state = this.pointerDragState;
		if (!state || event.pointerId !== state.pointerId) return;
		event.preventDefault();
		event.stopPropagation();
		if (state.handleEl.hasPointerCapture(event.pointerId)) {
			state.handleEl.releasePointerCapture(event.pointerId);
		}
		this.restorePointerDragTouchAction(state);
		this.pointerDragState = null;
		this.clearAllDragState();
	}

	private restorePointerDragTouchAction(state: PointerDragState): void {
		state.sourceEl.style.touchAction = state.previousSourceTouchAction;
	}

	private stopMobileHandleTouch(event: TouchEvent): void {
		if (!document.body.hasClass("is-mobile")) return;
		event.preventDefault();
		event.stopPropagation();
		event.stopImmediatePropagation();
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
		this.setDropTargetAtPoint(id, el, event.clientX, event.clientY);
	}

	private setDropTargetAtPoint(
		id: string,
		el: HTMLElement,
		x: number,
		y: number
	): void {
		const rect = el.getBoundingClientRect();
		const rawPosition = this.isGridLikeLayout()
			? x > rect.left + rect.width / 2
				? "after"
				: "before"
			: y > rect.top + rect.height / 2
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

	private updatePointerDropTarget(x: number, y: number): void {
		if (this.isFilterActive()) return;
		if (this.isMasonryLayout()) {
			if (this.isInsideDraggedRow(x, y)) {
				this.clearDropTarget();
				return;
			}
			const slot = this.getMasonryDropSlotAtPoint(x, y);
			if (!slot) {
				this.clearDropTarget();
				return;
			}
			this.setMasonryDropTarget(slot);
			return;
		}

		const rowEl = this.getRowAtPoint(x, y);
		const rowId = rowEl?.dataset.leafId;
		if (rowEl && rowId && this.draggedId && this.draggedId !== rowId) {
			this.setDropTargetAtPoint(rowId, rowEl, x, y);
			return;
		}

		const groupEndId = this.getGroupEndTargetAtCoordinates(x, y, null);
		if (groupEndId && groupEndId !== this.draggedId) {
			this.setGroupDropTarget(groupEndId);
			return;
		}

		if (this.canDropAtListEndCoordinates(x, y, null)) {
			this.setGroupDropTarget(this.lastGroupEndId as string);
			return;
		}
		this.clearDropTarget();
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
		const isMasonryLayout = this.isMasonryLayout();
		const masonryRect = this.masonryIndicatorRect;
		const x =
			isMasonryLayout && masonryRect
				? masonryRect.left - listRect.left + this.listEl.scrollLeft
			: isGridLikeLayout
			? position === "before"
				? rect.left - listRect.left + this.listEl.scrollLeft
				: rect.right - listRect.left + this.listEl.scrollLeft
			: 6 + this.listEl.scrollLeft;
		const y =
			isMasonryLayout && masonryRect
				? masonryRect.top - listRect.top + this.listEl.scrollTop
			: isGridLikeLayout
			? rect.top - listRect.top + this.listEl.scrollTop
			: (position === "before" ? rect.top : rect.bottom) -
				listRect.top +
				this.listEl.scrollTop;
		const width =
			isMasonryLayout && masonryRect
				? masonryRect.width
			: isGridLikeLayout
			? 2
			: Math.max(0, listRect.width - 12);
		const height =
			isMasonryLayout && masonryRect
				? masonryRect.height
				: isGridLikeLayout
				? rect.height
				: 2;
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

	private clearDropTarget(): void {
		this.clearGroupDropTarget();
		this.hideDropIndicator();
		this.dragOverId = null;
		this.dropPosition = "before";
		this.masonryIndicatorRect = null;
	}

	private handleListDragOver(event: DragEvent): void {
		if (this.isFilterActive()) return;
		if (this.isMasonryLayout()) {
			if (this.isInsideDraggedRow(event.clientX, event.clientY)) {
				this.hideDropIndicator();
				return;
			}
			const slot = this.getMasonryDropSlotAtPoint(
				event.clientX,
				event.clientY
			);
			if (!slot) return;
			event.preventDefault();
			this.setMasonryDropTarget(slot);
			return;
		}
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
		if (this.isMasonryLayout()) {
			if (this.isInsideDraggedRow(event.clientX, event.clientY)) {
				this.clearAllDragState();
				return;
			}
			const slot = this.getMasonryDropSlotAtPoint(
				event.clientX,
				event.clientY
			);
			if (!slot) return;
			event.preventDefault();
			this.dropOnMasonrySlot(slot, event);
			return;
		}
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

	private setMasonryDropTarget(slot: MasonryDropSlot): void {
		if (this.indicatorTargetKey === slot.key) {
			this.dragOverId = slot.id;
			this.dropPosition = slot.position;
			return;
		}
		const targetRow = this.rows.get(slot.id);
		if (!targetRow) return;
		this.clearGroupDropTarget();
		this.dragOverId = slot.id;
		this.dropPosition = slot.position;
		this.masonryIndicatorRect = {
			left: slot.left,
			right: slot.left + slot.width,
			top: slot.top,
			bottom: slot.top + slot.height,
			width: slot.width,
			height: slot.height,
		};
		this.showDropIndicator(targetRow.el, slot.position, slot.key);
	}

	private dropOnMasonrySlot(slot: MasonryDropSlot, event: DragEvent): void {
		this.setMasonryDropTarget(slot);
		const sourceId =
			event.dataTransfer?.getData("text/plain") || this.draggedId;
		const targetId = this.dragOverId ?? slot.id;
		const position = this.dropPosition;
		const shouldMove =
			!!sourceId && !this.isNoopMove(sourceId, targetId, position);
		this.clearAllDragState();
		if (
			shouldMove &&
			sourceId &&
			moveLeafRelative(this.plugin.app, sourceId, targetId, position)
		) {
			this.pendingMovedId = sourceId;
			this.scheduleRefresh();
		}
	}

	private dropAfterGroupEnd(targetId: string, event: DragEvent): void {
		const sourceId =
			event.dataTransfer?.getData("text/plain") || this.draggedId;
		this.clearAllDragState();
		if (
			sourceId &&
			moveLeafRelative(this.plugin.app, sourceId, targetId, "after")
		) {
			this.pendingMovedId = sourceId;
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
			this.pendingMovedId = sourceId;
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

	private getMasonryDropSlotAtPoint(
		x: number,
		y: number
	): MasonryDropSlot | null {
		const geometry = this.getDragGeometry();
		if (
			x < geometry.listRect.left ||
			x > geometry.listRect.right ||
			y < geometry.listRect.top ||
			y > geometry.listRect.bottom
		) {
			return null;
		}

		const slots = this.getMasonryDropSlotsForPoint(x);
		if (slots.length === 0) {
			this.hideDropIndicator();
			return null;
		}
		let bestSlot: MasonryDropSlot | null = null;
		let bestDistance = Number.POSITIVE_INFINITY;
		for (const slot of slots) {
			const verticalDistance = Math.abs(y - slot.top);
			if (verticalDistance < bestDistance) {
				bestDistance = verticalDistance;
				bestSlot = slot;
			}
		}
		return bestSlot;
	}

	private isInsideDraggedRow(x: number, y: number): boolean {
		if (!this.draggedId) return false;
		const row = this.getDragGeometry().rows.find(
			(candidate) => candidate.id === this.draggedId
		);
		if (!row) return false;
		return (
			x >= row.rect.left &&
			x <= row.rect.right &&
			y >= row.rect.top &&
			y <= row.rect.bottom
		);
	}

	private getMasonryDropSlotsForPoint(x: number): MasonryDropSlot[] {
		const column = this.getMasonryColumnAtPoint(x);
		if (!column) return [];
		const slots = this.getMasonryDropSlotsForColumn(column);
		return slots.filter((slot) => !this.isNoopMasonryDropSlot(slot));
	}

	private getMasonryDropSlots(): MasonryDropSlot[] {
		const columns = this.getMasonryColumns();
		const slots: MasonryDropSlot[] = [];
		for (const column of columns) {
			slots.push(...this.getMasonryDropSlotsForColumn(column));
		}
		return slots;
	}

	private getMasonryDropSlotsForColumn(column: RowGeometry[]): MasonryDropSlot[] {
		if (column.length === 0) return [];
		const slots: MasonryDropSlot[] = [];
		const first = column[0];
		slots.push(this.createMasonryDropSlot(first, "before", first.rect.top));
		for (let index = 1; index < column.length; index += 1) {
			const previous = column[index - 1];
			const current = column[index];
			const top =
				previous.rect.bottom +
				(current.rect.top - previous.rect.bottom) / 2;
			slots.push(this.createMasonryDropSlot(current, "before", top));
		}
		const last = column[column.length - 1];
		slots.push(this.createMasonryDropSlot(last, "after", last.rect.bottom));
		return slots;
	}

	private getMasonryColumnAtPoint(x: number): RowGeometry[] | null {
		const columns = this.getMasonryColumns();
		const direct = columns.find((column) => {
			const first = column[0];
			return x >= first.rect.left && x <= first.rect.right;
		});
		if (direct) return direct;

		const listRect = this.getDragGeometry().listRect;
		if (x < listRect.left || x > listRect.right) return null;
		let nearest: RowGeometry[] | null = null;
		let bestDistance = Number.POSITIVE_INFINITY;
		for (const column of columns) {
			const first = column[0];
			const distance =
				x < first.rect.left ? first.rect.left - x : x - first.rect.right;
			if (distance >= 0 && distance < bestDistance) {
				bestDistance = distance;
				nearest = column;
			}
		}
		return nearest;
	}

	private isNoopMasonryDropSlot(slot: MasonryDropSlot): boolean {
		if (!this.draggedId) return false;
		if (this.isMasonrySlotInsideDraggedRow(slot)) return true;
		return this.isNoopMove(this.draggedId, slot.id, slot.position);
	}

	private isMasonrySlotInsideDraggedRow(slot: MasonryDropSlot): boolean {
		if (!this.draggedId) return false;
		const draggedRow = this.getDragGeometry().rows.find(
			(row) => row.id === this.draggedId
		);
		if (!draggedRow) return false;
		const tolerance = 2;
		const overlapsX =
			slot.left < draggedRow.rect.right - tolerance &&
			slot.left + slot.width > draggedRow.rect.left + tolerance;
		const insideY =
			slot.top >= draggedRow.rect.top - tolerance &&
			slot.top <= draggedRow.rect.bottom + tolerance;
		return overlapsX && insideY;
	}

	private getMasonryColumns(): RowGeometry[][] {
		const columns: RowGeometry[][] = [];
		for (const row of this.getDragGeometry().rows) {
			if (row.id === this.draggedId) continue;
			const centerX = row.rect.left + row.rect.width / 2;
			const existing = columns.find((column) => {
				const first = column[0];
				return centerX >= first.rect.left && centerX <= first.rect.right;
			});
			if (existing) {
				existing.push(row);
			} else {
				columns.push([row]);
			}
		}
		return columns
			.sort((left, right) => left[0].rect.left - right[0].rect.left)
			.map((column) =>
				column.sort((left, right) => left.rect.top - right.rect.top)
			);
	}

	private createMasonryDropSlot(
		row: RowGeometry,
		position: "before" | "after",
		top: number
	): MasonryDropSlot {
		const roundedLeft = Math.round(row.rect.left);
		const roundedTop = Math.round(top);
		return {
			id: row.id,
			position,
			left: row.rect.left,
			top,
			width: row.rect.width,
			height: 2,
			key: `masonry:${row.id}:${position}:${roundedLeft}:${roundedTop}`,
		};
	}

	private canDropAtListEnd(event: DragEvent): boolean {
		return this.canDropAtListEndCoordinates(
			event.clientX,
			event.clientY,
			event.target
		);
	}

	private canDropAtListEndCoordinates(
		x: number,
		y: number,
		target: EventTarget | null
	): boolean {
		if (!this.draggedId || !this.lastGroupEndId) return false;
		if (this.isInsideDropTarget(target)) return false;
		const geometry = this.getDragGeometry();
		const lastRow = geometry.rows.find(
			(row) => row.id === this.lastGroupEndId
		);
		if (!lastRow) return false;
		const listRect = geometry.listRect;
		if (
			x < listRect.left ||
			x > listRect.right ||
			y < listRect.top ||
			y > listRect.bottom
		) {
			return false;
		}

		const lastRect = lastRow.rect;
		if (y >= lastRect.bottom) return true;
		return (
			this.isGridLikeLayout() &&
			y >= lastRect.top &&
			y < lastRect.bottom &&
			x > lastRect.right
		);
	}

	private getGroupEndTargetAtPoint(event: DragEvent): string | null {
		return this.getGroupEndTargetAtCoordinates(
			event.clientX,
			event.clientY,
			event.target
		);
	}

	private getGroupEndTargetAtCoordinates(
		x: number,
		y: number,
		target: EventTarget | null
	): string | null {
		if (!this.draggedId) return null;
		if (this.isInsideDropTarget(target)) return null;

		const geometry = this.getDragGeometry();
		const listRect = geometry.listRect;
		if (
			x < listRect.left ||
			x > listRect.right ||
			y < listRect.top ||
			y > listRect.bottom
		) {
			return null;
		}

		const isGridLikeLayout = this.isGridLikeLayout();
		for (const { endId, rowRect, separatorRect } of geometry.separators) {
			if (
				x >= separatorRect.left &&
				x <= separatorRect.right &&
				y >= separatorRect.top &&
				y <= separatorRect.bottom
			) {
				return null;
			}

			const inBottomBlank =
				y >= rowRect.bottom && y < separatorRect.top;
			if (inBottomBlank) return endId;

			const inGridTrailingBlank =
				isGridLikeLayout &&
				y >= rowRect.top &&
				y < separatorRect.top &&
				x > rowRect.right;
			if (inGridTrailingBlank) return endId;
		}
		return null;
	}

	private isInsideDropTarget(target: EventTarget | null): boolean {
		if (!(target instanceof HTMLElement)) return false;
		return !!target.closest(".lite-tabs-item, .lite-tabs-group-separator");
	}

	private updatePointerAutoScroll(y: number): void {
		const rect = this.listEl.getBoundingClientRect();
		const edgeSize = Math.min(56, rect.height / 3);
		let velocity = 0;
		if (y < rect.top + edgeSize) {
			velocity = -this.getAutoScrollVelocity(rect.top + edgeSize - y);
		} else if (y > rect.bottom - edgeSize) {
			velocity = this.getAutoScrollVelocity(y - (rect.bottom - edgeSize));
		}
		this.autoScrollVelocity = velocity;
		if (velocity === 0) {
			this.stopAutoScroll();
			return;
		}
		if (this.autoScrollFrame !== null) return;
		this.autoScrollFrame = requestAnimationFrame(() => {
			this.stepAutoScroll();
		});
	}

	private getAutoScrollVelocity(distance: number): number {
		return Math.min(14, Math.max(3, distance / 4));
	}

	private stepAutoScroll(): void {
		this.autoScrollFrame = null;
		const state = this.pointerDragState;
		if (!state || this.autoScrollVelocity === 0) return;
		const previousScrollTop = this.listEl.scrollTop;
		this.listEl.scrollTop += this.autoScrollVelocity;
		if (this.listEl.scrollTop !== previousScrollTop) {
			this.invalidateDragGeometry();
			this.updatePointerDropTarget(state.lastX, state.lastY);
		}
		this.autoScrollFrame = requestAnimationFrame(() => {
			this.stepAutoScroll();
		});
	}

	private stopAutoScroll(): void {
		this.autoScrollVelocity = 0;
		if (this.autoScrollFrame !== null) {
			cancelAnimationFrame(this.autoScrollFrame);
			this.autoScrollFrame = null;
		}
	}

	private clearAllDragState(): void {
		this.pointerDragState = null;
		this.stopAutoScroll();
		this.dragSourceEl?.toggleClass("is-drag-source", false);
		this.dragSourceEl = null;
		this.invalidateDragGeometry();
		this.clearGroupDropTarget();
		this.hideDropIndicator();
		this.draggedId = null;
		this.dragOverId = null;
		this.masonryIndicatorRect = null;
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

	private scheduleListOverflowCheck(): void {
		if (this.overflowFrame !== null) return;
		this.overflowFrame = requestAnimationFrame(() => {
			this.overflowFrame = null;
			this.syncListOverflowState();
		});
	}

	private syncListOverflowState(): void {
		const tolerance = 1;
		const isOverflowing =
			this.listEl.scrollHeight > this.listEl.clientHeight + tolerance;
		this.listEl.toggleClass("is-overflowing", isOverflowing);
	}

	private applyMasonryLayout(): void {
		if (!this.isMasonryLayout()) {
			this.clearMasonrySpans();
			return;
		}

		const styles = getComputedStyle(this.listEl);
		const rowHeight = parseFloat(styles.gridAutoRows);
		const columnGap = parseFloat(styles.columnGap);
		if (!Number.isFinite(rowHeight) || rowHeight <= 0) return;
		const gap = Number.isFinite(columnGap) ? columnGap : 0;

		for (const row of this.rows.values()) {
			if (!row.el.isShown()) continue;
			row.el.style.removeProperty("--lite-tabs-masonry-span");
			const height = Math.max(row.el.scrollHeight, row.el.offsetHeight);
			const span = Math.max(1, Math.ceil((height + gap) / rowHeight));
			row.el.style.setProperty(
				"--lite-tabs-masonry-span",
				String(span)
			);
		}
		this.invalidateDragGeometry();
		this.applyPendingMoveFeedback();
		this.scheduleListOverflowCheck();
	}

	private clearMasonrySpans(): void {
		for (const row of this.rows.values()) {
			row.el.style.removeProperty("--lite-tabs-masonry-span");
		}
		this.invalidateDragGeometry();
		this.applyPendingMoveFeedback();
		this.scheduleListOverflowCheck();
	}

	private applyPendingMoveFeedback(): void {
		if (!this.pendingMovedId) return;
		const row = this.rows.get(this.pendingMovedId);
		if (!row) return;
		this.pendingMovedId = null;
		this.clearDropResult();
		row.el.removeClass("is-drop-result");
		void row.el.offsetWidth;
		row.el.addClass("is-drop-result");
		this.dropResultEl = row.el;
		row.el.addEventListener(
			"animationend",
			() => {
				row.el.removeClass("is-drop-result");
				if (this.dropResultEl === row.el) {
					this.dropResultEl = null;
				}
			},
			{ once: true }
		);
	}

	private clearDropResult(): void {
		this.dropResultEl?.removeClass("is-drop-result");
		this.dropResultEl = null;
	}

	private isNoopMove(
		sourceId: string,
		targetId: string,
		position: "before" | "after"
	): boolean {
		if (sourceId === targetId) return true;
		const sourceIndex = this.orderedIndexById.get(sourceId);
		const targetIndex = this.orderedIndexById.get(targetId);
		if (sourceIndex === undefined || targetIndex === undefined) {
			return false;
		}
		let insertIndex = position === "after" ? targetIndex + 1 : targetIndex;
		if (sourceIndex < insertIndex) {
			insertIndex -= 1;
		}
		return sourceIndex === insertIndex;
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
		const allowNativeDrag =
			!hasFilter && !document.body.hasClass("is-mobile");
		let visibleCount = 0;
		for (const row of this.rows.values()) {
			const visible =
				!hasFilter ||
				row.item.title.toLocaleLowerCase().includes(this.filterQuery);
			row.el.toggle(visible);
			row.el.draggable = allowNativeDrag;
			row.iconEl.draggable = allowNativeDrag;
			row.titleEl.draggable = allowNativeDrag;
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
		this.scheduleListOverflowCheck();
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
