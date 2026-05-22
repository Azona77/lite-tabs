import { App, View, WorkspaceLeaf, setIcon } from "obsidian";

export const LITE_TABS_VIEW_TYPE = "lite-tabs-view";

export interface TabItem {
	id: string;
	leaf: WorkspaceLeaf;
	title: string;
	icon: string;
	parentId: string;
	active: boolean;
}

type RootLeafIterator = (callback: (leaf: WorkspaceLeaf) => void) => void;

interface WorkspaceWithRootIterator {
	iterateRootLeaves?: RootLeafIterator;
}

interface RuntimeWorkspace {
	requestResize?: () => void;
	onLayoutChange?: () => void;
}

interface RuntimeLeaf {
	id: string;
	parent: RuntimeParent | null;
	setDimension?: (dimension: number | null) => void;
}

interface RuntimeParent {
	id: string;
	children: WorkspaceLeaf[];
	removeChild: (leaf: WorkspaceLeaf) => void;
	insertChild: (index: number, leaf: WorkspaceLeaf) => void;
	selectTab: (leaf: WorkspaceLeaf) => void;
}

export function getLeafId(leaf: WorkspaceLeaf): string {
	return asRuntimeLeaf(leaf).id;
}

function asRuntimeLeaf(leaf: WorkspaceLeaf): RuntimeLeaf {
	return leaf as unknown as RuntimeLeaf;
}

function getActiveLeaf(app: App): WorkspaceLeaf | null {
	const activeView = app.workspace.getActiveViewOfType(View);
	return activeView?.leaf ?? null;
}

export function getActiveTabId(app: App): string | null {
	const activeLeaf = getActiveLeaf(app);
	return activeLeaf ? getLeafId(activeLeaf) : null;
}

function getParentId(leaf: WorkspaceLeaf): string {
	return asRuntimeLeaf(leaf).parent?.id ?? "";
}

function iterateMainLeaves(app: App, callback: (leaf: WorkspaceLeaf) => void) {
	const workspace = app.workspace as typeof app.workspace &
		WorkspaceWithRootIterator;
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

export function collectTabs(app: App): TabItem[] {
	const activeLeaf = getActiveLeaf(app);
	const activeId = activeLeaf ? getLeafId(activeLeaf) : null;
	const items: TabItem[] = [];

	iterateMainLeaves(app, (leaf) => {
		const id = getLeafId(leaf);
		if (leaf.getViewState().type === LITE_TABS_VIEW_TYPE) return;
		items.push({
			id,
			leaf,
			title: leaf.getDisplayText(),
			icon: leaf.getIcon(),
			parentId: getParentId(leaf),
			active: activeId === id,
		});
	});

	return items;
}

export function moveLeafBefore(
	app: App,
	sourceId: string,
	targetId: string
): boolean {
	return moveLeafRelative(app, sourceId, targetId, "before");
}

export function moveLeafRelative(
	app: App,
	sourceId: string,
	targetId: string,
	position: "before" | "after"
): boolean {
	if (sourceId === targetId) return false;

	const sourceLeaf = app.workspace.getLeafById(sourceId);
	const targetLeaf = app.workspace.getLeafById(targetId);
	if (!sourceLeaf || !targetLeaf) return false;

	const sourceParent = asRuntimeLeaf(sourceLeaf).parent;
	const targetParent = asRuntimeLeaf(targetLeaf).parent;
	if (!sourceParent || !targetParent) return false;

	const sourceIndex = sourceParent.children.indexOf(sourceLeaf);
	const targetIndex = targetParent.children.indexOf(targetLeaf);
	if (sourceIndex < 0 || targetIndex < 0) return false;

	let insertIndex = position === "after" ? targetIndex + 1 : targetIndex;
	if (sourceParent.id === targetParent.id && sourceIndex < insertIndex) {
		insertIndex -= 1;
	}
	if (sourceParent.id === targetParent.id && sourceIndex === insertIndex) {
		return false;
	}

	sourceParent.removeChild(sourceLeaf);
	asRuntimeLeaf(sourceLeaf).setDimension?.(null);
	targetParent.insertChild(insertIndex, sourceLeaf);
	targetParent.selectTab(sourceLeaf);
	const workspace = app.workspace as typeof app.workspace & RuntimeWorkspace;
	workspace.requestResize?.();
	workspace.onLayoutChange?.();
	return true;
}

export function closeOtherLeavesInGroup(leaf: WorkspaceLeaf): void {
	const parent = asRuntimeLeaf(leaf).parent;
	if (!parent) return;
	for (const sibling of [...parent.children]) {
		if (getLeafId(sibling) !== getLeafId(leaf)) {
			sibling.detach();
		}
	}
}

export function renderIcon(el: HTMLElement, icon: string) {
	el.empty();
	setIcon(el, icon || "file");
}
