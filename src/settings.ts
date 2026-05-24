import {
	App,
	PluginSettingTab,
	Setting,
	SliderComponent,
	TextComponent,
} from "obsidian";
import LiteTabsPlugin from "./main";

export type LiteTabsLayoutStyle = "list" | "card" | "masonry";

export interface LiteTabsSettings {
	hideNativeTabs: boolean;
	hideToolbar: boolean;
	layoutStyle: LiteTabsLayoutStyle;
	mobileStackBottom: boolean;
	showIcons: boolean;
	separatorThickness: number;
	separatorMarginY: number;
	separatorMarginX: number;
	listItemHeight: number;
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
	layoutStyle: "list",
	mobileStackBottom: false,
	showIcons: true,
	separatorThickness: 2,
	separatorMarginY: 7,
	separatorMarginX: 8,
	listItemHeight: 30,
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

const NUMERIC_MINIMUMS: Record<NumericSettingKey, number> = {
	separatorThickness: 0,
	separatorMarginY: 0,
	separatorMarginX: 0,
	listItemHeight: 1,
	listFontSize: 1,
	cardWidth: 1,
	cardHeight: 1,
	cardFontSize: 1,
	cardGap: 0,
	activeTabEmphasis: 0,
};

const NUMERIC_MAXIMUMS: Partial<Record<NumericSettingKey, number>> = {
	activeTabEmphasis: 100,
};

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
	const minimum = NUMERIC_MINIMUMS[key];
	const maximum = NUMERIC_MAXIMUMS[key];
	const bounded = Math.max(minimum, value);
	return maximum === undefined ? bounded : Math.min(maximum, bounded);
}

function readLayoutStyle(source: SettingsRecord): LiteTabsLayoutStyle {
	return source.layoutStyle === "card" ||
		source.layoutStyle === "list" ||
		source.layoutStyle === "masonry"
		? source.layoutStyle
		: DEFAULT_SETTINGS.layoutStyle;
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
		layoutStyle: readLayoutStyle(source),
		mobileStackBottom: readBoolean(
			source,
			"mobileStackBottom",
			DEFAULT_SETTINGS.mobileStackBottom
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
			.setName("Stack mobile tabs at bottom")
			.setDesc("On mobile, align the Lite Tabs list, card, and masonry views to the bottom of the panel.")
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
			.setName("Hide toolbar")
			.setDesc("Hide the Lite Tabs panel toolbar for a more compact panel.")
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.hideToolbar)
					.onChange(async (value) => {
						this.plugin.settings.hideToolbar = value;
						this.plugin.applySettings();
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl).setName("Appearance").setHeading();

		new Setting(containerEl).setName("Separator").setHeading();

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

		new Setting(containerEl).setName("List").setHeading();

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
			"List font size",
			"Title font size in list view.",
			"listFontSize",
			10,
			18,
			1
		);
		new Setting(containerEl).setName("Card and masonry").setHeading();

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

		new Setting(containerEl).setName("Active tab").setHeading();

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

	private addNumberSetting(
		containerEl: HTMLElement,
		name: string,
		description: string,
		key: NumericSettingKey,
		min: number,
		max: number,
		step: number,
		refreshLayout = false
	): void {
		let sliderComponent: SliderComponent;
		let textComponent: TextComponent;
		const roundToStep = (value: number) => Math.round(value / step) * step;
		const clamp = (value: number) =>
			Math.min(max, Math.max(min, Math.round(value / step) * step));
		const commit = async (rawValue: number, clampToSliderRange: boolean) => {
			const value = clampToSliderRange
				? clamp(rawValue)
				: roundToStep(rawValue);
			this.plugin.settings[key] = value;
			sliderComponent.setValue(clamp(value));
			this.plugin.applySettings();
			if (refreshLayout) {
				this.plugin.refreshViews(true);
			}
			await this.plugin.saveSettings();
		};

		new Setting(containerEl)
			.setName(name)
			.setDesc(description)
			.addSlider((slider) => {
				sliderComponent = slider;
				slider
					.setLimits(min, max, step)
					.setValue(this.plugin.settings[key])
					.setDynamicTooltip()
					.onChange((value) => {
						textComponent.setValue(String(value));
						void commit(value, true);
					});
			})
			.addText((text) => {
				textComponent = text;
				text
					.setValue(String(this.plugin.settings[key]))
					.onChange(() => undefined);
				text.inputEl.type = "number";
				text.inputEl.step = String(step);
				text.inputEl.addEventListener("blur", () => {
					this.commitTextNumber(textComponent, key, step, refreshLayout);
				});
				text.inputEl.addEventListener("keydown", (event) => {
					if (event.key !== "Enter") return;
					event.preventDefault();
					this.commitTextNumber(
						textComponent,
						key,
						step,
						refreshLayout
					);
					text.inputEl.blur();
				});
			})
			.addButton((button) => {
				button
					.setButtonText("Reset")
					.setTooltip("Reset to default")
					.onClick(() => {
						textComponent.setValue(String(DEFAULT_SETTINGS[key]));
						void commit(DEFAULT_SETTINGS[key], false);
					});
			});
	}

	private commitTextNumber(
		textComponent: TextComponent,
		key: NumericSettingKey,
		step: number,
		refreshLayout: boolean
	): void {
		const numericValue = Number(textComponent.getValue());
		if (!Number.isFinite(numericValue)) {
			textComponent.setValue(String(this.plugin.settings[key]));
			return;
		}
		const value = Math.round(numericValue / step) * step;
		this.plugin.settings[key] = value;
		textComponent.setValue(String(value));
		this.plugin.applySettings();
		if (refreshLayout) {
			this.plugin.refreshViews(true);
		}
		void this.plugin.saveSettings();
	}
}
