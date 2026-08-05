import { Plugin, WorkspaceLeaf, addIcon } from "obsidian";
import { LiteTabsView } from "./LiteTabsView";
import {
	DEFAULT_SETTINGS,
	LiteTabsSettingTab,
	LiteTabsSettings,
	normalizeSettings,
} from "./settings";
import {
	applySettingsStyles,
	clearSettingsStyles,
	syncSettingsStyleTargets,
} from "./settings-style";
import { LITE_TABS_VIEW_TYPE, collectTabs } from "./tabs";
import { WorkspaceFocusController } from "./WorkspaceFocusController";

const LITE_TABS_ICON = `
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
	<rect x="16" y="18" width="68" height="12" rx="4" fill="currentColor"/>
	<rect x="16" y="44" width="68" height="12" rx="4" fill="currentColor"/>
	<rect x="16" y="70" width="68" height="12" rx="4" fill="currentColor"/>
</svg>`;

const LITE_TABS_SORT_NAME_ICON = `
<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
	<path d="M4 19L8.2 5h1.6L14 19h-1.8l-.9-3.2H6.7L5.8 19H4zM7.2 14h3.6L9 7.6 7.2 14z" fill="currentColor"/>
	<path d="M16 19h5v-1.5h-2.8L21 13.2V12h-4.8v1.5h2.6L16 17.8V19z" fill="currentColor"/>
</svg>`;

export default class LiteTabsPlugin extends Plugin {
	settings: LiteTabsSettings = DEFAULT_SETTINGS;
	private isLoaded = false;
	private styledBodies = new Set<HTMLElement>();
	private workspaceFocus: WorkspaceFocusController | null = null;
	private settingTab: LiteTabsSettingTab | null = null;

	async onload(): Promise<void> {
		this.isLoaded = true;
		addIcon("lite-tabs", LITE_TABS_ICON);
		addIcon("lite-tabs-sort-name", LITE_TABS_SORT_NAME_ICON);
		await this.loadSettings();
		this.workspaceFocus = new WorkspaceFocusController(
			this.app,
			LITE_TABS_VIEW_TYPE
		);
		this.applySettings();

		this.registerView(
			LITE_TABS_VIEW_TYPE,
			(leaf) => new LiteTabsView(leaf, this)
		);

		this.registerEvent(
			this.app.workspace.on("layout-change", () => {
				this.refreshViews();
				this.workspaceFocus?.handleLayoutChange();
			})
		);
		this.registerEvent(
			this.app.workspace.on("window-open", (_workspaceWindow, window) => {
				this.applySettingsToBody(window.document.body);
			})
		);
		this.registerEvent(
			this.app.workspace.on("window-close", (_workspaceWindow, window) => {
				const body = window.document.body;
				clearSettingsStyles(body);
				this.styledBodies.delete(body);
			})
		);
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", (leaf) => {
				this.syncActiveViews();
				this.workspaceFocus?.handleActiveLeafChange(leaf);
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
		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				if (this.shouldRefreshForModifiedFile(file.path)) {
					this.refreshViews();
				}
			})
		);

		this.addCommand({
			id: "open",
			name: "Open",
			callback: () => {
				void this.openView();
			},
		});
		this.addCommand({
			id: "open-main-tab",
			name: "Open in main workspace tab",
			callback: () => {
				void this.openView(true, "main");
			},
		});
		this.addCommand({
			id: "focus-search",
			name: "Focus search",
			callback: () => {
				void this.focusSearch();
			},
		});
		this.addCommand({
			id: "refresh-panel",
			name: "Refresh panel",
			callback: () => this.refreshViews(true),
		});
		this.addCommand({
			id: "toggle-single-pane-mode",
			name: "Toggle single-pane mode",
			callback: () => {
				void this.setSinglePaneMode(!this.settings.singlePaneMode);
			},
		});

		this.settingTab = new LiteTabsSettingTab(this.app, this);
		this.addSettingTab(this.settingTab);

		this.app.workspace.onLayoutReady(() => {
			if (!this.isLoaded) return;
			this.applySettings();
			void this.openView(false);
		});
	}

	onunload(): void {
		this.isLoaded = false;
		this.workspaceFocus?.dispose();
		this.workspaceFocus = null;
		this.settingTab = null;
		for (const body of this.styledBodies) {
			clearSettingsStyles(body);
		}
		this.styledBodies.clear();
	}

	async loadSettings(): Promise<void> {
		this.settings = normalizeSettings(await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	async saveSettingsAndRefreshSettingTab(): Promise<void> {
		await this.saveSettings();
		this.settingTab?.refreshFromSettings();
	}

	applySettings(): void {
		const currentBodies = this.getWorkspaceBodies();
		syncSettingsStyleTargets(
			this.styledBodies,
			currentBodies,
			this.settings
		);
		this.workspaceFocus?.setEnabled(this.settings.singlePaneMode);
	}

	async setSinglePaneMode(enabled: boolean): Promise<void> {
		if (this.settings.singlePaneMode === enabled) return;
		this.settings.singlePaneMode = enabled;
		this.applySettings();
		await this.saveSettingsAndRefreshSettingTab();
	}

	private applySettingsToBody(body: HTMLElement): void {
		applySettingsStyles(body, this.settings);
		this.styledBodies.add(body);
	}

	private getWorkspaceBodies(): Set<HTMLElement> {
		const bodies = new Set<HTMLElement>([
			this.app.workspace.containerEl.doc.body,
		]);
		this.app.workspace.iterateAllLeaves((leaf) => {
			bodies.add(leaf.view.containerEl.doc.body);
		});
		return bodies;
	}

	async openView(
		reveal = true,
		placement: "auto" | "sidebar" | "main" = "auto"
	): Promise<void> {
		const resolvedPlacement =
			placement === "auto" ? "sidebar" : placement;
		const leaf =
			this.getExistingViewLeaf(resolvedPlacement) ??
			this.createViewLeaf(resolvedPlacement);
		if (!leaf) return;
		await leaf.setViewState({ type: LITE_TABS_VIEW_TYPE, active: true });
		if (reveal) this.app.workspace.setActiveLeaf(leaf, { focus: true });
	}

	async focusSearch(): Promise<void> {
		await this.openView(true);
		this.getViews()[0]?.focusSearch();
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

	private shouldRefreshForModifiedFile(path: string): boolean {
		if (this.settings.displayOrder !== "modified") return false;
		return collectTabs(this.app).some((item) => item.path === path);
	}

	private getViews(): LiteTabsView[] {
		return this.app.workspace
			.getLeavesOfType(LITE_TABS_VIEW_TYPE)
			.map((leaf: WorkspaceLeaf) => leaf.view)
			.filter((view): view is LiteTabsView => view instanceof LiteTabsView);
	}

	private getExistingViewLeaf(
		placement: "sidebar" | "main"
	): WorkspaceLeaf | null {
		const leaves = this.app.workspace.getLeavesOfType(LITE_TABS_VIEW_TYPE);
		if (placement === "main") {
			return (
				leaves.find((leaf) => leaf.getRoot() === this.app.workspace.rootSplit) ??
				null
			);
		}
		return (
			leaves.find((leaf) => leaf.getRoot() !== this.app.workspace.rootSplit) ??
			null
		);
	}

	private createViewLeaf(placement: "sidebar" | "main"): WorkspaceLeaf | null {
		if (placement === "main") {
			return this.app.workspace.getLeaf("tab");
		}
		return this.app.workspace.getLeftLeaf(false);
	}
}
