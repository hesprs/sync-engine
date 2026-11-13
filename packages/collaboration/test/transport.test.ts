import { wireProperties } from '@/protocol';
import { connectionOptions, publishOptions } from '@/transport';
import { expect, test } from 'bun:test';
import type { Envelope } from '@/protocol';
import type { TransportOptions } from '@/transport';

function options(overrides: Partial<TransportOptions> = {}): TransportOptions {
	return {
		clientId: 'windows-abc123',
		onMessage: () => {},
		onStatus: () => {},
		topic: 'sync-engine/collaboration/v1/room',
		url: 'wss://broker.example/mqtt',
		...overrides,
	};
}

function envelope(): Envelope {
	return {
		batchId: 'batch-1',
		ciphertext: 'Y2lwaGVy',
		clientId: 'windows-abc123',
		nonce: 'bm9uY2U',
		sentAt: 1234,
		v: 1,
	};
}

test('connect uses MQTT 5 and passes credentials only when configured', () => {
	const bare = connectionOptions(options());
	expect(bare.protocolVersion).toBe(5);
	expect(bare.clientId).toBe('windows-abc123');
	expect(bare).not.toHaveProperty('username');
	expect(bare).not.toHaveProperty('password');

	const authenticated = connectionOptions(options({ password: 's3cr3t', username: 'paid-user' }));
	expect(authenticated.username).toBe('paid-user');
	expect(authenticated.password).toBe('s3cr3t');
});

test('empty credentials are treated as unset', () => {
	const result = connectionOptions(options({ password: '', username: '' }));
	expect(result).not.toHaveProperty('username');
	expect(result).not.toHaveProperty('password');
});

test('publish carries all framing metadata as User Properties', () => {
	const result = publishOptions(envelope());
	expect(result.properties?.userProperties).toStrictEqual(wireProperties(envelope()));
	expect(result.properties?.userProperties?.client_id).toBe('windows-abc123');
	expect(result.qos).toBe(1);
	expect(result.retain).toBe(false);
});

test('publish User Properties are plaintext strings and carry no file data', () => {
	const properties = wireProperties(envelope());
	for (const value of Object.values(properties)) expect(typeof value).toBe('string');
	expect(Object.keys(properties).sort()).toStrictEqual(['batch_id', 'client_id', 'sent_at', 'v']);
	expect(properties).not.toHaveProperty('index');
	expect(properties).not.toHaveProperty('count');
	expect(properties).not.toHaveProperty('stats');
	expect(properties).not.toHaveProperty('fingerprint');
});
