# Contribute to Sync Engine

Sync Engine welcomes any contribution to the plugin core, modules, and documentation, as well as issues and feature requests.

## Issue Policy

The Sync Engine repository accepts two kinds of issues: bug report and feature request.

### Bug Report

**For a bug report, the issue must contain**:

- Clear description and reproduction steps
- The list of all modules you are using
- The storage service you are using
- For bugs during syncing, please provide the logs, exported from `Development` settings

**It must not contain**:

- Any sensitive information about yourself
- More than one bug: please report in separate issues
- Speculative "root cause" guesses or "fix options": if you have made to this step, you might want to make a pull request.

Bug reports where maintainers have requested clarification / coordinated testing but the reporter hasn't provided any relevant information will be closed after 72 hours; the reporter claimed to coordinate but no further information are provided will also be closed after 72 hours.

### Feature Request

**A feature request contains**:

- Clear description of now the feature should work
- (Optional) Your idea of implementation of you would like to participate the brainstorming

A feature request is a normal issue, but maintainers will move the request to a dedicated meta issue for easier management after some communication.

We **strongly recommend** you writing your own Sync Engine module to achieve your requirement before opening a feature request, since Sync Engine is super extensible and most functions can be achieved by modules. Sync Engine also provides official SDK, documentation, and AI agent skill to assist module development. There are abundant module examples in the Sync Engine monorepo.

## Fork Policy

Sync Engine welcomes forks that contributes to the development of the Sync Engine monorepo.

However, as stated in [Obsidian developer policies](https://docs.obsidian.md/Developer+policies#Forks), Sync Engine disallows any type if malicious forking that submits to Obsidian's official plugin directory as another standalone plugin, as long as Sync Engine repo remains active or maintainers haven't permitted. Maintainers will report upon discovery.

Instead of creating another syncing plugin, we highly recommend you to create a Sync Engine module. Sync Engine core is highly optimized and battle-tested, it provides convenient SDK that allows you to customize freely without reinventing the wheel.

## Contribute Code to the Monorepo

### How the Monorepo Works

**Techstack**:

The project uses:

- **TypeScript 7** as programming language
- **Bun** as its package manager and task runner
- **Turbo** for monorepo management
- **Tsdown** for building
- **Oxlint and Oxfmt** for linting and formatting
- **VitePress** for documentation website

The plugin core uses:

- **Solid.js** and **TailwindCSS** (via UnoCSS) for UI
- custom package **SynthKernel** for dependency injection
- custom package **Uni-KV** for IndexedDB and in-memory database.

**Monorepo structure**:

```txt
Sync Engine Monorepo
├── docs          - Documentation website
├── blueprint     - Internal mechanisms
├── packages
│   ├── plugin    - Core plugin and SDK (@hesprs/sync-engine-sdk)
│   ├── shared    - Shared utilities (@repo/shared)
│   └── ...       - Others are all official modules
├── modules.json  - Official module source, records all official modules
└── tsconfig.json - TypeScript config for all packages
```

**Commands**:

| Command                           | Usage                                  |
| --------------------------------- | -------------------------------------- |
| `bun dev`                         | Build without clearing dist folder     |
| `bun compile`                     | Build with clearing                    |
| `bun dev:plugin`                  | Build the plugin without cleaning dist |
| `bun build:plugin`                | Build the plugin with clearing         |
| `bun fix`                         | Format and fix fixable lint errors     |
| `bun check`                       | Check types, lint and format           |
| `bun tests`                       | Run all tests                          |
| `bun <command> -F <package-name>` | Run command targeting one package      |

**CI/CD**:

The CI is run for every pull request commits, it runs `bun check` and `bun tests`. If any of them fails, the pull request cannot merge.

The core plugin release is triggered by any tag push. Tags containing hyphens trigger pre-release, tags with no hyphens trigger normal release. The release workflow captures corresponding description in `packages/plugin/CHANGELOG.md` as release detail.

The module binaries are distributed in GitHub Pages (Why? better CDN and fewer rate limits) alongside the documentation website. When documentation directory or `modules.json` changes are pushed to main branch, the deployment runs automatically.

The SDK package is released to npm, version aligned with the plugin. The release relies on manual workflow trigger.

### Open a Pull Request

You can open a pull request for debugging or new features. For bug-fix pull requests, the request must reference at least one open issue.

Commit message format: `<title>(<scope>): <message>`. Keep the message concise, avoid lengthy "files changed" or ASCII arts.

It is required to document relevant implementation in `docs` directory if your contribution creates a new module, contains sophisticated implementations, or changes core SDK API.

For maintainer convenience, the review messages will be in English. Same to issues, if a pull request failed review or CI and hasn't had any meaningful changes over 72 hours, the PR will be closed.

#### Module Contribution

If you want to contribute a new module, please make it a package under `packages`. The `package.json` of your module should at least include the following:

```json
{
  "contributors": [
    {
      "name": "<the-name-to-call-you>",
      "github": "<your-github-account-name>"
    }
  ]
}
```

Then modify `modules.json` at the repo root to include your module:

```json
[
  {
    "name": "Module Name",
    "id": "your-module",
    "icon": "puzzle",
    "description": "Description for your module",
    "version": "0.0.1",
    "main": "https://sync.consensia.cc/modules/module-name.js"
  }
]
```

Once the PR is accepted, you module will become part of official modules. You will also be responsible for the future issues and pull requests about your module.

If your pull request contains substantial modification of an existing module, you can also include your information in the `contributors` field.

#### AI Contribution

When making pull requests or issues, please communicate clearly with maintainers. If your words show clear AI signals (confident false claims, verbose & contextualized jargons), maintainers reserve the justification for replying with AI-generated text.

Sync Engine repo generally accepts AI-assisted pull requests, especially for modules, as long as they:

- Pass CI
- Pass review
- Have code quality acceptable by maintainers
- Can keep responsible to future maintenance

The code can be written by AI; but when making pull requests, Sync Engine requires the author must be the GitHub account of a real human. **Any names of corporate AI agent entities are forbidden in co-author list, commit messages, and code.** This is because:

- Commits made by AI often signify insufficient development skill of the human to be capable for future maintenance.
- Copyright of code in this repo belong to the corresponding authors and contributors, AI co-authoring creates ambiguities around code ownership.
