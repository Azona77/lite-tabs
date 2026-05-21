import { ItemView, WorkspaceLeaf } from "obsidian";
import JustTabsPlugin from "./main";
import { JUST_TABS_VIEW_TYPE } from "./tabs";
import { TabController } from "./TabController";

export class JustTabsView extends ItemView {
	private controller: TabController | null = null;
	private plugin: JustTabsPlugin;

	constructor(leaf: WorkspaceLeaf, plugin: JustTabsPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.navigation = false;
		this.icon = "panel-left";
	}

	getViewType(): string {
		return JUST_TABS_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Just Tabs";
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

	scheduleRefresh(): void {
		this.controller?.scheduleRefresh();
	}

	syncActive(): void {
		this.controller?.syncActive();
	}
}
