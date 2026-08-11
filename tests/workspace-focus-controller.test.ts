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
	readonly attributes = new Map<string, string>();
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

	addEventListener(type: string, listener: EventListener): void {
		const listeners = this.listeners.get(type) ?? [];
		listeners.push(listener);
		this.listeners.set(type, listeners);
	}

	setAttribute(name: string, value: string): void {
		this.attributes.set(name, value);
	}

	getAttribute(name: string): string | null {
		return this.attributes.get(name) ?? null;
	}

	removeAttribute(name: string): void {
		this.attributes.delete(name);
	}

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

	dispatchKeyDown(key: string): void {
		const event = {
			key,
			preventDefault: () => undefined,
		} as unknown as Event;
		for (const listener of this.listeners.get("keydown") ?? []) {
			listener(event);
		}
	}
}

class FakeDocument {
	readonly body: FakeElement;

	constructor() {
		this.body = this.createElement("body");
	}

	createElement(_tagName: string): FakeElement {
		const element = new FakeElement();
		element.ownerDocument = this;
		return element;
	}
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
	nativeRightToggle: FakeElement;
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
	const rightGroup = new FakeElement("workspace-tabs", "mod-top-right-space");
	const leftHeader = new FakeElement("workspace-tab-header-container");
	const rightHeader = new FakeElement("workspace-tab-header-container");
	let rightToggleCount = 0;
	const nativeRightToggle = new FakeElement(
		"sidebar-toggle-button",
		"mod-right"
	);
	nativeRightToggle.addEventListener("click", () => {
		rightToggleCount += 1;
	});
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
		nativeRightToggle,
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

test("focus controller adds one native-positioned proxy without moving the toggle", () => {
	const fixture = createFixture();
	fixture.controller.setEnabled(true);
	fixture.frameWindow.flush();
	const proxy = fixture.leftHeader.querySelector<FakeElement>(
		".lite-tabs-sidebar-toggle-proxy"
	);
	assert.ok(proxy);
	assert.equal(proxy.parentElement, fixture.leftHeader);
	assert.equal(hasClass(proxy, "sidebar-toggle-button"), true);
	assert.equal(hasClass(proxy, "mod-right"), true);
	assert.equal(
		fixture.root.querySelectorAll(".sidebar-toggle-button.mod-right").length,
		2
	);
	assert.equal(
		fixture.rightHeader.querySelector(".sidebar-toggle-button.mod-right"),
		fixture.nativeRightToggle
	);
	assert.equal(hasClass(fixture.leftGroup, "mod-top-right-space"), true);

	const button = proxy.querySelector<FakeElement>(".clickable-icon");
	assert.ok(button);
	assert.equal(proxy.getAttribute("role"), "button");
	assert.equal(proxy.getAttribute("tabindex"), "0");
	assert.equal(
		proxy.getAttribute("aria-label"),
		"Toggle right sidebar"
	);
	assert.equal(proxy.getAttribute("title"), "Toggle right sidebar");
	assert.ok(button.querySelector(".sidebar-toggle-icon-inner"));
	proxy.dispatchClick();
	assert.equal(fixture.getRightToggleCount(), 1);
	proxy.dispatchKeyDown(" ");
	assert.equal(fixture.getRightToggleCount(), 2);
	fixture.controller.handleLayoutChange();
	fixture.frameWindow.flush();
	assert.equal(
		fixture.leftHeader.querySelectorAll(
			".lite-tabs-sidebar-toggle-proxy"
		).length,
		1
	);

	fixture.setMostRecentLeaf(fixture.rightLeaf);
	fixture.controller.handleActiveLeafChange(fixture.rightLeaf);
	fixture.frameWindow.flush();
	assert.equal(
		fixture.leftHeader.querySelector(".lite-tabs-sidebar-toggle-proxy"),
		null
	);
	assert.equal(hasClass(fixture.leftGroup, "mod-top-right-space"), false);
	assert.equal(
		fixture.rightHeader.querySelector(".sidebar-toggle-button.mod-right"),
		fixture.nativeRightToggle
	);
	assert.equal(hasClass(fixture.rightGroup, "mod-top-right-space"), true);

	fixture.setMostRecentLeaf(fixture.leftLeaf);
	fixture.controller.handleActiveLeafChange(fixture.leftLeaf);
	fixture.frameWindow.flush();
	assert.ok(
		fixture.leftHeader.querySelector(".lite-tabs-sidebar-toggle-proxy")
	);
	assert.equal(
		fixture.rightHeader.querySelector(".sidebar-toggle-button.mod-right"),
		fixture.nativeRightToggle
	);
});

test("focus controller recreates its proxy after the tab chrome rebuilds", () => {
	const fixture = createFixture();
	fixture.controller.setEnabled(true);
	fixture.frameWindow.flush();
	const staleProxy = fixture.leftHeader.querySelector<FakeElement>(
		".lite-tabs-sidebar-toggle-proxy"
	);
	assert.ok(staleProxy);

	staleProxy.remove();
	fixture.controller.handleLayoutChange();
	fixture.frameWindow.flush();

	const replacement = fixture.leftHeader.querySelector<FakeElement>(
		".lite-tabs-sidebar-toggle-proxy"
	);
	assert.ok(replacement);
	assert.notEqual(replacement, staleProxy);
	assert.equal(
		fixture.root.querySelectorAll(".sidebar-toggle-button.mod-right").length,
		2
	);
	assert.equal(hasClass(fixture.leftGroup, "mod-top-right-space"), true);

	fixture.controller.setEnabled(false);
	assert.equal(
		fixture.leftHeader.querySelector(".lite-tabs-sidebar-toggle-proxy"),
		null
	);
	assert.equal(hasClass(fixture.leftGroup, "mod-top-right-space"), false);
	assert.equal(
		fixture.rightHeader.querySelector(".sidebar-toggle-button.mod-right"),
		fixture.nativeRightToggle
	);
});

test("focus controller yields its slot when a native toggle appears", () => {
	const fixture = createFixture();
	fixture.controller.setEnabled(true);
	fixture.frameWindow.flush();
	assert.ok(
		fixture.leftHeader.querySelector(".lite-tabs-sidebar-toggle-proxy")
	);

	const nativeToggle = new FakeElement("sidebar-toggle-button", "mod-right");
	fixture.leftHeader.append(nativeToggle);
	fixture.controller.handleLayoutChange();
	fixture.frameWindow.flush();

	assert.equal(
		fixture.leftHeader.querySelector(".lite-tabs-sidebar-toggle-proxy"),
		null
	);
	assert.equal(
		fixture.leftHeader.querySelector(".sidebar-toggle-button.mod-right"),
		nativeToggle
	);
	assert.equal(hasClass(fixture.leftGroup, "mod-top-right-space"), true);

	fixture.controller.setEnabled(false);
	assert.equal(hasClass(fixture.leftGroup, "mod-top-right-space"), true);
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
	assert.equal(
		fixture.rightHeader.querySelector(".sidebar-toggle-button.mod-right"),
		fixture.nativeRightToggle
	);
	assert.equal(hasClass(fixture.leftGroup, "mod-top-right-space"), false);
	assert.equal(hasClass(fixture.rightGroup, "mod-top-right-space"), true);
});
