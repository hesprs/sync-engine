import type { GdriveSettings } from '@';
import type {
	CallableOrObjectTree,
	Fragment,
	LabelDefinition,
	Translate,
	Translations,
} from '@hesprs/sync-engine-sdk';
import type { App, SettingGroupItem } from 'obsidian';
import { s } from '@hesprs/sync-engine-sdk';
import { normalizeBaseDir } from '@repo/shared/path';
import { Modal, Notice, Setting } from 'obsidian';
import type { TokenManager } from './gdrive/auth';
import { pollDeviceToken, revokeToken, startDeviceAuthorization } from './gdrive/auth';
import handleInput from './handle-input';

export type GdriveTranslations = {
	gdrive: string;
	connectAccount: string;
	accountConnected: string;
	accountConnectedDescription: string;
	connectAccountDescription: string;
	connect: string;
	disconnect: string;
	configureFirst: string;
	deviceCodeTitle: string;
	deviceCodeInstruction: Fragment<string>;
	copyAndOpenGoogle: string;
	waitingApproval: string;
	connectSuccess: string;
	baseDirectory: string;
	baseDirectoryDescription: string;
	baseDirectoryPlaceholder: string;
	useTrash: string;
	useTrashDescription: string;
	authorizationFailed: string;
};

type DeviceCodeModalOptions = {
	translate: Translate<GdriveTranslations & Translations>;
	userCode: string;
	verificationUrl: string;
	onClose: () => void;
};

class DeviceCodeModal extends Modal {
	constructor(
		app: App,
		private readonly options: DeviceCodeModalOptions,
	) {
		super(app);
	}

	onOpen(): void {
		const {
			contentEl,
			titleEl,
			options: { translate, userCode, verificationUrl },
		} = this;
		titleEl.setText(translate('deviceCodeTitle'));
		contentEl.addClass('markdown-rendered');
		contentEl.createEl('p', {
			text: translate('deviceCodeInstruction', verificationUrl),
		});
		contentEl.createEl('code', { cls: 'gdrive-device-code', text: userCode });
		contentEl.createEl('p', {
			cls: 'gdrive-device-code-status',
			text: translate('waitingApproval'),
		});
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
					.setButtonText(translate('copyAndOpenGoogle'))
					.onClick(() => {
						void navigator.clipboard.writeText(userCode);
						window.open(verificationUrl);
						button.setIcon('check');
					}),
			);
	}
	onClose(): void {
		this.contentEl.empty();
		this.options.onClose();
	}
}

export default function gdriveSetting(
	{
		translate,
		saveSettings,
		app,
		matchLabel,
		refreshSettingTab,
	}: {
		translate: Translate<GdriveTranslations & Translations>;
		saveSettings: () => Promise<void>;
		app: App;
		matchLabel: () => LabelDefinition;
		refreshSettingTab: () => void;
	},
	settings: GdriveSettings,
	tokenManager: TokenManager,
): CallableOrObjectTree {
	const invalidValue = translate('invalidValue');
	const connectGoogle = async (resolve: () => void) => {
		let cancelled = false;
		try {
			const authorization = await startDeviceAuthorization();
			const modal = new DeviceCodeModal(app, {
				onClose: () => {
					cancelled = true;
					resolve();
				},
				translate,
				userCode: authorization.userCode,
				verificationUrl: authorization.verificationUrl,
			});
			modal.open();
			try {
				const { refreshToken, userId, accessToken, expiresIn } = await pollDeviceToken({
					authorization,
					isCancelled: () => cancelled,
				});
				tokenManager.setRefreshToken(refreshToken);
				settings.userId = userId;
				tokenManager.setToken(accessToken, expiresIn);
				void saveSettings();
				new Notice(translate('connectSuccess'));
				refreshSettingTab();
			} finally {
				modal.close();
			}
		} catch (error) {
			if (!cancelled)
				new Notice(
					translate('authorizationFailed', {
						reason: error instanceof Error ? error.message : String(error),
					}),
				);
		} finally {
			resolve();
		}
	};

	return {
		551: s(
			(self) => ({
				heading: translate('gdrive'),
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
								.onClick(
									() =>
										new Promise<void>((resolve) => {
											void connectGoogle(resolve);
										}),
								),
						);
					},
					visible: () => !tokenManager.getRefreshToken(),
				})),
				1100: s(() => ({
					desc: translate('accountConnectedDescription'),
					name: translate('accountConnected'),
					render: (setting) => {
						setting.addButton((button) =>
							button
								.setButtonText(translate('disconnect'))
								.setDestructive()
								.onClick(async () => {
									const token = tokenManager.getRefreshToken();
									if (!token) return;
									await revokeToken(token);
									settings.userId = '';
									tokenManager.deleteRefreshToken();
									tokenManager.invalidate();
									void saveSettings();
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
							text.setPlaceholder(translate('baseDirectoryPlaceholder')).setValue(
								settings.baseDirectory,
							);
							handleInput({
								invalidValue,
								key: 'baseDirectory',
								processValue: (original) => normalizeBaseDir(original.trim()),
								saveSettings,
								settings,
								text,
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
