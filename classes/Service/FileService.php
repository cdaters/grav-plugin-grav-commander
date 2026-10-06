<?php

declare(strict_types=1);

namespace Grav\Plugin\GravCommander\Service;

use Grav\Common\Grav;
use Grav\Plugin\Api\Exceptions\ForbiddenException;
use Grav\Plugin\Api\Exceptions\NotFoundException;
use Grav\Plugin\Api\Exceptions\ValidationException;
use ZipArchive;

class FileService
{
    private Grav $grav;
    private array $config;
    private string $root;

    public function __construct()
    {
        $this->grav = Grav::instance();
        $this->config = (array) $this->grav['config']->get('plugins.grav-commander', []);
        $this->root = rtrim(GRAV_ROOT, '/');
    }

    public function roots(): array
    {
        $roots = [];
        foreach ($this->configuredRoots() as $key => $root) {
            $base = $this->absoluteConfiguredPath((string) ($root['path'] ?? ''));
            $roots[] = [
                'key' => $key,
                'label' => $root['label'] ?? ucfirst($key),
                'path' => $root['path'] ?? '',
                'writable' => (bool) ($root['writable'] ?? false),
                'exists' => is_dir($base),
            ];
        }

        return $roots;
    }

    public function profiles(): array
    {
        return $this->backupProfiles();
    }

    public function saveProfiles(array $profiles): array
    {
        $this->assertBackupEnabled();
        $normalised = $this->normaliseProfiles($profiles);
        if ($normalised === []) {
            throw new ValidationException('At least one backup profile is required.');
        }

        $configFile = $this->userPluginConfigFile();
        $userConfig = $this->readUserPluginConfig($configFile);
        if (!is_array($userConfig)) {
            $userConfig = [];
        }

        if (!isset($userConfig['backup']) || !is_array($userConfig['backup'])) {
            $userConfig['backup'] = [];
        }
        $userConfig['backup']['profiles'] = $normalised;

        $this->ensureDirectory(dirname($configFile));
        $written = file_put_contents($configFile, $this->dumpYaml($userConfig));
        if ($written === false) {
            throw new ValidationException('Unable to write Grav Commander plugin configuration.');
        }

        if (!isset($this->config['backup']) || !is_array($this->config['backup'])) {
            $this->config['backup'] = [];
        }
        $this->config['backup']['profiles'] = $normalised;

        return [
            'message' => 'Backup profiles saved. Clear cache if Admin2 does not pick up the changes immediately.',
            'profiles' => $this->backupProfiles(),
            'config_file' => 'user/config/plugins/grav-commander.yaml',
        ];
    }

    public function schedules(): array
    {
        return [
            'schedules' => $this->backupSchedules(),
            'scheduler' => $this->schedulerStatus(),
            'job_prefix' => $this->schedulerJobPrefix(),
        ];
    }

    public function saveSchedules(array $schedules): array
    {
        $this->assertBackupEnabled();
        $normalised = $this->normaliseSchedules($schedules);

        $configFile = $this->userPluginConfigFile();
        $userConfig = $this->readUserPluginConfig($configFile);
        if (!is_array($userConfig)) {
            $userConfig = [];
        }
        if (!isset($userConfig['backup']) || !is_array($userConfig['backup'])) {
            $userConfig['backup'] = [];
        }
        $userConfig['backup']['schedules'] = $normalised;

        $this->ensureDirectory(dirname($configFile));
        $written = file_put_contents($configFile, $this->dumpYaml($userConfig));
        if ($written === false) {
            throw new ValidationException('Unable to write Grav Commander plugin configuration.');
        }

        if (!isset($this->config['backup']) || !is_array($this->config['backup'])) {
            $this->config['backup'] = [];
        }
        $this->config['backup']['schedules'] = $normalised;

        $this->writeSchedulerJobs($normalised);

        return [
            'message' => 'Backup schedules saved and Grav scheduler jobs updated.',
            'schedules' => $this->backupSchedules(),
            'scheduler' => $this->schedulerStatus(),
            'scheduler_file' => 'user/config/scheduler.yaml',
        ];
    }

    public function saveBackupPath(string $path): array
    {
        $this->assertBackupEnabled();
        $path = trim(str_replace("\0", '', str_replace('\\', '/', $path)));
        if ($path === '') {
            throw new ValidationException('Backup path cannot be blank.');
        }
        foreach (explode('/', str_replace('\\', '/', $path)) as $part) {
            if ($part === '') {
                continue;
            }
            if (str_contains($part, "\0")) {
                throw new ValidationException('Backup path contains invalid characters.');
            }
        }

        $configFile = $this->userPluginConfigFile();
        $userConfig = $this->readUserPluginConfig($configFile);
        if (!is_array($userConfig)) {
            $userConfig = [];
        }
        if (!isset($userConfig['backup']) || !is_array($userConfig['backup'])) {
            $userConfig['backup'] = [];
        }
        $userConfig['backup']['path'] = $path;

        $this->ensureDirectory(dirname($configFile));
        $written = file_put_contents($configFile, $this->dumpYaml($userConfig));
        if ($written === false) {
            throw new ValidationException('Unable to write Grav Commander plugin configuration.');
        }

        if (!isset($this->config['backup']) || !is_array($this->config['backup'])) {
            $this->config['backup'] = [];
        }
        $this->config['backup']['path'] = $path;
        $dir = $this->backupDir();

        return [
            'message' => 'Backup storage path saved.',
            'path' => $path,
            'absolute_path' => $dir,
            'status' => $this->status(),
            'config_file' => 'user/config/plugins/grav-commander.yaml',
        ];
    }

    public function deleteSchedule(string $key): array
    {
        $key = $this->normaliseScheduleKey($key);
        $schedules = $this->backupSchedules();
        if (!isset($schedules[$key])) {
            throw new NotFoundException('Backup schedule not found.');
        }
        unset($schedules[$key]);
        return $this->saveSchedules($schedules);
    }

    public function runSchedule(string $key): array
    {
        $key = $this->normaliseScheduleKey($key);
        $schedules = $this->backupSchedules();
        if (!isset($schedules[$key])) {
            throw new NotFoundException('Backup schedule not found.');
        }
        $schedule = $schedules[$key];
        $profile = (string) ($schedule['profile'] ?? 'full_site');
        $note = trim((string) ($schedule['note'] ?? ''));
        $label = trim((string) ($schedule['label'] ?? $key));
        $reason = 'manual-run-' . $key;

        $backup = $this->backupSite($reason, $profile, $note !== '' ? $note : 'Manual run of schedule: ' . $label);
        return [
            'message' => 'Scheduled backup run completed.',
            'schedule' => $key,
            'backup' => $backup,
        ];
    }

    public function status(): array
    {
        $backupPath = trim(str_replace('\\', '/', (string) ($this->config['backup']['path'] ?? '../gcmdr_backups')));
        $backupDir = $this->absoluteConfiguredPath($backupPath);
        $zipAvailable = class_exists(ZipArchive::class);
        $backupEnabled = (bool) ($this->config['backup']['enabled'] ?? true);
        $backupDirWritable = false;
        $backupDirMessage = 'Not checked.';
        $rootReal = $this->normaliseFilesystemPath(realpath($this->root) ?: $this->root);
        $backupDirCheck = $this->normaliseFilesystemPath(is_dir($backupDir) ? (realpath($backupDir) ?: $backupDir) : (realpath(dirname($backupDir)) ?: dirname($backupDir)) . '/' . basename($backupDir));
        $backupInsideRoot = $backupDirCheck === $rootReal || str_starts_with($backupDirCheck, rtrim($rootReal, '/') . '/');
        $suggestedOutsidePath = dirname($rootReal) . '/gcmdr_backups';
        $htaccessPresent = is_file(rtrim($backupDir, '/') . '/.htaccess');
        $indexPresent = is_file(rtrim($backupDir, '/') . '/index.html');

        try {
            $this->ensureDirectory($backupDir);
            $backupDirWritable = is_writable($backupDir);
            $backupDirCheck = $this->normaliseFilesystemPath(realpath($backupDir) ?: $backupDir);
            $backupInsideRoot = $backupDirCheck === $rootReal || str_starts_with($backupDirCheck, rtrim($rootReal, '/') . '/');
            $htaccessPresent = is_file(rtrim($backupDir, '/') . '/.htaccess');
            $indexPresent = is_file(rtrim($backupDir, '/') . '/index.html');
            $backupDirMessage = $backupDirWritable ? 'Backup directory is writable.' : 'Backup directory exists but is not writable.';
        } catch (\Throwable $e) {
            $backupDirMessage = $e->getMessage();
        }

        return [
            'plugin_version' => '0.4.0',
            'backup' => [
                'enabled' => $backupEnabled,
                'path' => $backupPath,
                'absolute_path' => $backupDirCheck,
                'site_root' => $rootReal,
                'suggested_outside_path' => $suggestedOutsidePath,
                'inside_site_root' => $backupInsideRoot,
                'recommended_outside_site_root' => true,
                'web_protection_present' => $htaccessPresent && $indexPresent,
                'zip_available' => $zipAvailable,
                'backup_dir_exists' => is_dir($backupDir),
                'backup_dir_writable' => $backupDirWritable,
                'backup_dir_message' => $backupDirMessage,
                'auto_backup_on_write' => (bool) ($this->config['auto_backup_on_write'] ?? true),
                'allow_site_restore' => (bool) ($this->config['backup']['allow_site_restore'] ?? false),
                'max_backups' => (int) ($this->config['backup']['max_backups'] ?? 25),
                'default_include_paths' => $this->siteIncludePaths(),
                'default_exclude_prefixes' => $this->siteExcludePrefixes(),
            ],
            'archive' => [
                'enabled' => (bool) ($this->config['archive']['enabled'] ?? true),
                'allow_create' => (bool) ($this->config['archive']['allow_create'] ?? true),
                'allow_extract' => (bool) ($this->config['archive']['allow_extract'] ?? true),
                'allow_overwrite' => (bool) ($this->config['archive']['allow_overwrite'] ?? false),
                'backup_before_extract' => (bool) ($this->config['archive']['backup_before_extract'] ?? true),
                'max_extract_files' => (int) ($this->config['archive']['max_extract_files'] ?? 5000),
                'max_extract_bytes' => (int) ($this->config['archive']['max_extract_bytes'] ?? 209715200),
                'formats' => ['zip'],
            ],
            'profiles' => $this->backupProfiles(),
            'schedules' => $this->backupSchedules(),
            'scheduler' => $this->schedulerStatus(),
            'roots' => $this->roots(),
            'checks' => [
                ['label' => 'PHP ZipArchive', 'ok' => $zipAvailable, 'message' => $zipAvailable ? 'Available.' : 'Missing. Install/enable the PHP zip extension.'],
                ['label' => 'Backup tools', 'ok' => $backupEnabled, 'message' => $backupEnabled ? 'Enabled.' : 'Disabled in plugin configuration.'],
                ['label' => 'Backup directory', 'ok' => $backupDirWritable, 'message' => $backupDirMessage],
                ['label' => 'Backup path outside site root', 'ok' => !$backupInsideRoot, 'message' => $backupInsideRoot ? 'Backup path is inside the Grav/site root. Consider moving it outside the public site tree.' : 'Backup path is outside the Grav/site root.'],
                ['label' => 'Basic web protection files', 'ok' => $htaccessPresent && $indexPresent, 'message' => ($htaccessPresent && $indexPresent) ? '.htaccess and index.html are present.' : 'Missing .htaccess or index.html in the backup folder.'],
                ['label' => 'Full-site restore', 'ok' => (bool) ($this->config['backup']['allow_site_restore'] ?? false), 'message' => ($this->config['backup']['allow_site_restore'] ?? false) ? 'Enabled. Use carefully.' : 'Disabled by default. Good.'],
                ['label' => 'Archive tools', 'ok' => (bool) ($this->config['archive']['enabled'] ?? true), 'message' => ($this->config['archive']['enabled'] ?? true) ? 'ZIP create/extract tools enabled.' : 'Disabled in plugin configuration.'],
            ],
        ];
    }

