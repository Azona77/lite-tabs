import { App, FileView, WorkspaceLeaf, setIcon } from "obsidian";
import {
	forEachMainLeaf,
	getActiveTabId,
	getLeafId,
	getLeafParentId,
	moveLeafRelative,
} from "./workspace-adapter";

export {
	closeOtherLeavesInGroup,
	getActiveTabId,
	getLeafId,
	moveLeafRelative,
} from "./workspace-adapter";

export const LITE_TABS_VIEW_TYPE = "lite-tabs-view";

export interface TabItem {
	id: string;
	leaf: WorkspaceLeaf;
	title: string;
	icon: string;
	path: string | null;
	modifiedTime: number | null;
	parentId: string;
	active: boolean;
	pinned: boolean;
}

export function collectTabs(app: App): TabItem[] {
	const activeId = getActiveTabId(app);
	const items: TabItem[] = [];

	forEachMainLeaf(app, (leaf) => {
		const id = getLeafId(leaf);
		if (!id) return;
		if (leaf.getViewState().type === LITE_TABS_VIEW_TYPE) return;
		items.push({
			id,
			leaf,
			title: leaf.getDisplayText(),
			icon: leaf.getIcon(),
			path: getLeafPath(leaf),
			modifiedTime: getLeafModifiedTime(leaf),
			parentId: getLeafParentId(leaf),
			active: activeId === id,
			pinned: !!leaf.getViewState().pinned,
		});
	});

	return items;
}

function getLeafPath(leaf: WorkspaceLeaf): string | null {
	const view = leaf.view;
	if (!(view instanceof FileView)) return null;
	return view.file?.path ?? null;
}

function getLeafModifiedTime(leaf: WorkspaceLeaf): number | null {
	const view = leaf.view;
	if (!(view instanceof FileView)) return null;
	return view.file?.stat.mtime ?? null;
}

export function moveLeafBefore(
	app: App,
	sourceId: string,
	targetId: string
): boolean {
	return moveLeafRelative(app, sourceId, targetId, "before");
}

export function renderIcon(el: HTMLElement, icon: string) {
	el.empty();
	setIcon(el, icon || "file");
}
