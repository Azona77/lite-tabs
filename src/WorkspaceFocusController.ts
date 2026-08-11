import type { App, WorkspaceLeaf } from "obsidian";
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
const RIGHT_TOGGLE_CLONE_CLASS = "lite-tabs-sidebar-toggle-clone";

export class WorkspaceFocusController {
	private enabled = false;
	private frame: number | null = null;
	private lastMainLeaf: WorkspaceLeaf | null = null;
	private projection: WorkspaceFocusProjection | null = null;
	private markedPath = new Set<HTMLElement>();
	private rightSidebarToggleClone: HTMLElement | null = null;

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
		const nativeToggle = Array.from(
			next.headerEl.querySelectorAll<HTMLElement>(RIGHT_TOGGLE_SELECTOR)
		).find(
			(button) =>
				!button.classList.contains(RIGHT_TOGGLE_CLONE_CLASS)
		);
		if (nativeToggle) {
			this.detachRightSidebarToggle();
			return;
		}

		let clone = this.rightSidebarToggleClone;
		if (!clone) {
			const source = Array.from(
				next.rootEl.querySelectorAll<HTMLElement>(RIGHT_TOGGLE_SELECTOR)
			).find(
				(button) =>
					!button.classList.contains(RIGHT_TOGGLE_CLONE_CLASS)
			);
			if (!source) return;
			clone = source.cloneNode(true) as HTMLElement;
			clone.classList.add(RIGHT_TOGGLE_CLONE_CLASS);
			clone.removeAttribute("id");
			clone.addEventListener("click", (event) => {
				event.preventDefault();
				event.stopPropagation();
				this.app.workspace.rightSplit.toggle();
			});
			this.rightSidebarToggleClone = clone;
		}
		if (clone.parentElement !== next.headerEl) {
			next.headerEl.appendChild(clone);
		}
	}

	private clearRightSidebarToggle(): void {
		this.detachRightSidebarToggle();
		this.rightSidebarToggleClone = null;
	}

	private detachRightSidebarToggle(): void {
		this.rightSidebarToggleClone?.remove();
	}
}
