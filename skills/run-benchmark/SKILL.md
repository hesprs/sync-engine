---
name: run-benchmark
description: Benchmark a plugin-backend pair against the documented test cases and record the results.
disable-model-invocation: true
---

Measure how fast one Obsidian plugin syncs a vault to one backend, and how many errors the sync leaves behind. The measurement is the [test cases](../../docs/src/pages/en/deep-dive/benchmarking.md#test-cases); the result goes into [benchmarking](../../docs/src/pages/en/usage/benchmark.md). "Apparent Statistics" is out of scope.

You produce the test conditions plus four measurements: upload speed, download speed, daily sync speed, correctness.

## Steps

**1. Reach the backend from the app.** Install Obsidian, keep exactly one instance running; follow [obsidian vaults](obsidian.md#vaults) to setup a vault.

A backend you can host: follow [testing](../../scripts/benchmark/testing.md) to run it locally and simulate the network. A managed service: stop and ask the leader to authorize the plugin there and place the credentials. They need to type the secret into the plugin's settings, or run `obsidian vault=<name> eval code="window.app.secretStorage.setSecret('<key>', '<secret>')"`, then resume. You fill in every non-secret setting; no secret value passes through your output.

_Done when:_ an empty vault syncs successfully without transferring file data, and, if you simulated the network, that run passes "The network is simulated once".

**2. Prepare two vaults and your instruments.** An _original_ filled by `test-vault.ts` and an _empty replica_. Install the plugin in both, enter the account configuration, switch off every automatic sync trigger and file size limit. Add the console-to-file companion from [measuring](measuring.md#reading-the-console), then make the plugin's start and finish visible.

_Done when:_ both vaults list the plugin as enabled, both console files exist, and one trial sync writes a start and a finish line with matching timestamps.

**3. Record the test conditions.** The page linked above lists them: plugin and app versions, OS, CPU score, backend, ping, upload and download speed. For the ping run `ping-test.ts` against the address the sync traffic uses; for the speeds, upload one large file through that address, download it back, delete it.

_Done when:_ every field is written down, and the ping and both speeds name the tool and address that produced them.

**4. Upload speed.** Mark the run start in the record, trigger one sync of the filled original that needs no clicking, wait for its finish line. Duration is finish time minus start time.

_Done when:_ the run reports success rather than failure, cancellation or nothing to do, uploaded bytes equal the vault's size on disk, and the duration is written down.

**5. Download speed.** Confirm the replica starts empty, mark the run, trigger its first sync.

_Done when:_ the replica's file count and size match the original's, no response said "not modified", and the duration is written down.

**6. Daily sync speed.** Two vaults exist: the original, and the replica downloaded from the backend. Without reloading the plugin, run `daily-test.ts <vault> n` for each case `n` from 1 to 10; it makes one small edit — create, modify, delete or rename — and waits for you to continue. Per case, sync the original first, then the replica, marking each sync in the record. Trigger both by hand.

If the plugin has a sync-on-change option, enable it in the original and let the original trigger itself if the following conditions hold:

- its wait is properly debounced
- your timing method reaches the code that starts a sync
- the change detection can detect changes caused by the daily sync script

_Done when:_ ten durations per vault are written down, min, median and max computed, every case ended in success.

**7. Correctness.** Run `validator.ts` once against each vault, add the two error counts.

_Done when:_ both validators ran to completion and the added count is written down.

**8. Report.** Deliver the result as the leader asked — a separate report when the shared table is not yours to edit. It carries the test conditions, the four measurements, and every deviation with its reason.

_Done when:_ the report is written and every deviation you introduced is named in it.

**If any part failed / goes unexpected, clean up existing vault, logs and start over in new vaults. Do not reuse the partial state.**

## Elsewhere

- [measuring](measuring.md) — timing a sync, reading the plugin's console.
- [obsidian](obsidian.md) — vaults, CLI, plugin configuration, eval quoting.
- [gotchas](gotchas.md) — setup faults that produce plausible-looking wrong results.

Read all above before starting.

## Repo scripts

`ping-test.ts <url>`, `test-vault.ts <vault>`, `daily-test.ts <vault> <n>`, `validator.ts`, all run with Bun, documented in [benchmarking](../../docs/src/pages/en/deep-dive/benchmarking.md).
