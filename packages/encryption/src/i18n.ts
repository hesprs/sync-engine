import type { EncryptionTranslations } from '@/setting';

export const en: EncryptionTranslations = {
	considerMigratingRemote: 'Consider migrating remote',
	considerMigratingRemoteDescription:
		'A component in the encryption formula changed due to a change in Sync Engine. Your current encrypted remote files will be incompatible with the newest version after April 17, 2027. A manual remote migration is needed during the window.',
	critical: 'Critical',
	criticalLabelTooltip: 'Action required',
	detail: 'Detail',
	encryption: 'Encryption',
	encryptionDescription:
		'Encrypt files before upload and decrypt files when download. Encryption password is stored in Obsidian keychain.',
	encryptionMigration: (mode) =>
		createFragment((frag) => {
			if (mode) {
				frag.createEl('p', {
					text: 'You should be cautious about following points before enabling encryption:',
				});
				const ol = frag.createEl('ol');
				ol.createEl('li', { text: 'All subsequent uploads will be encrypted.' });
				ol.createEl('li', { text: 'Please ensure all devices have encryption enabled.' });
				ol.createEl('li', {
					text: 'Migration is necessary if you have previously synchronized without encryption.',
				});
				const li = ol.createEl('li', {
					text: 'You should ensure all the items are identical on all your devices:',
				});
				const ul = li.createEl('ul');
				const subItems = ['encryption password', 'server URL', 'account name'];
				subItems.forEach((item) => ul.createEl('li', { text: item }));
				ol.createEl('li', {
					text: "The encryption algorithm binds the decryption key to the server identity. This provides better security, but it also means that if you move encrypted files to a different server, you won't be able to decrypt it.",
				});
				ol.createEl('li', {
					text: 'Please avoid managing encrypted files manually on the server.',
				});
			} else {
				frag.createEl('p', {
					text: 'You should be cautious about following points before disabling encryption:',
				});
				const ol = frag.createEl('ol');
				ol.createEl('li', {
					text: 'All subsequent uploads will be in plaintext without encryption.',
				});
				ol.createEl('li', { text: 'Please ensure all devices have encryption disabled.' });
				ol.createEl('li', {
					text: 'Migration is necessary if this vault was previously synchronized with encryption.',
				});
			}
		}),
	migrationExplanation: () =>
		createFragment((frag) => {
			frag.createEl('p', {
				text: 'Sync Engine changed URL canonicalization standard, and since one of the factors of the decryption key derivation is the URL, your existing encrypted remote files cannot be decrypted once you switch to the new standard.',
			});
			const p = frag.createEl('p', {
				text: 'The compatibility window will be ended after April 17, 2027. Before that date, encryption can still function normally but a ',
			});
			p.createEl('a', {
				attr: { href: 'https://sync.consensia.cc/usage/remote-migration' },
				text: 'remote migration',
			});
			p.appendText(' needs to be performed.');
			frag.createEl('p', {
				text: 'We are very sorry to create such a trouble, but this is for sync correctness. The change should only affect a small range of users. If you see this, it means you are affected.',
			});
			frag.createEl('p', {
				text: 'If you are ready to switch to the new standard, please click "confirm". This action cannot be undone.',
			});
		}),
	pleaseSetPassword: 'Please set an encryption password!',
};

