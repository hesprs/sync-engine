import modules from '../../../modules.json';

type ModuleMeta = Partial<
	Record<'name' | 'icon' | 'description' | 'source' | 'version' | 'readme', string>
> & { id: string };

export default modules.map((module): ModuleMeta =>
	Object.assign(module, { source: 'https://sync.consensia.cc/modules.json' }),
);
