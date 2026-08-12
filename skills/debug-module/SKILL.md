---
name: debug-module
description: Write a temporary Sync Engine module for debugging. Use when encountering unreasonable bugs, don't use when the bug can be identified by inspecting code.
---

Sync Engine serves for various services, many bugs need deeper investigation that Sync Engine's built-in logs are not suffice. Temporary debug modules allow you to gather more info to facilitate the analysis.

When writing a debug module, you need to produce a plain, self-contained JS ESM file at repo root, containing a simple Sync Engine module. Read repo docs on how to develop a module before writing. Useful patterns:

- Register a request middleware to log raw request raw request and response.
- Register a filesystem wrapper to trace the files.
- Subscribe to Sync Engine events and (execute code to) gather information when event fires.

You must:

- Obfuscate any privacy-sensitive info logged in your module, including hashing filenames and contents instead of logging raw content, and strip off auth header and URL in logged requests. File mtime, size, and UID are safe to disclose without obfuscation.
- When logging, dispatch Sync Engine events `logGeneral` or `logSync` directly, do not create a separate logging and export logs path.
- Simplify the module to bare minimum, don't gather information that has no value, focus on the most valuable and distinguishing info, don't do over-abstraction. The module is throwaway.
- Only perform syntax checking, no need linting or formatting.

After writing the module, you need to give clear instruction on what to perform after loading the module.
