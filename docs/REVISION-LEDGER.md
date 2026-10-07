# Revision Ledger integration in Commander 0.4.1

Commander uses the existing documented `$grav['revisionLedger']` public service's
`checkpointPage(page, content, reason, source, author)` method. There are no private
Ledger imports, storage reads, new events, or Ledger package changes. The contract
is available in the tested Revision Ledger 0.2.4; availability is checked by enabled
configuration, service registration and callable capability rather than a hard dependency.

## Boundary and semantics

The HTTP write controller first enforces Commander write permission. API 1.0.44's
permission resolver independently checks `revision-ledger.manage`, including key
scope caps and demo restrictions. A missing/incompatible/unauthorized integration
cannot grant access, prevent the file save, or trigger another mutation.

A post-save callback runs after atomic file promotion and before releasing the
Commander save lock. It receives the exact saved string and canonical file path.
Only Markdown within the physical `user/pages` root whose canonical path matches
an actual Grav page object's `filePath()` is supported. A root alias does not change
identity. Route guesses and Markdown attachments do not become page history.

The public service records the supplied content with reason `Saved with Grav
Commander`, source `plugin` (Ledger's existing protected plugin-checkpoint category)
and the authenticated username. It does not receive an invented AI attribute:
Jarvis-assisted content is recorded like any other explicit Save. Ledger owns
retention, hashing, content deduplication and its normal history/restore interfaces.

Unchanged disk content skips the callback. Failed validation, stale revisions,
permission failures and failed promotion never call it. No Admin save event is
synthesized and no checkpoint event is re-emitted, so this path cannot recursively
trigger itself or duplicate Ledger's native Admin save hooks. Native-page handoff
continues to use those native hooks separately.

This records the version **after** a successful save, not the replaced bytes.
Bulk operations, upload, archive extraction, restore, rename/move and delete have
no checkpoint hook: a page checkpoint does not describe multi-file transactions,
path migrations or tombstones. Ordinary files and Markdown attachments are excluded.
Use configured Commander safety backups or site backups for those cases.

## Result and failure behavior

A changed save with a callable, authorized Ledger may include `revision_ledger`
with status `recorded`, `unchanged` (Ledger deduplicated), `unsupported` (not an
actual page file), or `unavailable`. An unavailable checkpoint adds a plain warning
to the successful Save message. No storage paths or exception details are exposed.
The saved file is not rolled back and the client is not told to retry a failed Save.
Missing/disabled/incompatible/unauthorized Ledger and no-op saves omit this field.

Checkpointing is best effort. External writers do not share Commander's save lock;
there is no cross-plugin transaction guarantee. Identical content may reuse a
Ledger revision with its original metadata. Ledger's own restore limitations apply.
