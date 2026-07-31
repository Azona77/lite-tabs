import {
	App,
	PluginSettingTab,
	Setting,
	TextComponent,
	setIcon,
	type SettingDefinition,
	type SettingDefinitionItem,
} from "obsidian";
import type LiteTabsPlugin from "./main";

export type LiteTabsLayoutStyle = "list" | "card" | "masonry";
export type LiteTabsDisplayOrder = "workspace" | "name" | "modified";
type LiteTabsToolbarPosition = "floating" | "docked-top";

export interface LiteTabsSettings {
	hideNativeTabs: boolean;
	hideToolbar: boolean;
	toolbarPosition: LiteTabsToolbarPosition;
	layoutStyle: LiteTabsLayoutStyle;
	displayOrder: LiteTabsDisplayOrder;
	displayOrderReversed: boolean;
	mobileStackBottom: boolean;
	showMobileDragHandles: boolean;
	showIcons: boolean;
	separatorThickness: number;
	separatorMarginY: number;
	separatorMarginX: number;
	listItemHeight: number;
	listGap: number;
	listFontSize: number;
	cardWidth: number;
	cardHeight: number;
	cardFontSize: number;
	cardGap: number;
	activeTabEmphasis: number;
	activeTabBackground: boolean;
	activeTabBorder: boolean;
}

export const DEFAULT_SETTINGS: LiteTabsSettings = {
	hideNativeTabs: false,
	hideToolbar: false,
	toolbarPosition: "floating",
	layoutStyle: "list",
	displayOrder: "workspace",
	displayOrderReversed: false,
	mobileStackBottom: true,
	showMobileDragHandles: true,
	showIcons: true,
	separatorThickness: 2,
	separatorMarginY: 7,
	separatorMarginX: 8,
	listItemHeight: 30,
	listGap: 1,
	listFontSize: 13,
	cardWidth: 120,
	cardHeight: 56,
	cardFontSize: 13,
	cardGap: 6,
	activeTabEmphasis: 18,
	activeTabBackground: true,
	activeTabBorder: true,
};

type SettingsRecord = Partial<Record<keyof LiteTabsSettings, unknown>>;

type NumericSettingKey = {
	[K in keyof LiteTabsSettings]: LiteTabsSettings[K] extends number
		? K
		: never;
}[keyof LiteTabsSettings];

type ToggleSettingKey = {
	[K in keyof LiteTabsSettings]: LiteTabsSettings[K] extends boolean
		? K
		: never;
}[keyof LiteTabsSettings];

type DropdownSettingKey =
	| "layoutStyle"
	| "displayOrder"
	| "toolbarPosition";

interface SettingSpecBase<K extends keyof LiteTabsSettings> {
	key: K;
	name: string;
	description: string;
	aliases?: string[];
}

interface ToggleSettingSpec extends SettingSpecBase<ToggleSettingKey> {
	type: "toggle";
}

interface DropdownSettingSpec extends SettingSpecBase<DropdownSettingKey> {
	type: "dropdown";
	options: Record<string, string>;
}

interface NumberSettingSpec extends SettingSpecBase<NumericSettingKey> {
	type: "number";
	recommendedMin: number;
	recommendedMax: number;
	step: number;
	refreshLayout?: boolean;
}

type SettingSpec =
	| ToggleSettingSpec
	| DropdownSettingSpec
	| NumberSettingSpec;

interface SettingSectionSpec {
	name: string;
	icon: string;
	items: SettingSpec[];
}

