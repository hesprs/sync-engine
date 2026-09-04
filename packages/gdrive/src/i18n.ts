import type { GdriveTranslations } from './setting';

export const en: GdriveTranslations = {
	accountConnected: 'Account connected',
	accountConnectedDescription: 'Connected to Google Drive account.',
	authorizationFailed: 'Authorization failed: {{reason}}',
	baseDirectory: 'Base directory',
	baseDirectoryDescription:
		'Set the folder in Google Drive that holds this vault. Created automatically on the first sync and do not create it manually in Drive. Files added outside this plugin are invisible to sync.',
	baseDirectoryPlaceholder: 'my-vault/',
	configureFirst: 'Enter the OAuth client ID and client secret first.',
	connect: 'Connect',
	connectAccount: 'Connect account',
	connectAccountDescription: 'Click the button to connect to you Google Drive account.',
	connectSuccess: 'Connected to Google Drive.',
	copyAndOpenGoogle: 'Copy and open Google',
	deviceCodeInstruction: (frag, url) => {
		frag.appendText('Please visit ');
		frag.createEl('a', { attr: { href: url } }).createEl('code', { text: url });
		frag.appendText(
			' and enter the code below, then approve access. Switch back to Obsidian when you see "Continue on your device".',
		);
	},
	deviceCodeTitle: 'Connect Google Drive',
	disconnect: 'Disconnect',
	gdrive: 'Google Drive',
	useTrash: 'Delete to trash',
	useTrashDescription:
		'Move deleted files to the Google Drive trash instead of deleting them permanently. Drive clears its trash after 30 days.',
	waitingApproval: 'Waiting for approval…',
};

export const ru: GdriveTranslations = {
	accountConnected: 'Аккаунт подключён',
	accountConnectedDescription: 'Подключено к аккаунту Google Drive.',
	authorizationFailed: 'Ошибка авторизации: {{reason}}',
	baseDirectory: 'Базовый каталог',
	baseDirectoryDescription:
		'Укажите папку в Google Drive, в которой будет храниться это хранилище. Она создаётся автоматически при первой синхронизации, не создавайте её вручную на Диске. Файлы, добавленные вне этого плагина, будут невидны для синхронизации.',
	baseDirectoryPlaceholder: 'my-vault/',
	configureFirst: 'Сначала введите OAuth client ID и client secret.',
	connect: 'Подключить',
	connectAccount: 'Подключить аккаунт',
	connectAccountDescription: 'Нажмите кнопку, чтобы подключиться к вашему аккаунту Google Drive.',
	connectSuccess: 'Успешно подключено к Google Drive.',
	copyAndOpenGoogle: 'Скопировать и открыть Google',
	deviceCodeInstruction: (frag, url) => {
		frag.appendText('Пожалуйста, перейдите по ссылке ');
		frag.createEl('a', { attr: { href: url } }).createEl('code', { text: url });
		frag.appendText(
			' и введите код ниже, после чего подтвердите доступ. Переключитесь обратно в Obsidian, когда увидите «Продолжить на вашем устройстве».',
		);
	},
	deviceCodeTitle: 'Подключение Google Drive',
	disconnect: 'Отключить',
	gdrive: 'Google Drive',
	useTrash: 'Удалять в корзину',
	useTrashDescription:
		'Перемещать удалённые файлы в корзину Google Drive вместо их безвозвратного удаления. Диск автоматически очищает корзину через 30 дней.',
	waitingApproval: 'Ожидание подтверждения…',
};

export const zhTW: GdriveTranslations = {
	accountConnected: '帳號已連線',
	accountConnectedDescription: '已成功連線至 Google Drive 帳號。',
	authorizationFailed: '驗證失敗：{{reason}}',
	baseDirectory: '基礎目錄',
	baseDirectoryDescription:
		'設定 Google Drive 中用來存放此儲存庫的資料夾。系統將於首次同步時自動建立，請勿手動在 Drive 中建立。在此外掛程式之外新增的檔案將無法被同步讀取。',
	baseDirectoryPlaceholder: 'my-vault/',
	configureFirst: '請先輸入 OAuth 用戶端 ID 與用戶端密鑰。',
	connect: '連線',
	connectAccount: '連結帳號',
	connectAccountDescription: '點擊按鈕以連結您的 Google Drive 帳號。',
	connectSuccess: '已成功連線至 Google Drive。',
	copyAndOpenGoogle: '複製並前往 Google 頁面',
	deviceCodeInstruction: (frag, url) => {
		frag.appendText('請前往 ');
		frag.createEl('a', { attr: { href: url } }).createEl('code', { text: url });
		frag.appendText(
			' 並輸入下方驗證碼，隨後核准存取權限。當您看到「在您的裝置上繼續」時，請切換回 Obsidian。',
		);
	},
	deviceCodeTitle: '連結 Google Drive',
	disconnect: '中斷連線',
	gdrive: 'Google Drive',
	useTrash: '移至垃圾桶',
	useTrashDescription:
		'刪除檔案時將其移至 Google Drive 垃圾桶而非永久刪除。Drive 會在 30 天後自動清理垃圾桶。',
	waitingApproval: '等待核准中…',
};

export const zh: GdriveTranslations = {
	accountConnected: '账号已连接',
	accountConnectedDescription: '已连接至 Google Drive 账号。',
	authorizationFailed: '授权失败：{{reason}}',
	baseDirectory: '基础目录',
	baseDirectoryDescription:
		'设置 Google Drive 中存放此仓库的文件夹。该目录会在首次同步时自动创建，请勿在 Drive 中手动创建。此插件之外添加的文件对同步不可见。',
	baseDirectoryPlaceholder: 'my-vault/',
	configureFirst: '请先输入 OAuth 客户端 ID 和客户端密钥。',
	connect: '连接',
	connectAccount: '连接账号',
	connectAccountDescription: '点击按钮连接到您的 Google Drive 账号。',
	connectSuccess: '已连接至 Google Drive。',
	copyAndOpenGoogle: '复制并打开 Google',
	deviceCodeInstruction: (frag, url) => {
		frag.appendText('请访问 ');
		frag.createEl('a', { attr: { href: url } }).createEl('code', { text: url });
		frag.appendText(
			' 并输入下方验证码，然后批准访问权限。看到“在您的设备上继续”时，请切换回 Obsidian。',
		);
	},
	deviceCodeTitle: '连接 Google Drive',
	disconnect: '断开连接',
	gdrive: 'Google Drive',
	useTrash: '删除至回收站',
	useTrashDescription:
		'将删除的文件移动至 Google Drive 回收站，而非永久删除。Drive 会在 30 天后自动清空回收站。',
	waitingApproval: '等待批准中…',
};
