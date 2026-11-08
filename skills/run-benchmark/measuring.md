# Measuring a sync

## Choosing how to time it

A duration needs the instant the plugin starts a sync and the instant it finishes. Options, best first:

1. **Listen for the plugin's announcements.** Subscribe from an eval to its sync start and end events; append lines to a file.
2. **Wrap the code that does the work.** Find the function that starts a sync and whatever ends it, wrap both to append a timestamped line to a file, call the starting function from an eval. Best when `app.plugins` exposes the plugin.
3. **Press the button for it.** Invoke the button or command from an eval, print timestamps around the wrapper. You lose the plugin's own outcome.
4. **Watch the screen.** Drive the interface with `cua-driver` and read the duration from what the app shows. Last resort.

Explore the plugin's source thoroughly first. If it contradicts what the test cases assume (no way to sync without clicking, a confirmation on every sync, a pause you cannot exclude), stop and report to the leader.

Both timestamps must come from the code that starts and ends the sync, on the same clock. Timestamps taken around the caller measure the caller.

When applying the file logging patch:

- The appended content contains the timestamp
- The file lives outside both vaults.
- One file per vault.
- Use `appendFileSync()` so that only one active writer.
- On load it prints a fixed line to verify it is correctly wired up.
