import { Plugin, WorkspaceLeaf, addIcon } from "obsidian";
import { OnlyTabsView } from "./OnlyTabsView";
import { DEFAULT_SETTINGS, OnlyTabsSettingTab, OnlyTabsSettings } from "./settings";
import { ONLY_TABS_VIEW_TYPE } from "./tabs";

const ONLY_TABS_ICON = `
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
	<rect x="16" y="18" width="68" height="12" rx="4" fill="currentColor"/>
	<rect x="16" y="44" width="68" height="12" rx="4" fill="currentColor"/>
	<rect x="16" y="70" width="68" height="12" rx="4" fill="currentColor"/>
</svg>`;

export default class OnlyTabsPlugin extends Plugin {
	settings: OnlyTabsSettings = DEFAULT_SETTINGS;

	async onload(): Promise<void> {
		addIcon("only-tabs", ONLY_TABS_ICON);
		await this.loadSettings();
		this.applySettings();

		this.registerView(
			ONLY_TABS_VIEW_TYPE,
			(leaf) => new OnlyTabsView(leaf, this)
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
			id: "open-only-tabs",
			name: "Open Only Tabs",
			callback: () => this.openView(),
		});

		this.addSettingTab(new OnlyTabsSettingTab(this.app, this));

		this.app.workspace.onLayoutReady(() => {
			this.openView();
		});
	}

	onunload(): void {
		document.body.removeClass("only-tabs-hide-native");
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
			"only-tabs-hide-native",
			this.settings.hideNativeTabs
		);
	}

	async openView(): Promise<void> {
		const existing = this.app.workspace.getLeavesOfType(
			ONLY_TABS_VIEW_TYPE
		)[0];
		const leaf = existing ?? this.app.workspace.getLeftLeaf(false);
		await leaf.setViewState({ type: ONLY_TABS_VIEW_TYPE, active: true });
		this.app.workspace.revealLeaf(leaf);
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

	private getViews(): OnlyTabsView[] {
		return this.app.workspace
			.getLeavesOfType(ONLY_TABS_VIEW_TYPE)
			.map((leaf: WorkspaceLeaf) => leaf.view)
			.filter((view): view is OnlyTabsView => view instanceof OnlyTabsView);
	}
}
