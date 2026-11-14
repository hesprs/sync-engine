import { exchangeCodeForTokens, startAuthorization } from './dropbox/auth';
import { settingEntry as s } from '@hesprs/sync-engine-sdk';
import { describeError, toError } from '@repo/shared/error';
import { normalizeBaseDir } from '@repo/shared/path';
import { Modal, Notice, Setting } from 'obsidian';
import type { PendingAuthorization, TokenManager } from './dropbox/auth';
import type { DropboxSettings } from '@';
import type {
	CallableOrObjectTree,
	Dispatch,
	Fragment,
	LabelDefinition,
	Snippet,
	Translate,
	Translations,
	Events,
} from '@hesprs/sync-engine-sdk';
import type { App, SettingGroupItem } from 'obsidian';

export type DropboxTranslations = {
	dropbox: string;
	connectAccount: string;
	accountConnected: string;
	connectAccountDescription: string;
	connect: string;
	disconnect: string;
	connectTitle: string;
	connectInstruction: Fragment<string>;
	openDropbox: string;
	waitingApproval: string;
	connectSuccess: string;
	baseDirectory: string;
	baseDirectoryDescription: string;
	baseDirectoryPlaceholder: string;
	useTrash: string;
	useTrashDescription: string;
	authorizationFailed: Snippet<string>;
};

type ConnectModalOptions = {
	translate: Translate<DropboxTranslations & Translations>;
	url: string;
	onClose: () => void;
};

class ConnectModal extends Modal {
	constructor(
		app: App,
		private readonly options: ConnectModalOptions,
	) {
		super(app);
	}

	onOpen(): void {
		const {
			contentEl,
			titleEl,
			options: { translate, url },
		} = this;
		titleEl.setText(translate('connectTitle'));
		contentEl.addClass('markdown-rendered');
		contentEl.createEl('p', { text: translate('connectInstruction', url) });
		contentEl.createEl('p', { cls: 'dropbox-auth-status', text: translate('waitingApproval') });
		new Setting(contentEl)
			.addButton((button) =>
				button
					.setButtonText(translate('cancel'))
					.setDestructive()
					.onClick(() => this.close()),
			)
			.addButton((button) =>
				button
					.setCta()
					.setButtonText(translate('openDropbox'))
					.onClick(() => {
						window.open(url);
						button.setIcon('check');
					}),
			);
	}

	onClose(): void {
		this.contentEl.empty();
		this.options.onClose();
	}
}

export default function dropboxSetting(
	{
		translate,
		saveSettings,
		app,
		matchLabel,
		refreshSettingTab,
		dispatch,
	}: {
		translate: Translate<DropboxTranslations>;
		saveSettings: () => Promise<void>;
		app: App;
		matchLabel: () => LabelDefinition;
		refreshSettingTab: () => void;
		dispatch: Dispatch<Events>;
	},
	settings: DropboxSettings,
	tokenManager: TokenManager,
	pending: PendingAuthorization,
): CallableOrObjectTree {
	const connectDropbox = async () => {
		let cancelled = false;
		try {
			const { state, url, verifier } = await startAuthorization();
			const modal = new ConnectModal(app, {
				onClose: () => {
					cancelled = true;
					pending.cancel(state);
				},
				translate,
				url,
			});
			modal.open();
			try {
				const { code } = await pending.waitFor(state);
				const { accessToken, accountId, expiresIn, refreshToken } =
					await exchangeCodeForTokens({ code, verifier });
				tokenManager.setRefreshToken(refreshToken);
				settings.accountId = accountId;
				tokenManager.setToken(accessToken, expiresIn);
				void saveSettings();
				new Notice(translate('connectSuccess'));
				refreshSettingTab();
			} finally {
				modal.close();
			}
		} catch (error) {
			if (cancelled) return;
			const parsedError = toError(error);
			new Notice(translate('authorizationFailed', parsedError.message), 5);
			dispatch('errorGeneral', describeError(parsedError, 'Dropbox auth failed'));
		}
	};

	return {
		803: s(
			(self) => ({
				heading: translate('dropbox'),
				items: Object.values(self).map((node) => node(node) as SettingGroupItem),
				type: 'group',
			}),
			{
				1000: s(() => ({
					desc: translate('connectAccountDescription'),
					name: translate('connectAccount'),
					render: (setting) => {
						setting.addButton((button) =>
							button
								.setButtonText(translate('connect'))
								.setCta()
								.onClick(() => connectDropbox()),
						);
					},
					visible: () => !tokenManager.getRefreshToken(),
				})),
				1100: s(() => ({
					desc: translate('connectSuccess'),
					name: translate('accountConnected'),
					render: (setting) => {
						setting.addButton((button) =>
							button
								.setButtonText(translate('disconnect'))
								.setDestructive()
								.onClick(async () => {
									if (tokenManager.getRefreshToken()) {
										await tokenManager.deleteRefreshToken();
										settings.accountId = '';
										tokenManager.invalidate();
										void saveSettings();
									}
									refreshSettingTab();
								}),
						);
					},
					visible: () => Boolean(tokenManager.getRefreshToken()),
				})),
				2000: s(() => ({
					desc: translate('baseDirectoryDescription'),
					labels: [matchLabel()],
					name: translate('baseDirectory'),
					render: (setting) => {
						setting.addText((text) => {
							text.setPlaceholder(translate('baseDirectoryPlaceholder'))
								.setValue(settings.baseDirectory)
								.inputEl.addEventListener('blur', () => {
									const normalized = normalizeBaseDir(text.getValue().trim());
									text.setValue(normalized);
									settings.baseDirectory = normalized;
									void saveSettings();
								});
						});
					},
				})),
				3000: s(() => ({
					desc: translate('useTrashDescription'),
					name: translate('useTrash'),
					render: (setting) => {
						setting.addToggle((toggle) =>
							toggle.setValue(settings.useTrash).onChange((value) => {
								settings.useTrash = value;
								void saveSettings();
							}),
						);
					},
				})),
			},
		),
	};
}
