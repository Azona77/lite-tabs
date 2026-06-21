export type RelativePosition = "before" | "after";

export interface OrderedTab {
	id: string;
	parentId: string;
}

export interface StructureTab extends OrderedTab {
	title: string;
	icon: string;
	path: string | null;
	pinned: boolean;
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
