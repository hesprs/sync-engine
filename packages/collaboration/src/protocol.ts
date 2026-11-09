import {
	createChunkAAD,
	decodeBase64Url,
	decryptChunk,
	encodeBase64Url,
	encryptChunk,
} from '@/crypto';
import type { RoomKeys } from '@/crypto';
import type { Binary } from '@hesprs/sync-engine-sdk';

export const PROTOCOL_VERSION = 1;
export const SEEN_TTL = 300_000;
/** A pulse is a single small ciphertext; this bounds absurd messages from the broker. */
export const MAX_CIPHERTEXT_BYTES = 4096;
/** AES-GCM adds a 16-byte tag; the rest is reserved for the envelope's JSON framing. */
const MAX_PLAINTEXT_BYTES = MAX_CIPHERTEXT_BYTES - 16 - 64;
/** Upper bound on changed keys carried in one pulse, independent of the byte budget. */
export const MAX_CHANGED_KEYS = 512;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/**
 * Transport metadata carried in MQTT 5 User Properties (plaintext, visible to the broker) instead
 * of the PUBLISH payload. Every value is a string; numbers are stringified. These values are also
 * bound into the AAD, so tampering with them makes the pulse fail to decrypt.
 */
export type WireMetadata = { v: 1; batchId: string; clientId: string; sentAt: number };

/** The encrypted payload carries a timestamp and, when it fits, the changed file keys. */
export type PulsePayload = { sentAt: number; keys?: Array<string> };

/** Internal, fully assembled message. The wire payload only carries nonce + ciphertext. */
export type Envelope = WireMetadata & { nonce: string; ciphertext: string };

/** The decrypted, validated pulse handed to the sync bridge. */
export type Pulse = { sentAt: number; clientId: string; batchId: string; keys?: Array<string> };

export type PreparedPulse = { data: Binary; sentAt: number };

export const WIRE_PROPERTIES = {
	batchId: 'batch_id',
	clientId: 'client_id',
	sentAt: 'sent_at',
	v: 'v',
} as const;

export type UserProperties = Record<string, string | Array<string>>;

export function wireProperties(metadata: WireMetadata): UserProperties {
	return {
		[WIRE_PROPERTIES.v]: String(metadata.v),
		[WIRE_PROPERTIES.clientId]: metadata.clientId,
		[WIRE_PROPERTIES.batchId]: metadata.batchId,
		[WIRE_PROPERTIES.sentAt]: String(metadata.sentAt),
	};
}

function readProperty(properties: UserProperties, key: string): string | undefined {
	const value = properties[key];
	return typeof value === 'string' ? value : undefined;
}

export function parseWireMetadata(properties: UserProperties): WireMetadata {
	const v = readProperty(properties, WIRE_PROPERTIES.v);
	const batchId = readProperty(properties, WIRE_PROPERTIES.batchId);
	const clientId = readProperty(properties, WIRE_PROPERTIES.clientId);
	const sentAt = Number(readProperty(properties, WIRE_PROPERTIES.sentAt));
	if (
		v !== String(PROTOCOL_VERSION) ||
		!isString(batchId) ||
		batchId.length > 128 ||
		!isString(clientId) ||
		clientId.length > 128 ||
		!isFiniteNumber(sentAt)
	)
		throw new Error('Invalid collaboration envelope');
	return { batchId, clientId, sentAt, v: PROTOCOL_VERSION };
}

export function preparePulse({
	sentAt,
	keys,
}: {
	sentAt: number;
	keys?: Array<string>;
}): PreparedPulse {
	let payload: PulsePayload = { sentAt };
	if (keys && keys.length > 0 && keys.length <= MAX_CHANGED_KEYS) payload = { keys, sentAt };
	// DEBUG: console.log('[collaboration] plaintext pulse (before encrypt)', JSON.stringify(payload));
	let data = textEncoder.encode(JSON.stringify(payload));
	if ('keys' in payload && data.byteLength > MAX_PLAINTEXT_BYTES) {
		payload = { sentAt };
		data = textEncoder.encode(JSON.stringify(payload));
	}
	return { data, sentAt };
}

