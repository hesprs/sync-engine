import { createRaceAwareResolver, findRaceCandidates, forceRaceConflicts } from '@/race';
import type { CollaborationTranslations } from '@/i18n';
import type { Pulse } from '@/protocol';
import type { RaceJournal, UploadEpoch } from '@/race';
import type { GlobStrategy } from '@/types';
import type {
	DeciderEntry,
	Dispatch,
	Events,
	ExistingMemoryDB,
	Fs,
	On,
	Stat,
	StoreSync,
	SyncOptions,
	SyncTerminateReason,
	Translate,
} from '@hesprs/sync-engine-sdk';

const WRAPPER_PREFIX = 'collaboration:';

type BridgeContext = {
	deciderRegistry: Map<string, DeciderEntry>;
	dispatch: Dispatch<Events>;
	getConflictResolver: () => NonNullable<SyncOptions['conflictResolver']>;
	memoryDB: ExistingMemoryDB;
	on: On<Events>;
	registerDecider: (id: string, entry: DeciderEntry) => () => boolean;
	requestSync: (trigger: string) => Promise<SyncTerminateReason>;
	translate: Translate<CollaborationTranslations>;
};

/**
 * Builds a remote lister that returns a complete stat array from the cached remote snapshot,
 * patching only the keys changed since the last full walk. Empty cache or a keyless pulse returns
 * `undefined` so the sync core falls back to a full remote walk.
 */
function makeIncrementalLister(
	keys: Array<string> | undefined,
	memoryDB: ExistingMemoryDB,
	fastModeFallback = false,
): NonNullable<SyncOptions['remoteLister']> | undefined {
	const store = memoryDB.getStore('remoteContext20000');
	if (store.keys().length === 0) return undefined;
	if (!keys || keys.length === 0) {
		if (!fastModeFallback) return undefined;
		return async ({ reporter }) => {
			const entries = store.values();
			const filtered: Array<Stat> = [];
			await Promise.all(
				entries.map(async (stat, index) => {
					if (
						(await reporter({
							completed: index + 1,
							current: stat.key,
							total: entries.length,
						})) === 'exclude'
					)
						return;
					filtered.push(stat);
				}),
			);
			return filtered;
		};
	}
	return async ({ remoteFs, reporter }) => {
		try {
			await patchChangedStats(remoteFs, store, keys);
		} catch {
			return remoteFs.list('/', reporter);
		}
		const entries = store.values();
		const filtered: Array<Stat> = [];
		await Promise.all(
			entries.map(async (stat, index) => {
				if (
					(await reporter({
						completed: index + 1,
						current: stat.key,
						total: entries.length,
					})) === 'exclude'
				)
					return;
				filtered.push(stat);
			}),
		);
		return filtered;
	};
}

/** Re-stats changed keys against the real backend and refreshes the cached snapshot in place. */
async function patchChangedStats(
	remoteFs: Fs,
	store: StoreSync<Stat>,
	keys: Array<string>,
): Promise<void> {
	await Promise.all(
		keys.map(async (key) => {
			if (!(await remoteFs.exists(key))) {
				store.delete(key);
				return;
			}
			const stat = await remoteFs.stat(key);
			store.set(key, stat);
		}),
	);
}

export default class SyncBridge {
	private readonly cleanupCallbacks: Array<() => void> = [];
	private readonly deciderCleanups: Array<() => boolean> = [];
	private readonly activeUploads = new Set<string>();
	/**
	 * Shared with the race-aware resolver by reference. buildOptions() runs before the wrapped
	 * decider, which runs before any ResolveConflict task — so the decider must MUTATE this map
	 * (never reassign it) for the resolver to see the candidates computed from the real listing.
	 */
	private readonly activeCandidates = new Map<string, UploadEpoch>();
	private pending?: Pulse;
	private syncTimer?: ReturnType<typeof setTimeout>;

	constructor(
		private readonly ctx: BridgeContext,
		private readonly options: {
			fastMode?: () => boolean;
			journal: RaceJournal;
			rules: () => Array<GlobStrategy>;
		},
	) {
		this.cleanupCallbacks.push(
			ctx.on('syncStarted', () => {
				this.activeUploads.clear();
				this.activeCandidates.clear();
			}),
			ctx.on('executionStarted', (tasks) => {
				this.activeUploads.clear();
				for (const task of tasks) {
					if (task.name !== 'upload') continue;
					if (!task.local?.isDir) this.activeUploads.add(task.key);
				}
			}),
			ctx.on('syncTerminated', () => {
				this.activeUploads.clear();
				this.activeCandidates.clear();
				if (this.pending) void this.ctx.requestSync('collaboration');
			}),
		);
	}

