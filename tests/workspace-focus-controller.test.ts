import * as assert from "node:assert/strict";
import { test } from "node:test";
import type { App, WorkspaceLeaf } from "obsidian";
import { WorkspaceFocusController } from "../src/WorkspaceFocusController";

class FakeClassList {
	readonly values = new Set<string>();
	readonly addCounts = new Map<string, number>();
	readonly removeCounts = new Map<string, number>();

	constructor(...classNames: string[]) {
		for (const className of classNames) this.values.add(className);
	}

	add(className: string): void {
		this.addCounts.set(className, (this.addCounts.get(className) ?? 0) + 1);
		this.values.add(className);
	}

	remove(className: string): void {
		this.removeCounts.set(
			className,
			(this.removeCounts.get(className) ?? 0) + 1
		);
		this.values.delete(className);
	}

	contains(className: string): boolean {
		return this.values.has(className);
	}
}

class FakeElement {
	readonly classList: FakeClassList;
	readonly children: FakeElement[] = [];
	private readonly listeners = new Map<string, EventListener[]>();
	parentElement: FakeElement | null = null;
	isConnected = true;
	ownerDocument!: FakeDocument;

	constructor(...classNames: string[]) {
		this.classList = new FakeClassList(...classNames);
	}

	append(child: FakeElement): void {
		this.appendChild(child);
	}

	appendChild<T extends FakeElement>(child: T): T {
		child.remove();
		child.parentElement = this;
		child.ownerDocument = this.ownerDocument;
		child.isConnected = this.isConnected;
		this.children.push(child);
		return child;
	}

	matches(selector: string): boolean {
		const classNames = selector
			.split(".")
			.filter(Boolean);
		return classNames.every((className) => this.classList.contains(className));
	}

	closest<T>(selector: string): T | null {
		let current: FakeElement | null = this;
		while (current) {
			if (current.matches(selector)) return current as T;
			current = current.parentElement;
		}
		return null;
	}

	contains(candidate: FakeElement): boolean {
		let current: FakeElement | null = candidate;
		while (current) {
			if (current === this) return true;
			current = current.parentElement;
		}
		return false;
	}

	querySelector<T>(selector: string): T | null {
		return this.querySelectorAll<T>(selector)[0] ?? null;
	}

	querySelectorAll<T>(selector: string): T[] {
		if (selector.startsWith(":scope > ")) {
			const childSelector = selector.slice(9);
			return this.children.filter((child) =>
				child.matches(childSelector)
			) as T[];
		}
		const matches: FakeElement[] = [];
		for (const child of this.children) {
			if (child.matches(selector)) matches.push(child);
			matches.push(...child.querySelectorAll<FakeElement>(selector));
		}
		return matches as T[];
	}

	cloneNode(deep = false): FakeElement {
		const clone = new FakeElement(...this.classList.values);
		if (deep) {
			for (const child of this.children) clone.append(child.cloneNode(true));
		}
		return clone;
	}

	addEventListener(type: string, listener: EventListener): void {
		const listeners = this.listeners.get(type) ?? [];
		listeners.push(listener);
		this.listeners.set(type, listeners);
	}

	removeAttribute(_name: string): void {}

	remove(): void {
		if (!this.parentElement) return;
		const index = this.parentElement.children.indexOf(this);
		if (index >= 0) this.parentElement.children.splice(index, 1);
		this.parentElement = null;
		this.isConnected = false;
	}

	dispatchClick(): void {
		const event = {
			preventDefault: () => undefined,
			stopPropagation: () => undefined,
		} as unknown as Event;
		for (const listener of this.listeners.get("click") ?? []) {
			listener(event);
		}
	}
}

class FakeDocument {
	readonly body = new FakeElement();
}

class FakeAnimationFrameWindow {
	private nextHandle = 1;
	private callbacks = new Map<number, FrameRequestCallback>();
	requestCount = 0;
	cancelCount = 0;

	requestAnimationFrame(callback: FrameRequestCallback): number {
		const handle = this.nextHandle++;
		this.callbacks.set(handle, callback);
		this.requestCount += 1;
		return handle;
	}

	cancelAnimationFrame(handle: number): void {
		this.callbacks.delete(handle);
		this.cancelCount += 1;
	}

	flush(): void {
		const pending = [...this.callbacks.values()];
		this.callbacks.clear();
		for (const callback of pending) callback(0);
	}

	get pendingCount(): number {
		return this.callbacks.size;
	}
}

interface FocusFixture {
	app: App;
	controller: WorkspaceFocusController;
	document: FakeDocument;
	frameWindow: FakeAnimationFrameWindow;
	root: FakeElement;
	leftBranch: FakeElement;
	leftGroup: FakeElement;
	leftHeader: FakeElement;
	rightBranch: FakeElement;
	rightGroup: FakeElement;
	rightHeader: FakeElement;
	leftLeaf: WorkspaceLeaf;
	rightLeaf: WorkspaceLeaf;
	getRightToggleCount(): number;
	setMostRecentLeaf(leaf: WorkspaceLeaf | null): void;
}

