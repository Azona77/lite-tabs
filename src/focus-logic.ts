export interface FocusPathDiff<T> {
	add: T[];
	remove: T[];
}

export function getFocusPathDiff<T>(
	current: ReadonlySet<T>,
	next: ReadonlySet<T>
): FocusPathDiff<T> {
	return {
		add: [...next].filter((item) => !current.has(item)),
		remove: [...current].filter((item) => !next.has(item)),
	};
}
