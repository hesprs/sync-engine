import CodeInputModal from '../CodeInputModal';
import ModuleEditorModal from '../ModuleEditorModal';
import Card from './Card';
import { MODULE_EXTENSION } from '@/modules/Extensibility';
import { Menu, prepareFuzzySearch, SearchComponent, Notice, ExtraButtonComponent } from 'obsidian';
import { For, Show, createEffect, createMemo, createSignal, onMount } from 'solid-js';
import { compare } from 'verkit';
import type { ModuleManagementContext, PendingAction } from './index';
import type { AugmentedModuleMeta } from '@/modules/Extensibility';
import type { MaybePromise } from '@/types';
import type { MenuItem, SearchResult } from 'obsidian';

const ALTERNATIVE_MODULE_EXTENSION = '.mjs';

type MergedMeta = {
	canonical: AugmentedModuleMeta;
	installed?: AugmentedModuleMeta;
	upstream?: AugmentedModuleMeta;
};

export default function App(props: {
	el: Element;
	ctx: ModuleManagementContext;
	isUnmounted: () => boolean;
}) {
	const t = props.ctx.translate;
	const [sourceModules, setSourceModules] = createSignal<Array<AugmentedModuleMeta>>([]);
	const [installedModules, setInstalledModules] = createSignal(props.ctx.discoveredModules, {
		equals: () => false,
	});
	const [loadedIds, setLoadedIds] = createSignal(new Set<string>());
	const [query, setQuerySignal] = createSignal('');
	const [showInstalledOnly, setShowInstalledOnlySignal] = createSignal(false);
	const [hasLoaded, setHasLoaded] = createSignal(false);
	const [isLoading, setIsLoading] = createSignal(false);
	const [isPluginOutdated, setIsPluginOutdated] = createSignal(props.ctx.pluginOutdated);
	const [pendingByName, setPendingByName] = createSignal<
		Record<string, PendingAction | undefined>
	>({});

	const syncSnapshots = () => {
		if (props.isUnmounted()) return;
		setInstalledModules(props.ctx.discoveredModules);
		setLoadedIds(new Set(props.ctx.loadedModules.keys()));
	};

	const refreshSources = async (manual = false) => {
		if (props.isUnmounted() || isLoading()) return;
		setIsLoading(true);
		try {
			const modules = await props.ctx.fetchSources(manual);
			if (props.isUnmounted()) return;
			setSourceModules(modules);
			syncSnapshots();
			setHasLoaded(true);
			setIsPluginOutdated(props.ctx.pluginOutdated);
		} finally {
			if (!props.isUnmounted()) setIsLoading(false);
		}
	};

	const mergedModules = createMemo<Record<string, MergedMeta>>(() => {
		const sourceMap = new Map<string, Array<AugmentedModuleMeta>>();
		const installedMeta = installedModules();
		for (const module of sourceModules()) {
			let existing = sourceMap.get(module.id);
			if (!existing) {
				existing = [];
				sourceMap.set(module.id, existing);
			}
			existing.push(module);
		}
		const result: Record<string, MergedMeta> = {};
		const ids = new Set([...sourceMap.keys(), ...installedMeta.keys()]);
		for (const id of ids) {
			const installed = installedMeta.get(id);
			const sourceMapModules = sourceMap.get(id);
			const upstream = sourceMapModules
				? installed
					? sourceMapModules.find(({ source }) => source === installed.source)
					: sourceMapModules.reduce((max, cur) =>
							compare(cur.version, max.version) === 1 ? cur : max,
						)
				: undefined;
			const canonical = (installed ?? upstream) as AugmentedModuleMeta;
			result[id] = { canonical, installed, upstream };
		}
		return result;
	});

	const visibleModules = createMemo<Map<string, MergedMeta>>(() => {
		const filtered = Object.entries(mergedModules()).filter(([id]) => {
			if (!showInstalledOnly()) return true;
			return installedModules().has(id);
		});

		const normalizedQuery = query().trim();
		if (!normalizedQuery) return new Map(filtered.sort(([a], [b]) => a.localeCompare(b)));
		const match = prepareFuzzySearch(normalizedQuery);
		return new Map(
			filtered
				.map((entry) => ({ entry, score: getModuleScore(match, entry[1].canonical) }))
				.filter(
					(entry): entry is { entry: [string, MergedMeta]; score: number } =>
						entry.score !== undefined,
				)
				.sort(
					(a, b) =>
						b.score - a.score ||
						a.entry[1].canonical.id.localeCompare(b.entry[1].canonical.id),
				)
				.map(({ entry }) => entry),
		);
	});

	const runAction = async (id: string, action: PendingAction, op: () => MaybePromise<void>) => {
		if (props.isUnmounted()) return;
		setPendingByName((current) => ({ ...current, [id]: action }));
		try {
			await op();
			syncSnapshots();
		} finally {
			if (!props.isUnmounted())
				setPendingByName((current) => ({ ...current, [id]: undefined }));
		}
	};

	createEffect(() => {
		if (isLoading()) props.el.addClass('is-loading');
		else props.el.removeClass('is-loading');
	});

	onMount(() => {
		syncSnapshots();
		void refreshSources();
	});

	return (
		<>
			<div
				class="flex items-center gap-2 py-4"
				ref={(controls) => {
					new SearchComponent(controls)
						.setPlaceholder(t('searchModules'))
						.onChange(setQuerySignal)
						.setClass('grow').inputEl.spellcheck = false;
					const menu = new Menu()
						.addItem((item) =>
							item
								.setIcon('hard-drive-download')
								.setTitle(t('showInstalledOnly'))
								.setChecked(showInstalledOnly())
								.onClick(() => {
									setShowInstalledOnlySignal(!showInstalledOnly());
									item.setChecked(showInstalledOnly());
								}),
						)
						.addItem((item) =>
							pickFile(
								item.setIcon('package').setTitle(t('installModuleFromFile')),
								async (fileObj) => {
									let extension: string;
									if (fileObj.name.endsWith(MODULE_EXTENSION))
										extension = MODULE_EXTENSION;
									else if (fileObj.name.endsWith(ALTERNATIVE_MODULE_EXTENSION))
										extension = ALTERNATIVE_MODULE_EXTENSION;
									else {
										new Notice(t('moduleExtensionWarning'));
										return;
									}
									const file = await fileObj.text();
									new ModuleEditorModal(props.ctx, {
										file,
										initial: {
											id: fileObj.name
												.slice(0, -extension.length)
												.normalize('NFC'),
										},
										onSave: async (meta) => {
											await props.ctx.installModule(meta, file);
											syncSnapshots();
										},
									}).open();
								},
							),
						)
						.addItem((item) =>
							item
								.setIcon('code-xml')
								.setTitle(t('installModuleFromCode'))
								.onClick(() => {
									new CodeInputModal(props.ctx, (file) =>
										new ModuleEditorModal(props.ctx, {
											file,
											onSave: async (meta) => {
												await props.ctx.installModule(meta, file);
												syncSnapshots();
											},
										}).open(),
									).open();
								}),
						)
						.addItem((item) =>
							item
								.setIcon('rotate-cw')
								.setTitle(t('refreshSources'))
								.onClick(() => refreshSources(true)),
						);

					new ExtraButtonComponent(controls)
						.setIcon('settings')
						.extraSettingsEl.onClickEvent((event) => menu.showAtMouseEvent(event));
				}}
			/>
			<div class="flex flex-col gap-3 pb-1">
				<Show
					when={visibleModules().size}
					fallback={
						<div class="flex min-h-40 items-center justify-center rounded-md border border-[--background-modifier-border] px-4 py-6 text-center text-[--text-muted] bg-[--background-primary-alt]">
							{getEmptyStateText({
								hasLoaded: hasLoaded(),
								isLoading: isLoading(),
								query: query(),
								showInstalledOnly: showInstalledOnly(),
								translate: t,
							})}
						</div>
					}
				>
					<div
						class="grid gap-3"
						style={{
							'grid-template-columns':
								'repeat(auto-fit, minmax(min(260px, 100%), 1fr))',
						}}
					>
						<For each={[...visibleModules().keys()]}>
							{(id) => {
								const get = () => visibleModules().get(id) as MergedMeta;
								return (
									<Card
										ctx={props.ctx}
										upstream={get().upstream}
										isLoaded={loadedIds().has(id)}
										canonical={get().canonical}
										installed={get().installed}
										pendingAction={pendingByName()[id]}
										runAction={(action, op) => {
											void runAction(id, action, op);
										}}
									/>
								);
							}}
						</For>
					</div>
				</Show>
				<Show when={isPluginOutdated()}>
					<div class="text-center text-[--text-faint] mt-4">
						{props.ctx.translate('someModulesHidden')}
					</div>
				</Show>
			</div>
		</>
	);
}

