export type RelativePosition = "before" | "after";
export type DisplayOrder = "workspace" | "name" | "modified";

export interface OrderedTab {
	id: string;
	parentId: string;
}

export interface StructureTab extends OrderedTab {
	title: string;
	icon: string;
	path: string | null;
	modifiedTime?: number | null;
	pinned: boolean;
}

export interface DisplayOrderTab extends OrderedTab {
	title: string;
	modifiedTime: number | null;
}

export function createStructureSignature(
	layoutSignature: string,
	items: readonly StructureTab[]
): string {
	return `${layoutSignature}|${items
		.map(
			(item) =>
				`${item.id}\u001f${item.parentId}\u001f${item.title}\u001f${item.icon}\u001f${item.path ?? ""}\u001f${item.pinned}`
		)
		.join("\u001e")}`;
}

export function orderTabsByDisplayOrder<T extends DisplayOrderTab>(
	items: readonly T[],
	order: DisplayOrder
): T[] {
	if (order === "workspace") return [...items];

	const ordered: T[] = [];
	let group: T[] = [];
	let groupParentId: string | null = null;
	const flushGroup = () => {
		if (group.length === 0) return;
		ordered.push(...sortTabGroup(group, order));
		group = [];
	};

	for (const item of items) {
		if (groupParentId !== null && item.parentId !== groupParentId) {
			flushGroup();
		}
		groupParentId = item.parentId;
		group.push(item);
	}
	flushGroup();
	return ordered;
}

function sortTabGroup<T extends DisplayOrderTab>(
	items: readonly T[],
	order: Exclude<DisplayOrder, "workspace">
): T[] {
	return items
		.map((item, index) => ({ item, index }))
		.sort((a, b) => {
			const comparison =
				order === "name"
					? compareNames(a.item.title, b.item.title)
					: compareModifiedTimes(a.item.modifiedTime, b.item.modifiedTime);
			return comparison || a.index - b.index;
		})
		.map(({ item }) => item);
}

function compareNames(a: string, b: string): number {
	return a.localeCompare(b, undefined, {
		numeric: true,
		sensitivity: "base",
	});
}

function compareModifiedTimes(a: number | null, b: number | null): number {
	if (a === null && b === null) return 0;
	if (a === null) return 1;
	if (b === null) return -1;
	return b - a;
}

export function getRelativeInsertIndex(
	sourceIndex: number,
	targetIndex: number,
	position: RelativePosition,
	sameParent: boolean
): number | null {
	let insertIndex = position === "after" ? targetIndex + 1 : targetIndex;
	if (sameParent && sourceIndex < insertIndex) {
		insertIndex -= 1;
	}
	return sameParent && sourceIndex === insertIndex ? null : insertIndex;
}

export function getRelativeDropPosition(
	start: number,
	size: number,
	coordinate: number
): RelativePosition {
	return coordinate > start + size / 2 ? "after" : "before";
}

export function normalizeAdjacentDropTarget(
	id: string,
	position: RelativePosition,
	nextId: string | null,
	currentParentId: string | null,
	nextParentId: string | null
): { id: string; position: RelativePosition } {
	if (position === "before") return { id, position };
	return nextId && currentParentId === nextParentId
		? { id: nextId, position: "before" }
		: { id, position };
}

export function isNoopRelativeMove(
	indexById: ReadonlyMap<string, number>,
	sourceId: string,
	targetId: string,
	position: RelativePosition
): boolean {
	if (sourceId === targetId) return true;
	const sourceIndex = indexById.get(sourceId);
	const targetIndex = indexById.get(targetId);
	if (sourceIndex === undefined || targetIndex === undefined) return false;
	let insertIndex = position === "after" ? targetIndex + 1 : targetIndex;
	if (sourceIndex < insertIndex) insertIndex -= 1;
	return sourceIndex === insertIndex;
}

export function getCommittedDropMove(
	indexById: ReadonlyMap<string, number>,
	sourceId: string | null,
	targetId: string | null,
	position: RelativePosition
): { sourceId: string; targetId: string; position: RelativePosition } | null {
	if (!sourceId || !targetId) return null;
	if (isNoopRelativeMove(indexById, sourceId, targetId, position)) return null;
	return { sourceId, targetId, position };
}

export function matchesTabTitle(title: string, query: string): boolean {
	return title.toLocaleLowerCase().includes(query);
}

export function getAdjacentVisibleId(
	orderedIds: readonly string[],
	currentId: string | null,
	direction: -1 | 1,
	isVisible: (id: string) => boolean
): string | null {
	const currentIndex = currentId ? orderedIds.indexOf(currentId) : -1;
	let index =
		currentIndex >= 0
			? currentIndex + direction
			: direction > 0
				? 0
				: orderedIds.length - 1;
	while (index >= 0 && index < orderedIds.length) {
		const id = orderedIds[index];
		if (isVisible(id)) return id;
		index += direction;
	}
	return null;
}

export function getAutoScrollVelocity(distance: number): number {
	return Math.min(14, Math.max(3, distance / 4));
}
