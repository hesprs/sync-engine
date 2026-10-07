import type { Fragment, Snippet } from '@hesprs/sync-engine-sdk';
import type { WebdavTranslations } from '@/setting';

function createCapabilityDesc({
	supporting,
	unsupporting,
	defaulting,
}: {
	supporting: Snippet<string>;
	unsupporting: Snippet<string>;
	defaulting: Snippet<string>;
}) {
	return ({
		description,
		supported,
		unsupported,
		defaulted,
	}: {
		description: string | Fragment;
		supported: string;
		unsupported: string;
		defaulted: string;
	}): Fragment =>
		() =>
			createFragment((frag) => {
				frag.createEl('p', {
					text: typeof description === 'string' ? description : description(),
				});
				const ul = frag.createEl('ul');
				ul.createEl('li', { text: supporting(supported) });
				ul.createEl('li', { text: unsupporting(unsupported) });
				frag.createEl('p', { text: defaulting(defaulted) });
			});
}

const enCapabilityDesc = createCapabilityDesc({
	defaulting: (def) => `Leave it ${def} if your server isn't mentioned above.`,
	supporting: (supported) => `Support this: ${supported}.`,
	unsupporting: (unsupported) => `Don't support this: ${unsupported}.`,
});
const zhCapabilityDesc = createCapabilityDesc({
	defaulting: (def) => `如果您的服务器不在上述列表中，保持${def}。`,
	supporting: (supported) => `支持此功能：${supported}。`,
	unsupporting: (unsupported) => `不支持此功能：${unsupported}。`,
});
const ruCapabilityDesc = createCapabilityDesc({
	defaulting: (def) => `Если ваш сервер не упомянут выше, оставьте ${def}.`,
	supporting: (supported) => `Поддерживают: ${supported}.`,
	unsupporting: (unsupported) => `Не поддерживают: ${unsupported}.`,
});
const zhTWCapsDesc = createCapabilityDesc({
	defaulting: (def) => `如果您的伺服器不在上述列表中，保持${def}。`,
	supporting: (supported) => `支援此功能：${supported}。`,
	unsupporting: (unsupported) => `不支援此功能：${unsupported}。`,
});

export const en: WebdavTranslations = {
	baseDirectory: 'Base directory',
	baseDirectoryDescription:
		'Configure the folder on WebDAV that your vault will be synced to. "/" stands for the root directory.',
	baseDirectoryPlaceholder: 'Enter the directory',
	capabilities: 'Capabilities',
	capabilitiesDescription:
		'Different WebDAV servers support different features. Fine-tuning those features gives you a better syncing experience.',
	chunkedUpload: 'Chunked upload',
	chunkedUploadDescription: enCapabilityDesc({
		defaulted: 'disabled',
		description:
			'Enable Nextcloud-style chunked upload to reduce memory pressure, instead of uploading the entire file directly.',
		supported: 'Nextcloud and ownCloud',
		unsupported: 'almost WebDAV servers',
	}),
	depthInfinity: 'Use "Depth: infinity"',
	depthInfinityDescription: enCapabilityDesc({
		defaulted: 'disabled',
		description: () =>
			createFragment((frag) => {
				frag.createEl('code', { text: 'Depth: infinity' });
				frag.appendText(
					' is a special header to require WebDAV servers to list all files in one response. This could speed up remote discovery, but there\'s zero performance benefit if "Asymmetric storage" is enabled.',
				);
			}),
		supported: 'most WebDAV servers',
		unsupported: 'InfiniCLOUD, Nutstore, and Synology WebDAV with default configuration',
	}),
	endpoint: 'Server URL',
	endpointDescription: 'Enter the URL to the root directory on the WebDAV server.',
	endpointPlaceholder: 'https://example.com/webdav',
	fileMetadata: 'File metadata',
	fileMetadataDescription: enCapabilityDesc({
		defaulted: 'enabled',
		description: () =>
			createFragment((frag) => {
				frag.appendText('Store file metadata upon file upload via WebDAV ');
				frag.createEl('code', { text: 'PROPPATCH' });
				frag.appendText(
					' and retrieve upon download. Enabling this preserves metadata (e.g. file creation and modification time) across devices.',
				);
			}),
		supported: 'almost WebDAV servers',
		unsupported: 'Nutstore and Rclone WebDAV',
	}),
	password: 'Password',
	passwordDescription:
		'Enter your account password. The password is stored in Obsidian keychain.',
	pleaseConfigureAccount: 'Please configure WebDAV account!',
	username: 'Username',
	usernameDescription: 'Enter your WebDAV account username.',
	usernamePlaceholder: 'Enter your username',
	webdav: 'WebDAV',
};

