

## 0.4.0 — 2026-10-06

- Dual-pane workspace with independent roots, paths, breadcrumbs, history, filtering,
  sorting, multi-selection and a responsive source/destination switch.
- Coordinated bounded copy/move/delete/archive operations preflight every selected
  item and destination; collisions never overwrite and partial I/O results are explicit.
- New file creation, folder duplication, image preview, ZIP inspection, keyboard
  selection/clipboard intent, and single-file desktop drop upload.
- Pinned raw editor retains unsaved changes across pane navigation; guarded close,
  reload, Save shortcut, YAML/JSON/frontmatter validation and revision checks on Save.
- Grav page identities derive from physical page locations, with native editor links;
  page media, plugin/theme packages and configuration receive contextual labels.
- Hardened recursive operations against symlinks, special files, root mutations and
  copying folders into themselves; archive inspection/extraction reject unsafe entries.
- Fixed empty-root folder creation and empty-content saves; aligned internal versions
  and Composer keywords. Existing backup/restore and optional Jarvis flows retained.


## 0.3.15 — 2026-10-05

- Standardize ordinary Grav blueprint keywords for package search and shared repository Topics.
- Metadata-only patch; package functionality is unchanged.

## 0.3.14 — 2026-10-05

- Prepared a new immutable CGPM release with explicit publisher association and versioned artifact naming.
- No intentional runtime behavior changes.
## 0.3.13 - 2026-10-03

- Preserve unsaved raw-editor text across appearance changes and notice rerenders.

- Make file selection keyboard accessible and label the root/path controls.

- Use API 1.0.44 permission enforcement, including scoped API keys, inherited group grants, and API super authority. Legacy `admin.super` alone no longer grants API operations.
## 0.3.12
## 08/30/2026

1. [](#new)
    * Added optional Jarvis actions for eligible text files: Explain, Summarize, Review, Improve / Rewrite, and Custom Prompt.
    * Added provider-neutral validation/model discovery, bounded context provenance, usage/cost/retry/cache reporting, and before/proposed review inside Admin2.
    * Added hash-only one-time receipts for applying safe proposals to the current unsaved editor buffer.
2. [](#improved)
    * Commander now degrades cleanly when Jarvis, a provider, credential, capability, or budget is unavailable.
    * Sensitive file locations, private-key material, binary content, unsafe partial rewrites, and secret-bearing assignments fail closed or are redacted before Jarvis receives context.
    * Jarvis actions require both Commander operation permission and `grav-jarvis.use`; all provider reliability behavior stays behind Jarvis public contracts.
3. [](#security)
    * Apply is actor/file/source/proposal/version bound, expires after 15 minutes, works once, and never writes the filesystem. The existing Save file action remains the only editor persistence path.

## 0.3.11
## 05/17/2026

1. [](#new)
    * Added a backup details/info modal showing notes and non-inline backup metadata.
    * Added public roadmap documentation.
2. [](#improved)
    * Persisted Backup Profile and Scheduled Backup expanded/collapsed state in localStorage.
    * Improved public documentation and plugin metadata for a Grav/GPM-readiness pass.
    * Backup downloads now use a true tokenized browser-streaming route for large ZIP archives.
3. [](#bugfix)
    * Fixed backup downloads in Admin2 by opening a non-API tokenized route instead of fetching full ZIP archives into JavaScript Blob memory.
    * Quoted the backup-path and archive-name help text so embedded colons remain valid YAML and cannot prevent Grav from loading the plugin blueprint.

## 0.3.10
## 05/16/2026

1. [](#new)
    * Added expandable/collapsible Backup Profile cards with Add, Expand all, Collapse all, Delete, and Save controls.
    * Added expandable/collapsible Scheduled Backup cards with summary rows, scheduler status cards, generated Grav scheduler job previews, and cleaner inline editing.
    * Added an Open in Grav Editor action for Markdown files under the Pages root while keeping raw text editing available.
2. [](#improved)
    * Auto-generates default scheduler output log paths from the schedule key.
    * Corrected the Admin2 page editor launch URL for Grav page Markdown files by targeting `/pages/edit/...` and stripping numeric folder prefixes.
    * Hardened Open/Edit Raw button handling so it behaves like double-clicking a file instead of risking route navigation.

## 0.3.8
## 05/16/2026

1. [](#new)
    * Added temporary token-based backup download links so backup ZIP downloads can start as normal browser downloads.
2. [](#improved)
    * Separated the file manager and backup tools into Files and Backups tabs.
    * Tightened notice spacing beneath the Admin2-style tab bar.
    * Auto-expires success and error notices.
    * Reduces duplicate working indicators so long operations use the central overlay.
    * Clarifies backup download status messaging for larger archives.
    * Bumped internal backup metadata and status version reporting to 0.3.8.

## 0.3.6
## 05/16/2026

1. [](#new)
    * Added a query-string backup download endpoint (`GET /backup/download?name=...`) to avoid filename and route edge cases.
    * Added a one-click "Use suggested path" action for moving backup storage outside the site root.
2. [](#improved)
    * Changed download responses to authenticated direct chunk streaming to avoid 500 errors and memory spikes with larger ZIPs.
    * Made the Backup Storage card visually reflect writable and inside-root status.
    * Updated the default backup storage path to `../gcmdr_backups` for safer new installs where the host allows it.

## 0.3.3
## 05/16/2026

1. [](#new)
    * Moved file browsing and backup controls into separate Grav Commander tabs.
    * Added a larger visible busy/progress panel for long-running backup operations.
    * Added backup storage health details, including a warning when backups are inside the Grav/site root.
2. [](#bugfix)
    * Fixed backup profile and schedule save routes by adding route aliases used by the Admin2 component.
    * Allowed configured backup paths to live outside the Grav root, including absolute paths or relative paths such as `../grav-commander-backups`.

## 0.3.2
## 05/16/2026

1. [](#new)
    * Added ZIP creation and extraction actions.
    * Added archive safety controls and extraction guardrails.
