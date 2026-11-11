export type HistoryTranslations = {
	autoGc: string;
	autoGcDescription: string;
	cancel: string;
	confirmRestore: (label: string) => string;
	confirmRestoreButton: string;
	currentVersionBadge: string;
	gc: string;
	gcDescription: string;
	gcDone: (count: number) => string;
	history: string;
	historyTitle: (file: string) => string;
	loadFailed: (message: string) => string;
	maxVersions: string;
	maxVersionsDescription: string;
	noDeletedNotes: string;
	noVersions: string;
	previewHint: string;
	previewHintMobile: string;
	recoverDeleted: string;
	recoverDeletedTitle: string;
	restore: string;
	restoreFailed: (message: string) => string;
	restored: (label: string) => string;
	retentionDays: string;
	retentionDaysDescription: string;
	runGc: string;
	showHistory: string;
	version: (args: { at: number }) => string;
	viewDiff: string;
	viewDiffShort: string;
	viewFull: string;
	viewFullShort: string;
};

const en: HistoryTranslations = {
	autoGc: 'Automatic garbage collection',
	autoGcDescription:
		'Periodically clean up obsolete packs and pruned versions in the background.',
	cancel: 'Cancel',
	confirmRestore: (label) =>
		`Replace the current file with the version from ${label}? This cannot be undone.`,
	confirmRestoreButton: 'Confirm restore',
	currentVersionBadge: '(current)',
	gc: 'Garbage collection',
	gcDescription:
		'Rewrite live chunks into a new pack and remove obsolete packs. Packs are never modified in place.',
	gcDone: (count) => `Removed ${count} obsolete pack(s).`,
	history: 'History versions',
	historyTitle: (file) => `Sync Engine history — ${file}`,
	loadFailed: (message) => `Could not load this version: ${message}`,
	maxVersions: 'Maximum saved versions',
	maxVersionsDescription:
		'Maximum number of recent versions to keep per file during garbage collection.',
	noDeletedNotes: 'No deleted notes with historical versions found.',
	noVersions: 'No versions captured for this file yet.',
	previewHint: 'Select a version on the left to preview its content.',
	previewHintMobile: 'Select a version above to preview its content.',
	recoverDeleted: 'Recover deleted note',
	recoverDeletedTitle: 'Recover deleted notes',
	restore: 'Restore this version',
	restoreFailed: (message) => `Restore failed: ${message}`,
	restored: (label) => `Restored the version from ${label}.`,
	retentionDays: 'Retention days',
	retentionDaysDescription:
		'Versions older than this many days are dropped during garbage collection.',
	runGc: 'Run garbage collection',
	showHistory: 'Sync Engine: Show history',
	version: ({ at }) => (at > 0 ? new Date(at).toLocaleString() : 'Time unknown'),
	viewDiff: 'Diff with current',
	viewDiffShort: 'Diff',
	viewFull: 'Full text',
	viewFullShort: 'Full',
};

const zh: HistoryTranslations = {
	autoGc: '自动垃圾回收',
	autoGcDescription: '定期在后台自动清理过时包和已淘汰版本。',
	cancel: '取消',
	confirmRestore: (label) => `用 ${label} 的版本覆盖当前文件？此操作无法撤销。`,
	confirmRestoreButton: '确认恢复',
	currentVersionBadge: '(当前版本)',
	gc: '垃圾回收',
	gcDescription: '将仍在使用的块重写进新包并删除过时包，绝不原地修改已有包。',
	gcDone: (count) => `已清理 ${count} 个过时包。`,
	history: '历史版本',
	historyTitle: (file) => `Sync Engine 历史 — ${file}`,
	loadFailed: (message) => `无法加载该版本：${message}`,
	maxVersions: '最大保存版本数',
	maxVersionsDescription: '垃圾回收时每个文件保留的最新版本数量上限。',
	noDeletedNotes: '未找到含有历史版本的已删除笔记。',
	noVersions: '该文件尚未捕获任何版本。',
	previewHint: '在左侧选择一个版本以预览内容。',
	previewHintMobile: '在上方选择一个版本以预览内容。',
	recoverDeleted: '恢复已删除笔记',
	recoverDeletedTitle: '恢复已删除笔记',
	restore: '恢复此版本',
	restoreFailed: (message) => `恢复失败：${message}`,
	restored: (label) => `已恢复 ${label} 的版本。`,
	retentionDays: '保留天数',
	retentionDaysDescription: '垃圾回收会丢弃超过该天数的旧版本。',
	runGc: '运行垃圾回收',
	showHistory: 'Sync Engine：查看历史',
	version: ({ at }) => (at > 0 ? new Date(at).toLocaleString() : '时间未知'),
	viewDiff: '对比当前版本',
	viewDiffShort: '对比',
	viewFull: '查看全文',
	viewFullShort: '全文',
};

