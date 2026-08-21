import type { GdriveTranslations } from './setting';

const en: GdriveTranslations = {
	account: 'Google account',
	accountConnected: 'Connected as {{account}}.',
	accountNotConnected:
		'Not connected. Enter the OAuth client credentials above, then connect your Google account.',
	baseDirectory: 'Base directory',
	baseDirectoryDescription:
		'Folder in Google Drive that holds this vault. Created automatically on the first sync — do not create it manually in Drive, files added outside this plugin stay invisible to it.',
	baseDirectoryPlaceholder: 'my-vault/',
	clientId: 'OAuth client ID',
	clientIdDescription:
		'Client ID of your own Google Cloud OAuth client (application type "TV and Limited Input devices") with the Google Drive API enabled.',
	clientIdPlaceholder: 'xxxxxxxx.apps.googleusercontent.com',
	clientSecret: 'OAuth client secret',
	clientSecretDescription: 'Client secret of the same OAuth client.',
	codeCopied: 'Copied',
	configureFirst: 'Enter the OAuth client ID and client secret first.',
	connect: 'Connect',
	connectSuccess: 'Connected to Google Drive as {{account}}.',
	copyCode: 'Copy code',
	deviceCodeInstruction:
		'On any device, visit {{url}} and enter the code below, then approve access.',
	deviceCodeTitle: 'Connect Google Drive',
	disconnect: 'Disconnect',
	disconnected: 'Google Drive disconnected.',
	gdrive: 'Google Drive',
	openVerificationPage: 'Open Google',
	reconnect: 'Reconnect',
	useTrash: 'Delete to trash',
	useTrashDescription:
		'Move remotely deleted files to the Google Drive trash instead of deleting them permanently. Drive clears its trash after 30 days.',
	waitingApproval: 'Waiting for approval…',
};

export default en;
