import { App, View, WorkspaceLeaf, setIcon } from "obsidian";

export const ONLY_TABS_VIEW_TYPE = "only-tabs-view";

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
	const items: TabItem[] = [];

	iterateMainLeaves(app, (leaf) => {
		if (leaf.getViewState().type === ONLY_TABS_VIEW_TYPE) return;
		items.push({
			id: getLeafId(leaf),
			leaf,
			title: leaf.getDisplayText(),
			icon: leaf.getIcon(),
			parentId: getParentId(leaf),
			active: !!activeLeaf && getLeafId(activeLeaf) === getLeafId(leaf),
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

export function renderIcon(el: HTMLElement, icon: string) {
	el.empty();
	setIcon(el, icon || "file");
}
