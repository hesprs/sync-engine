export type CollaborationTranslations = {
	brokerConnectionError: (message: string) => string;
	brokerUrl: string;
	brokerUrlDescription: string;
	brokerUrlPlaceholder: string;
	clientIdPrefix: string;
	clientIdPrefixDescription: string;
	collaboration: string;
	copyRoomCode: string;
	copyTopic: string;
	enableCollaboration: string;
	enableCollaborationDescription: string;
	generateRoomCode: string;
	invalidMessage: string;
	mobileStatusIcon: string;
	mobileStatusIconDescription: string;
	mqttErrorSuffix: string;
	password: string;
	passwordDescription: string;
	publishFailed: (message: string) => string;
	raceDetected: (count: number) => string;
	reconnect: string;
	roomCode: string;
	roomCodeCopied: string;
	roomCodeDescription: string;
	roomCodeInvalid: string;
	roomCodeMissing: string;
	staleMessage: string;
	status: string;
	statusConnected: string;
	statusConnecting: string;
	statusDisabled: string;
	statusError: string;
	statusMissingRoomCode: string;
	statusReconnecting: string;
	topic: string;
	topicCopied: string;
	topicDescription: string;
	username: string;
	usernameDescription: string;
	usernamePlaceholder: string;
};

const en: CollaborationTranslations = {
	brokerConnectionError: (message) => `Collaboration broker connection failed: ${message}`,
	brokerUrl: 'Broker URL',
	brokerUrlDescription:
		'MQTT broker WebSocket URL. The default is a free public EMQX broker; do not use it for messages you are not willing to expose to the broker.',
	brokerUrlPlaceholder: 'wss://broker.emqx.io:8084/mqtt',
	clientIdPrefix: 'Client ID prefix',
	clientIdPrefixDescription:
		'Prefilled with your device type on first run. Each session appends a random suffix so clients do not disconnect each other.',
	collaboration: 'Collaboration',
	copyRoomCode: 'Copy',
	copyTopic: 'Copy topic',
	enableCollaboration: 'Enable collaboration',
	enableCollaborationDescription:
		'Connect to the broker and exchange encrypted change notifications with devices using the same room code. Peers then list the remote backend themselves.',
	generateRoomCode: 'Generate',
	invalidMessage: 'Ignored an invalid or untrusted collaboration message.',
	mobileStatusIcon: 'Show connection status icon on mobile',
	mobileStatusIconDescription:
		'Display live collaboration connection status icon in the top navigation bar on mobile devices.',
	mqttErrorSuffix: ' (MQTT error)',
	password: 'Broker password',
	passwordDescription:
		'Select a secret from Obsidian secret storage for brokers that require authentication.',
	publishFailed: (message) => `Collaboration notification failed: ${message}`,
	raceDetected: (count) =>
		`Detected ${count} concurrently overwritten file(s); routing to the configured conflict resolver.`,
	reconnect: 'Reconnect',
	roomCode: 'Room code',
	roomCodeCopied: 'Room code copied.',
	roomCodeDescription:
		'Create one room code and add it to Obsidian secret storage on every device. Share it only through a trusted channel.',
	roomCodeInvalid: 'The collaboration room code is invalid.',
	roomCodeMissing: 'No collaboration room code is configured.',
	staleMessage:
		'Ignored a collaboration message because the device clocks differ by more than 2 minutes.',
	status: 'Status',
	statusConnected: 'Connected',
	statusConnecting: 'Connecting',
	statusDisabled: 'Disabled',
	statusError: 'Error',
	statusMissingRoomCode: 'Room code missing',
	statusReconnecting: 'Reconnecting',
	topic: 'Topic',
	topicCopied: 'Topic copied.',
	topicDescription: 'Copy the topic used by this room to the clipboard.',
	username: 'Broker username',
	usernameDescription: 'Username for brokers that require authentication. Stored in plain text.',
	usernamePlaceholder: 'username',
};

