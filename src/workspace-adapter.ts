import { App, View, WorkspaceLeaf } from "obsidian";

export type LeafMovePosition = "before" | "after";

type RootLeafIterator = (callback: (leaf: WorkspaceLeaf) => void) => void;

interface WorkspaceRuntime {
	iterateRootLeaves?: RootLeafIterator;
	requestResize?: () => void;
	onLayoutChange?: () => void;
}

interface RuntimeLeaf {
	id?: string;
	parent?: unknown;
	setDimension?: (dimension: number | null) => void;
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

	const sourceLeaf = app.workspace.getLeafById(sourceId);
	const targetLeaf = app.workspace.getLeafById(targetId);
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
	let insertIndex =
		position === "after" ? context.targetIndex + 1 : context.targetIndex;
	const sameParent = context.sourceParent.id === context.targetParent.id;
	if (sameParent && context.sourceIndex < insertIndex) {
		insertIndex -= 1;
	}
	if (sameParent && context.sourceIndex === insertIndex) {
		return null;
	}
	return insertIndex;
}

function notifyWorkspaceLayout(app: App): void {
	const workspace = app.workspace as typeof app.workspace & WorkspaceRuntime;
	workspace.requestResize?.();
	workspace.onLayoutChange?.();
}

function asRuntimeLeaf(leaf: WorkspaceLeaf): RuntimeLeaf {
	return leaf as unknown as RuntimeLeaf;
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