const zhTW: HistoryTranslations = {
	autoGc: '自動垃圾回收',
	autoGcDescription: '定期在背景自動清理過時套件與已淘汰版本。',
	cancel: '取消',
	confirmRestore: (label) => `用 ${label} 的版本覆寫目前檔案？此動作無法復原。`,
	confirmRestoreButton: '確認還原',
	currentVersionBadge: '(目前版本)',
	gc: '垃圾回收',
	gcDescription: '將仍在使用的區塊重寫進新套件並刪除過時套件，絕不原地修改已有套件。',
	gcDone: (count) => `已清理 ${count} 個過時套件。`,
	history: '歷史版本',
	historyTitle: (file) => `Sync Engine 歷史 — ${file}`,
	loadFailed: (message) => `無法載入該版本：${message}`,
	maxVersions: '最大儲存版本數',
	maxVersionsDescription: '垃圾回收時每個檔案保留的最新版本數量上限。',
	noDeletedNotes: '未找到含有歷史版本的已刪除筆記。',
	noVersions: '該檔案尚未擷取任何版本。',
	previewHint: '在左側選擇一個版本以預覽內容。',
	previewHintMobile: '在上方選擇一個版本以預覽內容。',
	recoverDeleted: '還原已刪除筆記',
	recoverDeletedTitle: '還原已刪除筆記',
	restore: '還原此版本',
	restoreFailed: (message) => `還原失敗：${message}`,
	restored: (label) => `已還原 ${label} 的版本。`,
	retentionDays: '保留天數',
	retentionDaysDescription: '垃圾回收會捨棄超過此天數的舊版本。',
	runGc: '執行垃圾回收',
	showHistory: 'Sync Engine：查看歷史',
	version: ({ at }) => (at > 0 ? new Date(at).toLocaleString() : '時間未知'),
	viewDiff: '對比目前版本',
	viewDiffShort: '對比',
	viewFull: '檢視全文',
	viewFullShort: '全文',
};

const ru: HistoryTranslations = {
	autoGc: 'Автоматическая сборка мусора',
	autoGcDescription: 'Периодически очищать устаревшие пакеты в фоновом режиме.',
	cancel: 'Отмена',
	confirmRestore: (label) =>
		`Заменить текущий файл версией от ${label}? Это действие нельзя отменить.`,
	confirmRestoreButton: 'Подтвердить восстановление',
	currentVersionBadge: '(текущая)',
	gc: 'Сборка мусора',
	gcDescription:
		'Перезаписать используемые блоки в новый пакет и удалить устаревшие. Пакеты никогда не изменяются на месте.',
	gcDone: (count) => `Удалено устаревших пакетов: ${count}.`,
	history: 'История версий',
	historyTitle: (file) => `Sync Engine: история — ${file}`,
	loadFailed: (message) => `Не удалось загрузить версию: ${message}`,
	maxVersions: 'Максимальное количество версий',
	maxVersionsDescription:
		'Максимальное число последних версий для каждого файла, сохраняемых при сборке мусора.',
	noDeletedNotes: 'Удаленных заметок с историей версий не найдено.',
	noVersions: 'Для этого файла ещё нет версий.',
	previewHint: 'Выберите версию слева, чтобы просмотреть содержимое.',
	previewHintMobile: 'Выберите версию выше, чтобы просмотреть содержимое.',
	recoverDeleted: 'Восстановить удаленную заметку',
	recoverDeletedTitle: 'Восстановление удаленных заметок',
	restore: 'Восстановить эту версию',
	restoreFailed: (message) => `Не удалось восстановить: ${message}`,
	restored: (label) => `Восстановлена версия от ${label}.`,
	retentionDays: 'Срок хранения (дни)',
	retentionDaysDescription: 'Версии старше этого числа дней удаляются при сборке мусора.',
	runGc: 'Запустить сборку мусора',
	showHistory: 'Sync Engine: показать историю',
	version: ({ at }) => (at > 0 ? new Date(at).toLocaleString() : 'Время неизвестно'),
	viewDiff: 'Сравнить с текущей',
	viewDiffShort: 'Дифф',
	viewFull: 'Полный текст',
	viewFullShort: 'Текст',
};

export { en, ru, zh, zhTW };
