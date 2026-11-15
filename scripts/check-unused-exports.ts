import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

function collectFiles(dir: string): Array<string> {
	if (!fs.existsSync(dir)) return [];
	const entries = fs.readdirSync(dir, { withFileTypes: true });
	const files: Array<string> = [];
	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name !== 'node_modules' && entry.name !== 'dist' && !entry.name.startsWith('.'))
				files.push(...collectFiles(fullPath));
		} else if (
			entry.isFile() &&
			(fullPath.endsWith('.ts') || fullPath.endsWith('.tsx')) &&
			!fullPath.endsWith('.d.ts')
		)
			files.push(fullPath);
	}
	return files;
}

const rootDir = process.cwd();
const allFiles = [
	...collectFiles(path.join(rootDir, 'packages')),
	...collectFiles(path.join(rootDir, 'scripts')),
	...collectFiles(path.join(rootDir, 'docs')),
];

// Entry points whose exports are intended for external consumers (Obsidian runtime, SDK users, etc.)
const entryFiles = new Set<string>();

const packagesDir = path.join(rootDir, 'packages');
for (const p of fs.readdirSync(packagesDir)) {
	const pkgPath = path.join(packagesDir, p);
	if (!fs.statSync(pkgPath).isDirectory()) continue;
	const mainIndex = path.normalize(path.join(pkgPath, 'src/index.ts'));
	if (fs.existsSync(mainIndex)) entryFiles.add(mainIndex);
}

// SDK entries
entryFiles.add(path.normalize(path.join(packagesDir, 'plugin/src/sdk/index.ts')));
entryFiles.add(path.normalize(path.join(packagesDir, 'plugin/src/sdk/dev.ts')));
entryFiles.add(path.normalize(path.join(packagesDir, 'plugin/src/sdk/tsdown-plugin.ts')));

// Step 1: Collect all used symbol names across all files
const usedNames = new Set<string>();

for (const filePath of allFiles) {
	const content = fs.readFileSync(filePath, 'utf8');
	const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);

	const namespaces = new Set<string>();

	ts.forEachChild(sourceFile, function visit(node) {
		// Import declarations: import { a, b as c } from '...'
		if (ts.isImportDeclaration(node)) {
			const clause = node.importClause;
			if (clause) {
				if (clause.name) usedNames.add(clause.name.text);
				if (clause.namedBindings) {
					if (ts.isNamedImports(clause.namedBindings)) {
						for (const element of clause.namedBindings.elements) {
							// If aliased (import { a as b }), the original export is element.propertyName
							const importedName = element.propertyName
								? element.propertyName.text
								: element.name.text;
							usedNames.add(importedName);
						}
					} else if (ts.isNamespaceImport(clause.namedBindings)) {
						namespaces.add(clause.namedBindings.name.text);
					}
				}
			}
		}

		// Re-export declarations: export { a } from '...'
		if (ts.isExportDeclaration(node)) {
			if (node.exportClause && ts.isNamedExports(node.exportClause)) {
				for (const element of node.exportClause.elements) {
					if (node.moduleSpecifier) {
						const exportedName = element.propertyName
							? element.propertyName.text
							: element.name.text;
						usedNames.add(exportedName);
					}
				}
			}
		}

		// Dynamic imports / destructuring: const { a, b } = await import(...)
		if (ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name)) {
			for (const element of node.name.elements) {
				if (ts.isIdentifier(element.name)) {
					const propName = element.propertyName && ts.isIdentifier(element.propertyName)
						? element.propertyName.text
						: element.name.text;
					usedNames.add(propName);
				}
			}
		}

		// Check property accesses on namespace imports (e.g. C.SECOND_MS)
		if (ts.isPropertyAccessExpression(node)) {
			if (ts.isIdentifier(node.expression) && namespaces.has(node.expression.text))
				usedNames.add(node.name.text);
		}

		ts.forEachChild(node, visit);
	});
}

// Step 2: Check non-entry internal files in packages/*/src for unused function/variable/class exports
type DeadExport = {
	file: string;
	kind: string;
	line: number;
	name: string;
};

const deadExports: Array<DeadExport> = [];

for (const filePath of allFiles) {
	const normalized = path.normalize(filePath);
	if (entryFiles.has(normalized)) continue;
	if (
		normalized.includes('/test/') ||
		normalized.includes('.spec.') ||
		normalized.includes('/scripts/') ||
		normalized.includes('/docs/')
	)
		continue;
	if (!normalized.startsWith(path.join(rootDir, 'packages'))) continue;

	const content = fs.readFileSync(filePath, 'utf8');
	const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);

	ts.forEachChild(sourceFile, (node) => {
		const isExported = node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
		const isDefault = node.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
		if (!isExported || isDefault) return;

		// Check leading comments for @allow-unused or @public
		const commentRanges = ts.getLeadingCommentRanges(content, node.pos) ?? [];
		const hasAllow = commentRanges.some((range) => {
			const text = content.slice(range.pos, range.end);
			return text.includes('@allow-unused') || text.includes('@public');
		});
		if (hasAllow) return;

		const verify = (name: string, pos: number, kind: string) => {
			if (!usedNames.has(name)) {
				const { line } = sourceFile.getLineAndCharacterOfPosition(pos);
				const relPath = path.relative(rootDir, filePath);
				deadExports.push({ file: relPath, kind, line: line + 1, name });
			}
		};

		if (ts.isFunctionDeclaration(node) && node.name) {
			verify(node.name.text, node.name.pos, 'function');
		} else if (ts.isVariableStatement(node)) {
			for (const decl of node.declarationList.declarations) {
				if (ts.isIdentifier(decl.name)) verify(decl.name.text, decl.name.pos, 'variable/constant');
			}
		} else if (ts.isClassDeclaration(node) && node.name) {
			verify(node.name.text, node.name.pos, 'class');
		}
	});
}

if (deadExports.length > 0) {
	console.error(
		`\n❌ Found ${deadExports.length} unused exported function(s) / variable(s) across packages:\n`,
	);
	for (const item of deadExports)
		console.error(`  - ${item.file}:${item.line} -> [${item.kind}] '${item.name}'`);
	console.error(
		'\nFix: remove "export" if only used internally, delete if dead code, or annotate with "/** @allow-unused */" if public.\n',
	);
	process.exit(1);
} else {
	console.log('✔ All exported functions and variables are referenced.');
}
