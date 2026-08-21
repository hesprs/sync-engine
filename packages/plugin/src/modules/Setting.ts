import type { Context, Events, Translations } from '@';
import type { Plugin, SettingDefinitionItem } from 'obsidian';
import { PluginSettingTab } from 'obsidian';
import controlsSettings from '@/settings/controls';
import developmentSettings from '@/settings/development';
import featuresSettings from '@/settings/features';
import filterSettings from '@/settings/filter';
import headSettings from '@/settings/head';
import miscellaneousSettings from '@/settings/miscellaneous';
import type { On } from './EventBus';
import type { Translate } from './I18n';
import { setRegister } from './Registrar';

export type SettingTree = {
	(self: SettingTree): SettingDefinitionItem;
	[key: number]: SettingTree;
};
type NestedCallableTree = {
	(self: SettingTree): SettingDefinitionItem;
	[key: number]: CallableOrObjectTree;
};
export type CallableOrObjectTree = NestedCallableTree | { [key: number]: CallableOrObjectTree };
export type SettingEntry = { priority: number; apply: CallableOrObjectTree };

export default class Setting {
	private readonly cleanupCallbacks: Array<() => void> = [];
	private settingTab?: SettingTab;
	private readonly settingRegistry = new Set<SettingEntry>();

	declare readonly i18n: {
		match: string;
		matchLabelDescription: string;
		speed: string;
		speedLabelDescription: string;
	};

	constructor(
		private readonly ctx: {
			on: On<Events>;
			translate: Translate<Translations>;
			registerSetting: (entry: SettingEntry) => () => boolean;
		},
	) {
		this.cleanupCallbacks.push(
			ctx.on('moduleLoaded', this.rerenderSettingTab),
			ctx.on('moduleUnloaded', this.rerenderSettingTab),
		);
	}

	readonly start = () => {
		const { registerSetting } = this.ctx;
		registerSetting({
			apply: headSettings(this.ctx as Context, () => this.settingTab),
			priority: 0,
		});
		registerSetting({ apply: featuresSettings(this.ctx as Context), priority: 1000 });
		registerSetting({ apply: controlsSettings(this.ctx as Context), priority: 2000 });
		registerSetting({ apply: filterSettings(this.ctx as Context), priority: 3000 });
		registerSetting({ apply: miscellaneousSettings(this.ctx as Context), priority: 4000 });
		registerSetting({ apply: developmentSettings(this.ctx as Context), priority: 5000 });
	};

	private readonly matchLabel = () => ({
		text: this.ctx.translate('match'),
		tooltip: this.ctx.translate('matchLabelDescription'),
	});

	private readonly speedLabel = () => ({
		color: 'var(--color-yellow)',
		text: this.ctx.translate('speed'),
		textColor: 'var(--background-primary)',
		tooltip: this.ctx.translate('speedLabelDescription'),
	});

	private readonly addSettingTab = (plugin: Plugin) => {
		this.settingTab = new SettingTab(plugin, this.settingRegistry);
		plugin.addSettingTab(this.settingTab);
	};
	private readonly rerenderSettingTab = () => this.settingTab?.update();

	root = {
		addSettingTab: this.addSettingTab,
		matchLabel: this.matchLabel,
		registerSetting: setRegister(this.settingRegistry),
		rerenderSettingTab: this.rerenderSettingTab,
		speedLabel: this.speedLabel,
	};

	readonly dispose = () => this.cleanupCallbacks.splice(0).forEach((fn) => fn());
}

class SettingTab extends PluginSettingTab {
	constructor(
		plugin: Plugin,
		private readonly settingRegistry: Set<SettingEntry>,
	) {
		super(plugin.app, plugin);
		this.icon = 'cpu';
	}

	getSettingDefinitions() {
		this.containerEl.addClass('sync-engine-setting');
		const sorted: Record<number, CallableOrObjectTree> = {};
		for (const { priority, apply } of this.settingRegistry) sorted[priority] = apply;
		const tree = (self: SettingTree) => Object.values(self).map((node) => node(node));
		for (const patch of Object.values(sorted)) mergeSettingTree(tree as never, patch);
		return tree(tree as never);
	}
}

function toTree(node: CallableOrObjectTree): SettingTree {
	const root = (
		typeof node === 'function' ? (self: SettingTree) => node(self) : dummy()
	) as SettingTree;
	for (const k of Object.keys(node)) {
		const key = Number(k);
		root[key] = toTree(node[key]);
	}
	return root;
}

function resolveChild(
	existing: SettingTree | undefined,
	incoming: CallableOrObjectTree,
): SettingTree {
	if (!existing) return toTree(incoming);
	return typeof incoming === 'function'
		? mergeReversed(incoming, existing)
		: mergeSettingTree(existing, incoming);
}

function mergeSettingTree(a: SettingTree, b: CallableOrObjectTree): SettingTree {
	for (const k of Object.keys(b)) {
		const key = Number(k);
		a[key] = resolveChild(a[key], b[key]);
	}
	return a;
}

function mergeReversed(a: NestedCallableTree, b: SettingTree): SettingTree {
	const result = toTree(a);
	for (const k of Object.keys(b)) {
		const index = Number(k);
		result[index] = result[index] ? resolveChild(b[index], result[index]) : toTree(b[index]);
	}
	return result;
}

const dummy = () => (): SettingTree => ({ name: 'dummy' }) as never;
