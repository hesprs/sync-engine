//#region src/sdk/tsdown-plugin.d.ts
type SyncEngineConfig = {
  deps?: {
    neverBundle?: true | string | RegExp | Array<string | RegExp> | ((id: string, parentId: string | undefined, isResolved: boolean) => boolean | null | undefined);
  };
};
type ModuleMeta = Partial<Record<'name' | 'icon' | 'description' | 'source' | 'version' | 'readme', string>>;
type ModuleMetaWithId = ModuleMeta & {
  id: string;
};
declare function syncEngineModule(meta?: ModuleMeta | Array<ModuleMetaWithId> | Record<string, ModuleMeta>): {
  name: string;
  renderChunk(code: string, chunk: {
    name: string;
    isEntry: boolean;
  }): {
    code: string;
  } | undefined;
  tsdownConfig(config: SyncEngineConfig): void;
};
//#endregion
export { syncEngineModule as default };