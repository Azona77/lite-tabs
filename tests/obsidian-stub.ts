export class View {}

export function setIcon(parent: HTMLElement, icon: string): void {
	const svg = parent.ownerDocument.createElement("svg");
	svg.classList.add("svg-icon");
	svg.classList.add(icon);
	const inner = parent.ownerDocument.createElement("rect");
	inner.classList.add("sidebar-toggle-icon-inner");
	svg.appendChild(inner);
	parent.appendChild(svg);
}
