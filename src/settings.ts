import {
	App,
	PluginSettingTab,
	Setting,
	TextComponent,
	setIcon,
} from "obsidian";
import type LiteTabsPlugin from "./main";

export type LiteTabsLayoutStyle = "list" | "card" | "masonry";
export type LiteTabsDisplayOrder = "workspace" | "name" | "modified";
type LiteTabsToolbarPosition = "floating" | "docked-top";

export interface LiteTabsSettings {
	hideNativeTabs: boolean;
	hideToolbar: boolean;
	toolbarPosition: LiteTabsToolbarPosition;
	layoutStyle: LiteTabsLayoutStyle;
	displayOrder: LiteTabsDisplayOrder;
	displayOrderReversed: boolean;
	mobileStackBottom: boolean;
	showMobileDragHandles: boolean;
	showIcons: boolean;
	separatorThickness: number;
	separatorMarginY: number;
	separatorMarginX: number;
	listItemHeight: number;
	listGap: number;
	listFontSize: number;
	cardWidth: number;
	cardHeight: number;
	cardFontSize: number;
	cardGap: number;
	activeTabEmphasis: number;
	activeTabBackground: boolean;
	activeTabBorder: boolean;
}

export const DEFAULT_SETTINGS: LiteTabsSettings = {
	hideNativeTabs: false,
	hideToolbar: false,
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

type SettingsRecord = Partial<Record<keyof LiteTabsSettings, unknown>>;

type NumericSettingKey = {
	[K in keyof LiteTabsSettings]: LiteTabsSettings[K] extends number
		? K
		: never;
}[keyof LiteTabsSettings];

function isSettingsRecord(value: unknown): value is SettingsRecord {
	return typeof value === "object" && value !== null;
}

function readBoolean(
	source: SettingsRecord,
	key: keyof LiteTabsSettings,
	fallback: boolean
): boolean {
	return typeof source[key] === "boolean" ? source[key] : fallback;
}

function readNumber(
	source: SettingsRecord,
	key: NumericSettingKey,
	fallback: number
): number {
	const value = source[key];
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return fallback;
	}
	return value;
}

function readLayoutStyle(source: SettingsRecord): LiteTabsLayoutStyle {
	return source.layoutStyle === "card" ||
		source.layoutStyle === "list" ||
		source.layoutStyle === "masonry"
		? source.layoutStyle
		: DEFAULT_SETTINGS.layoutStyle;
}

function readDisplayOrder(source: SettingsRecord): LiteTabsDisplayOrder {
	return source.displayOrder === "name" ||
		source.displayOrder === "modified" ||
		source.displayOrder === "workspace"
		? source.displayOrder
		: DEFAULT_SETTINGS.displayOrder;
}

function readToolbarPosition(source: SettingsRecord): LiteTabsToolbarPosition {
	return source.toolbarPosition === "docked-top" ||
		source.toolbarPosition === "floating"
		? source.toolbarPosition
		: DEFAULT_SETTINGS.toolbarPosition;
}

export function normalizeSettings(data: unknown): LiteTabsSettings {
	const source = isSettingsRecord(data) ? data : {};
	return {
		hideNativeTabs: readBoolean(
			source,
			"hideNativeTabs",
			DEFAULT_SETTINGS.hideNativeTabs
		),
		hideToolbar: readBoolean(
			source,
			"hideToolbar",
			DEFAULT_SETTINGS.hideToolbar
		),
		toolbarPosition: readToolbarPosition(source),
		layoutStyle: readLayoutStyle(source),
		displayOrder: readDisplayOrder(source),
		displayOrderReversed: readBoolean(
			source,
			"displayOrderReversed",
			DEFAULT_SETTINGS.displayOrderReversed
		),
		mobileStackBottom: readBoolean(
			source,
			"mobileStackBottom",
			DEFAULT_SETTINGS.mobileStackBottom
		),
		showMobileDragHandles: readBoolean(
			source,
			"showMobileDragHandles",
			DEFAULT_SETTINGS.showMobileDragHandles
		),
		showIcons: readBoolean(source, "showIcons", DEFAULT_SETTINGS.showIcons),
		separatorThickness: readNumber(
			source,
			"separatorThickness",
			DEFAULT_SETTINGS.separatorThickness
		),
		separatorMarginY: readNumber(
			source,
			"separatorMarginY",
			DEFAULT_SETTINGS.separatorMarginY
		),
		separatorMarginX: readNumber(
			source,
			"separatorMarginX",
			DEFAULT_SETTINGS.separatorMarginX
		),
		listItemHeight: readNumber(
			source,
			"listItemHeight",
			DEFAULT_SETTINGS.listItemHeight
		),
		listGap: readNumber(source, "listGap", DEFAULT_SETTINGS.listGap),
		listFontSize: readNumber(
			source,
			"listFontSize",
			DEFAULT_SETTINGS.listFontSize
		),
		cardWidth: readNumber(source, "cardWidth", DEFAULT_SETTINGS.cardWidth),
		cardHeight: readNumber(source, "cardHeight", DEFAULT_SETTINGS.cardHeight),
		cardFontSize: readNumber(
			source,
			"cardFontSize",
			DEFAULT_SETTINGS.cardFontSize
		),
		cardGap: readNumber(source, "cardGap", DEFAULT_SETTINGS.cardGap),
		activeTabEmphasis: readNumber(
			source,
			"activeTabEmphasis",
			DEFAULT_SETTINGS.activeTabEmphasis
		),
		activeTabBackground: readBoolean(
			source,
			"activeTabBackground",
			DEFAULT_SETTINGS.activeTabBackground
		),
		activeTabBorder: readBoolean(
			source,
			"activeTabBorder",
			DEFAULT_SETTINGS.activeTabBorder
		),
	};
}

