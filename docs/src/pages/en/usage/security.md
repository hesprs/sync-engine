# Security

Sync Engine handles your vault files, remote storage credentials, and executable modules. This page explains what it trusts, what it cannot protect, and what you can do to reduce risk.

## Trust Boundary

Sync Engine trusts the local operating system, Obsidian, and the device where it runs. Anyone or any software that can control your device or Obsidian session may also be able to access your vault and configured credentials. Sync Engine cannot protect against a compromised device.

Sync Engine also assumes users are rational about your own security, and allows everything if the user explicitly approves.

Modules are executable code. An enabled module can receive broad Obsidian and Sync Engine access, including vault files and network requests. This is required by the extensible design, but it means you should treat modules like plugins and only enable ones you trust.

Without client-side encryption, the configured backend receives the files you sync. The backend and network should therefore be treated as places where your data may be exposed or changed. The [Encryption module](../deep-dive/modules/encryption) lets the client encrypt file contents and names before upload. It does not hide every detail: the backend can still learn information such as file sizes, modification times, and the number of files, and it may still delete or roll back remote data.

## What Sync Engine Does

- Only configured backends and module sources receive requests. Sync Engine has no telemetry. See [Permissions](./permissions) for request timing and scope.
- New modules are disabled by default. Sync Engine records your approval separately from the module file and checks the module's integrity before loading it, unless you explicitly turn that check off. See [extensibility contract](../deep-dive/extensibility) for the exact boundaries.
- Automatic updates only apply to an already installed module from the same source. A newly discovered module without any download record triggers an explicit warning of potential malice.
- Official modules only read secrets that their documented function requires. Secrets are stored through Obsidian's secret storage rather than in ordinary settings.
- Every official module are reviewed by accountable real human maintainers before they are entitled "official".

These safeguards reduce accidental or unauthorized module execution. They do not make an untrusted module safe after you approve and enable it. Source links and integrity checks are useful evidence, not a substitute for judgment.

## Improve Your Security

- Install modules from sources you recognize. Review a module's source and requested function before enabling it, remove module sources you no longer trust.
- Keep integrity verification enabled. Do not approve an untrusted module or disable verification unless you understand why it is necessary.
- Avoid HTTP sources, especially on networks you do not control. Use HTTPS for backend and module source URL
- Enable the Encryption module for sensitive vaults. Use a strong, unique password, keep it in Obsidian's secret storage, and configure it on every device before syncing encrypted files. Read the [encryption spec](../deep-dive/modules/encryption) before relying on it.
- Protect your device and Obsidian vault with your operating system's updates, account protection, and disk encryption where available.
- Give your backend account access only to the directory used by Sync Engine, and keep independent backups. Encryption cannot recover data deleted by a malicious backend.
