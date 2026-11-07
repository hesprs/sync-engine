import type { DropboxTranslations } from './setting';

export const en: DropboxTranslations = {
	accountConnected: 'Account connected',
	authorizationFailed: (reason) => `Authorization failed: ${reason}`,
	baseDirectory: 'Base directory',
	baseDirectoryDescription: 'Set the folder inside the Dropbox app folder that holds this vault.',
	baseDirectoryPlaceholder: 'my-vault/',
	connect: 'Connect',
	connectAccount: 'Connect account',
	connectAccountDescription:
		'Click the button to connect to your Dropbox account. Approve access in your browser and Obsidian picks up the result automatically.',
	connectInstruction: (url) =>
		createFragment((frag) => {
			frag.appendText(
				'Click "Open Dropbox" and approve access in your browser, then switch back to Obsidian. If your browser did not open, visit ',
			);
			frag.createEl('a', { attr: { href: url } }).createEl('code', { text: url });
			frag.appendText(' instead.');
		}),
	connectSuccess: 'Connected to Dropbox account.',
	connectTitle: 'Connect Dropbox',
	disconnect: 'Disconnect',
	dropbox: 'Dropbox',
	openDropbox: 'Open Dropbox',
	useTrash: 'Delete to trash',
	useTrashDescription:
		'Move deleted files to the Dropbox trash instead of deleting them permanently. Dropbox clears its trash after 30 days.',
	waitingApproval: 'Waiting for approval…',
};

export const ru: DropboxTranslations = {
	accountConnected: 'Аккаунт подключён',
	authorizationFailed: (reason) => `Ошибка авторизации: ${reason}`,
	baseDirectory: 'Базовый каталог',
	baseDirectoryDescription:
		'Укажите папку в папке приложения Dropbox, в которой будет храниться это хранилище.',
	baseDirectoryPlaceholder: 'my-vault/',
	connect: 'Подключить',
	connectAccount: 'Подключить аккаунт',
	connectAccountDescription:
		'Нажмите кнопку, чтобы подключиться к вашему аккаунту Dropbox. Подтвердите доступ в браузере, и Obsidian автоматически получит результат.',
	connectInstruction: (url) =>
		createFragment((frag) => {
			frag.appendText(
				'Нажмите «Открыть Dropbox» и подтвердите доступ в браузере, затем вернитесь в Obsidian. Если браузер не открылся, перейдите по ссылке ',
			);
			frag.createEl('a', { attr: { href: url } }).createEl('code', { text: url });
			frag.appendText('.');
		}),
	connectSuccess: 'Подключено к аккаунту Dropbox.',
	connectTitle: 'Подключение Dropbox',
	disconnect: 'Отключить',
	dropbox: 'Dropbox',
	openDropbox: 'Открыть Dropbox',
	useTrash: 'Удалять в корзину',
	useTrashDescription:
		'Перемещать удалённые файлы в корзину Dropbox вместо их безвозвратного удаления. Dropbox автоматически очищает корзину через 30 дней.',
	waitingApproval: 'Ожидание подтверждения…',
};

export const zhTW: DropboxTranslations = {
	accountConnected: '帳號已連線',
	authorizationFailed: (reason) => `驗證失敗：${reason}`,
	baseDirectory: '基礎目錄',
	baseDirectoryDescription: '設定 Dropbox 應用程式資料夾中用來存放此儲存庫的資料夾。',
	baseDirectoryPlaceholder: 'my-vault/',
	connect: '連線',
	connectAccount: '連結帳號',
	connectAccountDescription:
		'點擊按鈕以連結您的 Dropbox 帳號。在瀏覽器中核准存取權限後，Obsidian 會自動接收結果。',
	connectInstruction: (url) =>
		createFragment((frag) => {
			frag.appendText(
				'點擊「開啟 Dropbox」並在瀏覽器中核准存取權限，然後切換回 Obsidian。若瀏覽器未開啟，請前往 ',
			);
			frag.createEl('a', { attr: { href: url } }).createEl('code', { text: url });
			frag.appendText('。');
		}),
	connectSuccess: '已成功連線至 Dropbox 帳號。',
	connectTitle: '連結 Dropbox',
	disconnect: '中斷連線',
	dropbox: 'Dropbox',
	openDropbox: '開啟 Dropbox',
	useTrash: '移至垃圾桶',
	useTrashDescription:
		'刪除檔案時將其移至 Dropbox 垃圾桶而非永久刪除。Dropbox 會在 30 天後自動清理垃圾桶。',
	waitingApproval: '等待核准中…',
};

export const zh: DropboxTranslations = {
	accountConnected: '账号已连接',
	authorizationFailed: (reason) => `授权失败：${reason}`,
	baseDirectory: '基础目录',
	baseDirectoryDescription: '设置 Dropbox 应用文件夹中存放此仓库的文件夹。',
	baseDirectoryPlaceholder: 'my-vault/',
	connect: '连接',
	connectAccount: '连接账号',
	connectAccountDescription:
		'点击按钮连接到您的 Dropbox 账号。在浏览器中批准访问后，Obsidian 会自动接收结果。',
	connectInstruction: (url) =>
		createFragment((frag) => {
			frag.appendText(
				'点击“打开 Dropbox”并在浏览器中批准访问，然后切换回 Obsidian。如果浏览器没有打开，请访问 ',
			);
			frag.createEl('a', { attr: { href: url } }).createEl('code', { text: url });
			frag.appendText('。');
		}),
	connectSuccess: '已连接至 Dropbox 账号。',
	connectTitle: '连接 Dropbox',
	disconnect: '断开连接',
	dropbox: 'Dropbox',
	openDropbox: '打开 Dropbox',
	useTrash: '移至回收站',
	useTrashDescription:
		'将删除的文件移动至 Dropbox 回收站，而非永久删除。Dropbox 会在 30 天后自动清空回收站。',
	waitingApproval: '等待批准中…',
};
