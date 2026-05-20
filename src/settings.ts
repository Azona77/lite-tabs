import { App, PluginSettingTab, Setting } from "obsidian";
import OnlyTabsPlugin from "./main";

export interface OnlyTabsSettings {
	hideNativeTabs: boolean;
	layoutStyle: "list" | "card";
}

export const DEFAULT_SETTINGS: OnlyTabsSettings = {
	hideNativeTabs: true,
	layoutStyle: "list",
};

export class OnlyTabsSettingTab extends PluginSettingTab {
	private plugin: OnlyTabsPlugin;

	constructor(app: App, plugin: OnlyTabsPlugin) {
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
			.setDesc("Choose how tabs are presented in the Only Tabs panel.")
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
	}
}