export const zh: WebdavTranslations = {
	baseDirectory: '根目录',
	baseDirectoryDescription: '配置您的 vault 将同步到的 WebDAV 文件夹。"/" 代表根目录。',
	baseDirectoryPlaceholder: '请输入目录',
	capabilities: '功能',
	capabilitiesDescription:
		'不同的 WebDAV 服务器支持不同的功能。微调这些功能可以获得更好的同步体验。',
	chunkedUpload: '分块上传',
	chunkedUploadDescription: zhCapabilityDesc({
		defaulted: '禁用',
		description: '启用 Nextcloud 风格的分块上传，而非直接上传整个文件，以减轻内存压力。',
		supported: 'Nextcloud 和 ownCloud',
		unsupported: '大多数 WebDAV 服务器',
	}),
	depthInfinity: '使用 "Depth: infinity"',
	depthInfinityDescription: zhCapabilityDesc({
		defaulted: '禁用',
		description: () =>
			createFragment((frag) => {
				frag.createEl('code', { text: 'Depth: infinity' });
				frag.appendText(
					' 是发送给 WebDAV 服务器的特殊请求头，要求其在单次响应中列出所有文件。这可以加速远程探测，但如果已启用"非对称存储"，则不会带来任何性能提升。',
				);
			}),
		supported: '大多数 WebDAV 服务器',
		unsupported: 'InfiniCLOUD、坚果云和默认配置的群晖 WebDAV',
	}),
	endpoint: '服务器 URL',
	endpointDescription: '请输入 WebDAV 服务器上根目录的 URL。',
	endpointPlaceholder: 'https://example.com/webdav',
	fileMetadata: '文件元数据',
	fileMetadataDescription: zhCapabilityDesc({
		defaulted: '启用',
		description: () =>
			createFragment((frag) => {
				frag.appendText('在文件上传时通过 WebDAV ');
				frag.createEl('code', { text: 'PROPPATCH' });
				frag.appendText(
					' 存储文件元数据，并在下载时读取。启用此功能可跨设备保留元数据（如文件创建和修改时间）。',
				);
			}),
		supported: '大多数 WebDAV 服务器',
		unsupported: '坚果云和 Rclone WebDAV',
	}),
	password: '密码',
	passwordDescription: '请输入您的账户密码。密码将存储在 Obsidian 钥匙串中。',
	pleaseConfigureAccount: '请配置 WebDAV 账户！',
	username: '用户名',
	usernameDescription: '请输入您的 WebDAV 账户用户名。',
	usernamePlaceholder: '请输入您的用户名',
	webdav: 'WebDAV',
};

