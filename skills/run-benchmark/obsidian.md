# Driving the app

The Obsidian CLI is your main handle on the app: `obsidian <command> [options]`, options written `<key>=<value>` or bare `<key>`.

**`obsidian` only answers a running instance. With none running, it launches a new Obsidian process and never returns, so the call hangs until killed.** That is why every CLI call needs a running app. Keep exactly one instance open for the whole benchmark, confirm `timeout 10 obsidian vault info=path` answers before relying on the CLI, and run long-lived CLI work in a persistent terminal rather than a call that can block.

The CLI must be enabled in Settings → General → Advanced. "Command line interface is not enabled" means that toggle is off.

Every command takes `vault=<name>`. Pass it always: a benchmark has several windows open and the default window is whichever was focused last.

`obsidian help` lists every command. The ones a benchmark needs:

- `obsidian eval code="<javascript>"`: run code inside the instance. Fire-and-forget, no return value.
- `obsidian command id=<plugin-id>:<command>`: run a command the plugin provides.
- `obsidian plugin:reload id=<plugin-id>`: reload a plugin; do this after any configuration change.
- `obsidian plugin:enable id=<plugin-id>`, `plugin:disable`, `plugin:install`, `plugin:uninstall`: plugin chores.
- `obsidian plugins filter=community enabled`: list installed plugins; `enabled` narrows it to enabled ones.
- `obsidian plugins:restrict off`: allow community plugins at all.
- `obsidian dev:screenshot path=<path>`: screenshot the current window.
- `obsidian dev:debug <on/off>`: attach / detach debugger and capture console logs
- `obsidian dev:console`: print captured console logs

`https://community.obsidian.md/assets/community-plugins.json` lists every community plugin; very large, cache it locally.

## Vaults

Register a vault by opening it, which also creates it on disk:

```sh
mkdir -p /path/to/vault
obsidian eval code="window.electron.ipcRenderer.sendSync('vault-open', '/path/to/vault', false)"
```

A vault created this way is empty, `.obsidian` included. Then per vault, in this order:

1. `obsidian vault=<name> plugins:restrict off`, which reloads the window; community plugins stay blocked until restricted mode is off.
2. Install the plugin artifacts from GitHub releases to `<vault>/.obsidian/plugins/<id>/`, write the account configuration by editing `data.json`, then `obsidian vault=<name> reload` so the app discovers it.
3. `obsidian vault=<name> plugin:enable id=<id> filter=community`.
4. Put the credentials in place, branched the same way as step 1 of [SKILL](SKILL.md#steps). A backend you host: set the secret yourself, since the test credentials come from [testing](../../scripts/benchmark/testing.md). A managed service: stop and ask the leader to authorize the plugin.
5. If the plugin needs extra components installed before it works, install them, then prove the backend is reachable: an empty-vault sync must complete.
6. Clear the app's HTTP cache before every download run. Run this in the window that will download, and confirm `CACHE_CLEARED` in its console file:

```sh
obsidian vault=<name> eval code="(async()=>{const {session}=window.require('electron').remote;await session.defaultSession.clearCache();console.log('CACHE_CLEARED')})()"
```

Secrets live in the app's secret store, keyed by a name: `obsidian vault=<name> eval code="window.app.secretStorage.setSecret('<key>', '<secret>')"`, and `deleteSecret('<key>')` removes one. **Each vault window has its own store: a secret set in one vault reads back as nothing in another.** So set it once per vault.

A configuration field that asks for a secret holds that name, not the value. The value stays out of your output; when the leader places a secret, they tell you only the name to put in the configuration.

## Eval quoting

`code="..."` stops at the first double quote, so an eval body keeps to single quotes — or lives in a file passed as `code="$(cat file)"`. A loop or heredoc inside your own automation is where this usually breaks.

`eval` is fire-and-forget: it returns a synchronous result and nothing useful for a promise, so log what you need into the console file instead of relying on the return value.

The renderer's `fetch()` to `http://` is blocked by CSP. Anything reaching a local endpoint from inside the app goes through `requestUrl` in the main process.
