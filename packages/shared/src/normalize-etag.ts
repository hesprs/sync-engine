export default function normalizeEtag(raw: string) {
	raw = raw.trim();
	if (raw.startsWith('W/')) raw = raw.slice(2);
	return raw.replaceAll(/^"|"$/gu, '');
}
