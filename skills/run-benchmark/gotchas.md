# Gotchas

Faults that produce results which look fine and are wrong.

- **Cached files.** The app keeps an HTTP cache. A file already fetched is answered "not modified" with no bytes, so a download finishes early and reports transfer it never did. Clear the cache before a download run; treat any "not modified" inside a run as a failed run.
- **Simulated conditions applied twice.** With backend, recording endpoint and app on one machine, a rule meant for one direction catches both legs and the delay doubles. Apply it to one direction of one address, then run the check under "The network is simulated once".
- **Proxy variables.** With `http_proxy`, `https_proxy` or `no_proxy` exported, the app routes its own traffic through them while `curl` still reaches the backend; the plugin cannot connect and nothing else looks wrong. Launch the app with them unset.
- **A second app instance.** When no instance answers, `obsidian <anything>` launches a new one. Two instances fight over the vault, syncs run twice, runs hang. A CLI call that never returns means a second instance.
- **A dropped subscription.** Reloading a plugin throws away the objects it announced events with, so a listener attached before the reload stops firing silently. Attach it again after every reload.
- **An emptied vault that keeps its sync record.** Deleting a replica's files without clearing the plugin's saved sync state reads as "every file was deleted locally", so the next sync deletes the backend's copies instead of downloading them. Start a download run from a vault that has never synced, or clear its sync state along with the files.
- **A logger inside the vault.** A log written into a synced vault changes the vault's size mid-run. Keep logs outside both vaults.
- **A vault the app cannot see.** Community plugins stay blocked until restricted mode is off, and a plugin copied into a vault stays invisible until the app reloads it. A plugin that never loads produces a zero-second sync, not an error.
