import type { Context, Events, Translations } from '@';
import type { App, DataAdapter } from 'obsidian';
import type { Ref } from 'synthkernel';
import type { DatabaseAsync, StoreAsync, StoreOperations } from 'uni-kv';
import hash from '@repo/shared/crypto';
import { importCode } from '@repo/shared/e2e-utils.spec';
import obsidian, { Notice, requestUrl } from 'obsidian';
import { compare } from 'verkit';
import type { General } from '@/types';
import UnknownModuleModal from '@/components/UnknownModuleModal';
import sha256 from '@/utils/sha-256';
import toErrorMessage from '@/utils/to-error-message';
import untilTrue from '@/utils/until-true';
import type { Dispatch } from './EventBus';
import type { Translate } from './I18n';
import { VERSION } from './EventBus';

type WindowAugmentation = { syncEngineApiBridge?: typeof obsidian };

export type ModuleInstance = {
	moduleSettings: object;
	dispose?: () => void;
	start?: () => void;
};
export type ModuleCtor = new (ctx: object) => ModuleInstance;
type GeneralCtor = new (...args: ReadonlyArray<General>) => General;

export type ModuleMeta = {
	id: string;
	name: string;
	version: string;
	description: string;
	main: string; // Download link
	icon?: string;
	minPluginVersion?: string;
	readme?: string;
	integrity: string;
};
export type AugmentedModuleMeta = ModuleMeta & {
	enabled: boolean;
	source: string;
	icon: string;
};

const AUTO_UPDATE_DELAY = 200;
export const MODULE_EXTENSION = '.js';
export const OFFICIAL_SOURCE = 'https://sync.consensia.cc/modules.json';

export default class Extensibility {
	private readonly moduleDir: string;
	private readonly sourceCache = new Map<string, Array<unknown>>(); // URL -> content
	private readonly discoveredModules = new Map<string, AugmentedModuleMeta>();
	private readonly loadedModules = new Map<string, ModuleCtor>(); // Name -> ctor
	private readonly moduleStore: StoreAsync<AugmentedModuleMeta>;
	private autoUpdateTimeout?: number;

	declare readonly settings: {
		moduleSources: Array<string>;
		moduleAutoUpdate: boolean;
		modules: Record<string, object>;
	};
	declare readonly i18n: {
		failedToLoadModule: string;
		failedToDownloadModule: string;
		failedToFetchSource: string;
	};
	declare readonly events: {
		moduleLoaded: string;
		moduleUnloaded: string;
	};

	constructor(
		private readonly ctx: {
			app: App;
			__addModule__: Context['__addModule__'];
			__getModule__: Context['__getModule__'];
			dispatch: Dispatch<Events>;
			translate: Translate<Translations>;
			allModules: Set<General>;
			isIdle: Ref<boolean>;
			saveSettings: () => Promise<void>;
			indexedDB: DatabaseAsync<Record<string, AugmentedModuleMeta>>;
		},
	) {
		this.moduleDir = `${ctx.app.vault.configDir}/plugins/sync-engine/modules`;
		(window as WindowAugmentation).syncEngineApiBridge = obsidian;
		this.moduleStore = ctx.indexedDB.getStore(`modules-${hash(ctx.app.vault.getName())}`);
	}

	readonly start = () => {
		if (!this.settings.moduleAutoUpdate) return;
		this.autoUpdateTimeout = window.setTimeout(
			() => void this.updateModules(),
			AUTO_UPDATE_DELAY,
		);
	};

	private readonly createOperationFactory = () => {
		const operations: Array<() => Promise<void>> = [];
		const storeOps: Array<StoreOperations<AugmentedModuleMeta>> = [];
		const execute = () =>
			Promise.all([
				...operations.splice(0).map((op) => op()),
				this.moduleStore.batch(storeOps.splice(0)),
			]);
		const { adapter } = this.ctx.app.vault;
		const factory = {
			delete: (path: string) => operations.push(() => adapter.remove(path)),
			download: (meta: AugmentedModuleMeta) =>
				operations.push(() => this.downloadModule(meta, false)),
			load: (meta: AugmentedModuleMeta) => operations.push(() => this.loadModule(meta)),
			store: (operation: StoreOperations<AugmentedModuleMeta>) => storeOps.push(operation),
		};
		return { execute, factory, operations };
	};

