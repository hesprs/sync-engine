import testKit from '$/test-kit';
import { expect, test } from 'bun:test';
import { customHeadersMiddleware } from '@/fs';

const { request } = testKit;

test('custom headers middleware adds headers to a bare url request', () => {
	const harness = request(() => ({}));
	const wrapped = customHeadersMiddleware(harness.request, { 'x-added': 'value' });

	expect(wrapped('note.md')).resolves.toMatchObject({ status: 200 });
	expect(harness.calls).toStrictEqual([{ headers: { 'x-added': 'value' }, url: 'note.md' }]);
});

test('custom headers middleware merges supplied headers and overrides duplicates', () => {
	const harness = request(() => ({}));
	const wrapped = customHeadersMiddleware(harness.request, {
		'x-added': 'value',
		'x-override': 'new',
	});

	expect(
		wrapped('note.md', {
			headers: {
				'x-keep': 'keep',
				'x-override': 'old',
			},
		}),
	).resolves.toMatchObject({ status: 200 });
	expect(harness.calls).toStrictEqual([
		{
			headers: {
				'x-added': 'value',
				'x-keep': 'keep',
				'x-override': 'new',
			},
			url: 'note.md',
		},
	]);
});
