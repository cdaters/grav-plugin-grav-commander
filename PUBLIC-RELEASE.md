# Grav Commander 0.3.15 — public release

Grav Commander is a Grav-native file and site operations workspace for Admin2,
combining guarded filesystem tools, editing, archives, backups and optional
Jarvis assistance. It remains alpha software with conservative roots and
explicit permissions. See the [package README](README.md) for operations,
configuration, safety limits and screenshots.

## Cumulative update from v0.3.11

- Optional Jarvis Explain, Summarize, Review, Improve / Rewrite and Custom Prompt,
  with provider/model discovery, bounded context and before/proposed review.
  Jarvis permissions are additional to Commander permissions; unavailable
  Jarvis leaves normal file operations usable. Apply changes only the unsaved
  editor buffer. **Save file** remains the persistence action.
- Preserve unsaved editor text across appearance changes and notice rerenders;
  keyboard-accessible file selection and labeled root/path controls.
- API 1.0.44 scope, inherited group and API-super permission enforcement.
  Legacy `admin.super` alone is not API authority.
- The public repository's existing blueprint YAML quoting correction is included;
  the historical v0.3.11 attachment predates that correction and is not replaced.
- Immutable CGPM release metadata and the approved discovery keywords:
  `admin`, `admin2`, `backup`, `developer`, `editor`, `media`, `file`,
  `file-manager`, `archive`, `restore`, `schedule`, `grav2`.

No missing intermediate GitHub releases are being invented. This is the same
0.3.15 package already distributed by Daters CGPM, now exported to this public
repository. All 29 shipped files, including README, changelog, Composer metadata
and screenshots, are preserved byte-for-byte. This repository-only note and
the export instructions are excluded from source archives.

## Install and update

Requires Grav 2, **API >=1.0.44**, Admin2, PHP >=8.3 and `ext-zip`. Jarvis is optional.
Use `bin/gpm install grav-commander` or `bin/gpm update grav-commander` once the
official listing indexes this release. For manual installation, extract the
release into `user/plugins/grav-commander`, preserve site overrides under
`user/config/plugins/grav-commander.yaml`, and run `bin/grav clearcache`.
Keep independent backups and test upgrades on staging.

Grav's [official update procedure](https://learn.getgrav.org/2/plugins/gpm-submission)
uses a matching blueprint version plus GitHub release and consistent tags.
This repository retains `v`-prefixed tags. A jump from v0.3.11 to v0.3.15 is
valid. No new submission is needed for an already-approved listing. Discovery
and its timing belong to GPM; GitHub publication does not prove indexing.
GitHub source archives are available; the attached ZIP reuses the exact existing
Daters CGPM artifact, without rebuilding it.
The current official Commander download redirects to its attached release ZIP;
that established asset convention is retained. GPM listing approval is recorded
in [Grav issue 4090](https://github.com/getgrav/grav/issues/4090).

## Next patch and future direction

The shipped README contains an older short API requirement and historical
0.3.12/CGPM-candidate wording; its final authorization section and blueprint
specify the current API requirement above. Composer's historical generic keywords
remain unchanged to preserve the published package; Grav discovery uses the
approved blueprint keywords. Normalize those details, the newer changelog headings
and the broader product description in the next patch, not under an existing version.
The internal backup/status version label also still reports 0.3.14; the package
identity used by Grav/GPM is 0.3.15 in the blueprint.

Known non-destructive limitation: New folder at an empty root path is rejected by
API validation. Creating folders inside an existing folder works; explicit `.`
also works through the API. Normalize root-folder requests in 0.3.16. No permission
or containment rule is bypassed by this release.

The existing Files/Backups screenshots still illustrate the core UI; they predate
the optional Jarvis panel. Refresh those illustrations when its presentation changes.

Beyond the [existing roadmap](ROADMAP.md), explore efficient source/destination
workflows inspired by Directory Opus, Midnight Commander and browser file managers:
possibly dual panes, tabs/history, multi-select, keyboard/drag-and-drop actions,
preview/details, archive inspection and queued progress. These are future ideas,
not current features. Markdown already offers Open in Grav Editor and raw editing;
future work should deepen safe page operations, YAML validation, extension-structure
recognition and media workflows while retaining bounded roots and protected paths.
Ordinary Save concurrency checks remain a priority before expanding editing.

Future CGPM ergonomics should favor GitHub release discovery, validation and optional
Testing approval before Stable. This release adds no discovery feature or signing layer.
