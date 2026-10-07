# Grav Commander 0.4.0 — local release candidate

A Grav-native dual-pane file and site operations workspace for Admin2.
This candidate is prepared locally; publication and tagging are separate actions.

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
copies. No prior release assets are replaced by this candidate.
