import { App, WorkspaceLeaf, setIcon } from "obsidian";
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
	parentId: string;
	active: boolean;
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
			parentId: getLeafParentId(leaf),
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

export function renderIcon(el: HTMLElement, icon: string) {
	el.empty();
	setIcon(el, icon || "file");
}
