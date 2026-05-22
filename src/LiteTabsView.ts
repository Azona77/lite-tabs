import { ItemView, WorkspaceLeaf } from "obsidian";
import LiteTabsPlugin from "./main";
import { LITE_TABS_VIEW_TYPE } from "./tabs";
import { TabController } from "./TabController";

export class LiteTabsView extends ItemView {
	private controller: TabController | null = null;
	private plugin: LiteTabsPlugin;

	constructor(leaf: WorkspaceLeaf, plugin: LiteTabsPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.navigation = false;
		this.icon = "panel-left";
	}

	getViewType(): string {
		return LITE_TABS_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Lite Tabs";
	}

	async onOpen(): Promise<void> {
		this.controller = new TabController(this.plugin, this.containerEl);
		this.controller.refreshStructure();
	}

	async onClose(): Promise<void> {
		this.controller?.dispose();
		this.controller = null;
	}

	refreshStructure(): void {
		this.controller?.refreshStructure();
	}

	forceRefresh(): void {
		this.controller?.forceRefresh();
	}

	scheduleRefresh(): void {
		this.controller?.scheduleRefresh();
	}

	syncActive(): void {
		this.controller?.syncActive();
	}
}
