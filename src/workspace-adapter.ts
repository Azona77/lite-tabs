import { View, type App, type WorkspaceLeaf } from "obsidian";
import { getRelativeInsertIndex } from "./tab-logic";

export type LeafMovePosition = "before" | "after";

type RootLeafIterator = (callback: (leaf: WorkspaceLeaf) => void) => void;

interface WorkspaceRuntime {
	iterateRootLeaves?: RootLeafIterator;
}

interface RuntimeLeaf {
	id?: string;
	parent?: unknown;
	setDimension?: (dimension: number | null) => void;
}

interface RuntimeWorkspaceItem {
	containerEl?: HTMLElement;
}

interface RuntimeTabGroup {
	id: string;
	children: WorkspaceLeaf[];
	removeChild: (leaf: WorkspaceLeaf) => void;
	insertChild: (index: number, leaf: WorkspaceLeaf) => void;
	selectTab: (leaf: WorkspaceLeaf) => void;
}

interface LeafMoveContext {
	sourceLeaf: WorkspaceLeaf;
	targetLeaf: WorkspaceLeaf;
	sourceParent: RuntimeTabGroup;
	targetParent: RuntimeTabGroup;
	sourceIndex: number;
	targetIndex: number;
}

export interface WorkspaceFocusProjection {
	document: Document;
	groupEl: HTMLElement;
	headerEl: HTMLElement;
	pathEls: HTMLElement[];
	rootEl: HTMLElement;
}

// Keep Obsidian runtime shape checks in this adapter so workspace internals
// do not leak into rendering or tab model code.
export function getLeafId(leaf: WorkspaceLeaf): string {
	return asRuntimeLeaf(leaf).id ?? "";
}

export function getLeafParentId(leaf: WorkspaceLeaf): string {
	return getRuntimeParent(leaf)?.id ?? "";
}

export function getActiveTabId(app: App): string | null {
	const activeLeaf = getActiveLeaf(app);
	if (!activeLeaf) return null;
	return getLeafId(activeLeaf) || null;
}

export function isMainWorkspaceLeaf(
	app: App,
	leaf: WorkspaceLeaf,
	excludedViewType?: string
): boolean {
	return (
		leaf.getRoot() === app.workspace.rootSplit &&
		leaf.getViewState().type !== excludedViewType
	);
}

export function getMostRecentMainLeaf(
	app: App,
	excludedViewType?: string
): WorkspaceLeaf | null {
	const recent = app.workspace.getMostRecentLeaf(app.workspace.rootSplit);
	if (recent && isMainWorkspaceLeaf(app, recent, excludedViewType)) {
		return recent;
	}

	let fallback: WorkspaceLeaf | null = null;
	forEachMainLeaf(app, (leaf) => {
		if (fallback || !isMainWorkspaceLeaf(app, leaf, excludedViewType)) return;
		fallback = leaf;
	});
	return fallback;
}

export function getWorkspaceFocusProjection(
	app: App,
	leaf: WorkspaceLeaf,
	excludedViewType?: string
): WorkspaceFocusProjection | null {
	if (!isMainWorkspaceLeaf(app, leaf, excludedViewType)) return null;
	const parent = getRuntimeParent(leaf);
	if (!parent) return null;
	const groupEl = asRuntimeWorkspaceItem(parent).containerEl;
	if (!groupEl || !groupEl.isConnected) return null;
	const headerEl = groupEl.querySelector<HTMLElement>(
		":scope > .workspace-tab-header-container"
	);
	if (!headerEl) return null;
	const rootEl = groupEl.closest<HTMLElement>(".workspace-split.mod-root");
	if (!rootEl || !rootEl.contains(groupEl)) return null;

	const pathEls: HTMLElement[] = [];
	let current: HTMLElement | null = groupEl.parentElement;
	while (current) {
		if (current.matches(".workspace-split")) {
			pathEls.push(current);
		}
		if (current === rootEl) break;
		current = current.parentElement;
	}
	if (pathEls[pathEls.length - 1] !== rootEl) return null;

	return {
		document: rootEl.ownerDocument,
		groupEl,
		headerEl,
		pathEls,
		rootEl,
	};
}