	private readonly loadAllModules = async () => {
		const { adapter } = this.ctx.app.vault;
		if (!(await adapter.exists(this.moduleDir))) await adapter.mkdir(this.moduleDir);
		const { factory, execute } = this.createOperationFactory();
		const [{ files, folders }, recordedModules] = await Promise.all([
			adapter.list(this.moduleDir),
			this.moduleStore.entries().then((result) => new Map(result)),
		]);

		folders.forEach((path) => factory.delete(path));
		const foundModules = new Set<string>();
		files.forEach((path) => {
			if (path.endsWith(MODULE_EXTENSION)) foundModules.add(this.parseModulePath(path));
			else factory.delete(path);
		});
		for (const id of new Set([...foundModules, ...recordedModules.keys()])) {
			const meta = recordedModules.get(id);
			if (!foundModules.has(id)) factory.store({ key: id, type: 'delete' });
			else if (meta) {
				this.discoveredModules.set(id, meta);
				if (meta.enabled) factory.load(meta);
			} else
				new UnknownModuleModal(this.ctx, {
					id,
					onSave: async (newMeta) => {
						this.discoveredModules.set(id, newMeta);
						await Promise.all([
							this.moduleStore.set(id, newMeta),
							newMeta.enabled ? this.loadModule(newMeta, true) : Promise.resolve(),
						]);
					},
					path: this.getModulePath(id),
				}).open();
		}
		await execute();
	};

	private readonly loadModule = async (
		meta: AugmentedModuleMeta,
		start = false,
		module?: string,
	) => {
		const { id, integrity, name, enabled } = meta;
		if (this.loadedModules.get(id)) return;
		const { dispatch, translate, app, __addModule__, __getModule__, allModules, saveSettings } =
			this.ctx;
		const { adapter } = app.vault;
		try {
			const ctor = await loadModule({
				adapter,
				integrity,
				...(module ? { module } : { path: this.getModulePath(id) }),
			});
			__addModule__(ctor);
			const instance: ModuleInstance = __getModule__(ctor as never);
			const modules = this.settings.modules;
			const moduleSettings = modules[id];
			if (moduleSettings) {
				Object.assign(instance.moduleSettings, moduleSettings);
				modules[id] = instance.moduleSettings;
			} else modules[id] = instance.moduleSettings;
			void saveSettings();
			if (start) instance.start?.();
			allModules.add(ctor);
			this.loadedModules.set(id, ctor);
			dispatch('moduleLoaded', id);
		} catch (error) {
			if (enabled) {
				const discoveredMeta = this.discoveredModules.get(id);
				if (discoveredMeta)
					void this.moduleStore.set(
						id,
						Object.assign(discoveredMeta, { enabled: false }),
					);
			}
			const message = toErrorMessage(error);
			dispatch('errorGeneral', `Module \`${id}\` failed to load: ${message}`);
			new Notice(`${translate('failedToLoadModule', { name })}: ${message}`);
		}
	};

	private readonly unloadModule = (id: string) => {
		const ctor = this.loadedModules.get(id);
		if (!ctor) return;
		const { __getModule__, dispatch, allModules } = this.ctx;
		const instance: ModuleInstance = __getModule__(ctor as never);
		instance.dispose?.();
		this.loadedModules.delete(id);
		allModules.delete(ctor);
		dispatch('moduleUnloaded', id);
	};

	private readonly installModule = async (meta: AugmentedModuleMeta, module: string) => {
		const { id, enabled } = meta;
		const { adapter } = this.ctx.app.vault;
		if (this.loadedModules.has(id)) this.unloadModule(id);
		await Promise.all([
			adapter.write(this.getModulePath(id), module),
			enabled ? this.loadModule(meta, true, module) : Promise.resolve(),
			this.moduleStore.set(id, meta),
		]);
		this.discoveredModules.set(id, meta);
	};

	private readonly downloadModule = async (meta: AugmentedModuleMeta, waitIdle = true) => {
		const { id, version, main, name } = meta;
		const { dispatch, translate, isIdle } = this.ctx;
		let setBusy = false;
		try {
			const legacy = this.discoveredModules.get(id);
			if (legacy?.version === version) return;
			dispatch('logGeneral', `Downloading module \`${id}\` of version \`${version}\`.`);
			const module = await requestUrl(main).text;
			if (waitIdle) {
				await untilTrue(isIdle, 'stop');
				setBusy = true;
				isIdle(false);
			}
			await this.installModule(meta, module);
		} catch (error) {
			const message = toErrorMessage(error);
			dispatch('errorGeneral', `Failed to download module \`${id}\`: ${message}`);
			new Notice(`${translate('failedToDownloadModule', { name })}: ${message}`);
		}
		if (setBusy) isIdle(true);
	};

	private readonly deleteModule = async (id: string) => {
		const version = this.discoveredModules.get(id);
		if (!version) return;
		this.unloadModule(id);
		await this.ctx.app.vault.adapter.remove(this.getModulePath(id));
		this.discoveredModules.delete(id);
		void this.moduleStore.delete(id);
		void this.ctx.saveSettings();
	};

