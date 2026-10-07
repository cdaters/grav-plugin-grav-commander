# One source, one public export

Develop Grav Commander in `grav-extensions/plugins/grav-commander`.
This standalone repository is its public/GPM export. Do not independently edit
the two copies. Issues and focused PRs are welcome here; maintainers first
apply accepted changes to the authoritative source, then export them back.

From the `grav-extensions` checkout, with the public checkout alongside it:

```sh
python3 scripts/export-public-plugin.py grav-commander --dry-run --diff
python3 scripts/export-public-plugin.py grav-commander --apply
```

Use `--destination /path/to/grav-plugin-grav-commander` for another checkout.
The exporter uses an explicit package file list, rejects unknown files and
symlinks before reading/copying them, checks identity/version fields, preserves
bytes and executable modes, and refuses to overwrite dirty destination work.
It never deletes files. Commit the synchronized checkout before the next export.
A repeat dry-run must show zero changes.

Normal releases: develop → bump blueprint/README/changelog version → test →
export → review the concise diff → commit/push main → publish a matching
`vX.Y.Z` GitHub tag and release. Never overwrite a published version. GPM then
discovers the release for an approved listing; CGPM distribution is independent.

## Changelog format

Keep `CHANGELOG.md` in [Grav's documented format](https://learn.getgrav.org/2/plugins/gpm-submission):

```markdown
# 0.4.0
## 2026-10-06

1. [](#new)
    * Describe a new feature.
2. [](#improved)
    * Describe an improvement.
3. [](#bugfix)
    * Describe a fix.
```

Use a level-one version heading and a separate level-two ISO date, newest release
first. Leave a blank line before the list and indent every nested bullet by four
spaces. Include only the categories needed: `new`, `improved`, `bugfix`. Keep the
version prefix consistent and preserve the actual release dates. Do not combine
the version and date or add an `Unreleased` heading to this parser-facing file.
Record post-release documentation work in `PUBLIC-RELEASE.md` instead.

Use `YYYY-MM-DD` rather than ambiguous numeric dates: Grav interprets slash dates
as month-first. Keep release tags in this repository's `vX.Y.Z` style; do not mix
prefixed and unprefixed tags. Existing GPM listings discover new GitHub releases
automatically, without another submission issue.

Check the rendered Markdown as well as the text before exporting. A documentation
fix on `main` does not change the changelog inside an already published tag or ZIP;
never move a release tag or replace its asset to repair documentation.

Package files come only from the plugin directory. The three repository-only
files (`CONTRIBUTING.md`, `PUBLIC-RELEASE.md`, `.gitattributes`) come from
`public/grav-commander` and are marked `export-ignore`. They are omitted from
Git/GitHub source archives. No local configs, caches, evidence or private keys
belong in either export input. New package files require an intentional update
to `public/grav-commander/package-files.txt`.

Current immutable-release notes and future direction: [PUBLIC-RELEASE.md](PUBLIC-RELEASE.md).