export function forEachMainLeaf(
	app: App,
	callback: (leaf: WorkspaceLeaf) => void
): void {
	const workspace = app.workspace as typeof app.workspace & WorkspaceRuntime;
	if (workspace.iterateRootLeaves) {
		workspace.iterateRootLeaves(callback);
		return;
	}
	app.workspace.iterateAllLeaves((leaf) => {
		if (leaf.getRoot() === app.workspace.rootSplit) {
			callback(leaf);
		}
	});
}

export function moveLeafRelative(
	app: App,
	sourceId: string,
	targetId: string,
	position: LeafMovePosition
): boolean {
	const context = getLeafMoveContext(app, sourceId, targetId);
	if (!context) return false;

	const insertIndex = getInsertIndex(context, position);
	if (insertIndex === null) return false;

	try {
		context.sourceParent.removeChild(context.sourceLeaf);
		asRuntimeLeaf(context.sourceLeaf).setDimension?.(null);
		context.targetParent.insertChild(insertIndex, context.sourceLeaf);
		context.targetParent.selectTab(context.sourceLeaf);
		notifyWorkspaceLayout(app);
		return true;
	} catch {
		return false;
	}
}

export function closeOtherLeavesInGroup(leaf: WorkspaceLeaf): void {
	const parent = getRuntimeParent(leaf);
	if (!parent) return;
	const leafId = getLeafId(leaf);
	for (const sibling of [...parent.children]) {
		if (getLeafId(sibling) !== leafId) {
			sibling.detach();
		}
	}
}

function getActiveLeaf(app: App): WorkspaceLeaf | null {
	const activeView = app.workspace.getActiveViewOfType(View);
	return activeView?.leaf ?? null;
}

function getLeafMoveContext(
	app: App,
	sourceId: string,
	targetId: string
): LeafMoveContext | null {
	if (sourceId === targetId) return null;

	const sourceLeaf = getMainLeafById(app, sourceId);
	const targetLeaf = getMainLeafById(app, targetId);
	if (!sourceLeaf || !targetLeaf) return null;

	const sourceParent = getRuntimeParent(sourceLeaf);
	const targetParent = getRuntimeParent(targetLeaf);
	if (!sourceParent || !targetParent) return null;

	const sourceIndex = sourceParent.children.indexOf(sourceLeaf);
	const targetIndex = targetParent.children.indexOf(targetLeaf);
	if (sourceIndex < 0 || targetIndex < 0) return null;

	return {
		sourceLeaf,
		targetLeaf,
		sourceParent,
		targetParent,
		sourceIndex,
		targetIndex,
	};
}

function getInsertIndex(
	context: LeafMoveContext,
	position: LeafMovePosition
): number | null {
	return getRelativeInsertIndex(
		context.sourceIndex,
		context.targetIndex,
		position,
		context.sourceParent.id === context.targetParent.id
	);
}

function notifyWorkspaceLayout(app: App): void {
	app.workspace.trigger("layout-change");
}

function getMainLeafById(app: App, id: string): WorkspaceLeaf | null {
	let result: WorkspaceLeaf | null = null;
	forEachMainLeaf(app, (leaf) => {
		if (result) return;
		if (getLeafId(leaf) === id) {
			result = leaf;
		}
	});
	return result;
}

function asRuntimeLeaf(leaf: RuntimeLeaf): RuntimeLeaf {
	return leaf;
}

function asRuntimeWorkspaceItem(item: unknown): RuntimeWorkspaceItem {
	return item as RuntimeWorkspaceItem;
}

function getRuntimeParent(leaf: WorkspaceLeaf): RuntimeTabGroup | null {
	const parent = asRuntimeLeaf(leaf).parent;
	return isRuntimeTabGroup(parent) ? parent : null;
}

function isRuntimeTabGroup(value: unknown): value is RuntimeTabGroup {
	if (typeof value !== "object" || value === null) return false;
	const parent = value as Partial<RuntimeTabGroup>;
	return (
		typeof parent.id === "string" &&
		Array.isArray(parent.children) &&
		typeof parent.removeChild === "function" &&
		typeof parent.insertChild === "function" &&
		typeof parent.selectTab === "function"
	);
}
