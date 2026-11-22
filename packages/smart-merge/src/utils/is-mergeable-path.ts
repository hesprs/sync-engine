const MERGEABLE_EXTENSIONS = ['.md', '.markdown', '.txt'];

export default function isMergeablePath(path: string): boolean {
	path = path.trim().toLowerCase();
	return MERGEABLE_EXTENSIONS.some((ext) => path.endsWith(ext));
}
