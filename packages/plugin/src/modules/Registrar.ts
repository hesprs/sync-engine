import type { Events, Translations } from '@';
import type { App, RequestUrlParam } from 'obsidian';
import { toArrayBuffer, toUint8Array } from '@repo/shared/binary';
import hash from '@repo/shared/crypto';
import { toError } from '@repo/shared/error';
import { requestUrl } from 'obsidian';
import type { BatchOptimizer, Fs, RootFs, VaultRequest } from '@/fs';
import type { BaseTask, ConflictResolver, Decider, TaskFactory } from '@/sync';
import type { General, MaybePromise, Binary, StatsMap, RecordStatsMap } from '@/types';
import { createVaultRequest, VaultFs } from '@/fs';
import type { Dispatch } from './EventBus';
import type { Snippet, Translate } from './I18n';
import type { RecordStore } from './Storage';
import type { SyncOptions } from './Sync';

type RejectableWrapper<T> = (value: T) => T | undefined;
type OrderedWrapperEntry<T> = { priority: number; apply: RejectableWrapper<T> };
export type RemoteRequestMiddlewareEntry = OrderedWrapperEntry<Request>;
export type LocalRequestMiddlewareEntry = OrderedWrapperEntry<VaultRequest>;
export type FsWrapperEntry = OrderedWrapperEntry<Fs>;

export type RemoteFsEntry = {
	instantiate: (request: Request) => RootFs;
	prettyName: () => string;
	checkConnection: (request: Request) => MaybePromise<void | Error>;
};
export type DeciderEntry = { decider: Decider; prettyName: () => string };
export type ConflictResolverEntry = { prettyName: () => string; resolver: ConflictResolver };

type GeneralFn = (...args: ReadonlyArray<General>) => unknown;
type RejectableApply<F extends GeneralFn> = (...input: Parameters<F>) => ReturnType<F> | undefined;
type OrderedApplyEntry<F extends GeneralFn> = { apply: RejectableApply<F>; priority: number };

export type OptimizerEntry = OrderedApplyEntry<BatchOptimizer>;

export type TriggerEntry = { priority: number; options?: () => SyncOptions };

export type Infras = { localFs: Fs; remoteFs: Fs; record: RecordStore };

export type RequestParam = Omit<RequestUrlParam, 'body' | 'url'> & {
	body?: string | Binary;
	ignoreCancellation?: boolean;
};
export type RequestResponse = {
	text: () => string;
	bytes: () => Binary;
	// oxlint-disable-next-line typescript/no-unnecessary-type-parameters
	json: <T extends object = object>() => T;
	headers: Record<string, string>;
	status: number;
};
export type Request = (url: string, params?: RequestParam) => Promise<RequestResponse>;
const request: Request = async (url: string, params?: RequestParam) => {
	const body = params?.body;
	if (body instanceof Uint8Array) (params as RequestUrlParam).body = toArrayBuffer(body);
	const response = await requestUrl(
		params ? (Object.assign(params, { url }) as RequestUrlParam) : url,
	);
	return {
		bytes: () => toUint8Array(response.arrayBuffer),
		headers: response.headers,
		// oxlint-disable-next-line typescript/no-unnecessary-type-parameters
		json: <T extends object = object>() => response.json as T,
		status: response.status,
		text: () => response.text,
	};
};

export type DecideTasksInput = {
	local: Record<string, StatsMap>;
	remote: Record<string, StatsMap>;
	record: Record<string, RecordStatsMap>;
	taskFactory: TaskFactory;
};

export default class Registrar {
	private readonly cleanupCallbacks: Array<() => void> = [];
	private readonly localFsWrapperRegistry = new Set<FsWrapperEntry>();
	private readonly remoteFsWrapperRegistry = new Set<FsWrapperEntry>();
	private readonly localOptimizerRegistry = new Set<OptimizerEntry>();
	private readonly remoteOptimizerRegistry = new Set<OptimizerEntry>();
	private readonly remoteRequestMiddlewareRegistry = new Set<RemoteRequestMiddlewareEntry>();
	private readonly localRequestMiddlewareRegistry = new Set<LocalRequestMiddlewareEntry>();
	private readonly remoteFsRegistry = new Map<string, RemoteFsEntry>();
	private readonly deciderRegistry = new Map<string, DeciderEntry>();
	private readonly triggerRegistry = new Map<string, TriggerEntry>();
	private readonly conflictResolverRegistry = new Map<string, ConflictResolverEntry>();

