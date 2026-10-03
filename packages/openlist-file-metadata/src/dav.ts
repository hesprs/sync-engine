import parseXML from '@repo/shared/parse-xml';
import type { FileTimes } from './times';
import { canonicalUrl } from './target';
import { timeValue } from './times';

type Propstat = {
	status?: string;
	prop?: { creationdate?: string; getlastmodified?: string };
};
type Response = { href?: string; propstat?: Propstat | Array<Propstat> };

function array<T>(value?: T | Array<T>): Array<T> {
	return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

export function requestCreationDate(body: string): string {
	if (/<(?:[\w-]+:)?creationdate(?:\s|\/|>)/u.test(body)) return body;
	return body.replace(/<(?:[\w-]+:)?prop(?:\s[^>]*)?>/u, '$&<creationdate xmlns="DAV:"/>');
}

export function readDavTimes(body: string, url: string): Map<string, FileTimes> {
	const parsed = parseXML<{ multistatus?: { response?: Response | Array<Response> } }>(body);
	const result = new Map<string, FileTimes>();
	for (const response of array(parsed.multistatus?.response)) {
		if (!response.href) continue;
		const times: FileTimes = {};
		for (const { status, prop } of array(response.propstat)) {
			if (!prop || (status && !/\s2\d\d(?:\s|$)/u.test(status))) continue;
			if (prop.creationdate) times.ctime = timeValue(Date.parse(prop.creationdate));
			if (prop.getlastmodified) times.mtime = timeValue(Date.parse(prop.getlastmodified));
		}
		result.set(canonicalUrl(response.href, url), times);
	}
	return result;
}