const zh: CollaborationTranslations = {
	brokerConnectionError: (message) => `协作 broker 连接失败：${message}`,
	brokerUrl: 'Broker 地址',
	brokerUrlDescription:
		'MQTT broker 的 WebSocket 地址。默认为免费的公共 EMQX broker；公共 broker 会看到消息元数据。',
	brokerUrlPlaceholder: 'wss://broker.emqx.io:8084/mqtt',
	clientIdPrefix: '客户端 ID 前缀',
	clientIdPrefixDescription:
		'首次启用时自动填入本设备类型，可自定义。每次启动会在其后附加随机后缀，避免客户端互相踢下线。',
	collaboration: '实时协作',
	copyRoomCode: '复制',
	copyTopic: '复制主题',
	enableCollaboration: '启用实时协作',
	enableCollaborationDescription:
		'连接 broker，并与使用相同房间码的设备交换加密的变更通知，由各端自行遍历远端。',
	generateRoomCode: '生成',
	invalidMessage: '已忽略无效或不可信的协作消息。',
	mobileStatusIcon: '移动端顶部显示连接状态图标',
	mobileStatusIconDescription: '在移动端笔记顶部操作栏显示实时协作连接状态图标（WiFi 图标）。',
	mqttErrorSuffix: ' (MQTT 异常)',
	password: 'Broker 密码',
	passwordDescription: '从 Obsidian 密钥存储中选择一个密钥，用于需要认证的 broker。',
	publishFailed: (message) => `协作通知发送失败：${message}`,
	raceDetected: (count) => `检测到 ${count} 个并发覆盖的文件，正在交由配置的冲突解决器处理。`,
	reconnect: '重新连接',
	roomCode: '房间码',
	roomCodeCopied: '房间码已复制。',
	roomCodeDescription:
		'生成一次房间码，并在每台设备上加入 Obsidian 密钥存储。请只通过可信渠道分享。',
	roomCodeInvalid: '协作房间码无效。',
	roomCodeMissing: '尚未配置协作房间码。',
	staleMessage: '已忽略一条协作消息：设备时钟相差超过 2 分钟。',
	status: '状态',
	statusConnected: '已连接',
	statusConnecting: '正在连接',
	statusDisabled: '已禁用',
	statusError: '错误',
	statusMissingRoomCode: '缺少房间码',
	statusReconnecting: '正在重连',
	topic: '主题',
	topicCopied: '主题已复制。',
	topicDescription: '复制此房间使用的主题到剪贴板。',
	username: 'Broker 用户名',
	usernameDescription: '需要认证的 broker 的用户名，明文保存。',
	usernamePlaceholder: '用户名',
};

const zhTW: CollaborationTranslations = {
	brokerConnectionError: (message) => `協作 broker 連線失敗：${message}`,
	brokerUrl: 'Broker 位址',
	brokerUrlDescription:
		'MQTT broker 的 WebSocket 位址。預設為免費的公共 EMQX broker；公共 broker 會看到訊息中繼資料。',
	brokerUrlPlaceholder: 'wss://broker.emqx.io:8084/mqtt',
	clientIdPrefix: '用戶端 ID 前綴',
	clientIdPrefixDescription:
		'首次啟用時自動填入本裝置類型，可自訂。每次啟動會在其後附加隨機後綴，避免用戶端互相中斷連線。',
	collaboration: '即時協作',
	copyRoomCode: '複製',
	copyTopic: '複製主題',
	enableCollaboration: '啟用即時協作',
	enableCollaborationDescription:
		'連線 broker，並與使用相同房間碼的裝置交換加密的變更通知，由各端自行遍歷遠端。',
	generateRoomCode: '產生',
	invalidMessage: '已忽略無效或不可信的協作訊息。',
	mobileStatusIcon: '行動端頂部顯示連線狀態圖示',
	mobileStatusIconDescription: '在行動端筆記頂部操作列顯示即時協作連線狀態圖示（WiFi 圖示）。',
	mqttErrorSuffix: ' (MQTT 異常)',
	password: 'Broker 密碼',
	passwordDescription: '從 Obsidian 密鑰儲存中選擇一個密鑰，用於需要認證的 broker。',
	publishFailed: (message) => `協作通知傳送失敗：${message}`,
	raceDetected: (count) => `偵測到 ${count} 個並行覆寫的檔案，正在交由設定的衝突解決器處理。`,
	reconnect: '重新連線',
	roomCode: '房間碼',
	roomCodeCopied: '房間碼已複製。',
	roomCodeDescription:
		'產生一次房間碼，並在每台裝置上加入 Obsidian 密鑰儲存。請只透過可信管道分享。',
	roomCodeInvalid: '協作房間碼無效。',
	roomCodeMissing: '尚未設定協作房間碼。',
	staleMessage: '已忽略一則協作訊息：裝置時鐘相差超過 2 分鐘。',
	status: '狀態',
	statusConnected: '已連線',
	statusConnecting: '正在連線',
	statusDisabled: '已停用',
	statusError: '錯誤',
	statusMissingRoomCode: '缺少房間碼',
	statusReconnecting: '正在重新連線',
	topic: '主題',
	topicCopied: '主題已複製。',
	topicDescription: '複製此房間使用的主題到剪貼簿。',
	username: 'Broker 使用者名稱',
	usernameDescription: '需要認證的 broker 的使用者名稱，以明文儲存。',
	usernamePlaceholder: '使用者名稱',
};