	declare readonly settings: { remoteFs: string; conflictResolver: string };
	declare readonly i18n: {
		pleaseSetBackend: string;
		backendNotInstalled: Snippet<string>;
		syncStrategyNotInstalled: Snippet<string>;
		conflictResolveStrategyNotInstalled: Snippet<string>;
	};

	constructor(
		private readonly ctx: {
			app: App;
			getRecordStore: (namespace: string) => RecordStore;
			translate: Translate<Translations>;
			dispatch: Dispatch<Events>;
		},
	) {}

	private readonly getVaultRequest = () =>
		wrapInOrder(createVaultRequest(this.ctx.app), this.localRequestMiddlewareRegistry);

	private readonly createLocalFs = () => {
		const { vault } = this.ctx.app;
		return wrapInOrder(
			new VaultFs(this.getVaultRequest(), vault.getName()),
			this.localFsWrapperRegistry,
		);
	};

	// Returns the instantiated Fs or error
	private readonly createRemoteFs = (remoteFs = this.settings.remoteFs): Fs | Error => {
		const entry = this.remoteFsRegistry.get(remoteFs);
		if (!entry) {
			const { translate } = this.ctx;
			if (!remoteFs) return new Error(translate('pleaseSetBackend'));
			return new Error(translate('backendNotInstalled', remoteFs));
		}
		try {
			return wrapInOrder(entry.instantiate(this.getRequest()), this.remoteFsWrapperRegistry);
		} catch (error) {
			return toError(error);
		}
	};

	private readonly getRequest = () => wrapInOrder(request, this.remoteRequestMiddlewareRegistry);

	private readonly getCheckConnection = (remoteFs = this.settings.remoteFs) => {
		const entry = this.remoteFsRegistry.get(remoteFs);
		if (!entry) {
			const { translate } = this.ctx;
			if (!remoteFs) throw new Error(translate('pleaseSetBackend'));
			throw new Error(translate('backendNotInstalled', remoteFs));
		}
		return () => entry.checkConnection(this.getRequest());
	};

	private readonly decideTasks = ({ local, record, remote, taskFactory }: DecideTasksInput) => {
		const keys = new Set([
			...Object.keys(local),
			...Object.keys(record),
			...Object.keys(remote),
		]);
		const tasks: Array<BaseTask> = [];
		for (const key of keys) {
			const { translate, dispatch } = this.ctx;
			const entry = this.deciderRegistry.get(key);
			if (!entry) throw new Error(translate('syncStrategyNotInstalled', key));
			const localStats = local[key] ?? new Map();
			const remoteStats = remote[key] ?? new Map();
			const records = record[key] ?? new Map();
			dispatch(
				'logSync',
				`Strategy \`${key}\` in scope: local ${localStats.size} item(s), remote ${remoteStats.size} item(s), record ${records.size} item(s).`,
			);
			tasks.push(...entry.decider({ localStats, records, remoteStats, taskFactory }));
		}
		return tasks;
	};

	private readonly optimizeLocal: BatchOptimizer = (input) =>
		applyFirst(this.localOptimizerRegistry, input);
	private readonly optimizeRemote: BatchOptimizer = (input) =>
		applyFirst(this.remoteOptimizerRegistry, input);
	private readonly reduceTriggers = (
		triggers: Array<string>,
	): { trigger: string; options?: SyncOptions } => {
		let highest: (TriggerEntry & { trigger: string }) | undefined;
		for (const trigger of triggers) {
			const entry = this.triggerRegistry.get(trigger);
			if (!entry) continue;
			const { priority, options } = entry;
			if (!highest || entry.priority > highest.priority)
				highest = { options, priority, trigger };
		}
		return { options: highest?.options?.(), trigger: highest?.trigger ?? 'unknown' };
	};