const SETTING_SECTIONS: SettingSectionSpec[] = [
	{
		name: "Tabs and layout",
		icon: "layout-grid",
		items: [
			{
				type: "toggle",
				key: "hideNativeTabs",
				name: "Hide inactive tabs",
				description:
					"Hide inactive native tab headers while keeping the active tab and native controls available.",
				aliases: ["native tabs", "tab headers"],
			},
			{
				type: "dropdown",
				key: "layoutStyle",
				name: "Layout style",
				description:
					"Choose how tabs are presented in the Lite Tabs panel.",
				aliases: ["list", "card", "masonry"],
				options: {
					list: "List",
					card: "Card",
					masonry: "Masonry",
				},
			},
			{
				type: "dropdown",
				key: "displayOrder",
				name: "Display order",
				description:
					"Choose how tabs are ordered in the Lite Tabs panel. Workspace order keeps native drag sorting.",
				aliases: ["sort", "workspace", "name", "modified"],
				options: {
					workspace: "Workspace",
					name: "Name",
					modified: "Recently modified",
				},
			},
			{
				type: "toggle",
				key: "displayOrderReversed",
				name: "Reverse display order",
				description:
					"Show the selected display order in reverse. Workspace reverse is display-only and disables drag sorting.",
				aliases: ["reverse sort", "descending"],
			},
		],
	},
	{
		name: "Mobile",
		icon: "smartphone",
		items: [
			{
				type: "toggle",
				key: "mobileStackBottom",
				name: "Stack mobile tabs at bottom",
				description:
					"Mobile only. Align the Lite Tabs list, card, and masonry views to the bottom of the panel.",
				aliases: ["phone", "bottom stack"],
			},
			{
				type: "toggle",
				key: "showMobileDragHandles",
				name: "Show mobile drag handles",
				description:
					"Mobile only. Show drag handles for touch sorting. Hide them for a cleaner scrolling surface.",
				aliases: ["touch sorting", "drag handle"],
			},
		],
	},
	{
		name: "Panel and toolbar",
		icon: "panel-left",
		items: [
			{
				type: "toggle",
				key: "showIcons",
				name: "Show file icons",
				description: "Show the icon before each tab title.",
				aliases: ["file icon", "tab icon"],
			},
			{
				type: "dropdown",
				key: "toolbarPosition",
				name: "Toolbar position",
				description:
					"Float the compact toolbar at the panel edge or dock it above the tab list.",
				aliases: ["floating", "docked", "dock top"],
				options: {
					floating: "Floating",
					"docked-top": "Docked at top",
				},
			},
			{
				type: "toggle",
				key: "hideToolbar",
				name: "Hide toolbar",
				description:
					"Hide the toolbar. Focus search reveals it temporarily.",
				aliases: ["toolbar visibility", "search toolbar"],
			},
		],
	},
	{
		name: "Separators",
		icon: "minus",
		items: [
			{
				type: "number",
				key: "separatorThickness",
				name: "Separator thickness",
				description: "Group separator thickness in pixels.",
				recommendedMin: 1,
				recommendedMax: 8,
				step: 1,
			},
			{
				type: "number",
				key: "separatorMarginY",
				name: "Separator vertical margin",
				description:
					"Vertical spacing around group separators in pixels.",
				recommendedMin: 0,
				recommendedMax: 24,
				step: 1,
			},
			{
				type: "number",
				key: "separatorMarginX",
				name: "Separator horizontal margin",
				description:
					"Horizontal inset for group separators in pixels.",
				recommendedMin: 0,
				recommendedMax: 32,
				step: 1,
			},
		],
	},
	{
		name: "List",
		icon: "list",
		items: [
			{
				type: "number",
				key: "listItemHeight",
				name: "List item height",
				description: "Minimum row height in list view.",
				recommendedMin: 22,
				recommendedMax: 56,
				step: 1,
			},
			{
				type: "number",
				key: "listGap",
				name: "List gap",
				description: "Gap between rows in list view.",
				recommendedMin: 0,
				recommendedMax: 12,
				step: 1,
			},
			{
				type: "number",
				key: "listFontSize",
				name: "List font size",
				description: "Title font size in list view.",
				recommendedMin: 10,
				recommendedMax: 18,
				step: 1,
			},
		],
	},
	{
		name: "Cards and masonry",
		icon: "layout-dashboard",
		items: [
			{
				type: "number",
				key: "cardWidth",
				name: "Card width",
				description: "Minimum card width in pixels.",
				recommendedMin: 120,
				recommendedMax: 320,
				step: 10,
				refreshLayout: true,
			},
			{
				type: "number",
				key: "cardHeight",
				name: "Card height",
				description:
					"Fixed card height in pixels. Overflowing title text is hidden.",
				recommendedMin: 40,
				recommendedMax: 120,
				step: 2,
			},
			{
				type: "number",
				key: "cardFontSize",
				name: "Card font size",
				description:
					"Title font size in card and masonry views.",
				recommendedMin: 10,
				recommendedMax: 20,
				step: 1,
				refreshLayout: true,
			},
			{
				type: "number",
				key: "cardGap",
				name: "Card gap",
				description: "Gap between cards in card view.",
				recommendedMin: 0,
				recommendedMax: 16,
				step: 1,
				refreshLayout: true,
			},
		],
	},
	{
		name: "Active tab",
		icon: "circle-dot",
		items: [
			{
				type: "number",
				key: "activeTabEmphasis",
				name: "Active tab emphasis",
				description: "Accent strength for the active tab background.",
				recommendedMin: 0,
				recommendedMax: 45,
				step: 1,
			},
			{
				type: "toggle",
				key: "activeTabBackground",
				name: "Active tab background",
				description: "Use a subtle accent background on the active tab.",
				aliases: ["highlight", "accent background"],
			},
			{
				type: "toggle",
				key: "activeTabBorder",
				name: "Active tab border",
				description: "Use an accent border on the active tab.",
				aliases: ["highlight", "accent border"],
			},
		],
	},
];