	get triggerOptions(): () => SyncOptions | undefined {
		return () => this.buildOptions();
	}

	accept(pulse: Pulse, debounceMs = 1500): void {
		const current = this.pending;
		if (
			current &&
			(pulse.sentAt < current.sentAt ||
				(pulse.sentAt === current.sentAt && pulse.batchId < current.batchId))
		)
			return;
		this.pending = pulse;
		this.options.journal.prune();
		if (this.syncTimer) clearTimeout(this.syncTimer);
		if (debounceMs <= 0) {
			void this.ctx.requestSync('collaboration');
			return;
		}
		this.syncTimer = setTimeout(() => {
			this.syncTimer = undefined;
			void this.ctx.requestSync('collaboration');
		}, debounceMs);
	}

	private buildOptions(): SyncOptions | undefined {
		const fastMode = Boolean(this.options.fastMode?.());
		if (!this.pending) {
			const remoteLister = fastMode
				? makeIncrementalLister(undefined, this.ctx.memoryDB, true)
				: undefined;
			if (!remoteLister) return;
			const rules = this.options.rules();
			const syncStrategy = rules.map((rule) => ({
				expr: rule.expr,
				strategy: this.wrappedStrategy(rule.strategy),
			}));
			const conflictResolver = createRaceAwareResolver({
				getConfiguredResolver: this.ctx.getConflictResolver,
			});
			return { conflictResolver, remoteLister, syncStrategy };
		}
		const { keys } = this.pending;
		this.pending = undefined;
		this.activeCandidates.clear();
		const remoteLister = makeIncrementalLister(keys, this.ctx.memoryDB, fastMode);
		const options: SyncOptions = remoteLister ? { remoteLister } : {};
		const rules = this.options.rules();
		const syncStrategy = rules.map((rule) => ({
			expr: rule.expr,
			strategy: this.wrappedStrategy(rule.strategy),
		}));
		const conflictResolver = createRaceAwareResolver({
			getConfiguredResolver: this.ctx.getConflictResolver,
		});
		return { ...options, conflictResolver, syncStrategy };
	}

	private wrappedStrategy(strategy: string): string {
		if (strategy === 'none' || strategy.startsWith(WRAPPER_PREFIX)) return strategy;
		const base = this.ctx.deciderRegistry.get(strategy);
		if (!base) return strategy;
		const id = `${WRAPPER_PREFIX}${strategy}`;
		if (this.ctx.deciderRegistry.has(id)) return id;
		this.deciderCleanups.push(
			this.ctx.registerDecider(id, {
				decider: (input) => {
					// Input.remoteStats is the real remote listing, so candidates are computed
					// Against current backend state rather than a peer-supplied stat list.
					this.activeCandidates.clear();
					for (const [key, epoch] of findRaceCandidates({
						journal: this.options.journal,
						remoteStats: input.remoteStats,
					}))
						this.activeCandidates.set(key, epoch);
					const { forcedKeys, records } = forceRaceConflicts(
						input,
						this.activeCandidates,
					);
					if (forcedKeys.size)
						this.ctx.dispatch(
							'logSync',
							text(this.ctx.translate('raceDetected', forcedKeys.size)),
						);
					return base.decider({ ...input, records });
				},
			}),
		);
		return id;
	}

	reset(): void {
		if (this.syncTimer) {
			clearTimeout(this.syncTimer);
			this.syncTimer = undefined;
		}
		this.pending = undefined;
		this.activeCandidates.clear();
		this.activeUploads.clear();
	}

	dispose(): void {
		this.reset();
		this.cleanupCallbacks.splice(0).forEach((cleanup) => cleanup());
		this.deciderCleanups.splice(0).forEach((cleanup) => cleanup());
	}

	get activeUploadKeys(): ReadonlySet<string> {
		return this.activeUploads;
	}
}

function text(value: unknown): string {
	return typeof value === 'string' ? value : String(value);
}
