import { deriveRoomKeys, deriveTopic, generateRoomCode, parseRoomCode } from '@/crypto';
import { openPulse, parseEnvelope, preparePulse, sealPulse } from '@/protocol';
import CollaborationTransport from '@/transport';
import { expect, test } from 'bun:test';
import type { UserProperties } from '@/protocol';

const url = process.env.MQTT_TEST_URL;
const prefix = process.env.MQTT_TEST_CLIENT_ID ?? 'sync-engine-test';

function timeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error('MQTT test timed out')), milliseconds);
		promise.then(
			(value) => {
				clearTimeout(timer);
				resolve(value);
			},
			(error: unknown) => {
				clearTimeout(timer);
				reject(error instanceof Error ? error : new Error(String(error)));
			},
		);
	});
}

test.skipIf(!url)(
	'publishes and receives an encrypted pulse',
	async () => {
		if (!url) return;
		const keys = await deriveRoomKeys(parseRoomCode(generateRoomCode()));
		const topic = await deriveTopic(keys);
		const suffix = crypto.randomUUID().slice(0, 8);
		let receiver: CollaborationTransport | undefined;
		let sender: CollaborationTransport | undefined;
		try {
			type Received = { raw: string; properties: UserProperties };
			const received = new Promise<Received>((resolve) => {
				receiver = new CollaborationTransport({
					clientId: `${prefix}-${suffix}-b`,
					onMessage: (raw, properties) => resolve({ properties, raw }),
					onStatus: () => {},
					topic,
					url,
				});
			});
			const senderClientId = `${prefix}-${suffix}-a`;
			sender = new CollaborationTransport({
				clientId: senderClientId,
				onMessage: () => {},
				onStatus: () => {},
				topic,
				url,
			});
			await Promise.all([sender.connect(), receiver?.connect()]);
			const sentAt = Date.now();
			const prepared = preparePulse({ sentAt });
			const envelopes = await sealPulse({ clientId: senderClientId, keys, prepared, topic });
			await sender.publish(envelopes);
			const { raw, properties } = await timeout(received, 15_000);
			const pulse = await openPulse({
				envelope: parseEnvelope(raw, properties),
				keys,
				topic,
			});
			expect(pulse).toMatchObject({ clientId: senderClientId, sentAt });
			expect(pulse).not.toHaveProperty('stats');
		} finally {
			sender?.disconnect();
			receiver?.disconnect();
		}
	},
	20_000,
);