    public function list(string $root, string $path = ''): array
    {
        $abs = $this->resolve($root, $path, true);
        if (!is_dir($abs)) {
            throw new ValidationException('Path is not a directory.');
        }

        $items = [];
        $entries = scandir($abs) ?: [];
        foreach ($entries as $entry) {
            if ($entry === '.' || $entry === '..') {
                continue;
            }

            $full = $abs . '/' . $entry;
            $relative = $this->joinRelative($path, $entry);
            if (is_link($full) || (!is_dir($full) && !is_file($full))) continue;
            $isDir = is_dir($full);
            $items[] = [
                'identity' => $this->identity($full),
                'name' => $entry,
                'path' => $relative,
                'type' => $isDir ? 'dir' : 'file',
                'extension' => $isDir ? '' : strtolower(pathinfo($entry, PATHINFO_EXTENSION)),
                'size' => $isDir ? null : (int) @filesize($full),
                'modified' => (int) @filemtime($full),
                'readable' => is_readable($full),
                'writable' => is_writable($full) && $this->isRootWritable($root),
                'editable' => (!$isDir && $this->isEditable($full) && $this->isRootWritable($root) && is_writable($full)),
                'viewable' => (!$isDir && $this->isViewable($full)),
                'archive' => (!$isDir && $this->isArchive($full)),
                'extractable' => (!$isDir && $this->isArchive($full) && $this->isRootWritable($root)),
            ];
        }

        usort($items, static function (array $a, array $b): int {
            if ($a['type'] !== $b['type']) {
                return $a['type'] === 'dir' ? -1 : 1;
            }
            return strcasecmp((string) $a['name'], (string) $b['name']);
        });

        return [
            'root' => $root,
            'path' => $this->sanitizeRelative($path),
            'parent' => $this->parentRelative($path),
            'items' => $items,
        ];
    }

    public function read(string $root, string $path): array
    {
        $abs = $this->resolve($root, $path, true);
        if (!is_file($abs)) {
            throw new ValidationException('Path is not a file.');
        }
        $editable = $this->isEditable($abs) && $this->isRootWritable($root) && is_writable($abs);
        if (!$this->isViewable($abs)) {
            throw new ForbiddenException('This file type is not viewable by Grav Commander. Add the extension to viewable_extensions if you trust it.');
        }

        $max = (int) ($this->config['max_edit_size'] ?? 1048576);
        $size = (int) @filesize($abs);
        if ($size > $max) {
            throw new ValidationException('File is larger than the configured view/edit size limit.');
        }

        $content = file_get_contents($abs);
        if ($content === false) {
            throw new ValidationException('Unable to read file.');
        }

        return [
            'root' => $root,
            'path' => $this->sanitizeRelative($path),
            'name' => basename($abs),
            'extension' => strtolower(pathinfo($abs, PATHINFO_EXTENSION)),
            'size' => $size,
            'modified' => (int) @filemtime($abs),
            'editable' => $editable,
            'viewable' => true,
            'read_only' => !$editable,
            'content' => $content,
            'revision' => hash('sha256', $content),
            'identity' => $this->identity($abs),
        ];
    }


    public function fileForDownload(string $root, string $path): array
    {
        $abs = $this->resolve($root, $path, true);
        if (!is_file($abs) || !is_readable($abs)) {
            throw new ValidationException('Path is not a readable file.');
        }
        return [
            'absolute' => $abs,
            'name' => basename($abs),
            'size' => (int) @filesize($abs),
            'mime' => function_exists('mime_content_type') ? (mime_content_type($abs) ?: 'application/octet-stream') : 'application/octet-stream',
        ];
    }