	private readonly getConflictResolver = () => {
		const id = this.settings.conflictResolver;
		const resolver = this.conflictResolverRegistry.get(id);
		if (!resolver)
			throw new Error(this.ctx.translate('conflictResolveStrategyNotInstalled', id));
		return resolver.resolver;
	};

	private readonly getNamespace = <R extends Fs | undefined>(
		localFs?: Fs,
		remoteFs?: R,
	): R extends Fs ? string : string | Error => {
		localFs ??= this.createLocalFs();
		if (!remoteFs) {
			const fs = this.createRemoteFs();
			if (fs instanceof Error) return fs as never;
			remoteFs = fs as never;
		}
		return hash(`${localFs.getUid()}~~${remoteFs.getUid()}`);
	};

	private readonly initializeSync = (): Infras => {
		const localFs = this.createLocalFs();
		const remoteFs = this.createRemoteFs();
		if (remoteFs instanceof Error) throw remoteFs;
		const namespace = this.getNamespace(localFs, remoteFs);
		const record = this.ctx.getRecordStore(namespace);
		return { localFs, record, remoteFs };
	};

	root = {
		conflictResolverRegistry: this.conflictResolverRegistry,
		createLocalFs: this.createLocalFs,
		createRemoteFs: this.createRemoteFs,
		decideTasks: this.decideTasks,
		deciderRegistry: this.deciderRegistry,
		getCheckConnection: this.getCheckConnection,
		getConflictResolver: this.getConflictResolver,
		getNamespace: this.getNamespace,
		getRequest: this.getRequest,
		getVaultRequest: this.getVaultRequest,
		initializeSync: this.initializeSync,
		optimizeLocal: this.optimizeLocal,
		optimizeRemote: this.optimizeRemote,
		reduceTriggers: this.reduceTriggers,
		registerConflictResolver: mapRegister(this.conflictResolverRegistry),
		registerCss: (css: string) => {
			const style = createEl('style', { text: css, type: 'text/css' });
			document.head.append(style);
			return () => style.remove();
		},
		registerDecider: mapRegister(this.deciderRegistry),
		registerLocalFsWrapper: setRegister(this.localFsWrapperRegistry),
		registerLocalOptimizer: setRegister(this.localOptimizerRegistry),
		registerLocalRequestMiddleware: setRegister(this.localRequestMiddlewareRegistry),
		registerRemoteFs: mapRegister(this.remoteFsRegistry),
		registerRemoteFsWrapper: setRegister(this.remoteFsWrapperRegistry),
		registerRemoteOptimizer: setRegister(this.remoteOptimizerRegistry),
		registerRemoteRequestMiddleware: setRegister(this.remoteRequestMiddlewareRegistry),
		registerTrigger: mapRegister(this.triggerRegistry),
		remoteFsRegistry: this.remoteFsRegistry,
	};

	readonly dispose = () => this.cleanupCallbacks.splice(0).forEach((fn) => fn());
}

function wrapInOrder<T>(initial: T, set: Set<OrderedWrapperEntry<T>>) {
	const middlewares: Record<number, Array<RejectableWrapper<T>>> = {};
	for (const { apply, priority } of set) {
		middlewares[priority] ??= [];
		middlewares[priority].push(apply);
	}
	let result = initial;
	for (const orders of Object.values(middlewares))
		for (const middleware of orders) {
			const wrapped = middleware(result);
			if (wrapped) {
				result = wrapped;
				break;
			}
		}
	return result;
}

function applyFirst<F extends GeneralFn>(set: Set<OrderedApplyEntry<F>>, ...input: Parameters<F>) {
	const middlewares: Record<number, Array<RejectableApply<F>>> = {};
	for (const { apply, priority } of set) {
		middlewares[priority] ??= [];
		middlewares[priority].push(apply);
	}
	for (const orders of Object.values(middlewares))
		for (const apply of orders) {
			const result = apply(...input);
			if (result) return result;
		}
	throw new Error('No qualified apply found!');
}

export function setRegister<T>(registry: Set<T>) {
	return (entry: T) => {
		registry.add(entry);
		return () => registry.delete(entry);
	};
}

function mapRegister<T>(registry: Map<string, T>) {
	return (key: string, entry: T) => {
		registry.set(key, entry);
		return () => registry.delete(key);
	};
}
