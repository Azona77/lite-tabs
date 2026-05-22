import {
	App,
	PluginSettingTab,
	Setting,
	SliderComponent,
	TextComponent,
} from "obsidian";
import JustTabsPlugin from "./main";

export interface JustTabsSettings {
	hideNativeTabs: boolean;
	hideToolbar: boolean;
	layoutStyle: "list" | "card";
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

export const DEFAULT_SETTINGS: JustTabsSettings = {
	hideNativeTabs: false,
	hideToolbar: false,
	layoutStyle: "list",
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

type NumericSettingKey = {
	[K in keyof JustTabsSettings]: JustTabsSettings[K] extends number
		? K
		: never;
}[keyof JustTabsSettings];

export class JustTabsSettingTab extends PluginSettingTab {
	private plugin: JustTabsPlugin;

	constructor(app: App, plugin: JustTabsPlugin) {
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
			.setDesc("Choose how tabs are presented in the Just Tabs panel.")
			.addDropdown((dropdown) => {
				dropdown
					.addOption("list", "List")
					.addOption("card", "Card")
					.setValue(this.plugin.settings.layoutStyle)
					.onChange(async (value) => {
						this.plugin.settings.layoutStyle =
							value === "card" ? "card" : "list";
						this.plugin.applySettings();
						this.plugin.refreshViews(true);
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
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Hide toolbar")
			.setDesc("Hide the Just Tabs panel toolbar for a more compact panel.")
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
		new Setting(containerEl).setName("Card").setHeading();

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
			"Title font size in card view.",
			"cardFontSize",
			10,
			20,
			1
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
