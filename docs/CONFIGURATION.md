# Configuration reference

Keep site overrides in `user/config/plugins/grav-commander.yaml`, or use Commander's
**Settings** screen. Defaults ship in [grav-commander.yaml](../grav-commander.yaml).
This follows Grav's [plugin configuration convention](https://learn.getgrav.org/2/plugins/plugin-tutorial).
Return to the [administrator guide](../README.md) for everyday use.

## Common defaults

```yaml
enabled: true
admin:
  show_sidebar: true
max_upload_size: 10485760  # 10 MiB
max_edit_size: 1048576    # 1 MiB
max_operation_files: 10000
max_operation_bytes: 536870912
allow_php_editing: false
allow_recursive_delete: false
auto_backup_on_write: true
permissions:
  allow_chmod: true
backup:
  enabled: true
  path: ../gcmdr_backups
  max_backups: 25
  allow_site_restore: false
```

Operation limits include descendants of selected folders; selection is also limited
to 200 paths. Batches are checked before writing but are not all-or-nothing filesystem
transactions. Failures can leave completed or partially copied items. Chmod has no
rollback. Keep write access limited to trusted users.

`roots` defines the built-in root map. `additional_roots` adds entries or replaces a
matching key. Paths can be relative to the Grav installation or absolute. `/` and
symlink roots are not allowed. Prefer narrow roots; broad server-home access can
reach unrelated sites. PHP and hosting restrictions still apply.

`editable_extensions`, `viewable_extensions` and `blocked_extensions` govern formats.
Blocked types take precedence; do not enable server-side script editing casually.
Size, text-content, root and write-access checks also apply.

## Protected paths

`protected_path_patterns` contains case-insensitive glob patterns matched against
individual components of canonical absolute paths, including alternate root aliases.
The default list is:

```yaml
protected_path_patterns:
  - .ssh
  - .gnupg
  - .git
  - .env
  - .env.*
  - '*.pem'
  - '*.key'
  - .aws
  - .azure
  - .kube
  - .docker
  - .netrc
  - .npmrc
  - .pypirc
  - .htpasswd
  - .git-credentials
```

These are authorization restrictions, independent of Show hidden files. Direct,
recursive and file-backup restore operations enforce them. Full-site backup profiles
have separate backup authority and can include secrets; protect those archives and
the users allowed to download them. Changing this list can expose sensitive data.

## ZIP extraction

```yaml
archive:
  enabled: true
  allow_create: true
  allow_extract: true
  allow_overwrite: false
  backup_before_extract: true
  max_extract_files: 5000
  max_extract_bytes: 209715200
  skip_macos_junk: true
```

Extraction has its own overwrite policy; it does not use the Copy/Move collision
dialog. Keep overwrite off unless deliberately required. Absolute/traversal entries,
symlinks and unsafe destinations are rejected. The macOS setting skips `__MACOSX`,
`.DS_Store` and `._` metadata files.

## Backup storage, names and profiles

Default profiles are `full_site`, `user_folder`, `pages_media` and `config_data`.
Edit the profile's included/excluded paths in Backup Center; names alone do not
prove coverage. Profiles use paths relative to the Grav installation, independently
of the Files tab's additional roots. Backups carry `backup-info.json`; site backups
also carry a manifest. Review metadata and test a restore on staging.

```yaml
backup:
  archive_name_template: gcmdr-[HOST]-[PROFILE]-[DATE]-[TIME_TZ]
  add_random_if_inside_site_root: true
```

The ZIP suffix is added automatically. When storage is inside the site and the name
lacks `[RANDOM]`, the enabled setting adds a random suffix. A random name is not access
control. Commander writes basic `.htaccess` and `index.html` files to storage; these
do not secure every web server. Prefer storage outside all publicly served folders,
or configure explicit server-level denial for Nginx/Caddy/other hosts.

## Schedules and command-line backups

Schedules saved in Backup Center are stored in plugin configuration and mirrored
into `user/config/scheduler.yaml` as jobs beginning `grav-commander-backup-`.
Use a cron expression such as `0 3 * * *` for daily at 03:00 in the scheduler's timezone.
Your host must separately invoke Grav's scheduler, usually every minute:

```cron
* * * * * cd /path/to/grav && bin/grav scheduler 1>> /dev/null 2>&1
```

Replace `/path/to/grav` and use your host's supported PHP/cron setup. Saving a schedule
alone is insufficient. Check scheduler logs and backup timestamps after setup.

From the Grav directory you can also run:

```bash
bin/plugin grav-commander backup --profile=pages_media --reason=manual-cli --note="Before content edits"
```

`--profile` / `-p` defaults to `full_site`; `--reason` / `-r` defaults to `cli`.
`--note` adds an optional description. Scheduled jobs use the same command.

## Jarvis context limits

```yaml
jarvis:
  enabled: true
  max_context_bytes: 49152
  max_large_context_bytes: 196608
```

Commander sends one eligible text buffer, never a whole directory. It blocks sensitive
locations and redacts recognized secrets, but this is not a complete secret scanner.
Read the shown context notices before sending. Read-only analysis can truncate or use
bounded Markdown summarization; rewriting rejects partial/redacted input. Applying a
proposal requires unchanged source and only updates the unsaved buffer. Save remains
explicit and subject to Commander validation and stale-save checks.

Jarvis use requires `grav-commander.browse` and `grav-jarvis.use`; rewriting and Apply
also require `grav-commander.write`. Configure providers in Jarvis, not Commander.
