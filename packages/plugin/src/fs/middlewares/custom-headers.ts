import type { Request, RequestParam } from '@/modules/Registrar';

type CustomHeadersOptions = Record<string, string>;
type HeaderVariables = NonNullable<RequestParam['headerVariables']>;
type HeaderValue = HeaderVariables[string];

const timeUnitShifts = { ms: 0, ns: 6, s: -3, us: 3 } as const;
const defaultFormats = new Map([
	['ctime', 's'],
	['mtime', 's'],
]);

function scaleDecimal(value: number | bigint, shift: number): string {
	const [mantissa, exponent = '0'] = String(value).toLowerCase().split('e');
	const negative = mantissa.startsWith('-');
	const unsigned = negative ? mantissa.slice(1) : mantissa;
	const [whole, fraction = ''] = unsigned.split('.');
	const digits = whole + fraction;
	const position = whole.length + Number(exponent) + shift;
	let result: string;

	if (position <= 0) result = `0.${'0'.repeat(-position)}${digits}`;
	else if (position >= digits.length) result = digits.padEnd(position, '0');
	else result = `${digits.slice(0, position)}.${digits.slice(position)}`;

	result = result.replace(/^0+(?=\d)/u, '');
	if (result.includes('.')) result = result.replace(/0+$/u, '').replace(/\.$/u, '');
	return negative && result !== '0' ? `-${result}` : result;
}

function formatVariable(value: HeaderValue, format?: string): string | undefined {
	if (value === undefined) return;
	if (typeof value === 'number' && !Number.isFinite(value)) return;
	if (!format) return String(value);
	if (typeof value !== 'number' && typeof value !== 'bigint') return;
	if (!Object.hasOwn(timeUnitShifts, format)) return;

	// Decimal shifting preserves large integers and fractional milliseconds without float multiplication.
	return scaleDecimal(value, timeUnitShifts[format as keyof typeof timeUnitShifts]);
}

function renderHeader(template: string, variables: HeaderVariables = {}): string | undefined {
	let unresolved = false;
	const value = template.replaceAll(
		/\\?\{\{\s*(?<name>[\w.-]+)(?::(?<format>\w+))?\s*\}\}/gu,
		(match: string, name: string, format: string | undefined) => {
			if (match.startsWith('\\')) return match.slice(1);
			const raw = Object.hasOwn(variables, name) ? variables[name] : undefined;
			const outputFormat = format ?? defaultFormats.get(name);
			const replacement = formatVariable(raw, outputFormat);
			if (replacement === undefined) unresolved = true;
			return replacement ?? '';
		},
	);
	return unresolved ? undefined : value;
}

export default function customHeadersMiddleware(
	request: Request,
	options: CustomHeadersOptions,
): Request {
	return (url, { headerVariables, ...params } = {}) => {
		const headers = new Map<string, [string, string]>();
		for (const [key, value] of Object.entries(params.headers ?? {}))
			headers.set(key.toLowerCase(), [key, value]);

		for (const [key, template] of Object.entries(options)) {
			const value = renderHeader(template, headerVariables);
			if (value !== undefined) headers.set(key.toLowerCase(), [key, value]);
		}
		return request(url, { ...params, headers: Object.fromEntries(headers.values()) });
	};
}
