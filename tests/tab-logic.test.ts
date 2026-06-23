import * as assert from "node:assert/strict";
import { test } from "node:test";
import {
	createStructureSignature,
	getAdjacentVisibleId,
	getAutoScrollVelocity,
	getCommittedDropMove,
	getRelativeDropPosition,
	getRelativeInsertIndex,
	isNoopRelativeMove,
	matchesTabTitle,
	normalizeAdjacentDropTarget,
} from "../src/tab-logic";

test("structure signatures track rendered tab fields", () => {
	const base = [{
		id: "a",
		parentId: "group",
		title: "Alpha",
		icon: "file",
		path: "Alpha.md",
		pinned: false,
	}];
	assert.equal(createStructureSignature("list", base), createStructureSignature("list", base));
	assert.notEqual(
		createStructureSignature("list", base),
		createStructureSignature("list", [{ ...base[0], pinned: true }])
	);
	assert.notEqual(createStructureSignature("list", base), createStructureSignature("card:2", base));
});

test("relative insert indexes account for removal from the same group", () => {
	assert.equal(getRelativeInsertIndex(0, 2, "after", true), 2);
	assert.equal(getRelativeInsertIndex(2, 0, "before", true), 0);
	assert.equal(getRelativeInsertIndex(0, 1, "before", true), null);
	assert.equal(getRelativeInsertIndex(0, 1, "before", false), 1);
});

test("drop positions are derived from the active axis coordinates", () => {
	assert.equal(getRelativeDropPosition(10, 20, 19), "before");
	assert.equal(getRelativeDropPosition(10, 20, 21), "after");
	assert.equal(getRelativeDropPosition(100, 40, 119), "before");
	assert.equal(getRelativeDropPosition(100, 40, 121), "after");
});

test("after targets normalize to the next item in the same group", () => {
	assert.deepEqual(
		normalizeAdjacentDropTarget("a", "after", "b", "one", "one"),
		{
		id: "b",
		position: "before",
		}
	);
	assert.deepEqual(normalizeAdjacentDropTarget("b", "after", "c", "one", "two"), {
		id: "b",
		position: "after",
	});
});

test("no-op move detection handles adjacent and missing tabs", () => {
	const indexes = new Map(["a", "b", "c"].map((id, index) => [id, index]));
	assert.equal(isNoopRelativeMove(indexes, "a", "b", "before"), true);
	assert.equal(isNoopRelativeMove(indexes, "b", "a", "after"), true);
	assert.equal(isNoopRelativeMove(indexes, "a", "c", "after"), false);
	assert.equal(isNoopRelativeMove(indexes, "missing", "a", "before"), false);
	assert.deepEqual(getCommittedDropMove(indexes, "a", "c", "after"), {
		sourceId: "a",
		targetId: "c",
		position: "after",
	});
	assert.equal(getCommittedDropMove(indexes, "a", "b", "before"), null);
	assert.equal(getCommittedDropMove(indexes, null, "b", "before"), null);
});

test("title matching and keyboard navigation skip hidden rows", () => {
	assert.equal(matchesTabTitle("Project Notes", "notes"), true);
	assert.equal(matchesTabTitle("Project Notes", "missing"), false);
	const visible = new Set(["a", "c"]);
	const isVisible = (id: string) => visible.has(id);
	assert.equal(getAdjacentVisibleId(["a", "b", "c"], null, 1, isVisible), "a");
	assert.equal(getAdjacentVisibleId(["a", "b", "c"], "a", 1, isVisible), "c");
	assert.equal(getAdjacentVisibleId(["a", "b", "c"], "c", -1, isVisible), "a");
	assert.equal(getAdjacentVisibleId(["a", "b", "c"], "c", 1, isVisible), null);
});

test("auto-scroll velocity stays within its interaction budget", () => {
	assert.equal(getAutoScrollVelocity(0), 3);
	assert.equal(getAutoScrollVelocity(20), 5);
	assert.equal(getAutoScrollVelocity(100), 14);
});
