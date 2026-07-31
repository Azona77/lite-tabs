import { Menu, WorkspaceLeaf, setIcon } from "obsidian";
import LiteTabsPlugin from "./main";
import { LiteTabsDisplayOrder, LiteTabsLayoutStyle } from "./settings";
import {
	TabItem,
	closeOtherLeavesInGroup,
	collectTabs,
	getActiveTabId,
	getLeafId,
	moveLeafRelative,
	renderIcon,
} from "./tabs";
import {
	createStructureSignature,
	getAdjacentVisibleId,
	getAutoScrollVelocity,
	getCommittedDropMove,
	getRelativeDropPosition,
	isNoopRelativeMove,
	matchesTabTitle,
	normalizeAdjacentDropTarget,
	orderTabsByDisplayOrder,
	type RelativePosition,
} from "./tab-logic";

let controllerInstanceId = 0;

interface RowRecord {
	item: TabItem;
	el: HTMLElement;
	handleEl: HTMLElement;
	iconEl: HTMLElement;
	titleEl: HTMLElement;
	closeEl: HTMLElement;
	renderedTitle: string;
	renderedTitleQuery: string | null;
	renderedIcon: string;
	renderedPath: string | null;
	renderedParentId: string;
	renderedPinned: boolean;
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
	separatorOuterRect: RectSnapshot;
}

interface DragGeometry {
	listRect: RectSnapshot;
	rows: RowGeometry[];
	separators: SeparatorGeometry[];
}

interface MasonryDropSlot {
	id: string;
	position: RelativePosition;
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
}

