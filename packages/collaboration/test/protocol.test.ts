import { deriveRoomKeys, deriveTopic, generateRoomCode, parseRoomCode } from '@/crypto';
import {
	MAX_CHANGED_KEYS,
	openPulse,
	parseEnvelope,
	preparePulse,
	sealPulse,
	stringifyEnvelope,
	wireProperties,
} from '@/protocol';
import { beforeAll, expect, test } from 'bun:test';
import type { RoomKeys } from '@/crypto';

const clientId = 'windows-abc123';
let keys: RoomKeys;
let topic: string;

beforeAll(async () => {
	keys = await deriveRoomKeys(parseRoomCode(generateRoomCode()));
	topic = await deriveTopic(keys);
});

async function sealed(sentAt = Date.now(), changedKeys?: Array<string>) {
	const prepared = preparePulse({ keys: changedKeys, sentAt });
	const envelopes = await sealPulse({ clientId, keys, prepared, topic });
	return { envelopes, sentAt };
}

test('round trips a keyless pulse', async () => {
	const { envelopes, sentAt } = await sealed();
	expect(envelopes).toHaveLength(1);
	const pulse = await openPulse({ envelope: envelopes[0], keys, topic });
	expect(pulse).toStrictEqual({ batchId: envelopes[0].batchId, clientId, sentAt });
});

test('round trips a pulse carrying changed keys', async () => {
	const changedKeys = ['a.md', 'folder/b.md', 'c.txt'];
	const { envelopes, sentAt } = await sealed(Date.now(), changedKeys);
	const pulse = await openPulse({ envelope: envelopes[0], keys, topic });
	expect(pulse).toStrictEqual({
		batchId: envelopes[0].batchId,
		clientId,
		keys: changedKeys,
		sentAt,
	});
});

test('a large batch of keys degrades to a keyless pulse', async () => {
	const changedKeys = Array.from(
		{ length: 100 },
		(_, index) => `folder-${index}/${'x'.repeat(60)}.md`,
	);
	const { envelopes, sentAt } = await sealed(Date.now(), changedKeys);
	const pulse = await openPulse({ envelope: envelopes[0], keys, topic });
	expect(pulse).toStrictEqual({ batchId: envelopes[0].batchId, clientId, sentAt });
	expect(pulse).not.toHaveProperty('keys');
});

test('more than the maximum number of keys degrades to a keyless pulse', async () => {
	const changedKeys = Array.from({ length: MAX_CHANGED_KEYS + 1 }, (_, index) => `${index}.md`);
	const { envelopes, sentAt } = await sealed(Date.now(), changedKeys);
	const pulse = await openPulse({ envelope: envelopes[0], keys, topic });
	expect(pulse).toStrictEqual({ batchId: envelopes[0].batchId, clientId, sentAt });
});

test('the wire payload carries only encrypted bytes', async () => {
	const { envelopes } = await sealed(Date.now(), ['note.md']);
	const parsed: unknown = JSON.parse(stringifyEnvelope(envelopes[0]));
	if (typeof parsed !== 'object' || parsed === null) throw new Error('Not an object');
	expect(Object.keys(parsed).sort()).toStrictEqual(['ciphertext', 'nonce']);
});

test('User Properties carry only framing metadata', async () => {
	const { envelopes } = await sealed();
	const properties = wireProperties(envelopes[0]);
	expect(Object.keys(properties).sort()).toStrictEqual(['batch_id', 'client_id', 'sent_at', 'v']);
	expect(properties.client_id).toBe(clientId);
	expect(properties.batch_id).toBe(envelopes[0].batchId);
	expect(properties.sent_at).toBe(String(envelopes[0].sentAt));
	expect(properties).not.toHaveProperty('index');
	expect(properties).not.toHaveProperty('count');
	expect(properties).not.toHaveProperty('stats');
});

test('parseEnvelope reassembles metadata from User Properties', async () => {
	const { envelopes } = await sealed();
	const parsed = parseEnvelope(stringifyEnvelope(envelopes[0]), wireProperties(envelopes[0]));
	expect(parsed).toStrictEqual(envelopes[0]);
});

test('rejects a tampered client_id and a wrong room', async () => {
	const { envelopes } = await sealed();
	const other = await deriveRoomKeys(parseRoomCode(generateRoomCode()));
	const wrongRoom = await openPulse({ envelope: envelopes[0], keys: other, topic }).catch(
		(error: unknown) => error,
	);
	expect(wrongRoom).toBeInstanceOf(Error);

	const tampered = { ...envelopes[0], clientId: 'other' };
	const tamperedResult = await openPulse({ envelope: tampered, keys, topic }).catch(
		(error: unknown) => error,
	);
	expect(tamperedResult).toBeInstanceOf(Error);
});

test('rejects malformed envelopes', () => {
	expect(() => parseEnvelope('{}', {})).toThrow();
	expect(() => parseEnvelope('{"nonce":"***","ciphertext":"***"}', {})).toThrow();
	expect(() =>
		parseEnvelope('{}', wireProperties({ batchId: 'x', clientId: 'x', sentAt: 1, v: 1 })),
	).toThrow();
});
