import { Plugin, WorkspaceLeaf, addIcon } from "obsidian";
import { LiteTabsView } from "./LiteTabsView";
import {
	DEFAULT_SETTINGS,
	LiteTabsSettingTab,
	LiteTabsSettings,
	normalizeSettings,
} from "./settings";
import { LITE_TABS_VIEW_TYPE } from "./tabs";

const LITE_TABS_ICON = `
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
	<rect x="16" y="18" width="68" height="12" rx="4" fill="currentColor"/>
	<rect x="16" y="44" width="68" height="12" rx="4" fill="currentColor"/>
	<rect x="16" y="70" width="68" height="12" rx="4" fill="currentColor"/>
</svg>`;

export default class LiteTabsPlugin extends Plugin {
	settings: LiteTabsSettings = DEFAULT_SETTINGS;

	async onload(): Promise<void> {
		addIcon("lite-tabs", LITE_TABS_ICON);
		await this.loadSettings();
		this.applySettings();

		this.registerView(
			LITE_TABS_VIEW_TYPE,
			(leaf) => new LiteTabsView(leaf, this)
		);

		this.registerEvent(
			this.app.workspace.on("layout-change", () => {
				this.refreshViews();
			})
		);
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () => {
				this.syncActiveViews();
			})
		);
		this.registerEvent(
			this.app.workspace.on("file-open", () => {
				this.refreshViews();
			})
		);
		this.registerEvent(
			this.app.vault.on("rename", () => {
				this.refreshViews();
			})
		);

		this.addCommand({
			id: "open-lite-tabs",
			name: "Open Lite Tabs",
			callback: () => this.openView(),
		});
		this.addCommand({
			id: "refresh-lite-tabs",
			name: "Refresh Lite Tabs panel",
			callback: () => this.refreshViews(true),
		});

		this.addSettingTab(new LiteTabsSettingTab(this.app, this));

		this.app.workspace.onLayoutReady(() => {
			this.openView(false);
		});
	}

	onunload(): void {
		document.body.removeClass("lite-tabs-hide-native");
		document.body.removeClass("lite-tabs-layout-card");
		document.body.removeClass("lite-tabs-layout-list");
		document.body.removeClass("lite-tabs-hide-icons");
		document.body.removeClass("lite-tabs-hide-toolbar");
		document.body.removeClass("lite-tabs-active-background");
		document.body.removeClass("lite-tabs-active-border");
		this.clearStyleVariables();
	}

	async loadSettings(): Promise<void> {
		this.settings = normalizeSettings(await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	applySettings(): void {
		document.body.toggleClass(
			"lite-tabs-hide-native",
			this.settings.hideNativeTabs
		);
		document.body.toggleClass(
			"lite-tabs-layout-card",
			this.settings.layoutStyle === "card"
		);
		document.body.toggleClass(
			"lite-tabs-layout-list",
			this.settings.layoutStyle === "list"
		);
		document.body.toggleClass(
			"lite-tabs-hide-icons",
			!this.settings.showIcons
		);
		document.body.toggleClass(
			"lite-tabs-hide-toolbar",
			this.settings.hideToolbar
		);
		document.body.toggleClass(
			"lite-tabs-active-background",
			this.settings.activeTabBackground
		);
		document.body.toggleClass(
			"lite-tabs-active-border",
			this.settings.activeTabBorder
		);
		this.setPixelVariable(
			"--lite-tabs-separator-thickness",
			this.settings.separatorThickness
		);
		this.setPixelVariable(
			"--lite-tabs-separator-margin-y",
			this.settings.separatorMarginY
		);
		this.setPixelVariable(
			"--lite-tabs-separator-margin-x",
			this.settings.separatorMarginX
		);
		this.setPixelVariable(
			"--lite-tabs-list-item-height",
			this.settings.listItemHeight
		);
		this.setPixelVariable(
			"--lite-tabs-list-font-size",
			this.settings.listFontSize
		);
		document.body.style.setProperty(
			"--lite-tabs-card-width",
			`${this.settings.cardWidth}px`
		);
		document.body.style.setProperty(
			"--lite-tabs-card-height",
			`${this.settings.cardHeight}px`
		);
		this.setPixelVariable(
			"--lite-tabs-card-font-size",
			this.settings.cardFontSize
		);
		this.setPixelVariable("--lite-tabs-card-gap", this.settings.cardGap);
		document.body.style.setProperty(
			"--lite-tabs-active-background-strength",
			`${this.settings.activeTabEmphasis}%`
		);
	}

	private setPixelVariable(name: string, value: number): void {
		document.body.style.setProperty(name, `${value}px`);
	}

	private clearStyleVariables(): void {
		for (const property of [
			"--lite-tabs-separator-thickness",
			"--lite-tabs-separator-margin-y",
			"--lite-tabs-separator-margin-x",
			"--lite-tabs-list-item-height",
			"--lite-tabs-list-font-size",
			"--lite-tabs-card-width",
			"--lite-tabs-card-height",
			"--lite-tabs-card-font-size",
			"--lite-tabs-card-gap",
			"--lite-tabs-active-background-strength",
		]) {
			document.body.style.removeProperty(property);
		}
	}

	async openView(reveal = true): Promise<void> {
		const existing = this.app.workspace.getLeavesOfType(
			LITE_TABS_VIEW_TYPE
		)[0];
		const leaf = existing ?? this.app.workspace.getLeftLeaf(false);
		await leaf.setViewState({ type: LITE_TABS_VIEW_TYPE, active: true });
		if (reveal) {
			this.app.workspace.revealLeaf(leaf);
		}
	}

	refreshViews(force = false): void {
		for (const view of this.getViews()) {
			if (force) {
				view.forceRefresh();
			} else {
				view.scheduleRefresh();
			}
		}
	}

	syncActiveViews(): void {
		for (const view of this.getViews()) {
			view.syncActive();
		}
	}

	private getViews(): LiteTabsView[] {
		return this.app.workspace
			.getLeavesOfType(LITE_TABS_VIEW_TYPE)
			.map((leaf: WorkspaceLeaf) => leaf.view)
			.filter((view): view is LiteTabsView => view instanceof LiteTabsView);
	}
}
