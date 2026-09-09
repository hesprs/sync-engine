---
name: debug-plugin
description: Write a temporary Sync Engine module for local debugging. Use when diagnosing unreasonable bugs that can be experimented locally.
---

Sync Engine repo contains a real Obsidian vault, with configs in `./obsidian/` and files for testing at `./test-files/`. The workflow below requires a live Obsidian instance, when there's no instance, start one first.

## Useful Commands

All commands should be executed at project root.

- `obsidian help`: show the full list of Obsidian CLI commands
- `obsidian dev:debug on`: attach debugger and capture console logs
- `obsidian dev:debug off`: detach debugger
- `obsidian dev:console`: print captured console logs, use this for probe logs
- `obsidian plugin:reload id=sync-engine`: reload Sync Engine plugin
- `obsidian command id=sync-engine:export-logs`: export Sync Engine logs, use this for inspecting real-time sync progress
- `obsidian command id=sync-engine:start-non-interactive-sync`: start a Sync Engine sync run that doesn't need UI operations. This is the primary method to execute Sync Engine syncs via the CLI.
- `obsidian eval code="<javascript>"`: execute code inside Obsidian instance.
- `obsidian dev:screenshot path=<path>`: take a screenshot of current Obsidian.

## Workflow

- Write probe `console.log()` code directly in source to investigate the bug (don't use `write-debug-module` skill, which is for remote debugging).
- Attach the debugger.
- Rebuild the plugin.
- Reload Sync Engine plugin.
- Start a non-interactive sync.
- Print captured console logs to gather info.
- Iterate above until diagnosis complete.
- Detach the debugger.
- Clean up probe code in source and temp files in test files.
- Report.

## Useful Strategies

- When needed, inspect sync progress by polling exporting logs.
- When needed, edit config files in `./.obsidian/` and reload the plugin.
- When needed, edit `./test-files/` content using your file tools (do not use `obsidian eval`).
- When needed, use code eval to explore internals.
- Do not manually operate on remote files during clean up step. Restore local files and trigger a sync to remote instead.
