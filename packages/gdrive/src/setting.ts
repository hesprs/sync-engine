import type { GdriveSettings } from '@';
import type {
	CallableOrObjectTree,
	LabelDefinition,
	Translate,
	Translations,
} from '@hesprs/sync-engine-sdk';
import type { App, SettingGroupItem } from 'obsidian';
import { s } from '@hesprs/sync-engine-sdk';
import { normalizeBaseDir } from '@repo/shared/path';
import { Modal, Notice } from 'obsidian';
import type { TokenManager } from './gdrive/auth';
import { pollDeviceToken, startDeviceAuthorization } from './gdrive/auth';
import handleInput from './handle-input';

export type GdriveTranslations = {
	gdrive: string;
	clientId: string;
	clientIdDescription: string;
	clientIdPlaceholder: string;
	clientSecret: string;
	clientSecretDescription: string;
	account: string;
	accountConnected: string;
	accountNotConnected: string;
	connect: string;
	reconnect: string;
	disconnect: string;
	disconnected: string;
	configureFirst: string;
	deviceCodeTitle: string;
	deviceCodeInstruction: string;
	copyCode: string;
	codeCopied: string;
	openVerificationPage: string;
	waitingApproval: string;
	connectSuccess: string;
	baseDirectory: string;
	baseDirectoryDescription: string;
	baseDirectoryPlaceholder: string;
	useTrash: string;
	useTrashDescription: string;
};

type DeviceCodeModalOptions = {
	translate: Translate<GdriveTranslations>;
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

	override onOpen(): void {
		const {
			contentEl,
			titleEl,
			options: { translate, userCode, verificationUrl },
		} = this;
		titleEl.setText(translate('deviceCodeTitle'));
		contentEl.createEl('p', {
			text: translate('deviceCodeInstruction', { url: verificationUrl }),
		});
		contentEl.createEl('code', {
			cls: 'gdrive-device-code',
			text: userCode,
		});
		const buttonRow = contentEl.createEl('div', 'gdrive-device-code-buttons');
		const copyButton = buttonRow.createEl('button', { text: translate('copyCode') });
		copyButton.onClickEvent(() => {
			void navigator.clipboard.writeText(this.options.userCode);
			copyButton.setText(translate('codeCopied'));
		});
		const openButton = buttonRow.createEl('button', {
			cls: 'mod-cta',
			text: translate('openVerificationPage'),
		});
		openButton.addEventListener('click', () => {
			window.open(this.options.verificationUrl);
		});
		contentEl.createEl('p', {
			cls: 'gdrive-device-code-status',
			text: translate('waitingApproval'),
		});
	}

	override onClose(): void {
		this.options.onClose();
		this.contentEl.empty();
	}
}

export default function gdriveSetting(
	{
		translate,
		saveSettings,
		app,
		matchLabel,
		rerenderSettingTab,
	}: {
		translate: Translate<GdriveTranslations & Translations>;
		saveSettings: () => Promise<void>;
		app: App;
		matchLabel: () => LabelDefinition;
		rerenderSettingTab: () => void;
	},
	settings: GdriveSettings,
	tokenManager: TokenManager,
): CallableOrObjectTree {
	const invalidValue = translate('invalidValue');
	const connectGoogle = async () => {
		let cancelled = false;
		try {
			const authorization = await startDeviceAuthorization();
			let finished = false;
			const modal = new DeviceCodeModal(app, {
				onClose: () => {
					if (!finished) cancelled = true;
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
				finished = true;
				tokenManager.setRefreshToken(refreshToken);
				settings.userId = userId;
				tokenManager.setToken(accessToken, expiresIn);
				await saveSettings();
				tokenManager.invalidate();
				new Notice(translate('connectSuccess'));
			} finally {
				finished = true;
				modal.close();
			}
			rerenderSettingTab();
		} catch (error) {
			if (!cancelled) new Notice(error instanceof Error ? error.message : String(error));
		}
	};
	const refreshToken = tokenManager.getRefreshToken();

	return {
		551: s(
			(self) => ({
				heading: translate('gdrive'),
				items: Object.values(self).map((node) => node(node) as SettingGroupItem),
				type: 'group',
			}),
			{
				1000: s(() => ({
					desc: refreshToken
						? translate('accountConnected')
						: translate('accountNotConnected'),
					name: translate('account'),
					render: (setting) => {
						if (refreshToken)
							setting.addButton((button) =>
								button.setButtonText(translate('disconnect')).onClick(() => {
									tokenManager.deleteRefreshToken();
									tokenManager.invalidate();
									void saveSettings();
									new Notice(translate('disconnected'));
									rerenderSettingTab();
								}),
							);
						setting.addButton((button) =>
							button
								.setButtonText(
									refreshToken ? translate('reconnect') : translate('connect'),
								)
								.setCta()
								.onClick(async () => {
									button.setDisabled(true);
									try {
										await connectGoogle();
									} finally {
										button.setDisabled(false);
									}
								}),
						);
					},
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
