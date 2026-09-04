import type { Translations } from '@hesprs/sync-engine-sdk';

const ru: Translations = {
	addExclusionRule: 'Добавить правило исключения',
	addHeader: 'Добавить заголовок',
	addInclusionRule: 'Добавить правило включения',
	addRecord: 'Добавить запись',
	addSecretHeader: 'Добавить секретный заголовок',
	addSource: 'Добавить источник',
	asymmetricStorage: 'Асимметричное хранилище',
	asymmetricStorageDescription: (frag) => {
		frag.appendText('Используйте ');
		frag.createEl('a', {
			attr: {
				href: 'https://sync.consensia.cc/deep-dive/asymmetric-storage',
			},
			text: 'асимметричное хранилище',
		});
		frag.appendText(', чтобы существенно ускорить синхронизацию.');
	},
	asymmetricStorageMigration: (frag, flag) => {
		if (flag === 'enable') {
			frag.createEl('p', {
				text: '⚠️ Пожалуйста, будьте внимательны к следующим моментам перед включением асимметричного хранилища:',
			});
			const ol = frag.createEl('ol');
			ol.createEl('li', {
				text: 'Удалённое хранилище больше не будет повторять локальную иерархическую структуру. Все файлы будут загружаться в корневой каталог в «плоском» виде с добавлением случайных строковых якорей.',
			});
			ol.createEl('li', {
				text: 'Если вам важно, чтобы удалённое хранилище оставалось удобным для чтения человеком, не включайте эту функцию.',
			});
			ol.createEl('li', {
				text: 'После включения убедитесь, что асимметричное хранилище активировано на всех устройствах.',
			});
			ol.createEl('li', {
				text: 'Миграция необходима, если этот хранилище (vault) ранее загружалось без асимметричного хранилища.',
			});
		} else {
			frag.createEl('p', {
				text: '⚠️ Пожалуйста, будьте внимательны к следующим моментам перед отключением асимметричного хранилища:',
			});
			const ol = frag.createEl('ol');
			ol.createEl('li', {
				text: 'Все последующие загрузки будут повторять локальную иерархическую структуру.',
			});
			ol.createEl('li', {
				text: 'Пожалуйста, убедитесь, что асимметричное хранилище отключено на всех устройствах.',
			});
			ol.createEl('li', {
				text: 'Миграция необходима, если этот хранилище (vault) ранее загружалось с включённым асимметричным хранилищем.',
			});
		}
	},
	awaitingConfirmation: 'Ожидание подтверждения',
	backend: 'Бэкенд хранилища',
	backendDescription: 'Выберите облачный сервис. Бэкенды предоставляются модулями.',
	bidirectional: 'Двунаправленная',
	cancel: 'Отмена',
	cancelled: 'Отменено',
	caseSensitive: 'С учётом регистра',
	checkConnection: 'Проверить соединение',
	checkConnectionFailed: 'Ошибка проверки соединения',
	checkConnectionSuccess: 'Соединение успешно проверено',
	clear: 'Очистить',
	clearRecords: 'Очистить записи',
	clearRecordsDescription:
		'Sync Engine записывает состояния синхронизации для разрешения операций между локальными и удалёнными файлами. Эта опция позволяет выборочно очищать записи. Внимание: это действие может привести к потере данных.',
	completed: 'Завершено',
	completedNoop: 'Уже синхронизировано',
	configure: 'Настроить',
	confirm: 'Подтвердить',
	confirmDeleteDescription:
		'Пожалуйста, подтвердите удаление локальных файлов (всего {{x}}). Невыбранные файлы будут загружены повторно.',
	confirmDeleteInAutoSync: 'Подтверждать удаления при автосинхронизации',
	confirmDeleteInAutoSyncDescription:
		'Показывать подтверждение для локальных файлов, которые будут удалены во время автоматической синхронизации. Вы сможете выбрать: удалить их или загрузить повторно.',
	confirmTasksDescription: (frag, { total, conflict, deleteLocal, deleteRemote }) => {
		const deleteOr = deleteLocal + deleteRemote !== 0;
		frag.appendText(`Всего при синхронизации будет выполнено операций: ${total}`);
		if (conflict + deleteLocal + deleteRemote !== 0) frag.appendText('. В том числе');
		if (deleteOr) frag.appendText(' удаление');
		if (deleteLocal !== 0) frag.appendText(` ${deleteLocal} локальных файл(а/ов)`);
		if (deleteLocal !== 0 && deleteRemote !== 0) frag.appendText(' и');
		if (deleteRemote !== 0) frag.appendText(` ${deleteRemote} удалённых файл(а/ов)`);
		if (deleteOr && conflict !== 0) frag.appendText(', а также');
		if (conflict !== 0) frag.appendText(` разрешение конфликтов: ${conflict}`);
		frag.appendText(':');
	},
	confirmTasksInSync: 'Подтверждать операции при ручной синхронизации',
	confirmTasksInSyncDescription:
		'Показывать ожидающие операции и выполнять их только после подтверждения (не влияет на автосинхронизацию).',
	conflictResolveStrategy: 'Стратегия разрешения конфликтов',
	conflictResolveStrategyDescription:
		'Выберите способ разрешения конфликтов, когда и удалённый, и локальный файл были изменены с момента последней синхронизации. Дополнительные стратегии доступны в модулях.',
	controls: 'Управление',
	createLocalDir: 'Создать локальную папку',
	createRemoteDir: 'Создать удалённую папку',
	customHeaders: 'Пользовательские заголовки',
	customHeadersDescription:
		'Добавьте пользовательские заголовки, которые будут отправляться с каждым запросом. Их можно хранить в открытом виде или в связке ключей Obsidian keychain.',
	delete: 'Удалить',
	deleteModule: 'Удалить модуль',
	description: 'Описание',
	descriptionDescription: 'Укажите текст описания, отображаемый в карточке модуля.',
	descriptionPlaceholder: 'Этот модуль...',
	development: 'Разработка',
	diffMatchPatch: 'Объединить',
	disableModule: 'Отключить модуль',
	done: 'Готово',
	download: 'Скачать',
	downloadModule: 'Скачать модуль',
	edit: 'Редактировать',
	editModuleInformation: 'Редактировать информацию о модуле',
	enable: 'Включить',
	enableDescription: 'Определяет, следует ли загружать этот модуль.',
	enableModule: 'Включить модуль',
	exclusionRules: 'Правила исключения',
	exclusionRulesDescription: (frag) => {
		frag.appendText(
			'Файлы и папки, соответствующие этим glob-шаблонам, не будут синхронизироваться. Не забудьте указать расширения файлов (например, ',
		);
		frag.createEl('code', { text: '.md' });
		frag.appendText('), если хотите исключить файлы. См. ');
		frag.createEl('a', {
			attr: {
				href: 'https://sync.consensia.cc/usage/settings#inclusion-and-exclusion-rules',
			},
			text: 'документацию по настройкам',
		});
		frag.appendText(' для руководства по настройке.');
	},
	executing: 'Выполняется',
	export: 'Экспорт',
	exportLogsDescription:
		'Экспортировать логи плагина в файл внутри хранилища. Укажите папку для экспорта логов в поле ниже.',
	exportLogsDirectoryPlaceholder: 'Укажите папку для экспорта логов',
	exportLogsFailed: 'Не удалось экспортировать логи',
	exportLogsToFile: 'Экспортировать логи в файл',
	failed: 'Ошибка',
	failedTasksDescription: 'Не удалось выполнить задач во время синхронизации: {{x}}:',
	failedToDownloadModule: 'Не удалось скачать модуль «{{name}}»',
	failedToFetchSource: 'Не удалось получить источник из «{{url}}»',
	failedToLoadModule: 'Не удалось загрузить модуль «{{name}}»',
	features: 'Возможности',
	filterPlaceholder: 'Например, temp.md, .trash/**/*',
	filterRules: 'Правила фильтрации',
	headerKeyPlaceholder: 'Ключ заголовка',
	headerValuePlaceholder: 'Значение заголовка',
	hide: 'Скрыть',
	icon: 'Иконка',
	iconDescription: (frag) => {
		frag.appendText(
			'Задайте иконку, отображаемую в карточке модуля. Полный список иконок доступен в ',
		);
		frag.createEl('a', {
			attr: { href: 'https://lucide.dev/icons/' },
			text: 'каталоге Lucide Icons',
		});
		frag.appendText('.');
	},
	iconPlaceholder: 'Введите код иконки (например, puzzle)',
	idle: 'В ожидании',
	inclusionRules: 'Правила включения',
	inclusionRulesDescription: (frag) => {
		frag.appendText(
			'Файлы и папки, подпадающие под правила исключения, но соответствующие этим glob-шаблонам, всё равно будут синхронизированы. См. ',
		);
		frag.createEl('a', {
			attr: {
				href: 'https://sync.consensia.cc/usage/settings#inclusion-and-exclusion-rules',
			},
			text: 'документацию по настройкам',
		});
		frag.appendText(' для руководства по настройке.');
	},
	installModuleFromFile: 'Установить модуль из файла',
	installed: 'Установлено',
	integrityVerification: 'Проверка целостности',
	integrityVerificationDescription: (frag) => {
		frag.appendText('Проверять хэш при каждой загрузке модуля, ');
		frag.createEl('strong', {
			text: 'защищая вас от атак с подменой модулей',
		});
		frag.appendText('.');
	},
	keepLocal: 'Оставить локальную версию',
	keepRemote: 'Оставить удалённую версию',
	latestSurvive: 'Оставлять последнюю версию',
	loadingModules: 'Загрузка модулей…',
	match: 'Совпадение',
	matchLabelDescription: 'Эта настройка должна быть одинаковой на всех устройствах.',
	maxFileSize: 'Макс. размер файла',
	maxFileSizeDescription:
		'Пропускать файлы, превышающие этот размер, при синхронизации. Полезно для сервисов с ограничением по объёму хранилища. Измените лимит в поле ниже.',
	maxFileSizePlaceholder: 'Введите лимит размера (например, 10MB, 0.5GB)',
	maxMemoryConsumption: 'Макс. расход памяти',
	maxMemoryConsumptionDescription:
		'Ограничить объём оперативной памяти, используемой при синхронизации. Полезно для устройств с небольшим объёмом ОЗУ. Измените лимит в поле ниже.',
	maxMemoryConsumptionPlaceholder: 'Введите лимит памяти (например, 1GB, 200MB)',
	maxRequestConcurrency: 'Макс. количество одновременных запросов',
	maxRequestConcurrencyDescription:
		'Ограничить количество параллельных запросов во время синхронизации. Полезно для сервисов с лимитом на частоту запросов. Измените лимит в поле ниже.',
	maxRequestConcurrencyPlaceholder: 'Введите лимит запросов',
	migrationDescription:
		'Миграция может занять от нескольких секунд до минут в зависимости от размера хранилища. Если вы уже выполнили миграцию удалённого хранилища на другом устройстве, этот шаг можно пропустить.\n\nНачать миграцию сейчас?',
	migrationFailed: 'Ошибка миграции',
	migrationPhase1Description: 'Проверка актуальности локального состояния',
	migrationPhase2Description: 'Очистка удалённого хранилища и записей',
	migrationPhase3Description: 'Заполнение удалённого хранилища новой структурой',
	migrationProcess: 'Процесс миграции',
	minRequestInterval: 'Мин. интервал между запросами',
	minRequestIntervalDescription:
		'Ограничить минимальное время между последовательными запросами во время синхронизации. Полезно для сервисов с ограничением частоты запросов. Измените интервал в поле ниже.',
	minRequestIntervalPlaceholder: 'Введите интервал (например, 1s, 500ms)',
	mirrorLocal: 'Зеркало локального хранилища',
	mirrorRemote: 'Зеркало удалённого хранилища',
	miscellaneous: 'Разное',
	moduleAutoUpdate: 'Автообновление модулей',
	moduleAutoUpdateDescription: 'Автоматически обновлять установленные модули из их источников.',
	moduleExtensionWarning: (frag) => {
		frag.appendText('Неверный модуль: файл должен иметь расширение ');
		frag.createEl('code', { text: '.js' });
		frag.appendText(' или ');
		frag.createEl('code', { text: '.mjs' });
		frag.appendText('.');
	},
	moduleManagement: 'Управление модулями',
	moduleManagementDescription:
		'Управление модулями в специальной панели. Вы можете устанавливать, удалять, обновлять, включать, отключать и редактировать модули, а также их источники.',
	moduleSourcePlaceholder: 'https://example.com/modules.json',
	moduleSources: 'Источники модулей',
	moduleSourcesDescription:
		'Редактируйте источники модулей, из которых формируется каталог. Это позволяет устанавливать сторонние модули Sync Engine.',
	moveLocal: 'Переместить локальный файл',
	moveRemote: 'Переместить удалённый файл',
	name: 'Название',
	nameDescription: 'Укажите название, отображаемое в карточке модуля.',
	namePlaceholder: 'Введите отображаемое имя модуля',
	noHeaderConfigured: 'Заголовок не настроен.',
	noInstalledModulesFound: 'Установленные модули не найдены.',
	noMatchingModulesFound: 'Подходящие модули не найдены.',
	noModulesAvailable: 'Нет доступных модулей.',
	noRuleConfigured: 'Правило не настроено.',
	noSourceConfigured: 'Источник не настроен.',
	none: 'Нет',
	noticeStatusOnMobile: 'Уведомления о статусе на мобильных устройствах',
	noticeStatusOnMobileDescription:
		'Отображать всплывающее уведомление на мобильных устройствах во время синхронизации. Заменяет строку состояния, используемую на ПК.',
	official: 'Официальный',
	openReadme: 'Открыть страницу README модуля.',
	readmePage: 'Страница README',
	readmePageDescription:
		'Укажите необязательную страницу README модуля; пустое поле означает отсутствие README.',
	readmePagePlaceholder: 'https://example.com/my-module',
	realtimeSync: 'Синхронизация в реальном времени',
	realtimeSyncDescription:
		'Запускать синхронизацию автоматически сразу после изменения файлов. Измените задержку между изменением файла и запуском синхронизации в поле ниже.',
	realtimeSyncFastMode: 'Быстрый режим синхронизации в реальном времени',
	realtimeSyncFastModeDescription:
		'Использовать кэшированные данные и избегать лишней проверки удалённых файлов во время синхронизации в реальном времени для ускорения процесса.',
	realtimeSyncPlaceholder: 'Введите задержку (например, 500ms, 5s)',
	recordsCleared: 'Записи очищены',
	remoteMigration: 'Миграция удалённого хранилища',
	removeLocal: 'Удалить локальный файл',
	removeRecord: 'Удалить запись',
	removeRemote: 'Удалить удалённый файл',
	renameAndKeepBoth: 'Переименовать и оставить оба',
	resolveConflict: 'Разрешить конфликт',
	save: 'Сохранить',
	scheduledSync: 'Синхронизация по расписанию',
	scheduledSyncDescription:
		'Периодически запускать синхронизацию через заданные интервалы времени. Измените интервал в поле ниже.',
	scheduledSyncPlaceholder: 'Введите интервал (например, 10min, 0.5h)',
	searchModules: 'Поиск модулей',
	selectAll: 'Выбрать все',
	settingTips: (frag, { addLabel, labels }) => {
		const p = frag.createEl('p', { text: 'Спасибо, что выбрали Sync Engine! Откройте ' });
		p.createEl('a', {
			attr: { href: 'https://sync.consensia.cc/usage/settings' },
			text: 'документацию',
		});
		p.appendText(' для подробного объяснения каждой настройки. Метки настроек:');
		const ul = frag.createEl('ul', 'list-none ps-0!');
		for (const label of labels) {
			const li = ul.createEl('li');
			const flair = addLabel(li, label);
			flair.addClass('m-0');
			li.appendText(` ${flair.ariaLabel}`);
		}
	},
	showInstalledOnly: 'Только установленные',
	showProgress: 'Показывать прогресс',
	skip: 'Пропустить',
	someModulesHidden:
		'Некоторые модули скрыты, поскольку плагин Sync Engine устарел. Обновите его, чтобы просмотреть полный каталог модулей.',
	speed: 'Скорость',
	speedLabelDescription:
		'Правильная настройка этого параметра может повысить скорость синхронизации.',
	startMigration: 'Начать миграцию',
	startNonInteractiveSync: 'Запустить фоновую синхронизацию',
	startSync: 'Запустить синхронизацию',
	startupSync: 'Синхронизация при запуске',
	startupSyncDescription:
		'Автоматически запускать синхронизацию при старте плагина после указанной задержки. Измените задержку в поле ниже.',
	startupSyncPlaceholder: 'Введите задержку (например, 5s, 1min)',
	stopSync: 'Остановить синхронизацию',
	syncProgress: 'Прогресс синхронизации',
	syncStrategy: 'Стратегия синхронизации',
	syncStrategyDescription:
		'Выберите стратегию синхронизации для обработки изменений в файлах. Дополнительные стратегии доступны в модулях.',
	toggleWithoutMigration: 'Переключить без миграции',
	unknownModule: 'Неизвестный модуль',
	unknownModuleDescription: (frag, { fileName, size, path, mtime, ctime }) => {
		const p1 = frag.createEl('p');
		p1.appendText('Sync Engine обнаружил установленный модуль с именем ');
		p1.createEl('code', { text: fileName });
		p1.appendText(
			' в своей директории модулей. Этот модуль не зарегистрирован в панели Sync Engine и не числится в списке исключений для проверки происхождения. ',
		);
		p1.createEl('strong', {
			text: 'Пожалуйста, внимательно ознакомьтесь с информацией ниже перед продолжением:',
		});
		const ul = frag
			.createDiv(
				'rounded-lg border border-[--background-modifier-border] bg-[--background-secondary] px-2',
			)
			.createEl('ul');
		const li1 = ul.createEl('li');
		li1.appendText('Имя файла: ');
		li1.createEl('code', { text: fileName });
		const li2 = ul.createEl('li');
		li2.appendText('Путь к файлу: ');
		li2.createEl('code', { text: path });
		const li3 = ul.createEl('li');
		li3.appendText('Размер: ');
		li3.createEl('code', { text: size });
		const li4 = ul.createEl('li');
		li4.appendText('Дата создания: ');
		li4.createEl('code', { text: ctime });
		const li5 = ul.createEl('li');
		li5.appendText('Дата изменения: ');
		li5.createEl('code', { text: mtime });
		const p2 = frag.createEl('p');
		p2.createEl('strong', {
			text: 'Пожалуйста, избегайте загрузки модулей из неизвестных источников, так как это может быть вредоносной атакой.',
		});
		p2.appendText(
			' Если вы не знаете, откуда появился этот модуль, лучше всего сразу удалить его. Если вы сами создали этот модуль и это сделано намеренно, вы можете выбрать «Настроить» и включить его.',
		);
	},
	update: 'Обновить',
	updateAvailable: 'Доступно обновление',
	updateDescription:
		'Определяет, может ли модуль получать обновления. Укажите источник обновлений в поле; пустой источник означает отсутствие обновлений.',
	updateModule: 'Обновить модуль',
	updatePlaceholder: 'https://example.com/modules.json',
	upload: 'Загрузить',
	walkingRemote: 'Сканирование удалённых файлов',
	xConfigured: 'Настроено: {{x}}',
	xEnabled: 'Включено модулей: {{x}}',
	xSelected: '(выбрано: {{x}})',
};

export default ru;
