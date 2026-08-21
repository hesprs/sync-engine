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
import { Modal, Notice, SecretComponent } from 'obsidian';
import type { TokenManager } from './gdrive/auth';
import { REFRESH_TOKEN_SECRET_ID, pollDeviceToken, startDeviceAuthorization } from './gdrive/auth';
import requestUrlHttp from './gdrive/auth-http';
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
	title: string;
	instruction: string;
	userCode: string;
	verificationUrl: string;
	copyLabel: string;
	copiedLabel: string;
	openLabel: string;
	waitingLabel: string;
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
		const { contentEl, titleEl } = this;
		titleEl.setText(this.options.title);
		contentEl.createEl('p', { text: this.options.instruction });
		const codeEl = contentEl.createEl('div', { text: this.options.userCode });
		codeEl.setCssStyles({
			fontSize: '2em',
			fontWeight: '700',
			letterSpacing: '0.15em',
			margin: '0.5em 0',
			textAlign: 'center',
			userSelect: 'text',
		});
		const buttonRow = contentEl.createEl('div');
		buttonRow.setCssStyles({
			display: 'flex',
			gap: '0.5em',
			justifyContent: 'center',
			marginBottom: '0.75em',
		});
		const copyButton = buttonRow.createEl('button', { text: this.options.copyLabel });
		copyButton.addEventListener('click', () => {
			void navigator.clipboard.writeText(this.options.userCode);
			copyButton.setText(this.options.copiedLabel);
		});
		const openButton = buttonRow.createEl('button', {
			cls: 'mod-cta',
			text: this.options.openLabel,
		});
		openButton.addEventListener('click', () => {
			window.open(this.options.verificationUrl);
		});
		const statusEl = contentEl.createEl('p', { text: this.options.waitingLabel });
		statusEl.setCssStyles({ opacity: '0.7', textAlign: 'center' });
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
		const clientId = settings.clientId.trim();
		const clientSecret = app.secretStorage.getSecret(settings.clientSecret);
		if (!clientId || clientSecret === null || clientSecret === '') {
			new Notice(translate('configureFirst'));
			return;
		}
		let cancelled = false;
		try {
			const authorization = await startDeviceAuthorization(requestUrlHttp, clientId);
			let finished = false;
			const modal = new DeviceCodeModal(app, {
				copiedLabel: translate('codeCopied'),
				copyLabel: translate('copyCode'),
				instruction: translate('deviceCodeInstruction', {
					url: authorization.verificationUrl,
				}),
				onClose: () => {
					if (!finished) cancelled = true;
				},
				openLabel: translate('openVerificationPage'),
				title: translate('deviceCodeTitle'),
				userCode: authorization.userCode,
				verificationUrl: authorization.verificationUrl,
				waitingLabel: translate('waitingApproval'),
			});
			modal.open();
			try {
				const token = await pollDeviceToken(requestUrlHttp, {
					authorization,
					clientId,
					clientSecret,
					isCancelled: () => cancelled,
				});
				finished = true;
				app.secretStorage.setSecret(REFRESH_TOKEN_SECRET_ID, token.refreshToken);
				settings.refreshToken = REFRESH_TOKEN_SECRET_ID;
				if (token.email) settings.account = token.email;
				else if (!settings.account) settings.account = 'Google account';
				await saveSettings();
				tokenManager.invalidate();
				new Notice(translate('connectSuccess', { account: settings.account }));
			} finally {
				finished = true;
				modal.close();
			}
			rerenderSettingTab();
		} catch (error) {
			if (!cancelled) new Notice(error instanceof Error ? error.message : String(error));
		}
	};

	return {
		683: s(
			(self) => ({
				heading: translate('gdrive'),
				items: Object.values(self).map((node) => node(node) as SettingGroupItem),
				type: 'group',
			}),
			{
				1000: s(() => ({
					desc: translate('clientIdDescription'),
					name: translate('clientId'),
					render: (setting) => {
						setting.addText((text) => {
							text.setPlaceholder(translate('clientIdPlaceholder')).setValue(
								settings.clientId,
							);
							handleInput({
								invalidValue,
								key: 'clientId',
								processValue: (value) => value.trim(),
								saveSettings,
								settings,
								text,
							});
						});
					},
				})),
				2000: s(() => ({
					desc: translate('clientSecretDescription'),
					name: translate('clientSecret'),
					render: (setting) => {
						setting.addComponent((element) =>
							new SecretComponent(app, element)
								.setValue(settings.clientSecret)
								.onChange((value) => {
									settings.clientSecret = value ?? '';
									void saveSettings();
								}),
						);
					},
				})),
				3000: s(() => ({
					desc: settings.refreshToken
						? translate('accountConnected', { account: settings.account })
						: translate('accountNotConnected'),
					name: translate('account'),
					render: (setting) => {
						if (settings.refreshToken)
							setting.addButton((button) =>
								button.setButtonText(translate('disconnect')).onClick(() => {
									settings.refreshToken = '';
									settings.account = '';
									tokenManager.invalidate();
									void saveSettings();
									new Notice(translate('disconnected'));
									rerenderSettingTab();
								}),
							);
						setting.addButton((button) =>
							button
								.setButtonText(
									settings.refreshToken
										? translate('reconnect')
										: translate('connect'),
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
				4000: s(() => ({
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
				5000: s(() => ({
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