export const zh: EncryptionTranslations = {
	considerMigratingRemote: '考虑迁移远程数据',
	considerMigratingRemoteDescription:
		'由于 Sync Engine 的变更，加密公式中的某个组件发生了变化。您当前的加密远程文件在 2027 年 4 月 17 日之后将与最新版本不兼容。请在该窗口期内手动迁移远程数据。',
	critical: '重要',
	criticalLabelTooltip: '需要处理',
	detail: '详情',
	encryption: '加密',
	encryptionDescription:
		'在上传前加密文件，并在下载时解密文件。加密密码将存储在 Obsidian 钥匙串中。',
	encryptionMigration: (mode) =>
		createFragment((frag) => {
			if (mode) {
				frag.createEl('p', { text: '在启用加密之前，您需要注意以下几点：' });
				const ol = frag.createEl('ol');
				ol.createEl('li', { text: '后续的所有上传都将被加密。' });
				ol.createEl('li', { text: '请确保所有设备都已启用加密。' });
				ol.createEl('li', {
					text: '如果您之前在未加密的状态下进行过同步，则需要进行数据迁移。',
				});
				const li = ol.createEl('li', {
					text: '您应当确保以下内容在您的所有设备上完全一致：',
				});
				const ul = li.createEl('ul');
				const subItems = ['加密密码', '服务器 URL', '账户名称'];
				subItems.forEach((item) => ul.createEl('li', { text: item }));
				ol.createEl('li', {
					text: '该加密算法会将解密密钥与服务器身份绑定。这提供了更好的安全性，但这也意味着，如果您将加密文件移动到其他服务器，您将无法对其进行解密。',
				});
				ol.createEl('li', { text: '请避免在服务器上手动管理已加密的文件。' });
			} else {
				frag.createEl('p', { text: '在禁用加密之前，您需要注意以下几点：' });
				const ol = frag.createEl('ol');
				ol.createEl('li', { text: '后续的所有上传都将以明文形式进行，不再加密。' });
				ol.createEl('li', { text: '请确保所有设备都已禁用加密。' });
				ol.createEl('li', {
					text: '如果此仓库之前是在加密状态下同步的，则需要进行数据迁移。',
				});
			}
		}),
	migrationExplanation: () =>
		createFragment((frag) => {
			frag.createEl('p', {
				text: 'Sync Engine 更改了 URL 规范化标准，而 URL 是解密密钥推导的因子之一，因此一旦您切换到新标准，现有的加密远程文件将无法解密。',
			});
			const p = frag.createEl('p', {
				text: '兼容窗口将在 2027 年 4 月 17 日后结束。在该日期之前，加密功能仍可正常使用，但需要进行',
			});
			p.createEl('a', {
				attr: { href: 'https://sync.consensia.cc/usage/remote-migration' },
				text: '远程迁移',
			});
			p.appendText('。');
			frag.createEl('p', {
				text: '很抱歉给您带来这样的麻烦，但这是为了保证同步的正确性。此变更只会影响少部分用户。如果您看到了此提示，说明您正是受影响的用户。',
			});
			frag.createEl('p', {
				text: '如果您已准备好切换到新标准，请点击“确认”。此操作无法撤销。',
			});
		}),
	pleaseSetPassword: '请设置加密密码！',
};

export const zhTW: EncryptionTranslations = {
	considerMigratingRemote: '考慮遷移遠端資料',
	considerMigratingRemoteDescription:
		'由於 Sync Engine 的變更，加密公式中的某個組件發生了變化。您目前的加密遠端檔案在 2027 年 4 月 17 日之後將與最新版本不相容。請在該窗口期內手動遷移遠端資料。',
	critical: '重要',
	criticalLabelTooltip: '需要處理',
	detail: '詳情',
	encryption: '加密',
	encryptionDescription:
		'在上傳前加密檔案，並在下載時解密檔案。加密密碼儲存於 Obsidian 金鑰圈中。',
	encryptionMigration: (mode) =>
		createFragment((frag) => {
			if (mode) {
				frag.createEl('p', { text: '在啟用加密前，請務必留意以下幾點：' });
				const ol = frag.createEl('ol');
				ol.createEl('li', { text: '後續的所有上傳都將進行加密。' });
				ol.createEl('li', { text: '請確保所有裝置皆已啟用加密。' });
				ol.createEl('li', { text: '若您先前曾於未加密的狀態下進行同步，則必須執行遷移。' });
				const li = ol.createEl('li', { text: '您應確保所有裝置上的以下項目完全一致：' });
				const ul = li.createEl('ul');
				const subItems = ['加密密碼', '伺服器 URL', '帳號名稱'];
				subItems.forEach((item) => ul.createEl('li', { text: item }));
				ol.createEl('li', {
					text: '此加密演算法會將解密金鑰與伺服器識別資訊綁定。這能提供更好的安全性，但也意味著若您將加密檔案移至其他伺服器，您將無法解密該檔案。',
				});
				ol.createEl('li', { text: '請避免在伺服器端手動管理加密檔案。' });
			} else {
				frag.createEl('p', { text: '在停用加密前，請務必留意以下幾點：' });
				const ol = frag.createEl('ol');
				ol.createEl('li', { text: '後續的所有上傳都將以未加密的明文形式進行。' });
				ol.createEl('li', { text: '請確保所有裝置皆已停用加密。' });
				ol.createEl('li', {
					text: '若此儲存庫先前是在啟用加密的狀態下同步，則必須執行遷移。',
				});
			}
		}),
	migrationExplanation: () =>
		createFragment((frag) => {
			frag.createEl('p', {
				text: 'Sync Engine 變更了 URL 正規化標準，而 URL 是解密金鑰推導的因子之一，因此一旦您切換至新標準，現有的加密遠端檔案將無法解密。',
			});
			const p = frag.createEl('p', {
				text: '相容性窗口將於 2027 年 4 月 17 日後結束。在該日期之前，加密功能仍可正常運作，但需要進行',
			});
			p.createEl('a', {
				attr: { href: 'https://sync.consensia.cc/usage/remote-migration' },
				text: '遠端遷移',
			});
			p.appendText('。');
			frag.createEl('p', {
				text: '很抱歉造成您的困擾，但這是為了確保同步的正確性。此變更僅會影響少數使用者。若您看到此提示，代表您正是受影響的使用者。',
			});
			frag.createEl('p', {
				text: '若您已準備好切換至新標準，請點擊「確認」。此操作無法復原。',
			});
		}),
	pleaseSetPassword: '請設定加密密碼！',
};

