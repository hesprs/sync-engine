import type { GdriveTranslations } from './setting';

const en: GdriveTranslations = {
	accountConnected: 'Account connected',
	accountConnectedDescription: 'Connected to Google Drive account.',
	authorizationFailed: 'Authorization failed: {{reason}}',
	baseDirectory: 'Base directory',
	baseDirectoryDescription:
		'Set the folder in Google Drive that holds this vault. Created automatically on the first sync and do not create it manually in Drive, files added outside this plugin are invisible to sync.',
	baseDirectoryPlaceholder: 'my-vault/',
	configureFirst: 'Enter the OAuth client ID and client secret first.',
	connect: 'Connect',
	connectAccount: 'Connect account',
	connectAccountDescription: 'Click the button to connect to you Google Drive account.',
	connectSuccess: 'Connected to Google Drive.',
	copyAndOpenGoogle: 'Copy and open Google',
	deviceCodeInstruction: (frag, url) => {
		frag.appendText('Please visit ');
		frag.createEl('a', { attr: { href: url } }).createEl('code', { text: url });
		frag.appendText(' and enter the code below, then approve access.');
	},
	deviceCodeTitle: 'Connect Google Drive',
	disconnect: 'Disconnect',
	gdrive: 'Google Drive',
	useTrash: 'Delete to trash',
	useTrashDescription:
		'Move deleted files to the Google Drive trash instead of deleting them permanently. Drive clears its trash after 30 days.',
	waitingApproval: 'Waiting for approval…',
};

export default en;
