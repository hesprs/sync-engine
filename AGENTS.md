# Sync Engine

This is the monorepo for an extensible Obsidian syncing plugin to sync vault files between Obsidian and various backends. The plugin itself and modules are in `packages/`.

## Context

- When exploring the repo, you must read related pages in `docs/src/pages/en/`, especially inside the `deep-dive/` folder: this is the fastest way to understand the engineering sophistication.
- This repo is also an Obsidian vault used for testing. The config folder is at `.obsidian`, and plugin dist folder is symlinked to `.obsidian/plugins/sync-engine`. The folder also contains plugin settings in `data.json` and module binaries.
- `./test-files` are and are the only files used for local sync testing. You can do anything inside the folder without caring about changes or losses.

## Techstack

- **TypeScript 6** as programming language
- **Bun** as its package manager and task runner
- **Turbo** for monorepo orchestration
- **Tsdown** for building
- **Oxlint and Oxfmt** for linting and formatting
- **Solid.js** and **TailwindCSS** (via UnoCSS) for UI
- **VitePress** for documentation website
- custom package **SynthKernel** for dependency injection
- custom package **Uni-KV** for IndexedDB and in-memory database.

## Commands

- `bun dev:plugin`: build plugin without cleaning dist
- `bun dev:docs`: start docs dev server
- `bun build:docs`: build docs website
- `bun fix`: format and fix fixable lint errors (always run before `bun check`).
- `bun check`: check types, lint and format (no file change).
- `bun dev`: building without clearing dist.
- `bun tests`: run all tests (do not use `bun test`).
- `bun tests -F <package-name> -- <test path>`: run tests in specific file.
- `bun <command> -F <package-name>`: run command targeting a specific package.
- `cd packages/plugin && bun synthkernel <file-name> <type-alias>`: inspect the final flattened content of a type alias in a file, use to inspect merged types, do not explore the entire codebase.
- `bun -e '<code>'` run TS code directly, can import from codebase, use double quotes inside code.

## Packages

- Plugin & module SDK: `packages/plugin/`, package name `@hesprs/sync-engine-sdk`, `dev` builds SDK.
- WebDAV module: `packages/webdav/`, package name `webdav`.
- S3 module: `packages/s3/`, package name `s3`.
- Google Drive module: `packages/gdrive/`, package name `gdrive`.
- Encryption module: `packages/encryption/`, package name `encryption`.
- Shared utils: `packages/shared/`, package name `@repo/shared`.
- Documentation site: `docs/`, package name `docs`.
- I18n modules: `packages/i18n/`, package name `i18n`.
- Smart merge module: `packages/smart-merge/`, package name `smart-merge`.

## Conventions

- For mobile compatibility, Node.js API prohibited in plugin and modules.
- Sentence case for UI text.
- Module-specific behavior should not pollute plugin core.
- All Obsidian API mocks go `packages/shared/test/obsidian-mock.ts`.
- Use inline Tailwind CSS for common styling, only use semantic CSS for animations and complex compositions. (Documentation website doesn't use TailwindCSS, you need to edit `docs/.vitepress/theme/styles.css`)
- When any function or class needs to use `Context` as argument, prefer structural typing instead of direct `Context`.
- Excluding main plugin, shared utils and documentation site, all packages are Sync Engine modules, they use the SDK and follow unified module structure.
- `null` forbidden, use `undefined` consistently.
- Lint warnings in scope must be addressed, except conditional ones (TODO with date, upstream issue)
- SDK types (`**/*.d.ts` in `packages/plugin/dist/`) are committed to satisfy Obsidian automated linting. Never edit, delete, restore, clean, or otherwise alter these files, even when builds or checks create uncommitted changes. Leave their existing worktree state unchanged.

## Documentation

- The primary documentation locates in `docs/src/pages/en/` has three sections in three folders: `usage/`, `development/`, and `deep-dive/`:
  - `usage/`: designed for non-technical users, avoid dev jargons
  - `development/`: SDK API reference and practical module development setups only
  - `deep-dive/`: Sync Engine internals
- Prefer inter-page links when other pages have relevant content, duplication content cross-page is forbidden.
- Link format: Link to title anchors when possible, strict relative links, no `.md` extension.
- Only add inter-links when the content is truly relevant, you must not link distant pages just for link count.
- `usage/` and `deep-dive/` can interlink, `development/` can link to `usage/` and `deep-dive/`, but `usage/` and `deep-dive/` should avoid linking into `development/`.
- Don't be overly verbose.
- Official module specs should be self-contained in each page in `deep-dive/modules/`. They can link external pages but external pages should not link official modules, except in dedicated pages in `usage/`.
- Avoid large blocks of code in `usage/` and `deep-dive/`, code should be the major content in `development/`
- Documentation titles use title case.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
