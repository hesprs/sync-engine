// oxlint-disable no-console no-alert
import { $ } from 'bun';

const vault = (process.argv[2] ?? prompt('Enter the Vault name to operate on: ')).trim();
const number = Number(process.argv[3]?.trim()) || undefined;
if (!vault) {
	console.error('No vault provided.');
	process.exit(1);
}

await execute(
	[
		// Case 1: capture a new daily note in an existing year folder.
		create('Daily Notes/2026/2026-08-05.md', 1024),

		// Case 2: add a short update to an existing root note.
		append('small-1039.md', 256),

		// Case 3: apply edits and deletes to notes at several existing nesting depths in parallel.
		[
			append('Daily Notes/medium-0031.md', 512),
			append('Areas/small-0060.md', 192),
			append('Archive/2024/Ideas/Q3/small-0063.md', 384),
			del('Resources/Current/small-0131.md'),
			del('Areas/Backlog'),
		],

		// Case 4: create two related project notes and one unrelated directory in parallel.
		[
			mkdir('Work/Food'),
			create('Projects/Current/roadmap-review.md', 768),
			create('Projects/Current/standup.md', 320),
		],

		// Case 5: move a root note into the project workspace.
		move('small-1109.md', 'Projects/Current/small-1109.md'),

		// Case 6: reorganize notes and rename existing folders in parallel.
		[
			move('small-0143.md', 'Daily Notes/2026/small-0143.md'),
			move('small-0794.md', 'Archive/2024/Monthly/small-0794.md'),
			move('Ideas', 'Inspirations'),
			move('Reference/Current', 'Reference/Active'),
		],

		// Case 7: remove a root directory.
		del('Projects'),

		// Case 8: remove two unrelated notes in parallel.
		[del('small-1361.md'), del('small-0108.md')],

		// Case 9: move a large note without changing its content.
		move('Reference/Active/large-0019.md', 'Archive/2026/large-0019.md'),

		// Case 10: finish with small edits to existing notes of different sizes.
		[append('medium-0065.md', 640), append('small-0808.md', 224), append('small-0248.md', 160)],
	],
	number,
);

type MaybePromise<T> = Promise<T> | T;
type Command =
	| string
	| { command: string; callback: (result: $.ShellPromise) => MaybePromise<void> };
export type Commands = Array<Command | Array<Command>>;

function handleCommand(command: Command) {
	if (typeof command === 'string') return $`sh -c ${command}`;
	const commandResult = $`sh -c ${command.command}`;
	return Promise.all([commandResult, command.callback(commandResult)]);
}

function handleCase(command: Command | Array<Command>) {
	return Array.isArray(command)
		? Promise.all(command.map((subCommand) => handleCommand(subCommand)))
		: handleCommand(command);
}

async function execute(commands: Commands, num?: number) {
	if (num) return handleCase(commands[num - 1]);
	for (const command of commands) {
		await handleCommand(waitForApproval());
		await handleCase(command);
	}
}

function create(key: string, size: number) {
	return `obsidian vault="${vault}" create path="${key}" content="${'0'.repeat(size)}" overwrite`;
}

function mkdir(key: string) {
	return `obsidian vault="${vault}" eval code="app.vault.adapter.mkdir('${key}')"`;
}

function append(key: string, size: number) {
	return `obsidian vault="${vault}" append path="${key}" content="${'0'.repeat(size)}" inline`;
}

function del(key: string) {
	return `obsidian vault="${vault}" eval code="app.vault.adapter.trashLocal('${key}')"`;
}

function move(oldKey: string, newKey: string) {
	return `obsidian vault="${vault}" eval code="app.vault.adapter.rename('${oldKey}', '${newKey}')"`;
}

function waitForApproval() {
	return 'read -r -p "Press Enter to continue..."';
}
