import deviceType from '@/utils';
import { settingEntry as s } from '@hesprs/sync-engine-sdk';
import { Notice, SecretComponent } from 'obsidian';
import type { CollaborationTranslations } from '@/i18n';
import type { CallableOrObjectTree, MaybePromise, Translate } from '@hesprs/sync-engine-sdk';
import type { App, SettingGroupItem, TextComponent } from 'obsidian';

export type CollaborationSettings = {
	brokerUrl: string;
	clientIdPrefix: string;
	enabled: boolean;
	passwordSecretId: string;
	roomSecretId: string;
	showMobileStatusIcon?: boolean;
	username: string;
};
export type CollaborationStatus =
	| 'connected'
	| 'connecting'
	| 'disabled'
	| 'error'
	| 'missing-room'
	| 'reconnecting';

export default function collaborationSetting(
	ctx: {
		app: App;
		copyRoomCode: () => MaybePromise<boolean>;
		copyTopic: () => MaybePromise<boolean>;
		generateRoomCode: () => MaybePromise<boolean>;
		getStatus: () => { error?: Error; status: CollaborationStatus };
		getTopic: () => string | undefined;
		reconnect: () => MaybePromise<void>;
		refreshSettingTab: () => void;
		rerenderSettingTab: () => void;
		saveSettings: () => MaybePromise<void>;
		translate: Translate<CollaborationTranslations>;
	},
	settings: CollaborationSettings,
): CallableOrObjectTree {
	const { translate, saveSettings, refreshSettingTab } = ctx;
	const saveAndReconnect = () => {
		void saveSettings();
		void ctx.reconnect();
	};
	const textField =
		(
			key: 'brokerUrl' | 'clientIdPrefix' | 'username',
			placeholder: string,
			sanitize: (value: string) => string | undefined,
		) =>
		(text: TextComponent) => {
			text.setValue(settings[key])
				.setPlaceholder(placeholder)
				.inputEl.addEventListener('blur', () => {
					const value = sanitize(text.getValue());
					if (value === undefined) {
						text.inputEl.addClass('sync-engine-invalid-input');
						return;
					}
					text.inputEl.removeClass('sync-engine-invalid-input');
					if (settings[key] === value) return;
					settings[key] = value;
					text.setValue(value);
					saveAndReconnect();
				});
		};
	const statusText = () => {
		const { status, error } = ctx.getStatus();
		const text =
			status === 'connected'
				? translate('statusConnected')
				: status === 'connecting'
					? translate('statusConnecting')
					: status === 'reconnecting'
						? translate('statusReconnecting')
						: status === 'disabled'
							? translate('statusDisabled')
							: status === 'missing-room'
								? translate('statusMissingRoomCode')
								: translate('statusError');
		return error ? `${text}: ${error.message}` : text;
	};
	return {
		3050: s(
			(self) => ({
				heading: translate('collaboration'),
				items: Object.values(self).map((node) => node(node) as SettingGroupItem),
				type: 'group',
			}),
			{
				1000: s(() => ({
					desc: translate('enableCollaborationDescription'),
					name: translate('enableCollaboration'),
					render: (setting) => {
						setting.addToggle((toggle) =>
							toggle.setValue(settings.enabled).onChange((enabled) => {
								settings.enabled = enabled;
								saveAndReconnect();
							}),
						);
					},
				})),
				2000: s(() => ({
					desc: statusText(),
					name: translate('status'),
					render: (setting) => {
						setting.addButton((button) =>
							button.setButtonText(translate('reconnect')).onClick(() => {
								void Promise.resolve(ctx.reconnect()).finally(refreshSettingTab);
							}),
						);
					},
				})),
				2100: s(() => ({
					desc: translate('topicDescription'),
					name: translate('topic'),
					render: (setting) => {
						setting.addButton((button) =>
							button
								.setButtonText(translate('copyTopic'))
								.setDisabled(ctx.getTopic() === undefined)
								.onClick(() => {
									void Promise.resolve(ctx.copyTopic())
										.then((copied) => {
											if (copied) new Notice(translate('topicCopied'));
										})
										.catch((error: unknown) => {
											new Notice(
												error instanceof Error
													? error.message
													: String(error),
											);
										});
								}),
						);
					},
				})),
				3000: s(() => ({
					desc: translate('brokerUrlDescription'),
					name: translate('brokerUrl'),
					render: (setting) => {
						setting.addText(
							textField('brokerUrl', translate('brokerUrlPlaceholder'), (value) => {
								try {
									const url = new URL(value.trim());
									if (url.protocol !== 'ws:' && url.protocol !== 'wss:') return;
									return url.toString();
								} catch {
									// Invalid broker URLs keep the previous value.
								}
							}),
						);
					},
				})),
				3100: s(() => ({
					desc: translate('usernameDescription'),
					name: translate('username'),
					render: (setting) => {
						setting.addText(
							textField('username', translate('usernamePlaceholder'), (value) =>
								value.trim(),
							),
						);
					},
				})),
				3200: s(() => ({
					desc: translate('passwordDescription'),
					name: translate('password'),
					render: (setting) => {
						setting.addComponent((element) =>
							new SecretComponent(ctx.app, element)
								.setValue(settings.passwordSecretId)
								.onChange((value) => {
									settings.passwordSecretId = value ?? '';
									saveAndReconnect();
								}),
						);
					},
				})),
				4000: s(() => ({
					desc: translate('clientIdPrefixDescription'),
					name: translate('clientIdPrefix'),
					render: (setting) => {
						setting.addText(
							textField('clientIdPrefix', deviceType(), (value) => {
								const normalized = value.trim().replaceAll(/[^A-Za-z0-9_-]/gu, '');
								return normalized || deviceType();
							}),
						);
					},
				})),
				5000: s(() => ({
					desc: translate('roomCodeDescription'),
					name: translate('roomCode'),
					render: (setting) => {
						setting
							.addComponent((element) =>
								new SecretComponent(ctx.app, element)
									.setValue(settings.roomSecretId)
									.onChange((value) => {
										settings.roomSecretId = value ?? '';
										saveAndReconnect();
									}),
							)
							.addButton((button) =>
								button.setButtonText(translate('generateRoomCode')).onClick(() => {
									void Promise.resolve(ctx.generateRoomCode())
										.then((copied) => {
											if (copied) new Notice(translate('roomCodeCopied'));
											ctx.rerenderSettingTab();
										})
										.catch((error: unknown) => {
											new Notice(
												error instanceof Error
													? error.message
													: String(error),
											);
										});
								}),
							)
							.addButton((button) =>
								button.setButtonText(translate('copyRoomCode')).onClick(() => {
									void Promise.resolve(ctx.copyRoomCode())
										.then((copied) => {
											if (copied) new Notice(translate('roomCodeCopied'));
										})
										.catch((error: unknown) => {
											new Notice(
												error instanceof Error
													? error.message
													: String(error),
											);
										});
								}),
							);
					},
				})),
			},
		),
	};
}