function createFixture(): FocusFixture {
	const document = new FakeDocument();
	const root = new FakeElement("workspace-split", "mod-root");
	root.ownerDocument = document;
	const leftBranch = new FakeElement("workspace-split");
	const rightBranch = new FakeElement("workspace-split");
	const leftGroup = new FakeElement("workspace-tabs");
	const rightGroup = new FakeElement("workspace-tabs");
	const leftHeader = new FakeElement("workspace-tab-header-container");
	const rightHeader = new FakeElement("workspace-tab-header-container");
	const nativeRightToggle = new FakeElement(
		"sidebar-toggle-button",
		"mod-right"
	);
	root.append(leftBranch);
	root.append(rightBranch);
	leftBranch.append(leftGroup);
	rightBranch.append(rightGroup);
	leftGroup.append(leftHeader);
	rightGroup.append(rightHeader);
	rightHeader.append(nativeRightToggle);

	const rootSplit = {};
	const leftLeaf = createLeaf(rootSplit, "left", leftGroup);
	const rightLeaf = createLeaf(rootSplit, "right", rightGroup);
	let mostRecentLeaf: WorkspaceLeaf | null = leftLeaf;
	let rightToggleCount = 0;
	const frameWindow = new FakeAnimationFrameWindow();
	const app = {
		workspace: {
			rootSplit,
			rightSplit: {
				toggle: () => {
					rightToggleCount += 1;
				},
			},
			containerEl: { win: frameWindow },
			getMostRecentLeaf: () => mostRecentLeaf,
			iterateRootLeaves: (
				callback: (leaf: WorkspaceLeaf) => void
			) => {
				callback(leftLeaf);
				callback(rightLeaf);
			},
		},
	} as unknown as App;
	return {
		app,
		controller: new WorkspaceFocusController(app, "lite-tabs"),
		document,
		frameWindow,
		root,
		leftBranch,
		leftGroup,
		leftHeader,
		rightBranch,
		rightGroup,
		rightHeader,
		leftLeaf,
		rightLeaf,
		getRightToggleCount: () => rightToggleCount,
		setMostRecentLeaf: (leaf) => {
			mostRecentLeaf = leaf;
		},
	};
}

function createLeaf(
	rootSplit: object,
	id: string,
	groupEl: FakeElement
): WorkspaceLeaf {
	const leaf: {
		id: string;
		parent?: unknown;
		getRoot: () => object;
		getViewState: () => { type: string };
	} = {
		id,
		getRoot: () => rootSplit,
		getViewState: () => ({ type: "markdown" }),
	};
	leaf.parent = {
		id: `${id}-group`,
		children: [leaf],
		containerEl: groupEl,
		removeChild: () => undefined,
		insertChild: () => undefined,
		selectTab: () => undefined,
	};
	return leaf as unknown as WorkspaceLeaf;
}

function hasClass(element: FakeElement, className: string): boolean {
	return element.classList.contains(className);
}

test("focus controller coalesces events and avoids writes within one group", () => {
	const fixture = createFixture();
	fixture.controller.setEnabled(true);
	fixture.controller.handleLayoutChange();
	fixture.controller.handleActiveLeafChange(fixture.leftLeaf);

	assert.equal(fixture.frameWindow.requestCount, 1);
	assert.equal(fixture.frameWindow.pendingCount, 1);
	fixture.frameWindow.flush();
	assert.equal(hasClass(fixture.document.body, "lite-tabs-single-pane"), true);
	assert.equal(hasClass(fixture.leftGroup, "lite-tabs-focus-target"), true);
	assert.equal(hasClass(fixture.leftBranch, "lite-tabs-focus-path"), true);
	assert.equal(hasClass(fixture.root, "lite-tabs-focus-path"), true);

	const bodyAdds = fixture.document.body.classList.addCounts.get(
		"lite-tabs-single-pane"
	);
	const targetAdds = fixture.leftGroup.classList.addCounts.get(
		"lite-tabs-focus-target"
	);
	fixture.controller.handleActiveLeafChange(fixture.leftLeaf);
	fixture.frameWindow.flush();
	assert.equal(
		fixture.document.body.classList.addCounts.get("lite-tabs-single-pane"),
		bodyAdds
	);
	assert.equal(
		fixture.leftGroup.classList.addCounts.get("lite-tabs-focus-target"),
		targetAdds
	);
});

