import type { LiteTabsSettings } from "./settings";

export interface SettingsStyleTarget {
	toggleClass(className: string, enabled: boolean): void;
	setCssProps(properties: Record<string, string>): void;
}

export const LITE_TABS_BODY_CLASSES = [
	"lite-tabs-hide-native",
	"lite-tabs-layout-card",
	"lite-tabs-layout-list",
	"lite-tabs-layout-masonry",
	"lite-tabs-mobile-stack-bottom",
	"lite-tabs-mobile-hide-handles",
	"lite-tabs-hide-icons",
	"lite-tabs-hide-toolbar",
	"lite-tabs-toolbar-docked",
	"lite-tabs-active-background",
	"lite-tabs-active-border",
] as const;

const PIXEL_SETTINGS = [
	["--lite-tabs-separator-thickness", "separatorThickness"],
	["--lite-tabs-separator-margin-y", "separatorMarginY"],
	["--lite-tabs-separator-margin-x", "separatorMarginX"],
	["--lite-tabs-list-item-height", "listItemHeight"],
	["--lite-tabs-list-gap", "listGap"],
	["--lite-tabs-list-font-size", "listFontSize"],
	["--lite-tabs-card-width", "cardWidth"],
	["--lite-tabs-card-height", "cardHeight"],
	["--lite-tabs-card-font-size", "cardFontSize"],
	["--lite-tabs-card-gap", "cardGap"],
] as const satisfies ReadonlyArray<
	readonly [string, keyof LiteTabsSettings]
>;

export function applySettingsStyles(
	target: SettingsStyleTarget,
	settings: LiteTabsSettings
): void {
	target.toggleClass("lite-tabs-hide-native", settings.hideNativeTabs);
	target.toggleClass("lite-tabs-layout-card", settings.layoutStyle === "card");
	target.toggleClass("lite-tabs-layout-list", settings.layoutStyle === "list");
	target.toggleClass(
		"lite-tabs-layout-masonry",
		settings.layoutStyle === "masonry"
	);
	target.toggleClass(
		"lite-tabs-mobile-stack-bottom",
		settings.mobileStackBottom
	);
	target.toggleClass(
		"lite-tabs-mobile-hide-handles",
		!settings.showMobileDragHandles
	);
	target.toggleClass("lite-tabs-hide-icons", !settings.showIcons);
	target.toggleClass("lite-tabs-hide-toolbar", settings.hideToolbar);
	target.toggleClass(
		"lite-tabs-toolbar-docked",
		settings.toolbarPosition === "docked-top"
	);
	target.toggleClass(
		"lite-tabs-active-background",
		settings.activeTabBackground
	);
	target.toggleClass("lite-tabs-active-border", settings.activeTabBorder);

	for (const [property, key] of PIXEL_SETTINGS) {
		target.setCssProps({ [property]: `${settings[key]}px` });
	}
	target.setCssProps({
		"--lite-tabs-active-background-strength": `${settings.activeTabEmphasis}%`,
	});
}

export function clearSettingsStyles(target: SettingsStyleTarget): void {
	for (const className of LITE_TABS_BODY_CLASSES) {
		target.toggleClass(className, false);
	}
	for (const [property] of PIXEL_SETTINGS) {
		target.setCssProps({ [property]: "" });
	}
	target.setCssProps({ "--lite-tabs-active-background-strength": "" });
}

export function syncSettingsStyleTargets<T extends SettingsStyleTarget>(
	styledTargets: Set<T>,
	currentTargets: ReadonlySet<T>,
	settings: LiteTabsSettings
): void {
	for (const target of styledTargets) {
		if (currentTargets.has(target)) continue;
		clearSettingsStyles(target);
		styledTargets.delete(target);
	}
	for (const target of currentTargets) {
		applySettingsStyles(target, settings);
		styledTargets.add(target);
	}
}
