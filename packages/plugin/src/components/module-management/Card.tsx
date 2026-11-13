import ModuleEditorModal from '../ModuleEditorModal';
import { OFFICIAL_SOURCE } from '@/modules/Extensibility';
import { setIcon, setTooltip, ToggleComponent } from 'obsidian';
import { Show, createEffect } from 'solid-js';
import { compare } from 'verkit';
import type { ModuleManagementContext, PendingAction } from './index';
import type { AugmentedModuleMeta } from '@/modules/Extensibility';
import type { MaybePromise } from '@/types';

export default function Card(props: {
	ctx: Pick<
		ModuleManagementContext,
		| 'deleteModule'
		| 'disableModule'
		| 'downloadModule'
		| 'enableModule'
		| 'translate'
		| 'updateModuleMeta'
		| 'app'
	>;
	sourceMeta?: AugmentedModuleMeta;
	canonical: AugmentedModuleMeta;
	isLoaded: boolean;
	installedMeta?: AugmentedModuleMeta;
	pendingAction?: PendingAction;
	runAction: (action: PendingAction, op: () => MaybePromise<void>) => void;
}) {
	const isInstalled = () => Boolean(props.installedMeta);
	const hasUpdate = () =>
		props.sourceMeta &&
		props.installedMeta &&
		compare(props.sourceMeta.version, props.installedMeta.version) === 1;
	const busy = () => props.pendingAction !== undefined;
	const versionLabel = () => {
		if (hasUpdate())
			return `v${(props.installedMeta as AugmentedModuleMeta).version}\u00A0\u00A0→\u00A0\u00A0v${(props.sourceMeta as AugmentedModuleMeta).version}`;
		return `v${props.canonical.version}`;
	};

	return (
		<div class="flex min-h-40 flex-col gap-3 rounded-[--radius-s] border border-[--background-modifier-border] px-4 py-3 bg-[--background-primary-alt]">
			<div class="flex items-start justify-between gap-3">
				<div class="flex min-w-0 text-base font-semibold text-[--text-normal] break-words">
					<span
						class="flex items-center mr-2"
						ref={(el) => setIcon(el, props.canonical.icon)}
					/>
					{props.canonical.name}
				</div>
				<div class="flex-shrink-0 text-xs text-[--text-faint]">{versionLabel()}</div>
			</div>

			<div class="flex flex-1 flex-col gap-2">
				<div class="flex flex-wrap gap-2">
					<Show when={props.canonical.source === OFFICIAL_SOURCE}>
						<span class="flair m-0 sync-engine-prominent">
							{props.ctx.translate('official')}
						</span>
					</Show>
					<Show when={isInstalled()}>
						<span class="flair m-0">{props.ctx.translate('installed')}</span>
					</Show>
					<Show when={hasUpdate()}>
						<span class="flair m-0">{props.ctx.translate('updateAvailable')}</span>
					</Show>
				</div>
				<div class="flex-1 text-sm text-[--text-muted] break-words">
					{props.canonical.description}
				</div>
			</div>

			<div class="flex items-center justify-end gap-2">
				<Show when={props.canonical.readme}>
					<a
						class="clickable-icon rounded-md p-1"
						href={props.canonical.readme}
						ref={(ref) => {
							setIcon(ref, 'book-open-text');
							setTooltip(ref, props.ctx.translate('openReadme'));
						}}
					/>
				</Show>
				<Show when={!isInstalled() || hasUpdate()}>
					<ActionButton
						disabled={busy()}
						icon={hasUpdate() ? 'circle-fading-arrow-up' : 'download'}
						pending={props.pendingAction === 'download'}
						tooltip={
							hasUpdate()
								? props.ctx.translate('updateModule')
								: props.ctx.translate('downloadModule')
						}
						onClick={() =>
							props.runAction('download', () =>
								props.ctx.downloadModule(props.sourceMeta ?? props.canonical),
							)
						}
					/>
				</Show>
				<Show when={isInstalled()}>
					<ActionButton
						disabled={busy()}
						icon="trash-2"
						pending={props.pendingAction === 'delete'}
						tooltip={props.ctx.translate('deleteModule')}
						onClick={() =>
							props.runAction('delete', () =>
								props.ctx.deleteModule(props.canonical.id),
							)
						}
					/>
					<ActionButton
						disabled={busy()}
						icon="pencil"
						pending={props.pendingAction === 'editInfo'}
						tooltip={props.ctx.translate('editModuleInformation')}
						onClick={() =>
							new ModuleEditorModal(props.ctx, {
								initial: props.canonical,
								onSave: (newMeta) =>
									props.runAction('editInfo', () =>
										props.ctx.updateModuleMeta(newMeta),
									),
							}).open()
						}
					/>
					<EnableToggle
						disabled={busy()}
						enabled={props.isLoaded}
						translate={props.ctx.translate}
						onEnable={() =>
							props.runAction('enable', () =>
								props.ctx.enableModule(props.canonical.id),
							)
						}
						onDisable={() =>
							props.runAction('disable', () =>
								props.ctx.disableModule(props.canonical.id),
							)
						}
					/>
				</Show>
			</div>
		</div>
	);
}

function EnableToggle(props: {
	disabled: boolean;
	enabled: boolean;
	translate: ModuleManagementContext['translate'];
	onEnable: () => void;
	onDisable: () => void;
}) {
	let toggleEl: HTMLDivElement;
	let toggle: ToggleComponent;

	createEffect(() => {
		if (toggle.getValue() !== props.enabled) toggle.setValue(props.enabled);
		toggle.setDisabled(props.disabled);
		setTooltip(
			toggleEl,
			props.enabled ? props.translate('disableModule') : props.translate('enableModule'),
		);
	});

	return (
		<div
			class="flex items-center"
			ref={(el) => {
				toggleEl = el;
				toggle = new ToggleComponent(el)
					.setValue(props.enabled)
					.setDisabled(props.disabled)
					.onChange((value) => {
						if (value) props.onEnable();
						else props.onDisable();
					});
			}}
		/>
	);
}

function ActionButton(props: {
	disabled: boolean;
	icon: string;
	onClick: () => void;
	pending: boolean;
	tooltip: string;
}) {
	let button: HTMLButtonElement;

	createEffect(() => {
		setIcon(button, props.pending ? 'loader-circle' : props.icon);
		button.ariaLabel = props.tooltip;
		setTooltip(button, props.tooltip);
		const iconSvg = button.firstElementChild;
		if (iconSvg) iconSvg.classList.toggle('animate-spin', props.pending);
	});

	return (
		<button
			class="clickable-icon rounded-md p-1"
			disabled={props.disabled}
			onClick={props.onClick}
			ref={(ref) => (button = ref)}
			style={{ opacity: props.disabled ? '0.45' : '1' }}
			type="button"
		/>
	);
}
