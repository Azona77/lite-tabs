import { setIcon, type App, type WorkspaceLeaf } from "obsidian";
import { getFocusPathDiff } from "./focus-logic";
import {
	getMostRecentMainLeaf,
	getWorkspaceFocusProjection,
	isMainWorkspaceLeaf,
	type WorkspaceFocusProjection,
} from "./workspace-adapter";

const BODY_CLASS = "lite-tabs-single-pane";
const PATH_CLASS = "lite-tabs-focus-path";
const TARGET_CLASS = "lite-tabs-focus-target";
const RIGHT_TOGGLE_SELECTOR = ".sidebar-toggle-button.mod-right";
const RIGHT_TOGGLE_PROXY_CLASS = "lite-tabs-sidebar-toggle-proxy";
const TOP_RIGHT_SPACE_CLASS = "mod-top-right-space";

export class WorkspaceFocusController {
	private enabled = false;
	private frame: number | null = null;
	private lastMainLeaf: WorkspaceLeaf | null = null;
	private projection: WorkspaceFocusProjection | null = null;
	private markedPath = new Set<HTMLElement>();
	private rightSidebarToggleProxy: HTMLElement | null = null;
	private topRightSpaceTarget: HTMLElement | null = null;
	private addedTopRightSpace = false;

	constructor(
		private app: App,
		private excludedViewType: string
	) {}

	setEnabled(enabled: boolean): void {
		if (this.enabled === enabled) {
			if (enabled) this.scheduleReconcile();
			return;
		}
		this.enabled = enabled;
		if (enabled) {
			this.scheduleReconcile();
		} else {
			this.cancelScheduledFrame();
			this.clearProjection();
		}
	}

	handleActiveLeafChange(leaf: WorkspaceLeaf | null): void {
		if (leaf && isMainWorkspaceLeaf(this.app, leaf, this.excludedViewType)) {
			this.lastMainLeaf = leaf;
		}
		if (this.enabled) this.scheduleReconcile();
	}

	handleLayoutChange(): void {
		if (this.enabled) this.scheduleReconcile();
	}

	dispose(): void {
		this.enabled = false;
		this.cancelScheduledFrame();
		this.clearProjection();
		this.lastMainLeaf = null;
	}

	private scheduleReconcile(): void {
		if (this.frame !== null) return;
		this.frame = this.getWorkspaceWindow().requestAnimationFrame(() => {
			this.frame = null;
			this.reconcile();
		});
	}

	private reconcile(): void {
		if (!this.enabled) return;
		let target = this.lastMainLeaf;
		let next = target
			? getWorkspaceFocusProjection(
					this.app,
					target,
					this.excludedViewType
				)
			: null;
		if (!next) {
			target = getMostRecentMainLeaf(this.app, this.excludedViewType);
			this.lastMainLeaf = target;
			next = target
				? getWorkspaceFocusProjection(
						this.app,
						target,
						this.excludedViewType
					)
				: null;
		}
		if (!next) {
			this.clearProjection();
			return;
		}
		this.applyProjection(next);
	}

	private applyProjection(next: WorkspaceFocusProjection): void {
		const nextPath = new Set(next.pathEls);
		const pathDiff = getFocusPathDiff(this.markedPath, nextPath);
		const sameTarget = this.projection?.groupEl === next.groupEl;
		const sameDocument = this.projection?.document === next.document;
		if (
			sameTarget &&
			sameDocument &&
			pathDiff.add.length === 0 &&
			pathDiff.remove.length === 0 &&
			next.document.body.classList.contains(BODY_CLASS)
		) {
			this.syncRightSidebarToggle(next);
			return;
		}

		if (!sameDocument && this.projection) {
			this.clearProjection();
		}
		for (const el of pathDiff.add) el.classList.add(PATH_CLASS);
		next.groupEl.classList.add(TARGET_CLASS);
		next.document.body.classList.add(BODY_CLASS);

		if (this.projection && this.projection.groupEl !== next.groupEl) {
			this.projection.groupEl.classList.remove(TARGET_CLASS);
		}
		for (const el of pathDiff.remove) el.classList.remove(PATH_CLASS);
		this.projection = next;
		this.markedPath = nextPath;
		this.syncRightSidebarToggle(next);
	}