export const ru: WebdavTranslations = {
	baseDirectory: 'Базовый каталог',
	baseDirectoryDescription:
		'Настройте корневую папку на сервере WebDAV, с которой будет синхронизироваться ваше хранилище. «/» обозначает корневой каталог.',
	baseDirectoryPlaceholder: 'Введите путь к каталогу',
	capabilities: 'Возможности',
	capabilitiesDescription:
		'Разные серверы WebDAV поддерживают разные функции. Тонкая настройка этих функций улучшит качество синхронизации.',
	chunkedUpload: 'Загрузка частями',
	chunkedUploadDescription: ruCapabilityDesc({
		defaulted: 'выключено',
		description:
			'Включите загрузку частями в стиле Nextcloud вместо прямой отправки файла целиком для снижения нагрузки на память.',
		supported: 'Nextcloud и ownCloud',
		unsupported: 'большинство серверов WebDAV',
	}),
	depthInfinity: 'Использовать «Depth: infinity»',
	depthInfinityDescription: ruCapabilityDesc({
		defaulted: 'выключено',
		description: () =>
			createFragment((frag) => {
				frag.createEl('code', { text: 'Depth: infinity' });
				frag.appendText(
					' — это специальный заголовок, отправляемый на сервер WebDAV, требующий от него вернуть список всех файлов в одном ответе. Это может ускорить сканирование удалённых файлов, но если включено «Асимметричное хранилище», прироста производительности не будет.',
				);
			}),
		supported: 'большинство серверов WebDAV',
		unsupported: 'InfiniCLOUD, Nutstore и Synology WebDAV с настройками по умолчанию',
	}),
	endpoint: 'URL-адрес сервера',
	endpointDescription: 'Введите URL-адрес корневого каталога на сервере WebDAV.',
	endpointPlaceholder: 'https://example.com/webdav',
	fileMetadata: 'Метаданные файлов',
	fileMetadataDescription: ruCapabilityDesc({
		defaulted: 'включено',
		description: () =>
			createFragment((frag) => {
				frag.appendText('Сохраняйте метаданные файлов при загрузке через WebDAV ');
				frag.createEl('code', { text: 'PROPPATCH' });
				frag.appendText(
					' и получайте их при скачивании. Включение этой функции сохраняет метаданные (например, время создания и изменения файла) между устройствами.',
				);
			}),
		supported: 'большинство серверов WebDAV',
		unsupported: 'Nutstore и Rclone WebDAV',
	}),
	password: 'Пароль',
	passwordDescription:
		'Введите пароль от вашего аккаунта. Пароль хранится в связке ключей Obsidian.',
	pleaseConfigureAccount: 'Пожалуйста, настройте учётную запись WebDAV!',
	username: 'Имя пользователя',
	usernameDescription: 'Введите имя пользователя вашей учётной записи WebDAV.',
	usernamePlaceholder: 'Введите имя пользователя',
	webdav: 'WebDAV',
};

export const zhTW: WebdavTranslations = {
	baseDirectory: '基礎目錄',
	baseDirectoryDescription: '設定 WebDAV 上儲存庫要同步到的資料夾。「/」代表根目錄。',
	baseDirectoryPlaceholder: '輸入目錄',
	capabilities: '功能',
	capabilitiesDescription:
		'不同的 WebDAV 伺服器支援不同的功能。微調這些功能可以獲得更好的同步體驗。',
	chunkedUpload: '分塊上傳',
	chunkedUploadDescription: zhTWCapsDesc({
		defaulted: '停用',
		description: '啟用 Nextcloud 風格的分塊上傳以替代直接上傳完整檔案，進而降低記憶體負擔。',
		supported: 'Nextcloud 和 ownCloud',
		unsupported: '大多數 WebDAV 伺服器',
	}),
	depthInfinity: '使用「Depth: infinity」',
	depthInfinityDescription: zhTWCapsDesc({
		defaulted: '停用',
		description: () =>
			createFragment((frag) => {
				frag.createEl('code', { text: 'Depth: infinity' });
				frag.appendText(
					' 是發送給 WebDAV 伺服器的特殊標頭，要求伺服器在單一回應中列出所有檔案。這能加速遠端檔案掃描，但若已啟用「非對稱儲存」，此選項將不會帶來任何效能提升。',
				);
			}),
		supported: '大多數 WebDAV 伺服器',
		unsupported: 'InfiniCLOUD、堅果雲和預設設定的群暉 WebDAV',
	}),
	endpoint: '伺服器 URL',
	endpointDescription: '輸入 WebDAV 伺服器上根目錄的 URL。',
	endpointPlaceholder: 'https://example.com/webdav',
	fileMetadata: '檔案元資料',
	fileMetadataDescription: zhTWCapsDesc({
		defaulted: '啟用',
		description: () =>
			createFragment((frag) => {
				frag.appendText('在檔案上傳時透過 WebDAV ');
				frag.createEl('code', { text: 'PROPPATCH' });
				frag.appendText(
					' 儲存檔案元資料，並在下載時讀取。啟用此功能可跨裝置保留元資料（如檔案建立和修改時間）。',
				);
			}),
		supported: '大多數 WebDAV 伺服器',
		unsupported: '堅果雲和 Rclone WebDAV',
	}),
	password: '密碼',
	passwordDescription: '輸入您的帳號密碼。密碼將儲存於 Obsidian 金鑰圈中。',
	pleaseConfigureAccount: '請設定 WebDAV 帳號！',
	username: '使用者名稱',
	usernameDescription: '輸入您的 WebDAV 帳號使用者名稱。',
	usernamePlaceholder: '輸入您的使用者名稱',
	webdav: 'WebDAV',
};