test("focus controller switches only the changed path", () => {
	const fixture = createFixture();
	fixture.controller.setEnabled(true);
	fixture.frameWindow.flush();
	fixture.setMostRecentLeaf(fixture.rightLeaf);
	fixture.controller.handleActiveLeafChange(fixture.rightLeaf);
	fixture.frameWindow.flush();

	assert.equal(hasClass(fixture.leftGroup, "lite-tabs-focus-target"), false);
	assert.equal(hasClass(fixture.leftBranch, "lite-tabs-focus-path"), false);
	assert.equal(hasClass(fixture.rightGroup, "lite-tabs-focus-target"), true);
	assert.equal(hasClass(fixture.rightBranch, "lite-tabs-focus-path"), true);
	assert.equal(hasClass(fixture.root, "lite-tabs-focus-path"), true);
	assert.equal(
		fixture.root.classList.addCounts.get("lite-tabs-focus-path"),
		1
	);
});

test("focus controller keeps one right-sidebar toggle in the visible group", () => {
	const fixture = createFixture();
	fixture.controller.setEnabled(true);
	fixture.frameWindow.flush();
	const clone = fixture.leftHeader.querySelector<FakeElement>(
		".lite-tabs-sidebar-toggle-clone"
	);
	assert.ok(clone);
	assert.equal(
		fixture.root.querySelectorAll(".sidebar-toggle-button.mod-right").length,
		2
	);
	clone.dispatchClick();
	assert.equal(fixture.getRightToggleCount(), 1);

	fixture.setMostRecentLeaf(fixture.rightLeaf);
	fixture.controller.handleActiveLeafChange(fixture.rightLeaf);
	fixture.frameWindow.flush();
	assert.equal(
		fixture.leftHeader.querySelector(".lite-tabs-sidebar-toggle-clone"),
		null
	);
	assert.equal(
		fixture.rightHeader.querySelectorAll(".sidebar-toggle-button.mod-right")
			.length,
		1
	);

	fixture.setMostRecentLeaf(fixture.leftLeaf);
	fixture.controller.handleActiveLeafChange(fixture.leftLeaf);
	fixture.frameWindow.flush();
	assert.equal(
		fixture.leftHeader.querySelector(".lite-tabs-sidebar-toggle-clone"),
		clone
	);
});

test("focus controller fails open when the workspace projection disappears", () => {
	const fixture = createFixture();
	fixture.controller.setEnabled(true);
	fixture.frameWindow.flush();
	fixture.leftGroup.isConnected = false;
	fixture.rightGroup.isConnected = false;
	fixture.setMostRecentLeaf(null);
	fixture.controller.handleLayoutChange();
	fixture.frameWindow.flush();

	assert.equal(hasClass(fixture.document.body, "lite-tabs-single-pane"), false);
	assert.equal(hasClass(fixture.leftGroup, "lite-tabs-focus-target"), false);
	assert.equal(hasClass(fixture.leftBranch, "lite-tabs-focus-path"), false);
	assert.equal(hasClass(fixture.root, "lite-tabs-focus-path"), false);
});

test("focus controller recovers when the focused group is removed", () => {
	const fixture = createFixture();
	fixture.controller.setEnabled(true);
	fixture.frameWindow.flush();
	fixture.leftGroup.isConnected = false;
	fixture.setMostRecentLeaf(fixture.rightLeaf);
	fixture.controller.handleLayoutChange();
	fixture.frameWindow.flush();

	assert.equal(hasClass(fixture.leftGroup, "lite-tabs-focus-target"), false);
	assert.equal(hasClass(fixture.leftBranch, "lite-tabs-focus-path"), false);
	assert.equal(hasClass(fixture.rightGroup, "lite-tabs-focus-target"), true);
	assert.equal(hasClass(fixture.rightBranch, "lite-tabs-focus-path"), true);
	assert.equal(hasClass(fixture.root, "lite-tabs-focus-path"), true);
});

test("disabling and disposing cancel work and remove all focus classes", () => {
	const fixture = createFixture();
	fixture.controller.setEnabled(true);
	fixture.controller.setEnabled(false);
	assert.equal(fixture.frameWindow.pendingCount, 0);
	assert.equal(fixture.frameWindow.cancelCount, 1);

	fixture.controller.setEnabled(true);
	fixture.frameWindow.flush();
	fixture.controller.dispose();
	assert.equal(hasClass(fixture.document.body, "lite-tabs-single-pane"), false);
	assert.equal(hasClass(fixture.leftGroup, "lite-tabs-focus-target"), false);
	assert.equal(hasClass(fixture.leftBranch, "lite-tabs-focus-path"), false);
	assert.equal(hasClass(fixture.root, "lite-tabs-focus-path"), false);
	assert.equal(
		fixture.root.querySelectorAll(".sidebar-toggle-button.mod-right").length,
		1
	);
});