export const ru: EncryptionTranslations = {
	considerMigratingRemote: 'Рассмотрите миграцию удалённого хранилища',
	considerMigratingRemoteDescription:
		'Из-за изменения в Sync Engine один из компонентов формулы шифрования изменился. Ваши текущие зашифрованные удалённые файлы станут несовместимы с новейшей версией после 17 апреля 2027 года. В течение этого окна необходимо вручную выполнить миграцию удалённого хранилища.',
	critical: 'Важно',
	criticalLabelTooltip: 'Требуется действие',
	detail: 'Подробности',
	encryption: 'Шифрование',
	encryptionDescription:
		'Шифровать файлы перед загрузкой на сервер и расшифровывать их при скачивании. Пароль шифрования хранится в связке ключей Obsidian.',
	encryptionMigration: (mode) =>
		createFragment((frag) => {
			if (mode) {
				frag.createEl('p', {
					text: 'Обратите внимание на следующее перед включением шифрования:',
				});
				const ol = frag.createEl('ol');
				ol.createEl('li', { text: 'Все последующие загрузки будут зашифрованы.' });
				ol.createEl('li', {
					text: 'Убедитесь, что шифрование включено на всех устройствах.',
				});
				ol.createEl('li', {
					text: 'Миграция необходима, если ранее вы синхронизировали данные без шифрования.',
				});
				const li = ol.createEl('li', {
					text: 'Убедитесь, что следующие параметры совпадают на всех ваших устройствах:',
				});
				const ul = li.createEl('ul');
				const subItems = ['пароль шифрования', 'URL-адрес сервера', 'имя аккаунта'];
				subItems.forEach((item) => ul.createEl('li', { text: item }));
				ol.createEl('li', {
					text: 'Алгоритм шифрования привязывает ключ расшифровки к идентификатору сервера. Это обеспечивает более высокую безопасность, но также означает, что при перемещении зашифрованных файлов на другой сервер вы не сможете их расшифровать.',
				});
				ol.createEl('li', {
					text: 'Не управляйте зашифрованными файлами вручную на сервере.',
				});
			} else {
				frag.createEl('p', {
					text: 'Обратите внимание на следующее перед отключением шифрования:',
				});
				const ol = frag.createEl('ol');
				ol.createEl('li', {
					text: 'Все последующие загрузки будут выполняться в открытом виде без шифрования.',
				});
				ol.createEl('li', {
					text: 'Убедитесь, что шифрование отключено на всех устройствах.',
				});
				ol.createEl('li', {
					text: 'Миграция необходима, если это хранилище ранее синхронизировалось с включённым шифрованием.',
				});
			}
		}),
	migrationExplanation: () =>
		createFragment((frag) => {
			frag.createEl('p', {
				text: 'Sync Engine изменил стандарт канонизации URL, а URL является одним из факторов вывода ключа расшифровки, поэтому ваши существующие зашифрованные удалённые файлы не удастся расшифровать после перехода на новый стандарт.',
			});
			const p = frag.createEl('p', {
				text: 'Окно совместимости закроется после 17 апреля 2027 года. До этой даты шифрование продолжит работать нормально, но необходимо выполнить ',
			});
			p.createEl('a', {
				attr: { href: 'https://sync.consensia.cc/usage/remote-migration' },
				text: 'миграцию удалённого хранилища',
			});
			p.appendText('.');
			frag.createEl('p', {
				text: 'Мы приносим извинения за причинённые неудобства, но это необходимо для корректности синхронизации. Изменение затронет лишь небольшую часть пользователей. Если вы видите это сообщение, значит, вы затронуты.',
			});
			frag.createEl('p', {
				text: 'Если вы готовы перейти на новый стандарт, нажмите «Подтвердить». Это действие нельзя отменить.',
			});
		}),
	pleaseSetPassword: 'Пожалуйста, задайте пароль для шифрования!',
};
