import type { MetadataTranslations } from './setting';

export const en: MetadataTranslations = {
	s3Rclone: 'S3 rclone',
	s3RclonePreferMetadataMtime: 'Prefer metadata modification time on download',
	s3RclonePreferMetadataMtimeDescription:
		'For rclone downloads, use a valid metadata modification time when available; otherwise use the server modification time. Creation-time handling and sync decisions stay the same.',
};

export const zh: MetadataTranslations = {
	s3Rclone: 'S3 rclone',
	s3RclonePreferMetadataMtime: '下载时优先使用元数据修改时间',
	s3RclonePreferMetadataMtimeDescription:
		'下载 rclone 文件时，优先使用有效的元数据修改时间；缺失或无效时使用服务器修改时间。创建时间的处理和同步判断保持不变。',
};

export const zhTW: MetadataTranslations = {
	s3Rclone: 'S3 rclone',
	s3RclonePreferMetadataMtime: '下載時優先使用中繼資料修改時間',
	s3RclonePreferMetadataMtimeDescription:
		'下載 rclone 檔案時，優先使用有效的中繼資料修改時間；缺少或無效時使用伺服器修改時間。建立時間的處理和同步判斷維持不變。',
};

export const ru: MetadataTranslations = {
	s3Rclone: 'S3 rclone',
	s3RclonePreferMetadataMtime: 'Использовать время изменения из метаданных при скачивании',
	s3RclonePreferMetadataMtimeDescription:
		'При скачивании из rclone используйте корректное время изменения из метаданных, если оно доступно; иначе — время сервера. Обработка времени создания и решения о синхронизации не меняются.',
};
