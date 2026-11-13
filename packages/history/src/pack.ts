import { PACK_MAGIC, PACK_VERSION } from '@/types';
import { textToUint8Array, uint8ArrayToText } from '@repo/shared/binary';
import { sha256Bytes } from '@repo/shared/sha256-bytes';
// The /browser subpath avoids fflate's `node` export condition, which pulls in `module` and
// worker_threads. Those cannot be resolved when Obsidian loads the module as browser ESM.
import { deflateSync, inflateSync } from 'fflate/browser';
import type { Codec, IndexEntry, PackHeader } from '@/types';
import type { Binary } from '@repo/shared/binary';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Minimal concatenation over Uint8Array (avoids the BufferSource variance of concatBinary). */
function concat(...parts: Array<Uint8Array>): Uint8Array {
	let total = 0;
	for (const part of parts) total += part.byteLength;
	const out = new Uint8Array(total);
	let offset = 0;
	for (const part of parts) {
		out.set(part, offset);
		offset += part.byteLength;
	}
	return out;
}

export type PackInput = {
	baseLamport: number;
	createdAt: number;
	deviceId: string;
	ns: string;
	peakLamport: number;
	seq: number;
};

export type EncodedPack = { bytes: Uint8Array; header: PackHeader; entries: Array<IndexEntry> };
export type DecodedPack = { header: PackHeader; entries: Array<IndexEntry>; payload: Uint8Array };

function u32(value: number): Uint8Array {
	const out = new Uint8Array(4);
	new DataView(out.buffer).setUint32(0, value, false);
	return out;
}

function readU32(bytes: Uint8Array, offset: number): number {
	return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, false);
}

function jsonBytes(value: unknown): Uint8Array {
	return encoder.encode(JSON.stringify(value));
}

/**
 * A fixed 128-byte reserved prefix carrying the numeric fields; ids live in the length-delimited
 * meta.
 */
function encodeReservedPrefix(header: PackHeader): Uint8Array {
	const out = new Uint8Array(128);
	const view = new DataView(out.buffer);
	let offset = 0;
	view.setUint32(offset, PACK_MAGIC, false);
	offset += 4;
	view.setUint16(offset, PACK_VERSION, false);
	offset += 2;
	view.setUint16(offset, header.codec === 'deflate' ? 1 : 0, false);
	offset += 2;
	const numbers = [
		header.seq,
		header.baseLamport,
		header.peakLamport,
		header.createdAt,
		header.commitCount,
		header.indexOffset,
		header.indexLength,
		header.payloadOffset,
		header.payloadLength,
	];
	for (const number of numbers) {
		view.setFloat64(offset, number, false);
		offset += 8;
	}
	return out;
}

function decodeReservedPrefix(bytes: Uint8Array): { codec: Codec; numbers: Array<number> } {
	const view = new DataView(bytes.buffer, bytes.byteOffset, 128);
	if (view.getUint32(0, false) !== PACK_MAGIC) throw new Error('Invalid pack magic');
	if (view.getUint16(4, false) !== PACK_VERSION) throw new Error('Unsupported pack version');
	const codec: Codec = view.getUint16(6, false) === 1 ? 'deflate' : 'raw';
	const numbers: Array<number> = [];
	for (let index = 0; index < 9; index++) numbers.push(view.getFloat64(8 + index * 8, false));
	return { codec, numbers };
}

/** Canonical, hash-stable serialization of the header fields (identical in encode and decode). */
function canonicalHeader(h: Omit<PackHeader, 'hash'>): Uint8Array {
	return jsonBytes({
		baseLamport: h.baseLamport,
		codec: h.codec,
		commitCount: h.commitCount,
		createdAt: h.createdAt,
		deviceId: h.deviceId,
		indexLength: h.indexLength,
		indexOffset: h.indexOffset,
		magic: h.magic,
		ns: h.ns,
		payloadLength: h.payloadLength,
		payloadOffset: h.payloadOffset,
		peakLamport: h.peakLamport,
		seq: h.seq,
		version: h.version,
	});
}

function sortEntries(entries: Array<IndexEntry>): Array<IndexEntry> {
	return [...entries].sort(
		(a, b) =>
			a.lamport - b.lamport ||
			a.deviceId.localeCompare(b.deviceId) ||
			a.keyHash.localeCompare(b.keyHash),
	);
}

