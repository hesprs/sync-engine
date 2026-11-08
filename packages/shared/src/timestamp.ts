export default function parseTimestamp(time?: string) {
	if (time?.length !== 13) return;
	return Number(time) || undefined;
}