	private readonly fetchSources = async (manual = false) => {
		const { dispatch, translate } = this.ctx;
		const { moduleSources } = this.settings;
		const modules: Array<AugmentedModuleMeta> = [];
		const fetchSingleSource = async (url: string): Promise<Array<unknown>> => {
			try {
				const content: unknown = await requestUrl(url).json;
				if (!Array.isArray(content)) throw new Error('Wrong source schema!');
				this.sourceCache.set(url, content);
				return content as Array<unknown>;
			} catch (error) {
				const message = toErrorMessage(error);
				dispatch('errorGeneral', `Failed to fetch source from \`${url}\`: ${message}`);
				if (manual) new Notice(`${translate('failedToFetchSource', { url })}: ${message}`);
				return [];
			}
		};
		await Promise.all(
			moduleSources.map(async (url) => {
				const content = manual
					? await fetchSingleSource(url)
					: (this.sourceCache.get(url) ?? (await fetchSingleSource(url)));
				const seenId = new Set<string>();
				content.forEach((meta: unknown) => {
					if (!isValidMeta(meta)) return;
					const { id, minPluginVersion, icon } = meta;
					if (minPluginVersion && compare(VERSION, minPluginVersion) === -1) {
						this.root.pluginOutdated = true;
						return;
					}
					if (seenId.has(id)) return;
					seenId.add(id);
					modules.push({
						...meta,
						enabled: this.discoveredModules.get(id)?.enabled ?? false,
						icon: icon ?? 'puzzle',
						id: id.normalize('NFC'),
						source: url,
					});
				});
			}),
		);
		dispatch(
			'logGeneral',
			`Discovered ${modules.length} module(s) from ${moduleSources.length} source(s).`,
		);
		return modules;
	};

	private readonly updateModules = async () => {
		if (!this.discoveredModules.size) return;
		const { execute, factory, operations } = this.createOperationFactory();
		const { isIdle } = this.ctx;
		(await this.fetchSources()).forEach((meta) => {
			const { id, source, version } = meta;
			const existing = this.discoveredModules.get(id);
			if (!existing || source !== existing.source) return;
			if (compare(version, existing.version) === 1) factory.download(meta);
		});
		if (!operations.length) return;
		await untilTrue(isIdle, 'stop');
		isIdle(false);
		await execute();
		isIdle(true);
	};

	private readonly updateModuleMeta = async (meta: AugmentedModuleMeta) => {
		const existing = this.discoveredModules.get(meta.id);
		if (!existing) return;
		this.discoveredModules.set(meta.id, meta);
		await this.moduleStore.set(meta.id, meta);
		if (existing.enabled === meta.enabled) return;
		if (meta.enabled) await this.loadModule(meta, true);
		else this.unloadModule(meta.id);
	};

	private readonly enableModule = async (id: string) => {
		const meta = this.discoveredModules.get(id);
		if (!meta || meta.enabled) return;
		await this.moduleStore.set(id, Object.assign(meta, { enabled: true }));
		await this.loadModule(meta, true);
	};

	private readonly disableModule = (id: string) => {
		const meta = this.discoveredModules.get(id);
		if (!meta || !meta.enabled) return;
		this.unloadModule(id);
		void this.moduleStore.set(id, Object.assign(meta, { enabled: false }));
	};

	private readonly getModulePath = (id: string) => `${this.moduleDir}/${id}${MODULE_EXTENSION}`;

	private readonly parseModulePath = (path: string) =>
		path.slice(this.moduleDir.length + 1, -MODULE_EXTENSION.length).normalize('NFC');

	readonly dispose = () => {
		window.clearTimeout(this.autoUpdateTimeout);
		delete (window as WindowAugmentation).syncEngineApiBridge;
		this.loadedModules.clear();
	};

	readonly root = {
		deleteModule: this.deleteModule,
		disableModule: this.disableModule,
		discoveredModules: this.discoveredModules,
		downloadModule: this.downloadModule,
		enableModule: this.enableModule,
		fetchSources: this.fetchSources,
		installModule: this.installModule,
		loadAllModules: this.loadAllModules,
		loadModule: this.loadModule,
		loadedModules: this.loadedModules,
		pluginOutdated: false,
		unloadModule: this.unloadModule,
		updateModuleMeta: this.updateModuleMeta,
		updateModules: this.updateModules,
	};
}

function isValidMeta(meta: unknown): meta is ModuleMeta {
	const isMetaShape = (item: unknown): item is ModuleMeta => {
		if (!item || typeof item !== 'object') return false;
		const requiredFields = [
			'name',
			'version',
			'description',
			'main',
			'integrity',
			'id',
		] as const;
		return requiredFields.every((field) => typeof (item as never)[field] === 'string');
	};
	if (!isMetaShape(meta)) return false;
	return (
		!/[<>:"/\\|?*]/u.test(meta.id) &&
		meta.integrity.length === 64 &&
		/^[0-9a-f]*$/u.test(meta.integrity)
	);
}

export async function loadModule(
	options:
		| { path: string; integrity: string; adapter: DataAdapter }
		| { module: string; integrity: string; adapter: DataAdapter },
) {
	const { adapter, integrity } = options;
	const file = 'module' in options ? options.module : await adapter.read(options.path);
	if (integrity && (await sha256(file)) !== integrity)
		throw new Error('Module has been maliciously modified!');
	const module = await importCode<{ default?: GeneralCtor }>(file);
	const ctor = module.default;
	if (typeof ctor !== 'function') throw new Error(`Invalid module!`);
	return ctor;
}
