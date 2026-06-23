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
	private isLoaded = false;

	async onload(): Promise<void> {
		this.isLoaded = true;
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

		this.addSettingTab(new LiteTabsSettingTab(this.app, this));

		this.app.workspace.onLayoutReady(() => {
			if (!this.isLoaded) return;
			void this.openView(false);
		});
	}

	onunload(): void {
		this.isLoaded = false;
		this.body.removeClass("lite-tabs-hide-native");
		this.body.removeClass("lite-tabs-layout-card");
		this.body.removeClass("lite-tabs-layout-list");
		this.body.removeClass("lite-tabs-layout-masonry");
		this.body.removeClass("lite-tabs-mobile-stack-bottom");
		this.body.removeClass("lite-tabs-mobile-hide-handles");
		this.body.removeClass("lite-tabs-hide-icons");
		this.body.removeClass("lite-tabs-hide-toolbar");
		this.body.removeClass("lite-tabs-active-background");
		this.body.removeClass("lite-tabs-active-border");
		this.clearStyleVariables();
	}

	async loadSettings(): Promise<void> {
		this.settings = normalizeSettings(await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	applySettings(): void {
		this.body.toggleClass(
			"lite-tabs-hide-native",
			this.settings.hideNativeTabs
		);
		this.body.toggleClass(
			"lite-tabs-layout-card",
			this.settings.layoutStyle === "card"
		);
		this.body.toggleClass(
			"lite-tabs-layout-list",
			this.settings.layoutStyle === "list"
		);
		this.body.toggleClass(
			"lite-tabs-layout-masonry",
			this.settings.layoutStyle === "masonry"
		);
		this.body.toggleClass(
			"lite-tabs-mobile-stack-bottom",
			this.settings.mobileStackBottom
		);
		this.body.toggleClass(
			"lite-tabs-mobile-hide-handles",
			!this.settings.showMobileDragHandles
		);
		this.body.toggleClass(
			"lite-tabs-hide-icons",
			!this.settings.showIcons
		);
		this.body.toggleClass(
			"lite-tabs-hide-toolbar",
			this.settings.hideToolbar
		);
		this.body.toggleClass(
			"lite-tabs-active-background",
			this.settings.activeTabBackground
		);
		this.body.toggleClass(
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
		this.body.setCssProps({
			"--lite-tabs-card-width": `${this.settings.cardWidth}px`,
			"--lite-tabs-card-height": `${this.settings.cardHeight}px`,
		});
		this.setPixelVariable(
			"--lite-tabs-card-font-size",
			this.settings.cardFontSize
		);
		this.setPixelVariable("--lite-tabs-card-gap", this.settings.cardGap);
		this.body.setCssProps({
			"--lite-tabs-active-background-strength": `${this.settings.activeTabEmphasis}%`,
		});
	}

	private setPixelVariable(name: string, value: number): void {
		this.body.setCssProps({ [name]: `${value}px` });
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
			this.body.setCssProps({ [property]: "" });
		}
	}

	async openView(
		reveal = true,
		placement: "auto" | "sidebar" | "main" = "auto"
	): Promise<void> {
		const resolvedPlacement =
			placement === "auto"
				? this.isMobile()
					? "main"
					: "sidebar"
				: placement;
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

	private getViews(): LiteTabsView[] {
		return this.app.workspace
			.getLeavesOfType(LITE_TABS_VIEW_TYPE)
			.map((leaf: WorkspaceLeaf) => leaf.view)
			.filter((view): view is LiteTabsView => view instanceof LiteTabsView);
	}

	private get body(): HTMLElement {
		return activeDocument.body;
	}

	private isMobile(): boolean {
		return this.body.hasClass("is-mobile");
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