export class TabController {
	private plugin: LiteTabsPlugin;
	private rootEl: HTMLElement;
	private toolbarEl: HTMLElement;
	private searchControlEl: HTMLElement;
	private searchButtonEl: HTMLButtonElement;
	private searchInputEl: HTMLInputElement;
	private moreButtonEl: HTMLButtonElement;
	private listEl: HTMLElement;
	private bottomSpacerEl: HTMLElement;
	private dropIndicatorEl: HTMLElement;
	private emptyEl: HTMLElement;
	private rows = new Map<string, RowRecord>();
	private orderedIds: string[] = [];
	private orderedIndexById = new Map<string, number>();
	private structureSignature: string | null = null;
	private frame: number | null = null;
	private activeId: string | null = null;
	private searchTargetId: string | null = null;
	private draggedId: string | null = null;
	private dragSourceEl: HTMLElement | null = null;
	private dragOverId: string | null = null;
	private dragOverZoneEl: HTMLElement | null = null;
	private lastGroupEndId: string | null = null;
	private groupSeparators: { endId: string; el: HTMLElement }[] = [];
	private dropPosition: RelativePosition = "before";
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
	private renderedLayoutStyle: LiteTabsLayoutStyle | null = null;
	private bottomSpacerHeight = 0;
	private readonly instanceId = ++controllerInstanceId;

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
		this.searchControlEl = this.toolbarEl.createDiv({
			cls: "lite-tabs-search-control",
		});
		this.searchButtonEl = this.createSearchButton();
		this.searchInputEl = this.createSearchInput();
		this.searchInputEl.id = `lite-tabs-search-${this.instanceId}`;
		this.moreButtonEl = this.createMoreButton();
		this.listEl = this.rootEl.createDiv({ cls: "lite-tabs-list" });
		this.listEl.id = `lite-tabs-list-${this.instanceId}`;
		this.listEl.setAttr("role", "list");
		this.listEl.setAttr("aria-label", "Open tabs");
		this.searchButtonEl.setAttr("aria-controls", this.searchInputEl.id);
		this.searchInputEl.setAttr("aria-controls", this.listEl.id);
		this.listEl.addEventListener("dragover", (event) => {
			this.handleListDragOver(event);
		});
		this.listEl.addEventListener("drop", (event) => {
			this.handleListDrop(event);
		});
		this.listEl.addEventListener("scroll", () => {
			this.invalidateDragGeometry();
		});
		this.bottomSpacerEl = this.listEl.createDiv({
			cls: "lite-tabs-bottom-spacer",
		});
		this.emptyEl = this.listEl.createDiv({
			cls: "lite-tabs-empty",
			text: "No open tabs",
		});
		this.emptyEl.setAttr("role", "status");
		this.dropIndicatorEl = this.listEl.createDiv({
			cls: "lite-tabs-drop-indicator",
		});
		this.resizeObserver = new ResizeObserver(() => {
			this.invalidateDragGeometry();
			this.scheduleMasonryLayout();
			this.scheduleListOverflowCheck();
		});
		this.resizeObserver.observe(this.listEl);
		this.syncMoreButton();
	}

	dispose(): void {
		if (this.frame !== null) {
			this.cancelFrame(this.frame);
			this.frame = null;
		}
		if (this.masonryFrame !== null) {
			this.cancelFrame(this.masonryFrame);
			this.masonryFrame = null;
		}
		if (this.overflowFrame !== null) {
			this.cancelFrame(this.overflowFrame);
			this.overflowFrame = null;
		}
		this.stopAutoScroll();
		this.resizeObserver?.disconnect();
		this.resizeObserver = null;
		this.rows.clear();
		this.resetBottomSpacer();
		this.rootEl.remove();
	}

	private requestFrame(callback: FrameRequestCallback): number {
		return this.rootEl.win.requestAnimationFrame(callback);
	}

	private cancelFrame(handle: number): void {
		this.rootEl.win.cancelAnimationFrame(handle);
	}

	private isMobile(): boolean {
		return this.rootEl.doc.body.hasClass("is-mobile");
	}

	private isHTMLElement(value: EventTarget | Node | null): value is HTMLElement {
		return (
			!!value &&
			"instanceOf" in value &&
			typeof value.instanceOf === "function" &&
			value.instanceOf(HTMLElement)
		);
	}

	scheduleRefresh(): void {
		if (this.frame !== null) return;
		this.frame = this.requestFrame(() => {
			this.frame = null;
			this.refreshStructure();
		});
	}

	forceRefresh(): void {
		if (this.frame !== null) {
			this.cancelFrame(this.frame);
			this.frame = null;
		}
		this.structureSignature = null;
		this.refreshStructure(true);
	}

	focusSearch(): void {
		this.rootEl.addClass("is-search-revealed");
		this.searchInputEl.focus();
		this.searchInputEl.select();
		this.syncSearchTarget();
	}

	refreshStructure(force = false): void {
		this.invalidateDragGeometry();
		const items = orderTabsByDisplayOrder(
			collectTabs(this.plugin.app),
			this.plugin.settings.displayOrder,
			this.plugin.settings.displayOrderReversed
		);
		const nextSignature = this.getStructureSignature(items);
		if (!force && nextSignature === this.structureSignature) {
			this.syncActive();
			return;
		}
		const layoutChanged =
			this.renderedLayoutStyle !== null &&
			this.renderedLayoutStyle !== this.plugin.settings.layoutStyle;
		const previousScrollTop = layoutChanged ? 0 : this.listEl.scrollTop;
		if (layoutChanged) {
			this.resetBottomSpacer();
		}
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
		this.syncMoreButton();
		this.applyFilter();
		this.syncSearchTarget();
		this.flushMasonryLayout();
		this.restoreScrollTop(previousScrollTop);
		this.scheduleListOverflowCheck();
		this.renderedLayoutStyle = this.plugin.settings.layoutStyle;
	}

	syncActive(items?: TabItem[]): void {
		const active = items
			? items.find((item) => item.active)?.id ?? null
			: getActiveTabId(this.plugin.app);
		if (active === this.activeId) return;

		if (this.activeId) {
			const row = this.rows.get(this.activeId);
			row?.el.toggleClass("is-active", false);
			if (row) {
				row.el.removeAttribute("aria-current");
				row.active = false;
			}
		}
		if (active) {
			const row = this.rows.get(active);
			row?.el.toggleClass("is-active", true);
			if (row) {
				row.el.setAttr("aria-current", "true");
				row.active = true;
			}
		}
		this.activeId = active;
	}

	private getStructureSignature(items: TabItem[]): string {
		return createStructureSignature(this.getLayoutSignature(), items);
	}

	private getLayoutSignature(): string {
		const orderSignature = this.plugin.settings.displayOrder;
		const directionSignature = this.plugin.settings.displayOrderReversed
			? "reversed"
			: "normal";
		if (!this.isGridLikeLayout()) {
			return `list:${orderSignature}:${directionSignature}`;
		}
		return `${this.plugin.settings.layoutStyle}:${this.getCardColumnCount()}:${orderSignature}:${directionSignature}`;
	}

	private getRowDomId(id: string): string {
		const safeId = encodeURIComponent(id);
		return `lite-tabs-${this.instanceId}-${safeId}`;
	}

	private createRow(item: TabItem): RowRecord {
		const el = createDiv({ cls: "lite-tabs-item" });
		el.id = this.getRowDomId(item.id);
		el.dataset.leafId = item.id;
		el.setAttr("role", "listitem");
		el.setAttr("tabindex", "0");
		el.setAttr("aria-label", item.title);
		el.setAttr(
			"aria-keyshortcuts",
			"Enter Space ArrowUp ArrowDown Home End Escape"
		);
		el.draggable = true;

		const handleEl = el.createDiv({ cls: "lite-tabs-drag-handle" });
		const iconEl = el.createDiv({ cls: "lite-tabs-icon" });
		const titleEl = el.createDiv({ cls: "lite-tabs-title" });
		const closeEl = el.createEl("button", {
			cls: "lite-tabs-close",
			attr: { type: "button" },
		});
		handleEl.draggable = false;
		iconEl.draggable = true;
		titleEl.draggable = true;
		closeEl.draggable = false;
		handleEl.setAttr("aria-hidden", "true");
		handleEl.setAttr("title", "Drag tab");
		setIcon(handleEl, "grip-vertical");
		renderIcon(closeEl, "x");
		closeEl.setAttr("aria-label", "Close tab");
		closeEl.setAttr("title", "Close tab");

		el.addEventListener("mousedown", (event) => {
			if (event.button !== 1) return;
			event.preventDefault();
			event.stopPropagation();
			this.closeLeaf(item.leaf);
		});
		el.addEventListener("pointerdown", (event) => {
			if (event.button !== 0) return;
			if (!this.canReorderTabs()) return;
			this.draggedId = item.id;
			this.dragSourceEl = el;
		});
		el.addEventListener("click", (event) => {
			if ((event.target as HTMLElement).closest(".lite-tabs-close")) {
				this.handleRowAction(item.id);
				return;
			}
			this.activateLeaf(item.leaf);
		});
		el.addEventListener("keydown", (event) => {
			if (event.target !== el) return;
			this.handleRowKeydown(item.id, event);
		});
		el.addEventListener("auxclick", (event) => {
			if (event.button === 1) {
				event.preventDefault();
			}
		});
		closeEl.addEventListener("click", (event) => {
			event.stopPropagation();
			this.handleRowAction(item.id);
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
			renderedTitleQuery: null,
			renderedIcon: "",
			renderedPath: null,
			renderedParentId: "",
			renderedPinned: false,
			active: false,
		};
		this.updateRow(row, item);
		return row;
	}

	private handleRowKeydown(id: string, event: KeyboardEvent): void {
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			const row = this.rows.get(id);
			if (row) this.activateLeaf(row.item.leaf);
			return;
		}
		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault();
			this.focusAdjacentVisibleTab(
				id,
				event.key === "ArrowDown" ? 1 : -1
			);
			return;
		}
		if (event.key === "Home" || event.key === "End") {
			event.preventDefault();
			this.focusAdjacentVisibleTab(
				null,
				event.key === "Home" ? 1 : -1
			);
			return;
		}
		if (event.key === "Escape") {
			event.preventDefault();
			this.focusSearch();
		}
	}

	private focusAdjacentVisibleTab(
		currentId: string | null,
		direction: -1 | 1
	): boolean {
		const id = getAdjacentVisibleId(
			this.orderedIds,
			currentId,
			direction,
			(candidateId) => this.rows.get(candidateId)?.el.isShown() ?? false
		);
		if (!id) return false;
		this.rows.get(id)?.el.focus();
		return true;
	}

	private startDrag(id: string, el: HTMLElement, event: DragEvent): void {
		if (!this.canReorderTabs()) {
			event.preventDefault();
			return;
		}
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
		if (!this.isMobile()) return;
		if (!this.plugin.settings.showMobileDragHandles) return;
		if (
			event.button !== 0 ||
			this.isFilterActive() ||
			!this.canReorderTabs()
		) {
			return;
		}
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
		};
		this.draggedId = id;
		this.dragSourceEl = el;
		this.invalidateDragGeometry();
		this.rootEl.toggleClass("is-dragging", true);
		el.toggleClass("is-drag-source", true);
		el.toggleClass("is-touch-drag-source", true);
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
		const sourceId = this.draggedId ?? state.id;
		const targetId = this.dragOverId;
		const position = this.dropPosition;
		const move = this.getCommittedDropMove(sourceId, targetId, position);
		this.pointerDragState = null;
		this.clearAllDragState();
		this.commitDropMove(move);
	}

	private cancelPointerDrag(event: PointerEvent): void {
		const state = this.pointerDragState;
		if (!state || event.pointerId !== state.pointerId) return;
		event.preventDefault();
		event.stopPropagation();
		if (state.handleEl.hasPointerCapture(event.pointerId)) {
			state.handleEl.releasePointerCapture(event.pointerId);
		}
		this.pointerDragState = null;
		this.clearAllDragState();
	}

	private stopMobileHandleTouch(event: TouchEvent): void {
		if (!this.isMobile()) return;
		event.preventDefault();
		event.stopPropagation();
		event.stopImmediatePropagation();
	}

	private createSearchButton(): HTMLButtonElement {
		const button = this.searchControlEl.createEl("button", {
			cls: "lite-tabs-toolbar-button lite-tabs-search-button",
			attr: {
				"aria-expanded": "false",
				"aria-label": "Search tabs",
				title: "Search tabs",
			},
		});
		button.addEventListener("click", () => {
			this.focusSearch();
		});
		this.setToolbarIcon(button, "search");
		return button;
	}

	private getLayoutIcon(style: LiteTabsLayoutStyle): string {
		if (style === "list") return "list";
		if (style === "masonry") return "layout-dashboard";
		return "layout-grid";
	}

	private getLayoutLabel(style: LiteTabsLayoutStyle): string {
		if (style === "list") return "List";
		if (style === "card") return "Card";
		return "Masonry";
	}

	private getDisplayOrderLabel(
		order: LiteTabsDisplayOrder,
		reversed = false
	): string {
		if (order === "name") return reversed ? "Name, Z to A" : "Name, A to Z";
		if (order === "modified") {
			return reversed
				? "Modified, oldest first"
				: "Modified, newest first";
		}
		return reversed ? "Workspace, reversed" : "Workspace";
	}

	private getDisplayOrderIcon(order: LiteTabsDisplayOrder): string {
		if (order === "name") return "lite-tabs-sort-name";
		if (order === "modified") return "clock-3";
		return "panel-left";
	}

	private setDisplayOrder(order: LiteTabsDisplayOrder): void {
		this.plugin.settings.displayOrder = order;
		this.clearAllDragState();
		this.forceRefresh();
		this.syncMoreButton();
		void this.plugin.saveSettings();
	}

	private toggleDisplayOrderReversed(): void {
		this.setDisplayOrderReversed(!this.plugin.settings.displayOrderReversed);
	}

	private setDisplayOrderReversed(reversed: boolean): void {
		this.plugin.settings.displayOrderReversed = reversed;
		this.clearAllDragState();
		this.forceRefresh();
		this.syncMoreButton();
		void this.plugin.saveSettings();
	}

	private createMoreButton(): HTMLButtonElement {
		const button = this.toolbarEl.createEl("button", {
			cls: "lite-tabs-toolbar-button lite-tabs-more-button",
			attr: {
				"aria-expanded": "false",
				"aria-label": "More Lite Tabs options",
				title: "More Lite Tabs options",
			},
		});
		this.setToolbarIcon(button, "more-horizontal");
		button.addEventListener("click", (event) => {
			this.showToolbarMenu(event);
		});
		return button;
	}

	private syncMoreButton(): void {
		const hasSecondaryState =
			this.plugin.settings.layoutStyle !== "list" ||
			this.plugin.settings.displayOrder !== "workspace" ||
			this.plugin.settings.displayOrderReversed ||
			this.plugin.settings.hideNativeTabs ||
			!this.plugin.settings.showIcons;
		const layoutLabel = this.getLayoutLabel(this.plugin.settings.layoutStyle);
		const orderLabel = this.getDisplayOrderLabel(
			this.plugin.settings.displayOrder,
			this.plugin.settings.displayOrderReversed
		);
		const label = `More Lite Tabs options. Layout: ${layoutLabel}. Display order: ${orderLabel}.`;
		this.moreButtonEl.toggleClass("is-active", hasSecondaryState);
		this.moreButtonEl.setAttr("aria-pressed", String(hasSecondaryState));
		this.moreButtonEl.setAttr("aria-label", label);
		this.moreButtonEl.setAttr("title", label);
	}

	private showToolbarMenu(event: MouseEvent): void {
		const menu = new Menu();
		this.moreButtonEl.addClass("is-menu-open");
		this.moreButtonEl.setAttr("aria-expanded", "true");
		menu.onHide(() => {
			this.moreButtonEl.removeClass("is-menu-open");
			this.moreButtonEl.setAttr("aria-expanded", "false");
		});
		this.addLayoutMenuItems(menu);
		menu.addSeparator();
		this.addDisplayOrderMenuItems(menu);
		menu.addSeparator();
		menu.addItem((item) => {
			item
				.setTitle("Show file icons")
				.setIcon(this.plugin.settings.showIcons ? "file" : "file-x")
				.setChecked(this.plugin.settings.showIcons)
				.onClick(() => {
					this.plugin.settings.showIcons =
						!this.plugin.settings.showIcons;
					this.plugin.applySettings();
					this.syncMoreButton();
					this.scheduleMasonryLayout();
					void this.plugin.saveSettings();
				});
		});
		menu.addItem((item) => {
			item
				.setTitle("Hide inactive native tabs")
				.setIcon(
					this.plugin.settings.hideNativeTabs ? "eye-off" : "eye"
				)
				.setChecked(this.plugin.settings.hideNativeTabs)
				.onClick(() => {
					this.plugin.settings.hideNativeTabs =
						!this.plugin.settings.hideNativeTabs;
					this.plugin.applySettings();
					this.syncMoreButton();
					void this.plugin.saveSettings();
				});
		});
		menu.addSeparator();
		menu.addItem((item) => {
			item.setTitle("Refresh").setIcon("refresh-cw").onClick(() => {
				this.forceRefresh();
			});
		});
		menu.showAtMouseEvent(event);
	}

	private addLayoutMenuItems(menu: Menu): void {
		const current = this.plugin.settings.layoutStyle;
		for (const style of ["list", "card", "masonry"] as const) {
			menu.addItem((item) => {
				item
					.setTitle(this.getLayoutLabel(style))
					.setIcon(this.getLayoutIcon(style))
					.setChecked(current === style)
					.onClick(() => {
						this.plugin.settings.layoutStyle = style;
						this.plugin.applySettings();
						this.forceRefresh();
						void this.plugin.saveSettings();
					});
			});
		}
	}

	private addDisplayOrderMenuItems(menu: Menu): void {
		const current = this.plugin.settings.displayOrder;
		const reversed = this.plugin.settings.displayOrderReversed;
		for (const order of ["workspace", "name", "modified"] as const) {
			menu.addItem((item) => {
				item
					.setTitle(this.getDisplayOrderLabel(order, reversed))
					.setIcon(this.getDisplayOrderIcon(order))
					.setChecked(current === order)
					.onClick(() => {
						this.setDisplayOrder(order);
					});
			});
		}
		menu.addItem((item) => {
			item
				.setTitle("Reverse order")
				.setIcon("arrow-up-down")
				.setChecked(reversed)
				.onClick(() => {
					this.toggleDisplayOrderReversed();
				});
		});
	}

	private setToolbarIcon(
		el: HTMLElement,
		icon: string,
		fallback = "list"
	): void {
		setIcon(el, icon);
		if (!el.querySelector("svg")) {
			setIcon(el, fallback);
		}
	}

	private createSearchInput(): HTMLInputElement {
		const input = this.searchControlEl.createEl("input", {
			cls: "lite-tabs-search",
			attr: {
				"aria-keyshortcuts": "ArrowUp ArrowDown Enter Escape",
				"aria-label":
					"Search tabs. Use arrow keys to select a result, Enter to open, and Escape to clear.",
				placeholder: "Search tabs · ↑↓",
				title: "Search tabs. ↑/↓ select, Enter open, Esc clear.",
				type: "search",
			},
		});
		input.addEventListener("input", () => {
			this.filterQuery = input.value.trim().toLocaleLowerCase();
			this.syncSearchReveal();
			this.clearAllDragState();
			this.applyFilter();
			this.syncSearchTarget();
			this.scheduleMasonryLayout();
		});
		input.addEventListener("keydown", (event) => {
			if (event.key === "ArrowDown" || event.key === "ArrowUp") {
				event.preventDefault();
				this.moveSearchTarget(
					event.key === "ArrowDown" ? 1 : -1
				);
				return;
			}
			if (event.key === "Enter") {
				event.preventDefault();
				event.stopPropagation();
				this.activateSearchTarget();
				return;
			}
			if (event.key !== "Escape") return;
			event.stopPropagation();
			if (!input.value) {
				this.clearSearchTarget();
				input.blur();
				return;
			}
			input.value = "";
			this.filterQuery = "";
			this.syncSearchReveal();
			this.applyFilter();
			this.clearSearchTarget();
			this.scheduleMasonryLayout();
		});
		input.addEventListener("focus", () => {
			this.syncSearchReveal();
			this.syncSearchTarget();
		});
		input.addEventListener("blur", () => {
			this.syncSearchReveal();
			if (!this.isFilterActive()) this.clearSearchTarget();
		});
		return input;
	}

	private syncSearchReveal(): void {
		const shouldReveal =
			this.filterQuery.length > 0 ||
			this.searchInputEl.ownerDocument.activeElement === this.searchInputEl;
		this.rootEl.toggleClass("is-search-revealed", shouldReveal);
		this.searchButtonEl.setAttr("aria-expanded", String(shouldReveal));
	}

	private moveSearchTarget(direction: -1 | 1): void {
		const currentId = this.isSearchTargetVisible()
			? this.searchTargetId
			: null;
		const id = getAdjacentVisibleId(
			this.orderedIds,
			currentId,
			direction,
			(candidateId) => this.rows.get(candidateId)?.el.isShown() ?? false
		);
		if (id) this.setSearchTarget(id, true);
	}

	private syncSearchTarget(): void {
		if (!this.isFilterActive() && !this.isSearchFocused()) {
			this.clearSearchTarget();
			return;
		}
		if (this.isSearchTargetVisible()) return;
		const id = getAdjacentVisibleId(
			this.orderedIds,
			null,
			1,
			(candidateId) => this.rows.get(candidateId)?.el.isShown() ?? false
		);
		if (id) {
			this.setSearchTarget(id, false);
		} else {
			this.clearSearchTarget();
		}
	}

	private setSearchTarget(id: string, scrollIntoView: boolean): void {
		if (this.searchTargetId === id) {
			if (scrollIntoView) {
				this.rows.get(id)?.el.scrollIntoView({ block: "nearest" });
			}
			return;
		}
		if (this.searchTargetId) {
			this.rows
				.get(this.searchTargetId)
				?.el.removeClass("is-search-target");
		}
		this.searchTargetId = id;
		const row = this.rows.get(id);
		if (!row) {
			this.clearSearchTarget();
			return;
		}
		row.el.addClass("is-search-target");
		this.searchInputEl.setAttr("aria-activedescendant", row.el.id);
		if (scrollIntoView) row.el.scrollIntoView({ block: "nearest" });
	}

	private clearSearchTarget(): void {
		if (this.searchTargetId) {
			this.rows
				.get(this.searchTargetId)
				?.el.removeClass("is-search-target");
		}
		this.searchTargetId = null;
		this.searchInputEl.removeAttribute("aria-activedescendant");
	}

	private isSearchTargetVisible(): boolean {
		return !!(
			this.searchTargetId &&
			this.rows.get(this.searchTargetId)?.el.isShown()
		);
	}

	private isSearchFocused(): boolean {
		return (
			this.searchInputEl.ownerDocument.activeElement === this.searchInputEl
		);
	}

	private createGroupSeparator(): HTMLElement {
		return createDiv({
			cls: "lite-tabs-group-separator",
			attr: { role: "separator" },
		});
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
			? getRelativeDropPosition(rect.left, rect.width, x)
			: getRelativeDropPosition(rect.top, rect.height, y);
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
		if (!this.canReorderTabs()) return;
		if (this.isFilterActive()) return;
		if (this.isMasonryLayout()) {
			if (this.isInsideDraggedRow(x, y)) {
				this.clearDropTarget();
				return;
			}
			if (this.isMasonrySeparatorAtCoordinates(x, y, null)) {
				this.clearDropTarget();
				return;
			}
			const groupEndId = this.getMasonryGroupEndTargetAtCoordinates(
				x,
				y,
				null
			);
			if (groupEndId && groupEndId !== this.draggedId) {
				this.setGroupDropTarget(groupEndId);
				return;
			}
			if (
				!this.getRowAtPoint(x, y) &&
				this.canDropAtListEndCoordinates(x, y, null)
			) {
				this.setGroupDropTarget(this.lastGroupEndId as string);
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
		const index = this.orderedIndexById.get(id) ?? -1;
		const current = this.rows.get(id);
		const nextId = index >= 0 ? this.orderedIds[index + 1] : null;
		const next = nextId ? this.rows.get(nextId) : null;
		return normalizeAdjacentDropTarget(
			id,
			position,
			nextId ?? null,
			current?.item.parentId ?? null,
			next?.item.parentId ?? null
		);
	}

	private setGroupDropTarget(id: string): void {
		this.clearGroupDropTarget();
		this.masonryIndicatorRect = this.isMasonryLayout()
			? this.getMasonryGroupDropIndicatorRect(id)
			: null;
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
		this.dropIndicatorEl.setCssProps({
			width: `${width}px`,
			height: `${height}px`,
			transform: `translate3d(${x}px, ${y}px, 0)`,
		});
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
		if (!this.canReorderTabs()) return;
		if (this.isFilterActive()) return;
		if (this.isMasonryLayout()) {
			if (this.isInsideDraggedRow(event.clientX, event.clientY)) {
				this.hideDropIndicator();
				return;
			}
			if (
				this.isMasonrySeparatorAtCoordinates(
					event.clientX,
					event.clientY,
					event.target
				)
			) {
				this.clearDropTarget();
				return;
			}
			const groupEndId = this.getMasonryGroupEndTargetAtCoordinates(
				event.clientX,
				event.clientY,
				event.target
			);
			if (groupEndId && groupEndId !== this.draggedId) {
				event.preventDefault();
				this.setGroupDropTarget(groupEndId);
				return;
			}
			if (
				!this.getEventRow(event) &&
				this.canDropAtListEnd(event)
			) {
				event.preventDefault();
				this.setGroupDropTarget(this.lastGroupEndId as string);
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
		if (!this.canReorderTabs()) return;
		if (this.isFilterActive()) return;
		if (this.isMasonryLayout()) {
			if (this.isInsideDraggedRow(event.clientX, event.clientY)) {
				this.clearAllDragState();
				return;
			}
			if (
				this.isMasonrySeparatorAtCoordinates(
					event.clientX,
					event.clientY,
					event.target
				)
			) {
				this.clearAllDragState();
				return;
			}
			const groupEndId = this.getMasonryGroupEndTargetAtCoordinates(
				event.clientX,
				event.clientY,
				event.target
			);
			if (groupEndId && groupEndId !== this.draggedId) {
				event.preventDefault();
				this.dropAfterGroupEnd(groupEndId, event);
				return;
			}
			if (
				!this.getEventRow(event) &&
				this.canDropAtListEnd(event)
			) {
				event.preventDefault();
				this.dropAfterGroupEnd(this.lastGroupEndId as string, event);
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
		const move = this.getCommittedDropMove(sourceId, targetId, position);
		this.clearAllDragState();
		this.commitDropMove(move);
	}

	private dropAfterGroupEnd(targetId: string, event: DragEvent): void {
		const sourceId =
			event.dataTransfer?.getData("text/plain") || this.draggedId;
		const move = this.getCommittedDropMove(sourceId, targetId, "after");
		this.clearAllDragState();
		this.commitDropMove(move);
	}

	private dropOnRow(id: string, el: HTMLElement, event: DragEvent): void {
		this.setDropTarget(id, el, event);
		const sourceId =
			event.dataTransfer?.getData("text/plain") || this.draggedId;
		const position = this.dropPosition;
		const targetId = this.dragOverId ?? id;
		const move = this.getCommittedDropMove(sourceId, targetId, position);
		this.clearAllDragState();
		this.commitDropMove(move);
	}

	private getCommittedDropMove(
		sourceId: string | null,
		targetId: string | null,
		position: RelativePosition
	): { sourceId: string; targetId: string; position: RelativePosition } | null {
		return getCommittedDropMove(
			this.orderedIndexById,
			sourceId,
			targetId,
			position
		);
	}

	private commitDropMove(
		move: {
			sourceId: string;
			targetId: string;
			position: RelativePosition;
		} | null
	): void {
		if (!move) return;
		if (!this.canReorderTabs()) return;
		if (
			moveLeafRelative(
				this.plugin.app,
				move.sourceId,
				move.targetId,
				move.position
			)
		) {
			this.pendingMovedId = move.sourceId;
			this.scheduleRefresh();
		}
	}

	private getEventRow(event: DragEvent): HTMLElement | null {
		const target = event.target;
		if (this.isHTMLElement(target)) {
			const row = target.closest(".lite-tabs-item");
			if (this.isHTMLElement(row)) return row;
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

		const slots = this.getMasonryDropSlotsForPoint(x, y);
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

	private getMasonryDropSlotsForPoint(
		x: number,
		y: number
	): MasonryDropSlot[] {
		const column = this.getMasonryColumnAtPoint(x, y);
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

	private getMasonryColumnAtPoint(
		x: number,
		y: number
	): RowGeometry[] | null {
		const columns = this.getMasonryColumns();
		const directColumns = columns.filter((column) => {
			const first = column[0];
			return x >= first.rect.left && x <= first.rect.right;
		});
		const direct = this.getNearestMasonryColumnByY(directColumns, y);
		if (direct) return direct;

		const listRect = this.getDragGeometry().listRect;
		if (x < listRect.left || x > listRect.right) return null;
		const nearestColumns: RowGeometry[][] = [];
		let bestDistance = Number.POSITIVE_INFINITY;
		for (const column of columns) {
			const first = column[0];
			const distance =
				x < first.rect.left ? first.rect.left - x : x - first.rect.right;
			if (distance >= 0 && distance === bestDistance) {
				nearestColumns.push(column);
			} else if (distance >= 0 && distance < bestDistance) {
				bestDistance = distance;
				nearestColumns.length = 0;
				nearestColumns.push(column);
			}
		}
		return this.getNearestMasonryColumnByY(nearestColumns, y);
	}

	private getNearestMasonryColumnByY(
		columns: RowGeometry[][],
		y: number
	): RowGeometry[] | null {
		let nearest: RowGeometry[] | null = null;
		let bestDistance = Number.POSITIVE_INFINITY;
		for (const column of columns) {
			const top = column[0].rect.top;
			const bottom = column.reduce(
				(max, row) => Math.max(max, row.rect.bottom),
				column[0].rect.bottom
			);
			const distance =
				y < top ? top - y : y > bottom ? y - bottom : 0;
			if (distance < bestDistance) {
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
		const sortedColumns = columns
			.sort((left, right) => left[0].rect.left - right[0].rect.left)
			.map((column) =>
				column.sort((left, right) => left.rect.top - right.rect.top)
			);
		return sortedColumns.flatMap((column) =>
			this.splitMasonryColumnByGroup(column)
		);
	}

	private splitMasonryColumnByGroup(column: RowGeometry[]): RowGeometry[][] {
		const segments: RowGeometry[][] = [];
		let current: RowGeometry[] = [];
		let currentParentId: string | null = null;
		for (const row of column) {
			const parentId = this.rows.get(row.id)?.item.parentId ?? "";
			if (current.length > 0 && parentId !== currentParentId) {
				segments.push(current);
				current = [];
			}
			current.push(row);
			currentParentId = parentId;
		}
		if (current.length > 0) {
			segments.push(current);
		}
		return segments;
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

	private getMasonryGroupEndTargetAtCoordinates(
		x: number,
		y: number,
		target: EventTarget | null
	): string | null {
		if (!this.draggedId) return null;
		if (
			this.isHTMLElement(target) &&
			target.closest(".lite-tabs-item")
		) {
			return null;
		}
		if (this.getRowAtPoint(x, y)) return null;

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

		for (const {
			endId,
			rowRect,
			separatorRect,
			separatorOuterRect,
		} of geometry.separators) {
			const inTrailingBlank =
				x > rowRect.right &&
				y >= rowRect.top &&
				y < separatorRect.top;
			const inBottomBlank =
				y >= rowRect.bottom && y < separatorRect.top;
			const inSeparatorTopMargin =
				y >= separatorOuterRect.top && y < separatorRect.top;
			if (inTrailingBlank || inBottomBlank || inSeparatorTopMargin) {
				return endId;
			}
		}
		return null;
	}

	private isMasonrySeparatorAtCoordinates(
		x: number,
		y: number,
		target: EventTarget | null
	): boolean {
		if (
			this.isHTMLElement(target) &&
			target.closest(".lite-tabs-group-separator")
		) {
			return true;
		}
		return this.getDragGeometry().separators.some(
			({ separatorRect }) =>
				x >= separatorRect.left &&
				x <= separatorRect.right &&
				y >= separatorRect.top &&
				y <= separatorRect.bottom
		);
	}

	private getMasonryGroupDropIndicatorRect(
		endId: string
	): RectSnapshot | null {
		const geometry = this.getDragGeometry();
		const row = geometry.rows.find((candidate) => candidate.id === endId);
		if (!row) return null;
		const top = row.rect.bottom;
		return {
			left: row.rect.left,
			right: row.rect.right,
			top,
			bottom: top + 2,
			width: row.rect.width,
			height: 2,
		};
	}

	private isInsideDropTarget(target: EventTarget | null): boolean {
		if (!this.isHTMLElement(target)) return false;
		return !!target.closest(".lite-tabs-item, .lite-tabs-group-separator");
	}

	private updatePointerAutoScroll(y: number): void {
		const rect = this.listEl.getBoundingClientRect();
		const edgeSize = Math.min(56, rect.height / 3);
		let velocity = 0;
		if (y < rect.top + edgeSize) {
			velocity = -getAutoScrollVelocity(rect.top + edgeSize - y);
		} else if (y > rect.bottom - edgeSize) {
			velocity = getAutoScrollVelocity(y - (rect.bottom - edgeSize));
		}
		this.autoScrollVelocity = velocity;
		if (velocity === 0) {
			this.stopAutoScroll();
			return;
		}
		if (this.autoScrollFrame !== null) return;
		this.autoScrollFrame = this.requestFrame(() => {
			this.stepAutoScroll();
		});
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
		this.autoScrollFrame = this.requestFrame(() => {
			this.stepAutoScroll();
		});
	}

	private stopAutoScroll(): void {
		this.autoScrollVelocity = 0;
		if (this.autoScrollFrame !== null) {
			this.cancelFrame(this.autoScrollFrame);
			this.autoScrollFrame = null;
		}
	}

	private clearAllDragState(): void {
		this.pointerDragState = null;
		this.stopAutoScroll();
		this.dragSourceEl?.toggleClass("is-drag-source", false);
		this.dragSourceEl?.toggleClass("is-touch-drag-source", false);
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
						separatorOuterRect: this.readOuterRect(el),
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

	private readOuterRect(el: HTMLElement): RectSnapshot {
		const rect = this.readRect(el);
		const margins = this.getElementMargins(el);
		const left = rect.left - margins.left;
		const right = rect.right + margins.right;
		const top = rect.top - margins.top;
		const bottom = rect.bottom + margins.bottom;
		return {
			left,
			right,
			top,
			bottom,
			width: Math.max(0, right - left),
			height: Math.max(0, bottom - top),
		};
	}

	private getElementMargins(el: HTMLElement): {
		top: number;
		right: number;
		bottom: number;
		left: number;
	} {
		const styles = getComputedStyle(el);
		return {
			top: this.readPixelValue(styles.marginTop),
			right: this.readPixelValue(styles.marginRight),
			bottom: this.readPixelValue(styles.marginBottom),
			left: this.readPixelValue(styles.marginLeft),
		};
	}

	private readPixelValue(value: string): number {
		const parsed = parseFloat(value);
		return Number.isFinite(parsed) ? parsed : 0;
	}

	private invalidateDragGeometry(): void {
		this.dragGeometry = null;
	}

	private scheduleMasonryLayout(): void {
		if (this.masonryFrame !== null) return;
		this.masonryFrame = this.requestFrame(() => {
			this.masonryFrame = null;
			this.applyMasonryLayout();
		});
	}

	private flushMasonryLayout(): void {
		if (this.masonryFrame !== null) {
			this.cancelFrame(this.masonryFrame);
			this.masonryFrame = null;
		}
		this.applyMasonryLayout();
	}

	private scheduleListOverflowCheck(): void {
		if (this.overflowFrame !== null) return;
		this.overflowFrame = this.requestFrame(() => {
			this.overflowFrame = null;
			this.syncListOverflowState();
		});
	}

	private syncListOverflowState(): void {
		const tolerance = 1;
		const contentHeight = this.getVisibleContentHeight();
		const availableHeight = this.getListContentHeight();
		const isOverflowing = contentHeight > availableHeight + tolerance;
		const shouldStackBottom =
			this.isMobile() &&
			this.plugin.settings.mobileStackBottom &&
			!isOverflowing;
		const spacer = shouldStackBottom
			? Math.max(
					0,
					availableHeight -
						contentHeight -
						this.getSpacerGapAdjustment(contentHeight > 0)
				)
			: 0;
		this.listEl.toggleClass("is-overflowing", isOverflowing);
		this.listEl.toggleClass("is-bottom-stacked", spacer > 0);
		this.setBottomSpacer(spacer);
		if (spacer > 0 && this.listEl.scrollTop !== 0) {
			this.listEl.scrollTop = 0;
		}
	}

	private getVisibleContentHeight(): number {
		const elements = Array.from(this.listEl.children).filter(
			(child): child is HTMLElement =>
				child.instanceOf(HTMLElement) &&
				child !== this.bottomSpacerEl &&
				child !== this.dropIndicatorEl &&
				child.isShown()
		);
		if (elements.length === 0) return 0;

		let top = Number.POSITIVE_INFINITY;
		let bottom = Number.NEGATIVE_INFINITY;
		for (const el of elements) {
			const rect = this.readOuterRect(el);
			top = Math.min(top, rect.top);
			bottom = Math.max(bottom, rect.bottom);
		}
		return Math.max(0, bottom - top);
	}

	private getListContentHeight(): number {
		const styles = getComputedStyle(this.listEl);
		const paddingTop = parseFloat(styles.paddingTop);
		const paddingBottom = parseFloat(styles.paddingBottom);
		const verticalPadding =
			(Number.isFinite(paddingTop) ? paddingTop : 0) +
			(Number.isFinite(paddingBottom) ? paddingBottom : 0);
		return Math.max(0, this.listEl.clientHeight - verticalPadding);
	}

	private getSpacerGapAdjustment(hasContent: boolean): number {
		if (!hasContent) return 0;
		const styles = getComputedStyle(this.listEl);
		const rowGap = parseFloat(styles.rowGap);
		return Number.isFinite(rowGap) ? rowGap : 0;
	}

	private resetBottomSpacer(): void {
		this.listEl.toggleClass("is-bottom-stacked", false);
		this.setBottomSpacer(0);
	}

	private setBottomSpacer(height: number): void {
		const roundedHeight = Math.max(0, Math.floor(height));
		if (roundedHeight === this.bottomSpacerHeight) return;
		this.bottomSpacerHeight = roundedHeight;
		this.bottomSpacerEl.setCssProps({
			display: roundedHeight > 0 ? "block" : "none",
			height: `${roundedHeight}px`,
			"--lite-tabs-bottom-spacer-span": String(
				Math.max(1, roundedHeight)
			),
		});
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
		const entries: { el: HTMLElement; span: number | null }[] = [];

		for (const row of this.rows.values()) {
			entries.push({
				el: row.el,
				span: this.measureMasonrySpan(row.el, rowHeight, gap),
			});
		}
		for (const { el } of this.groupSeparators) {
			entries.push({
				el,
				span: this.measureMasonrySpan(el, rowHeight, gap),
			});
		}
		entries.push({
			el: this.emptyEl,
			span: this.measureMasonrySpan(this.emptyEl, rowHeight, gap),
		});
		this.applyMasonrySpans(entries);
		this.invalidateDragGeometry();
		this.applyPendingMoveFeedback();
		this.scheduleListOverflowCheck();
	}

	private measureMasonrySpan(
		el: HTMLElement,
		rowHeight: number,
		gap: number
	): number | null {
		if (!el.isShown()) return null;
		const margins = this.getElementMargins(el);
		const height =
			Math.max(el.scrollHeight, el.offsetHeight) +
			margins.top +
			margins.bottom;
		return Math.max(1, Math.ceil((height + gap) / rowHeight));
	}

	private applyMasonrySpans(
		entries: { el: HTMLElement; span: number | null }[]
	): void {
		for (const { el, span } of entries) {
			if (span === null) {
				el.setCssProps({ "--lite-tabs-masonry-span": "" });
				continue;
			}
			const nextValue = String(span);
			if (el.getCssPropertyValue("--lite-tabs-masonry-span") === nextValue) {
				continue;
			}
			el.setCssProps({ "--lite-tabs-masonry-span": nextValue });
		}
	}

	private clearMasonrySpans(): void {
		for (const row of this.rows.values()) {
			row.el.setCssProps({ "--lite-tabs-masonry-span": "" });
		}
		for (const { el } of this.groupSeparators) {
			el.setCssProps({ "--lite-tabs-masonry-span": "" });
		}
		this.emptyEl.setCssProps({ "--lite-tabs-masonry-span": "" });
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
		return isNoopRelativeMove(
			this.orderedIndexById,
			sourceId,
			targetId,
			position
		);
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
			row.el.title = item.title;
			row.el.setAttr("aria-label", item.title);
			this.renderRowTitle(row);
		}
		if (row.renderedPath !== item.path) {
			if (item.path) {
				row.el.dataset.path = item.path;
			} else {
				delete row.el.dataset.path;
			}
			row.renderedPath = item.path;
		}
		if (row.renderedParentId !== item.parentId) {
			row.el.dataset.parentId = item.parentId;
			row.renderedParentId = item.parentId;
		}
		if (row.renderedPinned !== item.pinned) {
			row.el.toggleClass("is-pinned", item.pinned);
			renderIcon(row.closeEl, item.pinned ? "pin" : "x");
			row.closeEl.setAttr(
				"aria-label",
				item.pinned ? "Unpin tab" : "Close tab"
			);
			row.closeEl.setAttr(
				"title",
				item.pinned ? "Unpin tab" : "Close tab"
			);
			row.renderedPinned = item.pinned;
		}
		if (row.active !== item.active) {
			row.el.toggleClass("is-active", item.active);
			if (item.active) {
				row.el.setAttr("aria-current", "true");
			} else {
				row.el.removeAttribute("aria-current");
			}
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
			!hasFilter && !this.isMobile() && this.canReorderTabs();
		let visibleCount = 0;
		for (const row of this.rows.values()) {
			const visible =
				!hasFilter || matchesTabTitle(row.item.title, this.filterQuery);
			row.el.toggle(visible);
			row.el.draggable = allowNativeDrag;
			row.iconEl.draggable = allowNativeDrag;
			row.titleEl.draggable = allowNativeDrag;
			this.renderRowTitle(row);
			if (visible) visibleCount += 1;
		}
		for (const { el } of this.groupSeparators) {
			el.toggle(!hasFilter);
		}
		this.syncGroupLayoutState();
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

	private renderRowTitle(row: RowRecord): void {
		const query = this.isFilterActive() ? this.filterQuery : null;
		if (
			row.renderedTitle === row.item.title &&
			row.renderedTitleQuery === query
		) {
			return;
		}

		row.titleEl.empty();
		if (!query) {
			row.titleEl.setText(row.item.title);
		} else {
			this.renderHighlightedTitle(row.titleEl, row.item.title, query);
		}
		row.renderedTitle = row.item.title;
		row.renderedTitleQuery = query;
	}

	private renderHighlightedTitle(
		el: HTMLElement,
		title: string,
		query: string
	): void {
		const lowerTitle = title.toLocaleLowerCase();
		let cursor = 0;
		let matchIndex = lowerTitle.indexOf(query);
		while (matchIndex >= 0) {
			if (matchIndex > cursor) {
				el.createSpan({
					text: title.slice(cursor, matchIndex),
				});
			}
			el.createSpan({
				cls: "lite-tabs-title-match",
				text: title.slice(matchIndex, matchIndex + query.length),
			});
			cursor = matchIndex + query.length;
			matchIndex = lowerTitle.indexOf(query, cursor);
		}
		if (cursor < title.length) {
			el.createSpan({ text: title.slice(cursor) });
		}
	}

	private activateSearchTarget(): void {
		const targetRow =
			this.searchTargetId && this.rows.get(this.searchTargetId)?.el.isShown()
				? this.rows.get(this.searchTargetId)
				: this.getFirstVisibleRow();
		if (targetRow) this.activateLeaf(targetRow.item.leaf);
	}

	private getFirstVisibleRow(): RowRecord | null {
		for (const id of this.orderedIds) {
			const row = this.rows.get(id);
			if (row?.el.isShown()) return row;
		}
		return null;
	}

	private syncGroupLayoutState(): void {
		this.listEl.toggleClass(
			"has-groups",
			!this.isFilterActive() && this.groupSeparators.length > 0
		);
	}

	private isFilterActive(): boolean {
		return this.filterQuery.length > 0;
	}

	private canReorderTabs(): boolean {
		return (
			this.plugin.settings.displayOrder === "workspace" &&
			!this.plugin.settings.displayOrderReversed
		);
	}

	private activateLeaf(leaf: WorkspaceLeaf): void {
		this.plugin.app.workspace.setActiveLeaf(leaf, { focus: true });
	}

	private showContextMenu(leaf: WorkspaceLeaf, event: MouseEvent): void {
		const menu = new Menu();
		const pinned = !!leaf.getViewState().pinned;
		menu.addItem((item) => {
			item
				.setTitle(pinned ? "Unpin tab" : "Pin tab")
				.setIcon(pinned ? "pin-off" : "pin")
				.onClick(() => {
					leaf.setPinned(!pinned);
					this.scheduleRefresh();
				});
		});
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

	private handleRowAction(id: string): void {
		const row = this.rows.get(id);
		if (!row) return;
		if (row.item.pinned) {
			row.item.leaf.setPinned(false);
			this.scheduleRefresh();
			return;
		}
		this.closeLeaf(row.item.leaf);
	}
}