const APPLY_SETTINGS_KEYS = new Set<keyof LiteTabsSettings>([
	"hideNativeTabs",
	"hideToolbar",
	"toolbarPosition",
	"layoutStyle",
	"mobileStackBottom",
	"showMobileDragHandles",
	"showIcons",
	"separatorThickness",
	"separatorMarginY",
	"separatorMarginX",
	"listItemHeight",
	"listGap",
	"listFontSize",
	"cardWidth",
	"cardHeight",
	"cardFontSize",
	"cardGap",
	"activeTabEmphasis",
	"activeTabBackground",
	"activeTabBorder",
]);

const REFRESH_VIEW_KEYS = new Set<keyof LiteTabsSettings>([
	"layoutStyle",
	"displayOrder",
	"displayOrderReversed",
	"showMobileDragHandles",
	"showIcons",
]);

function isSettingsRecord(value: unknown): value is SettingsRecord {
	return typeof value === "object" && value !== null;
}

function readBoolean(
	source: SettingsRecord,
	key: keyof LiteTabsSettings,
	fallback: boolean
): boolean {
	return typeof source[key] === "boolean" ? source[key] : fallback;
}

function readNumber(
	source: SettingsRecord,
	key: NumericSettingKey,
	fallback: number
): number {
	const value = source[key];
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return fallback;
	}
	return value;
}

function readLayoutStyle(source: SettingsRecord): LiteTabsLayoutStyle {
	return source.layoutStyle === "card" ||
		source.layoutStyle === "list" ||
		source.layoutStyle === "masonry"
		? source.layoutStyle
		: DEFAULT_SETTINGS.layoutStyle;
}

function readDisplayOrder(source: SettingsRecord): LiteTabsDisplayOrder {
	return source.displayOrder === "name" ||
		source.displayOrder === "modified" ||
		source.displayOrder === "workspace"
		? source.displayOrder
		: DEFAULT_SETTINGS.displayOrder;
}

function readToolbarPosition(source: SettingsRecord): LiteTabsToolbarPosition {
	return source.toolbarPosition === "docked-top" ||
		source.toolbarPosition === "floating"
		? source.toolbarPosition
		: DEFAULT_SETTINGS.toolbarPosition;
}

