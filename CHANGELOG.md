# 0.4.1
## 2026-10-07

1. [](#new)
    * Optional Revision Ledger checkpoints after successful saves of recognized Grav page files, including embedded-editor and Jarvis-assisted saves, with Ledger permission checks.
    * A small status label identifies the automatically selected editor and follows fallback changes.
2. [](#improved)
    * Clickable Unix permission values have clearer hover highlighting and visible keyboard focus without an extra action button.
    * Expanded companion-plugin guidance, exact page-history limits and current interface screenshots.
3. [](#bugfix)
    * Use a downloads-site-compatible plug icon and Grav-formatted changelog so GPM can display release metadata.

# 0.4.0
## 2026-10-06

1. [](#new)
    * Added a dual-pane file workspace with independent roots, history, breadcrumbs, filtering, sorting, multi-selection and a narrow-screen pane switch.
    * Added configured external roots with visible boundaries and setup guidance; root containment, symlink and protected-path checks remain enforced.
    * Added per-pane Show hidden files switches beside navigation controls, off by default and remembered per user/browser without clearing visible selections.
    * Added coordinated copy/move/delete/archive operations, new files, duplication, image/ZIP previews, keyboard shortcuts and single-file drop uploads.
    * Added explicit Ask/Skip/Replace/Keep both-Rename/Cancel collision review, batch decisions and folder merge. Stale plans are refused; partial results are reported. Replacement retains configured safety backups, including unique archive names.
    * Added automatic compatible editor selection with Caxton's public field adapter, a documented provider interface and native Grav/Commander fallbacks. Commander keeps file policy, validation, stale-save protection, unsaved changes and Jarvis.
    * Added Markdown formatting, Undo/Redo and safe preview; editor opening scrolls and focuses without losing pane locations. YAML/JSON/frontmatter are checked on Save.
    * Added clickable octal values in the Permissions column, synchronized owner/group/other bits, presets and octal entry. Recursive chmod requires explicit review; unsupported hosts remain informational. No ownership changes or automatic undo.
    * Added optional Site Safeguard advanced-workflow navigation and File Vault status/management navigation. Standalone Commander backups remain available.
2. [](#improved)
    * Replaced app-owned browser prompts with themed accessible dialogs and aligned Files/Backups controls with Admin2 sizing and Light/Dark/Follow OS appearance.
    * Honor Jarvis's configured provider/default model; load and reuse model catalogs automatically while preserving explicit proposal review, Apply and Save.
    * Rewrote the administrator README, added configuration guidance and removed stale screenshots. Documented optional integration limits, including Revision Ledger.

# 0.3.15
## 2026-10-05

1. [](#improved)
    * Standardize ordinary Grav blueprint keywords for package search and shared repository Topics.
    * Metadata-only patch; package functionality is unchanged.

# 0.3.14
## 2026-10-05

1. [](#improved)
    * Prepared a new immutable CGPM release with explicit publisher association and versioned artifact naming.
    * No intentional runtime behavior changes.

# 0.3.13
## 2026-10-03

1. [](#improved)
    * Make file selection keyboard accessible and label the root/path controls.
    * Use API 1.0.44 permission enforcement, including scoped API keys, inherited group grants, and API super authority. Legacy `admin.super` alone no longer grants API operations.
2. [](#bugfix)
    * Preserve unsaved raw-editor text across appearance changes and notice rerenders.

# 0.3.12
## 2026-08-30

1. [](#new)
    * Added optional Jarvis actions for eligible text files: Explain, Summarize, Review, Improve / Rewrite, and Custom Prompt.
    * Added provider-neutral validation/model discovery, bounded context provenance, usage/cost/retry/cache reporting, and before/proposed review inside Admin2.
    * Added hash-only one-time receipts for applying safe proposals to the current unsaved editor buffer.
2. [](#improved)
    * Commander now degrades cleanly when Jarvis, a provider, credential, capability, or budget is unavailable.
    * Sensitive file locations, private-key material, binary content, unsafe partial rewrites, and secret-bearing assignments fail closed or are redacted before Jarvis receives context.
    * Jarvis actions require both Commander operation permission and `grav-jarvis.use`; all provider reliability behavior stays behind Jarvis public contracts.
    * Apply is actor/file/source/proposal/version bound, expires after 15 minutes, works once, and never writes the filesystem. The existing Save file action remains the only editor persistence path.

# 0.3.11
## 2026-05-17

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

# 0.3.10
## 2026-05-16

1. [](#new)
    * Added expandable/collapsible Backup Profile cards with Add, Expand all, Collapse all, Delete, and Save controls.
    * Added expandable/collapsible Scheduled Backup cards with summary rows, scheduler status cards, generated Grav scheduler job previews, and cleaner inline editing.
    * Added an Open in Grav Editor action for Markdown files under the Pages root while keeping raw text editing available.
2. [](#improved)
    * Auto-generates default scheduler output log paths from the schedule key.
    * Corrected the Admin2 page editor launch URL for Grav page Markdown files by targeting `/pages/edit/...` and stripping numeric folder prefixes.
    * Hardened Open/Edit Raw button handling so it behaves like double-clicking a file instead of risking route navigation.

# 0.3.8
## 2026-05-16

1. [](#new)
    * Added temporary token-based backup download links so backup ZIP downloads can start as normal browser downloads.
2. [](#improved)
    * Separated the file manager and backup tools into Files and Backups tabs.
    * Tightened notice spacing beneath the Admin2-style tab bar.
    * Auto-expires success and error notices.
    * Reduces duplicate working indicators so long operations use the central overlay.
    * Clarifies backup download status messaging for larger archives.
    * Bumped internal backup metadata and status version reporting to 0.3.8.

# 0.3.6
## 2026-05-16

1. [](#new)
    * Added a query-string backup download endpoint (`GET /backup/download?name=...`) to avoid filename and route edge cases.
    * Added a one-click "Use suggested path" action for moving backup storage outside the site root.
2. [](#improved)
    * Changed download responses to authenticated direct chunk streaming to avoid 500 errors and memory spikes with larger ZIPs.
    * Made the Backup Storage card visually reflect writable and inside-root status.
    * Updated the default backup storage path to `../gcmdr_backups` for safer new installs where the host allows it.

# 0.3.3
## 2026-05-16

1. [](#new)
    * Moved file browsing and backup controls into separate Grav Commander tabs.
    * Added a larger visible busy/progress panel for long-running backup operations.
    * Added backup storage health details, including a warning when backups are inside the Grav/site root.
2. [](#bugfix)
    * Fixed backup profile and schedule save routes by adding route aliases used by the Admin2 component.
    * Allowed configured backup paths to live outside the Grav root, including absolute paths or relative paths such as `../grav-commander-backups`.

# 0.3.2
## 2026-05-16

1. [](#new)
    * Added ZIP creation and extraction actions.
    * Added archive safety controls and extraction guardrails.
