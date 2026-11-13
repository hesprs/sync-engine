import { stringifyEnvelope, wireProperties } from '@/protocol';
import { uint8ArrayToText } from '@repo/shared/binary';
import mqtt from 'mqtt/dist/mqtt.esm';
import type { Envelope, UserProperties } from '@/protocol';
import type { IClientOptions, IClientPublishOptions, MqttClient } from 'mqtt';

export type TransportStatus = 'connected' | 'connecting' | 'disabled' | 'error' | 'reconnecting';

export type TransportOptions = {
	clientId: string;
	onMessage: (value: string, properties: UserProperties) => void;
	onStatus: (status: TransportStatus, error?: Error) => void;
	password?: string;
	topic: string;
	url: string;
	username?: string;
};

/** MQTT 5 CONNECT options. Credentials are omitted entirely when unset. */
export function connectionOptions({
	clientId,
	password,
	username,
}: TransportOptions): IClientOptions {
	return {
		clean: true,
		clientId,
		connectTimeout: 10_000,
		forceNativeWebSocket: true,
		keepalive: 30,
		protocolVersion: 5,
		reconnectPeriod: 5000,
		resubscribe: true,
		...(username ? { username } : {}),
		...(password ? { password } : {}),
	};
}

/**
 * MQTT 5 PUBLISH options. All framing metadata rides in the variable header as User Properties, so
 * the PUBLISH payload carries only the encrypted bytes.
 */
export function publishOptions(envelope: Envelope): IClientPublishOptions {
	return { properties: { userProperties: wireProperties(envelope) }, qos: 1, retain: false };
}

export default class CollaborationTransport {
	private client?: MqttClient;
	private generation = 0;

	constructor(private readonly options: TransportOptions) {}

	connect(): Promise<void> {
		this.disconnect();
		const generation = ++this.generation;
		const { onStatus, topic, url } = this.options;
		onStatus('connecting');
		return new Promise((resolve) => {
			let client: MqttClient;
			try {
				client = mqtt.connect(url, connectionOptions(this.options));
			} catch (error) {
				onStatus('error', error instanceof Error ? error : new Error(String(error)));
				resolve();
				return;
			}
			this.client = client;
			let connected = false;
			let settled = false;
			const settle = () => {
				if (settled) return;
				settled = true;
				clearTimeout(timeout);
				resolve();
			};
			const timeout = setTimeout(() => {
				if (generation === this.generation)
					onStatus('error', new Error('MQTT connection timed out'));
				settle();
			}, 15_000);
			client.on('connect', () => {
				if (generation !== this.generation) return;
				connected = true;
				client.subscribe(topic, { qos: 1 }, (error) => {
					if (generation !== this.generation) return;
					if (error) {
						onStatus('error', error);
						settle();
						return;
					}
					onStatus('connected');
					settle();
				});
			});
			client.on('reconnect', () => {
				if (generation === this.generation) onStatus('reconnecting');
			});
			client.on('close', () => {
				if (generation !== this.generation) return;
				if (!connected) {
					if (settled) onStatus('reconnecting');
					else {
						onStatus(
							'error',
							new Error('MQTT connection closed before it was established'),
						);
						settle();
					}
					return;
				}
				onStatus('reconnecting');
			});
			client.on('error', (error) => {
				if (generation === this.generation) onStatus('error', error);
				settle();
			});
			client.on('message', (receivedTopic, payload, packet) => {
				if (generation !== this.generation || receivedTopic !== topic) return;
				try {
					this.options.onMessage(
						typeof payload === 'string'
							? payload
							: uint8ArrayToText(new Uint8Array(payload)),
						packet.properties?.userProperties ?? {},
					);
				} catch (error) {
					this.options.onStatus(
						'error',
						error instanceof Error ? error : new Error(String(error)),
					);
				}
			});
		});
	}

	async publish(envelopes: ReadonlyArray<Envelope>): Promise<void> {
		const client = this.client;
		if (!client?.connected) throw new Error('MQTT client is not connected');
		await Promise.all(
			envelopes.map(
				(envelope) =>
					new Promise<void>((resolve, reject) => {
						const timeout = setTimeout(
							() => reject(new Error('MQTT publish timed out')),
							15_000,
						);
						client.publish(
							this.options.topic,
							stringifyEnvelope(envelope),
							publishOptions(envelope),
							(error) => {
								clearTimeout(timeout);
								if (error) reject(error);
								else resolve();
							},
						);
					}),
			),
		);
	}

	disconnect(): void {
		this.generation++;
		const client = this.client;
		this.client = undefined;
		if (client) client.end(true);
	}
}
