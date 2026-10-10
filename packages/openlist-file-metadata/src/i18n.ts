import type { MetadataTranslations } from './setting';

export const en: MetadataTranslations = {
	openListFileMetadata: 'OpenList File Metadata',
	openListPreferMetadataMtime: 'Prefer metadata modification time on download',
	openListPreferMetadataMtimeDescription:
		'For OpenList downloads, use a valid metadata modification time when available; otherwise use the server modification time. Creation-time handling and sync decisions stay the same.',
};

export const zh: MetadataTranslations = {
	openListFileMetadata: 'OpenList 文件元数据',
	openListPreferMetadataMtime: '下载时优先使用元数据修改时间',
	openListPreferMetadataMtimeDescription:
		'下载 OpenList 文件时，优先使用有效的元数据修改时间；缺失或无效时使用服务器修改时间。创建时间的处理和同步判断保持不变。',
};

export const zhTW: MetadataTranslations = {
	openListFileMetadata: 'OpenList 檔案中繼資料',
	openListPreferMetadataMtime: '下載時優先使用中繼資料修改時間',
	openListPreferMetadataMtimeDescription:
		'下載 OpenList 檔案時，優先使用有效的中繼資料修改時間；缺少或無效時使用伺服器修改時間。建立時間的處理和同步判斷維持不變。',
};

export const ru: MetadataTranslations = {
	openListFileMetadata: 'Метаданные файлов OpenList',
	openListPreferMetadataMtime: 'Использовать время изменения из метаданных при скачивании',
	openListPreferMetadataMtimeDescription:
		'При скачивании из OpenList используйте корректное время изменения из метаданных, если оно доступно; иначе — время сервера. Обработка времени создания и решения о синхронизации не меняются.',
};
