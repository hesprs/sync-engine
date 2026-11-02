# Benchmark

All benchmark results are recorded here, see [deep dive: benchmarking](../deep-dive/benchmarking) for benchmarking details. Sync Engine welcomes everyone contributing benchmarking results as long as it follows the steps specified in the spec.

## Apparent Statistics

| Metrics | Sync Engine | Remotely Save | Nextcloud Sync | Nutstore Sync | Google Drive Sync | Easy Sync |
| --- | --- | --- | --- | --- | --- | --- |
| Version | 3.3.4 | 0.5.25 | 1.0.13 | 1.6.0 | 3.1.1 | 1.6.5 |
| Transparent[^1] | ✅ | ⚠️[^9] | ✅ | ⚠️[^13] | ✅ | ✅ |
| Startup time[^2] | 27.2 ms[^8] | 251 ms | 20.2 ms | 298ms | 6.6ms | 60.8ms |
| Plugin size | 158 KB | 4050 KB | 595 KB | 4230 KB | 31.3 KB | 1840 KB |
| Sync hidden files[^3] | ✅ | ⚠️[^10] | ⚠️[^10] | ✅ | ⚠️[^10] | ⚠️[^10] |
| Move detection[^4] | ✅ | ❌ | ⚠️[^12] | ❌ | ❌ | ✅ |
| Chunked transfer[^5] | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Metadata syncing[^6] | ✅ | ⚠️[^11] | ✅ | ❌ | ❌ | ❌ |
| Encryption[^7] | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

[^1]: Whether the author has made every controllable component that affects the plugins functioning free and open-source.

[^2]: The time by which the plugin delays the cold start of Obsidian App.

[^3]: Can (be configured to) sync arbitrary files in directories with a leading dot, such as the Obsidian config folder `.obsidian/`.

[^4]: Correctly detects file movements instead of delete + download / upload.

[^5]: Downloads / uploads large files in chunks so that the machine doesn't crash when dealing with large files.

[^6]: Preserves modification and creation time across devices.

[^7]: Supports encrypting files before uploading.

[^8]: Measured with a module loaded.

[^9]: Entire sync core is proprietary but source code is available.

[^10]: Only specific files under `.obsidian` can sync.

[^11]: Only works on OneDrive.

[^12]: Remove movements cannot me detected.

[^13]: Nutstore server and the SSO sign-on dependency are not transparent.

## WebDAV Performance

- **Obsidian version**: 1.13.4
- **Operating system**: NixOS 26.11
- **CPU single core score**: around 1700
- **Backend**: Self-hosted Nextcloud WebDAV[^12]
- **Average ping**: 400 ms
- **Average upload speed**: 3 MiB/s
- **Average download speed**: 5 MiB/s

[^12]: During local testing, the connection is delayed and bandwidth is limited to simulate middle-to-low network quality.

| Item | Sync Engine | Remotely Save | Nextcloud Sync |
| --- | --- | --- | --- |
| Version | 3.0.0 + `webdav` module 0.1.7 | 0.5.25 | 0.7.38 |
| 2000 files upload | **9.43 min** | 16.4 min | 17.95 min |
| 2000 files download | 5.87 min | 13.68 min | **5.22 min** |
| Daily simulation<br>(Original, 10 rounds) | Min: **1.04 s**<br>Median: **1.44 s**<br>Max: **48.56 s** | Min: 99 s<br>Median: 129 s<br>Max: 326 s | Min: 1.27 s<br>Median: 2.75 s<br>Max: 60.55 s |
| Daily simulation<br>(Replica, 10 rounds) | Min: 1.06 s<br>Median: **1.72 s**<br>Max: **3.49 s** | Min: 111 s<br>Median: 117 s<br>Max: 204 s | Min: **0.4 s**<br>Median: 3.94 s<br>Max: 55.33 s |
| Correctness validation | 0 errors | 0 errors | <span style="color: var(--rose); font-weight: bold;">98 errors</span> |

In terms of syncing performance, Sync Engine is visibly faster than Remotely Save in terms of full upload and download. In the more realistic daily sync test, Remotely Save fails catastrophically and Sync Engine is around **100x faster** than Remotely Save.

Although claimed to be optimized for Nextcloud, Nextcloud Sync still shows visible disadvantage in terms of performance compared with Sync Engine. More importantly, it **fails to sync 98 original files or changes to the replica**, and many errors appeared during the testing process.

## S3 Performance

- **Obsidian version**: 1.14.5
- **Operating system**: NixOS 26.11
- **CPU single core score**: around 1700
- **Backend**: Self-hosted RustFs 1.0.4[^12]
- **Average ping**: 401.87 ms
- **Average upload speed**: 2.79 MiB/s
- **Average download speed**: 4.55 MiB/s
- **S3 pricing standard**: AWS S3 `us-east-1`, publication 2026-10-15

<!-- Some observations: RustFs 1.0.4 batch object deletion is very slow and prolongs linearly with object count, and the ETag of an object which was uploaded multipart changes when that object is copied. These facts explain the 7.63s original and 6.17s replica outliers. -->

| Item | Sync Engine | Remotely Save[^14] |
| --- | --- | --- |
| Version | 3.3.4 + S3 module 0.2.3 | 0.5.25 |
| 2000 files upload | **3.95 min** | 6.3 min |
| 2000 files download | **2.42 min** | 3.87 min |
| Daily simulation<br>(Original, 10 rounds) | Min: **0.37 s**<br>Median: **0.7 s**<br>Max: **7.63 s** | Min: 2.16 s<br>Median: 3.1 s<br>Max: 76.12 s |
| Daily simulation<br>(Replica, 10 rounds) | Min: **1.4 s**<br>Median: **1.71 s**<br>Max: **6.17 s** | Min: 1.87 s<br>Median: 2.68 s<br>Max: 32.4 s |
| Correctness validation | 0 errors | 0 errors |
| Total S3 cost | **$0.0585** | $0.0702 |

[^14]: "Generate Folder Object" is enabled to match the benchmark's correctness first standard.
