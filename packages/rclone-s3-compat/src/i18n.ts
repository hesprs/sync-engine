export type RcloneTranslations = {
	rcloneIgnoreEtags: string;
	rcloneIgnoreEtagsDescription: string;
};

export const en: RcloneTranslations = {
	rcloneIgnoreEtags: 'Ignore rclone ETags',
	rcloneIgnoreEtagsDescription:
		'Use listing modification times and sizes when the backend does not support ETags or disables ETag calculation to reduce computation. Uses listings after uploads and for file stats; batch uploads in the same directory share a listing.',
};

export const zh: RcloneTranslations = {
	rcloneIgnoreEtags: '忽略 rclone ETag',
	rcloneIgnoreEtagsDescription:
		'后端不支持 ETag，或为减少计算开销而关闭 ETag 计算时，使用列表中的修改时间和大小识别文件。上传后及查询文件状态时请求列表，同目录批量上传会合并查询。',
};

export const zhTW: RcloneTranslations = {
	rcloneIgnoreEtags: '忽略 rclone ETag',
	rcloneIgnoreEtagsDescription:
		'後端不支援 ETag，或為減少計算開銷而關閉 ETag 計算時，使用列表中的修改時間和大小識別檔案。上傳後及查詢檔案狀態時請求列表，同目錄批次上傳會合併查詢。',
};

export const ru: RcloneTranslations = {
	rcloneIgnoreEtags: 'Игнорировать ETag rclone',
	rcloneIgnoreEtagsDescription:
		'Если сервер не поддерживает ETag или отключает их вычисление для снижения нагрузки, используйте время изменения и размер из списка файлов. Запрашивает список после загрузки и при проверке файла; пакетные загрузки в один каталог используют общий список.',
};
