import * as assert from "node:assert/strict";
import { test } from "node:test";
import { getFocusPathDiff } from "../src/focus-logic";

test("focus path diffs keep shared ancestors untouched", () => {
	const root = { id: "root" };
	const left = { id: "left" };
	const right = { id: "right" };
	const diff = getFocusPathDiff(
		new Set([root, left]),
		new Set([root, right])
	);

	assert.deepEqual(diff.add, [right]);
	assert.deepEqual(diff.remove, [left]);
});

test("focus path diffs are empty when the group path is unchanged", () => {
	const root = { id: "root" };
	const branch = { id: "branch" };
	assert.deepEqual(
		getFocusPathDiff(new Set([root, branch]), new Set([root, branch])),
		{ add: [], remove: [] }
	);
});
