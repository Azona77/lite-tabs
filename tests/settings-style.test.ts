import * as assert from "node:assert/strict";
import { test } from "node:test";
import type { LiteTabsSettings } from "../src/settings";
import {
	applySettingsStyles,
	clearSettingsStyles,
	syncSettingsStyleTargets,
	type SettingsStyleTarget,
} from "../src/settings-style";

const TEST_SETTINGS: LiteTabsSettings = {
	hideNativeTabs: false,
	singlePaneMode: false,
	toolbarPosition: "floating",
	layoutStyle: "list",
	displayOrder: "workspace",
	displayOrderReversed: false,
	mobileStackBottom: true,
	showMobileDragHandles: true,
	showIcons: true,
	separatorThickness: 2,
	separatorMarginY: 7,
	separatorMarginX: 8,
	listItemHeight: 30,
	listGap: 1,
	listFontSize: 13,
	cardWidth: 120,
	cardHeight: 56,
	cardFontSize: 13,
	cardGap: 6,
	activeTabEmphasis: 18,
	activeTabBackground: true,
	activeTabBorder: true,
};

class FakeStyleTarget implements SettingsStyleTarget {
	classes = new Set<string>();
	styles = new Map<string, string>();

	toggleClass(className: string, enabled: boolean): void {
		if (enabled) {
			this.classes.add(className);
		} else {
			this.classes.delete(className);
		}
	}

	setCssProps(properties: Record<string, string>): void {
		for (const [property, value] of Object.entries(properties)) {
			this.styles.set(property, value);
		}
	}
}

test("settings styles apply layout, visibility, and numeric values", () => {
	const target = new FakeStyleTarget();
	applySettingsStyles(target, {
		...TEST_SETTINGS,
		hideNativeTabs: true,
		layoutStyle: "masonry",
		toolbarPosition: "docked-top",
		listItemHeight: 36,
		cardWidth: 180,
		activeTabEmphasis: 27,
	});

	assert.equal(target.classes.has("lite-tabs-hide-native"), true);
	assert.equal(target.classes.has("lite-tabs-layout-masonry"), true);
	assert.equal(target.classes.has("lite-tabs-layout-list"), false);
	assert.equal(target.classes.has("lite-tabs-toolbar-docked"), true);
	assert.equal(target.styles.get("--lite-tabs-list-item-height"), "36px");
	assert.equal(target.styles.get("--lite-tabs-card-width"), "180px");
	assert.equal(
		target.styles.get("--lite-tabs-active-background-strength"),
		"27%"
	);
});

test("hidden toolbar position maps to the toolbar visibility class", () => {
	const target = new FakeStyleTarget();
	applySettingsStyles(target, {
		...TEST_SETTINGS,
		toolbarPosition: "hidden",
	});

	assert.equal(target.classes.has("lite-tabs-hide-toolbar"), true);
	assert.equal(target.classes.has("lite-tabs-toolbar-docked"), false);
});

test("settings styles are fully removed on cleanup", () => {
	const target = new FakeStyleTarget();
	applySettingsStyles(target, {
		...TEST_SETTINGS,
		hideNativeTabs: true,
		layoutStyle: "card",
	});
	clearSettingsStyles(target);

	assert.deepEqual([...target.classes], []);
	assert.equal(target.styles.get("--lite-tabs-card-width"), "");
	assert.equal(
		target.styles.get("--lite-tabs-active-background-strength"),
		""
	);
});

test("settings styles follow all current workspace documents", () => {
	const main = new FakeStyleTarget();
	const popout = new FakeStyleTarget();
	const styled = new Set<FakeStyleTarget>();

	syncSettingsStyleTargets(styled, new Set([main, popout]), {
		...TEST_SETTINGS,
		layoutStyle: "card",
		listGap: 4,
	});
	assert.equal(main.classes.has("lite-tabs-layout-card"), true);
	assert.equal(popout.styles.get("--lite-tabs-list-gap"), "4px");

	syncSettingsStyleTargets(styled, new Set([main]), {
		...TEST_SETTINGS,
		layoutStyle: "masonry",
	});
	assert.equal(main.classes.has("lite-tabs-layout-masonry"), true);
	assert.equal(main.classes.has("lite-tabs-layout-card"), false);
	assert.deepEqual([...popout.classes], []);
	assert.equal(popout.styles.get("--lite-tabs-list-gap"), "");
});
