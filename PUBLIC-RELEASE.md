# Grav Commander 0.4.0 — published release

A Grav-native dual-pane file and site operations workspace for Admin2.
[Version 0.4.0](https://github.com/cdaters/grav-plugin-grav-commander/releases/tag/v0.4.0)
is published. The release tag and ZIP are immutable; `main` may include later
documentation and metadata corrections awaiting a future release.

- Independent roots, breadcrumbs, histories, filtering, sorting and selection.
- Explicit active source/opposite destination, responsive pane switching and
  coordinated copy/move/delete/archive requests with full-selection preflight.
- New file/folder, duplicate, image preview, ZIP inspection and keyboard workflows.
- Automatic compatible editors with Caxton/native/Commander fallbacks; pinned
  buffers, unsaved-change guards, YAML/JSON/frontmatter validation,
  atomic file replacement and revision checks on editor Save.
- Remembered per-pane hidden-file switches, clickable Unix modes with guarded
  permission dialogs, configured external roots and clear boundaries.
- Grav page detection, page/media/package/config identity and existing
  backup/restore safeguards. Optional Jarvis Apply remains unsaved-buffer only.

Requires Grav 2, API >=1.0.44, Admin2, PHP >=8.3 and ext-zip. Preserve site overrides
in user/config/plugins/grav-commander.yaml, install the versioned package and clear
Grav caches. No configuration migration is required from 0.3.15.

Operations are bounded synchronous requests. Collisions require explicit choices;
preflight checks the complete selection, but later I/O failure can leave completed
items or a partial destination. Review reported results before retrying. There is
no background resume or cancellation. Cross-pane drag/drop, syntax highlighting,
line gutters and deeper semantic refactoring remain deferred.

See README.md for keyboard shortcuts, limits, permissions, configuration and safe
operation details. The authoritative suite owns development; the deterministic
exporter copies identical package files here. Do not independently develop both
copies. Documentation follow-ups do not replace prior release assets.

## Documentation and metadata follow-ups — 2026-10-06

- Added current 0.4.0 Files, Unix permissions and Backup Center screenshots to the
  administrator README, including light and dark appearance examples.
- Corrected all recorded changelog releases to Grav's version/date headings and
  supported category lists, preserving release dates and change descriptions.
  Moved the post-release screenshot note here so the changelog contains releases
  only. Added the format checklist to [CONTRIBUTING.md](CONTRIBUTING.md).
- Changed the blueprint listing icon from `folder-tree` to `plug`, which renders
  in the downloads site's Font Awesome stylesheet. This metadata correction is
  on `main`; it is not part of the already published 0.4.0 tag or ZIP.

## Downloads listing notes

The [Grav downloads listing](https://getgrav.org/downloads/plugins#grav-commander)
already shows Commander 0.4.0. During the documentation review, its changelog
endpoint returned only whitespace. The published changelog uses headings that
do not match [Grav's required format](https://learn.getgrav.org/2/plugins/gpm-submission).
The corrected file on `main` is ready for a future release, but does not replace
the changelog in the existing 0.4.0 tag or ZIP. A corrected live listing has not
been verified; that depends on GPM's indexed source and refresh behavior.

The missing header icon was caused by the published blueprint's `icon: folder-tree`:
the downloads site's loaded Font Awesome stylesheet supplies no glyph for
`fa-folder-tree`. The blueprint on `main` now uses `icon: plug`, whose `fa-plug`
glyph was verified on the site. The live listing can retain the old icon until
GPM indexes the corrected metadata. Runtime files are unchanged.
