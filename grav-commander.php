<?php

declare(strict_types=1);

namespace Grav\Plugin;

use Grav\Common\Plugin;
use RocketTheme\Toolbox\Event\Event;

/**
 * Grav Commander
 *
 * Admin2-first file manager and backup playground for Grav 2.
 */
class GravCommanderPlugin extends Plugin
{
    public const SLUG = 'grav-commander';

    public static function getSubscribedEvents(): array
    {
        return [
            'onPluginsInitialized' => ['onPluginsInitialized', 0],
            'onApiRegisterRoutes' => ['onApiRegisterRoutes', 0],
            'onApiSidebarItems' => ['onApiSidebarItems', 0],
            'onApiPluginPageInfo' => ['onApiPluginPageInfo', 0],
        ];
    }

    public function autoload()
    {
        spl_autoload_register(static function (string $class): void {
            $prefix = 'Grav\\Plugin\\GravCommander\\';
            if (!str_starts_with($class, $prefix)) {
                return;
            }

            $relative = substr($class, strlen($prefix));
            $file = __DIR__ . '/classes/' . str_replace('\\', '/', $relative) . '.php';
            if (is_file($file)) {
                require_once $file;
            }
        });
    }

    public function onPluginsInitialized(): void
    {
        $uri = $this->grav['uri'] ?? null;
        if (!$uri || !method_exists($uri, 'path')) {
            return;
        }

        $path = '/' . trim((string) $uri->path(), '/');
        if ($path !== '/grav-commander/download') {
            return;
        }

        $this->enable([
            'onPageInitialized' => ['onPageInitialized', 0],
        ]);
    }

    public function onPageInitialized(): void
    {
        require_once __DIR__ . '/classes/Service/FileService.php';

        $token = (string) ($_GET['token'] ?? '');
        try {
            $file = (new \Grav\Plugin\GravCommander\Service\FileService())->consumeBackupDownloadToken($token);
        } catch (\Throwable $e) {
            header('HTTP/1.1 403 Forbidden');
            header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
            header('Pragma: no-cache');
            header('X-Content-Type-Options: nosniff');
            header('Referrer-Policy: no-referrer');
            echo 'Invalid or expired download token.';
            exit;
        }

        $this->streamFileAndExit((string) $file['absolute'], (string) $file['name'], 'application/zip');
    }

    public function onApiRegisterRoutes(Event $event): void
    {
        require_once __DIR__ . '/classes/Service/FileService.php';
        require_once __DIR__ . '/classes/Jarvis/JarvisIntegrationException.php';
        require_once __DIR__ . '/classes/Jarvis/JarvisContextPolicy.php';
        require_once __DIR__ . '/classes/Jarvis/JarvisProposalStore.php';
        require_once __DIR__ . '/classes/Jarvis/JarvisIntegrationService.php';
        require_once __DIR__ . '/classes/Controller/ApiController.php';

        $routes = $event['routes'];
        $controller = \Grav\Plugin\GravCommander\Controller\ApiController::class;

        $routes->group('/grav-commander', static function ($group) use ($controller): void {
            $group->get('/status', [$controller, 'status']);
            $group->get('/roots', [$controller, 'roots']);
            $group->get('/list', [$controller, 'list']);
            $group->get('/read', [$controller, 'read']);
            $group->get('/download', [$controller, 'download']);

            $group->post('/operations', [$controller, 'operate']);
            $group->post('/create', [$controller, 'createFile']);
            $group->post('/validate', [$controller, 'validate']);
            $group->get('/archive/inspect', [$controller, 'inspectArchive']);
            $group->patch('/write', [$controller, 'write']);
            $group->post('/mkdir', [$controller, 'mkdir']);
            $group->post('/upload', [$controller, 'upload']);
            $group->post('/archive/zip', [$controller, 'archiveZip']);
            $group->post('/archive/extract', [$controller, 'extractArchive']);
            $group->post('/rename', [$controller, 'rename']);
            $group->post('/copy', [$controller, 'copy']);
            $group->post('/move', [$controller, 'move']);
            $group->delete('/delete', [$controller, 'delete']);

            $group->post('/backup/file', [$controller, 'backupFile']);
            $group->post('/backup/site', [$controller, 'backupSite']);
            $group->get('/backups', [$controller, 'backups']);
            $group->get('/backup/profiles', [$controller, 'profiles']);
            $group->post('/backup/profiles', [$controller, 'saveProfiles']);
            $group->post('/profiles/save', [$controller, 'saveProfiles']);
            $group->post('/config/profiles', [$controller, 'saveProfiles']);
            $group->get('/backup/schedules', [$controller, 'schedules']);
            $group->post('/backup/schedules', [$controller, 'saveSchedules']);
            $group->post('/schedules/save', [$controller, 'saveSchedules']);
            $group->post('/config/schedules', [$controller, 'saveSchedules']);
            $group->post('/backup/schedules/{key}/run', [$controller, 'runSchedule']);
            $group->delete('/backup/schedules/{key}', [$controller, 'deleteSchedule']);
            $group->post('/backup/download-token', [$controller, 'createBackupDownloadToken']);
            $group->get('/backup/direct-download', [$controller, 'directDownloadBackup']);
            $group->get('/backup/download', [$controller, 'downloadBackupQuery']);
            $group->get('/backups/{name}/download', [$controller, 'downloadBackup']);
            $group->post('/restore', [$controller, 'restore']);
            $group->delete('/backups/{name}', [$controller, 'deleteBackup']);

            $group->get('/jarvis/status', [$controller, 'jarvisStatus']);
            $group->get('/jarvis/providers/{id}/models', [$controller, 'jarvisModels']);
            $group->post('/jarvis/providers/{id}/validate', [$controller, 'jarvisValidate']);
            $group->post('/jarvis/proposals', [$controller, 'jarvisPropose']);
            $group->post('/jarvis/proposals/{id}/accept', [$controller, 'jarvisAccept']);
            $group->post('/jarvis/proposals/{id}/discard', [$controller, 'jarvisDiscard']);
        });
    }

