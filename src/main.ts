import { Plugin, WorkspaceLeaf, addIcon } from "obsidian";
import { JustTabsView } from "./JustTabsView";
import { DEFAULT_SETTINGS, JustTabsSettingTab, JustTabsSettings } from "./settings";
import { JUST_TABS_VIEW_TYPE } from "./tabs";

const JUST_TABS_ICON = `
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
	<rect x="16" y="18" width="68" height="12" rx="4" fill="currentColor"/>
	<rect x="16" y="44" width="68" height="12" rx="4" fill="currentColor"/>
	<rect x="16" y="70" width="68" height="12" rx="4" fill="currentColor"/>
</svg>`;

export default class JustTabsPlugin extends Plugin {
	settings: JustTabsSettings = DEFAULT_SETTINGS;

	async onload(): Promise<void> {
		addIcon("just-tabs", JUST_TABS_ICON);
		await this.loadSettings();
		this.applySettings();

		this.registerView(
			JUST_TABS_VIEW_TYPE,
			(leaf) => new JustTabsView(leaf, this)
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
			id: "open-just-tabs",
			name: "Open Just Tabs",
			callback: () => this.openView(),
		});

		this.addSettingTab(new JustTabsSettingTab(this.app, this));

		this.app.workspace.onLayoutReady(() => {
			this.openView(false);
		});
	}

	onunload(): void {
		document.body.removeClass("just-tabs-hide-native");
		document.body.removeClass("just-tabs-layout-card");
		document.body.removeClass("just-tabs-layout-list");
		document.body.removeClass("just-tabs-hide-icons");
		document.body.style.removeProperty("--just-tabs-card-width");
		document.body.style.removeProperty("--just-tabs-card-height");
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	applySettings(): void {
		document.body.toggleClass(
			"just-tabs-hide-native",
			this.settings.hideNativeTabs
		);
		document.body.toggleClass(
			"just-tabs-layout-card",
			this.settings.layoutStyle === "card"
		);
		document.body.toggleClass(
			"just-tabs-layout-list",
			this.settings.layoutStyle === "list"
		);
		document.body.toggleClass(
			"just-tabs-hide-icons",
			!this.settings.showIcons
		);
		document.body.style.setProperty(
			"--just-tabs-card-width",
			`${this.settings.cardWidth}px`
		);
		document.body.style.setProperty(
			"--just-tabs-card-height",
			`${this.settings.cardHeight}px`
		);
	}

	async openView(reveal = true): Promise<void> {
		const existing = this.app.workspace.getLeavesOfType(
			JUST_TABS_VIEW_TYPE
		)[0];
		const leaf = existing ?? this.app.workspace.getLeftLeaf(false);
		await leaf.setViewState({ type: JUST_TABS_VIEW_TYPE, active: true });
		if (reveal) {
			this.app.workspace.revealLeaf(leaf);
		}
	}

	refreshViews(): void {
		for (const view of this.getViews()) {
			view.scheduleRefresh();
		}
	}

	syncActiveViews(): void {
		for (const view of this.getViews()) {
			view.syncActive();
		}
	}

	private getViews(): JustTabsView[] {
		return this.app.workspace
			.getLeavesOfType(JUST_TABS_VIEW_TYPE)
			.map((leaf: WorkspaceLeaf) => leaf.view)
			.filter((view): view is JustTabsView => view instanceof JustTabsView);
	}
}
