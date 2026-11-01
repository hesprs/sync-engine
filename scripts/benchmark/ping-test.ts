// oxlint-disable no-console no-alert unicorn/require-module-specifiers
const url = (process.argv[2] ?? prompt('Enter website URL to HTTP ping: ')).trim();
if (!url) {
	console.error('No URL provided.');
	process.exit(1);
}

try {
	new URL(url);
} catch {
	console.error(`Invalid URL: ${url}`);
	process.exit(1);
}

const SAMPLES = 20;
const TRIM = 2;

async function httpPing(target: string): Promise<number> {
	const start = performance.now();
	await fetch(target, {
		cache: 'no-store',
		headers: { connection: 'close' },
		method: 'HEAD',
		redirect: 'follow',
	});
	return performance.now() - start;
}

const results: Array<number> = [];
for (let i = 0; i < SAMPLES; i++)
	try {
		const ms = await httpPing(url);
		results.push(ms);
		console.log(`  [${String(i + 1).padStart(2)}] ${ms.toFixed(2)} ms`);
	} catch (error) {
		console.error(`  [${String(i + 1).padStart(2)}] FAILED: ${(error as Error).message}`);
	}

if (results.length < TRIM * 2 + 1) {
	console.error(`\nNot enough successful samples (${results.length}) to trim and average.`);
	process.exit(1);
}

results.sort((a, b) => a - b);
const trimmed = results.slice(TRIM, results.length - TRIM);

const avg = trimmed.reduce((sum, v) => sum + v, 0) / trimmed.length;
const min = trimmed[0];
const max = trimmed.at(-1) as number;

console.log(`Successful samples: ${results.length}/${SAMPLES}`);
console.log(`Trimmed samples:    ${trimmed.length}`);
console.log(`Average (trimmed):  ${avg.toFixed(2)} ms`);
console.log(`Min (trimmed):      ${min.toFixed(2)} ms`);
console.log(`Max (trimmed):      ${max.toFixed(2)} ms`);

export {};