    public function onApiSidebarItems(Event $event): void
    {
        $config = $this->grav['config'];
        if (!$config->get('plugins.grav-commander.admin.show_sidebar', true)) {
            return;
        }

        $user = $event['user'] ?? null;
        if ($user && !$this->userCanAccessCommander($user, 'grav-commander.browse')) {
            return;
        }

        $items = $event['items'] ?? [];
        $items[] = [
            'id' => self::SLUG,
            'plugin' => self::SLUG,
            'label' => 'Grav Commander',
            'icon' => 'fa-folder-tree',
            'route' => '/plugin/' . self::SLUG,
            'priority' => 8,
        ];
        $event['items'] = $items;
    }

    private function userCanAccessCommander(object $user, string $permission): bool
    {
        if (method_exists($user, 'get') && (bool) $user->get('access.api.super')) {
            return true;
        }

        if (method_exists($user, 'authorize')) {
            return (bool) ($user->authorize('api.super') || $user->authorize($permission));
        }

        return false;
    }

    private function streamFileAndExit(string $path, string $name, string $mime): void
    {
        if (!is_file($path) || !is_readable($path)) {
            header('HTTP/1.1 404 Not Found');
            echo 'Unable to open file for download.';
            exit;
        }

        if (function_exists('set_time_limit')) {
            @set_time_limit(0);
        }

        while (ob_get_level() > 0) {
            @ob_end_clean();
        }

        if (headers_sent()) {
            exit;
        }

        $asciiName = preg_replace('/[^A-Za-z0-9._-]+/', '_', $name) ?: 'download.zip';
        header('Content-Type: ' . $mime);
        header('Content-Length: ' . (string) filesize($path));
        header("Content-Disposition: attachment; filename=\"" . $asciiName . "\"; filename*=UTF-8''" . rawurlencode($name));
        header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
        header('Pragma: no-cache');
        header('X-Content-Type-Options: nosniff');
        header('Referrer-Policy: no-referrer');

        $handle = fopen($path, 'rb');
        if ($handle === false) {
            header('HTTP/1.1 500 Internal Server Error');
            echo 'Unable to open file for download.';
            exit;
        }

        while (!feof($handle)) {
            echo fread($handle, 1024 * 1024);
            flush();
        }
        fclose($handle);
        exit;
    }

    public function onApiPluginPageInfo(Event $event): void
    {
        if (($event['plugin'] ?? null) !== self::SLUG) {
            return;
        }

        $event['definition'] = [
            'id' => self::SLUG,
            'plugin' => self::SLUG,
            'title' => 'Grav Commander',
            'icon' => 'fa-folder-tree',
            'page_type' => 'component',
        ];
    }
}