export class LiteTabsSettingTab extends PluginSettingTab {
	private plugin: LiteTabsPlugin;

	constructor(app: App, plugin: LiteTabsPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass("lite-tabs-settings");
		this.addSection(containerEl, "Tabs and layout", "layout-grid");

		new Setting(containerEl)
			.setName("Hide inactive tabs")
			.setDesc("Hide inactive native tab headers while keeping the active tab and native controls available.")
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.hideNativeTabs)
					.onChange(async (value) => {
						this.plugin.settings.hideNativeTabs = value;
						this.plugin.applySettings();
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Layout style")
			.setDesc("Choose how tabs are presented in the Lite Tabs panel.")
			.addDropdown((dropdown) => {
				dropdown
					.addOption("list", "List")
					.addOption("card", "Card")
					.addOption("masonry", "Masonry")
					.setValue(this.plugin.settings.layoutStyle)
					.onChange(async (value) => {
						this.plugin.settings.layoutStyle =
							value === "card" || value === "masonry"
								? value
								: "list";
						this.plugin.applySettings();
						this.plugin.refreshViews(true);
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Display order")
			.setDesc("Choose how tabs are ordered in the Lite Tabs panel. Workspace order keeps native drag sorting.")
			.addDropdown((dropdown) => {
				dropdown
					.addOption("workspace", "Workspace")
					.addOption("name", "Name")
					.addOption("modified", "Recently modified")
					.setValue(this.plugin.settings.displayOrder)
					.onChange(async (value) => {
						this.plugin.settings.displayOrder =
							value === "name" || value === "modified"
								? value
								: "workspace";
						this.plugin.refreshViews(true);
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Reverse display order")
			.setDesc("Show the selected display order in reverse. Workspace reverse is display-only and disables drag sorting.")
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.displayOrderReversed)
					.onChange(async (value) => {
						this.plugin.settings.displayOrderReversed = value;
						this.plugin.refreshViews(true);
						await this.plugin.saveSettings();
					});
			});

		this.addSection(containerEl, "Mobile", "smartphone");

		new Setting(containerEl)
			.setName("Stack mobile tabs at bottom")
			.setDesc("Mobile only. Align the Lite Tabs list, card, and masonry views to the bottom of the panel.")
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.mobileStackBottom)
					.onChange(async (value) => {
						this.plugin.settings.mobileStackBottom = value;
						this.plugin.applySettings();
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Show mobile drag handles")
			.setDesc("Mobile only. Show drag handles for touch sorting. Hide them for a cleaner scrolling surface.")
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.showMobileDragHandles)
					.onChange(async (value) => {
						this.plugin.settings.showMobileDragHandles = value;
						this.plugin.applySettings();
						this.plugin.refreshViews(true);
						await this.plugin.saveSettings();
					});
			});

		this.addSection(containerEl, "Panel and toolbar", "panel-left");

		new Setting(containerEl)
			.setName("Show file icons")
			.setDesc("Show the icon before each tab title.")
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.showIcons)
					.onChange(async (value) => {
						this.plugin.settings.showIcons = value;
						this.plugin.applySettings();
						this.plugin.refreshViews(true);
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Toolbar position")
			.setDesc("Float the compact toolbar at the panel edge or dock it above the tab list.")
			.addDropdown((dropdown) => {
				dropdown
					.addOption("floating", "Floating")
					.addOption("docked-top", "Docked at top")
					.setValue(this.plugin.settings.toolbarPosition)
					.onChange(async (value) => {
						this.plugin.settings.toolbarPosition =
							value === "docked-top" ? "docked-top" : "floating";
						this.plugin.applySettings();
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Hide toolbar")
			.setDesc("Hide the toolbar. Focus search reveals it temporarily.")
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.hideToolbar)
					.onChange(async (value) => {
						this.plugin.settings.hideToolbar = value;
						this.plugin.applySettings();
						await this.plugin.saveSettings();
					});
			});

		this.addSection(containerEl, "Separators", "minus");

		this.addNumberSetting(
			containerEl,
			"Separator thickness",
			"Group separator thickness in pixels.",
			"separatorThickness",
			1,
			8,
			1
		);
		this.addNumberSetting(
			containerEl,
			"Separator vertical margin",
			"Vertical spacing around group separators in pixels.",
			"separatorMarginY",
			0,
			24,
			1
		);
		this.addNumberSetting(
			containerEl,
			"Separator horizontal margin",
			"Horizontal inset for group separators in pixels.",
			"separatorMarginX",
			0,
			32,
			1
		);

		this.addSection(containerEl, "List", "list");

		this.addNumberSetting(
			containerEl,
			"List item height",
			"Minimum row height in list view.",
			"listItemHeight",
			22,
			56,
			1
		);
		this.addNumberSetting(
			containerEl,
			"List gap",
			"Gap between rows in list view.",
			"listGap",
			0,
			12,
			1
		);
		this.addNumberSetting(
			containerEl,
			"List font size",
			"Title font size in list view.",
			"listFontSize",
			10,
			18,
			1
		);
		this.addSection(
			containerEl,
			"Cards and masonry",
			"layout-dashboard"
		);

		this.addNumberSetting(
			containerEl,
			"Card width",
			"Minimum card width in pixels.",
			"cardWidth",
			120,
			320,
			10,
			true
		);
		this.addNumberSetting(
			containerEl,
			"Card height",
			"Fixed card height in pixels. Overflowing title text is hidden.",
			"cardHeight",
			40,
			120,
			2
		);
		this.addNumberSetting(
			containerEl,
			"Card font size",
			"Title font size in card and masonry views.",
			"cardFontSize",
			10,
			20,
			1,
			true
		);
		this.addNumberSetting(
			containerEl,
			"Card gap",
			"Gap between cards in card view.",
			"cardGap",
			0,
			16,
			1,
			true
		);

		this.addSection(containerEl, "Active tab", "circle-dot");

		this.addNumberSetting(
			containerEl,
			"Active tab emphasis",
			"Accent strength for the active tab background.",
			"activeTabEmphasis",
			0,
			45,
			1
		);

		new Setting(containerEl)
			.setName("Active tab background")
			.setDesc("Use a subtle accent background on the active tab.")
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.activeTabBackground)
					.onChange(async (value) => {
						this.plugin.settings.activeTabBackground = value;
						this.plugin.applySettings();
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Active tab border")
			.setDesc("Use an accent border on the active tab.")
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.activeTabBorder)
					.onChange(async (value) => {
						this.plugin.settings.activeTabBorder = value;
						this.plugin.applySettings();
						await this.plugin.saveSettings();
					});
			});
	}

	private addSection(
		containerEl: HTMLElement,
		name: string,
		icon: string
	): void {
		const section = new Setting(containerEl).setHeading();
		section.settingEl.addClass("lite-tabs-settings-heading");
		setIcon(section.nameEl, icon);
		section.nameEl.createSpan({ text: name });
	}

	private addNumberSetting(
		containerEl: HTMLElement,
		name: string,
		description: string,
		key: NumericSettingKey,
		recommendedMin: number,
		recommendedMax: number,
		step: number,
		refreshLayout = false
	): void {
		let textComponent: TextComponent;
		const roundToStep = (value: number) =>
			Math.round(value / step) * step;
		const syncRangeHint = () => {
			const value = Number(textComponent.getValue());
			const isOutsideRecommendedRange =
				Number.isFinite(value) &&
				(value < recommendedMin || value > recommendedMax);
			const recommendedRange = `${recommendedMin}–${recommendedMax}`;
			const message = isOutsideRecommendedRange
				? `Outside the recommended range ${recommendedRange}. This value is still allowed.`
				: `Recommended range: ${recommendedRange}.`;
			textComponent.inputEl.toggleClass(
				"is-outside-recommended-range",
				isOutsideRecommendedRange
			);
			textComponent.inputEl.setAttr("title", message);
			textComponent.inputEl.setAttr("aria-description", message);
		};
		const commit = async (rawValue: number) => {
			if (!Number.isFinite(rawValue)) {
				textComponent.setValue(String(this.plugin.settings[key]));
				syncRangeHint();
				return;
			}
			const value = roundToStep(rawValue);
			textComponent.setValue(String(value));
			syncRangeHint();
			if (this.plugin.settings[key] === value) return;
			this.plugin.settings[key] = value;
			this.plugin.applySettings();
			if (refreshLayout) {
				this.plugin.refreshViews(true);
			}
			await this.plugin.saveSettings();
		};
		const commitFromText = () => {
			const rawValue = textComponent.getValue().trim();
			if (rawValue.length === 0) {
				textComponent.setValue(String(this.plugin.settings[key]));
				syncRangeHint();
				return;
			}
			void commit(Number(rawValue));
		};

		new Setting(containerEl)
			.setName(name)
			.setDesc(description)
			.addText((text) => {
				textComponent = text;
				text.setValue(String(this.plugin.settings[key]));
				text.inputEl.type = "number";
				text.inputEl.step = String(step);
				text.inputEl.addEventListener("input", syncRangeHint);
				text.inputEl.addEventListener("blur", () => {
					commitFromText();
				});
				text.inputEl.addEventListener("keydown", (event) => {
					if (event.key !== "Enter") return;
					event.preventDefault();
					commitFromText();
				});
				syncRangeHint();
			})
			.addExtraButton((button) => {
				button
					.setIcon("rotate-ccw")
					.setTooltip("Reset to default")
					.onClick(() => {
						void commit(DEFAULT_SETTINGS[key]);
					});
			});
	}
}
