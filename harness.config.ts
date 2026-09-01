import { defineBaseAgent, skill } from '@hesprs/harness';

defineBaseAgent({
	extensions: [skill('./skills')],
	prompt: await Bun.file('./AGENTS.md').text(),
});
