import { App, PluginSettingTab, Setting } from "obsidian";
import JustTabsPlugin from "./main";

export interface JustTabsSettings {
	hideNativeTabs: boolean;
	layoutStyle: "list" | "card";
	showIcons: boolean;
	cardWidth: number;
	cardHeight: number;
}

export const DEFAULT_SETTINGS: JustTabsSettings = {
	hideNativeTabs: true,
	layoutStyle: "list",
	showIcons: true,
	cardWidth: 180,
	cardHeight: 56,
};

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
			.setName("Hide native tabs")
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
			.setName("Card width")
			.setDesc("Minimum card width in pixels.")
			.addSlider((slider) => {
				slider
					.setLimits(120, 320, 10)
					.setValue(this.plugin.settings.cardWidth)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.cardWidth = value;
						this.plugin.applySettings();
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Card height")
			.setDesc("Fixed card height in pixels. Overflowing title text is hidden.")
			.addSlider((slider) => {
				slider
					.setLimits(40, 120, 2)
					.setValue(this.plugin.settings.cardHeight)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.cardHeight = value;
						this.plugin.applySettings();
						await this.plugin.saveSettings();
					});
			});
	}
}
