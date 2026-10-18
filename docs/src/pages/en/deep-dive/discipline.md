# Project Discipline

## Data Normalization

Data normalization means the data from external sources are transformed into a canonical form used within Sync Engine.

- For "unreliable" entries (user input, or standard implemented by many servers), all data that are necessary to normalize must be normalized exactly and only once upon the point of entry. No further normalization should be executed within Sync Engine.
- For "reliable" entries (proprietary APIs implemented by a single provider), there should not be normalization at all.

Special data are separated into the following categories that should be always normalized regardless of source reliability:

- File size: single number of this size converted to bytes. For user-friendly display, convert them into number + space + capitalized unit, such as `1 GB`, `537 MB`, `29.9 KB` with base 1024 (so strictly the units are `KiB`/`MiB`/..., but use the units without `i` for understanding), max 2 decimal places.
- Time duration: integer Unix timestamp specified to milliseconds. User-friendly display uses number + space + lower case unit, such as `1 s`, `24 h`, `2.3 d`, max 2 decimal places.
- File path (key): follow [unified key](./file-system#unified-key-schema) - `folder/file.ext`, folder - `folder/nested/`, root: `/`. Normalize to Unicode NFC.
- URL: all URLs' path name, query parameters, and fragment are percent-encoded according to RFC 3986; ASCII latin characters in protocol and hostname converted to lower case. For user-friendly display, decode the pathname, query parameters, and fragment.
- ETag: strip the `W/` weak ETag marker and surrounding quotes.

## Documentation

- The primary documentation locates in `docs/src/pages/en/` has three sections in three folders: `usage/`, `development/`, and `deep-dive/`:
  - `usage/`: designed for non-technical users, avoid dev jargon
  - `development/`: SDK API reference and practical module development setups only
  - `deep-dive/`: Sync Engine internals
- Prefer inter-page links when other pages have relevant content, duplication content cross-page is forbidden.
- Link format: Link to title anchors when possible, strict relative links, no `.md` extension.
- Only add inter-links when the content is truly relevant, you must not link distant pages just for link count.
- Link topology:
  - `usage/` and `deep-dive/` can interlink
  - `development/` can link to `usage/` and `deep-dive/`, but `usage/` and `deep-dive/` should avoid linking into `development/`.
  - Module specs (`deep-dive/modules/*`) should be self-contained in each page in. They can link external pages but external pages should not link official modules except in dedicated pages in `usage/`.
- Don't be overly verbose.
- Avoid large blocks of code in `usage/` and `deep-dive/`, code should be the major content in `development/`
- Documentation titles use title case.