const ru: CollaborationTranslations = {
	brokerConnectionError: (message) =>
		`Не удалось подключиться к брокеру совместной работы: ${message}`,
	brokerUrl: 'URL брокера',
	brokerUrlDescription:
		'WebSocket-адрес брокера MQTT. По умолчанию используется бесплатный публичный EMQX; брокер видит метаданные сообщений.',
	brokerUrlPlaceholder: 'wss://broker.emqx.io:8084/mqtt',
	clientIdPrefix: 'Префикс ID клиента',
	clientIdPrefixDescription:
		'При первом запуске подставляется тип устройства; значение можно изменить. К префиксу добавляется случайный суффикс на каждый сеанс, чтобы клиенты не отключали друг друга.',
	collaboration: 'Совместная работа',
	copyRoomCode: 'Копировать',
	copyTopic: 'Копировать топик',
	enableCollaboration: 'Включить совместную работу',
	enableCollaborationDescription:
		'Подключиться к брокеру и обмениваться зашифрованными уведомлениями с устройствами, использующими тот же код комнаты.',
	generateRoomCode: 'Создать',
	invalidMessage: 'Недопустимое или недоверенное сообщение совместной работы проигнорировано.',
	mobileStatusIcon: 'Значок статуса на мобильных устройствах',
	mobileStatusIconDescription:
		'Отображать значок статуса подключения совместной работы на верхней панели мобильных устройств.',
	mqttErrorSuffix: ' (Ошибка MQTT)',
	password: 'Пароль брокера',
	passwordDescription:
		'Выберите секрет из хранилища секретов Obsidian для брокеров, требующих аутентификации.',
	publishFailed: (message) => `Не удалось отправить уведомление совместной работы: ${message}`,
	raceDetected: (count) =>
		`Обнаружено файлов с одновременной перезаписью: ${count}. Передаём настроенному обработчику конфликтов.`,
	reconnect: 'Переподключить',
	roomCode: 'Код комнаты',
	roomCodeCopied: 'Код комнаты скопирован.',
	roomCodeDescription:
		'Создайте один код комнаты и добавьте его в хранилище секретов Obsidian на каждом устройстве. Передавайте его только по доверенному каналу.',
	roomCodeInvalid: 'Неверный код комнаты.',
	roomCodeMissing: 'Код комнаты не настроен.',
	staleMessage:
		'Сообщение совместной работы проигнорировано: разница часов устройств превышает 2 минуты.',
	status: 'Статус',
	statusConnected: 'Подключено',
	statusConnecting: 'Подключение',
	statusDisabled: 'Отключено',
	statusError: 'Ошибка',
	statusMissingRoomCode: 'Нет кода комнаты',
	statusReconnecting: 'Переподключение',
	topic: 'Топик',
	topicCopied: 'Топик скопирован.',
	topicDescription: 'Скопировать топик этой комнаты в буфер обмена.',
	username: 'Имя пользователя брокера',
	usernameDescription:
		'Имя пользователя для брокеров, требующих аутентификации. Хранится в открытом виде.',
	usernamePlaceholder: 'имя пользователя',
};

export { en, ru, zh, zhTW };
