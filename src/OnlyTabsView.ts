import { ItemView, WorkspaceLeaf } from "obsidian";
import OnlyTabsPlugin from "./main";
import { ONLY_TABS_VIEW_TYPE } from "./tabs";
import { TabController } from "./TabController";

export class OnlyTabsView extends ItemView {
	private controller: TabController | null = null;
	private plugin: OnlyTabsPlugin;

	constructor(leaf: WorkspaceLeaf, plugin: OnlyTabsPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.navigation = false;
		this.icon = "panel-left";
	}

	getViewType(): string {
		return ONLY_TABS_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Only Tabs";
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