/** Seals a pulse into one envelope. A large change batch degrades to a keyless pulse. */
export async function sealPulse({
	prepared,
	keys,
	topic,
	clientId,
}: {
	prepared: PreparedPulse;
	keys: RoomKeys;
	topic: string;
	clientId: string;
}): Promise<Array<Envelope>> {
	const { data, sentAt } = prepared;
	const batchId = encodeBase64Url(crypto.getRandomValues(new Uint8Array(12)));
	const { ciphertext, nonce } = await encryptChunk(
		keys.encryptionKey,
		data,
		createChunkAAD({ batchId, clientId, sentAt, topic }),
	);
	return [
		{
			batchId,
			ciphertext: encodeBase64Url(ciphertext),
			clientId,
			nonce: encodeBase64Url(nonce),
			sentAt,
			v: PROTOCOL_VERSION,
		},
	];
}

export async function openPulse({
	envelope,
	keys,
	topic,
}: {
	envelope: Envelope;
	keys: RoomKeys;
	topic: string;
}): Promise<Pulse> {
	const { batchId, clientId, sentAt } = envelope;
	const nonce = decodeBase64Url(envelope.nonce);
	const ciphertext = decodeBase64Url(envelope.ciphertext);
	if (nonce.byteLength !== 12 || ciphertext.byteLength > MAX_CIPHERTEXT_BYTES)
		throw new Error('Invalid collaboration pulse');
	const data = await decryptChunk(
		keys.encryptionKey,
		ciphertext,
		nonce,
		createChunkAAD({ batchId, clientId, sentAt, topic }),
	);
	// DEBUG: console.log('[collaboration] decrypted pulse (from ciphertext)', textDecoder.decode(data));
	const payload = parsePulsePayload(data);
	if (payload.sentAt !== sentAt) throw new Error('Collaboration message metadata mismatch');
	return { batchId, clientId, sentAt, ...(payload.keys ? { keys: payload.keys } : {}) };
}

function parsePulsePayload(data: Binary): PulsePayload {
	const parsed: unknown = JSON.parse(textDecoder.decode(data));
	if (!isRecord(parsed)) throw new Error('Invalid collaboration payload');
	const { sentAt, keys } = parsed;
	if (!isFiniteNumber(sentAt)) throw new Error('Invalid collaboration payload');
	if (keys === undefined) return { sentAt };
	if (
		!Array.isArray(keys) ||
		keys.length > MAX_CHANGED_KEYS ||
		!keys.every((key) => isString(key) && key.length > 0 && key.length <= 1024)
	)
		throw new Error('Invalid collaboration payload');
	return { keys: keys as Array<string>, sentAt };
}

/** Reassembles the internal envelope from the wire payload and the MQTT 5 User Properties. */
export function parseEnvelope(value: string, properties: UserProperties = {}): Envelope {
	const metadata = parseWireMetadata(properties);
	const parsed: unknown = JSON.parse(value);
	if (!isRecord(parsed)) throw new Error('Invalid collaboration envelope');
	const { nonce, ciphertext } = parsed;
	// DEBUG: console.log('[collaboration] wire envelope', { nonce, ciphertext, ...properties });
	if (!isString(nonce) || !isString(ciphertext))
		throw new Error('Invalid collaboration envelope');
	if (
		decodeBase64Url(nonce).byteLength !== 12 ||
		decodeBase64Url(ciphertext).byteLength > MAX_CIPHERTEXT_BYTES
	)
		throw new Error('Invalid collaboration envelope');
	return { ...metadata, ciphertext, nonce };
}

/** Only the encrypted bytes go on the wire; all framing metadata is in User Properties. */
export function stringifyEnvelope(envelope: Envelope): string {
	return JSON.stringify({ ciphertext: envelope.ciphertext, nonce: envelope.nonce });
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isString(value: unknown): value is string {
	return typeof value === 'string';
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}
