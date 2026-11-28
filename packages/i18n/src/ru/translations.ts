import type { Translations } from '@hesprs/sync-engine-sdk';

const rules = new Intl.PluralRules('ru-RU');
const p = (count: number, one: string, few: string, many: string) => {
	switch (rules.select(count)) {
		case 'one': {
			return one;
		}
		case 'few': {
			return few;
		}
		default: {
			return many;
		}
	}
};
const pc = (count: number, one: string, few: string, many: string) =>
	`${count} ${p(count, one, few, many)}`;
const pcOperationAccusative = (count: number) => pc(count, 'операцию', 'операции', 'операций');

const ru: Translations = {
	addHeader: 'Добавить заголовок',
	addRecord: 'Добавить запись',
	addSecretHeader: 'Добавить секретный заголовок',
	addSource: 'Добавить источник',
	addStrategy: 'Добавить стратегию',
	asymmetricStorage: 'Асимметричное хранилище',
	asymmetricStorageDescription: () =>
		createFragment((frag) => {
			frag.appendText('Используйте ');
			frag.createEl('a', {
				attr: { href: 'https://sync.consensia.cc/deep-dive/asymmetric-storage' },
				text: 'асимметричное хранилище',
			});
			frag.appendText(', чтобы существенно ускорить синхронизацию.');
		}),
	asymmetricStorageWarning: (flag) =>
		createFragment((frag) => {
			if (flag) {
				frag.createEl('p', {
					text: 'Обратите внимание на следующее перед включением асимметричного хранилища:',
				});
				const ol = frag.createEl('ol');
				ol.createEl('li', {
					text: 'Удалённое хранилище больше не будет повторять локальную иерархическую структуру. Все файлы будут загружаться в корневой каталог в «плоском» виде с префиксом из случайной строки-якоря.',
				});
				ol.createEl('li', {
					text: 'Если вам важно, чтобы удалённое хранилище оставалось удобным для чтения человеком, не включайте эту функцию.',
				});
				ol.createEl('li', {
					text: 'После включения убедитесь, что асимметричное хранилище активировано на всех устройствах.',
				});
			} else {
				frag.createEl('p', {
					text: 'Обратите внимание на следующее перед отключением асимметричного хранилища:',
				});
				const ol = frag.createEl('ol');
				ol.createEl('li', {
					text: 'Все последующие загрузки будут повторять локальную иерархическую структуру.',
				});
				ol.createEl('li', {
					text: 'Убедитесь, что асимметричное хранилище отключено на всех устройствах.',
				});
			}
		}),
	avoidAutoSyncWhenOffline: 'Избегать автосинхронизации офлайн',
	avoidAutoSyncWhenOfflineDescription:
		'Незаметно пропускать все запуски синхронизации, кроме ручных, при отсутствии подключения к интернету.',
	awaitingConfirmation: 'Ожидание подтверждения',
	backend: 'Бэкенд хранилища',
	backendDescription: 'Выберите облачный сервис. Бэкенды предоставляются модулями.',
	backendNotInstalled: (name) => `Бэкенд «${name}» не установлен!`,
	bidirectional: 'Двунаправленная',
	cancel: 'Отмена',
	cancelled: 'Отменено',
	checkConnection: 'Проверить соединение',
	checkConnectionFailed: 'Ошибка проверки соединения',
	checkConnectionSuccess: 'Соединение успешно проверено',
	clear: 'Очистить',
	clearRecords: 'Очистить записи',
	clearRecordsDescription:
		'Sync Engine записывает состояния синхронизации для разрешения операций между локальными и удалёнными файлами. Внимание: очистка записей повлияет на решения синхронизации.',
	completed: 'Завершено',
	completedNoop: 'Уже синхронизировано',
	confirm: 'Подтвердить',
	confirmDeleteDescription: (count) =>
		`Подтвердите удаление ${count} локальных файлов; невыбранные файлы будут повторно отправлены на удалённое хранилище.`,
	confirmDeleteInAutoSync: 'Подтверждать удаления при автосинхронизации',
	confirmDeleteInAutoSyncDescription:
		'Показывать подтверждение для локальных файлов, которые будут удалены во время автоматической синхронизации. Вы сможете выбрать: удалить их или повторно отправить на сервер.',
	confirmTasksDescription: ({ total, conflict, deleteLocal, deleteRemote }) => {
		const deleteOr = deleteLocal + deleteRemote !== 0;
		let result = `Всего при синхронизации будет выполнено ${pc(total, 'операция', 'операции', 'операций')}`;
		if (deleteOr || conflict !== 0) result += '. В том числе';
		if (deleteOr) result += ' удаление';
		if (deleteLocal !== 0)
			result += ` ${deleteLocal} ${p(deleteLocal, 'локального элемента', 'локальных элементов', 'локальных элементов')}`;
		if (deleteLocal !== 0 && deleteRemote !== 0) result += ' и';
		if (deleteRemote !== 0)
			result += ` ${deleteRemote} ${p(deleteRemote, 'удалённого элемента', 'удалённых элементов', 'удалённых элементов')}`;
		if (deleteOr && conflict !== 0) result += ', а также';
		if (conflict !== 0)
			result += ` разрешение ${pc(conflict, 'конфликта', 'конфликтов', 'конфликтов')}`;
		result += ':';
		return result;
	},
	confirmTasksInSync: 'Подтверждать операции при ручной синхронизации',
	confirmTasksInSyncDescription:
		'Показывать ожидающие операции и выполнять их только после подтверждения (не влияет на автосинхронизацию).',
	conflictResolveStrategy: 'Стратегия разрешения конфликтов',
	conflictResolveStrategyDescription:
		'Выберите способ разрешения конфликтов, когда и удалённый, и локальный файл были изменены с момента последней синхронизации. Дополнительные стратегии доступны в модулях.',
	conflictResolveStrategyNotInstalled: (strategy) =>
		`Стратегия разрешения конфликтов «${strategy}» не установлена!`,
	controls: 'Управление',
	createLocalDir: 'Создать локальную папку',
	createRemoteDir: 'Создать удалённую папку',
	customHeaders: 'Пользовательские заголовки',
	customHeadersDescription:
		'Добавьте пользовательские заголовки, которые будут отправляться с каждым запросом. Их можно хранить в открытом виде или в связке ключей Obsidian.',
	deleteModule: 'Удалить модуль',
	description: 'Описание',
	descriptionDescription: 'Укажите текст описания, отображаемый в карточке модуля.',
	descriptionPlaceholder: 'Этот модуль…',
	development: 'Разработка',
	diffMatchPatch: 'Объединить',
	disableModule: 'Отключить модуль',
	discoveredModules: ({ module, source }) =>
		`Найдено ${pc(module, 'модуль', 'модуля', 'модулей')} из ${pc(source, 'источника', 'источников', 'источников')}.`,
	done: 'Готово',
	dontSync: 'Не синхронизировать',
	download: 'Скачать',
	downloadModule: 'Скачать модуль',
	edit: 'Редактировать',
	editModuleInformation: 'Редактировать информацию о модуле',
	enable: 'Включить',
	enableDescription: 'Определяет, следует ли загружать этот модуль.',
	enableModule: 'Включить модуль',
	executing: 'Выполняется',
	export: 'Экспорт',
	exportLogsDescription:
		'Экспортировать логи плагина в файл внутри хранилища. Укажите папку для экспорта логов в поле ниже.',
	exportLogsDirectoryPlaceholder: 'Укажите папку для экспорта логов',
	exportLogsFailed: 'Не удалось экспортировать логи',
	exportLogsToFile: 'Экспортировать логи в файл',
	failed: 'Ошибка',
	failedTasksDescription: (count) =>
		`Во время синхронизации не удалось выполнить ${pcOperationAccusative(count)}:`,
	failedToDownloadModule: (name) => `Не удалось скачать модуль «${name}»`,
	failedToFetchSource: (url) => `Не удалось получить источник из «${url}»`,
	failedToLoadModule: (name) => `Не удалось загрузить модуль «${name}»`,
	features: 'Возможности',
	focusSync: 'Синхронизация при фокусе',
	focusSyncDescription:
		'Автоматически запускать синхронизацию при возвращении в Obsidian на передний план. Измените минимальный интервал с предыдущей синхронизации в поле.',
	focusSyncPlaceholder: 'Введите минимальный интервал (например, 30s, 1min)',
	globPlaceholder: 'Например, temp.md, .trash/**/*',
	headerKeyPlaceholder: 'Ключ заголовка',
	headerValuePlaceholder: 'Значение заголовка',
	hide: 'Скрыть',
	icon: 'Иконка',
	iconDescription: () =>
		createFragment((frag) => {
			frag.appendText(
				'Задайте иконку, отображаемую в карточке модуля. Полный список иконок доступен в ',
			);
			frag.createEl('a', {
				attr: { href: 'https://lucide.dev/icons/' },
				text: 'каталоге Lucide Icons',
			});
			frag.appendText('.');
		}),
	iconPlaceholder: 'Введите код иконки (например, puzzle)',
	idle: 'В ожидании',
	installModuleFromCode: 'Установить модуль из кода',
	installModuleFromFile: 'Установить модуль из файла',
	installed: 'Установлено',
	integrityCheckFailed:
		'Проверка целостности не пройдена. Этот модуль мог быть изменён внешним субъектом. Переустановите модуль, если не знаете, почему это произошло.',
	integrityVerification: 'Проверка целостности',
	integrityVerificationDescription: () =>
		createFragment((frag) => {
			frag.appendText('Проверять хеш при каждой загрузке модуля, ');
			frag.createEl('strong', { text: 'защищая вас от атак с подменой модулей' });
			frag.appendText('.');
		}),
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
	migrationInstruction: (enable) =>
		createFragment((frag) => {
			const p1 = frag.createEl('p', {
				text: `Если вы ранее синхронизировали хранилище, когда эта опция была ${enable ? 'отключена' : 'включена'}, может потребоваться миграция удалённого хранилища. См. `,
			});
			p1.createEl('a', {
				attr: { href: 'https://sync.consensia.cc/usage/remote-migration' },
				text: 'страницу документации',
			});
			p1.appendText(
				' с инструкциями по безопасной ручной миграции. Для безопасности ваших данных Sync Engine не выполняет миграцию автоматически. Если вы уже мигрировали облачное хранилище, это предупреждение можно проигнорировать.',
			);
			frag.createEl('p', { text: 'Подтвердить переключение?' });
		}),
	minRequestInterval: 'Мин. интервал между запросами',
	minRequestIntervalDescription:
		'Задать минимальный интервал между последовательными запросами во время синхронизации. Полезно для сервисов с ограничением частоты запросов. Измените интервал в поле ниже.',
	minRequestIntervalPlaceholder: 'Введите интервал (например, 1s, 500ms)',
	mirrorLocal: 'Зеркало локального хранилища',
	mirrorRemote: 'Зеркало удалённого хранилища',
	miscellaneous: 'Разное',
	moduleAutoUpdate: 'Автообновление модулей',
	moduleAutoUpdateDescription: 'Автоматически обновлять установленные модули из их источников.',
	moduleExtensionWarning: () =>
		createFragment((frag) => {
			frag.appendText('Неверный модуль: файл должен иметь расширение ');
			frag.createEl('code', { text: '.js' });
			frag.appendText(' или ');
			frag.createEl('code', { text: '.mjs' });
			frag.appendText('.');
		}),
	moduleManagement: 'Управление модулями',
	moduleManagementDescription:
		'Управление модулями на отдельной странице. Вы можете устанавливать, удалять, обновлять, включать, отключать и редактировать модули.',
	moduleSourcePlaceholder: 'https://example.com/modules.json',
	moduleSources: 'Источники модулей',
	moduleSourcesDescription:
		'Редактируйте источники модулей, из которых формируется каталог. Это позволяет устанавливать сторонние модули Sync Engine.',
	moduleXInstalled: (x) => `Модуль «${x}» установлен.`,
	moveLocal: 'Переместить локальный файл',
	moveRemote: 'Переместить удалённый файл',
	name: 'Название',
	nameDescription: 'Укажите название, отображаемое в карточке модуля.',
	namePlaceholder: 'Введите отображаемое имя модуля',
	noHeaderConfigured: 'Заголовок не настроен.',
	noInstalledModulesFound: 'Установленные модули не найдены.',
	noMatchingModulesFound: 'Подходящие модули не найдены.',
	noModulesAvailable: 'Нет доступных модулей.',
	noSourceConfigured: 'Источник не настроен.',
	noStrategyConfigured: 'Стратегия не настроена.',
	none: 'Нет',
	noticeStatusOnMobile: 'Уведомления о статусе на мобильных устройствах',
	noticeStatusOnMobileDescription:
		'Отображать всплывающее уведомление на мобильных устройствах во время синхронизации. Заменяет строку состояния, используемую на ПК.',
	official: 'Официальный',
	openReadme: 'Открыть страницу README модуля',
	pleaseSetBackend: 'Пожалуйста, выберите бэкенд!',
	readmePage: 'Страница README',
	readmePageDescription:
		'Страница README модуля необязательна; пустое поле означает, что README нет.',
	readmePagePlaceholder: 'https://example.com/my-module',
	realtimeSync: 'Синхронизация в реальном времени',
	realtimeSyncDescription:
		'Запускать синхронизацию автоматически сразу после изменения файлов. Измените задержку между изменением файла и запуском синхронизации в поле ниже.',
	realtimeSyncFastMode: 'Быстрый режим синхронизации в реальном времени',
	realtimeSyncFastModeDescription:
		'Ускорить синхронизацию в реальном времени, повторно используя кэшированные данные и избегая лишней проверки удалённых файлов.',
	realtimeSyncPlaceholder: 'Введите задержку (например, 500ms, 5s)',
	recordsCleared: 'Записи очищены',
	refreshSources: 'Обновить источники',
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
	settingTips: ({ addLabel, labels }) =>
		createFragment((frag) => {
			const paragraph = frag.createEl('p', {
				text: 'Спасибо, что выбрали Sync Engine! Откройте ',
			});
			paragraph.createEl('a', {
				attr: { href: 'https://sync.consensia.cc/usage/settings' },
				text: 'документацию',
			});
			paragraph.appendText(' для подробного объяснения каждой настройки. Метки настроек:');
			const ul = frag.createEl('ul');
			for (const label of labels) {
				const li = ul.createEl('li');
				const flair = addLabel(li, label);
				flair.addClass('se-m-0');
				li.appendText(` ${flair.ariaLabel}`);
			}
		}),
	showInstalledOnly: 'Только установленные',
	showProgress: 'Показывать прогресс',
	skip: 'Пропустить',
	someModulesHidden:
		'Некоторые модули скрыты, поскольку плагин Sync Engine устарел. Обновите его, чтобы просмотреть полный каталог модулей.',
	speed: 'Скорость',
	speedLabelDescription:
		'Правильная настройка этого параметра может повысить скорость синхронизации.',
	startNonInteractiveSync: 'Запустить синхронизацию без подтверждений',
	startSync: 'Запустить синхронизацию',
	startupSync: 'Синхронизация при запуске',
	startupSyncDescription:
		'Автоматически запускать синхронизацию при старте плагина после указанной задержки. Измените задержку в поле ниже.',
	startupSyncPlaceholder: 'Введите задержку (например, 5s, 1min)',
	stopSync: 'Остановить синхронизацию',
	syncProgress: 'Прогресс синхронизации',
	syncStrategy: 'Стратегия синхронизации',
	syncStrategyDescription:
		'Используйте правила Glob для настройки разных стратегий синхронизации для разных файлов или исключения отдельных файлов и папок из синхронизации.',
	syncStrategyNotInstalled: (strategy) => `Стратегия синхронизации «${strategy}» не установлена!`,
	syncStrategyTips: () =>
		createFragment((frag) => {
			const p1 = frag.createEl('p', {
				text: 'Конфигурация стратегии синхронизации — это упорядоченный список записей вида ',
			});
			p1.createEl('a', {
				attr: { href: 'https://en.wikipedia.org/wiki/Glob_(programming)' },
			}).createEl('strong', { text: 'правило Glob' });
			p1.appendText(' + ');
			p1.createEl('strong', { text: 'направление синхронизации' });
			p1.appendText(
				'. Правило Glob выбирает целевой набор файлов, а направление синхронизации определяет, как синхронизируются изменения этих файлов. Один файл может соответствовать нескольким записям; приоритет имеет последняя совпадающая запись в списке.',
			);
			const p2 = frag.createEl('p', {
				text: 'Правило Glob записывается как простой путь к файлу с ',
			});
			p2.createEl('code', { text: '/' });
			p2.appendText(
				' в качестве разделителя пути и несколькими расширениями подстановочных знаков:',
			);
			const olGlob = frag.createEl('ul');
			// oxlint-disable-next-line sort-keys
			Object.entries({
				'*': 'соответствует любым символам внутри одного сегмента пути.',
				'**': 'соответствует любому количеству сегментов, включая ни одного.',
				'?': 'соответствует одному символу.',
				'[abc]': 'соответствует одному символу из набора.',
				'[!abc]': 'соответствует одному символу вне набора.',
				'{a,b,c}':
					'соответствует любому из перечисленных вариантов, фигурные скобки могут вкладываться.',
			}).forEach(([key, text]) => {
				const li = olGlob.createEl('li');
				li.createEl('code', { text: key });
				li.appendText(`: ${text}`);
			});
			const li1 = olGlob.createEl('li', { text: 'Правило, заканчивающееся на ' });
			li1.createEl('code', { text: '/' });
			li1.appendText(', соответствует только папкам.');
			const li2 = olGlob.createEl('li', { text: 'Правило, начинающееся с ' });
			li2.createEl('code', { text: '/' });
			li2.appendText(
				', сопоставляется от корня хранилища, иначе оно соответствует на любой глубине.',
			);
			const li3 = olGlob.createEl('li', {
				text: 'Не забывайте добавлять расширения (например, ',
			});
			li3.createEl('code', { text: '.md' });
			li3.appendText(') при сопоставлении файлов.');
			olGlob.createEl('li', { text: 'Регистр в правилах учитывается.' });
			frag.createEl('p', { text: 'Встроенные направления синхронизации включают:' });
			const olDirection = frag.createEl('ul');
			// oxlint-disable-next-line sort-keys
			Object.entries({
				Двунаправленная: 'синхронизирует изменения с обеих сторон.',
				'Зеркало локального хранилища':
					'перезаписывает удалённое хранилище локальными изменениями.',
				'Зеркало удалённого хранилища':
					'перезаписывает локальное хранилище удалёнными изменениями.',
				'Не синхронизировать': 'исключает соответствующие файлы из синхронизации.',
			}).forEach(([key, text]) => {
				const li = olDirection.createEl('li');
				li.createEl('strong', { text: key });
				li.appendText(`: ${text}`);
			});
		}),
	update: 'Обновить',
	updateAvailable: 'Доступно обновление',
	updateDescription:
		'Определяет, может ли модуль получать обновления. Укажите источник обновлений в поле; пустой источник означает отсутствие обновлений.',
	updateModule: 'Обновить модуль',
	updatePlaceholder: 'https://example.com/modules.json',
	upload: 'Загрузить',
	version: 'Версия',
	versionDescription:
		'Укажите версию модуля, используемую при сравнении обновлений и отображении в карточке модуля.',
	versionPlaceholder: 'Введите версию (например, 0.0.1)',
	walkingRemote: 'Сканирование удалённых файлов',
	warning: 'Предупреждение',
	writeCode: 'Написать код',
	writeCodeDescription: 'Напишите код своего модуля здесь на JavaScript',
	xConfigured: (count) => `Настроено: ${count}`,
	xEnabled: (count) => `Включено модулей: ${count}`,
	xOperationsFailed: (count) => `Не удалось выполнить ${pcOperationAccusative(count)}`,
	xSelected: (count) => `(выбрано: ${count})`,
};

export default ru;