/** Encodes the three regions and returns the self-certifying header (hash is embedded in the name). */
export async function encodePack(
	partial: PackInput,
	entries: Array<IndexEntry>,
	payload: Uint8Array,
): Promise<EncodedPack> {
	const sorted = sortEntries(entries);
	const codec: Codec = payload.byteLength > 0 ? 'deflate' : 'raw';
	const compressed = codec === 'deflate' ? deflateSync(payload) : payload;
	const meta = { deviceId: partial.deviceId, ns: partial.ns };
	const metaBytes = concat(u32(metaBytesLength(meta)), jsonBytes(meta));
	const indexBytes = encodeIndex(sorted);
	const reserved = 128;
	const indexOffset = reserved + metaBytes.byteLength;
	const payloadOffset = indexOffset + indexBytes.byteLength;
	const headerBase: Omit<PackHeader, 'hash'> = {
		...partial,
		codec,
		commitCount: sorted.length,
		indexLength: indexBytes.byteLength,
		indexOffset,
		magic: PACK_MAGIC,
		payloadLength: compressed.byteLength,
		payloadOffset,
		version: PACK_VERSION,
	};
	const hash = await sha256Bytes(concat(canonicalHeader(headerBase), indexBytes, compressed));
	const header: PackHeader = { ...headerBase, hash };
	const bytes = concat(encodeReservedPrefix(header), metaBytes, indexBytes, compressed);
	return { bytes, entries: sorted, header };
}

function metaBytesLength(meta: { deviceId: string; ns: string }): number {
	return jsonBytes(meta).byteLength;
}

function encodeIndex(entries: Array<IndexEntry>): Uint8Array {
	const parts: Array<Uint8Array> = [u32(entries.length)];
	for (const entry of entries) {
		const bytes = jsonBytes(entry);
		parts.push(u32(bytes.byteLength), bytes);
	}
	return concat(...parts);
}

function decodeIndex(bytes: Uint8Array, offset: number, length: number): Array<IndexEntry> {
	const region = bytes.subarray(offset, offset + length);
	const count = readU32(region, 0);
	let cursor = 4;
	const entries: Array<IndexEntry> = [];
	for (let index = 0; index < count; index++) {
		const size = readU32(region, cursor);
		cursor += 4;
		entries.push(
			JSON.parse(decoder.decode(region.subarray(cursor, cursor + size))) as IndexEntry,
		);
		cursor += size;
	}
	return entries;
}

function decodeMeta(bytes: Uint8Array): { deviceId: string; ns: string } {
	const length = readU32(bytes, 128);
	return JSON.parse(decoder.decode(bytes.subarray(132, 132 + length))) as {
		deviceId: string;
		ns: string;
	};
}

/** Parses header + index only, without inflating the payload. */
export async function readIndexOnly(
	bytes: Uint8Array,
): Promise<{ header: PackHeader; entries: Array<IndexEntry> }> {
	const { codec, numbers } = decodeReservedPrefix(bytes);
	const meta = decodeMeta(bytes);
	const [
		seq,
		baseLamport,
		peakLamport,
		createdAt,
		commitCount,
		indexOffset,
		indexLength,
		payloadOffset,
		payloadLength,
	] = numbers;
	const entries = decodeIndex(bytes, indexOffset, indexLength);
	const headerBase: Omit<PackHeader, 'hash'> = {
		baseLamport,
		codec,
		commitCount,
		createdAt,
		deviceId: meta.deviceId,
		indexLength,
		indexOffset,
		magic: PACK_MAGIC,
		ns: meta.ns,
		payloadLength,
		payloadOffset,
		peakLamport,
		seq,
		version: PACK_VERSION,
	};
	const hash = await sha256Bytes(
		concat(
			canonicalHeader(headerBase),
			bytes.subarray(indexOffset, indexOffset + indexLength),
			bytes.subarray(payloadOffset, payloadOffset + payloadLength),
		),
	);
	return { entries, header: { ...headerBase, hash } };
}

/** Full decode: verifies magic, recomputes the hash, inflates the payload. */
export async function decodePack(bytes: Uint8Array): Promise<DecodedPack> {
	const { header, entries } = await readIndexOnly(bytes);
	const compressed = bytes.subarray(
		header.payloadOffset,
		header.payloadOffset + header.payloadLength,
	);
	const payload = header.codec === 'deflate' ? inflateSync(compressed) : compressed;
	return { entries, header, payload };
}

export function packFileName(deviceId: string, seq: number, hash: string): string {
	return `p-${String(seq).padStart(8, '0')}-${hash}.pack`;
}

export function textBytes(text: string): Binary {
	return textToUint8Array(text);
}

export function bytesText(bytes: Uint8Array): string {
	return uint8ArrayToText(bytes as Binary);
}
