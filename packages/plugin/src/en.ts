import type { Translations } from '@';

const en: Translations = {
	addExclusionRule: 'Add exclusion rule',
	addHeader: 'Add header',
	addInclusionRule: 'Add inclusion rule',
	addRecord: 'Add record',
	addSecretHeader: 'Add secret header',
	addSource: 'Add source',
	asymmetricStorage: 'Asymmetric storage',
	asymmetricStorageDescription: (frag) => {
		frag.appendText('Use ');
		frag.createEl('a', {
			attr: {
				href: 'https://sync.consensia.cc/deep-dive/asymmetric-storage',
			},
			text: 'asymmetric storage',
		});
		frag.appendText(' to substantially accelerate syncing.');
	},
	asymmetricStorageMigration: (frag, flag) => {
		if (flag === 'enable') {
			frag.createEl('p', {
				text: '⚠️ You should be cautious about following points before enabling asymmetric storage:',
			});
			const ol = frag.createEl('ol');
			ol.createEl('li', {
				text: 'Remote storage will no longer mirror local hierarchical structure. All files will be uploaded flatly to the base directory with random string anchors appended.',
			});
			ol.createEl('li', {
				text: "If you need the remote to remain readable by humans, please don't enable this feature.",
			});
			ol.createEl('li', {
				text: 'After enabling, please ensure all devices have asymmetric storage enabled.',
			});
			ol.createEl('li', {
				text: 'Migration is necessary if this vault was previously uploaded without asymmetric storage.',
			});
		} else {
			frag.createEl('p', {
				text: '⚠️ You should be cautious about following points before disabling asymmetric storage:',
			});
			const ol = frag.createEl('ol');
			ol.createEl('li', {
				text: 'All subsequent uploads will mirror local hierarchical structure.',
			});
			ol.createEl('li', {
				text: 'Please ensure all devices have asymmetric storage disabled.',
			});
			ol.createEl('li', {
				text: 'Migration is necessary if this vault was previously uploaded with asymmetric storage enabled.',
			});
		}
	},
	awaitingConfirmation: 'Awaiting confirmation',
	backend: 'Storage backend',
	backendDescription: 'Select the cloud service to use. Backends are provided by modules.',
	bidirectional: 'Bidirectional',
	cancel: 'Cancel',
	cancelled: 'Cancelled',
	caseSensitive: 'Case sensitive',
	checkConnection: 'Check connection',
	checkConnectionFailed: 'Check connection failed',
	checkConnectionSuccess: 'Check connection succeeded',
	clear: 'Clear',
	clearRecords: 'Clear records',
	clearRecordsDescription:
		'Sync Engine records sync states to resolve sync operations between local and remote files. This option allows you to clear records. Warning: this action is likely to cause changes in sync decisions.',
	completed: 'Completed',
	completedNoop: 'Already synced',
	configure: 'Configure',
	confirm: 'Confirm',
	confirmDeleteDescription:
		'Please confirm the {{x}} local files that will be deleted, unselected files will be re-uploaded.',
	confirmDeleteInAutoSync: 'Confirm deletions during auto-sync',
	confirmDeleteInAutoSyncDescription:
		'Show a confirmation of local files that will be deleted during auto-triggered syncs. You can choose to delete or re-upload them.',
	confirmTasksDescription: (frag, { total, conflict, deleteLocal, deleteRemote }) => {
		const deleteOr = deleteLocal + deleteRemote !== 0;
		frag.appendText(`Sync will execute ${total} operation(s) in total`);
		if (deleteOr || conflict !== 0) frag.appendText('. Including');
		if (deleteOr) frag.appendText(' deleting');
		if (deleteLocal !== 0) frag.appendText(` ${deleteLocal} local file(s)`);
		if (deleteLocal !== 0 && deleteRemote !== 0) frag.appendText(' plus');
		if (deleteRemote !== 0) frag.appendText(` ${deleteRemote} remote file(s)`);
		if (deleteOr && conflict !== 0) frag.appendText(', and');
		if (conflict !== 0) frag.appendText(` resolving ${conflict} conflict(s)`);
		frag.appendText(':');
	},
	confirmTasksInSync: 'Confirm operations in manual sync',
	confirmTasksInSyncDescription:
		'Show pending operations and execute after confirmation (does not affect auto-sync).',
	conflictResolveStrategy: 'Conflict resolve strategy',
	conflictResolveStrategyDescription:
		'Select how to resolve the conflict when both remote and local have been modified since last sync. More strategies can be found in modules.',
	controls: 'Controls',
	createLocalDir: 'Create local folder',
	createRemoteDir: 'Create remote folder',
	customHeaders: 'Custom headers',
	customHeadersDescription:
		'Add custom headers to be included with each request, they can either be stored in plaintext or in Obsidian keychain.',
	delete: 'Delete',
	deleteModule: 'Delete module',
	description: 'Description',
	descriptionPlaceholder: 'This module is ...',
	development: 'Development',
	diffMatchPatch: 'Merge',
	disableModule: 'Disable module',
	done: 'Done',
	download: 'Download',
	downloadModule: 'Download module',
	edit: 'Edit',
	editModuleInformation: 'Edit module information',
	enable: 'Enable',
	enableModule: 'Enable module',
	exclusionRules: 'Exclusion rules',
	exclusionRulesDescription: (frag) => {
		frag.appendText(
			'Files / folders matching these Glob patterns will not be synced. Please remember to add file extensions (E.g. ',
		);
		frag.createEl('code', { text: '.md' });
		frag.appendText(') if you want to exclude files. Refer to ');
		frag.createEl('a', {
			attr: {
				href: 'https://sync.consensia.cc/usage/settings#inclusion-and-exclusion-rules',
			},
			text: 'settings documentation',
		});
		frag.appendText(' for configuration guide.');
	},
	executing: 'Executing',
	export: 'Export',
	exportLogsDescription:
		'Export plugin logs to a file in the vault. Set the log export directory in the field.',
	exportLogsDirectoryPlaceholder: 'Set the directory to export logs to',
	exportLogsFailed: 'Failed to export logs',
	exportLogsToFile: 'Export logs to file',
	failed: 'Failed',
	failedTasksDescription: '{{x}} task(s) failed during sync:',
	failedToDownloadModule: 'Failed to download module "{{name}}"',
	failedToFetchSource: 'Failed to fetch source from "{{url}}"',
	failedToLoadModule: 'Failed to load module "{{name}}"',
	features: 'Features',
	filterPlaceholder: 'E.g. temp.md, .trash/**/*',
	filterRules: 'Filter rules',
	headerKeyPlaceholder: 'Header key',
	headerValuePlaceholder: 'Header value',
	hide: 'Hide',
	icon: 'Icon',
	iconDescription: (frag) => {
		frag.appendText(
			'Set the icon for this module to be displayed in the module management page, full icons can be found in ',
		);
		frag.createEl('a', {
			attr: { href: 'https://lucide.dev/icons/' },
			text: 'Lucide Icons catalog',
		});
		frag.appendText('.');
	},
	iconPlaceholder: 'Enter Lucide Icons code (e.g. puzzle)',
	idle: 'Idle',
	inclusionRules: 'Inclusion rules',
	inclusionRulesDescription: (frag) => {
		frag.appendText(
			'Files / folders matching exclusion rules but also matching these glob patterns will still be synced. Refer to ',
		);
		frag.createEl('a', {
			attr: {
				href: 'https://sync.consensia.cc/usage/settings#inclusion-and-exclusion-rules',
			},
			text: 'settings documentation',
		});
		frag.appendText(' for configuration guide.');
	},
	installed: 'Installed',
	integrityVerification: 'Integrity verification',
	integrityVerificationDescription: (frag) => {
		frag.appendText(
			"Set whether to pin the module's binary file to a specific hash, and verify the hash each time it is loaded. ",
		);
		frag.createEl('strong', {
			text: 'It is strongly discouraged to turn off integrity verification, since it will expose you to a large attack surface.',
		});
	},
	invalidValue: 'Invalid value, reverted to original.',
	keepLocal: 'Keep local',
	keepRemote: 'Keep remote',
	latestSurvive: 'Latest survives',
	loadingModules: 'Loading modules…',
	match: 'Match',
	matchLabelDescription: 'This setting must be kept the same on all devices.',
	maxFileSize: 'Max file size',
	maxFileSizeDescription:
		'Skip files exceeding this size during synchronization. This option is useful for services with storage space limitations. Alter the size limit in the field.',
	maxFileSizePlaceholder: 'Enter size limit (e.g. 10MB, 0.5GB)',
	maxMemoryConsumption: 'Max memory consumption',
	maxMemoryConsumptionDescription:
		'Limit the amount of memory used during synchronization. This option is useful for devices with memory limitations. Alter the memory limit in the field.',
	maxMemoryConsumptionPlaceholder: 'Enter memory limit (e.g. 1GB, 200MB)',
	maxRequestConcurrency: 'Max request concurrency',
	maxRequestConcurrencyDescription:
		'Limit the number of simultaneous requests during synchronization. This option is useful for services with request rate limits. Alter the concurrency limit in the field.',
	maxRequestConcurrencyPlaceholder: 'Enter concurrency limit',
	migrationDescription:
		'Migration may take seconds to minutes depending on the vault size. If you have migrated the remote on other devices, you can skip the migration.\n\nStart migration now?',
	migrationFailed: 'Migration failed',
	migrationPhase1Description: 'Ensure local state is up-to-date',
	migrationPhase2Description: 'Clean up remote and records',
	migrationPhase3Description: 'Populate remote with new structure',
	migrationProcess: 'Migration process',
	minRequestInterval: 'Min request interval',
	minRequestIntervalDescription:
		'Limit the minimum time between consecutive requests during synchronization. This option is useful for services with request rate limits. Alter the interval in the field.',
	minRequestIntervalPlaceholder: 'Enter interval (e.g. 1s, 500ms)',
	mirrorLocal: 'Mirror local',
	mirrorRemote: 'Mirror remote',
	miscellaneous: 'Miscellaneous',
	moduleAutoUpdate: 'Auto-update modules',
	moduleAutoUpdateDescription: 'Automatically update installed modules from module sources.',
	moduleManagement: 'Module management',
	moduleManagementDescription:
		'Manage modules in a dedicated page. You can install, uninstall, update, enable, disable, and edit modules.',
	moduleSourcePlaceholder: 'https://example.com/modules.json',
	moduleSources: 'Module sources',
	moduleSourcesDescription:
		'Edit module sources from which the module catalog is obtained. In this way you can install third-party Sync Engine modules.',
	moveLocal: 'Move local',
	moveRemote: 'Move remote',
	name: 'Name',
	namePlaceholder: 'Enter module display name',
	noHeaderConfigured: 'No header configured.',
	noInstalledModulesFound: 'No installed modules found.',
	noMatchingModulesFound: 'No matching modules found.',
	noModulesAvailable: 'No modules available.',
	noRuleConfigured: 'No rule configured.',
	noSourceConfigured: 'No source configured.',
	none: 'None',
	noticeStatusOnMobile: 'Notice sync status on mobile',
	noticeStatusOnMobileDescription:
		'Display a notice on mobile devices when synchronization is in progress. Replaces the status bar on desktop.',
	official: 'Official',
	realtimeSync: 'Realtime sync',
	realtimeSyncDescription:
		'Trigger syncs automatically as soon as files are modified. Alter the delay between a file being modified and the sync being triggered in the field.',
	realtimeSyncFastMode: 'Realtime sync fast mode',
	realtimeSyncFastModeDescription:
		'Reuse cached data and avoid unnecessary remote discovery during real-time sync to accelerate sync.',
	realtimeSyncPlaceholder: 'Enter sync delay (e.g. 500ms, 5s)',
	recordsCleared: 'Records cleared',
	remoteMigration: 'Remote migration',
	removeLocal: 'Remove local',
	removeRecord: 'Remove record',
	removeRemote: 'Remove remote',
	renameAndKeepBoth: 'Rename and keep both',
	resolveConflict: 'Resolve conflict',
	save: 'Save',
	scheduledSync: 'Scheduled sync',
	scheduledSyncDescription:
		'Periodically trigger synchronizations over specified intervals. Alter the interval in the field.',
	scheduledSyncPlaceholder: 'Enter interval (e.g. 10min, 0.5h)',
	searchModules: 'Search modules',
	selectAll: 'Select all',
	settingTips: (frag, { labels, addLabel }) => {
		const p = frag.createEl('p', { text: 'Thanks for choosing Sync Engine! Access ' });
		p.createEl('a', {
			attr: { href: 'https://sync.consensia.cc/usage/settings' },
			text: 'the documentation',
		});
		p.appendText(' for more detailed explanation of each setting. Labels on settings:');
		const ul = frag.createEl('ul', 'list-none ps-0!');
		for (const label of labels) {
			const li = ul.createEl('li');
			const flair = addLabel(li, label);
			flair.addClass('m-0');
			li.appendText(` ${flair.ariaLabel}`);
		}
	},
	showInstalledOnly: 'Show installed only',
	showProgress: 'Show progress',
	skip: 'Skip',
	someModulesHidden:
		'Some modules are hidden since Sync Engine plugin is outdated, update to explore the full module catalog.',
	speed: 'Speed',
	speedLabelDescription: 'Properly configuring this setting could improve sync speed.',
	startMigration: 'Start migration',
	startNonInteractiveSync: 'Start non-interactive sync',
	startSync: 'Start sync',
	startupSync: 'Startup sync',
	startupSyncDescription:
		'Automatically trigger a sync at plugin startup after specified delay. Alter the delay in the field.',
	startupSyncPlaceholder: 'Enter delay (e.g. 5s, 1min)',
	stopSync: 'Stop sync',
	syncProgress: 'Sync progress',
	syncStrategy: 'Sync strategy',
	syncStrategyDescription:
		'Select the synchronization strategy to resolve file changes. More strategies can be found in modules.',
	toggleWithoutMigration: 'Toggle without migration',
	unknownModule: 'Unknown module',
	unknownModuleDescription: (frag, { fileName, size, path, mtime, ctime }) => {
		const p1 = frag.createEl('p');
		p1.appendText('Sync Engine detected an installed module named ');
		p1.createEl('code', { text: fileName });
		p1.appendText(
			' in its module directory. This module is neither installed in Sync Engine module management page, nor registered anywhere to be exempt from provenance validation. ',
		);
		p1.createEl('strong', { text: 'Please review following information before proceeding:' });
		const ul = frag
			.createDiv(
				'rounded-lg border border-[--background-modifier-border] bg-[--background-secondary] px-2',
			)
			.createEl('ul');
		const li1 = ul.createEl('li');
		li1.appendText('File name: ');
		li1.createEl('code', { text: fileName });
		const li2 = ul.createEl('li');
		li2.appendText('File path: ');
		li2.createEl('code', { text: path });
		const li3 = ul.createEl('li');
		li3.appendText('Size: ');
		li3.createEl('code', { text: size });
		const li4 = ul.createEl('li');
		li4.appendText('Created at: ');
		li4.createEl('code', { text: ctime });
		const li5 = ul.createEl('li');
		li5.appendText('Modified at: ');
		li5.createEl('code', { text: mtime });
		const p2 = frag.createEl('p');
		p2.createEl('strong', {
			text: 'Please avoid loading modules with unknown sources, as this could be a malicious attack.',
		});
		p2.appendText(
			' If you do not know where does it come from, directly deleting it is the best option. If you control the module and it is intentional, you can choose "Configure" and enable it.',
		);
	},
	updateAvailable: 'Update available',
	updateModule: 'Update module',
	updateSource: 'Update source',
	updateSourceDescription:
		'Set the module source from which this module receives updates. Leave empty to disable update.',
	updateSourcePlaceholder: 'https://example.com/modules.json',
	upload: 'Upload',
	walkingRemote: 'Discovering remote files',
	xConfigured: '{{x}} configured',
	xEnabled: '{{x}} enabled',
	xSelected: '({{x}} selected)',
};

export default en;
