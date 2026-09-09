type UnitMap = Record<string, number>;
type UnitConfig<T extends UnitMap> = {
	units: T;
	defaultUnit: keyof T;
};

function round(value: number, precision: number): number {
	const power = 10 ** precision;
	return Math.round(value * power) / power;
}

function createUnitConverter<T extends UnitMap>({ units, defaultUnit }: UnitConfig<T>) {
	const entries = Object.entries(units);
	const unitMap: Record<string, number> = {};
	entries.forEach(([u, multiplier]) => {
		unitMap[u.toLowerCase()] = multiplier;
	});
	return {
		format: (value: number): string => {
			const entry = entries[entries.findLastIndex(([, v]) => value >= v)] || entries[0];
			const scaled = value / entry[1];
			return `${round(scaled, 2)} ${entry[0]}`;
		},
		parse: (input: string): number | undefined => {
			const match = /^(?<value>-?\d+(?:\.\d+)?)\s*(?<unit>[a-z]*)$/iu.exec(input.trim());
			if (!match?.groups) return;
			const num = Number.parseFloat(match.groups.value);
			if (!Number.isFinite(num) || num < 0) return;
			const rawUnit = (match.groups.unit || (defaultUnit as string)).toLowerCase();
			return rawUnit in unitMap ? num * unitMap[rawUnit] : undefined;
		},
	};
}

const fileSizeConverter = createUnitConverter({
	// This is academically inaccurate since the following units are actually KiB, MiB, GiB, etc.
	defaultUnit: 'MB',
	// oxlint-disable-next-line sort-keys
	units: { B: 1, KB: 2 ** 10, MB: 2 ** 20, GB: 2 ** 30, TB: 2 ** 40 },
});
export const parseFileSize = fileSizeConverter.parse;
export const formatFileSize = fileSizeConverter.format;

const timeConverter = createUnitConverter({
	defaultUnit: 's',
	// oxlint-disable-next-line sort-keys
	units: { ms: 1, s: 1e3, min: 6e4, h: 3.6e6, d: 8.64e7 },
});
export const parseTime = timeConverter.parse;
export const formatTime = timeConverter.format;