export function normalizeSettings(data: unknown): LiteTabsSettings {
	const source = isSettingsRecord(data) ? data : {};
	return {
		hideNativeTabs: readBoolean(
			source,
			"hideNativeTabs",
			DEFAULT_SETTINGS.hideNativeTabs
		),
		hideToolbar: readBoolean(
			source,
			"hideToolbar",
			DEFAULT_SETTINGS.hideToolbar
		),
		toolbarPosition: readToolbarPosition(source),
		layoutStyle: readLayoutStyle(source),
		displayOrder: readDisplayOrder(source),
		displayOrderReversed: readBoolean(
			source,
			"displayOrderReversed",
			DEFAULT_SETTINGS.displayOrderReversed
		),
		mobileStackBottom: readBoolean(
			source,
			"mobileStackBottom",
			DEFAULT_SETTINGS.mobileStackBottom
		),
		showMobileDragHandles: readBoolean(
			source,
			"showMobileDragHandles",
			DEFAULT_SETTINGS.showMobileDragHandles
		),
		showIcons: readBoolean(source, "showIcons", DEFAULT_SETTINGS.showIcons),
		separatorThickness: readNumber(
			source,
			"separatorThickness",
			DEFAULT_SETTINGS.separatorThickness
		),
		separatorMarginY: readNumber(
			source,
			"separatorMarginY",
			DEFAULT_SETTINGS.separatorMarginY
		),
		separatorMarginX: readNumber(
			source,
			"separatorMarginX",
			DEFAULT_SETTINGS.separatorMarginX
		),
		listItemHeight: readNumber(
			source,
			"listItemHeight",
			DEFAULT_SETTINGS.listItemHeight
		),
		listGap: readNumber(source, "listGap", DEFAULT_SETTINGS.listGap),
		listFontSize: readNumber(
			source,
			"listFontSize",
			DEFAULT_SETTINGS.listFontSize
		),
		cardWidth: readNumber(source, "cardWidth", DEFAULT_SETTINGS.cardWidth),
		cardHeight: readNumber(source, "cardHeight", DEFAULT_SETTINGS.cardHeight),
		cardFontSize: readNumber(
			source,
			"cardFontSize",
			DEFAULT_SETTINGS.cardFontSize
		),
		cardGap: readNumber(source, "cardGap", DEFAULT_SETTINGS.cardGap),
		activeTabEmphasis: readNumber(
			source,
			"activeTabEmphasis",
			DEFAULT_SETTINGS.activeTabEmphasis
		),
		activeTabBackground: readBoolean(
			source,
			"activeTabBackground",
			DEFAULT_SETTINGS.activeTabBackground
		),
		activeTabBorder: readBoolean(
			source,
			"activeTabBorder",
			DEFAULT_SETTINGS.activeTabBorder
		),
	};
}

function isLiteTabsSettingKey(key: string): key is keyof LiteTabsSettings {
	return Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, key);
}

export class LiteTabsSettingTab extends PluginSettingTab {
	private plugin: LiteTabsPlugin;

	constructor(app: App, plugin: LiteTabsPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		const items: SettingDefinition[] = [];
		for (const section of SETTING_SECTIONS) {
			items.push({
				name: section.name,
				searchable: false,
				render: (setting) => {
					this.configureSection(setting, section.name, section.icon);
				},
			});
			for (const spec of section.items) {
				items.push(this.createSettingDefinition(spec));
			}
		}

		return [
			{
				type: "group",
				cls: "lite-tabs-settings",
				items,
			},
		];
	}

	getControlValue(key: string): unknown {
		return isLiteTabsSettingKey(key)
			? this.plugin.settings[key]
			: undefined;
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		if (!isLiteTabsSettingKey(key)) return;
		const normalized = normalizeSettings({
			...this.plugin.settings,
			[key]: value,
		});
		const settingsRecord = this.plugin.settings as unknown as Record<
			string,
			unknown
		>;
		settingsRecord[key] = normalized[key];

		if (APPLY_SETTINGS_KEYS.has(key)) {
			this.plugin.applySettings();
		}
		if (REFRESH_VIEW_KEYS.has(key)) {
			this.plugin.refreshViews(true);
		}
		await this.plugin.saveSettings();
	}

	private createSettingDefinition(spec: SettingSpec): SettingDefinition {
		if (spec.type === "number") {
			return {
				name: spec.name,
				desc: spec.description,
				aliases: spec.aliases,
				render: (setting) => {
					this.configureNumberSetting(setting, spec);
				},
			};
		}
		if (spec.type === "dropdown") {
			return {
				name: spec.name,
				desc: spec.description,
				aliases: spec.aliases,
				control: {
					type: "dropdown",
					key: spec.key,
					defaultValue: DEFAULT_SETTINGS[spec.key],
					options: { ...spec.options },
				},
			};
		}
		return {
			name: spec.name,
			desc: spec.description,
			aliases: spec.aliases,
			control: {
				type: "toggle",
				key: spec.key,
				defaultValue: DEFAULT_SETTINGS[spec.key],
			},
		};
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass("lite-tabs-settings");

		for (const section of SETTING_SECTIONS) {
			this.addSection(containerEl, section.name, section.icon);
			for (const spec of section.items) {
				this.addLegacySetting(containerEl, spec);
			}
		}
	}