function getEmptyStateText(ctx: {
	hasLoaded: boolean;
	isLoading: boolean;
	query: string;
	showInstalledOnly: boolean;
	translate: ModuleManagementContext['translate'];
}) {
	if (ctx.isLoading && !ctx.hasLoaded) return ctx.translate('loadingModules');
	if (ctx.query.trim()) return ctx.translate('noMatchingModulesFound');
	if (ctx.showInstalledOnly) return ctx.translate('noInstalledModulesFound');
	return ctx.translate('noModulesAvailable');
}

function getModuleScore(match: (text: string) => SearchResult | null, module: AugmentedModuleMeta) {
	const nameScore = match(module.name)?.score ?? undefined;
	const descriptionScore = module.description
		? (match(module.description)?.score ?? undefined)
		: undefined;
	if (nameScore === undefined && descriptionScore === undefined) return;
	return (nameScore ?? 0) + (descriptionScore ?? 0);
}

function pickFile({ dom }: MenuItem, handler: (file: File) => MaybePromise<void>) {
	dom.addClass('relative');
	dom.createEl('input', {
		attr: { accept: '.js,.mjs', title: '' },
		cls: 'absolute inset-0 opacity-0',
		type: 'file',
	}).addEventListener('change', (e) => {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		void handler(file);
	});
}