	private clearProjection(): void {
		this.clearRightSidebarToggle();
		this.projection?.document.body.classList.remove(BODY_CLASS);
		this.projection?.groupEl.classList.remove(TARGET_CLASS);
		for (const el of this.markedPath) el.classList.remove(PATH_CLASS);
		this.projection = null;
		this.markedPath.clear();
	}

	private cancelScheduledFrame(): void {
		if (this.frame === null) return;
		this.getWorkspaceWindow().cancelAnimationFrame(this.frame);
		this.frame = null;
	}

	private getWorkspaceWindow(): Window {
		return this.app.workspace.containerEl.win;
	}

	private syncRightSidebarToggle(next: WorkspaceFocusProjection): void {
		const hasNativeToggle = Array.from(
			next.headerEl.querySelectorAll<HTMLElement>(RIGHT_TOGGLE_SELECTOR)
		).some(
			(toggle) =>
				!toggle.classList.contains(RIGHT_TOGGLE_PROXY_CLASS)
		);
		if (hasNativeToggle) {
			this.clearRightSidebarToggle(
				this.topRightSpaceTarget === next.groupEl
			);
			return;
		}
		if (
			this.rightSidebarToggleProxy &&
			!this.rightSidebarToggleProxy.isConnected
		) {
			this.clearRightSidebarToggle();
		}
		if (
			this.rightSidebarToggleProxy?.parentElement === next.headerEl &&
			this.topRightSpaceTarget === next.groupEl
		) {
			this.ensureTopRightSpace(next.groupEl);
			return;
		}

		this.clearTopRightSpace();
		const proxy =
			this.rightSidebarToggleProxy ??
			this.createRightSidebarToggle(next.document);
		if (proxy.parentElement !== next.headerEl) {
			next.headerEl.appendChild(proxy);
		}
		this.ensureTopRightSpace(next.groupEl);
	}

	private createRightSidebarToggle(document: Document): HTMLElement {
		const proxy = document.createElement("div");
		proxy.classList.add("sidebar-toggle-button");
		proxy.classList.add("mod-right");
		proxy.classList.add(RIGHT_TOGGLE_PROXY_CLASS);
		proxy.setAttribute("aria-label", "Toggle right sidebar");
		proxy.setAttribute("role", "button");
		proxy.setAttribute("tabindex", "0");
		proxy.setAttribute("title", "Toggle right sidebar");
		const button = document.createElement("div");
		button.classList.add("clickable-icon");
		setIcon(button, "sidebar-toggle-button-icon");
		proxy.addEventListener("click", () => {
			this.app.workspace.rightSplit.toggle();
		});
		proxy.addEventListener("keydown", (event) => {
			if (event.key !== "Enter" && event.key !== " ") return;
			event.preventDefault();
			this.app.workspace.rightSplit.toggle();
		});
		proxy.appendChild(button);
		this.rightSidebarToggleProxy = proxy;
		return proxy;
	}

	private ensureTopRightSpace(groupEl: HTMLElement): void {
		if (this.topRightSpaceTarget !== groupEl) {
			this.clearTopRightSpace();
			this.topRightSpaceTarget = groupEl;
			this.addedTopRightSpace = !groupEl.classList.contains(
				TOP_RIGHT_SPACE_CLASS
			);
		}
		if (this.addedTopRightSpace) {
			groupEl.classList.add(TOP_RIGHT_SPACE_CLASS);
		}
	}

	private clearTopRightSpace(preserve = false): void {
		if (this.addedTopRightSpace && !preserve) {
			this.topRightSpaceTarget?.classList.remove(TOP_RIGHT_SPACE_CLASS);
		}
		this.topRightSpaceTarget = null;
		this.addedTopRightSpace = false;
	}

	private clearRightSidebarToggle(preserveTopRightSpace = false): void {
		this.rightSidebarToggleProxy?.remove();
		this.rightSidebarToggleProxy = null;
		this.clearTopRightSpace(preserveTopRightSpace);
	}
}
