import type { Translations } from '@hesprs/sync-engine-sdk';

const zhTW: Translations = {
	addHeader: '新增標頭',
	addRecord: '新增紀錄',
	addSecretHeader: '新增加密標頭',
	addSource: '新增來源',
	addStrategy: '新增策略',
	asymmetricStorage: '非對稱儲存',
	asymmetricStorageDescription: () =>
		createFragment((frag) => {
			frag.appendText('使用');
			frag.createEl('a', {
				attr: { href: 'https://sync.consensia.cc/deep-dive/asymmetric-storage' },
				text: '非對稱儲存',
			});
			frag.appendText('來大幅提升同步速度。');
		}),
	asymmetricStorageWarning: (flag) =>
		createFragment((frag) => {
			if (flag) {
				frag.createEl('p', { text: '在啟用非對稱儲存前，請務必留意以下幾點：' });
				const ol = frag.createEl('ol');
				ol.createEl('li', {
					text: '遠端儲存將不再保留本地的層級結構。所有檔案都會直接上傳至根目錄，並附上隨機字串標記。',
				});
				ol.createEl('li', {
					text: '若您需要讓遠端檔案保持可讀的目錄結構，請勿啟用此功能。',
				});
				ol.createEl('li', { text: '啟用後，請確保所有裝置皆已開啟非對稱儲存。' });
			} else {
				frag.createEl('p', { text: '在停用非對稱儲存前，請務必留意以下幾點：' });
				const ol = frag.createEl('ol');
				ol.createEl('li', { text: '後續的所有上傳將會還原為本地的層級結構。' });
				ol.createEl('li', { text: '請確保所有裝置皆已停用非對稱儲存。' });
			}
		}),
	avoidAutoSyncWhenOffline: '離線時避免自動同步',
	avoidAutoSyncWhenOfflineDescription: '當沒有網路連線時，靜默跳過非手動觸發的同步作業。',
	awaitingConfirmation: '等待確認',
	backend: '儲存後端',
	backendDescription: '選擇要使用的雲端服務。後端支援由模組提供。',
	backendNotInstalled: (name) => `未安裝後端「${name}」！`,
	bidirectional: '雙向同步',
	cancel: '取消',
	cancelled: '已取消',
	checkConnection: '測試連線',
	checkConnectionFailed: '連線測試失敗',
	checkConnectionSuccess: '連線測試成功',
	clear: '清除',
	clearRecords: '清除紀錄',
	clearRecordsDescription:
		'Sync Engine 會記錄同步狀態以處理本地與遠端檔案之間的變更。此選項允許您選擇性地清除紀錄。警告：此操作可能會導致資料遺失。',
	completed: '已完成',
	completedNoop: '已是最新狀態',
	configure: '設定',
	confirm: '確認',
	confirmDeleteDescription: (count) =>
		`請確認將被刪除的 ${count} 個本地檔案，未勾選的檔案將會重新上傳。`,
	confirmDeleteInAutoSync: '自動同步時確認刪除',
	confirmDeleteInAutoSyncDescription:
		'在自動同步過程中刪除本地檔案前顯示確認視窗。您可以選擇刪除或重新上傳。',
	confirmTasksDescription: ({ total, conflict, deleteLocal, deleteRemote }) => {
		const deleteOr = deleteLocal + deleteRemote !== 0;
		let result = `同步總共將執行 ${total} 個操作`;
		if (deleteOr || conflict !== 0) result += '，包含';
		if (deleteOr) result += '刪除';
		if (deleteLocal !== 0) result += ` ${deleteLocal} 個本地項目`;
		if (deleteLocal !== 0 && deleteRemote !== 0) result += ' 以及';
		if (deleteRemote !== 0) result += ` ${deleteRemote} 個遠端項目`;
		if (deleteOr && conflict !== 0) result += '，並';
		if (conflict !== 0) result += `解決 ${conflict} 個衝突`;
		result += '：';
		return result;
	},
	confirmTasksInSync: '手動同步時確認操作',
	confirmTasksInSyncDescription: '顯示待處理的操作，並在您確認後執行（不影響自動同步）。',
	conflictResolveStrategy: '衝突解決策略',
	conflictResolveStrategyDescription:
		'選擇當遠端與本地檔案自上次同步後皆有修改時的解決方式。更多策略可透過模組提供。',
	conflictResolveStrategyNotInstalled: (strategy) => `衝突解決策略 “${strategy}” 未安裝！`,
	controls: '控制項',
	createLocalDir: '建立本地資料夾',
	createRemoteDir: '建立遠端資料夾',
	customHeaders: '自訂標頭',
	customHeadersDescription:
		'新增每次請求時要包含的自訂標頭，可選擇以明文儲存或儲存於 Obsidian 金鑰圈中。',
	delete: '刪除',
	deleteModule: '刪除模組',
	description: '說明',
	descriptionDescription: '設定顯示於模組卡片中的說明文字。',
	descriptionPlaceholder: '此模組是用於...',
	development: '開發者選項',
	diffMatchPatch: '文字合併',
	disableModule: '停用模組',
	discoveredModules: ({ module, source }) => `已從 ${source} 個來源找到 ${module} 個模組。`,
	done: '完成',
	dontSync: '不同步',
	download: '下載',
	downloadModule: '下載模組',
	edit: '編輯',
	editModuleInformation: '編輯模組資訊',
	enable: '啟用',
	enableDescription: '設定是否載入此模組。',
	enableModule: '啟用模組',
	executing: '執行中',
	export: '匯出',
	exportLogsDescription: '將外掛程式紀錄匯出至儲存庫中的檔案。請在欄位中設定紀錄匯出目錄。',
	exportLogsDirectoryPlaceholder: '設定紀錄匯出的目標目錄',
	exportLogsFailed: '匯出紀錄失敗',
	exportLogsToFile: '匯出紀錄至檔案',
	failed: '失敗',
	failedTasksDescription: (count) => `同步過程中有 ${count} 個操作失敗：`,
	failedToDownloadModule: (name) => `下載模組 "${name}" 失敗`,
	failedToFetchSource: (url) => `無法從 "${url}" 取得來源`,
	failedToLoadModule: (name) => `載入模組 "${name}" 失敗`,
	features: '功能特徵',
	focusSync: '焦點同步',
	focusSyncDescription:
		'切換回 Obsidian 前景時自動觸發同步。請在欄位中修改距上一次同步的最短間隔。',
	focusSyncPlaceholder: '輸入最短間隔（例如 30s, 1min）',
	globPlaceholder: '例如 temp.md, .trash/**/*',
	headerKeyPlaceholder: '標頭名稱',
	headerValuePlaceholder: '標頭數值',
	hide: '隱藏',
	icon: '圖示',
	iconDescription: () =>
		createFragment((frag) => {
			frag.appendText('設定顯示於模組卡片中的圖示，完整圖示清單可參考 ');
			frag.createEl('a', {
				attr: { href: 'https://lucide.dev/icons/' },
				text: 'Lucide Icons 目錄',
			});
			frag.appendText('。');
		}),
	iconPlaceholder: '輸入圖示代碼（例如 puzzle）',
	idle: '待命',
	installModuleFromCode: '從程式碼安裝模組',
	installModuleFromFile: '從檔案安裝模組',
	installed: '已安裝',
	integrityCheckFailed:
		'完整性檢查失敗。此模組可能已被外部篡改。如果您不知道為何出現此情況，請重新安裝該模組。',
	integrityVerification: '完整性驗證',
	integrityVerificationDescription: () =>
		createFragment((frag) => {
			frag.appendText('每次載入模組時驗證其雜湊值，');
			frag.createEl('strong', { text: '保護您免受惡意模組替換攻擊' });
			frag.appendText('。');
		}),
	keepLocal: '保留本地',
	keepRemote: '保留遠端',
	latestSurvive: '以最新修改為主',
	loadingModules: '正在載入模組…',
	match: '匹配',
	matchLabelDescription: '此設定必須在所有裝置上保持一致。',
	maxFileSize: '檔案大小上限',
	maxFileSizeDescription:
		'同步時跳過超過此大小的檔案。此選項適用於有容量限制的雲端服務。請在欄位中修改限制大小。',
	maxFileSizePlaceholder: '輸入大小限制（例如 10MB, 0.5GB）',
	maxMemoryConsumption: '記憶體用量上限',
	maxMemoryConsumptionDescription:
		'限制同步過程中使用的記憶體容量。此選項適用於記憶體有限的裝置。請在欄位中修改限制容量。',
	maxMemoryConsumptionPlaceholder: '輸入記憶體限制（例如 1GB, 200MB）',
	maxRequestConcurrency: '最大併發請求數',
	maxRequestConcurrencyDescription:
		'限制同步過程中的同時請求數量。此選項適用於有請求速率限制的服務。請在欄位中修改併發限制。',
	maxRequestConcurrencyPlaceholder: '輸入併發限制',
	migrationInstruction: (enable) =>
		createFragment((frag) => {
			const p1 = frag.createEl('p', {
				text: `若此儲存庫先前是在${enable ? '停用' : '啟用'}此選項的狀態下同步，您可能需要遷移遠端儲存。請參閱`,
			});
			p1.createEl('a', {
				attr: { href: 'https://sync.consensia.cc/usage/remote-migration' },
				text: '文件頁面',
			});
			p1.appendText(
				'了解如何安全地手動執行遷移。基於資料安全考量，Sync Engine 不會自動執行遷移。若您已遷移過雲端儲存，可以忽略此警告。',
			);
			frag.createEl('p', { text: '確認切換？' });
		}),
	minRequestInterval: '最小請求間隔',
	minRequestIntervalDescription:
		'限制同步過程中連續請求之間的最小時間間隔。此選項適用於有請求速率限制的服務。請在欄位中修改間隔時間。',
	minRequestIntervalPlaceholder: '輸入間隔時間（例如 1s, 500ms）',
	mirrorLocal: '鏡像本機',
	mirrorRemote: '鏡像遠端',
	miscellaneous: '雜項設定',
	moduleAutoUpdate: '自動更新模組',
	moduleAutoUpdateDescription: '自動從模組來源更新已安裝的模組。',
	moduleExtensionWarning: () =>
		createFragment((frag) => {
			frag.appendText('無效的模組：檔案副檔名必須為 ');
			frag.createEl('code', { text: '.js' });
			frag.appendText(' 或 ');
			frag.createEl('code', { text: '.mjs' });
			frag.appendText('。');
		}),
	moduleManagement: '模組管理',
	moduleManagementDescription:
		'在專屬面板中管理模組。您可以進行安裝、卸載、更新、啟用、停用、編輯模組或編輯模組來源。',
	moduleSourcePlaceholder: 'https://example.com/modules.json',
	moduleSources: '模組來源',
	moduleSourcesDescription: '編輯取得模組目錄的模組來源，以便安裝第三方 Sync Engine 模組。',
	moveLocal: '移動本地',
	moveRemote: '移動遠端',
	name: '名稱',
	nameDescription: '設定顯示於模組卡片中的名稱。',
	namePlaceholder: '輸入模組顯示名稱',
	noHeaderConfigured: '尚未設定標頭。',
	noInstalledModulesFound: '未找到已安裝的模組。',
	noMatchingModulesFound: '未找到符合條件的模組。',
	noModulesAvailable: '無可用模組。',
	noSourceConfigured: '尚未設定來源。',
	noStrategyConfigured: '尚未設定策略。',
	none: '無',
	noticeStatusOnMobile: '行動裝置同步狀態通知',
	noticeStatusOnMobileDescription: '同步進行時於行動裝置上顯示通知訊息（取代桌面版的狀態列）。',
	official: '官方',
	openReadme: '開啟模組的 README 頁面',
	pleaseSetBackend: '請先設定後端！',
	readmePage: 'README 頁面',
	readmePageDescription: '設定模組的選用 README 頁面，留空表示無 README。',
	readmePagePlaceholder: 'https://example.com/my-module',
	realtimeSync: '即時同步',
	realtimeSyncDescription:
		'當檔案經修改後立即自動觸發同步。請在欄位中修改檔案變更到觸發同步之間的延遲時間。',
	realtimeSyncFastMode: '即時同步極速模式',
	realtimeSyncFastModeDescription: '透過重複使用快取資料來加速即時同步，並跳過不必要的遠端掃描。',
	realtimeSyncPlaceholder: '輸入同步延遲（例如 500ms, 5s）',
	recordsCleared: '紀錄已清除',
	refreshSources: '重新整理來源',
	remoteMigration: '遠端遷移',
	removeLocal: '移除本地',
	removeRecord: '移除紀錄',
	removeRemote: '移除遠端',
	renameAndKeepBoth: '重新命名並保留兩者',
	resolveConflict: '解決衝突',
	save: '儲存',
	scheduledSync: '定時同步',
	scheduledSyncDescription: '按照設定的時間間隔定期觸發同步。請在欄位中修改間隔時間。',
	scheduledSyncPlaceholder: '輸入間隔時間（例如 10min, 0.5h）',
	searchModules: '搜尋模組',
	selectAll: '全選',
	settingTips: ({ labels, addLabel }) =>
		createFragment((frag) => {
			const p = frag.createEl('p', { text: '感謝您選擇 Sync Engine！請參閱 ' });
			p.createEl('a', {
				attr: { href: 'https://sync.consensia.cc/usage/settings' },
				text: '文件',
			});
			p.appendText('以瞭解各項設定的詳細說明。設定標籤：');
			const ul = frag.createEl('ul');
			for (const label of labels) {
				const li = ul.createEl('li');
				const flair = addLabel(li, label);
				flair.addClass('se-m-0');
				li.appendText(` ${flair.ariaLabel}`);
			}
		}),
	showInstalledOnly: '僅顯示已安裝',
	showProgress: '顯示進度',
	skip: '跳過',
	someModulesHidden:
		'由於 Sync Engine 外掛程式版本過舊，部分模組已隱藏。請更新外掛程式以查看完整模組目錄。',
	speed: '速度',
	speedLabelDescription: '正確設定此選項可能會提升同步速度。',
	startNonInteractiveSync: '啟動非互動式同步',
	startSync: '開始同步',
	startupSync: '啟動時同步',
	startupSyncDescription:
		'外掛程式啟動後，在經過指定的延遲時間自動觸發同步。請在欄位中修改延遲時間。',
	startupSyncPlaceholder: '輸入延遲時間（例如 5s, 1min）',
	stopSync: '停止同步',
	syncProgress: '同步進度',
	syncStrategy: '同步策略',
	syncStrategyDescription:
		'根據 Glob 規則為不同的檔案設定不同的同步策略。當有多個規則配對至同一個檔案時，以最後一個規則為準。',
	syncStrategyNotInstalled: (strategy) => `同步策略 “${strategy}” 未安裝！`,
	syncStrategyTips: () =>
		createFragment((frag) => {
			const p1 = frag.createEl('p', { text: '同步策略配置是一個由 ' });
			p1.createEl('a', {
				attr: { href: 'https://en.wikipedia.org/wiki/Glob_(programming)' },
			}).createEl('strong', { text: 'Glob 規則' });
			p1.appendText(' + ');
			p1.createEl('strong', { text: '同步方向' });
			p1.appendText(
				' 條目組成的有序列表。Glob 規則選定目標檔案集合，同步方向決定這些檔案的變更如何同步。同一個檔案可以被多個條目配對，列表中最後一條配對的條目優先生效。',
			);
			const p2 = frag.createEl('p', { text: 'Glob 規則寫作一個以 ' });
			p2.createEl('code', { text: '/' });
			p2.appendText(' 為路徑分隔符的簡單檔案路徑，並帶有若干萬用字元擴充：');
			const olGlob = frag.createEl('ul');
			// oxlint-disable-next-line sort-keys
			Object.entries({
				'*': '比對單一路徑段內的任意字元。',
				'**': '比對任意數量的路徑段，包括零個。',
				'?': '比對一個字元。',
				'[abc]': '比對集合中的一個字元。',
				'[!abc]': '比對集合之外的一個字元。',
				'{a,b,c}': '比對列出的任意變體，花括號可以巢狀。',
			}).forEach(([key, text]) => {
				const li = olGlob.createEl('li');
				li.createEl('code', { text: key });
				li.appendText(`：${text}`);
			});
			const li1 = olGlob.createEl('li', { text: '以 ' });
			li1.createEl('code', { text: '/' });
			li1.appendText(' 結尾的規則僅比對資料夾。');
			const li2 = olGlob.createEl('li', { text: '以 ' });
			li2.createEl('code', { text: '/' });
			li2.appendText(' 開頭的規則從儲存庫根目錄開始比對，否則可在任意深度比對。');
			const li3 = olGlob.createEl('li', { text: '比對檔案時，記得加上副檔名（例如 ' });
			li3.createEl('code', { text: '.md' });
			li3.appendText('）。');
			olGlob.createEl('li', { text: '規則區分大小寫。' });
			frag.createEl('p', { text: '內建的同步方向包括：' });
			const olDirection = frag.createEl('ul');
			// oxlint-disable-next-line sort-keys
			Object.entries({
				雙向同步: '同步兩側的變更。',
				鏡像本機: '用本機變更覆蓋遠端。',
				鏡像遠端: '用遠端變更覆蓋本機。',
				不同步: '將配對的檔案排除在同步之外。',
			}).forEach(([key, text]) => {
				const li = olDirection.createEl('li');
				li.createEl('strong', { text: key });
				li.appendText(`：${text}`);
			});
		}),
	untrustedModule: '非信任模組',
	untrustedModuleDescription: ({ fileName, size, path, mtime, ctime }) =>
		createFragment((frag) => {
			const p1 = frag.createEl('p');
			p1.appendText('Sync Engine 偵測到一個已安裝的模組，名為 ');
			p1.createEl('code', { text: fileName });
			p1.appendText('，此模組從未在此庫中向 Sync Engine 註冊。');
			p1.createEl('strong', { text: '請在繼續之前檢閱以下資訊：' });
			const ul = frag
				.createDiv(
					'se-rounded-lg se-border se-border-[--background-modifier-border] se-bg-[--background-secondary] se-px-2',
				)
				.createEl('ul');
			const li1 = ul.createEl('li');
			li1.appendText('檔案名稱：');
			li1.createEl('code', { text: fileName });
			const li2 = ul.createEl('li');
			li2.appendText('檔案路徑：');
			li2.createEl('code', { text: path });
			const li3 = ul.createEl('li');
			li3.appendText('大小：');
			li3.createEl('code', { text: size });
			const li4 = ul.createEl('li');
			li4.appendText('建立時間：');
			li4.createEl('code', { text: ctime });
			const li5 = ul.createEl('li');
			li5.appendText('修改時間：');
			li5.createEl('code', { text: mtime });
			const p2 = frag.createEl('p');
			p2.createEl('strong', {
				text: '為了防止惡意程式碼執行，Sync Engine 現需取得您的明確同意。',
			});
			p2.appendText(
				'若該模組在您的控制範圍內，您可以選擇「設定」並將其啟用；若您不確定其來源，亦可將其刪除。關於此警告的詳細說明，請參閱 ',
			);
			p2.createEl('a', {
				attr: { href: 'https://sync.consensia.cc/deep-dive/extensibility' },
				text: '文件頁面',
			});
			p2.appendText('。');
		}),
	update: '更新',
	updateAvailable: '有可用更新',
	updateDescription: '設定模組是否可接收更新。請於欄位中修改取得更新的來源；來源留空表示不更新。',
	updateModule: '更新模組',
	updatePlaceholder: 'https://example.com/modules.json',
	upload: '上傳',
	version: '版本',
	versionDescription: '設定用於更新比較與模組卡片顯示的模組版本。',
	versionPlaceholder: '輸入版本（例如 0.0.1）',
	walkingRemote: '正在掃描遠端檔案',
	warning: '警告',
	writeCode: '撰寫程式碼',
	writeCodeDescription: '在此處以 JavaScript 撰寫您的模組程式碼',
	xConfigured: (count) => `已設定 ${count} 項`,
	xEnabled: (count) => `已啟用 ${count} 個模組`,
	xOperationsFailed: (count) => `${count} 個操作失敗`,
	xSelected: (count) => `（已選擇 ${count} 項）`,
};

export default zhTW;
