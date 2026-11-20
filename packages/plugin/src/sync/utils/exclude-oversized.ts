import type { RecordStat, Stat } from '@/types';

/**
 * Leaves every file that exceeds the size limit on either side out of the sync entirely: its local
 * stat, remote stat and record are all dropped, so deciders plan nothing for it.
 *
 * Dropping only the oversized stat makes the file look deleted on that side, which removes or
 * overwrites the copy on the other side once a file grows past the limit.
 */
export default function excludeOversized({
	local,
	remote,
	records,
	maxSize,
}: {
	local: Array<Stat>;
	remote: Array<Stat>;
	records: Array<[string, RecordStat]>;
	maxSize: number;
}) {
	const oversized = new Set<string>();
	for (const stat of [...local, ...remote])
		if (!stat.isDir && stat.size > maxSize) oversized.add(stat.key);
	if (oversized.size === 0) return { local, records, remote };
	const keep = ({ key }: Stat) => !oversized.has(key);
	return {
		local: local.filter(keep),
		records: records.filter(([key]) => !oversized.has(key)),
		remote: remote.filter(keep),
	};
}