	private addLegacySetting(
		containerEl: HTMLElement,
		spec: SettingSpec
	): void {
		const setting = new Setting(containerEl);
		if (spec.type === "number") {
			this.configureNumberSetting(setting, spec);
			return;
		}

		setting.setName(spec.name).setDesc(spec.description);
		if (spec.type === "dropdown") {
			setting.addDropdown((dropdown) => {
				for (const [value, label] of Object.entries(spec.options)) {
					dropdown.addOption(value, label);
				}
				dropdown
					.setValue(String(this.getControlValue(spec.key)))
					.onChange((value) => {
						void this.setControlValue(spec.key, value);
					});
			});
			return;
		}

		setting.addToggle((toggle) => {
			toggle
				.setValue(Boolean(this.getControlValue(spec.key)))
				.onChange((value) => {
					void this.setControlValue(spec.key, value);
				});
		});
	}

	private addSection(
		containerEl: HTMLElement,
		name: string,
		icon: string
	): void {
		this.configureSection(new Setting(containerEl), name, icon);
	}

	private configureSection(
		section: Setting,
		name: string,
		icon: string
	): void {
		section.setHeading();
		section.settingEl.addClass("lite-tabs-settings-heading");
		setIcon(section.nameEl, icon);
		section.nameEl.createSpan({ text: name });
	}

	private configureNumberSetting(
		setting: Setting,
		spec: NumberSettingSpec
	): void {
		let textComponent: TextComponent;
		const roundToStep = (value: number) =>
			Math.round(value / spec.step) * spec.step;
		const syncRangeHint = () => {
			const value = Number(textComponent.getValue());
			const isOutsideRecommendedRange =
				Number.isFinite(value) &&
				(value < spec.recommendedMin ||
					value > spec.recommendedMax);
			const recommendedRange = `${spec.recommendedMin}-${spec.recommendedMax}`;
			const message = isOutsideRecommendedRange
				? `Outside the recommended range ${recommendedRange}. This value is still allowed.`
				: `Recommended range: ${recommendedRange}.`;
			textComponent.inputEl.toggleClass(
				"is-outside-recommended-range",
				isOutsideRecommendedRange
			);
			textComponent.inputEl.setAttr("title", message);
			textComponent.inputEl.setAttr("aria-description", message);
		};
		const commit = async (rawValue: number) => {
			if (!Number.isFinite(rawValue)) {
				textComponent.setValue(
					String(this.plugin.settings[spec.key])
				);
				syncRangeHint();
				return;
			}
			const value = roundToStep(rawValue);
			textComponent.setValue(String(value));
			syncRangeHint();
			if (this.plugin.settings[spec.key] === value) return;
			this.plugin.settings[spec.key] = value;
			this.plugin.applySettings();
			if (spec.refreshLayout) {
				this.plugin.refreshViews(true);
			}
			await this.plugin.saveSettings();
		};
		const commitFromText = () => {
			const rawValue = textComponent.getValue().trim();
			if (rawValue.length === 0) {
				textComponent.setValue(
					String(this.plugin.settings[spec.key])
				);
				syncRangeHint();
				return;
			}
			void commit(Number(rawValue));
		};

		setting
			.setName(spec.name)
			.setDesc(spec.description)
			.addText((text) => {
				textComponent = text;
				text.setValue(String(this.plugin.settings[spec.key]));
				text.inputEl.type = "number";
				text.inputEl.step = String(spec.step);
				text.inputEl.addEventListener("input", syncRangeHint);
				text.inputEl.addEventListener("blur", commitFromText);
				text.inputEl.addEventListener("keydown", (event) => {
					if (event.key !== "Enter") return;
					event.preventDefault();
					commitFromText();
				});
				syncRangeHint();
			})
			.addExtraButton((button) => {
				button
					.setIcon("rotate-ccw")
					.setTooltip("Reset to default")
					.onClick(() => {
						void commit(DEFAULT_SETTINGS[spec.key]);
					});
			});
	}
}
