import man from '../manifest.json';
import pkg from '../packages/plugin/package.json';
import versions from '../versions.json';

const { version, minAppVersion } = man;

(versions as Record<string, string>)[version] = minAppVersion;
pkg.version = version;

await Promise.all([
	Bun.write('versions.json', JSON.stringify(versions, undefined, '\t')),
	Bun.write('packages/plugin/package.json', JSON.stringify(pkg, undefined, '\t')),
]);

Bun.spawnSync({ cmd: ['bun', 'oxfmt', 'versions.json', 'packages/plugin/package.json'] });
