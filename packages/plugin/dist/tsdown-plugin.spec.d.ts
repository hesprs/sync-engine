type SyncEngineConfig = {
  deps?: {
    neverBundle?: true | string | RegExp | Array<string | RegExp> | ((id: string, parentId: string | undefined, isResolved: boolean) => boolean | null | undefined);
  };
};
type ModuleMeta = Partial<Record<'id' | 'name' | 'icon' | 'description' | 'source' | 'version' | 'readme', string>>;
type MetaOption = ModuleMeta | Array<ModuleMeta> | Record<string, ModuleMeta>;
export default function syncEngineModule(meta?: MetaOption): {
  name: string;
  renderChunk(code: string, chunk: {
    name: string;
    isEntry: boolean;
  }): {
    code: string;
  } | undefined;
  tsdownConfig(config: SyncEngineConfig): void;
};
export {};