    public function write(string $root, string $path, string $content, ?string $revision = null): array
    {
        $this->assertRootWritable($root);
        $abs = $this->resolve($root, $path, false);
        $this->assertEditablePath($abs);
        $this->validateContent($path, $content);
        $this->ensureDirectory(dirname($abs));
        $lock = fopen(sys_get_temp_dir() . '/grav-commander-save-' . hash('sha256', $abs) . '.lock', 'c');
        if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) throw new ValidationException('Another save is in progress.');
        $temporary = null;
        try {
            if ($revision !== null && (!is_file($abs) || !hash_equals($revision, hash_file('sha256', $abs)))) {
                throw new ValidationException('File changed on disk. Reload and review before saving.');
            }
            if (is_file($abs) && !is_writable($abs)) throw new ForbiddenException('File is not writable.');
            if (file_exists($abs) && $this->autoBackup()) $this->backupPath($root, $path, 'pre-save');
            $temporary = tempnam(dirname($abs), '.commander-save-');
            if (!$temporary || file_put_contents($temporary, $content) !== strlen($content)) throw new ValidationException('Unable to write complete file.');
            chmod($temporary, is_file($abs) ? (fileperms($abs) & 0777) : 0664);
            // Check again immediately before promotion, including external editors.
            $this->resolve($root, $path, false);
            if ($revision !== null && (!is_file($abs) || !hash_equals($revision, hash_file('sha256', $abs)))) throw new ValidationException('File changed during save. Reload and review.');
            if (!rename($temporary, $abs)) throw new ValidationException('Unable to replace file.');
            $temporary = null;
            return ['message' => 'File saved.', 'root' => $root, 'path' => $this->sanitizeRelative($path), 'bytes' => strlen($content), 'revision' => hash('sha256', $content)];
        } finally {
            if ($temporary && is_file($temporary)) @unlink($temporary);
            flock($lock, LOCK_UN); fclose($lock);
        }
    }


    /** Semantic labels are derived from physical Grav locations, never from a user root alias. */
    private function identity(string $absolute): array
    {
        $pages = realpath($this->root . '/user/pages');
        if ($pages && str_starts_with($absolute, $pages . '/')) {
            $relative = substr($absolute, strlen($pages) + 1);
            if (is_file($absolute) && preg_match('/\.(md|markdown)$/i', $absolute) && str_contains($relative, '/')) {
                $route = preg_replace('/(^|\/)\d+\./', '$1', dirname($relative));
                return ['kind' => 'Grav page', 'page_route' => $route];
            }
            return ['kind' => is_dir($absolute) ? 'Page folder · includes media' : 'Page media'];
        }
        foreach (['plugins' => 'Plugin package', 'themes' => 'Theme package', 'config' => 'Grav configuration'] as $dir => $label) {
            if (str_starts_with($absolute, $this->root . '/user/' . $dir . '/')) return ['kind' => $label];
        }
        return ['kind' => is_dir($absolute) ? 'Folder' : strtoupper(pathinfo($absolute, PATHINFO_EXTENSION)) . ' file'];
    }

    public function validateContent(string $path, string $content): array
    {
        if (strlen($content) > (int) ($this->config['max_edit_size'] ?? 1048576)) throw new ValidationException('Content exceeds the edit size limit.');
        try {
            $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
            if (in_array($ext, ['yaml', 'yml'], true)) \Symfony\Component\Yaml\Yaml::parse($content);
            if ($ext === 'json') json_decode($content, true, 512, JSON_THROW_ON_ERROR);
            if (in_array($ext, ['md', 'markdown'], true) && preg_match('/\A---\R(.*?)\R---(?:\R|$)/s', $content, $match)) {
                \Symfony\Component\Yaml\Yaml::parse($match[1]);
            }
        } catch (\Throwable $error) {
            throw new ValidationException('Invalid document: ' . $error->getMessage());
        }
        return ['message' => 'Document validation passed.'];
    }

    public function createFile(string $root, string $path, string $name): array
    {
        $this->assertRootWritable($root);
        $parent = $this->resolve($root, $path, true);
        if (!is_dir($parent)) throw new ValidationException('Parent is not a directory.');
        $relative = $this->joinRelative($path, $this->sanitizeName($name));
        $abs = $this->resolve($root, $relative, false);
        $this->assertEditablePath($abs);
        $content = strtolower(pathinfo($abs, PATHINFO_EXTENSION)) === 'json' ? "{}\n" : '';
        $stream = @fopen($abs, 'x');
        if (!$stream) throw new ValidationException('File already exists or cannot be created.');
        fwrite($stream, $content); fclose($stream);
        return ['message' => 'File created.', 'path' => $relative];
    }

    private function assertZipEntryType(ZipArchive $zip, int $index): void
    {
        $opsys = 0; $attributes = 0;
        if ($zip->getExternalAttributesIndex($index, $opsys, $attributes) && $opsys === 3) {
            $type = ($attributes >> 16) & 0170000;
            if (!in_array($type, [0, 0100000, 0040000], true)) throw new ForbiddenException('ZIP contains a symlink or special file.');
        }
    }

    public function inspectArchive(string $root, string $path): array
    {
        $this->assertArchiveAllowed('inspect');
        $abs = $this->resolve($root, $path, true);
        if (!$this->isArchive($abs)) throw new ValidationException('Select a ZIP archive.');
        $zip = new ZipArchive();
        if ($zip->open($abs) !== true) throw new ValidationException('Unable to open ZIP.');
        try {
            $max = max(1, (int) ($this->config['archive']['max_extract_files'] ?? 5000));
            if ($zip->numFiles > $max) throw new ValidationException('ZIP entry limit exceeded.');
            $entries = []; $bytes = 0;
            for ($i = 0; $i < $zip->numFiles; $i++) {
                $stat = $zip->statIndex($i);
                $this->assertZipEntryType($zip, $i);
                $safe = $this->safeArchiveEntryName($stat['name']);
                $bytes += (int) $stat['size'];
                if ($bytes > (int) ($this->config['archive']['max_extract_bytes'] ?? 209715200)) throw new ValidationException('ZIP uncompressed size limit exceeded.');
                if ($safe !== null) $entries[] = ['name' => $safe, 'size' => (int) $stat['size']];
            }
            return ['entries' => $entries, 'bytes' => $bytes];
        } finally { $zip->close(); }
    }

    private function operationSource(string $root, string $path): string
    {
        if ($this->sanitizeRelative($path) === '') throw new ForbiddenException('Operating on an entire configured root is not allowed.');
        $abs = $this->resolve($root, $path, true);
        $count = 0; $bytes = 0;
        $this->inspectTree($abs, $count, $bytes);
        return $abs;
    }

    private function inspectTree(string $abs, int &$count, int &$bytes): void
    {
        if (is_link($abs) || (!is_file($abs) && !is_dir($abs))) throw new ForbiddenException('Symlinks and special files are not supported.');
        if (++$count > (int) ($this->config['max_operation_files'] ?? 10000)) throw new ValidationException('Operation file limit exceeded. Split the selection.');
        if (!is_readable($abs)) throw new ForbiddenException('Selection contains an unreadable item.');
        if (is_file($abs)) {
            $bytes += (int) filesize($abs);
            if ($bytes > (int) ($this->config['max_operation_bytes'] ?? 536870912)) throw new ValidationException('Operation byte limit exceeded. Split the selection.');
        } else {
            foreach (scandir($abs) ?: [] as $entry) {
                if ($entry !== '.' && $entry !== '..') $this->inspectTree($abs . '/' . $entry, $count, $bytes);
            }
        }
    }

    /** One bounded request; preflight the entire selection before the first mutation.
     * Filesystem operations are not transactions: return exact completed/failed paths on I/O failure.
     */
    public function operate(array $body): array
    {
        $operation = (string) ($body['operation'] ?? '');
        if (!in_array($operation, ['copy', 'move', 'delete', 'zip'], true)) throw new ValidationException('Unknown operation.');
        $paths = $body['paths'] ?? null;
        if (!is_array($paths) || !$paths || count($paths) > 200) throw new ValidationException('Select between 1 and 200 items.');
        $root = (string) ($body['root'] ?? '');
        $destRoot = (string) ($body['dest_root'] ?? $root);
        $destPath = (string) ($body['dest_path'] ?? '');
        $lock = fopen(sys_get_temp_dir() . '/grav-commander-' . hash('sha256', $this->root) . '.lock', 'c');
        if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) throw new ValidationException('Another Commander batch is running.');
        try {
            if ($operation !== 'copy') $this->assertRootWritable($root);
            if ($operation !== 'delete') {
                $this->assertRootWritable($destRoot);
                $dest = $this->resolve($destRoot, $destPath, true);
                if (!is_dir($dest)) throw new ValidationException('Destination must be an existing folder.');
            }
            $tasks = []; $seen = []; $names = []; $count = 0; $bytes = 0;
            foreach ($paths as $path) {
                if (!is_string($path) || $this->sanitizeRelative($path) === '') throw new ValidationException('Invalid selected path.');
                $path = $this->sanitizeRelative($path);
                $src = $this->resolve($root, $path, true);
                foreach ($seen as $other) {
                    if ($src === $other || str_starts_with($src . '/', $other . '/') || str_starts_with($other . '/', $src . '/')) throw new ValidationException('Selection contains duplicate or overlapping paths.');
                }
                $seen[] = $src;
                $this->inspectTree($src, $count, $bytes);
                $name = basename($src);
                if ($operation !== 'delete') {
                    if ($dest === $src || str_starts_with($dest . '/', $src . '/')) throw new ValidationException('Destination cannot be inside a selected folder.');
                    if (isset($names[$name])) throw new ValidationException('Selected items have conflicting names.');
                    $names[$name] = true;
                }
                if ($operation === 'delete' && is_dir($src) && !$this->isDirectoryEmpty($src) && !($this->config['allow_recursive_delete'] ?? false)) throw new ValidationException('Recursive folder deletion is disabled.');
                $to = $this->joinRelative($destPath, $name);
                if (in_array($operation, ['copy', 'move'], true)) {
                    $target = $this->resolve($destRoot, $to, false);
                    if (file_exists($target) || is_link($target)) throw new ValidationException('Destination already exists: ' . $to);
                }
                $tasks[] = ['path' => $path, 'src' => $src, 'to' => $to, 'name' => $name];
            }
            if ($operation === 'zip') {
                $this->assertArchiveAllowed('create');
                $name = $this->sanitizeName((string) ($body['name'] ?? 'selection.zip'));
                if (!str_ends_with(strtolower($name), '.zip')) $name .= '.zip';
                $path = $this->joinRelative($destPath, $name);
                $target = $this->resolve($destRoot, $path, false);
                if (file_exists($target)) throw new ValidationException('Archive already exists.');
                $zip = new ZipArchive();
                if ($zip->open($target, ZipArchive::CREATE | ZipArchive::EXCL) !== true) throw new ValidationException('Cannot create archive.');
                try {
                    foreach ($tasks as $task) $this->addPathToZip($zip, $task['src'], $task['name']);
                    if (!$zip->close()) throw new ValidationException('Cannot finish archive.');
                } catch (\Throwable $error) { @unlink($target); throw $error; }
                return ['message' => 'Selection archived.', 'path' => $path, 'root' => $destRoot, 'completed' => $paths, 'failed' => []];
            }
            $completed = []; $failed = [];
            foreach ($tasks as $task) {
                try {
                    if ($operation === 'delete') $this->delete($root, $task['path']);
                    else $this->$operation($root, $task['path'], $destRoot, $task['to']);
                    $completed[] = $task['path'];
                } catch (\Throwable $error) {
                    $failed[] = ['path' => $task['path'], 'message' => $error->getMessage()];
                    break;
                }
            }
            return ['message' => count($completed) . ' of ' . count($tasks) . ' items completed.', 'completed' => $completed, 'failed' => $failed, 'pending' => array_slice($paths, count($completed) + count($failed))];
        } finally { flock($lock, LOCK_UN); fclose($lock); }
    }

    public function mkdir(string $root, string $path, string $name): array
    {
        $this->assertRootWritable($root);
        $name = $this->sanitizeName($name);
        $parent = $this->resolve($root, $path, true);
        if (!is_dir($parent)) {
            throw new ValidationException('Parent is not a directory.');
        }

        $target = $parent . '/' . $name;
        $this->assertInsideRoot($root, $target);
        if (file_exists($target)) {
            throw new ValidationException('A file or folder with that name already exists.');
        }
        if (!mkdir($target, 0775, true) && !is_dir($target)) {
            throw new ValidationException('Unable to create folder.');
        }

        return ['message' => 'Folder created.', 'path' => $this->joinRelative($path, $name)];
    }

    public function upload(string $root, string $path, object $uploadedFile): array
    {
        $this->assertRootWritable($root);
        $dir = $this->resolve($root, $path, true);
        if (!is_dir($dir)) {
            throw new ValidationException('Upload target is not a directory.');
        }

        $clientName = method_exists($uploadedFile, 'getClientFilename') ? (string) $uploadedFile->getClientFilename() : 'upload.bin';
        $name = $this->sanitizeName($clientName);
        $target = $dir . '/' . $name;
        $this->assertInsideRoot($root, $target);
        $this->assertAllowedUpload($target);

        $max = (int) ($this->config['max_upload_size'] ?? 10485760);
        $size = method_exists($uploadedFile, 'getSize') ? (int) $uploadedFile->getSize() : 0;
        if ($size > $max) {
            throw new ValidationException('Upload exceeds the configured size limit.');
        }

        if (file_exists($target) && $this->autoBackup()) {
            $this->backupPath($root, $this->joinRelative($path, $name), 'pre-upload');
        }

        if (method_exists($uploadedFile, 'moveTo')) {
            $uploadedFile->moveTo($target);
        } else {
            throw new ValidationException('Unsupported uploaded file object.');
        }

        return ['message' => 'File uploaded.', 'path' => $this->joinRelative($path, $name), 'size' => $size];
    }

    public function archiveZip(string $root, string $path, string $name = ''): array
    {
        $this->assertArchiveAllowed('create');
        $this->assertRootWritable($root);
        $abs = $this->resolve($root, $path, true);
        if (!is_readable($abs)) {
            throw new ValidationException('Selected item is not readable.');
        }
        if ($this->sanitizeRelative($path) === '') {
            throw new ValidationException('Choose a file or folder to zip. Zipping the root itself is intentionally disabled.');
        }

        $parentRel = $this->parentRelative($path);
        $base = basename($abs);
        $zipName = trim($name) !== '' ? $this->sanitizeName($name) : $this->defaultArchiveName($base);
        if (strtolower(pathinfo($zipName, PATHINFO_EXTENSION)) !== 'zip') {
            $zipName .= '.zip';
        }

        $destRel = $this->joinRelative($parentRel, $zipName);
        $dest = $this->resolve($root, $destRel, false);
        $this->assertInsideRoot($root, $dest);
        if (file_exists($dest)) {
            throw new ValidationException('Destination ZIP already exists. Rename or delete it first.');
        }

        $zip = new ZipArchive();
        if ($zip->open($dest, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
            throw new ValidationException('Unable to create ZIP archive.');
        }

        $stats = ['files' => 0, 'dirs' => 0, 'bytes' => 0, 'skipped' => 0];
        $this->addPathToZip($zip, $abs, $base, false, $stats);
        $zip->close();

        return [
            'message' => 'ZIP archive created.',
            'root' => $root,
            'path' => $this->sanitizeRelative($destRel),
            'name' => basename($dest),
            'size' => (int) @filesize($dest),
            'stats' => $stats,
        ];
    }

    public function extractArchive(string $root, string $path, string $destPath = '', bool $overwrite = false): array
    {
        $this->assertArchiveAllowed('extract');
        $this->assertRootWritable($root);

        $zipPath = $this->resolve($root, $path, true);
        if (!is_file($zipPath) || !$this->isArchive($zipPath)) {
            throw new ValidationException('Only ZIP archives can be extracted right now.');
        }

        if ($overwrite && !($this->config['archive']['allow_overwrite'] ?? false)) {
            throw new ForbiddenException('ZIP extraction overwrite is disabled in plugin configuration.');
        }

        $destRel = trim($destPath) !== '' ? $this->sanitizeRelative($destPath) : $this->parentRelative($path);
        $destDir = $this->resolve($root, $destRel, false);
        $this->assertInsideRoot($root, $destDir . '/_check');
        $this->ensureDirectory($destDir);

        $zip = new ZipArchive();
        if ($zip->open($zipPath) !== true) {
            throw new ValidationException('Unable to open ZIP archive.');
        }

        $maxFiles = max(1, (int) ($this->config['archive']['max_extract_files'] ?? 5000));
        $maxBytes = max(1024, (int) ($this->config['archive']['max_extract_bytes'] ?? 209715200));
        $tasks = [];
        $conflicts = [];
        $totalBytes = 0;
        $skipped = 0;

        for ($i = 0; $i < $zip->numFiles; $i++) {
            $stat = $zip->statIndex($i);
            $entryName = (string) ($stat['name'] ?? '');
            $this->assertZipEntryType($zip, $i);
            if ($i >= $maxFiles) throw new ValidationException('ZIP entry limit exceeded.');
            $safe = $this->safeArchiveEntryName($entryName);
            if ($safe === null) {
                $skipped++;
                continue;
            }

            $isDir = str_ends_with($entryName, '/');
            $target = rtrim($destDir, '/') . '/' . $safe;
            $this->assertInsideBase($this->rootBase($root), $target, false);

            if ($isDir && is_file($target)) {
                $zip->close();
                throw new ValidationException('Extracted folder would overwrite an existing file: ' . $this->relativeToRootBase($root, $target));
            }

            if (!$isDir && is_dir($target)) {
                $zip->close();
                throw new ValidationException('Extracted file would overwrite an existing folder: ' . $this->relativeToRootBase($root, $target));
            }

            if (!$isDir) {
                $this->assertAllowedUpload($target);
                $this->resolve($root, $this->relativeToRootBase($root, $target), false);
                $totalBytes += (int) ($stat['size'] ?? 0);
                if (count($tasks) + 1 > $maxFiles) {
                    $zip->close();
                    throw new ValidationException('ZIP contains more files than the configured extraction limit.');
                }
                if ($totalBytes > $maxBytes) {
                    $zip->close();
                    throw new ValidationException('ZIP uncompressed size exceeds the configured extraction limit.');
                }
                if (file_exists($target) && !$overwrite) {
                    $conflicts[] = $this->relativeToRootBase($root, $target);
                }
            }

            $tasks[] = ['index' => $i, 'name' => $entryName, 'safe' => $safe, 'target' => $target, 'dir' => $isDir];
        }

        if ($conflicts !== []) {
            $zip->close();
            throw new ValidationException('Extraction would overwrite existing files. Enable overwrite or extract into another folder. First conflicts: ' . implode(', ', array_slice($conflicts, 0, 8)));
        }

        $written = 0;
        $dirs = 0;
        foreach ($tasks as $task) {
            $target = (string) $task['target'];
            if ($task['dir']) {
                $this->ensureDirectory($target);
                $dirs++;
                continue;
            }

            if (file_exists($target) && $overwrite && ($this->config['archive']['backup_before_extract'] ?? true) && $this->autoBackup()) {
                $this->backupPath($root, $this->relativeToRootBase($root, $target), 'pre-extract');
            }

            $this->ensureDirectory(dirname($target));
            $stream = $zip->getStream((string) $task['name']);
            if (!$stream) {
                $skipped++;
                continue;
            }
            $out = fopen($target, 'wb');
            if (!$out) {
                fclose($stream);
                $zip->close();
                throw new ValidationException('Unable to write extracted file: ' . $this->relativeToRootBase($root, $target));
            }
            stream_copy_to_stream($stream, $out);
            fclose($out);
            fclose($stream);
            $written++;
        }

        $zip->close();

        return [
            'message' => 'ZIP archive extracted.',
            'root' => $root,
            'path' => $destRel,
            'files' => $written,
            'dirs' => $dirs,
            'bytes' => $totalBytes,
            'skipped' => $skipped,
            'overwrite' => $overwrite,
        ];
    }

    public function rename(string $root, string $path, string $name): array
    {
        $this->assertRootWritable($root);
        $src = $this->operationSource($root, $path);
        $name = $this->sanitizeName($name);
        $dst = dirname($src) . '/' . $name;
        $this->assertInsideRoot($root, $dst);
        if ($dst === $src || str_starts_with($dst . '/', $src . '/')) {
            throw new ValidationException('Destination cannot be inside the source.');
        }
        if (file_exists($dst) || is_link($dst)) {
            throw new ValidationException('Destination already exists.');
        }
        if ($this->autoBackup()) {
            $this->backupPath($root, $path, 'pre-rename');
        }
        if (!rename($src, $dst)) {
            throw new ValidationException('Unable to rename item.');
        }

        return ['message' => 'Item renamed.', 'path' => $this->joinRelative($this->parentRelative($path), $name)];
    }

    public function copy(string $root, string $path, string $destRoot, string $destPath): array
    {
        $this->assertRootWritable($destRoot);
        $src = $this->operationSource($root, $path);
        $dst = $this->resolve($destRoot, $destPath, false);
        if ($dst === $src || str_starts_with($dst . '/', $src . '/')) {
            throw new ValidationException('Destination cannot be inside the source.');
        }
        if (file_exists($dst) || is_link($dst)) {
            throw new ValidationException('Destination already exists.');
        }
        if ($this->autoBackup() && file_exists($dst)) {
            $this->backupPath($destRoot, $destPath, 'pre-copy');
        }
        $this->copyRecursive($src, $dst);
        return ['message' => 'Item copied.', 'path' => $this->sanitizeRelative($destPath)];
    }

    public function move(string $root, string $path, string $destRoot, string $destPath): array
    {
        $this->assertRootWritable($root);
        $this->assertRootWritable($destRoot);
        $src = $this->operationSource($root, $path);
        $dst = $this->resolve($destRoot, $destPath, false);
        if ($dst === $src || str_starts_with($dst . '/', $src . '/')) {
            throw new ValidationException('Destination cannot be inside the source.');
        }
        if (file_exists($dst) || is_link($dst)) {
            throw new ValidationException('Destination already exists.');
        }
        if ($this->autoBackup()) {
            $this->backupPath($root, $path, 'pre-move');
        }
        $this->ensureDirectory(dirname($dst));
        if (!rename($src, $dst)) {
            $this->copyRecursive($src, $dst);
            $this->deletePath($src);
        }
        return ['message' => 'Item moved.', 'path' => $this->sanitizeRelative($destPath)];
    }

    public function delete(string $root, string $path): array
    {
        $this->assertRootWritable($root);
        $abs = $this->operationSource($root, $path);
        if ($this->autoBackup()) {
            $this->backupPath($root, $path, 'pre-delete');
        }
        if (is_dir($abs) && !$this->isDirectoryEmpty($abs) && !($this->config['allow_recursive_delete'] ?? false)) {
            throw new ValidationException('Folder is not empty. Enable recursive delete in plugin config to allow this.');
        }
        $this->deletePath($abs);
        return ['message' => 'Item deleted.'];
    }

    public function backupPath(string $root, string $path, string $reason = 'manual'): array
    {
        $this->assertBackupEnabled();
        $abs = $this->resolve($root, $path, true);
        $name = $this->backupFilename('file', $reason, $root, $path);
        $zipPath = $this->backupDir() . '/' . $name;
        $zip = $this->openZip($zipPath);

        $meta = [
            'plugin' => 'grav-commander',
            'version' => '0.4.0',
            'scope' => 'file',
            'reason' => $reason,
            'root' => $root,
            'path' => $this->sanitizeRelative($path),
            'payload_base' => basename($abs),
            'is_dir' => is_dir($abs),
            'created' => date('c'),
        ];
        $zip->addFromString('backup-info.json', json_encode($meta, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
        $this->addPathToZip($zip, $abs, 'payload/' . basename($abs));
        $zip->close();
        $this->pruneBackups();

        return $this->backupInfo($zipPath);
    }

    public function backupSite(string $reason = 'manual', string $profileKey = 'full_site', string $note = ''): array
    {
        $this->assertBackupEnabled();
        $profile = $this->backupProfile($profileKey);
        $name = $this->backupFilename('site', $reason, 'site', '', $profileKey);
        $zipPath = $this->backupDir() . '/' . $name;
        $zip = $this->openZip($zipPath);
        $stats = ['files' => 0, 'dirs' => 0, 'bytes' => 0, 'skipped' => 0];

        foreach ($this->siteIncludePaths($profileKey) as $relative) {
            $relative = trim((string) $relative, '/');
            $abs = ($relative === '' || $relative === '.') ? $this->root : $this->root . '/' . $relative;
            if (!file_exists($abs)) {
                $stats['skipped']++;
                continue;
            }
            $zipBase = ($relative === '' || $relative === '.') ? 'site' : 'site/' . $relative;
            $this->addPathToZip($zip, $abs, $zipBase, true, $stats, $profileKey);
        }

        $meta = [
            'plugin' => 'grav-commander',
            'version' => '0.4.0',
            'scope' => 'site',
            'reason' => $reason,
            'profile' => $profileKey,
            'profile_label' => $profile['label'] ?? $profileKey,
            'note' => trim($note),
            'created' => date('c'),
            'include_paths' => $this->siteIncludePaths($profileKey),
            'exclude_prefixes' => $this->siteExcludePrefixes($profileKey),
            'stats' => $stats,
        ];
        $zip->addFromString('backup-info.json', json_encode($meta, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
        $zip->addFromString('manifest.json', json_encode([
            'generated' => date('c'),
            'stats' => $stats,
            'profile' => $profileKey,
            'include_paths' => $this->siteIncludePaths($profileKey),
            'exclude_prefixes' => $this->siteExcludePrefixes($profileKey),
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));

        $zip->close();
        $this->pruneBackups();

        return $this->backupInfo($zipPath);
    }

    public function backups(): array
    {
        $dir = $this->backupDir();
        $files = glob($dir . '/*.zip') ?: [];
        $items = [];
        foreach ($files as $file) {
            $items[] = $this->backupInfo($file);
        }
        usort($items, static fn (array $a, array $b): int => ((int) $b['modified']) <=> ((int) $a['modified']));
        return $items;
    }

    public function backupFilePath(string $name): string
    {
        $name = $this->sanitizeBackupName($name);
        $path = $this->backupDir() . '/' . $name;
        if (!is_file($path)) {
            throw new NotFoundException('Backup not found.');
        }
        return $path;
    }



    public function createBackupDownloadToken(string $name, int $ttl = 180): array
    {
        $path = $this->backupFilePath($name);
        $ttl = max(30, min(900, $ttl));
        $now = time();
        $token = bin2hex(random_bytes(24));
        $tokens = $this->readDownloadTokens();

        foreach ($tokens as $key => $record) {
            if (!is_array($record) || (int) ($record['expires'] ?? 0) <= $now) {
                unset($tokens[$key]);
            }
        }

        $tokens[$token] = [
            'scope' => 'backup',
            'name' => basename($path),
            'created' => $now,
            'expires' => $now + $ttl,
        ];
        $this->writeDownloadTokens($tokens);

        return [
            'message' => 'Temporary download link created.',
            'token' => $token,
            'name' => basename($path),
            'size' => (int) @filesize($path),
            'expires_in' => $ttl,
            'expires_at' => date('c', $now + $ttl),
        ];
    }

    public function consumeBackupDownloadToken(string $token): array
    {
        $token = trim($token);
        if (!preg_match('/^[a-f0-9]{48}$/', $token)) {
            throw new ForbiddenException('Invalid or expired download token.');
        }

        $tokens = $this->readDownloadTokens();
        $record = $tokens[$token] ?? null;
        if (!is_array($record)) {
            throw new ForbiddenException('Invalid or expired download token.');
        }

        unset($tokens[$token]);
        $this->writeDownloadTokens($tokens);

        if ((int) ($record['expires'] ?? 0) < time()) {
            throw new ForbiddenException('Download token has expired.');
        }
        if (($record['scope'] ?? '') !== 'backup') {
            throw new ForbiddenException('Download token is not valid for backups.');
        }

        $path = $this->backupFilePath((string) ($record['name'] ?? ''));
        return [
            'absolute' => $path,
            'name' => basename($path),
            'size' => (int) @filesize($path),
            'mime' => 'application/zip',
        ];
    }

    public function deleteBackup(string $name): array
    {
        $path = $this->backupFilePath($name);
        if (!unlink($path)) {
            throw new ValidationException('Unable to delete backup.');
        }
        return ['message' => 'Backup deleted.'];
    }

    public function restore(string $name, bool $confirm = false): array
    {
        $this->assertBackupEnabled();
        if (!$confirm) {
            throw new ValidationException('Restore requires confirm=true.');
        }

        $zipPath = $this->backupFilePath($name);
        $zip = new ZipArchive();
        if ($zip->open($zipPath) !== true) {
            throw new ValidationException('Unable to open backup.');
        }

        $metaRaw = $zip->getFromName('backup-info.json');
        $meta = $metaRaw ? json_decode($metaRaw, true) : null;
        if (!is_array($meta)) {
            $zip->close();
            throw new ValidationException('Backup metadata is missing or invalid.');
        }

        $scope = $meta['scope'] ?? null;
        if ($scope === 'file') {
            $result = $this->restoreFileBackup($zip, $meta);
            $zip->close();
            return $result;
        }

        if ($scope === 'site') {
            if (!($this->config['backup']['allow_site_restore'] ?? false)) {
                $zip->close();
                throw new ForbiddenException('Full-site restore is disabled in plugin configuration.');
            }
            $result = $this->restoreSiteBackup($zip);
            $zip->close();
            return $result;
        }

        $zip->close();
        throw new ValidationException('Unsupported backup scope.');
    }

    private function restoreFileBackup(ZipArchive $zip, array $meta): array
    {
        $root = (string) ($meta['root'] ?? '');
        $path = (string) ($meta['path'] ?? '');
        $payloadBase = (string) ($meta['payload_base'] ?? basename($path));
        $target = $this->resolve($root, $path, false);
        $this->assertRootWritable($root);

        if (file_exists($target)) {
            $this->backupPath($root, $path, 'pre-restore');
            $this->deletePath($target);
        }
        $this->ensureDirectory(dirname($target));

        $prefix = 'payload/' . $payloadBase;
        $count = 0;
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $stat = $zip->statIndex($i);
            $name = (string) ($stat['name'] ?? '');
            if ($name === '' || $name === 'backup-info.json' || !str_starts_with($name, $prefix)) {
                continue;
            }
            $sub = ltrim(substr($name, strlen($prefix)), '/');
            $dest = $target . ($sub !== '' ? '/' . $sub : '');
            if (str_ends_with($name, '/')) {
                $this->ensureDirectory($dest);
                continue;
            }
            $this->ensureDirectory(dirname($dest));
            $stream = $zip->getStream($name);
            if (!$stream) {
                continue;
            }
            file_put_contents($dest, stream_get_contents($stream));
            fclose($stream);
            $count++;
        }

        return ['message' => 'File backup restored.', 'restored_files' => $count, 'root' => $root, 'path' => $path];
    }

    private function restoreSiteBackup(ZipArchive $zip): array
    {
        $count = 0;
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $stat = $zip->statIndex($i);
            $name = (string) ($stat['name'] ?? '');
            if ($name === '' || $name === 'backup-info.json' || !str_starts_with($name, 'site/')) {
                continue;
            }
            $relative = substr($name, 5);
            if ($relative === '' || $this->isExcludedFromSiteBackup($relative)) {
                continue;
            }
            $dest = $this->root . '/' . $this->sanitizeRelative($relative);
            if (str_ends_with($name, '/')) {
                $this->ensureDirectory($dest);
                continue;
            }
            $this->ensureDirectory(dirname($dest));
            $stream = $zip->getStream($name);
            if (!$stream) {
                continue;
            }
            file_put_contents($dest, stream_get_contents($stream));
            fclose($stream);
            $count++;
        }
        return ['message' => 'Full-site backup restored.', 'restored_files' => $count];
    }

    private function assertArchiveAllowed(string $action): void
    {
        if (!($this->config['archive']['enabled'] ?? true)) {
            throw new ForbiddenException('Archive tools are disabled in plugin configuration.');
        }

        if ($action === 'create' && !($this->config['archive']['allow_create'] ?? true)) {
            throw new ForbiddenException('Creating ZIP archives is disabled in plugin configuration.');
        }

        if ($action === 'extract' && !($this->config['archive']['allow_extract'] ?? true)) {
            throw new ForbiddenException('Extracting ZIP archives is disabled in plugin configuration.');
        }

        if (!class_exists(ZipArchive::class)) {
            throw new ValidationException('PHP ZipArchive is required for archive tools.');
        }
    }

    private function isArchive(string $file): bool
    {
        return is_file($file) && strtolower(pathinfo($file, PATHINFO_EXTENSION)) === 'zip';
    }

    private function defaultArchiveName(string $base): string
    {
        $stem = preg_replace('/[^A-Za-z0-9._-]+/', '-', $base) ?: 'archive';
        $stem = trim($stem, '.-_') ?: 'archive';
        return $stem . '-' . date('Ymd-His') . '.zip';
    }

    private function safeArchiveEntryName(string $name): ?string
    {
        if (str_contains($name, "\0") || preg_match('#^(?:[/\\\\]|[A-Za-z]:)#', $name)) {
            throw new ForbiddenException('ZIP contains an absolute or invalid path.');
        }
        $name = str_replace('\\', '/', $name);
        $name = preg_replace('#/+#', '/', $name) ?? $name;
        $name = ltrim($name, '/');
        $name = preg_replace('#^\./+#', '', $name) ?? $name;
        $name = trim($name);

        if ($name === '' || $name === '.' || str_starts_with($name, '/')) {
            return null;
        }
        if (preg_match('/^[A-Za-z]:\//', $name)) {
            throw new ForbiddenException('ZIP archive contains an absolute Windows path.');
        }

        $parts = [];
        foreach (explode('/', $name) as $part) {
            if ($part === '' || $part === '.') {
                continue;
            }
            if ($part === '..') {
                throw new ForbiddenException('ZIP archive contains parent-directory traversal.');
            }
            $parts[] = $part;
        }

        if ($parts === []) {
            return null;
        }

        if ($this->config['archive']['skip_macos_junk'] ?? true) {
            if ($parts[0] === '__MACOSX') {
                return null;
            }
            $last = end($parts);
            if ($last === '.DS_Store' || str_starts_with((string) $last, '._')) {
                return null;
            }
        }

        return implode('/', $parts);
    }

    private function relativeToRootBase(string $root, string $absolute): string
    {
        $base = rtrim($this->rootBase($root), '/');
        $absolute = str_replace('\\', '/', $absolute);
        if ($absolute === $base) {
            return '';
        }
        if (str_starts_with($absolute, $base . '/')) {
            return ltrim(substr($absolute, strlen($base)), '/');
        }
        throw new ForbiddenException('Path is outside the configured root.');
    }

    private function configuredRoots(): array
    {
        $roots = $this->config['roots'] ?? [];
        return is_array($roots) ? $roots : [];
    }

    private function rootDefinition(string $root): array
    {
        $roots = $this->configuredRoots();
        if (!isset($roots[$root]) || !is_array($roots[$root])) {
            throw new NotFoundException('Unknown root.');
        }
        return $roots[$root];
    }

    private function rootBase(string $root): string
    {
        $def = $this->rootDefinition($root);
        $base = $this->absoluteConfiguredPath((string) ($def['path'] ?? ''));
        if (!is_dir($base)) {
            throw new NotFoundException('Configured root does not exist.');
        }
        return realpath($base) ?: $base;
    }

    private function absoluteConfiguredPath(string $path): string
    {
        $path = trim(str_replace('\\', '/', $path));
        if ($path === '') {
            return $this->root;
        }

        if (str_starts_with($path, '/') || preg_match('/^[A-Za-z]:\//', $path)) {
            return rtrim($this->normaliseFilesystemPath($path), '/');
        }

        return rtrim($this->normaliseFilesystemPath($this->root . '/' . trim($path, '/')), '/');
    }

    private function normaliseFilesystemPath(string $path): string
    {
        $path = str_replace('\\', '/', $path);
        $prefix = '';
        if (str_starts_with($path, '/')) {
            $prefix = '/';
            $path = ltrim($path, '/');
        }

        $parts = [];
        foreach (explode('/', $path) as $part) {
            if ($part === '' || $part === '.') {
                continue;
            }
            if ($part === '..') {
                if ($parts !== [] && end($parts) !== '..') {
                    array_pop($parts);
                } elseif ($prefix === '') {
                    $parts[] = '..';
                }
                continue;
            }
            $parts[] = $part;
        }

        return $prefix . implode('/', $parts);
    }

    private function resolve(string $root, string $path, bool $mustExist): string
    {
        $base = $this->rootBase($root);
        $relative = $this->sanitizeRelative($path);
        $target = $relative === '' ? $base : $base . '/' . $relative;
        $probe = $base;
        foreach (explode('/', $relative) as $component) {
            if ($component === '') continue;
            $probe .= '/' . $component;
            if (is_link($probe) || (file_exists($probe) && !is_file($probe) && !is_dir($probe))) {
                throw new ForbiddenException('Symlinks and special files are not supported.');
            }
        }

        if ($mustExist && !file_exists($target)) {
            throw new NotFoundException('Path not found.');
        }

        $this->assertInsideBase($base, $target, $mustExist || $relative === '');
        return realpath($target) ?: $target;
    }

    private function assertInsideRoot(string $root, string $target): void
    {
        $this->assertInsideBase($this->rootBase($root), $target, false);
    }

    private function assertInsideBase(string $base, string $target, bool $mustExist): void
    {
        $baseReal = realpath($base) ?: $base;
        $probe = $target;
        while ($probe !== $base && $probe !== dirname($probe)) {
            if (is_link($probe)) throw new ForbiddenException('Symlink paths are not supported.');
            $probe = dirname($probe);
        }
        $check = $mustExist ? (realpath($target) ?: '') : (realpath(dirname($target)) ?: dirname($target));
        if ($check === '' || ($check !== $baseReal && !str_starts_with($check, $baseReal . '/'))) {
            throw new ForbiddenException('Resolved path escapes the configured root.');
        }
    }

    private function sanitizeRelative(string $path): string
    {
        $path = str_replace("\0", '', str_replace('\\', '/', $path));
        $path = trim($path, '/');
        if ($path === '') {
            return '';
        }
        $parts = [];
        foreach (explode('/', $path) as $part) {
            if ($part === '' || $part === '.') {
                continue;
            }
            if ($part === '..') {
                throw new ForbiddenException('Parent-directory traversal is not allowed.');
            }
            $parts[] = $part;
        }
        return implode('/', $parts);
    }

    private function sanitizeName(string $name): string
    {
        $name = trim(str_replace(["\0", '/', '\\'], '', $name));
        if ($name === '' || $name === '.' || $name === '..') {
            throw new ValidationException('Invalid name.');
        }
        return $name;
    }

    private function sanitizeBackupName(string $name): string
    {
        $name = basename(str_replace(["\0", '/', '\\'], '', $name));
        if (!preg_match('/^[A-Za-z0-9._-]+\.zip$/', $name)) {
            throw new ValidationException('Invalid backup name.');
        }
        return $name;
    }

    private function joinRelative(string $base, string $name): string
    {
        $base = $this->sanitizeRelative($base);
        $name = $this->sanitizeRelative($name);
        return $base === '' ? $name : $base . '/' . $name;
    }

    private function parentRelative(string $path): string
    {
        $path = $this->sanitizeRelative($path);
        if ($path === '' || !str_contains($path, '/')) {
            return '';
        }
        return dirname($path);
    }

    private function isRootWritable(string $root): bool
    {
        $def = $this->rootDefinition($root);
        return (bool) ($def['writable'] ?? false);
    }

    private function assertRootWritable(string $root): void
    {
        if (!$this->isRootWritable($root)) {
            throw new ForbiddenException('This root is read-only.');
        }
    }

    private function isEditable(string $abs): bool
    {
        if (!is_file($abs) || !is_readable($abs)) {
            return false;
        }
        $ext = strtolower(pathinfo($abs, PATHINFO_EXTENSION));
        if ($ext === 'php' && !($this->config['allow_php_editing'] ?? false)) {
            return false;
        }
        if ($this->isBlockedExtension($abs)) {
            return false;
        }
        $editable = $this->normaliseExtensionList((array) ($this->config['editable_extensions'] ?? []));
        return in_array($ext, $editable, true) || in_array(strtolower(basename($abs)), $editable, true);
    }

    private function isViewable(string $abs): bool
    {
        if (!is_file($abs) || !is_readable($abs)) {
            return false;
        }
        if ($this->isBlockedExtension($abs)) {
            return false;
        }

        $ext = strtolower(pathinfo($abs, PATHINFO_EXTENSION));
        $base = strtolower(basename($abs));
        $viewable = $this->normaliseExtensionList((array) ($this->config['viewable_extensions'] ?? []));
        if (in_array($ext, $viewable, true) || in_array($base, $viewable, true) || $this->isEditable($abs)) {
            return $this->looksTextual($abs);
        }

        return false;
    }

    private function looksTextual(string $abs): bool
    {
        $sample = @file_get_contents($abs, false, null, 0, 4096);
        if ($sample === false) {
            return false;
        }
        return !str_contains($sample, "\0");
    }

    private function normaliseExtensionList(array $items): array
    {
        $out = [];
        foreach ($items as $item) {
            $item = strtolower(trim((string) $item));
            $item = ltrim($item, '.');
            if ($item !== '') {
                $out[] = $item;
            }
        }
        return array_values(array_unique($out));
    }

    private function assertEditablePath(string $abs): void
    {
        $ext = strtolower(pathinfo($abs, PATHINFO_EXTENSION));
        if ($ext === 'php' && !($this->config['allow_php_editing'] ?? false)) {
            throw new ForbiddenException('PHP editing is disabled.');
        }
        if ($this->isBlockedExtension($abs)) {
            throw new ForbiddenException('This file extension is blocked.');
        }
        $editable = $this->normaliseExtensionList((array) ($this->config['editable_extensions'] ?? []));
        if (!in_array($ext, $editable, true) && !in_array(strtolower(basename($abs)), $editable, true)) {
            throw new ValidationException('This file extension is not in editable_extensions.');
        }
    }

    private function assertAllowedUpload(string $abs): void
    {
        if ($this->isBlockedExtension($abs)) {
            throw new ForbiddenException('This file extension is blocked for upload.');
        }
    }

    private function isBlockedExtension(string $abs): bool
    {
        $ext = strtolower(pathinfo($abs, PATHINFO_EXTENSION));
        $blocked = $this->normaliseExtensionList((array) ($this->config['blocked_extensions'] ?? []));
        return $ext !== '' && in_array($ext, $blocked, true);
    }

    private function autoBackup(): bool
    {
        return (bool) ($this->config['auto_backup_on_write'] ?? true) && (bool) ($this->config['backup']['enabled'] ?? true);
    }

    private function assertBackupEnabled(): void
    {
        if (!($this->config['backup']['enabled'] ?? true)) {
            throw new ForbiddenException('Backup tools are disabled.');
        }
        if (!class_exists(ZipArchive::class)) {
            throw new ValidationException('PHP ZipArchive is required for backup tools.');
        }
    }

    private function backupDir(): string
    {
        $path = (string) ($this->config['backup']['path'] ?? '../gcmdr_backups');
        $dir = $this->absoluteConfiguredPath($path);
        $this->ensureDirectory($dir);

        $htaccess = $dir . '/.htaccess';
        if (!file_exists($htaccess)) {
            @file_put_contents($htaccess, "Deny from all\n");
        }
        $index = $dir . '/index.html';
        if (!file_exists($index)) {
            @file_put_contents($index, '');
        }
        return realpath($dir) ?: $dir;
    }

    private function backupFilename(string $scope, string $reason, string $root, string $path, string $profileKey = ''): string
    {
        $template = (string) ($this->config['backup']['archive_name_template'] ?? 'gcmdr-[HOST]-[PROFILE]-[DATE]-[TIME_TZ]');
        $template = trim($template) !== '' ? trim($template) : 'gcmdr-[HOST]-[PROFILE]-[DATE]-[TIME_TZ]';
        $template = preg_replace('/\.zip$/i', '', $template) ?? $template;

        $host = $this->hostNameSlug();
        $siteName = $this->siteNameSlug();
        $profile = $profileKey !== '' ? $profileKey : $scope;
        if ($profileKey !== '') {
            $profileData = $this->backupProfile($profileKey);
            $profileLabel = (string) ($profileData['label'] ?? $profileKey);
        } else {
            $profileLabel = $scope;
        }

        $reasonSlug = $this->safeFilenamePart($reason, 'manual');
        $rootSlug = $this->safeFilenamePart($root, 'root');
        $pathSlug = $this->safeFilenamePart($path !== '' ? $path : $root, 'root');
        $tz = date_default_timezone_get() ?: 'UTC';
        $gmtOffset = date('O');
        $timeTz = date('His') . 'GMT' . $gmtOffset;

        $tokens = [
            '[PREFIX]' => 'gcmdr',
            '[HOST]' => $host,
            '[SITE]' => $siteName,
            '[SITENAME]' => $siteName,
            '[DATE]' => date('Ymd'),
            '[YEAR]' => date('Y'),
            '[MONTH]' => date('m'),
            '[DAY]' => date('d'),
            '[WEEK]' => date('W'),
            '[WEEKDAY]' => strtolower(date('l')),
            '[TIME]' => date('His'),
            '[TIME_TZ]' => $timeTz,
            '[TZ]' => $this->safeFilenamePart(str_replace('/', '_', strtolower($tz)), 'utc'),
            '[GMT_OFFSET]' => str_replace('+', 'plus', str_replace('-', 'minus', $gmtOffset)),
            '[PROFILE]' => $this->safeFilenamePart($profile, $scope),
            '[PROFILE_LABEL]' => $this->safeFilenamePart($profileLabel, $profile),
            '[SCOPE]' => $this->safeFilenamePart($scope, 'backup'),
            '[TYPE]' => $this->safeFilenamePart($scope, 'backup'),
            '[REASON]' => $reasonSlug,
            '[ROOT]' => $rootSlug,
            '[PATH]' => $pathSlug,
            '[VERSION]' => $this->safeFilenamePart('0.4.0', 'version'),
            '[RANDOM]' => bin2hex(random_bytes(8)),
        ];

        $name = strtr($template, $tokens);
        if (($this->config['backup']['add_random_if_inside_site_root'] ?? true)
            && !str_contains($template, '[RANDOM]')
            && $this->backupPathIsInsideRoot()) {
            $name .= '-' . $tokens['[RANDOM]'];
        }

        $name = $this->safeFilenamePart($name, 'gcmdr-backup');
        $name = trim(substr($name, 0, 180), '.-_');
        if ($name === '') {
            $name = 'gcmdr-backup-' . date('Ymd-His');
        }

        return $name . '.zip';
    }

    private function hostNameSlug(): string
    {
        try {
            $uri = $this->grav['uri'] ?? null;
            if ($uri && method_exists($uri, 'host')) {
                $host = (string) $uri->host();
                if ($host !== '') {
                    return $this->safeFilenamePart($host, 'site');
                }
            }
        } catch (\Throwable $e) {
        }

        $home = (string) ($this->grav['config']->get('system.absolute_urls') ? $this->grav['config']->get('system.custom_base_url') : '');
        $parsed = $home !== '' ? parse_url($home, PHP_URL_HOST) : '';
        return $this->safeFilenamePart((string) ($parsed ?: ($_SERVER['HTTP_HOST'] ?? 'site')), 'site');
    }

    private function siteNameSlug(): string
    {
        $title = (string) ($this->grav['config']->get('site.title') ?? 'site');
        return $this->safeFilenamePart($title, 'site');
    }

    private function safeFilenamePart(string $value, string $fallback = 'item'): string
    {
        $value = trim(str_replace('\0', '', $value));
        $value = str_replace(['/', '\\'], '-', $value);
        $value = preg_replace('/[^A-Za-z0-9._-]+/', '-', $value) ?? '';
        $value = preg_replace('/-+/', '-', $value) ?? '';
        $value = trim($value, '.-_');
        return $value !== '' ? strtolower($value) : strtolower($fallback);
    }

    private function backupPathIsInsideRoot(): bool
    {
        $path = (string) ($this->config['backup']['path'] ?? '../gcmdr_backups');
        $dir = $this->absoluteConfiguredPath($path);
        $realDir = realpath($dir) ?: $dir;
        $realRoot = realpath($this->root) ?: $this->root;
        return str_starts_with(rtrim($realDir, '/') . '/', rtrim($realRoot, '/') . '/');
    }

    private function openZip(string $zipPath): ZipArchive
    {
        $this->assertBackupEnabled();
        $zip = new ZipArchive();
        if ($zip->open($zipPath, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
            throw new ValidationException('Unable to create backup zip.');
        }
        return $zip;
    }

    private function addPathToZip(ZipArchive $zip, string $abs, string $zipPath, bool $siteMode = false, ?array &$stats = null, ?string $profileKey = null): void
    {
        if (is_link($abs) || (!is_dir($abs) && !is_file($abs))) {
            throw new ForbiddenException('Symlinks and special files are not supported.');
        }
        if ($siteMode) {
            $relative = preg_replace('#^site/?#', '', $zipPath) ?? '';
            if ($this->isExcludedFromSiteBackup($relative, $profileKey)) {
                if (is_array($stats)) {
                    $stats['skipped'] = (int) ($stats['skipped'] ?? 0) + 1;
                }
                return;
            }
        }

        if (is_dir($abs)) {
            $zipName = rtrim($zipPath, '/') . '/';
            if ($zipName !== 'site/') {
                $zip->addEmptyDir($zipName);
                if (is_array($stats)) {
                    $stats['dirs'] = (int) ($stats['dirs'] ?? 0) + 1;
                }
            }
            $entries = scandir($abs) ?: [];
            foreach ($entries as $entry) {
                if ($entry === '.' || $entry === '..') {
                    continue;
                }
                $this->addPathToZip($zip, $abs . '/' . $entry, rtrim($zipPath, '/') . '/' . $entry, $siteMode, $stats, $profileKey);
            }
            return;
        }

        if (is_file($abs) && is_readable($abs)) {
            $zip->addFile($abs, $zipPath);
            if (is_array($stats)) {
                $stats['files'] = (int) ($stats['files'] ?? 0) + 1;
                $stats['bytes'] = (int) ($stats['bytes'] ?? 0) + (int) @filesize($abs);
            }
        }
    }

    private function backupInfo(string $file): array
    {
        $meta = [];
        $zip = new ZipArchive();
        if ($zip->open($file) === true) {
            $raw = $zip->getFromName('backup-info.json');
            $decoded = $raw ? json_decode($raw, true) : null;
            if (is_array($decoded)) {
                $meta = $decoded;
            }
            $zip->close();
        }

        return [
            'name' => basename($file),
            'size' => (int) @filesize($file),
            'modified' => (int) @filemtime($file),
            'meta' => $meta,
        ];
    }

    private function pruneBackups(): void
    {
        $max = (int) ($this->config['backup']['max_backups'] ?? 25);
        $files = glob($this->backupDir() . '/*.zip') ?: [];
        usort($files, static fn (string $a, string $b): int => ((int) filemtime($b)) <=> ((int) filemtime($a)));
        foreach (array_slice($files, $max) as $old) {
            @unlink($old);
        }
    }

    private function backupProfiles(): array
    {
        $profiles = $this->config['backup']['profiles'] ?? [];
        if (!is_array($profiles) || $profiles === []) {
            $profiles = [
                'full_site' => [
                    'label' => 'Full site',
                    'description' => 'Everything under the Grav root, minus cache/log/temp/backup folders.',
                    'include_paths' => ['.'],
                    'exclude_prefixes' => [],
                ],
                'user_folder' => [
                    'label' => 'User folder',
                    'description' => 'Content, accounts, config, themes, plugins, and data under user/.',
                    'include_paths' => ['user'],
                    'exclude_prefixes' => [],
                ],
                'pages_media' => [
                    'label' => 'Pages & media',
                    'description' => 'The user/pages tree only.',
                    'include_paths' => ['user/pages'],
                    'exclude_prefixes' => [],
                ],
                'config_data' => [
                    'label' => 'Config & data',
                    'description' => 'Configuration, accounts, and data without page content.',
                    'include_paths' => ['user/config', 'user/accounts', 'user/data'],
                    'exclude_prefixes' => [],
                ],
            ];
        }

        return $this->normaliseProfiles($profiles, false);
    }

    private function backupSchedules(): array
    {
        $schedules = $this->config['backup']['schedules'] ?? [];
        if (!is_array($schedules)) {
            return [];
        }
        return $this->normaliseSchedules($schedules, false);
    }

    private function normaliseSchedules(array $schedules, bool $strict = true): array
    {
        if (count($schedules) > 30) {
            throw new ValidationException('A maximum of 30 backup schedules is allowed.');
        }

        $profiles = $this->backupProfiles();
        $normalised = [];
        foreach ($schedules as $key => $schedule) {
            try {
                $key = $this->normaliseScheduleKey((string) $key);
            } catch (\Throwable $e) {
                if ($strict) {
                    throw $e;
                }
                continue;
            }

            if (!is_array($schedule)) {
                if ($strict) {
                    throw new ValidationException('Backup schedule must be an object/map: ' . $key);
                }
                continue;
            }

            $profile = trim((string) ($schedule['profile'] ?? ''));
            if ($profile === '' || !isset($profiles[$profile])) {
                if ($strict) {
                    throw new ValidationException('Backup schedule uses an unknown profile: ' . $key);
                }
                $profile = isset($profiles['full_site']) ? 'full_site' : (array_key_first($profiles) ?: 'full_site');
            }

            $at = trim((string) ($schedule['at'] ?? ''));
            if (!$this->isValidCronExpression($at)) {
                if ($strict) {
                    throw new ValidationException('Backup schedule has an invalid cron expression: ' . $key);
                }
                $at = '0 3 * * *';
            }

            $output = trim((string) ($schedule['output'] ?? ''));
            if ($output === '' || preg_match('/^logs\/grav-commander-backup-[A-Za-z0-9_-]+\.out$/', $output)) {
                $output = 'logs/grav-commander-backup-' . $key . '.out';
            }
            $output = $this->normaliseSchedulerOutputPath($output);

            $normalised[$key] = [
                'label' => trim((string) ($schedule['label'] ?? ucfirst(str_replace(['_', '-'], ' ', $key)))) ?: ucfirst($key),
                'profile' => $profile,
                'enabled' => filter_var($schedule['enabled'] ?? true, FILTER_VALIDATE_BOOLEAN),
                'at' => $at,
                'note' => trim((string) ($schedule['note'] ?? '')),
                'output' => $output,
            ];
        }

        return $normalised;
    }

    private function normaliseScheduleKey(string $key): string
    {
        $key = trim($key);
        if ($key === '') {
            throw new ValidationException('Backup schedule keys cannot be blank.');
        }
        if (!preg_match('/^[A-Za-z0-9_-]+$/', $key)) {
            throw new ValidationException('Backup schedule keys may only contain letters, numbers, underscores, and hyphens: ' . $key);
        }
        return $key;
    }

    private function isValidCronExpression(string $cron): bool
    {
        $cron = trim($cron);
        if ($cron === '') {
            return false;
        }
        $parts = preg_split('/\s+/', $cron) ?: [];
        if (count($parts) !== 5 && count($parts) !== 6) {
            return false;
        }
        foreach ($parts as $part) {
            if (!preg_match('/^[A-Za-z0-9*,\/?#LW\-]+$/', $part)) {
                return false;
            }
        }
        return true;
    }

    private function normaliseSchedulerOutputPath(string $path): string
    {
        $path = trim(str_replace("\0", '', str_replace('\\', '/', $path)));
        $path = trim($path, '/');
        if ($path === '') {
            throw new ValidationException('Scheduler output path cannot be blank.');
        }
        if (str_starts_with($path, '/') || preg_match('/^[A-Za-z]:\\\\|^[A-Za-z]:\//', $path)) {
            throw new ValidationException('Scheduler output path must be relative to the Grav root.');
        }
        foreach (explode('/', $path) as $part) {
            if ($part === '..') {
                throw new ValidationException('Parent-directory traversal is not allowed in scheduler output paths.');
            }
        }
        return $path;
    }

    private function schedulerJobPrefix(): string
    {
        return 'grav-commander-backup-';
    }

    private function schedulerStatus(): array
    {
        $file = $this->schedulerConfigFile();
        $config = $this->readSchedulerConfig($file);
        $jobs = (array) ($config['custom_jobs'] ?? []);
        $status = (array) ($config['status'] ?? []);
        $prefix = $this->schedulerJobPrefix();
        $managed = [];
        foreach ($jobs as $jobId => $job) {
            if (!str_starts_with((string) $jobId, $prefix)) {
                continue;
            }
            $key = substr((string) $jobId, strlen($prefix));
            $managed[$key] = [
                'job_id' => (string) $jobId,
                'at' => $job['at'] ?? '',
                'status' => $status[$jobId] ?? 'enabled',
                'output' => $job['output'] ?? '',
            ];
        }
        return [
            'file' => 'user/config/scheduler.yaml',
            'exists' => is_file($file),
            'managed_jobs' => $managed,
            'cron_hint' => 'The server must run bin/grav scheduler from system cron for scheduled backups to fire.',
        ];
    }

    private function schedulerConfigFile(): string
    {
        return $this->root . '/user/config/scheduler.yaml';
    }

    private function readSchedulerConfig(string $file): array
    {
        if (!is_file($file)) {
            return [];
        }
        return $this->readUserPluginConfig($file);
    }

    private function writeSchedulerJobs(array $schedules): void
    {
        $file = $this->schedulerConfigFile();
        $scheduler = $this->readSchedulerConfig($file);
        if (!is_array($scheduler)) {
            $scheduler = [];
        }

        if (!isset($scheduler['status']) || !is_array($scheduler['status'])) {
            $scheduler['status'] = [];
        }
        if (!isset($scheduler['custom_jobs']) || !is_array($scheduler['custom_jobs'])) {
            $scheduler['custom_jobs'] = [];
        }

        $prefix = $this->schedulerJobPrefix();
        foreach (array_keys($scheduler['custom_jobs']) as $jobId) {
            if (str_starts_with((string) $jobId, $prefix)) {
                unset($scheduler['custom_jobs'][$jobId]);
            }
        }
        foreach (array_keys($scheduler['status']) as $jobId) {
            if (str_starts_with((string) $jobId, $prefix)) {
                unset($scheduler['status'][$jobId]);
            }
        }

        foreach ($schedules as $key => $schedule) {
            $jobId = $prefix . $key;
            $note = trim((string) ($schedule['note'] ?? ''));
            $profile = (string) ($schedule['profile'] ?? 'full_site');
            $args = 'grav-commander backup --profile=' . escapeshellarg($profile) . ' --reason=' . escapeshellarg('scheduled-' . $key);
            if ($note !== '') {
                $args .= ' --note=' . escapeshellarg($note);
            }

            $scheduler['custom_jobs'][$jobId] = [
                'command' => 'bin/plugin',
                'args' => $args,
                'at' => (string) $schedule['at'],
                'output' => (string) $schedule['output'],
                'output_mode' => 'append',
            ];
            $scheduler['status'][$jobId] = !empty($schedule['enabled']) ? 'enabled' : 'disabled';
        }

        $this->ensureDirectory(dirname($file));
        $written = file_put_contents($file, $this->dumpYaml($scheduler));
        if ($written === false) {
            throw new ValidationException('Unable to write user/config/scheduler.yaml.');
        }
    }

    private function normaliseProfiles(array $profiles, bool $strict = true): array
    {
        if (count($profiles) > 25) {
            throw new ValidationException('A maximum of 25 backup profiles is allowed.');
        }

        $normalised = [];
        foreach ($profiles as $key => $profile) {
            $key = trim((string) $key);
            if ($key === '') {
                if ($strict) {
                    throw new ValidationException('Backup profile keys cannot be blank.');
                }
                continue;
            }
            if (!preg_match('/^[A-Za-z0-9_-]+$/', $key)) {
                throw new ValidationException('Backup profile keys may only contain letters, numbers, underscores, and hyphens: ' . $key);
            }
            if (!is_array($profile)) {
                if ($strict) {
                    throw new ValidationException('Backup profile must be an object/map: ' . $key);
                }
                continue;
            }

            $includePaths = $this->normaliseBackupPathList((array) ($profile['include_paths'] ?? []), true);
            if ($includePaths === []) {
                if ($strict) {
                    throw new ValidationException('Backup profile needs at least one include path: ' . $key);
                }
                $includePaths = ['user'];
            }

            $normalised[$key] = [
                'label' => trim((string) ($profile['label'] ?? ucfirst($key))) ?: ucfirst($key),
                'description' => trim((string) ($profile['description'] ?? '')),
                'include_paths' => $includePaths,
                'exclude_prefixes' => $this->normaliseBackupPathList((array) ($profile['exclude_prefixes'] ?? []), false),
            ];
        }

        return $normalised;
    }

    private function normaliseBackupPathList(array $paths, bool $allowDot): array
    {
        $normalised = [];
        foreach ($paths as $path) {
            $path = trim(str_replace('\\', '/', (string) $path));
            $path = trim($path, '/');
            if ($path === '') {
                continue;
            }
            if ($path === '.' && $allowDot) {
                $normalised[] = '.';
                continue;
            }
            if ($path === '.' && !$allowDot) {
                throw new ValidationException('A dot path is not valid in exclude_prefixes.');
            }
            if (str_starts_with($path, '/') || preg_match('/^[A-Za-z]:\\\\|^[A-Za-z]:\//', $path)) {
                throw new ValidationException('Absolute paths are not allowed in backup profiles: ' . $path);
            }
            foreach (explode('/', $path) as $part) {
                if ($part === '..') {
                    throw new ValidationException('Parent-directory traversal is not allowed in backup profiles: ' . $path);
                }
            }
            $normalised[] = $path;
        }

        return array_values(array_unique($normalised));
    }



    private function tokenStoreFile(): string
    {
        $dir = $this->root . '/user/data/grav-commander';
        $this->ensureDirectory($dir);
        $htaccess = $dir . '/.htaccess';
        if (!file_exists($htaccess)) {
            @file_put_contents($htaccess, "Deny from all\n");
        }
        $index = $dir . '/index.html';
        if (!file_exists($index)) {
            @file_put_contents($index, '');
        }
        return $dir . '/download-tokens.json';
    }

    private function readDownloadTokens(): array
    {
        $file = $this->tokenStoreFile();
        if (!is_file($file)) {
            return [];
        }
        $raw = @file_get_contents($file);
        $decoded = $raw ? json_decode($raw, true) : [];
        return is_array($decoded) ? $decoded : [];
    }

    private function writeDownloadTokens(array $tokens): void
    {
        $file = $this->tokenStoreFile();
        $json = json_encode($tokens, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
        if ($json === false || file_put_contents($file, $json, LOCK_EX) === false) {
            throw new ValidationException('Unable to write temporary download token store.');
        }
    }

    private function userPluginConfigFile(): string
    {
        return $this->root . '/user/config/plugins/grav-commander.yaml';
    }

    private function readUserPluginConfig(string $file): array
    {
        if (!is_file($file)) {
            return [];
        }

        $raw = file_get_contents($file);
        if ($raw === false || trim($raw) === '') {
            return [];
        }

        if (class_exists('Grav\\Common\\Yaml')) {
            $parsed = \Grav\Common\Yaml::parse($raw);
            return is_array($parsed) ? $parsed : [];
        }

        if (class_exists('Symfony\\Component\\Yaml\\Yaml')) {
            $parsed = \Symfony\Component\Yaml\Yaml::parse($raw);
            return is_array($parsed) ? $parsed : [];
        }

        throw new ValidationException('No YAML parser is available to read the plugin configuration.');
    }

    private function dumpYaml(array $data): string
    {
        if (class_exists('Grav\\Common\\Yaml')) {
            return (string) \Grav\Common\Yaml::dump($data, 20, 2);
        }

        if (class_exists('Symfony\\Component\\Yaml\\Yaml')) {
            return (string) \Symfony\Component\Yaml\Yaml::dump($data, 20, 2);
        }

        return $this->simpleYamlDump($data);
    }

    private function simpleYamlDump(array $data, int $level = 0): string
    {
        $out = '';
        $indent = str_repeat('  ', $level);
        foreach ($data as $key => $value) {
            $safeKey = (string) $key;
            if (is_array($value)) {
                if ($value === []) {
                    $out .= $indent . $safeKey . ": []\n";
                    continue;
                }
                $isList = array_keys($value) === range(0, count($value) - 1);
                $out .= $indent . $safeKey . ":\n";
                if ($isList) {
                    foreach ($value as $item) {
                        if (is_array($item)) {
                            $out .= $indent . "  -\n" . $this->simpleYamlDump($item, $level + 2);
                        } else {
                            $out .= $indent . '  - ' . $this->yamlScalar($item) . "\n";
                        }
                    }
                } else {
                    $out .= $this->simpleYamlDump($value, $level + 1);
                }
                continue;
            }
            $out .= $indent . $safeKey . ': ' . $this->yamlScalar($value) . "\n";
        }
        return $out;
    }

    private function yamlScalar(mixed $value): string
    {
        if (is_bool($value)) {
            return $value ? 'true' : 'false';
        }
        if ($value === null) {
            return 'null';
        }
        if (is_int($value) || is_float($value)) {
            return (string) $value;
        }
        $value = (string) $value;
        if ($value === '') {
            return "''";
        }
        return preg_match('/^[A-Za-z0-9_.\/-]+$/', $value) ? $value : "'" . str_replace("'", "''", $value) . "'";
    }

    private function backupProfile(string $profileKey): array
    {
        $profiles = $this->backupProfiles();
        if (isset($profiles[$profileKey])) {
            return $profiles[$profileKey];
        }
        if (isset($profiles['full_site'])) {
            return $profiles['full_site'];
        }
        return reset($profiles) ?: ['key' => 'default', 'label' => 'Default', 'include_paths' => ['user'], 'exclude_prefixes' => []];
    }

    private function siteIncludePaths(?string $profileKey = null): array
    {
        if ($profileKey !== null) {
            $profile = $this->backupProfile($profileKey);
            $paths = $profile['include_paths'] ?? ['user'];
        } else {
            $paths = $this->config['backup']['site_include_paths'] ?? ['user'];
        }

        $paths = array_values(array_filter(array_map(static fn ($p): string => trim((string) $p, '/'), (array) $paths), static fn ($p): bool => $p !== ''));
        return $paths !== [] ? $paths : ['user'];
    }

    private function siteExcludePrefixes(?string $profileKey = null): array
    {
        $prefixes = $this->config['backup']['site_exclude_prefixes'] ?? [];
        if ($profileKey !== null) {
            $profile = $this->backupProfile($profileKey);
            $prefixes = array_merge((array) $prefixes, (array) ($profile['exclude_prefixes'] ?? []));
        }

        $backupPath = trim(str_replace('\\', '/', (string) ($this->config['backup']['path'] ?? '../gcmdr_backups')));
        $prefixes[] = $backupPath;
        $prefixes[] = 'cache';
        $prefixes[] = 'logs';
        $prefixes[] = 'tmp';
        $prefixes[] = 'backup';
        return array_values(array_unique(array_filter(array_map(static fn ($p): string => trim((string) $p, '/'), (array) $prefixes))));
    }

    private function isExcludedFromSiteBackup(string $relative, ?string $profileKey = null): bool
    {
        $relative = trim(str_replace('\\', '/', $relative), '/');
        if ($relative === '' || $relative === '.') {
            return false;
        }
        foreach ($this->siteExcludePrefixes($profileKey) as $prefix) {
            if ($prefix === '' || $prefix === '.') {
                continue;
            }
            if ($relative === $prefix || str_starts_with($relative, $prefix . '/')) {
                return true;
            }
        }
        return false;
    }

    private function ensureDirectory(string $dir): void
    {
        if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
            throw new ValidationException('Unable to create directory: ' . $dir);
        }
    }

    private function copyRecursive(string $src, string $dst): void
    {
        if (is_link($src) || (!is_dir($src) && !is_file($src))) {
            throw new ForbiddenException('Symlinks and special files are not supported.');
        }
        if (is_dir($src)) {
            $this->ensureDirectory($dst);
            $entries = scandir($src) ?: [];
            foreach ($entries as $entry) {
                if ($entry === '.' || $entry === '..') {
                    continue;
                }
                $this->copyRecursive($src . '/' . $entry, $dst . '/' . $entry);
            }
            return;
        }
        $this->ensureDirectory(dirname($dst));
        if (!copy($src, $dst)) {
            throw new ValidationException('Unable to copy item.');
        }
    }

    private function deletePath(string $abs): void
    {
        if (is_link($abs) || (!is_dir($abs) && !is_file($abs))) {
            throw new ForbiddenException('Symlinks and special files are not supported.');
        }
        if (is_dir($abs)) {
            $entries = scandir($abs) ?: [];
            foreach ($entries as $entry) {
                if ($entry === '.' || $entry === '..') {
                    continue;
                }
                $this->deletePath($abs . '/' . $entry);
            }
            if (!rmdir($abs)) {
                throw new ValidationException('Unable to delete folder.');
            }
            return;
        }
        if (is_file($abs) && !unlink($abs)) {
            throw new ValidationException('Unable to delete file.');
        }
    }

    private function isDirectoryEmpty(string $dir): bool
    {
        $entries = scandir($dir);
        return $entries === false || count(array_diff($entries, ['.', '..'])) === 0;
    }
}
