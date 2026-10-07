# Grav Commander 0.4.1

A focused integration and usability patch for Grav 2/Admin2.

- Optional Revision Ledger checkpoints after successful changed saves of recognized
  Grav page files, including embedded-editor and Jarvis-assisted saves.
- Clearer hover and keyboard focus for clickable Unix permission values.
- Informational labels showing the automatically resolved editor and fallback.
- Plain-language companion-plugin guidance and current 0.4.1 screenshots.
- Grav-formatted changelog and a downloads-compatible `plug` blueprint icon.

Commander works independently. Revision Ledger remains optional: its existing
public service is used without a Ledger update or required dependency. Checkpoints
contain the newly saved page content, authenticated author and reason `Saved with
Grav Commander`; no separate AI marker is added. Both Commander write and Ledger
manage permissions are enforced. Failed/canceled/unchanged saves do not checkpoint.

Ordinary files, Markdown attachments, bulk copy/replace, upload, rename/move,
delete, extraction and backup restore are not recorded. Ledger is page history,
not an operation log or a substitute for Commander's safety backups. Checkpoint
failure never turns a successful file Save into a false failed-save response.

Requires Grav 2, Admin2, API >=1.0.44, PHP >=8.3 and ext-zip. Preserve site overrides
in `user/config/plugins/grav-commander.yaml`, install the versioned package and clear
Grav caches. No configuration migration is required from 0.4.0. Test on staging
and keep independent backups before powerful filesystem or restore operations.

## Release and distribution

[GitHub releases](https://github.com/cdaters/grav-plugin-grav-commander/releases)
carry the versioned package. Git tags, release attachments and checksums describe
immutable versions; main-branch documentation may subsequently improve.
The 0.4.0 and earlier tags/assets are preserved. The corrections previously made
on main are included in 0.4.1, without rewriting those published artifacts.

Commander is already listed in official GPM. A new GitHub release follows normal
GPM indexing; no new submission is required. The live downloads listing may show
an older version until refresh. Daters CGPM is a separate publication step.

Develop in the authoritative suite and use the deterministic exporter. See
[CONTRIBUTING.md](CONTRIBUTING.md) for the source/mirror and changelog conventions,
[README.md](README.md) for administrator workflows, and
[the integration notes](docs/REVISION-LEDGER.md) for the precise history contract.
